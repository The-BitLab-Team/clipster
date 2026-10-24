import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterStateHost } from '../../src/main/character/characterStateHost';
import { createLogger, MemorySink } from '../../src/main/logging/logger';
import { CHARACTER_TIMINGS } from '../../src/shared/constants/ui';
import type { CharacterView } from '../../src/shared/character/states';

let views: CharacterView[];
let inactivity: number | null;

function createHost(): CharacterStateHost {
  return new CharacterStateHost({
    inactivityMs: () => inactivity,
    onView: (view) => views.push(view),
    logger: createLogger({ level: 'debug', sinks: [new MemorySink()] })
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  views = [];
  inactivity = 1000;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CharacterStateHost', () => {
  it('dorme depois do tempo sem interação', () => {
    const host = createHost();
    host.dispatch({ type: 'APP_READY', firstRun: false });
    vi.advanceTimersByTime(999);
    expect(host.view.state).toBe('idle');
    vi.advanceTimersByTime(1);
    expect(host.view.state).toBe('sleeping');
    expect(views.at(-1)).toEqual({ state: 'sleeping', badge: false });
  });

  it('cada interação reinicia a contagem', () => {
    const host = createHost();
    host.dispatch({ type: 'APP_READY', firstRun: false });
    vi.advanceTimersByTime(900);
    host.dispatch({ type: 'CLICK' });
    vi.advanceTimersByTime(900);
    expect(host.view.state).toBe('idle');
    vi.advanceTimersByTime(100);
    expect(host.view.state).toBe('sleeping');
  });

  it('"Nunca" desliga o sono por inatividade', () => {
    inactivity = null;
    const host = createHost();
    host.dispatch({ type: 'APP_READY', firstRun: false });
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(host.view.state).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('não dorme no meio de uma resposta e tenta de novo depois', () => {
    const host = createHost();
    host.dispatch({ type: 'APP_READY', firstRun: false });
    host.dispatch({ type: 'MESSAGE_SENT' });
    vi.advanceTimersByTime(1000);
    expect(host.view.state).toBe('thinking');
    host.dispatch({ type: 'FIRST_TOKEN' });
    host.dispatch({ type: 'STREAM_DONE' });
    expect(host.view.state).toBe('idle');
    vi.advanceTimersByTime(1000);
    expect(host.view.state).toBe('sleeping');
  });

  it('clique acorda confuso e volta a idle depois da duração do estado', () => {
    const host = createHost();
    host.dispatch({ type: 'APP_READY', firstRun: false });
    vi.advanceTimersByTime(1000);
    host.dispatch({ type: 'CLICK' });
    expect(host.view.state).toBe('confused');
    vi.advanceTimersByTime(CHARACTER_TIMINGS.confusedMs);
    expect(host.view.state).toBe('idle');
    expect(views.map((view) => view.state)).toEqual(['sleeping', 'confused', 'idle']);
  });

  it('primeira execução: feliz por um instante', () => {
    const host = createHost();
    host.dispatch({ type: 'APP_READY', firstRun: true });
    expect(host.view.state).toBe('happy');
    vi.advanceTimersByTime(CHARACTER_TIMINGS.happyMs);
    expect(host.view.state).toBe('idle');
  });

  it('um novo estado transitório substitui o timer do anterior', () => {
    inactivity = null;
    const host = createHost();
    host.dispatch({ type: 'USER_TYPING' });
    vi.advanceTimersByTime(CHARACTER_TIMINGS.listeningMs - 100);
    host.dispatch({ type: 'USER_TYPING' });
    vi.advanceTimersByTime(200);
    expect(host.view.state).toBe('listening');
    vi.advanceTimersByTime(CHARACTER_TIMINGS.listeningMs);
    expect(host.view.state).toBe('idle');
  });

  it('refreshInactivity usa o novo valor da preferência', () => {
    const host = createHost();
    host.dispatch({ type: 'APP_READY', firstRun: false });
    inactivity = 5000;
    host.refreshInactivity();
    vi.advanceTimersByTime(4999);
    expect(host.view.state).toBe('idle');
    vi.advanceTimersByTime(1);
    expect(host.view.state).toBe('sleeping');
  });

  it('avisa a janela só quando a pose ou o indicador mudam', () => {
    const host = createHost();
    host.dispatch({ type: 'CLICK' });
    host.dispatch({ type: 'BALLOON_CLOSED' });
    expect(views).toEqual([]);
    host.dispatch({ type: 'MESSAGE_SENT' });
    host.dispatch({ type: 'NOTIFICATION' });
    expect(views).toEqual([
      { state: 'thinking', badge: false },
      { state: 'thinking', badge: true }
    ]);
  });

  it('dispose cancela os timers e ignora eventos', () => {
    const host = createHost();
    host.dispatch({ type: 'SUCCESS_FEEDBACK' });
    host.dispose();
    expect(vi.getTimerCount()).toBe(0);
    host.dispatch({ type: 'CLICK' });
    vi.advanceTimersByTime(10_000);
    expect(host.view.state).toBe('happy');
  });

  it('em repouso mantém no máximo um timer (sem polling)', () => {
    const host = createHost();
    host.dispatch({ type: 'APP_READY', firstRun: false });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(host.view.state).toBe('sleeping');
    expect(vi.getTimerCount()).toBe(0);
  });
});
