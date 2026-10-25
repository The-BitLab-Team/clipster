import { describe, expect, it } from 'vitest';
import { CHARACTER_TIMINGS } from '../../src/shared/constants/ui';
import {
  INITIAL_SNAPSHOT,
  canSleep,
  toView,
  transition,
  type CharacterEvent,
  type MachineContext,
  type MachineSnapshot
} from '../../src/shared/character/stateMachine';
import { CHARACTER_STATES, type CharacterState } from '../../src/shared/character/states';

const T = CHARACTER_TIMINGS;

function at(state: CharacterState, context: Partial<MachineContext> = {}): MachineSnapshot {
  return { state, context: { ...INITIAL_SNAPSHOT.context, ...context } };
}

function run(events: readonly CharacterEvent[], start: MachineSnapshot = INITIAL_SNAPSHOT) {
  return events.reduce((snapshot, event) => transition(snapshot, event).snapshot, start);
}

const ALL_EVENTS: readonly CharacterEvent[] = [
  { type: 'APP_READY', firstRun: false },
  { type: 'APP_READY', firstRun: true },
  { type: 'CLICK' },
  { type: 'BALLOON_OPENED' },
  { type: 'BALLOON_CLOSED' },
  { type: 'USER_TYPING' },
  { type: 'MESSAGE_SENT' },
  { type: 'FIRST_TOKEN' },
  { type: 'STREAM_DONE' },
  { type: 'CANCELLED' },
  { type: 'AI_ERROR' },
  { type: 'ERROR_DISMISSED' },
  { type: 'NOTIFICATION' },
  { type: 'NOTIFICATION_DISMISSED' },
  { type: 'INACTIVITY_TIMEOUT' },
  { type: 'SUCCESS_FEEDBACK' },
  { type: 'DRAG_START' },
  { type: 'DRAG_END' },
  { type: 'TRANSIENT_ELAPSED' },
  { type: 'PERMISSION_REQUESTED' },
  { type: 'PERMISSION_RESOLVED' },
  ...CHARACTER_STATES.map((state): CharacterEvent => ({ type: 'PREVIEW', state }))
];

