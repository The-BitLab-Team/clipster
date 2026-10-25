import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PermissionManager } from '../../src/main/permissions/permissionManager';
import { ToolExecutor, type ToolRunContext } from '../../src/main/tools/executor';
import { createToolRegistry, ToolRegistry } from '../../src/main/tools/registry';
import { defineTool } from '../../src/main/tools/types';
import type { StoredGrant } from '../../src/shared/schemas/permissions';
import type { ToolActivity } from '../../src/shared/tools/types';
import { memoryLogger } from './logRecords';

const APP = {
  name: 'Clipster',
  version: '0.5.0',
  electron: '45.0.0',
  chrome: '146.0.0.0',
  platform: 'win32' as const,
  arch: 'x64'
};

function setup(
  options: { devTools?: boolean; registry?: ToolRegistry; executionTimeoutMs?: number } = {}
) {
  let grants: StoredGrant[] = [];
  const permissions = new PermissionManager({
    storage: {
      load: () => grants,
      save: (next) => {
        grants = next;
      }
    }
  });
  const { logger, records, raw } = memoryLogger();
  const executor = new ToolExecutor({
    registry: options.registry ?? createToolRegistry({ devTools: options.devTools ?? true }),
    permissions,
    logger,
    app: () => APP,
    ...(options.executionTimeoutMs === undefined
      ? {}
      : { executionTimeoutMs: options.executionTimeoutMs })
  });
  const activities: ToolActivity[] = [];
  const controller = new AbortController();
  const ctx: ToolRunContext = {
    requestId: 'r1',
    locale: 'pt-BR',
    timeZone: 'America/Sao_Paulo',
    now: () => new Date('2026-10-25T11:38:00Z'),
    signal: controller.signal,
    onActivity: (activity) => activities.push(activity)
  };
  const audits = () => records().filter((record) => record.msg === 'tool.audit');
  return { executor, permissions, ctx, activities, controller, audits, raw };
}

/** Espera o pedido de permissão aparecer na atividade. */
async function promptOf(activities: ToolActivity[]) {
  for (let i = 0; i < 50; i += 1) {
    const awaiting = activities.find((item) => item.status === 'awaiting');
    if (awaiting?.prompt !== undefined) return awaiting.prompt;
    await Promise.resolve();
  }
  throw new Error('Sem pedido de permissão');
}

describe('ToolRegistry', () => {
  it('oferece as ferramentas do MVP; as de teste só com devTools', () => {
    expect(
      createToolRegistry({ devTools: false })
        .list()
        .map((tool) => tool.name)
    ).toEqual(['getCurrentTime', 'getClipsterVersion']);
    expect(
      createToolRegistry({ devTools: true })
        .list()
        .map((tool) => tool.name)
    ).toEqual(['getCurrentTime', 'getClipsterVersion', 'demoDestructiveAction', 'demoReadAction']);
  });

  it('definições com JSON Schema de objeto e descrição no idioma pedido', () => {
    const registry = createToolRegistry({ devTools: true });
    const [time] = registry.definitions('pt-BR');
    expect(time?.name).toBe('getCurrentTime');
    expect(time?.description).toContain('data e a hora');
    expect(time?.inputSchema).not.toHaveProperty('$schema');
    expect(time?.inputSchema).toMatchObject({ type: 'object' });
    expect(registry.definitions('en')[0]?.description).toContain('current date and time');
    const destructive = registry
      .definitions('en')
      .find((item) => item.name === 'demoDestructiveAction');
    expect(destructive?.inputSchema).toMatchObject({
      type: 'object',
      required: ['target'],
      additionalProperties: false
    });
  });

  it('nome desconhecido não encontra nada, nem propriedades de Object', () => {
    const registry = createToolRegistry({ devTools: false });
    expect(registry.get('apagarTudo')).toBeUndefined();
    expect(registry.get('constructor')).toBeUndefined();
    expect(registry.get('__proto__')).toBeUndefined();
  });
});

describe('ferramentas do MVP (SPEC §22.3)', () => {
  it('getCurrentTime: hora no fuso e no idioma do usuário, sem pedir permissão', async () => {
    const { executor, ctx, activities, audits } = setup();
    const result = await executor.run({ id: 'c1', name: 'getCurrentTime', input: {} }, ctx);
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content)).toEqual({
      iso: '2026-10-25T11:38:00.000Z',
      date: 'domingo, 25 de outubro de 2026',
      time: '08:38',
      timeZone: 'America/Sao_Paulo'
    });
    expect(activities.map((item) => item.status)).toEqual(['running', 'running', 'done']);
    expect(audits()[0]?.ctx).toMatchObject({
      tool: 'getCurrentTime',
      decision: 'not_required',
      success: true
    });
  });

  it('getClipsterVersion: versões e sistema', async () => {
    const { executor, ctx } = setup();
    const result = await executor.run({ id: 'c1', name: 'getClipsterVersion', input: null }, ctx);
    expect(JSON.parse(result.content)).toEqual({
      app: 'Clipster',
      version: '0.5.0',
      electron: '45.0.0',
      chromium: '146.0.0.0',
      os: 'Windows',
      arch: 'x64'
    });
  });
});

