import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Servidores HTTP locais que imitam os protocolos documentados (SPEC §29):
 * - compatível com OpenAI (Chat Completions com SSE, `GET /models`), como Ollama e LM Studio;
 * - Anthropic Messages API (eventos `message_start` … `message_stop`, erros no formato oficial).
 *
 * O comportamento sai de marcadores na última mensagem do usuário, ex.: "[401]", "[529]",
 * "[stall]". Usados nos testes unitários e E2E; nunca fazem parte do app.
 */

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown> | null;
}

export interface MockServer {
  /** Ex.: http://127.0.0.1:43123/v1 (compatível com OpenAI) ou http://127.0.0.1:43123 (Anthropic). */
  url: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
}

export interface MockOptions {
  /** Se definido, exige `Authorization: Bearer <chave>`. */
  apiKey?: string;
  /** Atraso entre pedaços da resposta, em ms. */
  chunkDelayMs?: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

async function readBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (text === '') return null;
  try {
    return JSON.parse(text) as Record<string, unknown>; // corpo enviado pelo próprio teste
  } catch {
    return null;
  }
}

function lastUserText(body: Record<string, unknown> | null): string {
  const messages = body?.messages;
  if (!Array.isArray(messages)) return '';
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message: unknown = messages[index];
    if (
      typeof message === 'object' &&
      message !== null &&
      'role' in message &&
      message.role === 'user' &&
      'content' in message &&
      typeof message.content === 'string'
    ) {
      return message.content;
    }
  }
  return '';
}

