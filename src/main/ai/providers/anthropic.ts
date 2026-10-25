import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError
} from '@anthropic-ai/sdk';
import type {
  ContentBlockParam,
  MessageParam,
  Tool,
  ToolResultBlockParam
} from '@anthropic-ai/sdk/resources/messages';
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
  type ModelInfo,
  type ToolDefinition,
  type ToolRound
} from '../types';
import { normalizeTurns, parseRetryAfter, parseToolInput } from './shared';

/**
 * Provider da Anthropic (Claude) com o SDK oficial (SPEC §20.4), só no main.
 * - API 2026-10-21 (SDK 1.x): `temperature`, `top_p` e `top_k` são recusados com 400,
 *   então nunca são enviados; a "temperatura" da personalidade é só uma dica (SPEC §7.1).
 * - `maxRetries: 1` (chat interativo) e cancelamento por `AbortSignal`.
 * - Chave e endereço sempre explícitos: o SDK não lê variáveis de ambiente nem perfis do disco.
 * - Nenhum nome de modelo fixo: a lista vem de `models.list()`.
 * - Ferramentas (SPEC §22): blocos `tool_use` viram `tool-call`; na continuação, o conteúdo
 *   do assistente volta exatamente como veio (inclusive blocos de raciocínio com assinatura,
 *   que a API exige quando há ferramentas) e os resultados vão como `tool_result`.
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
  readonly capabilities = { streaming: true, cancel: true, tools: true, listModels: true };
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
    const blocks = new Map<number, Block>();
    try {
      const stream = await this.client.messages.create(
        {
          model: request.model,
          max_tokens: request.maxOutputTokens,
          system: request.system,
          messages: [
            ...normalizeTurns(request.messages).map((turn): MessageParam => ({
              role: turn.role,
              content: turn.content
            })),
            ...(request.toolRounds ?? []).flatMap(roundMessages)
          ],
          ...(request.tools === undefined || request.tools.length === 0
            ? {}
            : { tools: request.tools.map(toAnthropicTool) }),
          stream: true
        },
        { signal: request.signal }
      );
      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_start': {
            const block = event.content_block;
            if (block.type === 'text') blocks.set(event.index, { type: 'text', text: block.text });
            else if (block.type === 'thinking') {
              blocks.set(event.index, {
                type: 'thinking',
                thinking: block.thinking,
                signature: block.signature
              });
              yield { type: 'thinking' };
            } else if (block.type === 'redacted_thinking') {
              blocks.set(event.index, { type: 'redacted_thinking', data: block.data });
            } else if (block.type === 'tool_use') {
              blocks.set(event.index, {
                type: 'tool_use',
                id: block.id,
                name: block.name,
                json: ''
              });
            }
            break;
          }
          case 'content_block_delta': {
            const block = blocks.get(event.index);
            const delta = event.delta;
            if (delta.type === 'text_delta') {
              if (block?.type === 'text') block.text += delta.text;
              if (delta.text !== '') yield { type: 'text-delta', text: delta.text };
            } else if (delta.type === 'thinking_delta') {
              if (block?.type === 'thinking') block.thinking += delta.thinking;
              yield { type: 'thinking' };
            } else if (delta.type === 'signature_delta') {
              if (block?.type === 'thinking') block.signature = delta.signature;
            } else if (delta.type === 'input_json_delta') {
              if (block?.type === 'tool_use') block.json += delta.partial_json;
            }
            break;
          }
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

    const ordered = [...blocks.entries()].sort(([a], [b]) => a - b).map(([, block]) => block);
    const toolUses = ordered.filter((block) => block.type === 'tool_use');
    for (const block of toolUses) {
      yield {
        type: 'tool-call',
        call: { id: block.id, name: block.name, input: parseToolInput(block.json) }
      };
    }
    const continuation: ContentBlockParam[] | undefined =
      toolUses.length === 0 ? undefined : ordered.map(toParam);
    yield {
      type: 'done',
      ...(stopReason === undefined ? {} : { stopReason }),
      ...(continuation === undefined ? {} : { continuation })
    };
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

/** Bloco de conteúdo sendo montado durante o streaming. */
type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'tool_use'; id: string; name: string; json: string };

function toParam(block: Block): ContentBlockParam {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'thinking':
      return { type: 'thinking', thinking: block.thinking, signature: block.signature };
    case 'redacted_thinking':
      return { type: 'redacted_thinking', data: block.data };
    case 'tool_use':
      return {
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: parseToolInput(block.json)
      };
  }
}

function toAnthropicTool(tool: ToolDefinition): Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { ...tool.inputSchema, type: 'object' }
  };
}

/** Conteúdo guardado por este provider na rodada anterior (ver `ToolRound.continuation`). */
function isContentBlocks(value: unknown): value is ContentBlockParam[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item: unknown) =>
        typeof item === 'object' && item !== null && 'type' in item && typeof item.type === 'string'
    )
  );
}

/** Uma rodada de ferramentas vira: o que o assistente mandou + os resultados (como usuário). */
function roundMessages(round: ToolRound): MessageParam[] {
  const assistant: ContentBlockParam[] = isContentBlocks(round.continuation)
    ? round.continuation
    : [
        ...(round.text === '' ? [] : [{ type: 'text' as const, text: round.text }]),
        ...round.calls.map((call): ContentBlockParam => ({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: call.input ?? {}
        }))
      ];
  const results = round.results.map((result): ToolResultBlockParam => ({
    type: 'tool_result',
    tool_use_id: result.callId,
    content: result.content,
    ...(result.isError ? { is_error: true } : {})
  }));
  return [
    { role: 'assistant', content: assistant },
    { role: 'user', content: results }
  ];
}
