import { createServer } from 'node:net';
import { APIUserAbortError } from '@anthropic-ai/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClipsterError } from '../../src/main/ai/errors';
import { AnthropicProvider } from '../../src/main/ai/providers/anthropic';
import {
  LOCAL_SERVER_TIMEOUTS,
  OpenAiCompatibleProvider
} from '../../src/main/ai/providers/openaiCompatible';
import {
  httpFailureToError,
  isLocalUrl,
  normalizeTurns,
  parseRetryAfter,
  readSse,
  sendsKeyInsecurely
} from '../../src/main/ai/providers/shared';
import type {
  AIProvider,
  ChatRequest,
  ChatStreamEvent,
  ToolDefinition,
  ToolRound
} from '../../src/main/ai/types';
import type { ConversationMessage } from '../../src/shared/ai/conversation';
import {
  startAnthropicMock,
  startOpenAiCompatibleMock,
  type MockServer
} from '../support/mockProviders';

const NOW = new Date('2026-10-24T12:00:00Z');

/** Uma porta livre e fechada (nada escutando). */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen) => {
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

function message(role: ConversationMessage['role'], content: string): ConversationMessage {
  return { id: content, role, content, createdAt: NOW.toISOString(), status: 'complete' };
}

function request(
  text: string,
  model: string,
  signal: AbortSignal = new AbortController().signal
): ChatRequest {
  return {
    requestId: 'r1',
    system: 'Você é o Clipster.',
    messages: [message('user', 'oi'), message('assistant', 'Olá!'), message('user', text)],
    model,
    temperature: 0.8,
    maxOutputTokens: 1024,
    signal,
    hints: { personality: 'witty', uiLocale: 'pt-BR', platform: 'win32', timeZone: 'UTC', now: NOW }
  };
}

async function collect(stream: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'getCurrentTime',
    description: 'Data e hora.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'demoReadAction',
    description: 'Lista uma pasta.',
    inputSchema: {
      type: 'object',
      properties: { folder: { type: 'string' } },
      required: ['folder'],
      additionalProperties: false
    }
  }
];

/** Rodada 1 pede a ferramenta; a rodada 2 leva o resultado e a continuação do provider. */
async function toolRoundTrip(provider: AIProvider, text: string, model: string) {
  const first = await collect(provider.streamResponse({ ...request(text, model), tools: TOOLS }));
  const calls = first.flatMap((event) => (event.type === 'tool-call' ? [event.call] : []));
  const done = first.at(-1);
  const continuation = done?.type === 'done' ? done.continuation : undefined;
  const round: ToolRound = {
    text: textOf(first),
    calls,
    results: calls.map((call) => ({
      callId: call.id,
      name: call.name,
      content: '{"time":"08:38"}',
      isError: false
    })),
    ...(continuation === undefined ? {} : { continuation })
  };
  const second = await collect(
    provider.streamResponse({ ...request(text, model), tools: TOOLS, toolRounds: [round] })
  );
  return { first, calls, done, second };
}

const textOf = (events: ChatStreamEvent[]): string =>
  events.map((event) => (event.type === 'text-delta' ? event.text : '')).join('');

async function errorCode(provider: AIProvider, text: string, model: string): Promise<unknown> {
  try {
    await collect(provider.streamResponse(request(text, model)));
    return 'sem erro';
  } catch (error) {
    return error instanceof ClipsterError
      ? { code: error.code, retryAfterSeconds: error.retryAfterSeconds }
      : error;
  }
}

