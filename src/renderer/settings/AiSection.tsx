import { useEffect, useState } from 'react';
import type {
  ConnectionErrorCode,
  ConnectionResult,
  KeyedProvider,
  KeyStatus,
  ModelInfo
} from '../../shared/ai/providers';
import {
  isHttpUrl,
  SERVER_PRESETS,
  sendsKeyInsecurely,
  type ServerPreset
} from '../../shared/ai/urls';
import { errorMessage } from '../../shared/errors/messages';
import type { Translator } from '../../shared/i18n';
import type { AiProviderId } from '../../shared/schemas/settings';
import { Card, SelectField } from './fields';
import type { SectionProps } from './sections';

/**
 * Configurações › IA (SPEC §12, §20.4, §21): provedor, endereço do servidor, chave só de
 * escrita (mostra só "•••• 1234"), modelo vindo da lista do provedor (ou digitado) e
 * "Testar conexão". Nenhum nome de modelo fixo no código.
 */

const CUSTOM_MODEL = '__custom__';

/** Texto de um erro de conexão; nas Configurações o tom é sempre neutro. */
export function connectionErrorText(t: Translator, code: ConnectionErrorCode): string {
  switch (code) {
    case 'NOT_COMPATIBLE':
      return t('settings.ai.connection.notCompatible');
    case 'MISSING_KEY':
      return t('settings.ai.connection.missingKey');
    case 'UNKNOWN':
      return t('settings.ai.connection.unknown');
    default:
      return errorMessage(t, { code }, 'helpful');
  }
}

export function AiSection({ settings, t, save }: SectionProps) {
  const { ai } = settings;
  const providers: { value: AiProviderId; label: string }[] = [
    { value: 'none', label: t('settings.ai.provider.none') },
    { value: 'demo', label: t('settings.ai.provider.demo') },
    { value: 'openai-compatible', label: t('settings.ai.provider.openaiCompatible') },
    { value: 'anthropic', label: t('settings.ai.provider.anthropic') }
  ];
  const hints: Record<AiProviderId, string> = {
    none: t('settings.ai.noneHint'),
    demo: t('settings.ai.demoHint'),
    'openai-compatible': t('settings.ai.openaiHint'),
    anthropic: t('settings.ai.anthropicHint')
  };

  return (
    <>
      <Card>
        <SelectField
          id="ai-provider"
          layout="column"
          label={t('settings.ai.provider')}
          hint={hints[ai.provider]}
          value={ai.provider}
          options={providers}
          onChange={(provider) => {
            save({ ai: { provider } });
          }}
        />
      </Card>

      {ai.provider === 'openai-compatible' && (
        <>
          <h2 className="subsection-title">{t('settings.ai.serverCard')}</h2>
          <Card>
            <ServerField
              t={t}
              baseUrl={ai.openaiCompatible.baseUrl}
              onSave={(baseUrl) => {
                save({ ai: { openaiCompatible: { ...ai.openaiCompatible, baseUrl } } });
              }}
            />
            <KeyField
              key={`key-${ai.openaiCompatible.baseUrl}`}
              t={t}
              provider="openai-compatible"
              optional={new URL(ai.openaiCompatible.baseUrl).hostname !== 'api.openai.com'}
              insecureTransport={sendsKeyInsecurely(ai.openaiCompatible.baseUrl)}
            />
          </Card>
          <Card>
            <ModelField
              key={`model-${ai.openaiCompatible.baseUrl}`}
              t={t}
              provider="openai-compatible"
              model={ai.openaiCompatible.model}
              onSelect={(model) => {
                save({ ai: { openaiCompatible: { ...ai.openaiCompatible, model } } });
              }}
            />
            <ConnectionTest t={t} provider="openai-compatible" />
          </Card>
        </>
      )}

      {ai.provider === 'anthropic' && (
        <>
          <Card>
            <KeyField t={t} provider="anthropic" optional={false} insecureTransport={false} />
          </Card>
          <Card>
            <ModelField
              t={t}
              provider="anthropic"
              model={ai.anthropic.model}
              onSelect={(model) => {
                save({ ai: { anthropic: { model } } });
              }}
            />
            <ConnectionTest t={t} provider="anthropic" />
          </Card>
        </>
      )}

      <p className="field__hint section-note">{t('settings.ai.privacyNote')}</p>
    </>
  );
}

// ───────────────────────── endereço ─────────────────────────

