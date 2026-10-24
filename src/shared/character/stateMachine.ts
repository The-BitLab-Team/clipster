import { CHARACTER_TIMINGS, type CharacterTimings } from '../constants/ui';
import type { CharacterState, CharacterView } from './states';

/**
 * Máquina de estados do personagem (SPEC §6). Função pura: recebe o estado atual e um
 * evento e devolve o próximo estado, o que fazer com o timer de estados transitórios e
 * se o evento conta como interação do usuário. Quem roda os timers é o host no main
 * (`src/main/character/characterStateHost.ts`).
 *
 * Prioridade (SPEC §6.2): error > notification > talking > thinking > listening >
 * transitórios (happy, confused) > sleeping > idle. Eventos de prioridade menor que o
 * estado atual não mudam a pose.
 */

export interface MachineContext {
  /** Balão de conversa aberto: impede dormir. */
  balloonOpen: boolean;
  /** IA gerando resposta: impede dormir. */
  generating: boolean;
  /** Aviso não visto: impede dormir e mostra o indicador. */
  notificationPending: boolean;
  /** Estado forçado pela pré-visualização de desenvolvimento. */
  previewing: boolean;
}

export interface MachineSnapshot {
  state: CharacterState;
  context: MachineContext;
}

export type CharacterEvent =
  | { type: 'APP_READY'; firstRun: boolean }
  | { type: 'CLICK' }
  | { type: 'BALLOON_OPENED' }
  | { type: 'BALLOON_CLOSED' }
  | { type: 'USER_TYPING' }
  | { type: 'MESSAGE_SENT' }
  | { type: 'FIRST_TOKEN' }
  | { type: 'STREAM_DONE' }
  | { type: 'CANCELLED' }
  | { type: 'AI_ERROR' }
  | { type: 'ERROR_DISMISSED' }
  | { type: 'NOTIFICATION' }
  | { type: 'NOTIFICATION_DISMISSED' }
  | { type: 'INACTIVITY_TIMEOUT' }
  | { type: 'SUCCESS_FEEDBACK' }
  | { type: 'DRAG_START' }
  | { type: 'DRAG_END' }
  | { type: 'TRANSIENT_ELAPSED' }
  | { type: 'PREVIEW'; state: CharacterState };

export type CharacterEventType = CharacterEvent['type'];

/** O que fazer com o timer de estado transitório depois da transição. */
export type TimerCommand = { kind: 'schedule'; ms: number } | { kind: 'cancel' } | { kind: 'keep' };

export interface TransitionResult {
  snapshot: MachineSnapshot;
  timer: TimerCommand;
  /** O evento foi uma interação do usuário: reinicia a contagem para dormir. */
  userActivity: boolean;
}

export const INITIAL_SNAPSHOT: MachineSnapshot = {
  state: 'idle',
  context: { balloonOpen: false, generating: false, notificationPending: false, previewing: false }
};

const USER_EVENTS: ReadonlySet<CharacterEventType> = new Set<CharacterEventType>([
  'APP_READY',
  'CLICK',
  'BALLOON_OPENED',
  'BALLOON_CLOSED',
  'USER_TYPING',
  'MESSAGE_SENT',
  'CANCELLED',
  'ERROR_DISMISSED',
  'NOTIFICATION_DISMISSED',
  'SUCCESS_FEEDBACK',
  'DRAG_START',
  'DRAG_END',
  'PREVIEW'
]);

/** Estados que voltam sozinhos para `idle` quando o timer transitório termina. */
const SELF_ENDING: ReadonlySet<CharacterState> = new Set<CharacterState>([
  'happy',
  'confused',
  'listening',
  'error',
  'notification'
]);

const BUSY: ReadonlySet<CharacterState> = new Set<CharacterState>(['thinking', 'talking']);

/** Estados "baixos", que uma reação leve (feliz, ouvindo, aviso) pode substituir. */
const CALM: ReadonlySet<CharacterState> = new Set<CharacterState>([
  'idle',
  'happy',
  'confused',
  'listening',
  'sleeping'
]);

export function canSleep(snapshot: MachineSnapshot): boolean {
  const { context } = snapshot;
  return (
    snapshot.state === 'idle' &&
    !context.balloonOpen &&
    !context.generating &&
    !context.notificationPending
  );
}