describe('transições da SPEC §6.2', () => {
  it('APP_READY: primeira execução começa feliz e volta sozinho', () => {
    expect(transition(INITIAL_SNAPSHOT, { type: 'APP_READY', firstRun: true })).toMatchObject({
      snapshot: { state: 'happy' },
      timer: { kind: 'schedule', ms: T.happyMs },
      userActivity: true
    });
    expect(transition(INITIAL_SNAPSHOT, { type: 'APP_READY', firstRun: false })).toMatchObject({
      snapshot: { state: 'idle' },
      timer: { kind: 'cancel' }
    });
  });

  it('CLICK: acorda confuso; dispensa erro e aviso; nos outros casos não muda a pose', () => {
    expect(transition(at('sleeping'), { type: 'CLICK' })).toMatchObject({
      snapshot: { state: 'confused' },
      timer: { kind: 'schedule', ms: T.confusedMs }
    });
    expect(transition(at('error'), { type: 'CLICK' }).snapshot.state).toBe('idle');
    const seen = transition(at('notification', { notificationPending: true }), { type: 'CLICK' });
    expect(seen.snapshot).toEqual(at('idle'));
    expect(transition(at('idle'), { type: 'CLICK' })).toMatchObject({
      snapshot: { state: 'idle' },
      timer: { kind: 'keep' },
      userActivity: true
    });
    expect(transition(at('talking'), { type: 'CLICK' }).snapshot.state).toBe('talking');
  });

  it('USER_TYPING: idle → listening, que volta a idle sem digitar', () => {
    const typing = transition(at('idle'), { type: 'USER_TYPING' });
    expect(typing).toMatchObject({
      snapshot: { state: 'listening' },
      timer: { kind: 'schedule', ms: T.listeningMs }
    });
    expect(transition(typing.snapshot, { type: 'TRANSIENT_ELAPSED' }).snapshot.state).toBe('idle');
  });

  it('fluxo completo de uma pergunta: thinking → talking → idle', () => {
    const sent = transition(at('listening'), { type: 'MESSAGE_SENT' });
    expect(sent).toMatchObject({
      snapshot: { state: 'thinking', context: { generating: true } },
      timer: { kind: 'cancel' }
    });
    const firstToken = transition(sent.snapshot, { type: 'FIRST_TOKEN' });
    expect(firstToken.snapshot.state).toBe('talking');
    expect(firstToken.userActivity).toBe(false);
    const done = transition(firstToken.snapshot, { type: 'STREAM_DONE' });
    expect(done.snapshot).toEqual(at('idle'));
  });

  it('cancelar volta para idle; erro mostra a pose de erro e expira', () => {
    expect(run([{ type: 'MESSAGE_SENT' }, { type: 'CANCELLED' }])).toEqual(at('idle'));
    const failed = transition(run([{ type: 'MESSAGE_SENT' }, { type: 'FIRST_TOKEN' }]), {
      type: 'AI_ERROR'
    });
    expect(failed).toMatchObject({
      snapshot: { state: 'error', context: { generating: false } },
      timer: { kind: 'schedule', ms: T.errorMs }
    });
    expect(transition(failed.snapshot, { type: 'TRANSIENT_ELAPSED' }).snapshot.state).toBe('idle');
    expect(transition(failed.snapshot, { type: 'ERROR_DISMISSED' }).snapshot.state).toBe('idle');
  });

  it('nova pergunta substitui a pose de erro', () => {
    expect(transition(at('error'), { type: 'MESSAGE_SENT' }).snapshot.state).toBe('thinking');
  });

  it('FIRST_TOKEN fora de thinking e STREAM_DONE fora de geração não mudam a pose', () => {
    expect(transition(at('idle'), { type: 'FIRST_TOKEN' }).snapshot.state).toBe('idle');
    expect(transition(at('error'), { type: 'STREAM_DONE' }).snapshot.state).toBe('error');
  });

  it('NOTIFICATION: pose de aviso expira, mas o indicador fica até ser visto', () => {
    const notified = transition(at('idle'), { type: 'NOTIFICATION' });
    expect(notified).toMatchObject({
      snapshot: { state: 'notification', context: { notificationPending: true } },
      timer: { kind: 'schedule', ms: T.notificationMs },
      userActivity: false
    });
    const expired = transition(notified.snapshot, { type: 'TRANSIENT_ELAPSED' }).snapshot;
    expect(toView(expired)).toEqual({ state: 'idle', badge: true });
    const dismissed = transition(expired, { type: 'NOTIFICATION_DISMISSED' }).snapshot;
    expect(toView(dismissed)).toEqual({ state: 'idle', badge: false });
  });

  it('aviso durante uma resposta não interrompe; só liga o indicador', () => {
    const result = transition(at('talking', { generating: true }), { type: 'NOTIFICATION' });
    expect(toView(result.snapshot)).toEqual({ state: 'talking', badge: true });
    expect(result.timer).toEqual({ kind: 'keep' });
  });

  it('INACTIVITY_TIMEOUT: dorme só em idle e sem impedimentos', () => {
    expect(transition(at('idle'), { type: 'INACTIVITY_TIMEOUT' }).snapshot.state).toBe('sleeping');
    for (const blocker of [
      { balloonOpen: true },
      { generating: true },
      { notificationPending: true }
    ] satisfies Partial<MachineContext>[]) {
      expect(transition(at('idle', blocker), { type: 'INACTIVITY_TIMEOUT' }).snapshot.state).toBe(
        'idle'
      );
    }
    for (const state of ['happy', 'thinking', 'talking', 'error', 'listening'] as const) {
      expect(transition(at(state), { type: 'INACTIVITY_TIMEOUT' }).snapshot.state).toBe(state);
    }
  });

  it('balão aberto acorda o personagem e impede dormir até fechar', () => {
    const opened = transition(at('sleeping'), { type: 'BALLOON_OPENED' }).snapshot;
    expect(opened).toEqual(at('confused', { balloonOpen: true }));
    expect(canSleep(at('idle', { balloonOpen: true }))).toBe(false);
    const closed = transition(at('idle', { balloonOpen: true }), { type: 'BALLOON_CLOSED' });
    expect(canSleep(closed.snapshot)).toBe(true);
  });

  it('SUCCESS_FEEDBACK: feliz por um instante, sem atrapalhar estados ocupados', () => {
    for (const state of ['idle', 'sleeping', 'listening', 'confused'] as const) {
      expect(transition(at(state), { type: 'SUCCESS_FEEDBACK' })).toMatchObject({
        snapshot: { state: 'happy' },
        timer: { kind: 'schedule', ms: T.happyMs }
      });
    }
    for (const state of ['thinking', 'talking', 'error', 'notification', 'dragging'] as const) {
      expect(transition(at(state), { type: 'SUCCESS_FEEDBACK' }).snapshot.state).toBe(state);
    }
  });

  it('arrasto: mostra "sendo arrastado" e volta para idle; não interrompe resposta nem erro', () => {
    const dragging = transition(at('sleeping'), { type: 'DRAG_START' });
    expect(dragging).toMatchObject({ snapshot: { state: 'dragging' }, timer: { kind: 'cancel' } });
    expect(transition(dragging.snapshot, { type: 'DRAG_END' }).snapshot.state).toBe('idle');
    for (const state of ['thinking', 'talking', 'error'] as const) {
      expect(transition(at(state), { type: 'DRAG_START' }).snapshot.state).toBe(state);
      expect(transition(at(state), { type: 'DRAG_END' }).snapshot.state).toBe(state);
    }
  });

  it('TRANSIENT_ELAPSED encerra só estados transitórios', () => {
    for (const state of ['happy', 'confused', 'listening', 'error', 'notification'] as const) {
      expect(transition(at(state), { type: 'TRANSIENT_ELAPSED' }).snapshot.state).toBe('idle');
    }
    for (const state of ['idle', 'sleeping', 'thinking', 'talking', 'dragging'] as const) {
      expect(transition(at(state), { type: 'TRANSIENT_ELAPSED' }).snapshot.state).toBe(state);
    }
  });
});