function ServerField({
  t,
  baseUrl,
  onSave
}: {
  t: Translator;
  baseUrl: string;
  onSave: (baseUrl: string) => void;
}) {
  const [draft, setDraft] = useState(baseUrl);
  const [invalid, setInvalid] = useState(false);
  const commit = (value: string): void => {
    const trimmed = value.trim();
    if (!isHttpUrl(trimmed)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (trimmed !== baseUrl) onSave(trimmed);
  };
  return (
    <div className="field field--column">
      <div className="field__header">
        <label htmlFor="ai-base-url" className="field__label">
          {t('settings.ai.server')}
        </label>
        <div className="presets" role="group" aria-label={t('settings.ai.presets')}>
          {(Object.keys(SERVER_PRESETS) as ServerPreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              className="chip"
              aria-pressed={baseUrl === SERVER_PRESETS[preset]}
              onClick={() => {
                setDraft(SERVER_PRESETS[preset]);
                commit(SERVER_PRESETS[preset]);
              }}
            >
              {t(`settings.ai.preset.${preset}`)}
            </button>
          ))}
        </div>
      </div>
      <input
        id="ai-base-url"
        className="text-input mono"
        type="url"
        inputMode="url"
        spellCheck={false}
        value={draft}
        aria-invalid={invalid}
        aria-describedby="ai-base-url-hint"
        onChange={(event) => {
          setDraft(event.currentTarget.value);
        }}
        onBlur={(event) => {
          commit(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(event.currentTarget.value);
        }}
      />
      <p id="ai-base-url-hint" className={invalid ? 'field__error' : 'field__hint'}>
        {invalid ? t('settings.ai.server.invalid') : t('settings.ai.server.hint')}
      </p>
    </div>
  );
}

// ───────────────────────── chave ─────────────────────────

function KeyField({
  t,
  provider,
  optional,
  insecureTransport
}: {
  t: Translator;
  provider: KeyedProvider;
  optional: boolean;
  insecureTransport: boolean;
}) {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [value, setValue] = useState('');
  const [acceptInsecure, setAcceptInsecure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void window.clipster.ai.keyStatus(provider).then((result) => {
      if (alive && result.ok) setStatus(result.data);
    });
    return () => {
      alive = false;
    };
  }, [provider]);

  const saveKey = (): void => {
    if (value.trim() === '' || busy) return;
    setBusy(true);
    void window.clipster.ai
      .setKey(provider, value.trim(), acceptInsecure ? true : undefined)
      .then((result) => {
        setBusy(false);
        if (result.ok) {
          setStatus(result.data);
          setValue('');
          setError(null);
        } else if (result.error.code === 'INSECURE_STORAGE') {
          setError(t('settings.ai.key.insecure'));
        } else if (result.error.code === 'INVALID_PAYLOAD') {
          setError(t('settings.ai.key.invalid'));
        } else {
          setError(t('settings.saveError', { message: result.error.message }));
        }
      });
  };

  const removeKey = (): void => {
    void window.clipster.ai.clearKey(provider).then((result) => {
      if (result.ok) setStatus(result.data);
    });
  };

  const storedHere = status?.hasKey === true && status.source === 'stored';
  // Sem cofre seguro: avisa antes de salvar. Se a chave é opcional, só quando o usuário começa a digitar.
  const needsConfirm =
    status !== null && !status.secureBackend && !storedHere && (!optional || value.trim() !== '');

  return (
    <div className="field field--column" data-testid={`key-${provider}`}>
      <label htmlFor={`ai-key-${provider}`} className="field__label">
        {t('settings.ai.key')}
      </label>
      {status?.hasKey === true ? (
        <div className="key-row">
          <span className="key-saved" role="status">
            {status.source === 'env'
              ? t('settings.ai.key.fromEnv')
              : status.hint === null
                ? t('settings.ai.key.savedNoHint')
                : t('settings.ai.key.saved', { hint: status.hint })}
          </span>
          {status.source === 'stored' && (
            <button type="button" className="button" onClick={removeKey}>
              {t('settings.ai.key.remove')}
            </button>
          )}
        </div>
      ) : (
        <form
          className="key-row"
          onSubmit={(event) => {
            event.preventDefault();
            saveKey();
          }}
        >
          <input
            id={`ai-key-${provider}`}
            className="text-input mono"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('settings.ai.key.placeholder')}
            value={value}
            onChange={(event) => {
              setValue(event.currentTarget.value);
            }}
          />
          <button
            type="submit"
            className="button button--primary"
            disabled={value.trim() === '' || busy || (needsConfirm && !acceptInsecure)}
          >
            {t('settings.ai.key.save')}
          </button>
        </form>
      )}
      {needsConfirm && (
        <div className="warning" role="note">
          <p>{t('settings.ai.key.insecure')}</p>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={acceptInsecure}
              onChange={(event) => {
                setAcceptInsecure(event.currentTarget.checked);
              }}
            />
            {t('settings.ai.key.insecureConfirm')}
          </label>
        </div>
      )}
      {status?.originMismatch === true && status.savedFor !== null && (
        <p className="field__hint">
          {t('settings.ai.key.otherServer', { origin: status.savedFor })}
        </p>
      )}
      {insecureTransport && <p className="warning">{t('settings.ai.key.httpWarning')}</p>}
      {error !== null && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <p className="field__hint">
        {optional ? `${t('settings.ai.key.optional')} ` : ''}
        {t('settings.ai.key.never')}
      </p>
    </div>
  );
}