describe('utilitários HTTP dos providers', () => {
  it('retry-after em segundos ou data HTTP', () => {
    expect(parseRetryAfter('12', NOW)).toBe(12);
    expect(parseRetryAfter('1.2', NOW)).toBe(2);
    expect(parseRetryAfter('Sat, 24 Oct 2026 12:00:30 GMT', NOW)).toBe(30);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('amanhã')).toBeUndefined();
  });

  it('servidor local e aviso de chave por http', () => {
    expect(isLocalUrl('http://localhost:11434/v1')).toBe(true);
    expect(isLocalUrl('http://127.0.0.1:1234/v1')).toBe(true);
    expect(isLocalUrl('http://[::1]:8080/v1')).toBe(true);
    expect(isLocalUrl('https://api.openai.com/v1')).toBe(false);
    expect(sendsKeyInsecurely('http://192.168.0.10:11434/v1')).toBe(true);
    expect(sendsKeyInsecurely('http://localhost:11434/v1')).toBe(false);
    expect(sendsKeyInsecurely('https://example.com/v1')).toBe(false);
  });

  it('junta mensagens seguidas do mesmo papel', () => {
    expect(
      normalizeTurns([message('user', 'a'), message('user', 'b'), message('assistant', 'c')])
    ).toEqual([
      { role: 'user', content: 'a\n\nb' },
      { role: 'assistant', content: 'c' }
    ]);
  });

  it('lê SSE com \\r\\n, comentários, eventos nomeados e várias linhas de data', async () => {
    const raw =
      ': comentário\r\nevent: um\r\ndata: {"a":1}\r\n\r\ndata: linha1\ndata: linha2\n\ndata: fim';
    const stream = new Response(raw).body;
    if (stream === null) throw new Error('sem corpo');
    const messages = [];
    for await (const item of readSse(stream)) messages.push(item);
    expect(messages).toEqual([
      { event: 'um', data: '{"a":1}' },
      { event: null, data: 'linha1\nlinha2' },
      { event: null, data: 'fim' }
    ]);
  });

  it('tabela de erros da SPEC §23 para servidores compatíveis com OpenAI', () => {
    const map = (status: number, body: unknown, retryAfter: string | null = null) =>
      httpFailureToError({ status, retryAfter, body: JSON.stringify(body) }, NOW).code;
    expect(map(401, { error: { message: 'bad key' } })).toBe('AUTH_INVALID');
    expect(map(403, {})).toBe('AUTH_INVALID');
    expect(map(404, { error: { message: 'model "x" not found' } })).toBe('MODEL_NOT_FOUND');
    expect(map(429, { error: { message: 'slow down' } }, '5')).toBe('RATE_LIMITED');
    expect(map(429, { error: { code: 'insufficient_quota', message: 'quota' } }, '5')).toBe(
      'QUOTA_OR_BILLING'
    );
    expect(map(429, { error: { message: 'limit' } })).toBe('QUOTA_OR_BILLING');
    expect(map(402, {})).toBe('QUOTA_OR_BILLING');
    expect(map(503, {})).toBe('PROVIDER_OVERLOADED');
    expect(map(529, {})).toBe('PROVIDER_OVERLOADED');
    expect(map(400, { error: { code: 'context_length_exceeded', message: 'too long' } })).toBe(
      'CONTEXT_TOO_LONG'
    );
    expect(map(504, {})).toBe('TIMEOUT');
    expect(map(500, {})).toBe('UNKNOWN');
  });
});

