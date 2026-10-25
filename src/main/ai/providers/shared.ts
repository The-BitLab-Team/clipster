import type { ConversationMessage } from '../../../shared/ai/conversation';
import { ClipsterError } from '../errors';

/** Utilitários comuns aos providers HTTP (SPEC §20.4). Sem Electron, testáveis em unidade. */

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

/** Junta mensagens seguidas do mesmo papel (as APIs esperam alternância). */
export function normalizeTurns(messages: readonly ConversationMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    const previous = turns.at(-1);
    if (previous?.role === message.role) previous.content += `\n\n${message.content}`;
    else turns.push({ role: message.role, content: message.content });
  }
  return turns;
}

/** `retry-after` em segundos (número ou data HTTP). `undefined` se ausente ou inválido. */
export function parseRetryAfter(
  value: string | null | undefined,
  now: Date = new Date()
): number | undefined {
  if (value === null || value === undefined || value.trim() === '') return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds >= 0 ? Math.ceil(seconds) : undefined;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now.getTime()) / 1000));
}

export { isLocalUrl, sendsKeyInsecurely } from '../../../shared/ai/urls';

/** Origem (`https://api.openai.com`) de um endereço; `null` se inválido. */
export function originOf(input: string): string | null {
  try {
    return new URL(input).origin;
  } catch {
    return null;
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === 'AbortError' || error.name === 'APIUserAbortError')
  );
}

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT'
]);

/** Falha de rede do `fetch` (servidor desligado, sem internet, DNS…). */
export function networkErrorCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if ('code' in current && typeof current.code === 'string' && NETWORK_CODES.has(current.code)) {
      return current.code;
    }
    if (current instanceof TypeError && current.message === 'fetch failed') {
      // undici: a causa traz o código (ECONNREFUSED…) quando existe; sem código, ainda é rede.
      const cause: unknown = current.cause;
      if (cause instanceof Error && 'code' in cause && typeof cause.code === 'string') {
        return cause.code;
      }
      return 'FETCH_FAILED';
    }
    current = current.cause;
  }
  return null;
}

export interface HttpFailure {
  status: number;
  retryAfter: string | null;
  /** Corpo da resposta de erro (JSON ou texto), só para classificar. Nunca vai para a tela. */
  body: string;
}

function errorText(body: string): { message: string; code: string; type: string } {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      const error = parsed.error;
      if (typeof error === 'string') return { message: error, code: '', type: '' };
      if (typeof error === 'object' && error !== null) {
        const field = (key: string): string =>
          key in error && typeof (error as Record<string, unknown>)[key] === 'string'
            ? String((error as Record<string, unknown>)[key])
            : '';
        return { message: field('message'), code: field('code'), type: field('type') };
      }
    }
  } catch {
    // Corpo não é JSON: usa o texto.
  }
  return { message: body.slice(0, 500), code: '', type: '' };
}

