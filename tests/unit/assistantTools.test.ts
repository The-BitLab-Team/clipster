import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AssistantService,
  type AssistantServiceOptions,
  type ChatTarget
} from '../../src/main/ai/assistantService';
import { DemoProvider } from '../../src/main/ai/providers/demo/demoProvider';
import type { AIProvider, ChatRequest, ChatStreamEvent, ToolCall } from '../../src/main/ai/types';
import { PermissionManager } from '../../src/main/permissions/permissionManager';
import { ToolExecutor } from '../../src/main/tools/executor';
import { createToolRegistry } from '../../src/main/tools/registry';
import type { ChatEvent } from '../../src/shared/ai/conversation';
import type { CharacterEvent } from '../../src/shared/character/stateMachine';
import { PERSONALITIES } from '../../src/shared/personalities';
import type { StoredGrant } from '../../src/shared/schemas/permissions';
import { memoryLogger } from './logRecords';

/** Laço de ferramentas do AssistantService (SPEC §22.2) com o executor e as permissões reais. */

const REQUESTER = 7;

/** Provider de roteiro: cada rodada é uma função da requisição. */
class RoundsProvider implements AIProvider {
  readonly id = 'anthropic' as const;
  readonly capabilities = { streaming: true, cancel: true, tools: true, listModels: false };
  readonly requests: ChatRequest[] = [];
  constructor(private readonly round: (request: ChatRequest, index: number) => ChatStreamEvent[]) {}
  async *streamResponse(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const index = this.requests.length;
    this.requests.push(request);
    await Promise.resolve();
    for (const event of this.round(request, index)) {
      await Promise.resolve();
      yield event;
    }
  }
  generateResponse(): never {
    throw new Error('não usado');
  }
  listModels(): Promise<never[]> {
    return Promise.resolve([]);
  }
  testConnection(): Promise<{ status: 'connected'; modelCount: number }> {
    return Promise.resolve({ status: 'connected', modelCount: 0 });
  }
}

const call = (name: string, input: unknown, id = `c-${name}`): ChatStreamEvent => ({
  type: 'tool-call',
  call: { id, name, input } satisfies ToolCall
});
const text = (value: string): ChatStreamEvent => ({ type: 'text-delta', text: value });
const done = (stopReason = 'end_turn', continuation?: unknown): ChatStreamEvent =>
  continuation === undefined
    ? { type: 'done', stopReason }
    : { type: 'done', stopReason, continuation };