export function toView(snapshot: MachineSnapshot): CharacterView {
  return { state: snapshot.state, badge: snapshot.context.notificationPending };
}

export function transition(
  current: MachineSnapshot,
  event: CharacterEvent,
  timings: CharacterTimings = CHARACTER_TIMINGS
): TransitionResult {
  // A pré-visualização não é um estado real: qualquer evento real a descarta e é tratado
  // a partir de `idle`. Só o timer dela e uma nova prévia não a encerram.
  const endsPreview =
    current.context.previewing && event.type !== 'TRANSIENT_ELAPSED' && event.type !== 'PREVIEW';
  if (!endsPreview) return step(current, event, timings);
  const result = step(
    { state: 'idle', context: { ...current.context, previewing: false } },
    event,
    timings
  );
  // O timer pendente era o da prévia: não serve mais.
  return result.timer.kind === 'keep' ? { ...result, timer: { kind: 'cancel' } } : result;
}

function step(
  current: MachineSnapshot,
  event: CharacterEvent,
  timings: CharacterTimings
): TransitionResult {
  const userActivity = USER_EVENTS.has(event.type);
  let context: MachineContext = current.context;
  const state = current.state;

  const stay = (): TransitionResult => ({
    snapshot: { state, context },
    timer: { kind: 'keep' },
    userActivity
  });
  const go = (next: CharacterState, transientMs?: number): TransitionResult => ({
    snapshot: { state: next, context },
    timer: transientMs === undefined ? { kind: 'cancel' } : { kind: 'schedule', ms: transientMs },
    userActivity
  });

  switch (event.type) {
    case 'APP_READY':
      return event.firstRun ? go('happy', timings.happyMs) : go('idle');

    case 'CLICK':
      if (state === 'sleeping') return go('confused', timings.confusedMs);
      if (state === 'error') return go('idle');
      if (state === 'notification') {
        context = { ...context, notificationPending: false };
        return go('idle');
      }
      return stay();

    case 'BALLOON_OPENED':
      context = { ...context, balloonOpen: true };
      return state === 'sleeping' ? go('confused', timings.confusedMs) : stay();

    case 'BALLOON_CLOSED':
      context = { ...context, balloonOpen: false };
      return stay();

    case 'USER_TYPING':
      return CALM.has(state) ? go('listening', timings.listeningMs) : stay();

    case 'MESSAGE_SENT':
      // Uma nova pergunta do usuário tem precedência sobre qualquer pose anterior.
      context = { ...context, generating: true };
      return go('thinking');

    case 'FIRST_TOKEN':
      return state === 'thinking' ? go('talking') : stay();

    case 'STREAM_DONE':
    case 'CANCELLED':
      context = { ...context, generating: false };
      return BUSY.has(state) ? go('idle') : stay();

    case 'AI_ERROR':
      context = { ...context, generating: false };
      return go('error', timings.errorMs);

    case 'ERROR_DISMISSED':
      return state === 'error' ? go('idle') : stay();

    case 'NOTIFICATION':
      context = { ...context, notificationPending: true };
      return CALM.has(state) ? go('notification', timings.notificationMs) : stay();

    case 'NOTIFICATION_DISMISSED':
      context = { ...context, notificationPending: false };
      return state === 'notification' ? go('idle') : stay();

    case 'INACTIVITY_TIMEOUT':
      return canSleep({ state, context }) ? go('sleeping') : stay();

    case 'SUCCESS_FEEDBACK':
      return CALM.has(state) ? go('happy', timings.happyMs) : stay();

    case 'DRAG_START':
      return BUSY.has(state) || state === 'error' ? stay() : go('dragging');

    case 'DRAG_END':
      return state === 'dragging' ? go('idle') : stay();

    case 'TRANSIENT_ELAPSED':
      if (current.context.previewing) {
        context = { ...context, previewing: false };
        return go('idle');
      }
      // A notificação some da pose, mas o indicador continua até ser vista.
      return SELF_ENDING.has(state) ? go('idle') : stay();

    case 'PREVIEW':
      context = { ...context, previewing: true };
      return go(event.state, timings.previewMs);
  }
}
