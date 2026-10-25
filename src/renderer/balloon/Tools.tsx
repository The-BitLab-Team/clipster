import { useEffect, useRef, useState } from 'react';
import type { Locale, Translator } from '../../shared/i18n';
import {
  ACTIVITY_STATUS_KEYS,
  PERMISSION_LABEL_KEYS,
  RISK_LABEL_KEYS,
  toolLabelKey
} from '../../shared/tools/labels';
import type { PermissionDecision, PermissionPrompt, ToolActivity } from '../../shared/tools/types';

/**
 * Ferramentas no balão (SPEC §22): o que o Clipster usou numa resposta e, quando uma
 * ferramenta precisa, o pedido de permissão. O texto do pedido vem da ferramenta (no main),
 * com os argumentos já validados; nunca do texto livre do modelo.
 */

const STATUS_ICON: Readonly<Record<ToolActivity['status'], string>> = {
  awaiting: '?',
  running: '…',
  done: '✓',
  denied: '✕',
  failed: '!'
};

export function ToolActivityList({ t, tools }: { t: Translator; tools: readonly ToolActivity[] }) {
  if (tools.length === 0) return null;
  return (
    <ul className="tools" aria-label={t('balloon.tools.label')}>
      {tools.map((activity) => (
        <li
          key={activity.id}
          className="tool"
          data-testid="tool-activity"
          data-tool={activity.tool ?? 'unknown'}
          data-status={activity.status}
        >
          <span className="tool__icon" aria-hidden="true">
            {STATUS_ICON[activity.status]}
          </span>
          {t(ACTIVITY_STATUS_KEYS[activity.status], { tool: t(toolLabelKey(activity.tool)) })}
        </li>
      ))}
    </ul>
  );
}

interface PermissionCardProps {
  t: Translator;
  locale: Locale;
  prompt: PermissionPrompt;
  onRespond: (decision: PermissionDecision) => void;
}

export function PermissionCard({ t, locale, prompt, onRespond }: PermissionCardProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [answered, setAnswered] = useState(false);
  const destructive = prompt.risk === 'destructive';

  // O foco começa em Cancelar (SPEC §22.2). Só dentro do balão: a janela não é ativada.
  useEffect(() => {
    cancelRef.current?.focus();
  }, [prompt.id]);

  const respond = (decision: PermissionDecision): void => {
    if (answered) return;
    setAnswered(true);
    onRespond(decision);
  };
  // Calculado uma vez, quando o pedido aparece.
  const [minutes] = useState(() =>
    Math.max(1, Math.round((Date.parse(prompt.expiresAt) - Date.now()) / 60_000))
  );
  const permissions = prompt.permissions.map((id) => t(PERMISSION_LABEL_KEYS[id])).join(', ');
  const titleId = `permission-title-${prompt.id}`;
  const actionId = `permission-action-${prompt.id}`;

  return (
    <div
      className="permission"
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={actionId}
      data-testid="permission-request"
      data-risk={prompt.risk}
    >
      <p id={titleId} className="permission__title">
        {t('balloon.permission.title')}
      </p>
      <p id={actionId} className="permission__action" data-testid="permission-action">
        {prompt.action[locale]}
      </p>
      <p className="permission__meta">
        {t(RISK_LABEL_KEYS[prompt.risk])} {t('balloon.permission.needs', { permissions })}
      </p>
      <div className="permission__actions">
        <button
          ref={cancelRef}
          type="button"
          className="button button--small"
          disabled={answered}
          onClick={() => {
            respond('deny');
          }}
        >
          {t('balloon.permission.cancel')}
        </button>
        <button
          type="button"
          className={destructive ? 'button button--small' : 'button button--small button--primary'}
          disabled={answered}
          onClick={() => {
            respond('once');
          }}
        >
          {t('balloon.permission.once')}
        </button>
        {prompt.scopes.includes('session') && (
          <button
            type="button"
            className="button button--small"
            disabled={answered}
            onClick={() => {
              respond('session');
            }}
          >
            {t('balloon.permission.session')}
          </button>
        )}
        {prompt.scopes.includes('always') && (
          <button
            type="button"
            className="button button--small"
            disabled={answered}
            onClick={() => {
              respond('always');
            }}
          >
            {t('balloon.permission.always')}
          </button>
        )}
      </div>
      <p className="permission__timeout">{t('balloon.permission.timeout', { minutes })}</p>
    </div>
  );
}