describe('OpenAiCompatibleProvider (Ollama, LM Studio, OpenAI)', () => {
  let mock: MockServer;
  let keyed: MockServer;

  beforeAll(async () => {
    mock = await startOpenAiCompatibleMock({ chunkDelayMs: 1 });
    keyed = await startOpenAiCompatibleMock({ chunkDelayMs: 1, apiKey: 'sk-teste-1234567890' });
  });
  afterAll(async () => {
    await mock.close();
    await keyed.close();
  });

  it('conversa com streaming: system primeiro, max_tokens e temperatura para servidor local', async () => {
    const provider = new OpenAiCompatibleProvider({ baseUrl: mock.url, apiKey: null });
    const events = await collect(provider.streamResponse(request('Tudo bem?', 'llama3.2:3b')));
    expect(textOf(events)).toBe('Olá do servidor local! Modelo: llama3.2:3b.');
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'stop' });

    const body = mock.requests.at(-1)?.body;
    expect(body).toMatchObject({
      model: 'llama3.2:3b',
      stream: true,
      max_tokens: 1024,
      temperature: 0.8
    });
    expect((body?.messages as { role: string }[]).map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user'
    ]);
    expect(mock.requests.at(-1)?.headers.authorization).toBeUndefined();
    expect(provider.timeouts).toEqual(LOCAL_SERVER_TIMEOUTS);
  });

  it('api.openai.com: max_completion_tokens, sem temperatura, com a chave', async () => {
    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-teste-1234567890',
      fetch: (input, init) => {
        const url = input instanceof Request ? input.url : input.toString();
        return globalThis.fetch(url.replace('https://api.openai.com/v1', keyed.url), init);
      }
    });
    expect(provider.timeouts).toBeUndefined();
    const events = await collect(provider.streamResponse(request('oi', 'qwen2.5:7b')));
    expect(textOf(events)).toContain('Olá do servidor local!');
    const sent = keyed.requests.at(-1);
    expect(sent?.body).toMatchObject({ max_completion_tokens: 1024 });
    expect(sent?.body).not.toHaveProperty('temperature');
    expect(sent?.body).not.toHaveProperty('max_tokens');
    expect(sent?.headers.authorization).toBe('Bearer sk-teste-1234567890');
  });

  it('servidor que recusa "temperature": tenta de novo uma vez sem ela', async () => {
    const provider = new OpenAiCompatibleProvider({ baseUrl: mock.url, apiKey: null });
    const before = mock.requests.length;
    const events = await collect(
      provider.streamResponse(request('[400-temperature]', 'llama3.2:3b'))
    );
    expect(textOf(events)).toContain('Olá do servidor local!');
    const attempts = mock.requests.slice(before);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.body).not.toHaveProperty('temperature');
  });

  it('modelo pensando antes de responder vira evento "thinking"', async () => {
    const provider = new OpenAiCompatibleProvider({ baseUrl: mock.url, apiKey: null });
    const events = await collect(provider.streamResponse(request('[think]', 'llama3.2:3b')));
    const firstText = events.findIndex((event) => event.type === 'text-delta');
    expect(events.findIndex((event) => event.type === 'thinking')).toBeLessThan(firstText);
  });

  it('erros viram os códigos da SPEC §23', async () => {
    const provider = new OpenAiCompatibleProvider({ baseUrl: mock.url, apiKey: null });
    expect(await errorCode(provider, '[401]', 'llama3.2:3b')).toMatchObject({
      code: 'AUTH_INVALID'
    });
    expect(await errorCode(provider, 'oi', 'nao-existe')).toMatchObject({
      code: 'MODEL_NOT_FOUND'
    });
    expect(await errorCode(provider, '[429]', 'llama3.2:3b')).toEqual({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 2
    });
    expect(await errorCode(provider, '[429-quota]', 'llama3.2:3b')).toMatchObject({
      code: 'QUOTA_OR_BILLING'
    });
    expect(await errorCode(provider, '[503]', 'llama3.2:3b')).toMatchObject({
      code: 'PROVIDER_OVERLOADED'
    });
    expect(await errorCode(provider, '[400-context]', 'llama3.2:3b')).toMatchObject({
      code: 'CONTEXT_TOO_LONG'
    });
    expect(await errorCode(provider, '[drop]', 'llama3.2:3b')).toMatchObject({ code: 'OFFLINE' });
    expect(await errorCode(provider, '[midstream-error]', 'llama3.2:3b')).toMatchObject({
      code: 'UNKNOWN'
    });
    const keyless = new OpenAiCompatibleProvider({ baseUrl: keyed.url, apiKey: null });
    expect(await errorCode(keyless, 'oi', 'llama3.2:3b')).toMatchObject({ code: 'AUTH_INVALID' });
  });

  it('servidor desligado → OFFLINE', async () => {
    const port = await closedPort();
    const provider = new OpenAiCompatibleProvider({
      baseUrl: `http://127.0.0.1:${port.toString()}/v1`,
      apiKey: null
    });
    expect(await errorCode(provider, 'oi', 'llama3.2:3b')).toMatchObject({ code: 'OFFLINE' });
    expect(await provider.testConnection(new AbortController().signal)).toMatchObject({
      status: 'error',
      code: 'OFFLINE'
    });
  });

  it('Parar: o abort interrompe a leitura', async () => {
    const provider = new OpenAiCompatibleProvider({ baseUrl: mock.url, apiKey: null });
    const controller = new AbortController();
    const pending = collect(
      provider.streamResponse(request('[stall]', 'llama3.2:3b', controller.signal))
    );
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('lista de modelos e testar conexão', async () => {
    const provider = new OpenAiCompatibleProvider({ baseUrl: `${mock.url}/`, apiKey: null });
    const signal = new AbortController().signal;
    expect((await provider.listModels(signal)).map((model) => model.id)).toEqual([
      'llama3.2:3b',
      'qwen2.5:7b'
    ]);
    expect(await provider.testConnection(signal)).toEqual({ status: 'connected', modelCount: 2 });
    // Endereço sem /v1: o servidor responde, mas não como servidor compatível.
    const wrong = new OpenAiCompatibleProvider({
      baseUrl: mock.url.replace('/v1', ''),
      apiKey: null
    });
    expect(await wrong.testConnection(signal)).toMatchObject({
      status: 'error',
      code: 'NOT_COMPATIBLE'
    });
  });
});

