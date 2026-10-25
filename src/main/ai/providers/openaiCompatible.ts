import type { AiTimeouts } from '../../../shared/constants/ai';
import { ClipsterError, toClipsterError } from '../errors';
import {
  collectResponse,
  type AIProvider,
  type ChatRequest,
  type ChatResponse,
  type ChatStreamEvent,
  type ConnectionStatus,
  type ModelInfo
} from '../types';
import {
  fetchFailureToError,
  httpFailureToError,
  isAbortError,
  normalizeTurns,
  readSse
} from './shared';
import { isLocalUrl, PROVIDER_CONSOLES } from '../../../shared/ai/urls';

/**
 * Provider para servidores compatíveis com a API da OpenAI (SPEC §20.4): Ollama, LM Studio,
 * a própria OpenAI e outros. Usa Chat Completions com streaming (o formato mais suportado),
 * por `fetch` no main, com cancelamento por `AbortSignal`.
 *
 * Diferenças tratadas:
 * - api.openai.com: `max_completion_tokens` e sem `temperature` (os modelos de raciocínio
 *   recusam `max_tokens` e `temperature`);
 * - outros servidores: `max_tokens` e `temperature`;
 * - se o servidor recusar um desses parâmetros (400), tenta de novo uma vez sem ele.
 */

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  apiKey: string | null;
  fetch?: typeof fetch;
}

/** Modelos locais podem levar mais de 30 s para carregar na primeira pergunta. */
export const LOCAL_SERVER_TIMEOUTS: AiTimeouts = { firstTokenMs: 90_000, totalMs: 300_000 };

const UNSUPPORTED_PARAM =
  /(unsupported|not supported|unrecognized|unknown|invalid)[^.]*\b(temperature|max_tokens)\b|\b(temperature|max_tokens)\b[^.]*(unsupported|not supported|not allowed|deprecated)/i;

interface ChatChunk {
  choices?: {
    delta?: { content?: unknown; reasoning?: unknown; reasoning_content?: unknown };
    finish_reason?: unknown;
  }[];
  error?: unknown;
}

function isOpenAiHost(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === 'api.openai.com';
  } catch {
    return false;
  }
}