function words(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

async function listen(server: Server, prefix: string): Promise<string> {
  await new Promise<void>((resolveListen) => {
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const { port } = server.address() as AddressInfo; // servidor TCP: sempre AddressInfo
  return `http://127.0.0.1:${port.toString()}${prefix}`;
}

function closer(server: Server): () => Promise<void> {
  return () =>
    new Promise((resolveClose) => {
      server.closeAllConnections();
      server.close(() => {
        resolveClose();
      });
    });
}

// ───────────────────────── compatível com OpenAI ─────────────────────────

export const OPENAI_MOCK_MODELS = ['llama3.2:3b', 'qwen2.5:7b'];

export async function startOpenAiCompatibleMock(options: MockOptions = {}): Promise<MockServer> {
  const requests: RecordedRequest[] = [];
  const delay = options.chunkDelayMs ?? 5;

  const server = createServer((request, response) => {
    void (async () => {
      const body = await readBody(request);
      const path = request.url ?? '/';
      requests.push({ method: request.method ?? '', path, headers: request.headers, body });

      const openAiError = (
        status: number,
        message: string,
        extra: Record<string, unknown> = {},
        headers: Record<string, string> = {}
      ) => {
        json(
          response,
          status,
          { error: { message, type: 'invalid_request_error', ...extra } },
          headers
        );
      };

      if (
        options.apiKey !== undefined &&
        request.headers.authorization !== `Bearer ${options.apiKey}`
      ) {
        openAiError(401, 'Incorrect API key provided.', { code: 'invalid_api_key' });
        return;
      }
      if (request.method === 'GET' && path === '/v1/models') {
        json(response, 200, {
          object: 'list',
          data: OPENAI_MOCK_MODELS.map((id) => ({ id, object: 'model', owned_by: 'library' }))
        });
        return;
      }
      if (request.method !== 'POST' || path !== '/v1/chat/completions') {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('404 page not found');
        return;
      }

      const text = lastUserText(body);
      const model = typeof body?.model === 'string' ? body.model : '?';
      if (text.includes('[401]')) {
        openAiError(401, 'Invalid API key.');
        return;
      }
      if (text.includes('[404-model]') || !OPENAI_MOCK_MODELS.includes(model)) {
        openAiError(404, `model "${model}" not found, try pulling it first`);
        return;
      }
      if (text.includes('[429-quota]')) {
        openAiError(429, 'You exceeded your current quota.', { code: 'insufficient_quota' });
        return;
      }
      if (text.includes('[429]')) {
        openAiError(
          429,
          'Rate limit reached.',
          { code: 'rate_limit_exceeded' },
          { 'retry-after': '2' }
        );
        return;
      }
      if (text.includes('[503]')) {
        openAiError(503, 'Service unavailable');
        return;
      }
      if (text.includes('[400-context]')) {
        openAiError(400, "This model's maximum context length is 8192 tokens.", {
          code: 'context_length_exceeded'
        });
        return;
      }
      if (text.includes('[400-temperature]') && body?.temperature !== undefined) {
        openAiError(400, "Unsupported parameter: 'temperature' is not supported with this model.");
        return;
      }

      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      const send = (payload: unknown): void => {
        response.write(`data: ${JSON.stringify(payload)}\n\n`);
      };
      const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        created: 1,
        model,
        choices: [{ index: 0, delta, finish_reason: finish }]
      });

      if (text.includes('[stall]')) {
        // Nunca responde: só termina quando o cliente desiste.
        request.on('close', () => response.end());
        return;
      }
      send(chunk({ role: 'assistant', content: '' }));
      if (text.includes('[think]')) {
        send(chunk({ reasoning: 'Hmm, deixe-me pensar.' }));
        await sleep(delay);
      }
      const reply = `Olá do servidor local! Modelo: ${model}.`;
      for (const [index, part] of words(reply).entries()) {
        await sleep(text.includes('[slow]') ? 150 : delay);
        if (response.destroyed) return;
        send(chunk({ content: part }));
        if (text.includes('[drop]') && index === 1) {
          response.socket?.destroy();
          return;
        }
      }
      if (text.includes('[midstream-error]')) {
        send({ error: { message: 'The server had an error while processing your request.' } });
        response.end();
        return;
      }
      send(chunk({}, 'stop'));
      response.write('data: [DONE]\n\n');
      response.end();
    })();
  });

  const url = await listen(server, '/v1');
  return { url, requests, close: closer(server) };
}

// ───────────────────────── Anthropic ─────────────────────────

export const ANTHROPIC_MOCK_MODELS = [
  { id: 'claude-teste-rapido', display_name: 'Claude Teste Rápido', lifecycle: 'active' },
  { id: 'claude-teste-antigo', display_name: 'Claude Teste Antigo', lifecycle: 'deprecated' },
  { id: 'claude-aposentado', display_name: 'Claude Aposentado', lifecycle: 'retired' }
] as const;

export async function startAnthropicMock(options: MockOptions = {}): Promise<MockServer> {
  const requests: RecordedRequest[] = [];
  const delay = options.chunkDelayMs ?? 5;
  let requestCounter = 0;

  const server = createServer((request, response) => {
    void (async () => {
      const body = await readBody(request);
      const path = (request.url ?? '/').split('?')[0] ?? '/';
      requests.push({ method: request.method ?? '', path, headers: request.headers, body });
      requestCounter += 1;
      const requestId = `req_mock${requestCounter.toString()}`;

      const apiError = (
        status: number,
        type: string,
        message: string,
        headers: Record<string, string> = {}
      ) => {
        json(
          response,
          status,
          { type: 'error', error: { type, message }, request_id: requestId },
          { 'request-id': requestId, ...headers }
        );
      };

      if (
        options.apiKey !== undefined &&
        request.headers.authorization !== `Bearer ${options.apiKey}`
      ) {
        apiError(401, 'authentication_error', 'invalid x-api-key');
        return;
      }
      if (request.method === 'GET' && path === '/v1/models') {
        const data = ANTHROPIC_MOCK_MODELS.map((model) => ({
          type: 'model',
          id: model.id,
          display_name: model.display_name,
          created_at: '2026-01-01T00:00:00Z',
          lifecycle: model.lifecycle,
          deprecated_at: model.lifecycle === 'active' ? null : '2026-06-01T00:00:00Z'
        }));
        json(response, 200, {
          data,
          has_more: false,
          first_id: data[0]?.id ?? null,
          last_id: data.at(-1)?.id ?? null
        });
        return;
      }
      if (request.method !== 'POST' || path !== '/v1/messages') {
        apiError(404, 'not_found_error', 'Not found');
        return;
      }

      const text = lastUserText(body);
      const model = typeof body?.model === 'string' ? body.model : '?';
      if (body !== null && ('temperature' in body || 'top_p' in body || 'top_k' in body)) {
        apiError(400, 'invalid_request_error', 'temperature: Extra inputs are not permitted');
        return;
      }
      if (text.includes('[401]')) {
        apiError(401, 'authentication_error', 'invalid x-api-key');
        return;
      }
      if (text.includes('[402]')) {
        apiError(402, 'billing_error', 'Billing issue.');
        return;
      }
      if (
        !ANTHROPIC_MOCK_MODELS.some((item) => item.id === model && item.lifecycle !== 'retired')
      ) {
        apiError(404, 'not_found_error', `model: ${model}`);
        return;
      }
      if (text.includes('[429-cap]')) {
        apiError(429, 'rate_limit_error', 'You have reached your usage tier spend cap.');
        return;
      }
      if (text.includes('[429]')) {
        apiError(429, 'rate_limit_error', 'Rate limited.', { 'retry-after': '1' });
        return;
      }
      if (text.includes('[529]')) {
        apiError(529, 'overloaded_error', 'Overloaded');
        return;
      }
      if (text.includes('[400-context]')) {
        apiError(
          400,
          'invalid_request_error',
          'prompt is too long: 250000 tokens > 200000 maximum'
        );
        return;
      }

      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'request-id': requestId
      });
      const event = (name: string, payload: Record<string, unknown>): void => {
        response.write(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...payload })}\n\n`);
      };
      if (text.includes('[stall]')) {
        request.on('close', () => response.end());
        return;
      }
      event('message_start', {
        message: {
          id: 'msg_mock',
          type: 'message',
          role: 'assistant',
          content: [],
          model,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 1 }
        }
      });
      let index = 0;
      if (text.includes('[think]')) {
        event('content_block_start', { index, content_block: { type: 'thinking', thinking: '' } });
        event('content_block_delta', {
          index,
          delta: { type: 'thinking_delta', thinking: 'Pensando…' }
        });
        event('content_block_stop', { index });
        index += 1;
      }
      event('content_block_start', { index, content_block: { type: 'text', text: '' } });
      event('ping', {});
      const reply = `Olá, aqui é o Claude simulado (${model}).`;
      for (const part of words(reply)) {
        await sleep(delay);
        if (response.destroyed) return;
        event('content_block_delta', { index, delta: { type: 'text_delta', text: part } });
      }
      if (text.includes('[midstream-error]')) {
        event('error', { error: { type: 'overloaded_error', message: 'Overloaded' } });
        response.end();
        return;
      }
      event('content_block_stop', { index });
      event('message_delta', {
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 12 }
      });
      event('message_stop', {});
      response.end();
    })();
  });

  const url = await listen(server, '');
  return { url, requests, close: closer(server) };
}
