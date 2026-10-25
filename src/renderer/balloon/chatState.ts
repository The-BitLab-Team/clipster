import type {
  ChatEvent,
  ConversationMessage,
  ConversationSnapshot
} from '../../shared/ai/conversation';
import type { PermissionPrompt, ToolActivity } from '../../shared/tools/types';

/**
 * Estado da conversa dentro do balão: uma cópia do que está no main, atualizada pelos
 * eventos `chat:event`, mais avisos locais do personagem ("Modo Espirituoso ativado",
 * "acordei"), que não vão para a IA. Funções puras, sem DOM, testadas em unidade.
 */

export interface Notice {
  id: string;
  text: string;
  /** Aparece depois desta mensagem; `null` = antes de todas. */
  afterMessageId: string | null;
}

export interface ChatState {
  conversationId: string;
  messages: ConversationMessage[];
  activeRequestId: string | null;
  notices: Notice[];
}

export type TimelineItem =
  { kind: 'message'; message: ConversationMessage } | { kind: 'notice'; notice: Notice };

export const EMPTY_CHAT: ChatState = {
  conversationId: '',
  messages: [],
  activeRequestId: null,
  notices: []
};

export function fromSnapshot(snapshot: ConversationSnapshot): ChatState {
  return {
    conversationId: snapshot.id,
    messages: snapshot.messages,
    activeRequestId: snapshot.activeRequestId,
    notices: []
  };
}

function upsert(messages: ConversationMessage[], message: ConversationMessage) {
  const index = messages.findIndex((item) => item.id === message.id);
  if (index === -1) return [...messages, message];
  const next = [...messages];
  next[index] = message;
  return next;
}

export function applyChatEvent(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case 'reset':
      return fromSnapshot(event.conversation);
    case 'start':
      return {
        ...state,
        messages: event.messages.reduce(upsert, state.messages),
        activeRequestId: event.requestId
      };
    case 'delta': {
      const index = state.messages.findIndex((item) => item.id === event.messageId);
      const current = state.messages[index];
      if (current === undefined) return state;
      const messages = [...state.messages];
      messages[index] = { ...current, content: current.content + event.text };
      return { ...state, messages };
    }
    case 'tool': {
      const index = state.messages.findIndex((item) => item.id === event.messageId);
      const current = state.messages[index];
      if (current === undefined) return state;
      const tools = current.tools ?? [];
      const known = tools.some((item) => item.id === event.activity.id);
      const messages = [...state.messages];
      messages[index] = {
        ...current,
        tools: known
          ? tools.map((item) => (item.id === event.activity.id ? event.activity : item))
          : [...tools, event.activity]
      };
      return { ...state, messages };
    }
    case 'done':
    case 'cancelled':
    case 'error':
      return {
        ...state,
        messages: upsert(state.messages, event.message),
        activeRequestId: state.activeRequestId === event.requestId ? null : state.activeRequestId
      };
  }
}

export function addNotice(state: ChatState, id: string, text: string): ChatState {
  const afterMessageId = state.messages.at(-1)?.id ?? null;
  return { ...state, notices: [...state.notices, { id, text, afterMessageId }] };
}

/** Mensagens na ordem, com os avisos encaixados depois da mensagem em que surgiram. */
export function timeline(state: ChatState): TimelineItem[] {
  const items: TimelineItem[] = [];
  const known = new Set(state.messages.map((message) => message.id));
  const noticesAfter = (id: string | null): void => {
    for (const notice of state.notices) {
      const anchor = notice.afterMessageId !== null && known.has(notice.afterMessageId);
      if ((id === null && !anchor) || (id !== null && notice.afterMessageId === id)) {
        items.push({ kind: 'notice', notice });
      }
    }
  };
  noticesAfter(null);
  for (const message of state.messages) {
    items.push({ kind: 'message', message });
    noticesAfter(message.id);
  }
  return items;
}

/** Última pergunta do usuário (para "Tentar de novo"). */
export function lastUserText(state: ChatState): string | null {
  return state.messages.findLast((message) => message.role === 'user')?.content ?? null;
}

/** Texto para leitores de tela: Markdown sem os símbolos de formatação. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*/g, ''))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_]([^*_]+)[*_]/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

/** Pedido de permissão em aberto (no máximo um por vez: as ferramentas rodam em sequência). */
export function pendingPermission(state: ChatState): {
  messageId: string;
  activity: ToolActivity & { prompt: PermissionPrompt };
} | null {
  for (const message of state.messages) {
    for (const activity of message.tools ?? []) {
      if (activity.status === 'awaiting' && activity.prompt !== undefined) {
        return { messageId: message.id, activity: { ...activity, prompt: activity.prompt } };
      }
    }
  }
  return null;
}