function harness(provider: AIProvider, options: Partial<AssistantServiceOptions> = {}) {
  let grants: StoredGrant[] = [];
  const { logger, records } = memoryLogger();
  const permissions = new PermissionManager({
    storage: {
      load: () => grants,
      save: (next) => {
        grants = next;
      }
    }
  });
  const events: { target: ChatTarget; event: ChatEvent }[] = [];
  const character: CharacterEvent['type'][] = [];
  let id = 0;
  const service = new AssistantService({
    tools: new ToolExecutor({
      registry: createToolRegistry({ devTools: true }),
      permissions,
      logger,
      app: () => ({
        name: 'Clipster',
        version: '0.5.0',
        electron: '45.0.0',
        chrome: '146.0.0.0',
        platform: 'win32',
        arch: 'x64'
      })
    }),
    resolveProvider: () => provider,
    model: () => 'modelo-x',
    personality: () => PERSONALITIES.helpful,
    uiLocale: () => 'pt-BR',
    environment: () => ({
      appName: 'Clipster',
      appVersion: '0.5.0',
      platform: 'win32',
      now: new Date('2026-10-25T11:38:00Z'),
      timeZone: 'America/Sao_Paulo'
    }),
    emit: (target, event) => events.push({ target, event }),
    onCharacterEvent: (event) => character.push(event.type),
    onConversationSettled: () => undefined,
    logger,
    newId: () => `id${(id += 1).toString()}`,
    now: () => new Date('2026-10-25T11:38:00Z'),
    deltaFlushMs: 0,
    ...options
  });
  const reply = () => service.snapshot().messages.at(-1);
  const prompt = () => reply()?.tools?.find((item) => item.status === 'awaiting')?.prompt;
  return { service, permissions, events, character, reply, prompt, records, grants: () => grants };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AssistantService com ferramentas', () => {
  it('oferece as ferramentas, executa e continua com o resultado', async () => {
    const provider = new RoundsProvider((request, index) =>
      index === 0
        ? [text('Vou ver. '), call('getCurrentTime', {}), done('tool_use', { opaco: 1 })]
        : [
            text(
              `São ${(JSON.parse(request.toolRounds?.[0]?.results[0]?.content ?? '{}') as { time: string }).time}.`
            ),
            done()
          ]
    );
    const h = harness(provider);
    h.service.send('Que horas são?', REQUESTER);
    await vi.advanceTimersByTimeAsync(100);

    expect(provider.requests[0]?.tools?.map((tool) => tool.name)).toEqual([
      'getCurrentTime',
      'getClipsterVersion',
      'demoDestructiveAction',
      'demoReadAction'
    ]);
    const second = provider.requests[1];
    expect(second?.toolRounds).toEqual([
      {
        text: 'Vou ver. ',
        calls: [{ id: 'c-getCurrentTime', name: 'getCurrentTime', input: {} }],
        results: [
          {
            callId: 'c-getCurrentTime',
            name: 'getCurrentTime',
            content: expect.stringContaining('"time":"08:38"') as string,
            isError: false
          }
        ],
        continuation: { opaco: 1 }
      }
    ]);
    expect(h.reply()).toMatchObject({
      status: 'complete',
      content: 'Vou ver. \n\nSão 08:38.',
      tools: [{ id: 'c-getCurrentTime', tool: 'getCurrentTime', status: 'done' }]
    });
    const toolEvents = h.events.filter((item) => item.event.type === 'tool');
    expect(toolEvents.every((item) => item.target === REQUESTER)).toBe(true);
    expect(h.character).toEqual(['MESSAGE_SENT', 'FIRST_TOKEN', 'FIRST_TOKEN', 'STREAM_DONE']);
  });

  it('no máximo 5 chamadas por mensagem; depois a rodada vai sem ferramentas', async () => {
    const provider = new RoundsProvider((request, index) =>
      request.tools === undefined
        ? [text('Chega de ferramentas.'), done()]
        : [
            call('getCurrentTime', {}, `c${String(index)}a`),
            call('getCurrentTime', {}, `c${String(index)}b`),
            done('tool_use')
          ]
    );
    const h = harness(provider);
    h.service.send('loop', REQUESTER);
    await vi.advanceTimersByTimeAsync(1000);

    const tools = h.reply()?.tools ?? [];
    expect(tools.filter((item) => item.status === 'done')).toHaveLength(5);
    expect(tools.filter((item) => item.status === 'failed')).toHaveLength(1);
    expect(provider.requests).toHaveLength(4);
    expect(provider.requests.at(-1)?.tools).toBeUndefined();
    expect(
      JSON.parse(provider.requests.at(-1)?.toolRounds?.at(-1)?.results.at(-1)?.content ?? '')
    ).toMatchObject({
      error: 'limitReached'
    });
    expect(h.reply()?.content).toBe('Chega de ferramentas.');
  });

  it('a espera pela permissão não conta no tempo-limite; o personagem mostra o aviso', async () => {
    const provider = new RoundsProvider((_request, index) =>
      index === 0
        ? [call('demoReadAction', { folder: 'Fotos' }), done('tool_use')]
        : [text('Achei 3 arquivos.'), done()]
    );
    const h = harness(provider, { timeouts: { firstTokenMs: 1000, totalMs: 2000 } });
    h.service.send('liste Fotos', REQUESTER);
    await vi.advanceTimersByTimeAsync(10);
    expect(h.prompt()?.action['pt-BR']).toContain('“Fotos”');
    expect(h.character).toContain('PERMISSION_REQUESTED');

    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.reply()?.status).toBe('streaming');

    h.permissions.respond(h.prompt()?.id ?? '', 'session');
    await vi.advanceTimersByTimeAsync(10);
    expect(h.reply()).toMatchObject({ status: 'complete', content: 'Achei 3 arquivos.' });
    expect(h.character).toEqual([
      'MESSAGE_SENT',
      'PERMISSION_REQUESTED',
      'PERMISSION_RESOLVED',
      'FIRST_TOKEN',
      'STREAM_DONE'
    ]);
  });

  it('Parar durante o pedido: resposta interrompida, pedido cancelado, nada executado', async () => {
    const provider = new RoundsProvider(() => [
      call('demoDestructiveAction', { target: 'a.txt' }),
      done('tool_use')
    ]);
    const h = harness(provider);
    const { requestId } = h.service.send('apague a.txt', REQUESTER);
    await vi.advanceTimersByTimeAsync(10);
    const id = h.prompt()?.id ?? '';
    expect(h.permissions.isPending(id)).toBe(true);

    expect(h.service.cancel(requestId)).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(h.permissions.isPending(id)).toBe(false);
    expect(h.reply()).toMatchObject({
      status: 'interrupted',
      tools: [{ id: 'c-demoDestructiveAction', tool: 'demoDestructiveAction', status: 'denied' }]
    });
    expect(h.reply()?.tools?.[0]).not.toHaveProperty('prompt');
    expect(provider.requests).toHaveLength(1);
    expect(h.character).toContain('CANCELLED');
    const audit = h.records().find((record) => record.msg === 'tool.audit');
    expect(audit?.ctx).toMatchObject({ decision: 'cancelled', success: false });
  });

  it('resultado da ferramenta não concede permissão: cada chamada pergunta de novo', async () => {
    const provider = new RoundsProvider((_request, index) =>
      index < 2
        ? [
            call('demoDestructiveAction', { target: `x${String(index)}.txt` }, `d${String(index)}`),
            done('tool_use')
          ]
        : [text('ok'), done()]
    );
    const h = harness(provider);
    h.service.send('apague tudo', REQUESTER);
    await vi.advanceTimersByTimeAsync(10);
    const first = h.prompt();
    h.permissions.respond(first?.id ?? '', 'once');
    await vi.advanceTimersByTimeAsync(10);
    const second = h.prompt();
    expect(second).toBeDefined();
    expect(second?.id).not.toBe(first?.id);
    h.permissions.respond(second?.id ?? '', 'deny');
    await vi.advanceTimersByTimeAsync(10);
    expect(h.reply()?.tools?.map((item) => item.status)).toEqual(['done', 'denied']);
    expect(h.grants()).toEqual([]);
  });

  it('provider sem suporte a ferramentas não recebe nenhuma', async () => {
    const provider = new RoundsProvider(() => [text('oi'), done()]);
    Object.assign(provider, { capabilities: { ...provider.capabilities, tools: false } });
    const h = harness(provider);
    h.service.send('oi', REQUESTER);
    await vi.advanceTimersByTimeAsync(10);
    expect(provider.requests[0]).not.toHaveProperty('tools');
  });

  it('Demo: "que horas são?" passa pelo getCurrentTime (SPEC §20.3)', async () => {
    const demo = new DemoProvider({
      timing: { thinkingMs: 0, chunkMs: 0 },
      allowSimulations: false
    });
    const h = harness(demo);
    h.service.send('Que horas são?', REQUESTER);
    await vi.advanceTimersByTimeAsync(100);
    expect(h.reply()).toMatchObject({
      status: 'complete',
      tools: [{ id: 'demo-call-1', tool: 'getCurrentTime', status: 'done' }]
    });
    expect(h.reply()?.content).toBe(
      'Agora são **08:38** de domingo, 25 de outubro de 2026 (America/Sao_Paulo).'
    );

    h.service.send('qual a sua versão?', REQUESTER);
    await vi.advanceTimersByTimeAsync(100);
    expect(h.reply()?.content).toBe(
      'Estou na versão **Clipster 0.5.0** (Electron 45.0.0, Chromium 146.0.0.0), no Windows.'
    );
  });

  it('Demo: simulação de loop para no limite e explica', async () => {
    const demo = new DemoProvider({
      timing: { thinkingMs: 0, chunkMs: 0 },
      allowSimulations: true
    });
    const h = harness(demo);
    h.service.send('/simular ferramenta loop', REQUESTER);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.reply()?.tools).toHaveLength(5);
    expect(h.reply()?.content).toContain('limite de ferramentas');
  });
});