// ───────────────────────── modelo ─────────────────────────

type ModelsState =
  | { kind: 'loading' }
  | { kind: 'ready'; models: ModelInfo[] }
  | { kind: 'error'; code: ConnectionErrorCode };

function ModelField({
  t,
  provider,
  model,
  onSelect
}: {
  t: Translator;
  provider: KeyedProvider;
  model: string;
  onSelect: (model: string) => void;
}) {
  const [state, setState] = useState<ModelsState>({ kind: 'loading' });
  const [version, setVersion] = useState(0);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(model);

  useEffect(() => {
    let alive = true;
    void window.clipster.ai.listModels(provider).then((result) => {
      if (!alive) return;
      if (!result.ok) setState({ kind: 'error', code: 'UNKNOWN' });
      else if (result.data.status === 'ok') setState({ kind: 'ready', models: result.data.models });
      else setState({ kind: 'error', code: result.data.code });
    });
    // A chave pode chegar depois: o status da IA avisa quando algo muda.
    const unsubscribe = window.clipster.ai.onStatus(() => {
      setVersion((current) => current + 1);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [provider, version]);

  const models = state.kind === 'ready' ? state.models : [];
  const known = models.some((item) => item.id === model);
  const options: { value: string; label: string }[] = [
    { value: '', label: t('settings.ai.model.choose') },
    ...models.map((item) => ({
      value: item.id,
      label:
        item.deprecated === true
          ? t('settings.ai.model.deprecated', { name: item.name })
          : item.name
    })),
    ...(model !== '' && !known ? [{ value: model, label: model }] : []),
    { value: CUSTOM_MODEL, label: t('settings.ai.model.custom') }
  ];
  const showCustom = custom || (model !== '' && !known && state.kind !== 'loading');

  return (
    <div className="field field--column">
      <div className="field__header">
        <label htmlFor="ai-model" className="field__label">
          {t('settings.ai.model')}
        </label>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setState({ kind: 'loading' });
            setVersion((current) => current + 1);
          }}
        >
          {t('settings.ai.model.refresh')}
        </button>
      </div>
      <select
        id="ai-model"
        className="select"
        value={custom ? CUSTOM_MODEL : model}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === CUSTOM_MODEL) {
            setCustom(true);
            return;
          }
          setCustom(false);
          setDraft(value);
          onSelect(value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {state.kind === 'loading' && <p className="field__hint">{t('settings.ai.model.loading')}</p>}
      {state.kind === 'ready' && models.length === 0 && (
        <p className="field__hint">{t('settings.ai.model.empty')}</p>
      )}
      {state.kind === 'error' && (
        <p className="field__hint" role="status">
          {t('settings.ai.model.listFailed', { reason: connectionErrorText(t, state.code) })}
        </p>
      )}
      {showCustom && (
        <>
          <label htmlFor="ai-model-custom" className="field__label field__label--small">
            {t('settings.ai.model.customLabel')}
          </label>
          <input
            id="ai-model-custom"
            className="text-input mono"
            spellCheck={false}
            value={draft}
            aria-describedby="ai-model-custom-hint"
            onChange={(event) => {
              setDraft(event.currentTarget.value);
            }}
            onBlur={(event) => {
              const value = event.currentTarget.value.trim();
              if (value !== model) onSelect(value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                const value = event.currentTarget.value.trim();
                if (value !== model) onSelect(value);
              }
            }}
          />
          <p id="ai-model-custom-hint" className="field__hint">
            {t('settings.ai.model.customHint')}
          </p>
        </>
      )}
    </div>
  );
}

// ───────────────────────── testar conexão ─────────────────────────

function ConnectionTest({ t, provider }: { t: Translator; provider: KeyedProvider }) {
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [testing, setTesting] = useState(false);
  return (
    <div className="field field--row">
      <p
        className="connection"
        role="status"
        data-testid="connection-status"
        data-status={result?.status}
      >
        {testing
          ? t('settings.ai.testing')
          : result === null
            ? ''
            : result.status === 'connected'
              ? t('settings.ai.connection.ok', { count: result.modelCount })
              : connectionErrorText(t, result.code)}
      </p>
      <button
        type="button"
        className="button"
        disabled={testing}
        onClick={() => {
          setTesting(true);
          void window.clipster.ai.testConnection(provider).then((response) => {
            setTesting(false);
            setResult(response.ok ? response.data : { status: 'error', code: 'UNKNOWN' });
          });
        }}
      >
        {t('settings.ai.test')}
      </button>
    </div>
  );
}
