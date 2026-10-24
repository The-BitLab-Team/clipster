import { CHARACTER_SCALE } from '../../shared/constants/ui';
import type { Translator } from '../../shared/i18n';
import type { AppInfo } from '../../shared/ipc/api';
import type {
  AnimationPreference,
  LanguagePreference,
  PersonalityId,
  Settings,
  SettingsPatch,
  SleepAfterMinutes,
  ThemePreference
} from '../../shared/schemas/settings';
import { Card, RangeField, SelectField, ToggleField } from './fields';

export interface SectionProps {
  settings: Settings;
  info: AppInfo;
  t: Translator;
  save: (patch: SettingsPatch) => void;
}

const SLEEP_OPTIONS: readonly SleepAfterMinutes[] = [5, 10, 30, 0];
type SleepOptionValue = `${SleepAfterMinutes}`;
const SLEEP_BY_VALUE: Readonly<Record<SleepOptionValue, SleepAfterMinutes>> = {
  '0': 0,
  '5': 5,
  '10': 10,
  '30': 30
};

function sleepOptionValue(minutes: SleepAfterMinutes): SleepOptionValue {
  return `${minutes}`;
}

export function GeneralSection({ settings, info, t, save }: SectionProps) {
  const { general } = settings;
  const languages: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t('settings.general.language.system') },
    { value: 'pt-BR', label: t('settings.general.language.pt-BR') },
    { value: 'en', label: t('settings.general.language.en') }
  ];
  return (
    <Card>
      <SelectField
        id="language"
        label={t('settings.general.language')}
        value={general.language}
        options={languages}
        onChange={(language) => {
          save({ general: { language } });
        }}
      />
      <ToggleField
        id="launch-at-login"
        label={t('settings.general.launchAtLogin')}
        hint={
          info.capabilities.launchAtLogin
            ? undefined
            : t('settings.general.launchAtLogin.unsupported')
        }
        checked={general.launchAtLogin}
        disabled={!info.capabilities.launchAtLogin}
        onChange={(launchAtLogin) => {
          save({ general: { launchAtLogin } });
        }}
      />
      <ToggleField
        id="start-hidden"
        label={t('settings.general.startHidden')}
        checked={general.startHidden}
        onChange={(startHidden) => {
          save({ general: { startHidden } });
        }}
      />
      <ToggleField
        id="always-on-top"
        label={t('settings.general.alwaysOnTop')}
        checked={general.alwaysOnTop}
        onChange={(alwaysOnTop) => {
          save({ general: { alwaysOnTop } });
        }}
      />
      <ToggleField
        id="quiet-mode"
        label={t('settings.general.quietMode')}
        hint={t('settings.general.quietMode.hint')}
        checked={general.quietMode}
        onChange={(quietMode) => {
          save({ general: { quietMode } });
        }}
      />
      <SelectField
        id="sleep-after"
        label={t('settings.general.sleepAfter')}
        hint={t('settings.general.sleepAfter.hint')}
        value={sleepOptionValue(general.sleepAfterMinutes)}
        options={SLEEP_OPTIONS.map((minutes) => ({
          value: sleepOptionValue(minutes),
          label: t(`settings.general.sleepAfter.${sleepOptionValue(minutes)}`)
        }))}
        onChange={(value) => {
          save({ general: { sleepAfterMinutes: SLEEP_BY_VALUE[value] } });
        }}
      />
    </Card>
  );
}

export function AiSection({ t }: SectionProps) {
  return (
    <Card>
      <p className="prose">{t('settings.ai.placeholder')}</p>
    </Card>
  );
}

