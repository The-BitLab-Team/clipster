import {
  SUPPORTED_LOCALES,
  translate,
  type TranslationKey,
  type TranslationVars
} from '../../shared/i18n';
import type { LocalizedString } from '../../shared/personalities/types';

/** Um texto do i18n nos dois idiomas, para o balão mostrar no idioma da interface. */
export function localizedText(key: TranslationKey, vars?: TranslationVars): LocalizedString {
  const entries = SUPPORTED_LOCALES.map((locale) => [locale, translate(locale, key, vars)]);
  return Object.fromEntries(entries) as LocalizedString; // SUPPORTED_LOCALES cobre todos os Locale
}
