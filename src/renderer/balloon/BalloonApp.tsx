import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties
} from 'react';
import type { ChatErrorInfo } from '../../shared/ai/conversation';
import type { PermissionDecision } from '../../shared/tools/types';
import type { AiStatus } from '../../shared/ai/providers';
import type { ErrorAction } from '../../shared/errors/codes';
import { errorMessage } from '../../shared/errors/messages';
import {
  createTranslator,
  localeFromLanguageTag,
  resolveLocale,
  type Locale,
  type Translator
} from '../../shared/i18n';
import { getPersonality, localized, pickLine } from '../../shared/personalities';
import type { PersonalityId, SettingsPatch, ThemePreference } from '../../shared/schemas/settings';
import { BALLOON_SIZE, type BalloonPlacement } from '../../shared/ui/balloon';
import { resolveMotion } from '../../shared/ui/motion';
import {
  getSnapshot as getSettingsSnapshot,
  subscribe as subscribeSettings,
  updateSettings
} from '../lib/settingsClient';
import { getSnapshot, pushNotice, replaceChat, subscribe, type ChatSnapshot } from './chatClient';
import { fromSnapshot, pendingPermission, plainText, timeline } from './chatState';
import { Composer, NoProvider } from './Composer';
import { Conversation } from './Conversation';
import { Header } from './Header';
import { Onboarding, type OnboardingFinish } from './Onboarding';

/**
 * Balão de conversa (SPEC §8): cabeçalho, conversa, campo de texto, onboarding na
 * primeira execução e aviso quando não há IA. Informa a própria altura ao main, que
 * ajusta a janela e a posiciona junto ao personagem.
 */

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function applyTheme(theme: ThemePreference): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Índice estável a partir de um texto (a saudação não muda a cada renderização). */
function stableIndex(seed: string, length: number): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return length === 0 ? 0 : hash % length;
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (listener) => {
      reducedMotionQuery.addEventListener('change', listener);
      return () => {
        reducedMotionQuery.removeEventListener('change', listener);
      };
    },
    () => reducedMotionQuery.matches
  );
}

function announcementFor(chat: ChatSnapshot, t: Translator, personality: PersonalityId): string {
  const milestone = chat.milestone;
  if (milestone === null) return '';
  if (milestone.kind === 'start') return t('balloon.responding');
  const message = chat.chat.messages.find((item) => item.id === milestone.messageId);
  if (message === undefined) return '';
  if (milestone.kind === 'error' && message.error !== undefined) {
    return errorMessage(t, message.error, personality);
  }
  const text = plainText(message.content);
  return milestone.kind === 'cancelled' ? `${text} ${t('balloon.interrupted')}` : text;
}