describe('pedido de permissão de ferramenta (SPEC §22)', () => {
  it('pensando ou falando → aviso até a resposta; depois volta a pensar', () => {
    for (const state of ['thinking', 'talking'] as const) {
      const asked = transition(at(state, { generating: true }), { type: 'PERMISSION_REQUESTED' });
      expect(asked).toMatchObject({
        snapshot: { state: 'notification', context: { awaitingPermission: true } },
        timer: { kind: 'cancel' }
      });
      // O aviso não some sozinho, nem com clique, digitação ou arrasto.
      for (const event of [
        { type: 'TRANSIENT_ELAPSED' },
        { type: 'CLICK' },
        { type: 'USER_TYPING' },
        { type: 'DRAG_START' }
      ] as const) {
        expect(transition(asked.snapshot, event).snapshot.state).toBe('notification');
      }
      expect(run([{ type: 'PERMISSION_RESOLVED' }], asked.snapshot)).toMatchObject({
        state: 'thinking',
        context: { awaitingPermission: false }
      });
    }
  });

  it('Parar, erro ou fim da resposta durante o pedido encerram o aviso', () => {
    const asked = run([{ type: 'MESSAGE_SENT' }, { type: 'PERMISSION_REQUESTED' }]);
    expect(run([{ type: 'CANCELLED' }], asked)).toMatchObject({
      state: 'idle',
      context: { awaitingPermission: false, generating: false }
    });
    expect(run([{ type: 'AI_ERROR' }], asked).state).toBe('error');
    expect(run([{ type: 'STREAM_DONE' }], asked).state).toBe('idle');
  });

  it('sem resposta em andamento, o pedido não muda a pose', () => {
    expect(run([{ type: 'PERMISSION_REQUESTED' }]).state).toBe('idle');
    expect(
      run([{ type: 'PERMISSION_RESOLVED' }], at('notification', { notificationPending: true }))
        .state
    ).toBe('notification');
  });
});