describe('ferramentas nos providers reais (SPEC §22)', () => {
  let openai: MockServer;
  let anthropic: MockServer;
  const KEY = 'sk-ant-teste-1234567890';

  beforeAll(async () => {
    openai = await startOpenAiCompatibleMock({ chunkDelayMs: 1 });
    anthropic = await startAnthropicMock({ chunkDelayMs: 1, apiKey: KEY });
  });
  afterAll(async () => {
    await openai.close();
    await anthropic.close();
  });

  it('compatível com OpenAI: tools no formato function, tool_calls em pedaços, continuação com role "tool"', async () => {
    const provider = new OpenAiCompatibleProvider({ baseUrl: openai.url, apiKey: null });
    const { calls, done, second } = await toolRoundTrip(
      provider,
      'liste [tool:demoReadAction {"folder":"Fotos"}]',
      'llama3.2:3b'
    );
    expect(calls).toEqual([
      { id: 'call_mock1', name: 'demoReadAction', input: { folder: 'Fotos' } }
    ]);
    expect(done).toEqual({ type: 'done', stopReason: 'tool_calls' });
    expect(textOf(second)).toBe('Resultado: {"time":"08:38"}');

    const firstBody = openai.requests.at(-2)?.body;
    expect(firstBody?.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'getCurrentTime',
          description: 'Data e hora.',
          parameters: { type: 'object', properties: {} }
        }
      },
      expect.objectContaining({ type: 'function' })
    ]);
    const messages = openai.requests.at(-1)?.body?.messages as Record<string, unknown>[];
    expect(messages.slice(-2)).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_mock1',
            type: 'function',
            function: { name: 'demoReadAction', arguments: '{"folder":"Fotos"}' }
          }
        ]
      },
      { role: 'tool', tool_call_id: 'call_mock1', content: '{"time":"08:38"}' }
    ]);
  });

  it('compatível com OpenAI: modelo sem suporte a ferramentas → tenta de novo sem elas', async () => {
    const provider = new OpenAiCompatibleProvider({ baseUrl: openai.url, apiKey: null });
    const events = await collect(
      provider.streamResponse({ ...request('[tools-unsupported] oi', 'llama3.2:3b'), tools: TOOLS })
    );
    expect(textOf(events)).toContain('Olá do servidor local!');
    expect(openai.requests.at(-2)?.body).toHaveProperty('tools');
    expect(openai.requests.at(-1)?.body).not.toHaveProperty('tools');
  });

  it('Anthropic: tool_use com JSON em pedaços; a continuação devolve o raciocínio assinado e o tool_result', async () => {
    const provider = new AnthropicProvider({ apiKey: KEY, baseURL: anthropic.url });
    const { first, calls, done, second } = await toolRoundTrip(
      provider,
      '[think-tool] [tool:getCurrentTime]',
      'claude-teste-rapido'
    );
    expect(first[0]?.type).toBe('thinking');
    expect(textOf(first)).toBe('Vou verificar. ');
    expect(calls).toEqual([{ id: 'toolu_mock1', name: 'getCurrentTime', input: {} }]);
    expect(done).toMatchObject({ type: 'done', stopReason: 'tool_use' });
    expect(textOf(second)).toBe('Resultado: {"time":"08:38"}');

    expect(anthropic.requests.at(-2)?.body?.tools).toEqual([
      {
        name: 'getCurrentTime',
        description: 'Data e hora.',
        input_schema: { type: 'object', properties: {} }
      },
      expect.objectContaining({ name: 'demoReadAction' })
    ]);
    const messages = anthropic.requests.at(-1)?.body?.messages as Record<string, unknown>[];
    expect(messages.slice(-2)).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Preciso da ferramenta.', signature: 'sig-mock' },
          { type: 'text', text: 'Vou verificar. ' },
          { type: 'tool_use', id: 'toolu_mock1', name: 'getCurrentTime', input: {} }
        ]
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_mock1', content: '{"time":"08:38"}' }]
      }
    ]);
  });

  it('Anthropic: sem a continuação (raciocínio perdido), a API recusaria; com ela, não', async () => {
    const provider = new AnthropicProvider({ apiKey: KEY, baseURL: anthropic.url });
    const base = {
      ...request('[think-tool] [tool:getCurrentTime]', 'claude-teste-rapido'),
      tools: TOOLS
    };
    const round: ToolRound = {
      text: 'Vou verificar. ',
      calls: [{ id: 'toolu_mock1', name: 'getCurrentTime', input: {} }],
      results: [{ callId: 'toolu_mock1', name: 'getCurrentTime', content: '{}', isError: true }]
    };
    await expect(
      collect(provider.streamResponse({ ...base, toolRounds: [round] }))
    ).rejects.toMatchObject({ code: 'UNKNOWN' });
    const sent = anthropic.requests.at(-1)?.body?.messages as { content: unknown }[];
    expect(sent.at(-1)?.content).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_mock1', content: '{}', is_error: true }
    ]);
  });
});

