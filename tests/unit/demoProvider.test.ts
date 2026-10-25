import { describe, expect, it } from 'vitest';
import { chunkText, DemoProvider } from '../../src/main/ai/providers/demo/demoProvider';
import {
  answerFor,
  detectLanguage,
  type AnswerInput
} from '../../src/main/ai/providers/demo/repertoire';
import { parseSimulation } from '../../src/main/ai/providers/demo/simulations';
import type { ChatRequest, ChatStreamEvent } from '../../src/main/ai/types';
import type { ConversationMessage } from '../../src/shared/ai/conversation';
import { PERSONALITIES } from '../../src/shared/personalities';

const NOW = new Date('2026-10-24T21:30:00Z');

function input(text: string, overrides: Partial<AnswerInput> = {}): AnswerInput {
  return {
    text,
    uiLocale: 'pt-BR',
    platform: 'win32',
    osName: 'Windows',
    personality: 'helpful',
    now: NOW,
    timeZone: 'America/Sao_Paulo',
    ...overrides
  };
}

function request(text: string, signal = new AbortController().signal): ChatRequest {
  const user: ConversationMessage = {
    id: 'u1',
    role: 'user',
    content: text,
    createdAt: NOW.toISOString(),
    status: 'complete'
  };
  return {
    requestId: 'r1',
    system: 'sistema',
    messages: [user],
    model: 'demo',
    maxOutputTokens: 1024,
    signal,
    hints: {
      personality: 'helpful',
      uiLocale: 'pt-BR',
      platform: 'win32',
      timeZone: 'America/Sao_Paulo',
      now: NOW
    }
  };
}

