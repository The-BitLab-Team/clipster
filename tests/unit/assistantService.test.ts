import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import {
  AssistantService,
  type AssistantServiceOptions,
  type ChatTarget,
  type StoredConversation
} from '../../src/main/ai/assistantService';
import { ClipsterError } from '../../src/main/ai/errors';
import { DemoProvider } from '../../src/main/ai/providers/demo/demoProvider';
import type { AIProvider, ChatRequest, ChatStreamEvent } from '../../src/main/ai/types';
import type { ChatEvent } from '../../src/shared/ai/conversation';
import type { CharacterEvent } from '../../src/shared/character/stateMachine';
import { PERSONALITIES } from '../../src/shared/personalities';
import type { PersonalityId } from '../../src/shared/schemas/settings';
import { memoryLogger } from './logRecords';

const REQUESTER = 7;

/** Provider controlado pelo teste: cada chamada devolve o gerador passado em `next`. */
class ScriptedProvider implements AIProvider {
  readonly id = 'demo' as const;
  readonly capabilities = { streaming: true, cancel: true, tools: false, listModels: false };
  readonly requests: ChatRequest[] = [];
  next: (request: ChatRequest) => AsyncGenerator<ChatStreamEvent> = async function* () {
    await Promise.resolve();
    yield { type: 'done' };
  };

  streamResponse(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    this.requests.push(request);
    return this.next(request);
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

function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });
}

interface Harness {
  service: AssistantService;
  events: { target: ChatTarget; event: ChatEvent }[];
  character: CharacterEvent['type'][];
  settled: StoredConversation[];
  setPersonality: (id: PersonalityId) => void;
  setProvider: (provider: AIProvider | null) => void;
  logs: () => string;
}

function harness(options: Partial<AssistantServiceOptions> = {}): Harness {
  let personality: PersonalityId = 'helpful';
  let provider: AIProvider | null = new ScriptedProvider();
  let id = 0;
  const events: Harness['events'] = [];
  const character: Harness['character'] = [];
  const settled: StoredConversation[] = [];
  const { logger, raw } = memoryLogger();
  const service = new AssistantService({
    resolveProvider: () => provider,
    model: () => 'modelo-x',
    personality: () => PERSONALITIES[personality],
    uiLocale: () => 'pt-BR',
    environment: () => ({
      appName: 'Clipster',
      appVersion: '0.3.0',
      platform: 'win32',
      now: new Date('2026-10-24T12:00:00Z'),
      timeZone: 'UTC'
    }),
    emit: (target, event) => events.push({ target, event }),
    onCharacterEvent: (event) => character.push(event.type),
    onConversationSettled: (conversation) => settled.push(conversation),
    logger,
    newId: () => `id${(id += 1).toString()}`,
    now: () => new Date('2026-10-24T12:00:00Z'),
    ...options
  });
  return {
    service,
    events,
    character,
    settled,
    setPersonality: (next) => {
      personality = next;
    },
    setProvider: (next) => {
      provider = next;
    },
    logs: raw
  };
}

