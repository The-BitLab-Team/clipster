import type { Locale } from '../i18n';
import type { PersonalityId } from '../schemas/settings';
import { helpful } from './helpful';
import type { LocalizedString, PersonalityProfile } from './types';
import { witty } from './witty';

/**
 * Registro das personalidades (SPEC §7). Único lugar com prompts e falas por personalidade.
 * Este módulo não usa Zod para poder ser importado pelo balão; a validação dos perfis
 * fica em `schema.ts` e roda no main e nos testes.
 */

export type { LocalizedString, PersonalityProfile } from './types';
export { BASE_INSTRUCTIONS } from './base';

export const DEFAULT_PERSONALITY: PersonalityId = 'helpful';

export const PERSONALITIES: Readonly<Record<PersonalityId, PersonalityProfile>> = {
  helpful,
  witty
};

/** Perfil pelo id; id desconhecido (ex.: de uma versão futura) cai no Prestativo. */
export function getPersonality(id: string): PersonalityProfile {
  return Object.hasOwn(PERSONALITIES, id)
    ? PERSONALITIES[id as PersonalityId] // checado por Object.hasOwn acima
    : PERSONALITIES[DEFAULT_PERSONALITY];
}

export function localized(text: LocalizedString, locale: Locale): string {
  return text[locale];
}

/** Escolhe uma fala de uma lista. `random` é injetável para testes. */
export function pickLine(
  lines: readonly LocalizedString[],
  locale: Locale,
  random: () => number = Math.random
): string {
  const index = Math.min(lines.length - 1, Math.floor(random() * lines.length));
  const line = lines[Math.max(0, index)];
  return line === undefined ? '' : line[locale];
}