export class OpenAiCompatibleProvider implements AIProvider {
  readonly id = 'openai-compatible' as const;
  readonly capabilities = { streaming: true, cancel: true, tools: false, listModels: true };
  readonly timeouts?: AiTimeouts;
  readonly consoleUrl?: string;
  private readonly fetch: typeof fetch;
  private readonly base: string;

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.base = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`;
    if (isLocalUrl(options.baseUrl)) this.timeouts = LOCAL_SERVER_TIMEOUTS;
    if (isOpenAiHost(options.baseUrl)) this.consoleUrl = PROVIDER_CONSOLES.openai;
  }

  async *streamResponse(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const official = isOpenAiHost(this.options.baseUrl);
    let sendTemperature = !official && request.temperature !== undefined;
    let tokenField: 'max_tokens' | 'max_completion_tokens' = official
      ? 'max_completion_tokens'
      : 'max_tokens';
    const body = (): Record<string, unknown> => ({
      model: request.model,
      stream: true,
      messages: [{ role: 'system', content: request.system }, ...normalizeTurns(request.messages)],
      [tokenField]: request.maxOutputTokens,
      ...(sendTemperature ? { temperature: request.temperature } : {})
    });

    let response = await this.post('chat/completions', body(), request.signal);
    if (response.status === 400) {
      const text = await response.text();
      const match = UNSUPPORTED_PARAM.exec(text);
      if (match === null) throw this.httpError(response, text);
      // Servidor recusou um parâmetro opcional: tenta uma vez sem ele (ou com o outro nome).
      if (/temperature/i.test(match[0])) sendTemperature = false;
      if (/max_tokens/i.test(match[0])) tokenField = 'max_completion_tokens';
      response = await this.post('chat/completions', body(), request.signal);
    }
    if (!response.ok) throw this.httpError(response, await response.text());
    if (response.body === null) throw new ClipsterError('UNKNOWN', 'Resposta sem corpo.');

    let stopReason: string | undefined;
    try {
      for await (const message of readSse(response.body)) {
        if (message.data === '[DONE]') break;
        let chunk: ChatChunk;
        try {
          chunk = JSON.parse(message.data) as ChatChunk; // conferido campo a campo abaixo
        } catch {
          continue;
        }
        if (chunk.error !== undefined) {
          throw httpFailureToError({
            status: 500,
            retryAfter: null,
            body: JSON.stringify({ error: chunk.error })
          });
        }
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        if (typeof delta?.content === 'string' && delta.content !== '') {
          yield { type: 'text-delta', text: delta.content };
        } else if (
          (typeof delta?.reasoning === 'string' && delta.reasoning !== '') ||
          (typeof delta?.reasoning_content === 'string' && delta.reasoning_content !== '')
        ) {
          yield { type: 'thinking' };
        }
        if (typeof choice?.finish_reason === 'string') stopReason = choice.finish_reason;
      }
    } catch (error) {
      if (error instanceof ClipsterError || isAbortError(error)) throw error;
      // Conexão caiu no meio da resposta.
      const mapped = fetchFailureToError(error);
      throw mapped instanceof ClipsterError
        ? mapped
        : new ClipsterError('OFFLINE', 'A conexão caiu no meio da resposta.', { cause: error });
    }
    yield stopReason === undefined ? { type: 'done' } : { type: 'done', stopReason };
  }

  generateResponse(request: ChatRequest): Promise<ChatResponse> {
    return collectResponse(this.streamResponse(request));
  }

  async listModels(signal: AbortSignal): Promise<ModelInfo[]> {
    let response: Response;
    try {
      response = await this.fetch(new URL('models', this.base), {
        method: 'GET',
        headers: this.headers(false),
        signal
      });
    } catch (error) {
      throw toClipsterError(fetchFailureToError(error));
    }
    const text = await response.text();
    if (!response.ok) throw this.httpError(response, text);
    let ids: string[] = [];
    try {
      const parsed = JSON.parse(text) as { data?: unknown }; // formato OpenAI: { data: [{ id }] }
      if (Array.isArray(parsed.data)) {
        ids = parsed.data
          .map((item: unknown) =>
            typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'string'
              ? item.id
              : null
          )
          .filter((id): id is string => id !== null);
      }
    } catch {
      throw new ClipsterError('UNKNOWN', 'Lista de modelos ilegível.');
    }
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b)).map((id) => ({ id, name: id }));
  }

  async testConnection(signal: AbortSignal): Promise<ConnectionStatus> {
    try {
      const models = await this.listModels(signal);
      return { status: 'connected', modelCount: models.length };
    } catch (error) {
      const mapped = toClipsterError(error);
      // Respondeu, mas sem /models: provavelmente o endereço não é de um servidor compatível.
      if (mapped.message.startsWith('HTTP 404') || mapped.message.startsWith('Lista de modelos')) {
        return { status: 'error', code: 'NOT_COMPATIBLE', detail: mapped.message };
      }
      return {
        status: 'error',
        code: mapped.code === 'CANCELLED' ? 'TIMEOUT' : mapped.code,
        detail: mapped.message
      };
    }
  }

  private headers(streaming: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: streaming ? 'text/event-stream' : 'application/json'
    };
    if (streaming) headers['Content-Type'] = 'application/json';
    if (this.options.apiKey !== null && this.options.apiKey !== '') {
      headers.Authorization = `Bearer ${this.options.apiKey}`;
    }
    return headers;
  }

  private async post(path: string, body: unknown, signal: AbortSignal): Promise<Response> {
    try {
      return await this.fetch(new URL(path, this.base), {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify(body),
        signal
      });
    } catch (error) {
      throw fetchFailureToError(error);
    }
  }

  private httpError(response: Response, body: string): ClipsterError {
    return httpFailureToError({
      status: response.status,
      retryAfter: response.headers.get('retry-after'),
      body
    });
  }
}