export function PersonalitySection({ settings, t, save }: SectionProps) {
  const options: { id: PersonalityId; name: string; description: string; sample: string }[] = [
    {
      id: 'helpful',
      name: t('personality.helpful.name'),
      description: t('personality.helpful.description'),
      sample: t('personality.helpful.sample')
    },
    {
      id: 'witty',
      name: t('personality.witty.name'),
      description: t('personality.witty.description'),
      sample: t('personality.witty.sample')
    }
  ];
  return (
    <>
      <fieldset className="choice-group">
        <legend className="visually-hidden">{t('settings.section.personality')}</legend>
        {options.map((option) => (
          <label
            key={option.id}
            className="choice"
            data-selected={settings.personality === option.id}
          >
            <input
              type="radio"
              name="personality"
              value={option.id}
              checked={settings.personality === option.id}
              onChange={() => {
                save({ personality: option.id });
              }}
            />
            <span className="choice__body">
              <span className="choice__title">{option.name}</span>
              <span className="choice__description">{option.description}</span>
              <span className="choice__sample">{option.sample}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="field__hint section-note">{t('settings.personality.hint')}</p>
    </>
  );
}

export function AppearanceSection({ settings, t, save }: SectionProps) {
  const { appearance } = settings;
  const animations: { value: AnimationPreference; label: string }[] = [
    { value: 'system', label: t('settings.appearance.animations.system') },
    { value: 'full', label: t('settings.appearance.animations.full') },
    { value: 'reduced', label: t('settings.appearance.animations.reduced') },
    { value: 'off', label: t('settings.appearance.animations.off') }
  ];
  const themes: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('settings.appearance.theme.system') },
    { value: 'light', label: t('settings.appearance.theme.light') },
    { value: 'dark', label: t('settings.appearance.theme.dark') }
  ];
  return (
    <Card>
      <RangeField
        id="character-scale"
        label={t('settings.appearance.characterScale')}
        min={CHARACTER_SCALE.min}
        max={CHARACTER_SCALE.max}
        step={CHARACTER_SCALE.step}
        value={appearance.characterScale}
        format={(value) => `${Math.round(value * 100).toString()}%`}
        onChange={(characterScale) => {
          save({ appearance: { characterScale: Math.round(characterScale * 100) / 100 } });
        }}
      />
      <SelectField
        id="animations"
        label={t('settings.appearance.animations')}
        value={appearance.animations}
        options={animations}
        onChange={(value) => {
          save({ appearance: { animations: value } });
        }}
      />
      <SelectField
        id="theme"
        label={t('settings.appearance.theme')}
        value={appearance.theme}
        options={themes}
        onChange={(theme) => {
          save({ appearance: { theme } });
        }}
      />
    </Card>
  );
}

export function PrivacySection({ t }: SectionProps) {
  return (
    <Card>
      <ul className="checklist">
        <li>{t('settings.privacy.summary')}</li>
        <li>{t('settings.privacy.local')}</li>
        <li>{t('settings.privacy.noTelemetry')}</li>
      </ul>
    </Card>
  );
}

export function AboutSection({ info, t }: SectionProps) {
  const repositoryUrl = info.repositoryUrl;
  return (
    <Card>
      <dl className="facts">
        <div>
          <dt>{t('settings.about.version')}</dt>
          <dd>
            <span className="mono">{info.version}</span>
            <span className="facts__sub">
              {t('settings.about.runtime', { electron: info.electron, chrome: info.chrome })}
            </span>
          </dd>
        </div>
        <div>
          <dt>{t('settings.about.license')}</dt>
          <dd>{t('settings.about.licenseValue')}</dd>
        </div>
        {repositoryUrl !== null && (
          <div>
            <dt>{t('settings.about.repository')}</dt>
            <dd>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  void window.clipster.shell.openExternal(repositoryUrl);
                }}
              >
                {repositoryUrl}
              </button>
            </dd>
          </div>
        )}
      </dl>
      <div className="actions">
        <button
          type="button"
          className="button"
          onClick={() => {
            void window.clipster.diagnostics.openLogs();
          }}
        >
          {t('settings.about.openLogs')}
        </button>
      </div>
      <p className="field__hint">{t('settings.about.disclaimer')}</p>
    </Card>
  );
}
