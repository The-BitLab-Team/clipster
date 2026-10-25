import type { ChatErrorInfo } from '../ai/conversation';
import type { Translator } from '../i18n';
import type { PersonalityId } from '../schemas/settings';
import { ERROR_ACTIONS, isSoftenable, type ErrorAction } from './codes';

/**
 * Texto amigável de um erro (SPEC §23), no idioma da interface. O Espirituoso usa uma frase
 * mais leve só nos erros em que isso é permitido; erros graves são sempre neutros.
 */
export function errorMessage(
  t: Translator,
  error: ChatErrorInfo,
  personality: PersonalityId
): string {
  const { code } = error;
  if (code === 'UNKNOWN') return t('error.UNKNOWN', { code: error.supportCode ?? 'CLP-0000' });
  if (code === 'RATE_LIMITED' && error.retryAfterSeconds === undefined) {
    return t('error.RATE_LIMITED.noDelay');
  }
  const vars = { seconds: error.retryAfterSeconds ?? 0 };
  if (personality === 'witty' && isSoftenable(code)) return t(`error.${code}.witty`, vars);
  return t(`error.${code}`, vars);
}

export function errorActions(error: ChatErrorInfo): readonly ErrorAction[] {
  return ERROR_ACTIONS[error.code];
}

/** O código de suporte aparece à parte, exceto em UNKNOWN, cuja frase já o inclui. */
export function showsSupportCode(error: ChatErrorInfo): boolean {
  return error.code !== 'UNKNOWN' && error.supportCode !== undefined;
}
