import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { MAX_USER_MESSAGE_CHARS } from '../../shared/constants/ai';
import { TYPING_NOTIFY_INTERVAL_MS } from '../../shared/constants/ui';
import type { AiIssue } from '../../shared/ai/providers';
import type { Translator } from '../../shared/i18n';
import { IconSend, IconStop } from './icons';

/**
 * Campo de texto do balão (SPEC §8.1, §8.3): auto-altura, Enter envia, Shift+Enter quebra
 * a linha, limite de 4.000 caracteres e Parar no lugar de Enviar durante a geração.
 */

/** A partir daqui o contador aparece. */
const COUNTER_FROM = MAX_USER_MESSAGE_CHARS - 500;

interface ComposerProps {
  t: Translator;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  generating: boolean;
  /** Devolve true se a mensagem foi aceita (o campo é limpo). */
  onSend: (text: string) => Promise<boolean>;
  onStop: () => void;
}

export function Composer({ t, inputRef, generating, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const lastTypingAt = useRef(0);
  const canSend = text.trim().length > 0 && !generating && !sending;

  // Auto-altura: o CSS limita a algumas linhas; acima disso, o campo rola.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight.toString()}px`;
  }, [text, inputRef]);

  const send = (): void => {
    if (!canSend) return;
    setSending(true);
    void onSend(text).then((accepted) => {
      setSending(false);
      if (accepted) setText('');
    });
  };

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <label htmlFor="message" className="visually-hidden">
        {t('balloon.input.label')}
      </label>
      <textarea
        id="message"
        ref={inputRef}
        className="composer__input"
        rows={1}
        maxLength={MAX_USER_MESSAGE_CHARS}
        placeholder={t('balloon.placeholder')}
        aria-describedby="message-hint"
        value={text}
        onChange={(event) => {
          setText(event.currentTarget.value);
          const now = Date.now();
          if (now - lastTypingAt.current >= TYPING_NOTIFY_INTERVAL_MS) {
            lastTypingAt.current = now;
            window.clipster.chat.typing();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            send();
          }
        }}
      />
      <span id="message-hint" className="visually-hidden">
        {t('balloon.input.hint')}
      </span>
      {text.length >= COUNTER_FROM && (
        <span className="composer__count" aria-live="polite">
          {t('balloon.charCount', { count: text.length, max: MAX_USER_MESSAGE_CHARS })}
        </span>
      )}
      {generating ? (
        <button
          type="button"
          className="composer__button composer__button--stop"
          title={t('balloon.stop')}
          aria-label={t('balloon.stop')}
          onClick={onStop}
        >
          <IconStop />
        </button>
      ) : (
        <button
          type="submit"
          className="composer__button"
          title={t('balloon.send')}
          aria-label={t('balloon.send')}
          disabled={!canSend}
        >
          <IconSend />
        </button>
      )}
    </form>
  );
}

interface NoProviderProps {
  t: Translator;
  /** O que falta: nenhuma IA, a chave ou o modelo. */
  issue: AiIssue;
  onConfigure: () => void;
  onUseDemo: () => void;
}

/** Sem IA configurada: o balão explica e oferece as duas saídas (SPEC §8.1). */
export function NoProvider({ t, issue, onConfigure, onUseDemo }: NoProviderProps) {
  const title =
    issue === 'missingKey'
      ? t('balloon.noProvider.missingKey.title')
      : issue === 'missingModel'
        ? t('balloon.noProvider.missingModel.title')
        : t('balloon.noProvider.title');
  const body =
    issue === 'missingKey'
      ? t('balloon.noProvider.missingKey.body')
      : issue === 'missingModel'
        ? t('balloon.noProvider.missingModel.body')
        : t('balloon.noProvider.body');
  return (
    <div className="no-provider" data-testid="no-provider" data-issue={issue}>
      <p className="no-provider__title">{title}</p>
      <p className="no-provider__body">{body}</p>
      <div className="no-provider__actions">
        <button type="button" className="button button--primary" onClick={onUseDemo}>
          {t('balloon.noProvider.demo')}
        </button>
        <button type="button" className="button" onClick={onConfigure}>
          {t('balloon.noProvider.configure')}
        </button>
      </div>
    </div>
  );
}
