import { CHARACTER_TIMINGS, type CharacterTimings } from '../../shared/constants/ui';
import type { CharacterView } from '../../shared/character/states';
import {
  canSleep,
  INITIAL_SNAPSHOT,
  toView,
  transition,
  type CharacterEvent,
  type MachineSnapshot
} from '../../shared/character/stateMachine';
import type { Logger } from '../logging/logger';

/**
 * Roda a máquina de estados no main process (SPEC §6.1): guarda o estado, mantém os dois
 * únicos timers (transitório e inatividade) e avisa a janela do personagem quando a pose muda.
 * Não usa polling: só `setTimeout`, reiniciado quando necessário.
 */

export interface Scheduler {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultScheduler: Scheduler = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>); // o handle veio do setTimeout acima
  }
};

export interface CharacterStateHostOptions {
  /** Tempo sem interação até dormir; `null` = nunca. Lido a cada reinício do contador. */
  inactivityMs: () => number | null;
  onView: (view: CharacterView) => void;
  logger: Logger;
  timings?: CharacterTimings;
  scheduler?: Scheduler;
}

export class CharacterStateHost {
  private snapshot: MachineSnapshot = INITIAL_SNAPSHOT;
  private transientHandle: unknown = null;
  private inactivityHandle: unknown = null;
  private disposed = false;
  private readonly scheduler: Scheduler;
  private readonly timings: CharacterTimings;

  constructor(private readonly options: CharacterStateHostOptions) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.timings = options.timings ?? CHARACTER_TIMINGS;
  }

  get view(): CharacterView {
    return toView(this.snapshot);
  }

  get current(): MachineSnapshot {
    return this.snapshot;
  }

  dispatch(event: CharacterEvent): void {
    if (this.disposed) return;
    const before = this.view;
    const result = transition(this.snapshot, event, this.timings);
    this.snapshot = result.snapshot;

    switch (result.timer.kind) {
      case 'schedule':
        this.scheduleTransient(result.timer.ms);
        break;
      case 'cancel':
        this.clearTransient();
        break;
      case 'keep':
        break;
    }

    if (result.userActivity) this.restartInactivity();
    // Se o tempo acabou num momento em que não dava para dormir (gerando, balão aberto…),
    // a contagem recomeça para tentar de novo depois.
    if (event.type === 'INACTIVITY_TIMEOUT' && this.snapshot.state !== 'sleeping') {
      this.restartInactivity();
    }

    const after = this.view;
    if (after.state !== before.state || after.badge !== before.badge) {
      this.options.logger.debug('character.state', {
        from: before.state,
        to: after.state,
        event: event.type
      });
      this.options.onView(after);
    }
  }

  /** Chamado quando a preferência "Dormir após inatividade" muda. */
  refreshInactivity(): void {
    this.restartInactivity();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTransient();
    this.clearInactivity();
  }

  private scheduleTransient(ms: number): void {
    this.clearTransient();
    this.transientHandle = this.scheduler.setTimeout(() => {
      this.transientHandle = null;
      this.dispatch({ type: 'TRANSIENT_ELAPSED' });
    }, ms);
  }

  private clearTransient(): void {
    if (this.transientHandle !== null) {
      this.scheduler.clearTimeout(this.transientHandle);
      this.transientHandle = null;
    }
  }

  private restartInactivity(): void {
    this.clearInactivity();
    if (this.disposed) return;
    const ms = this.options.inactivityMs();
    if (ms === null || ms <= 0) return;
    this.inactivityHandle = this.scheduler.setTimeout(() => {
      this.inactivityHandle = null;
      this.dispatch({ type: 'INACTIVITY_TIMEOUT' });
    }, ms);
  }

  private clearInactivity(): void {
    if (this.inactivityHandle !== null) {
      this.scheduler.clearTimeout(this.inactivityHandle);
      this.inactivityHandle = null;
    }
  }

  /** Só para testes e diagnóstico. */
  get canSleepNow(): boolean {
    return canSleep(this.snapshot);
  }
}
