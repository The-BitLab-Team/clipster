import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ChatErrorInfo, ConversationMessage } from '../../shared/ai/conversation';
import type { ErrorAction } from '../../shared/errors/codes';
import { errorActions, errorMessage, showsSupportCode } from '../../shared/errors/messages';
import type { Locale, Translator } from '../../shared/i18n';
import type { PermissionDecision } from '../../shared/tools/types';
import type { PersonalityId } from '../../shared/schemas/settings';
import type { TimelineItem } from './chatState';
import { CopyButton, Markdown } from './Markdown';
import { PermissionCard, ToolActivityList } from './Tools';

/** Lista de mensagens do balão (SPEC §8.1): usuário × Clipster, avisos e erros com ações. */

interface ConversationProps {
  t: Translator;
  locale: Locale;
  items: TimelineItem[];
  personality: PersonalityId;
  /** Conteúdo para a conversa vazia (saudação, sugestões). */
  empty: ReactNode;
  onErrorAction: (action: ErrorAction, error: ChatErrorInfo) => void;
  onPermission: (requestId: string, decision: PermissionDecision) => void;
}

export function Conversation({
  t,
  locale,
  items,
  personality,
  empty,
  onErrorAction,
  onPermission
}: ConversationProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const last = items.at(-1);
  const lastLength = last?.kind === 'message' ? last.message.content.length : 0;
  const lastStatus = last?.kind === 'message' ? last.message.status : 'notice';
  const lastTools =
    last?.kind === 'message' ? (last.message.tools ?? []).map((tool) => tool.status).join() : '';

  // Acompanha a resposta enquanto ela é escrita, a não ser que o usuário tenha rolado para cima.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list !== null && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [items.length, lastLength, lastStatus, lastTools]);

  return (
    <div
      ref={listRef}
      className="messages"
      role="log"
      aria-label={t('balloon.messages.label')}
      aria-live="off"
      tabIndex={0}
      onScroll={(event) => {
        const list = event.currentTarget;
        stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
      }}
    >
      {items.length === 0
        ? empty
        : items.map((item) =>
            item.kind === 'notice' ? (
              <p key={item.notice.id} className="notice">
                {item.notice.text}
              </p>
            ) : (
              <MessageView
                key={item.message.id}
                t={t}
                locale={locale}
                message={item.message}
                personality={personality}
                onErrorAction={onErrorAction}
                onPermission={onPermission}
              />
            )
          )}
    </div>
  );
}

interface MessageViewProps {
  t: Translator;
  locale: Locale;
  message: ConversationMessage;
  personality: PersonalityId;
  onErrorAction: (action: ErrorAction, error: ChatErrorInfo) => void;
  onPermission: (requestId: string, decision: PermissionDecision) => void;
}

function MessageView({
  t,
  locale,
  message,
  personality,
  onErrorAction,
  onPermission
}: MessageViewProps) {
  if (message.role === 'user') {
    return (
      <div className="msg msg--user" data-testid="message-user">
        <span className="visually-hidden">{t('balloon.you')}: </span>
        <p>{message.content}</p>
      </div>
    );
  }

  const hasText = message.content.trim().length > 0;
  const tools = message.tools ?? [];
  const awaiting = tools.find((tool) => tool.status === 'awaiting' && tool.prompt !== undefined);
  const thinking = message.status === 'streaming' && !hasText && awaiting === undefined;
  return (
    <div className="msg msg--clipster" data-testid="message-clipster" data-status={message.status}>
      {/* Enquanto o pedido de permissão aparece, ele mesmo representa a ferramenta. */}
      <ToolActivityList t={t} tools={tools.filter((tool) => tool !== awaiting)} />
      {awaiting?.prompt !== undefined && (
        <PermissionCard
          t={t}
          locale={locale}
          prompt={awaiting.prompt}
          onRespond={(decision) => {
            if (awaiting.prompt !== undefined) onPermission(awaiting.prompt.id, decision);
          }}
        />
      )}
      {thinking && (
        <p className="thinking">
          <span className="thinking__dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {t('balloon.thinking')}
        </p>
      )}
      {hasText && <Markdown content={message.content} t={t} />}
      {message.status === 'complete' && !hasText && (
        <p className="msg__meta">{t('balloon.emptyReply')}</p>
      )}
      {message.status === 'interrupted' && (
        <p className="msg__meta" data-testid="interrupted">
          {t('balloon.interrupted')}
        </p>
      )}
      {message.status === 'error' && message.error !== undefined && (
        <ErrorCard t={t} error={message.error} personality={personality} onAction={onErrorAction} />
      )}
      {hasText && message.status !== 'streaming' && (
        <div className="msg__actions">
          <CopyButton text={message.content} label={t('balloon.copy')} t={t} />
        </div>
      )}
    </div>
  );
}

interface ErrorCardProps {
  t: Translator;
  error: ChatErrorInfo;
  personality: PersonalityId;
  onAction: (action: ErrorAction, error: ChatErrorInfo) => void;
}

/** "Tentar de novo" só depois da espera indicada pelo provider (RATE_LIMITED). */
function useCountdown(seconds: number | undefined): number {
  const [remaining, setRemaining] = useState(seconds ?? 0);
  useEffect(() => {
    if (seconds === undefined || seconds <= 0) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const left = Math.max(0, seconds - Math.floor((Date.now() - startedAt) / 1000));
      setRemaining(left);
      if (left === 0) window.clearInterval(timer);
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [seconds]);
  return remaining;
}

function ErrorCard({ t, error, personality, onAction }: ErrorCardProps) {
  const remaining = useCountdown(
    error.code === 'RATE_LIMITED' ? error.retryAfterSeconds : undefined
  );
  return (
    <div className="error-card" role="alert" data-testid="error-card" data-code={error.code}>
      <p className="error-card__text">{errorMessage(t, error, personality)}</p>
      {showsSupportCode(error) && error.supportCode !== undefined && (
        <p className="error-card__code">{t('balloon.errorCode', { code: error.supportCode })}</p>
      )}
      {errorActions(error).length > 0 && (
        <div className="error-card__actions">
          {errorActions(error).map((action) => {
            const waiting = action === 'retry' && remaining > 0;
            return (
              <button
                key={action}
                type="button"
                className="button button--small"
                disabled={waiting}
                onClick={() => {
                  onAction(action, error);
                }}
              >
                {waiting
                  ? t('balloon.retryIn', { seconds: remaining })
                  : t(`error.action.${action}`)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
