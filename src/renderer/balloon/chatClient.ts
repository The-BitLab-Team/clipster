import { addNotice, applyChatEvent, EMPTY_CHAT, fromSnapshot, type ChatState } from './chatState';

/**
 * Store externo (para `useSyncExternalStore`) com a conversa do balão. O main é a fonte da
 * verdade: o balão pede (enviar, parar, nova conversa) e recebe o resultado por eventos.
 */

/** Último marco de uma resposta, para o anúncio de leitores de tela (SPEC §14). */
export interface ChatMilestone {
  kind: 'start' | 'done' | 'error' | 'cancelled';
  messageId: string;
  seq: number;
}

export interface ChatSnapshot {
  status: 'loading' | 'ready' | 'error';
  chat: ChatState;
  milestone: ChatMilestone | null;
}

let snapshot: ChatSnapshot = { status: 'loading', chat: EMPTY_CHAT, milestone: null };
let milestoneSeq = 0;
const listeners = new Set<() => void>();
let started = false;
let noticeSeq = 0;

function emit(next: ChatSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function start(): void {
  if (started) return;
  started = true;
  const api = window.clipster;
  // Inscreve antes de consultar. Eventos que chegam antes da resposta já estão nela
  // (o main responde e emite na mesma fila, em ordem), então são descartados.
  api.chat.onEvent((event) => {
    if (snapshot.status !== 'ready') return;
    const chat = applyChatEvent(snapshot.chat, event);
    let { milestone } = snapshot;
    if (event.type === 'start') {
      const reply = event.messages.at(-1);
      if (reply !== undefined)
        milestone = { kind: 'start', messageId: reply.id, seq: ++milestoneSeq };
    } else if (event.type === 'done' || event.type === 'error' || event.type === 'cancelled') {
      milestone = { kind: event.type, messageId: event.message.id, seq: ++milestoneSeq };
    }
    emit({ status: 'ready', chat, milestone });
  });
  void api.chat.getConversation().then((result) => {
    if (!result.ok) {
      api.log.write('error', 'balloon.conversation_failed', { code: result.error.code });
      emit({ status: 'error', chat: EMPTY_CHAT, milestone: null });
      return;
    }
    emit({ status: 'ready', chat: fromSnapshot(result.data), milestone: null });
  });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): ChatSnapshot {
  return snapshot;
}

/** Aviso local do personagem no fio da conversa (não vai para a IA). */
export function pushNotice(text: string): void {
  if (snapshot.status !== 'ready' || text === '') return;
  noticeSeq += 1;
  emit({ ...snapshot, chat: addNotice(snapshot.chat, `notice-${noticeSeq.toString()}`, text) });
}

/** Troca a conversa inteira (resposta de "Nova conversa"). */
export function replaceChat(chat: ChatState): void {
  emit({ status: 'ready', chat, milestone: null });
}