const types = (h: Harness) => h.events.map((item) => item.event.type);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AssistantService', () => {
  it('fluxo completo com o Demo: start → deltas → done, estados do personagem na ordem', async () => {
    const h = harness();
    h.setProvider(
      new DemoProvider({ timing: { thinkingMs: 100, chunkMs: 10 }, allowSimulations: false })
    );
    const { requestId } = h.service.send('  Como eu renomeio um arquivo?  ', REQUESTER);

    const start = h.events[0]?.event;
    expect(start?.type).toBe('start');
    if (start?.type !== 'start') throw new Error('sem start');
    expect(start.messages.map((m) => [m.role, m.status])).toEqual([
      ['user', 'complete'],
      ['assistant', 'streaming']
    ]);
    expect(start.messages[0]?.content).toBe('Como eu renomeio um arquivo?');
    expect(h.service.snapshot().activeRequestId).toBe(requestId);
    expect(h.character).toEqual(['MESSAGE_SENT']);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(types(h)[0]).toBe('start');
    expect(types(h).at(-1)).toBe('done');
    expect(types(h).filter((type) => type === 'delta').length).toBeGreaterThan(1);
    expect(h.events.every((item) => item.target === REQUESTER)).toBe(true);
    expect(h.character).toEqual(['MESSAGE_SENT', 'FIRST_TOKEN', 'STREAM_DONE']);

    const deltas = h.events
      .map((item) => item.event)
      .flatMap((event) => (event.type === 'delta' ? [event.text] : []))
      .join('');
    const snapshot = h.service.snapshot();
    expect(snapshot.activeRequestId).toBeNull();
    expect(snapshot.messages[1]?.status).toBe('complete');
    expect(snapshot.messages[1]?.content).toBe(deltas);
    expect(deltas).toContain('**F2**');
    expect(h.settled.at(-1)?.messages).toHaveLength(2);
  });

  it('agrupa pedaços que chegam juntos em um único delta', async () => {
    const h = harness();
    const provider = new ScriptedProvider();
    provider.next = async function* () {
      await Promise.resolve();
      for (let index = 0; index < 10; index += 1) yield { type: 'text-delta', text: `${index} ` };
      yield { type: 'done' };
    };
    h.setProvider(provider);
    h.service.send('oi', REQUESTER);
    await vi.advanceTimersByTimeAsync(100);
    const deltas = h.events.filter((item) => item.event.type === 'delta');
    expect(deltas).toHaveLength(1);
    expect(deltas[0]?.event).toMatchObject({ text: '0 1 2 3 4 5 6 7 8 9 ' });
  });

  it('uma requisição por vez; valida texto e provider', () => {
    const h = harness();
    const provider = new ScriptedProvider();
    provider.next = (request) =>
      (async function* () {
        await waitForAbort(request.signal);
        yield { type: 'done' } as const;
      })();
    h.setProvider(provider);
    h.service.send('primeira', REQUESTER);
    expect(() => h.service.send('segunda', REQUESTER)).toThrow(
      expect.objectContaining({ code: 'BUSY' })
    );

    const empty = harness();
    expect(() => empty.service.send('   ', REQUESTER)).toThrow(
      expect.objectContaining({ code: 'EMPTY' })
    );
    expect(() => empty.service.send('x'.repeat(4001), REQUESTER)).toThrow(
      expect.objectContaining({ code: 'TOO_LONG' })
    );
    empty.setProvider(null);
    expect(() => empty.service.send('oi', REQUESTER)).toThrow(
      expect.objectContaining({ code: 'NOT_CONFIGURED' })
    );
    expect(empty.service.snapshot().messages).toEqual([]);
  });

  it('Parar: aborta o provider, mantém o texto parcial e marca como interrompida', async () => {
    const h = harness();
    let signal: AbortSignal | null = null;
    const provider = new ScriptedProvider();
    provider.next = (request) => {
      signal = request.signal;
      return (async function* () {
        yield { type: 'text-delta', text: 'Começo da ' } as const;
        await waitForAbort(request.signal);
      })();
    };
    h.setProvider(provider);
    const { requestId } = h.service.send('conta uma história', REQUESTER);
    await vi.advanceTimersByTimeAsync(100);

    expect(h.service.cancel(requestId)).toBe(true);
    expect(h.service.cancel(requestId)).toBe(false);
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(100);

    const last = h.events.at(-1)?.event;
    expect(last?.type).toBe('cancelled');
    if (last?.type !== 'cancelled') throw new Error('sem cancelled');
    expect(last.message).toMatchObject({ status: 'interrupted', content: 'Começo da ' });
    expect(h.character).toEqual(['MESSAGE_SENT', 'FIRST_TOKEN', 'CANCELLED']);
    expect(h.service.isGenerating).toBe(false);
    expect(types(h).filter((type) => type === 'error')).toEqual([]);
  });

  it('sem primeiro token em 30 s → TIMEOUT', async () => {
    const h = harness();
    let signal: AbortSignal | null = null;
    const provider = new ScriptedProvider();
    provider.next = (request) => {
      signal = request.signal;
      return (async function* () {
        await waitForAbort(request.signal);
        yield { type: 'done' } as const;
      })();
    };
    h.setProvider(provider);
    h.service.send('oi', REQUESTER);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(h.service.isGenerating).toBe(true);
    await vi.advanceTimersByTimeAsync(1);

    const last = h.events.at(-1)?.event;
    expect(last?.type === 'error' && last.message.error?.code).toBe('TIMEOUT');
    expect(last?.type === 'error' && last.message.error?.supportCode).toMatch(/^CLP-[0-9A-F]{4}$/);
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
    expect(h.character.at(-1)).toBe('AI_ERROR');
  });

  it('modelo pensando conta como resposta começada: não estoura os 30 s do primeiro texto', async () => {
    const h = harness();
    const provider = new ScriptedProvider();
    provider.next = async function* () {
      await new Promise((resolveWait) => setTimeout(resolveWait, 10_000));
      yield { type: 'thinking' };
      await new Promise((resolveWait) => setTimeout(resolveWait, 35_000));
      yield { type: 'text-delta', text: 'Pronto.' };
      yield { type: 'done' };
    };
    h.setProvider(provider);
    h.service.send('pense bem', REQUESTER);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.service.snapshot().messages[1]).toMatchObject({
      status: 'complete',
      content: 'Pronto.'
    });
    // O personagem só passa a "falando" com o primeiro texto.
    expect(h.character).toEqual(['MESSAGE_SENT', 'FIRST_TOKEN', 'STREAM_DONE']);
  });

  it('tempos-limite do provider têm prioridade (ex.: modelo local carregando)', async () => {
    const h = harness();
    const provider = Object.assign(new ScriptedProvider(), {
      timeouts: { firstTokenMs: 90_000, totalMs: 300_000 }
    });
    provider.next = async function* () {
      await new Promise((resolveWait) => setTimeout(resolveWait, 60_000));
      yield { type: 'text-delta', text: 'Carreguei.' };
      yield { type: 'done' };
    };
    h.setProvider(provider);
    h.service.send('oi', REQUESTER);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(h.service.snapshot().messages[1]?.status).toBe('complete');
  });

  it('resposta que passa de 120 s no total → TIMEOUT, mantendo o que já chegou', async () => {
    const h = harness();
    const provider = new ScriptedProvider();
    provider.next = (request) =>
      (async function* () {
        for (;;) {
          yield { type: 'text-delta', text: '.' } as const;
          await new Promise((resolveWait) => setTimeout(resolveWait, 10_000));
          if (request.signal.aborted) return;
        }
      })();
    h.setProvider(provider);
    h.service.send('fale para sempre', REQUESTER);
    await vi.advanceTimersByTimeAsync(121_000);
    const message = h.service.snapshot().messages[1];
    expect(message?.status).toBe('error');
    expect(message?.error?.code).toBe('TIMEOUT');
    expect(message?.content.length).toBeGreaterThan(5);
  });

  it('erro do provider vira mensagem com código; "Tentar de novo" refaz a pergunta', async () => {
    const h = harness();
    const provider = new ScriptedProvider();
    provider.next = async function* () {
      await Promise.resolve();
      yield {
        type: 'error',
        error: new ClipsterError('RATE_LIMITED', 'HTTP 429', { retryAfterSeconds: 12 })
      };
    };
    h.setProvider(provider);
    h.service.send('oi', REQUESTER);
    await vi.advanceTimersByTimeAsync(10);

    const failed = h.service.snapshot().messages[1];
    expect(failed?.status).toBe('error');
    expect(failed?.error).toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 12 });
    expect(h.logs()).toContain('"code":"RATE_LIMITED"');
    expect(h.logs()).not.toContain('"oi"');

    provider.next = async function* () {
      await Promise.resolve();
      yield { type: 'text-delta', text: 'Agora foi.' };
      yield { type: 'done' };
    };
    h.service.retry(REQUESTER);
    expect(h.events.find((item) => item.event.type === 'reset')?.target).toBe('chat-windows');
    await vi.advanceTimersByTimeAsync(100);
    const messages = h.service.snapshot().messages;
    expect(messages.map((m) => [m.role, m.status, m.content])).toEqual([
      ['user', 'complete', 'oi'],
      ['assistant', 'complete', 'Agora foi.']
    ]);
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]?.messages.map((m) => m.content)).toEqual(['oi']);
    expect(() => h.service.retry(REQUESTER)).toThrow(
      expect.objectContaining({ code: 'NOTHING_TO_RETRY' })
    );
  });

  it('exceção qualquer no provider vira UNKNOWN', async () => {
    const h = harness();
    const provider = new ScriptedProvider();
    provider.next = async function* () {
      await Promise.resolve();
      yield* [];
      throw new TypeError('quebrou');
    };
    h.setProvider(provider);
    h.service.send('oi', REQUESTER);
    await vi.advanceTimersByTimeAsync(10);
    expect(h.service.snapshot().messages[1]?.error?.code).toBe('UNKNOWN');
  });

  it('trocar a personalidade no meio da conversa vale para a próxima requisição', async () => {
    const h = harness();
    const provider = new ScriptedProvider();
    provider.next = async function* () {
      await Promise.resolve();
      yield { type: 'text-delta', text: 'ok' };
      yield { type: 'done' };
    };
    h.setProvider(provider);
    h.service.send('primeira', REQUESTER);
    await vi.advanceTimersByTimeAsync(100);
    h.setPersonality('witty');
    h.service.send('segunda', REQUESTER);
    await vi.advanceTimersByTimeAsync(10);

    expect(provider.requests[0]?.system).toContain('Personalidade: Prestativo');
    expect(provider.requests[1]?.system).toContain('Personalidade: Espirituoso');
    expect(provider.requests[1]?.hints.personality).toBe('witty');
    expect(provider.requests[1]?.temperature).toBe(PERSONALITIES.witty.temperaturePreference);
    // O histórico continua o mesmo.
    expect(provider.requests[1]?.messages.map((m) => m.content)).toEqual([
      'primeira',
      'ok',
      'segunda'
    ]);
  });

  it('nova conversa cancela a resposta em andamento e começa do zero', async () => {
    const h = harness();
    const provider = new ScriptedProvider();
    provider.next = (request) =>
      (async function* () {
        await waitForAbort(request.signal);
        yield { type: 'done' } as const;
      })();
    h.setProvider(provider);
    h.service.send('oi', REQUESTER);
    const before = h.service.snapshot().id;
    const snapshot = h.service.newConversation();
    expect(snapshot.id).not.toBe(before);
    expect(snapshot.messages).toEqual([]);
    expect(types(h)).toEqual(['start', 'cancelled', 'reset']);
    // A conversa anterior foi entregue para o histórico antes da troca.
    expect(h.settled.at(-1)?.id).toBe(before);
    await vi.advanceTimersByTimeAsync(10);
  });

  it('conversa restaurada com resposta pela metade volta como interrompida', () => {
    const h = harness({
      initialConversation: {
        id: 'antiga',
        createdAt: '2026-10-20T10:00:00.000Z',
        updatedAt: '2026-10-20T10:01:00.000Z',
        messages: [
          {
            id: 'a',
            role: 'user',
            content: 'oi',
            createdAt: '2026-10-20T10:00:00.000Z',
            status: 'complete'
          },
          {
            id: 'b',
            role: 'assistant',
            content: 'Ol',
            createdAt: '2026-10-20T10:00:01.000Z',
            status: 'streaming'
          }
        ]
      }
    });
    const snapshot = h.service.snapshot();
    expect(snapshot.id).toBe('antiga');
    expect(snapshot.messages[1]?.status).toBe('interrupted');
  });
});