export function BalloonApp() {
  const settingsSnapshot = useSyncExternalStore(subscribeSettings, getSettingsSnapshot);
  const chat = useSyncExternalStore(subscribe, getSnapshot);
  const reducedMotion = useReducedMotion();
  const [placement, setPlacement] = useState<BalloonPlacement>({
    vertical: 'above',
    tailX: BALLOON_SIZE.width - 44
  });
  const [sendError, setSendError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const onboardingPrimaryRef = useRef<HTMLButtonElement>(null);

  const ready = settingsSnapshot.status === 'ready' ? settingsSnapshot : null;
  const settings = ready?.settings ?? null;
  const locale: Locale = ready
    ? resolveLocale(ready.settings.general.language, ready.info.systemLanguages)
    : localeFromLanguageTag(navigator.language);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const personality = settings?.personality ?? 'helpful';
  const provider = settings?.ai.provider ?? 'none';
  const onboarding = settings !== null && !settings.firstRunCompleted;
  const generating = chat.chat.activeRequestId !== null;
  const items = useMemo(() => timeline(chat.chat), [chat.chat]);

  // Tema, idioma, escala e movimento no documento.
  useEffect(() => {
    applyTheme(settings?.appearance.theme ?? 'system');
  }, [settings?.appearance.theme]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const scale = settings?.appearance.chatScale ?? 1;
    document.documentElement.style.setProperty('--chat-scale', String(scale));
    document.documentElement.style.fontSize = `${(14 * scale).toFixed(2)}px`;
  }, [settings?.appearance.chatScale]);
  useEffect(() => {
    document.documentElement.dataset.motion = resolveMotion(
      settings?.appearance.animations ?? 'system',
      reducedMotion
    );
  }, [settings?.appearance.animations, reducedMotion]);

  // A janela acompanha a altura do conteúdo.
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const report = (): void => {
      window.clipster.balloon.resize(Math.ceil(root.getBoundingClientRect().height));
    };
    const observer = new ResizeObserver(report);
    observer.observe(root);
    report();
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => window.clipster.balloon.onPlacement(setPlacement), []);

  // Se a IA escolhida está pronta (chave e modelo) e, se não, o que falta.
  useEffect(() => {
    let alive = true;
    const unsubscribe = window.clipster.ai.onStatus(setAiStatus);
    void window.clipster.ai.status().then((result) => {
      if (alive && result.ok) setAiStatus(result.data);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  // Aberto pelo usuário: foco no campo (ou no botão principal do onboarding).
  // Acordado com um clique: o personagem comenta.
  const latest = useRef({ onboarding, personality, locale });
  useEffect(() => {
    latest.current = { onboarding, personality, locale };
  });
  useEffect(
    () =>
      window.clipster.balloon.onShown(({ focus, wokeUp }) => {
        const current = latest.current;
        if (wokeUp && !current.onboarding) {
          pushNotice(
            pickLine(getPersonality(current.personality).microcopy.wakeUp, current.locale)
          );
        }
        if (!focus) return;
        if (current.onboarding) onboardingPrimaryRef.current?.focus();
        else inputRef.current?.focus();
      }),
    []
  );

  // Troca de personalidade: o personagem confirma no balão (SPEC §7.4).
  const previousPersonality = useRef<PersonalityId | null>(null);
  useEffect(() => {
    if (settings === null) return;
    const previous = previousPersonality.current;
    previousPersonality.current = settings.personality;
    if (previous === null || previous === settings.personality || !settings.firstRunCompleted) {
      return;
    }
    pushNotice(localized(getPersonality(settings.personality).microcopy.modeActivated, locale));
  }, [settings, locale]);

  const save = (patch: SettingsPatch): void => {
    void updateSettings(patch);
  };
  const close = (): void => {
    void window.clipster.balloon.close();
  };
  const stop = (): void => {
    const requestId = chat.chat.activeRequestId;
    if (requestId !== null) void window.clipster.chat.cancel(requestId);
  };
  const newConversation = (): void => {
    void window.clipster.chat.newConversation().then((result) => {
      if (result.ok) replaceChat(fromSnapshot(result.data));
      inputRef.current?.focus();
    });
  };
  const send = async (text: string): Promise<boolean> => {
    const result = await window.clipster.chat.send(text);
    if (result.ok) {
      setSendError(null);
      return true;
    }
    setSendError(t('balloon.sendFailed', { message: result.error.message }));
    return false;
  };
  const finishOnboarding = ({ provider: chosen, configure }: OnboardingFinish): void => {
    void window.clipster.onboarding.complete({ personality, provider: chosen }).then(() => {
      if (configure) void window.clipster.windows.openSettings('ai');
      else inputRef.current?.focus();
    });
  };
  const onErrorAction = (action: ErrorAction, error: ChatErrorInfo): void => {
    switch (action) {
      case 'retry':
        void window.clipster.chat.retry();
        return;
      case 'newConversation':
        newConversation();
        return;
      case 'useDemo':
        save({ ai: { provider: 'demo' } });
        return;
      case 'openConsole':
        if (error.consoleUrl !== undefined)
          void window.clipster.shell.openExternal(error.consoleUrl);
        return;
      case 'configureAi':
      case 'openSettings':
      case 'chooseModel':
        void window.clipster.windows.openSettings('ai');
        return;
    }
  };

  const respondPermission = (requestId: string, decision: PermissionDecision): void => {
    void window.clipster.permissions.respond(requestId, decision);
  };
  const pending = pendingPermission(chat.chat);

  // Esc: pula o onboarding, recusa um pedido de permissão, para a geração ou fecha o balão
  // (SPEC §8.3, §9, §22).
  const escape = useRef<() => void>(close);
  useEffect(() => {
    escape.current = () => {
      if (pending !== null) {
        respondPermission(pending.activity.prompt.id, 'deny');
      } else if (onboarding) {
        finishOnboarding({ provider: provider === 'demo' ? 'demo' : 'none', configure: false });
      } else if (generating) {
        stop();
      } else {
        close();
      }
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      escape.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const greeting = useMemo(() => {
    const lines = getPersonality(personality).microcopy.greeting;
    return pickLine(
      lines,
      locale,
      () => stableIndex(chat.chat.conversationId, lines.length) / lines.length
    );
  }, [personality, locale, chat.chat.conversationId]);

  const suggestions = [
    t('balloon.suggestion.rename'),
    t('balloon.suggestion.screenshot'),
    t('balloon.suggestion.time')
  ];
  const empty = (
    <div className="empty">
      <p className="empty__greeting">{greeting}</p>
      {provider === 'demo' && (
        <div className="suggestions" role="group" aria-label={t('balloon.suggestions.label')}>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="suggestion"
              disabled={generating}
              onClick={() => {
                void send(suggestion);
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const style = { '--tail-x': `${placement.tailX.toString()}px` } as CSSProperties; // variável CSS
  const aiReady = aiStatus?.provider === provider ? aiStatus.ready : provider === 'demo';
  const issue = aiStatus?.provider === provider ? (aiStatus.issue ?? 'noProvider') : 'noProvider';

  return (
    <div
      ref={rootRef}
      className="balloon"
      data-vertical={placement.vertical}
      data-testid="balloon"
      style={style}
    >
      <section className="bubble" aria-label={t('balloon.region')}>
        <Header
          t={t}
          personality={personality}
          isDemo={provider === 'demo'}
          showControls={!onboarding}
          canStartNew={chat.chat.messages.length > 0}
          onPersonality={(id) => {
            save({ personality: id });
          }}
          onNewConversation={newConversation}
          onClose={close}
        />
        {settings === null || chat.status === 'loading' ? (
          <p className="loading">{t('settings.loading')}</p>
        ) : onboarding ? (
          <Onboarding
            t={t}
            settings={settings}
            primaryRef={onboardingPrimaryRef}
            onLanguage={(language) => {
              save({ general: { language } });
            }}
            onPersonality={(id) => {
              save({ personality: id });
            }}
            onFinish={finishOnboarding}
          />
        ) : (
          <>
            <Conversation
              t={t}
              locale={locale}
              items={items}
              personality={personality}
              empty={empty}
              onErrorAction={onErrorAction}
              onPermission={respondPermission}
            />
            {sendError !== null && (
              <p className="send-error" role="alert">
                {sendError}
              </p>
            )}
            {aiReady ? (
              <Composer
                t={t}
                inputRef={inputRef}
                generating={generating}
                onSend={send}
                onStop={stop}
              />
            ) : (
              <NoProvider
                t={t}
                issue={issue}
                onConfigure={() => {
                  void window.clipster.windows.openSettings('ai');
                }}
                onUseDemo={() => {
                  save({ ai: { provider: 'demo' } });
                }}
              />
            )}
          </>
        )}
        <p className="visually-hidden" aria-live="polite" aria-atomic="true">
          {announcementFor(chat, t, personality)}
        </p>
      </section>
      <svg
        className="tail"
        width="24"
        height={BALLOON_SIZE.tail + 1}
        viewBox={`0 0 24 ${(BALLOON_SIZE.tail + 1).toString()}`}
        aria-hidden="true"
        focusable="false"
      >
        <path className="tail__fill" d="M0 0 L12 12 L24 0 Z" />
        <path className="tail__edge" d="M0.5 0.5 L12 12 L23.5 0.5" />
      </svg>
    </div>
  );
}