const CONTEXT_PATTERN =
  /context[_ ]length|context window|maximum context|too many tokens|prompt is too long|reduce the length|exceeds? the (?:model'?s )?(?:context|maximum)/i;
const QUOTA_PATTERN =
  /insufficient_quota|quota|billing|credit balance|spend(?:ing)? limit|payment/i;

/**
 * Converte uma resposta HTTP de erro em ClipsterError, pela tabela da SPEC §23.
 * Vale para servidores compatíveis com OpenAI (OpenAI, Ollama, LM Studio).
 */
export function httpFailureToError(failure: HttpFailure, now: Date = new Date()): ClipsterError {
  const { status } = failure;
  const { message, code, type } = errorText(failure.body);
  const detail =
    `HTTP ${status.toString()}${code === '' ? '' : ` ${code}`}${type === '' ? '' : ` ${type}`}: ${message}`.slice(
      0,
      300
    );
  const retryAfterSeconds = parseRetryAfter(failure.retryAfter, now);

  if (status === 401 || status === 403) return new ClipsterError('AUTH_INVALID', detail);
  if (status === 402) return new ClipsterError('QUOTA_OR_BILLING', detail);
  if (status === 404) {
    return /model/i.test(message)
      ? new ClipsterError('MODEL_NOT_FOUND', detail)
      : new ClipsterError('UNKNOWN', detail);
  }
  if (status === 429) {
    if (code === 'insufficient_quota' || QUOTA_PATTERN.test(`${code} ${type} ${message}`)) {
      return new ClipsterError('QUOTA_OR_BILLING', detail);
    }
    if (retryAfterSeconds !== undefined) {
      return new ClipsterError('RATE_LIMITED', detail, { retryAfterSeconds });
    }
    // 429 sem retry-after: limite de gasto da conta (SPEC §23), salvo se o servidor disser "rate limit".
    return /rate.?limit/i.test(`${code} ${type} ${message}`)
      ? new ClipsterError('RATE_LIMITED', detail)
      : new ClipsterError('QUOTA_OR_BILLING', detail);
  }
  if (status === 400 || status === 413 || status === 422) {
    if (code === 'context_length_exceeded' || CONTEXT_PATTERN.test(message)) {
      return new ClipsterError('CONTEXT_TOO_LONG', detail);
    }
    if (QUOTA_PATTERN.test(`${code} ${type} ${message}`)) {
      return new ClipsterError('QUOTA_OR_BILLING', detail);
    }
    return new ClipsterError('UNKNOWN', detail);
  }
  if (status === 503 || status === 529) return new ClipsterError('PROVIDER_OVERLOADED', detail);
  if (status === 504 || status === 408) return new ClipsterError('TIMEOUT', detail);
  if (status === 502) return new ClipsterError('OFFLINE', detail);
  return new ClipsterError('UNKNOWN', detail);
}

/** Erro de rede/tempo de `fetch` → ClipsterError; abortos voltam como estão. */
export function fetchFailureToError(error: unknown): unknown {
  if (isAbortError(error)) return error;
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new ClipsterError('TIMEOUT', 'Tempo esgotado na conexão.', { cause: error });
  }
  const network = networkErrorCode(error);
  if (network !== null) {
    return new ClipsterError('OFFLINE', `Falha de rede: ${network}`, { cause: error });
  }
  return error;
}

export interface SseMessage {
  event: string | null;
  data: string;
}

/**
 * Leitor de Server-Sent Events: divide o fluxo em mensagens (`event:` + `data:`),
 * aceitando `\n` ou `\r\n` e várias linhas `data:`.
 */
export async function* readSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = '';
  let event: string | null = null;
  let data: string[] = [];
  const flush = (): SseMessage | null => {
    if (data.length === 0) {
      event = null;
      return null;
    }
    const message: SseMessage = { event, data: data.join('\n') };
    event = null;
    data = [];
    return message;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline = buffer.search(/\r?\n/);
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(buffer[newline] === '\r' ? newline + 2 : newline + 1);
        if (line === '') {
          const message = flush();
          if (message !== null) yield message;
        } else if (!line.startsWith(':')) {
          const colon = line.indexOf(':');
          const field = colon === -1 ? line : line.slice(0, colon);
          const raw = colon === -1 ? '' : line.slice(colon + 1);
          const valueText = raw.startsWith(' ') ? raw.slice(1) : raw;
          if (field === 'data') data.push(valueText);
          else if (field === 'event') event = valueText;
        }
        newline = buffer.search(/\r?\n/);
      }
      if (done) {
        if (buffer !== '') {
          // Última linha sem quebra: trata como se tivesse.
          if (buffer.startsWith('data:')) data.push(buffer.slice(5).trimStart());
          buffer = '';
        }
        const message = flush();
        if (message !== null) yield message;
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Argumentos de uma chamada de ferramenta, vindos como texto JSON do provider. Vazio = `{}`.
 * JSON inválido volta como o próprio texto: a validação da ferramenta recusa e avisa o modelo.
 */
export function parseToolInput(json: string): unknown {
  if (json.trim() === '') return {};
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return json;
  }
}