describe('prioridades', () => {
  const LOW_EVENTS: readonly CharacterEvent[] = [
    { type: 'USER_TYPING' },
    { type: 'SUCCESS_FEEDBACK' },
    { type: 'NOTIFICATION' },
    { type: 'INACTIVITY_TIMEOUT' },
    { type: 'DRAG_START' },
    { type: 'TRANSIENT_ELAPSED' }
  ];

  it.each(['thinking', 'talking'] as const)(
    '%s não é interrompido por eventos menores',
    (state) => {
      for (const event of LOW_EVENTS) {
        expect(transition(at(state, { generating: true }), event).snapshot.state).toBe(state);
      }
    }
  );

  it('error só sai por dispensa, tempo, clique ou nova pergunta', () => {
    for (const event of LOW_EVENTS.filter((item) => item.type !== 'TRANSIENT_ELAPSED')) {
      expect(transition(at('error'), event).snapshot.state).toBe('error');
    }
  });
});

describe('pré-visualização (dev)', () => {
  it('força o estado e volta para idle quando o tempo acaba', () => {
    const preview = transition(at('idle'), { type: 'PREVIEW', state: 'thinking' });
    expect(preview).toMatchObject({
      snapshot: { state: 'thinking', context: { previewing: true } },
      timer: { kind: 'schedule', ms: T.previewMs }
    });
    expect(transition(preview.snapshot, { type: 'TRANSIENT_ELAPSED' }).snapshot).toEqual(
      at('idle')
    );
  });

  it('qualquer evento real descarta a prévia e parte de idle (sem ficar preso na pose)', () => {
    for (const previewed of CHARACTER_STATES) {
      const preview = transition(at('idle'), { type: 'PREVIEW', state: previewed }).snapshot;
      const clicked = transition(preview, { type: 'CLICK' });
      expect(clicked.snapshot).toEqual(at('idle'));
      expect(clicked.timer).toEqual({ kind: 'cancel' });
    }
    const preview = transition(at('idle'), { type: 'PREVIEW', state: 'dragging' }).snapshot;
    expect(transition(preview, { type: 'NOTIFICATION' }).snapshot).toEqual(
      at('notification', { notificationPending: true })
    );
  });
});

describe('robustez', () => {
  it('toda combinação estado × evento devolve um estado válido sem lançar erro', () => {
    for (const state of CHARACTER_STATES) {
      for (const flags of [
        {},
        { generating: true },
        { balloonOpen: true, notificationPending: true }
      ]) {
        for (const event of ALL_EVENTS) {
          const result = transition(at(state, flags), event);
          expect(CHARACTER_STATES).toContain(result.snapshot.state);
          expect(['schedule', 'cancel', 'keep']).toContain(result.timer.kind);
        }
      }
    }
  });

  it('marca como interação do usuário só os eventos vindos dele', () => {
    const system = new Set([
      'FIRST_TOKEN',
      'STREAM_DONE',
      'AI_ERROR',
      'NOTIFICATION',
      'INACTIVITY_TIMEOUT',
      'TRANSIENT_ELAPSED',
      'PERMISSION_REQUESTED',
      'PERMISSION_RESOLVED'
    ]);
    for (const event of ALL_EVENTS) {
      expect(transition(INITIAL_SNAPSHOT, event).userActivity).toBe(!system.has(event.type));
    }
  });

  it('não altera o snapshot recebido (função pura)', () => {
    const before = at('idle');
    const frozen = JSON.stringify(before);
    transition(before, { type: 'NOTIFICATION' });
    transition(before, { type: 'MESSAGE_SENT' });
    expect(JSON.stringify(before)).toBe(frozen);
  });
});