async function collect(stream: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

const fast = { timing: { thinkingMs: 0, chunkMs: 0 } };

describe('repertório do Demo (SPEC Apêndice B)', () => {
  it('renomear arquivo no Windows, nos dois tons: mesmos passos, final diferente', () => {
    const helpful = answerFor(input('Como eu renomeio um arquivo?'));
    const witty = answerFor(input('Como eu renomeio um arquivo?', { personality: 'witty' }));
    expect(helpful.topic).toBe('rename');
    expect(helpful.text).toContain('**F2**');
    expect(helpful.text).toContain('Explorador de Arquivos');
    expect(witty.text).toContain('**F2**');
    expect(witty.text).toContain('cartório');
    expect(helpful.text).not.toEqual(witty.text);
  });

  it('responde para o sistema do usuário', () => {
    expect(answerFor(input('como renomear?', { platform: 'darwin' })).text).toContain('Finder');
    expect(answerFor(input('como renomear?', { platform: 'linux' })).text).toContain('mv ');
    expect(answerFor(input('how do I take a screenshot?', { platform: 'darwin' })).text).toContain(
      'Command + Shift + 4'
    );
    expect(answerFor(input('Como faço uma captura de tela?')).text).toContain(
      'Windows + Shift + S'
    );
  });

  it('responde no idioma da mensagem, não no da interface', () => {
    const answer = answerFor(input('How do I rename a file?', { uiLocale: 'pt-BR' }));
    expect(answer.lang).toBe('en');
    expect(answer.text).toContain('File Explorer');
    const pt = answerFor(input('como tiro um screenshot?', { uiLocale: 'en' }));
    expect(pt.lang).toBe('pt-BR');
    expect(pt.topic).toBe('screenshot');
  });

  it('cobre o repertório mínimo nos dois idiomas e nos três sistemas', () => {
    const questions = {
      'pt-BR': [
        'Como eu renomeio um arquivo?',
        'Como faço uma captura de tela?',
        'Como copiar e colar?',
        'Que horas são?',
        'Quem é você?'
      ],
      en: [
        'How do I rename a file?',
        'How do I take a screenshot?',
        'How do I copy and paste?',
        'What time is it?',
        'Who are you?'
      ]
    } as const;
    const topics = ['rename', 'screenshot', 'copyPaste', 'time', 'identity'];
    for (const platform of ['win32', 'darwin', 'linux'] as const) {
      for (const lang of ['pt-BR', 'en'] as const) {
        for (const personality of ['helpful', 'witty'] as const) {
          questions[lang].forEach((question, index) => {
            const answer = answerFor(input(question, { platform, personality }));
            expect(answer.topic, question).toBe(topics[index]);
            expect(answer.lang, question).toBe(lang);
            expect(answer.text.length).toBeGreaterThan(20);
          });
        }
      }
    }
  });

  it('"que horas são?" usa o relógio e o fuso informados', () => {
    expect(answerFor(input('Que horas são?')).text).toContain('**18:30**');
    expect(answerFor(input('What time is it?', { timeZone: 'UTC' })).text).toContain('9:30');
  });

  it('fora do repertório: convite para configurar uma IA, no tom da personalidade', () => {
    const helpful = answerFor(input('Qual é a capital da Mongólia?'));
    expect(helpful.topic).toBe('fallback');
    expect(helpful.text).toBe(PERSONALITIES.helpful.microcopy.demoFallback['pt-BR']);
    const witty = answerFor(
      input('What is the capital of Mongolia?', { personality: 'witty', uiLocale: 'pt-BR' })
    );
    expect(witty.text).toBe(PERSONALITIES.witty.microcopy.demoFallback.en);
  });

  it('palavras inteiras: "oi" não casa dentro de outras palavras', () => {
    expect(answerFor(input('oi')).topic).toBe('greeting');
    expect(answerFor(input('foi difícil a prova de biologia')).topic).toBe('fallback');
  });

  it('detecção de idioma com empate fica com a interface', () => {
    expect(detectLanguage('xyz', 'en')).toBe('en');
    expect(detectLanguage('xyz', 'pt-BR')).toBe('pt-BR');
  });
});

describe('DemoProvider', () => {
  it('emite pedaços de texto e termina com done; o texto reconstruído é a resposta', async () => {
    const provider = new DemoProvider({ ...fast, allowSimulations: false });
    const events = await collect(provider.streamResponse(request('Como eu renomeio um arquivo?')));
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'end_turn' });
    const deltas = events.slice(0, -1);
    expect(deltas.length).toBeGreaterThan(5);
    expect(deltas.every((event) => event.type === 'text-delta')).toBe(true);
    const text = deltas.map((event) => (event.type === 'text-delta' ? event.text : '')).join('');
    expect(text).toBe(answerFor(input('Como eu renomeio um arquivo?')).text);
  });

  it('para quando o sinal é abortado', async () => {
    const provider = new DemoProvider({
      timing: { thinkingMs: 0, chunkMs: 5 },
      allowSimulations: false
    });
    const controller = new AbortController();
    const events: ChatStreamEvent[] = [];
    await expect(
      (async () => {
        for await (const event of provider.streamResponse(request('renomear', controller.signal))) {
          events.push(event);
          if (events.length === 2) controller.abort();
        }
      })()
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(events).toHaveLength(2);
  });

  it('simulações só existem quando permitidas', async () => {
    const off = new DemoProvider({ ...fast, allowSimulations: false });
    const offEvents = await collect(off.streamResponse(request('/simular erro 429')));
    expect(offEvents.at(-1)?.type).toBe('done');

    const on = new DemoProvider({ ...fast, allowSimulations: true });
    const onEvents = await collect(on.streamResponse(request('/simular erro 429')));
    expect(onEvents).toHaveLength(1);
    const [event] = onEvents;
    expect(event?.type === 'error' && event.error.code).toBe('RATE_LIMITED');
    expect(event?.type === 'error' && event.error.retryAfterSeconds).toBe(20);

    const drop = await collect(on.streamResponse(request('/simulate drop')));
    expect(drop[0]?.type).toBe('text-delta');
    expect(drop.at(-1)?.type === 'error' && drop.at(-1)).toMatchObject({
      error: { code: 'OFFLINE' }
    });
  });

  it('timeout simulado só termina com o abort', async () => {
    const provider = new DemoProvider({ ...fast, allowSimulations: true });
    const controller = new AbortController();
    const pending = collect(
      provider.streamResponse(request('/simular timeout', controller.signal))
    );
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('generateResponse junta o stream; listModels e testConnection respondem', async () => {
    const provider = new DemoProvider({ ...fast, allowSimulations: false });
    const response = await provider.generateResponse(request('Quem é você?'));
    expect(response.text).toContain('Clipster');
    expect(await provider.listModels()).toEqual([{ id: 'demo', name: 'Demo' }]);
    expect(await provider.testConnection()).toEqual({ status: 'connected' });
  });
});

describe('comandos de simulação', () => {
  it('reconhece os comandos em pt-BR e em inglês', () => {
    expect(parseSimulation('/simular erro 401')).toEqual({ kind: 'error', code: 'AUTH_INVALID' });
    expect(parseSimulation('/simulate error 529')).toEqual({
      kind: 'error',
      code: 'PROVIDER_OVERLOADED'
    });
    expect(parseSimulation('/simulate error 999')).toEqual({ kind: 'error', code: 'UNKNOWN' });
    expect(parseSimulation('/simular timeout')).toEqual({ kind: 'timeout' });
    expect(parseSimulation('/simular offline')).toEqual({ kind: 'error', code: 'OFFLINE' });
    expect(parseSimulation('/simular markdown')).toEqual({ kind: 'markdown' });
    expect(parseSimulation('como simular um erro?')).toBeNull();
  });
});

describe('chunkText', () => {
  it('preserva o texto exatamente, inclusive quebras de linha', () => {
    const text = '1. Um\n2. Dois  três\n\n**quatro**';
    expect(chunkText(text).join('')).toBe(text);
  });
});
