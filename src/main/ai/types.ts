import type { ConversationMessage } from '../../shared/ai/conversation';
import type { Locale } from '../../shared/i18n';
import type { PersonalityId } from '../../shared/schemas/settings';
import type { ConnectionErrorCode, ModelInfo } from '../../shared/ai/providers';
import type { AiTimeouts } from '../../shared/constants/ai';
import type { ClipsterError } from './errors';

/**
 * Abstração de provider de IA (SPEC §20.1). O resto do app não conhece detalhes de
 * Anthropic, OpenAI, Ollama ou do Demo: tudo passa por `AIProvider`.
 */

export type ProviderId = 'demo' | 'anthropic' | 'openai-compatible';

export interface ProviderCapabilities {
  streaming: boolean;
  cancel: boolean;
  tools: boolean;
  listModels: boolean;
}

/**
 * Dicas para o provider de demonstração, que responde por palavra-chave e não lê o prompt.
 * Providers reais ignoram: para eles, tudo isso já está em `system`.
 */
export interface RequestHints {
  personality: PersonalityId;
  uiLocale: Locale;
  platform: NodeJS.Platform;
  timeZone: string;
  now: Date;
}

/** Ferramenta oferecida ao modelo (SPEC §22). `inputSchema` é JSON Schema de um objeto. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
}

/** Chamada de ferramenta pedida pelo modelo. `input` ainda não foi validado. */
export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

/** Resultado devolvido ao modelo. Sempre texto (JSON), tratado por ele como dado. */
export interface ToolResult {
  callId: string;
  name: string;
  content: string;
  isError: boolean;
}

/**
 * Uma rodada de ferramentas dentro da mesma resposta: o que o modelo escreveu, o que pediu e
 * o que voltou. `continuation` é opaco: o provider que o criou sabe usá-lo (ex.: blocos de
 * raciocínio da Anthropic, que precisam voltar exatamente como vieram).
 */
export interface ToolRound {
  text: string;
  calls: readonly ToolCall[];
  results: readonly ToolResult[];
  continuation?: unknown;
}

export interface ChatRequest {
  requestId: string;
  /** Montado pelo ContextBuilder. */
  system: string;
  messages: readonly ConversationMessage[];
  model: string;
  temperature?: number;
  maxOutputTokens: number;
  signal: AbortSignal;
  hints: RequestHints;
  /** Ferramentas oferecidas nesta rodada; ausente = nenhuma (ex.: limite atingido). */
  tools?: readonly ToolDefinition[];
  /** Rodadas anteriores desta mesma resposta, em ordem. */
  toolRounds?: readonly ToolRound[];
}

export type ChatStreamEvent =
  | { type: 'text-delta'; text: string }
  /** O modelo está "pensando" antes de responder: a resposta começou, mas ainda sem texto. */
  | { type: 'thinking' }
  | { type: 'tool-call'; call: ToolCall }
  | {
      type: 'done';
      stopReason?: string;
      usage?: { inputTokens?: number; outputTokens?: number };
      /** Ver `ToolRound.continuation`. */
      continuation?: unknown;
    }
  | { type: 'error'; error: ClipsterError };

export interface ChatResponse {
  text: string;
  stopReason?: string;
}

export type { ModelInfo } from '../../shared/ai/providers';

/** Resultado de "Testar conexão" no main; `detail` vai só para o log. */
export type ConnectionStatus =
  | { status: 'connected'; modelCount: number }
  | { status: 'error'; code: ConnectionErrorCode; detail: string };

export interface AIProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
  /** Tempos-limite próprios (ex.: modelo local carregando na primeira pergunta). */
  readonly timeouts?: AiTimeouts;
  /** Painel da conta, oferecido no erro de cota/cobrança (só providers na nuvem). */
  readonly consoleUrl?: string;
  streamResponse(request: ChatRequest): AsyncIterable<ChatStreamEvent>;
  /** Conveniência: consome o stream inteiro. */
  generateResponse(request: ChatRequest): Promise<ChatResponse>;
  listModels(signal: AbortSignal): Promise<ModelInfo[]>;
  testConnection(signal: AbortSignal): Promise<ConnectionStatus>;
}

/** Implementação padrão de `generateResponse` a partir do stream. */
export async function collectResponse(
  stream: AsyncIterable<ChatStreamEvent>
): Promise<ChatResponse> {
  let text = '';
  for await (const event of stream) {
    if (event.type === 'text-delta') text += event.text;
    else if (event.type === 'error') throw event.error;
    else if (event.type === 'thinking' || event.type === 'tool-call') continue;
    else return event.stopReason === undefined ? { text } : { text, stopReason: event.stopReason };
  }
  return { text };
}
