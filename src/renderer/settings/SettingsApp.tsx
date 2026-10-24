import { useEffect, useState, useSyncExternalStore, type ComponentType } from 'react';
import appIconUrl from '../../../assets/icons/app.svg';
import {
  createTranslator,
  localeFromLanguageTag,
  resolveLocale,
  type Locale,
  type TranslationKey
} from '../../shared/i18n';
import { isSettingsSection } from '../../shared/constants/sections';
import type {
  SettingsPatch,
  SettingsSection,
  ThemePreference
} from '../../shared/schemas/settings';
import {
  AboutSection,
  AiSection,
  AppearanceSection,
  GeneralSection,
  PersonalitySection,
  PrivacySection,
  type SectionProps
} from './sections';
import { getSnapshot, subscribe, updateSettings } from './settingsClient';

const SECTIONS: readonly {
  id: SettingsSection;
  label: TranslationKey;
  component: ComponentType<SectionProps>;
}[] = [
  { id: 'general', label: 'settings.section.general', component: GeneralSection },
  { id: 'ai', label: 'settings.section.ai', component: AiSection },
  { id: 'personality', label: 'settings.section.personality', component: PersonalitySection },
  { id: 'appearance', label: 'settings.section.appearance', component: AppearanceSection },
  { id: 'privacy', label: 'settings.section.privacy', component: PrivacySection },
  { id: 'about', label: 'settings.section.about', component: AboutSection }
];

function initialSection(): SettingsSection {
  const requested = new URLSearchParams(window.location.search).get('section');
  return isSettingsSection(requested) ? requested : 'general';
}

function applyTheme(theme: ThemePreference): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function applyDocumentLocale(locale: Locale): void {
  document.documentElement.lang = locale;
  document.title = createTranslator(locale)('settings.title');
}

export function SettingsApp() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => window.clipster.windows.onSettingsNavigate(setSection), []);

  const ready = snapshot.status === 'ready' ? snapshot : null;
  const locale = ready
    ? resolveLocale(ready.settings.general.language, ready.info.systemLanguages)
    : localeFromLanguageTag(navigator.language);
  const t = createTranslator(locale);
  const theme = ready?.settings.appearance.theme ?? 'system';

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const save = (patch: SettingsPatch): void => {
    void updateSettings(patch).then((result) => {
      setSaveError(result.ok ? null : t('settings.saveError', { message: result.error.message }));
    });
  };

  if (snapshot.status === 'loading') {
    return <p className="status">{t('settings.loading')}</p>;
  }
  if (ready === null) {
    return (
      <p className="status status--error" role="alert">
        {t('settings.loadError')}
      </p>
    );
  }

  const current = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];
  if (current === undefined) return null;
  const Section = current.component;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <img src={appIconUrl} alt="" width={36} height={36} />
          <span className="brand__name">{t('app.name')}</span>
        </div>
        <nav aria-label={t('settings.nav.label')}>
          <ul className="nav">
            {SECTIONS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="nav__item"
                  aria-current={item.id === section ? 'page' : undefined}
                  onClick={() => {
                    setSection(item.id);
                  }}
                >
                  {t(item.label)}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="content" aria-labelledby="section-title">
        <h1 id="section-title" className="content__title">
          {t(current.label)}
        </h1>
        {saveError !== null && (
          <p className="banner banner--error" role="alert">
            {saveError}
          </p>
        )}
        <Section settings={ready.settings} info={ready.info} t={t} save={save} />
      </main>
    </div>
  );
}
