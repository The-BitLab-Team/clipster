import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError
} from '@anthropic-ai/sdk';
import { PROVIDER_CONSOLES } from '../../../shared/ai/urls';
import { AI_TIMEOUTS } from '../../../shared/constants/ai';
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
import { normalizeTurns, parseRetryAfter } from './shared';

/**
 * Provider da Anthropic (Claude) com o SDK oficial (SPEC §20.4), só no main.
 * - API 2026-10-21 (SDK 1.x): `temperature`, `top_p` e `top_k` são recusados com 400,
 *   então nunca são enviados; a "temperatura" da personalidade é só uma dica (SPEC §7.1).
 * - `maxRetries: 1` (chat interativo) e cancelamento por `AbortSignal`.
 * - Chave e endereço sempre explícitos: o SDK não lê variáveis de ambiente nem perfis do disco.
 * - Nenhum nome de modelo fixo: a lista vem de `models.list()`.
 */

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

export interface AnthropicProviderOptions {
  apiKey: string;
  /** Só muda nos testes E2E (servidor simulado). */
  baseURL?: string;
  fetch?: typeof fetch;
}

/** `instanceof` estreita para `APIError<any…>`; o predicado mantém os tipos padrão do SDK. */
function isApiError(error: unknown): error is APIError {
  return error instanceof APIError;
}

/** Erro do SDK → ClipsterError, pela tabela da SPEC §23. Abortos voltam como estão. */
export function anthropicErrorToClipster(error: unknown, now: Date = new Date()): unknown {
  if (error instanceof APIUserAbortError) return error;
  if (error instanceof ClipsterError) return error;
  if (error instanceof APIConnectionTimeoutError) {
    return new ClipsterError('TIMEOUT', 'Tempo esgotado na conexão.', { cause: error });
  }
  if (error instanceof APIConnectionError) {
    return new ClipsterError('OFFLINE', 'Falha de conexão com a Anthropic.', { cause: error });
  }
  if (!isApiError(error)) return toClipsterError(error);

  const apiError = error;
  const status: number | undefined = apiError.status;
  const headers: Headers | undefined = apiError.headers;
  const type: string = apiError.type ?? '';
  const message = apiError.message;
  const detail =
    `HTTP ${status === undefined ? 'stream' : status.toString()} ${type} req=${apiError.requestID ?? '-'}`.trim();

  if (type === 'overloaded_error' || status === 529 || status === 503) {
    return new ClipsterError('PROVIDER_OVERLOADED', detail);
  }
  if (
    type === 'authentication_error' ||
    type === 'permission_error' ||
    status === 401 ||
    status === 403
  ) {
    return new ClipsterError('AUTH_INVALID', detail);
  }
  if (type === 'billing_error' || status === 402)
    return new ClipsterError('QUOTA_OR_BILLING', detail);
  if (type === 'not_found_error' || status === 404)
    return new ClipsterError('MODEL_NOT_FOUND', detail);
  if (type === 'rate_limit_error' || status === 429) {
    const retryAfterSeconds = parseRetryAfter(headers?.get('retry-after'), now);
    // 429 sem retry-after = teto de gasto do nível de uso; continua falhando até liberar.
    return retryAfterSeconds === undefined
      ? new ClipsterError('QUOTA_OR_BILLING', detail)
      : new ClipsterError('RATE_LIMITED', detail, { retryAfterSeconds });
  }
  if (type === 'timeout_error' || status === 504) return new ClipsterError('TIMEOUT', detail);
  if (type === 'invalid_request_error' || status === 400 || status === 413) {
    if (/prompt is too long|too many tokens|context (?:window|length)|exceeds/i.test(message)) {
      return new ClipsterError('CONTEXT_TOO_LONG', detail);
    }
    if (/credit balance|spend limit|billing|usage limit/i.test(message)) {
      return new ClipsterError('QUOTA_OR_BILLING', detail);
    }
    if (status === 413) return new ClipsterError('CONTEXT_TOO_LONG', detail);
  }
  return new ClipsterError('UNKNOWN', detail);
}

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic' as const;
  readonly capabilities = { streaming: true, cancel: true, tools: false, listModels: true };
  readonly consoleUrl = PROVIDER_CONSOLES.anthropic;
  private readonly client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.baseURL ?? ANTHROPIC_BASE_URL,
      maxRetries: 1,
      timeout: AI_TIMEOUTS.totalMs,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch })
    });
  }

  async *streamResponse(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    let stopReason: string | undefined;
    try {
      const stream = await this.client.messages.create(
        {
          model: request.model,
          max_tokens: request.maxOutputTokens,
          system: request.system,
          messages: normalizeTurns(request.messages).map((turn) =>
            turn.role === 'user'
              ? { role: 'user' as const, content: turn.content }
              : { role: 'assistant' as const, content: turn.content }
          ),
          stream: true
        },
        { signal: request.signal }
      );
      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              if (event.delta.text !== '') yield { type: 'text-delta', text: event.delta.text };
            } else if (event.delta.type === 'thinking_delta') {
              yield { type: 'thinking' };
            }
            break;
          case 'content_block_start':
            if (event.content_block.type === 'thinking') yield { type: 'thinking' };
            break;
          case 'message_delta':
            if (event.delta.stop_reason !== null) stopReason = event.delta.stop_reason;
            break;
          default:
            // message_start, content_block_stop, message_stop e eventos novos: nada a fazer.
            break;
        }
      }
    } catch (error) {
      throw anthropicErrorToClipster(error);
    }
    yield stopReason === undefined ? { type: 'done' } : { type: 'done', stopReason };
  }

  generateResponse(request: ChatRequest): Promise<ChatResponse> {
    return collectResponse(this.streamResponse(request));
  }

  async listModels(signal: AbortSignal): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];
    try {
      for await (const model of this.client.models.list({ limit: 100 }, { signal })) {
        if (model.lifecycle === 'retired') continue;
        models.push({
          id: model.id,
          name: model.display_name === '' ? model.id : model.display_name,
          ...(model.lifecycle === 'deprecated' ? { deprecated: true } : {})
        });
      }
    } catch (error) {
      throw toClipsterError(anthropicErrorToClipster(error));
    }
    return models;
  }

  async testConnection(signal: AbortSignal): Promise<ConnectionStatus> {
    try {
      const models = await this.listModels(signal);
      return { status: 'connected', modelCount: models.length };
    } catch (error) {
      const mapped = toClipsterError(error);
      return {
        status: 'error',
        code: mapped.code === 'CANCELLED' ? 'TIMEOUT' : mapped.code,
        detail: mapped.message
      };
    }
  }
}
