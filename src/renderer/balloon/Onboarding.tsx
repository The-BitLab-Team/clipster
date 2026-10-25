import { useState, type RefObject } from 'react';
import type { Translator } from '../../shared/i18n';
import type { LanguagePreference, PersonalityId, Settings } from '../../shared/schemas/settings';

/**
 * Primeira execução (SPEC §9): no máximo 3 passos curtos dentro do balão, que podem ser
 * pulados (Esc ou "Pular"). As escolhas valem na hora; ao terminar, o main grava
 * `firstRunCompleted`.
 */

export interface OnboardingFinish {
  provider: 'none' | 'demo';
  configure: boolean;
}

interface OnboardingProps {
  t: Translator;
  settings: Settings;
  /** Recebe o foco quando o balão é aberto por ação do usuário. */
  primaryRef: RefObject<HTMLButtonElement | null>;
  onLanguage: (language: LanguagePreference) => void;
  onPersonality: (personality: PersonalityId) => void;
  onFinish: (result: OnboardingFinish) => void;
}

const TOTAL_STEPS = 3;
const PERSONALITIES: readonly PersonalityId[] = ['helpful', 'witty'];

export function Onboarding({
  t,
  settings,
  primaryRef,
  onLanguage,
  onPersonality,
  onFinish
}: OnboardingProps) {
  const [step, setStep] = useState(1);
  const skip = (): void => {
    onFinish({ provider: settings.ai.provider === 'demo' ? 'demo' : 'none', configure: false });
  };
  const languages: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t('settings.general.language.system') },
    { value: 'pt-BR', label: t('settings.general.language.pt-BR') },
    { value: 'en', label: t('settings.general.language.en') }
  ];

  return (
    <section className="onboarding" aria-label={t('onboarding.label')} data-step={step}>
      <p className="onboarding__progress">
        <span className="onboarding__dots" aria-hidden="true">
          {Array.from({ length: TOTAL_STEPS }, (_unused, index) => (
            <i key={index} data-active={index + 1 === step} />
          ))}
        </span>
        <span>{t('onboarding.step', { current: step, total: TOTAL_STEPS })}</span>
      </p>

      {step === 1 && (
        <>
          <h2 className="onboarding__title">{t('onboarding.greeting.title')}</h2>
          <p className="onboarding__body">{t('onboarding.greeting.body')}</p>
          <label className="onboarding__field">
            <span>{t('onboarding.language')}</span>
            <select
              className="select"
              value={settings.general.language}
              onChange={(event) => {
                const chosen = languages.find((item) => item.value === event.currentTarget.value);
                if (chosen !== undefined) onLanguage(chosen.value);
              }}
            >
              {languages.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {step === 2 && (
        <>
          <h2 className="onboarding__title">{t('onboarding.personality.title')}</h2>
          <p className="onboarding__body">{t('onboarding.personality.body')}</p>
          <div className="choices">
            {PERSONALITIES.map((id) => (
              <button
                key={id}
                type="button"
                className="choice-card"
                aria-pressed={settings.personality === id}
                onClick={() => {
                  onPersonality(id);
                }}
              >
                <span className="choice-card__name">{t(`personality.${id}.name`)}</span>
                <span className="choice-card__sample">{t(`personality.${id}.sample`)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h2 className="onboarding__title">{t('onboarding.ai.title')}</h2>
          <p className="onboarding__body">{t('onboarding.ai.body')}</p>
          <div className="onboarding__stack">
            <button
              ref={primaryRef}
              type="button"
              className="button button--primary"
              onClick={() => {
                onFinish({ provider: 'demo', configure: false });
              }}
            >
              {t('onboarding.ai.demo')}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                onFinish({ provider: 'none', configure: true });
              }}
            >
              {t('onboarding.ai.configure')}
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                onFinish({ provider: 'none', configure: false });
              }}
            >
              {t('onboarding.ai.later')}
            </button>
          </div>
          <p className="onboarding__note">{t('onboarding.ai.permissions')}</p>
        </>
      )}

      {step < TOTAL_STEPS && (
        <div className="onboarding__footer">
          <button type="button" className="button button--ghost" onClick={skip}>
            {t('onboarding.skip')}
          </button>
          <button
            ref={primaryRef}
            type="button"
            className="button button--primary"
            onClick={() => {
              setStep((current) => current + 1);
            }}
          >
            {t('onboarding.next')}
          </button>
        </div>
      )}
    </section>
  );
}
