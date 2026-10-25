import type { DisplayedErrorCode } from '../errors/codes';

/**
 * Conversa (SPEC §8, §13, §20.1). Vive no main (`AssistantService`); o balão recebe uma
 * cópia e as mudanças por `chat:event`. Mensagens de ferramenta (`tool`) chegam na Fase 5.
 */

export type MessageRole = 'user' | 'assistant';

/**
 * - `streaming`: resposta sendo escrita;
 * - `complete`: terminou normalmente;
 * - `interrupted`: o usuário clicou em Parar (o texto parcial é mantido);
 * - `error`: falhou; `error` diz o motivo.
 */
export type MessageStatus = 'streaming' | 'complete' | 'interrupted' | 'error';

export interface ChatErrorInfo {
  code: DisplayedErrorCode;
  /** Para RATE_LIMITED: segundos até poder tentar de novo. */
  retryAfterSeconds?: number;
  /** Código curto para suporte (ex.: CLP-3F2A), também registrado no log. */
  supportCode?: string;
  /** Para QUOTA_OR_BILLING: painel da conta no provider (só endereços conhecidos, ver `PROVIDER_CONSOLES`). */
  consoleUrl?: string;
}

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** ISO 8601. */
  createdAt: string;
  status: MessageStatus;
  error?: ChatErrorInfo;
}

export interface ConversationSnapshot {
  id: string;
  messages: ConversationMessage[];
  /** Requisição em andamento, se houver (uma por vez). */
  activeRequestId: string | null;
}

/** Eventos `chat:event` (main → balão). */
export type ChatEvent =
  /** Mensagens novas ou atualizadas (pergunta do usuário + resposta vazia em `streaming`). */
  | { type: 'start'; requestId: string; messages: ConversationMessage[] }
  /** Pedaço de texto da resposta, agrupado a cada ~40 ms. */
  | { type: 'delta'; requestId: string; messageId: string; text: string }
  | { type: 'done'; requestId: string; message: ConversationMessage }
  | { type: 'cancelled'; requestId: string; message: ConversationMessage }
  | { type: 'error'; requestId: string; message: ConversationMessage }
  /** A conversa foi trocada inteira (nova conversa, histórico apagado, nova tentativa). */
  | { type: 'reset'; conversation: ConversationSnapshot };
