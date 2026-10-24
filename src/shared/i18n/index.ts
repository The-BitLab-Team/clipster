import type { LanguagePreference } from '../schemas/settings';
import { en } from './en';
import { ptBR } from './pt-BR';

export type Locale = 'pt-BR' | 'en';
export type TranslationKey = keyof typeof ptBR;
export type TranslationVars = Readonly<Record<string, string | number>>;
export type Translator = (key: TranslationKey, vars?: TranslationVars) => string;

export const SUPPORTED_LOCALES: readonly Locale[] = ['pt-BR', 'en'];

const dictionaries: Readonly<Record<Locale, Readonly<Record<TranslationKey, string>>>> = {
  'pt-BR': ptBR,
  en
};

/** Qualquer variante `pt*` vira pt-BR; o resto vira inglês (SPEC §4). */
export function localeFromLanguageTag(tag: string): Locale {
  return tag.trim().toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

export function resolveLocale(
  preference: LanguagePreference,
  systemLanguages: readonly string[]
): Locale {
  if (preference !== 'system') return preference;
  const first = systemLanguages.find((tag) => tag.trim().length > 0);
  return first === undefined ? 'en' : localeFromLanguageTag(first);
}

export function translate(locale: Locale, key: TranslationKey, vars?: TranslationVars): string {
  const template = dictionaries[locale][key];
  if (vars === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

export function createTranslator(locale: Locale): Translator {
  return (key, vars) => translate(locale, key, vars);
}

export function dictionaryKeys(locale: Locale): string[] {
  return Object.keys(dictionaries[locale]).sort();
}