describe('ToolExecutor (SPEC §22.2)', () => {
  it('ferramenta que não existe: erro para o modelo, nada executado', async () => {
    const { executor, ctx, activities, audits } = setup();
    const result = await executor.run({ id: 'c1', name: 'apagarTudo', input: {} }, ctx);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content)).toMatchObject({ error: 'unknownTool' });
    expect(activities).toEqual([{ id: 'c1', tool: null, status: 'failed' }]);
    expect(audits()[0]?.ctx).toMatchObject({ tool: 'unknown', decision: 'unknown_tool' });
  });

  it('argumentos inválidos são recusados antes de pedir permissão', async () => {
    const { executor, ctx, activities } = setup();
    for (const input of [
      {},
      { target: '' },
      { target: 'a\nAção segura' },
      { target: 'x\u202Etxt.exe' },
      { target: 'ok', extra: 1 }
    ]) {
      const result = await executor.run({ id: 'c1', name: 'demoDestructiveAction', input }, ctx);
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content)).toMatchObject({ error: 'invalidInput' });
    }
    expect(activities.every((item) => item.status === 'failed')).toBe(true);
  });

  it('o pedido de permissão mostra o texto da ferramenta, não o do modelo', async () => {
    const { executor, permissions, ctx, activities, audits, raw } = setup();
    const running = executor.run(
      { id: 'c1', name: 'demoDestructiveAction', input: { target: 'relatorio-final.docx' } },
      ctx
    );
    const prompt = await promptOf(activities);
    expect(prompt.action['pt-BR']).toBe(
      'Apagar o arquivo “relatorio-final.docx”. (Ferramenta de teste: nada é apagado de verdade.)'
    );
    expect(prompt.scopes).toEqual(['once']);
    permissions.respond(prompt.id, 'once');
    const result = await running;
    expect(JSON.parse(result.content)).toEqual({
      target: 'relatorio-final.docx',
      deleted: false,
      testTool: true
    });
    expect(activities.at(-1)).toEqual({ id: 'c1', tool: 'demoDestructiveAction', status: 'done' });
    expect(audits().at(-1)?.ctx).toMatchObject({ decision: 'granted_once', success: true });
    // Auditoria sem argumentos.
    expect(raw()).not.toContain('relatorio-final');
  });

  it('negado: nada é executado e o modelo é avisado', async () => {
    const { executor, permissions, ctx, activities, audits } = setup();
    const running = executor.run(
      { id: 'c1', name: 'demoReadAction', input: { folder: 'Fotos' } },
      ctx
    );
    permissions.respond((await promptOf(activities)).id, 'deny');
    const result = await running;
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content)).toMatchObject({ error: 'denied' });
    expect(activities.at(-1)?.status).toBe('denied');
    expect(audits().at(-1)?.ctx).toMatchObject({ decision: 'denied', success: false });
  });

  it('ferramenta lenta é interrompida; exceção vira falha sem derrubar nada', async () => {
    const slow = defineTool({
      name: 'getCurrentTime',
      description: { 'pt-BR': 'lenta', en: 'slow' },
      inputSchema: z.object({}),
      permissions: [],
      risk: 'read',
      describeAction: () => ({ 'pt-BR': '', en: '' }),
      execute: () => new Promise(() => undefined)
    });
    const broken = defineTool({
      name: 'getClipsterVersion',
      description: { 'pt-BR': 'quebrada', en: 'broken' },
      inputSchema: z.object({}),
      permissions: [],
      risk: 'read',
      describeAction: () => ({ 'pt-BR': '', en: '' }),
      execute: () => Promise.reject(new Error('falhou'))
    });
    const { executor, ctx } = setup({
      registry: new ToolRegistry([slow, broken]),
      executionTimeoutMs: 20
    });
    const tooSlow = await executor.run({ id: 'c1', name: 'getCurrentTime', input: {} }, ctx);
    expect(JSON.parse(tooSlow.content)).toMatchObject({ error: 'tooSlow' });
    const failed = await executor.run({ id: 'c2', name: 'getClipsterVersion', input: {} }, ctx);
    expect(JSON.parse(failed.content)).toMatchObject({ error: 'failed' });
  });

  it('limite atingido: recusa sem executar', () => {
    const { executor, ctx, activities, audits } = setup();
    const result = executor.refuse(
      { id: 'c6', name: 'getCurrentTime', input: {} },
      ctx,
      'limitReached'
    );
    expect(JSON.parse(result.content)).toMatchObject({ error: 'limitReached' });
    expect(activities).toEqual([{ id: 'c6', tool: 'getCurrentTime', status: 'failed' }]);
    expect(audits()[0]?.ctx).toMatchObject({ decision: 'limit_reached' });
  });
});
