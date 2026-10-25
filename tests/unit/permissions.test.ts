import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PermissionManager,
  type GrantStorage,
  type PermissionRequest
} from '../../src/main/permissions/permissionManager';
import type { StoredGrant } from '../../src/shared/schemas/permissions';
import type { PermissionPrompt } from '../../src/shared/tools/types';

/** Concessões "sempre" num array, no lugar do settings.json. */
function memoryStorage(initial: StoredGrant[] = []): GrantStorage & { grants: StoredGrant[] } {
  const storage = {
    grants: [...initial],
    load: () => storage.grants,
    save: (grants: StoredGrant[]) => {
      storage.grants = grants;
    }
  };
  return storage;
}

let seq = 0;
function manager(storage = memoryStorage(), timeoutMs = 120_000) {
  const onChange = vi.fn();
  const permissions = new PermissionManager({
    storage,
    timeoutMs,
    now: () => new Date('2026-10-25T12:00:00Z'),
    newId: () => `id-${String((seq += 1))}`,
    onChange
  });
  return { permissions, storage, onChange };
}

const ACTION = { 'pt-BR': 'Ler a pasta “Fotos”.', en: 'Read the “Fotos” folder.' };

function ask(
  permissions: PermissionManager,
  overrides: Partial<PermissionRequest> = {}
): { result: Promise<string>; prompts: PermissionPrompt[]; controller: AbortController } {
  const prompts: PermissionPrompt[] = [];
  const controller = new AbortController();
  const result = permissions.request({
    tool: 'demoReadAction',
    permissions: ['filesystem.read'],
    risk: 'read',
    action: ACTION,
    signal: controller.signal,
    onPrompt: (prompt) => prompts.push(prompt),
    ...overrides
  });
  return { result, prompts, controller };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PermissionManager (SPEC §22.2)', () => {
  it('ferramenta sem permissões não pergunta nada', async () => {
    const { permissions } = manager();
    const { result, prompts } = ask(permissions, { permissions: [] });
    expect(await result).toBe('not_required');
    expect(prompts).toEqual([]);
  });

  it('escopos por risco: leitura tem três; escrita, dois; destrutiva, só "uma vez"', () => {
    const { permissions } = manager();
    const scopes = (risk: PermissionRequest['risk']) => {
      const { prompts } = ask(permissions, { risk });
      return prompts[0]?.scopes;
    };
    expect(scopes('read')).toEqual(['once', 'session', 'always']);
    expect(scopes('write')).toEqual(['once', 'session']);
    expect(scopes('destructive')).toEqual(['once']);
  });

  it('o pedido leva o texto da ferramenta e o prazo', () => {
    const { permissions } = manager();
    const { prompts } = ask(permissions);
    expect(prompts[0]).toMatchObject({
      action: ACTION,
      risk: 'read',
      permissions: ['filesystem.read'],
      expiresAt: '2026-10-25T12:02:00.000Z'
    });
  });

  it('"uma vez" não fica guardado; a próxima chamada pergunta de novo', async () => {
    const { permissions, storage } = manager();
    const first = ask(permissions);
    expect(permissions.respond(first.prompts[0]?.id ?? '', 'once')).toBe(true);
    expect(await first.result).toBe('granted_once');
    expect(storage.grants).toEqual([]);
    expect(ask(permissions).prompts).toHaveLength(1);
  });

  it('"nesta sessão" vale na memória e some ao recriar (reabrir o app)', async () => {
    const storage = memoryStorage();
    const { permissions } = manager(storage);
    const first = ask(permissions);
    permissions.respond(first.prompts[0]?.id ?? '', 'session');
    expect(await first.result).toBe('granted_session');
    expect(await ask(permissions).result).toBe('already_granted');
    expect(storage.grants).toEqual([]);
    expect(
      manager(storage).permissions.existingGrant('demoReadAction', ['filesystem.read'], 'read')
    ).toBeNull();
  });

  it('"sempre" vai para o armazenamento, aparece na lista e pode ser revogado', async () => {
    const { permissions, storage, onChange } = manager();
    const first = ask(permissions);
    permissions.respond(first.prompts[0]?.id ?? '', 'always');
    expect(await first.result).toBe('granted_always');
    expect(storage.grants).toEqual([
      {
        id: expect.any(String) as string,
        tool: 'demoReadAction',
        permissions: ['filesystem.read'],
        grantedAt: '2026-10-25T12:00:00.000Z'
      }
    ]);
    expect(onChange).toHaveBeenCalled();
    const [grant] = permissions.list();
    expect(grant).toMatchObject({ tool: 'demoReadAction', scope: 'always' });
    expect(await ask(permissions).result).toBe('already_granted');

    expect(permissions.revoke(grant?.id ?? '')).toBe(true);
    expect(storage.grants).toEqual([]);
    expect(ask(permissions).prompts).toHaveLength(1);
    expect(permissions.revoke('nao-existe')).toBe(false);
  });

  it('destrutiva nunca aceita "nesta sessão" nem "sempre"', async () => {
    const { permissions, storage } = manager();
    const { result, prompts } = ask(permissions, {
      tool: 'demoDestructiveAction',
      permissions: ['filesystem.write'],
      risk: 'destructive'
    });
    const id = prompts[0]?.id ?? '';
    expect(permissions.respond(id, 'always')).toBe(false);
    expect(permissions.respond(id, 'session')).toBe(false);
    expect(permissions.isPending(id)).toBe(true);
    expect(permissions.respond(id, 'once')).toBe(true);
    expect(await result).toBe('granted_once');
    expect(storage.grants).toEqual([]);
  });

  it('concessão "sempre" editada à mão no arquivo não libera ação destrutiva nem escrita', () => {
    const forged: StoredGrant = {
      id: 'forjada',
      tool: 'demoDestructiveAction',
      permissions: ['filesystem.write'],
      grantedAt: '2026-10-25T12:00:00.000Z'
    };
    const { permissions } = manager(memoryStorage([forged]));
    expect(
      permissions.existingGrant('demoDestructiveAction', ['filesystem.write'], 'destructive')
    ).toBeNull();
    expect(
      permissions.existingGrant('demoDestructiveAction', ['filesystem.write'], 'write')
    ).toBeNull();
    expect(
      ask(permissions, {
        tool: 'demoDestructiveAction',
        permissions: ['filesystem.write'],
        risk: 'destructive'
      }).prompts
    ).toHaveLength(1);
  });

  it('a concessão vale só para a ferramenta e as permissões em que foi dada', () => {
    const grant: StoredGrant = {
      id: 'g1',
      tool: 'demoReadAction',
      permissions: ['filesystem.read'],
      grantedAt: '2026-10-25T12:00:00.000Z'
    };
    const { permissions } = manager(memoryStorage([grant]));
    expect(permissions.existingGrant('demoReadAction', ['filesystem.read'], 'read')).toBe('always');
    expect(
      permissions.existingGrant('demoReadAction', ['filesystem.read', 'clipboard.read'], 'read')
    ).toBeNull();
    expect(permissions.existingGrant('getCurrentTime', ['filesystem.read'], 'read')).toBeNull();
  });

  it('sem resposta no prazo = cancelado', async () => {
    const { permissions } = manager(memoryStorage(), 1000);
    const { result, prompts } = ask(permissions);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBe('timeout');
    expect(permissions.respond(prompts[0]?.id ?? '', 'once')).toBe(false);
  });

  it('Parar (abort) cancela o pedido pendente', async () => {
    const { permissions } = manager();
    const { result, controller, prompts } = ask(permissions);
    controller.abort();
    expect(await result).toBe('cancelled');
    expect(permissions.isPending(prompts[0]?.id ?? '')).toBe(false);
  });

  it('negar responde "denied" e não guarda nada', async () => {
    const { permissions, storage } = manager();
    const { result, prompts } = ask(permissions);
    expect(permissions.respond(prompts[0]?.id ?? '', 'deny')).toBe(true);
    expect(await result).toBe('denied');
    expect(storage.grants).toEqual([]);
    expect(permissions.list()).toEqual([]);
  });
});