describe('AnthropicProvider (SDK oficial contra servidor simulado)', () => {
  const KEY = 'sk-ant-teste-1234567890';
  let mock: MockServer;
  const provider = (key = KEY) => new AnthropicProvider({ apiKey: key, baseURL: mock.url });

  beforeAll(async () => {
    mock = await startAnthropicMock({ chunkDelayMs: 1, apiKey: KEY });
  });
  afterAll(async () => {
    await mock.close();
  });

  it('conversa com streaming, sem parâmetros de amostragem, com a chave no cabeçalho', async () => {
    const events = await collect(
      provider().streamResponse(request('Tudo bem?', 'claude-teste-rapido'))
    );
    expect(textOf(events)).toBe('Olá, aqui é o Claude simulado (claude-teste-rapido).');
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'end_turn' });
    const sent = mock.requests.at(-1);
    expect(sent?.path).toBe('/v1/messages');
    expect(sent?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(sent?.headers['anthropic-version']).toEqual(expect.any(String));
    expect(sent?.body).toMatchObject({
      model: 'claude-teste-rapido',
      max_tokens: 1024,
      system: 'Você é o Clipster.',
      stream: true
    });
    expect(sent?.body).not.toHaveProperty('temperature');
  });

  it('pensamento antes do texto vira "thinking"', async () => {
    const events = await collect(
      provider().streamResponse(request('[think]', 'claude-teste-rapido'))
    );
    expect(events[0]?.type).toBe('thinking');
    expect(textOf(events)).toContain('Claude simulado');
  });

  it('erros viram os códigos da SPEC §23', async () => {
    const model = 'claude-teste-rapido';
    expect(await errorCode(provider('sk-ant-errada-1234567890'), 'oi', model)).toMatchObject({
      code: 'AUTH_INVALID'
    });
    expect(await errorCode(provider(), '[402]', model)).toMatchObject({ code: 'QUOTA_OR_BILLING' });
    expect(await errorCode(provider(), 'oi', 'claude-aposentado')).toMatchObject({
      code: 'MODEL_NOT_FOUND'
    });
    expect(await errorCode(provider(), '[400-context]', model)).toMatchObject({
      code: 'CONTEXT_TOO_LONG'
    });
    expect(await errorCode(provider(), '[midstream-error]', model)).toMatchObject({
      code: 'PROVIDER_OVERLOADED'
    });
  });

  it('429 com retry-after → RATE_LIMITED; sem retry-after → limite de gasto; 529 → sobrecarga', async () => {
    const model = 'claude-teste-rapido';
    expect(await errorCode(provider(), '[429]', model)).toEqual({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 1
    });
    expect(await errorCode(provider(), '[429-cap]', model)).toMatchObject({
      code: 'QUOTA_OR_BILLING'
    });
    expect(await errorCode(provider(), '[529]', model)).toMatchObject({
      code: 'PROVIDER_OVERLOADED'
    });
  }, 20_000);

  it('servidor fora do ar → OFFLINE', async () => {
    const port = await closedPort();
    const offline = new AnthropicProvider({
      apiKey: KEY,
      baseURL: `http://127.0.0.1:${port.toString()}`
    });
    expect(await errorCode(offline, 'oi', 'claude-teste-rapido')).toMatchObject({
      code: 'OFFLINE'
    });
  }, 20_000);

  it('Parar: o abort interrompe a resposta', async () => {
    const controller = new AbortController();
    const pending = collect(
      provider().streamResponse(request('[stall]', 'claude-teste-rapido', controller.signal))
    );
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(APIUserAbortError);
  });

  it('lista de modelos sem os aposentados, marcando os que vão sair', async () => {
    const models = await provider().listModels(new AbortController().signal);
    expect(models).toEqual([
      { id: 'claude-teste-rapido', name: 'Claude Teste Rápido' },
      { id: 'claude-teste-antigo', name: 'Claude Teste Antigo', deprecated: true }
    ]);
    expect(await provider().testConnection(new AbortController().signal)).toEqual({
      status: 'connected',
      modelCount: 2
    });
    expect(
      await provider('sk-ant-errada-1234567890').testConnection(new AbortController().signal)
    ).toMatchObject({ status: 'error', code: 'AUTH_INVALID' });
  });
});

describe('painel da conta para o erro de cota (SPEC §23)', () => {
  it('só os providers na nuvem oferecem o painel', () => {
    expect(new AnthropicProvider({ apiKey: 'sk-ant-qualquer-123456' }).consoleUrl).toBe(
      'https://platform.claude.com/'
    );
    expect(
      new OpenAiCompatibleProvider({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-1234567890'
      }).consoleUrl
    ).toBe('https://platform.openai.com/');
    expect(
      new OpenAiCompatibleProvider({ baseUrl: 'http://localhost:11434/v1', apiKey: null })
        .consoleUrl
    ).toBeUndefined();
  });
});
