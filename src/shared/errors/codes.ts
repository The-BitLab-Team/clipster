/**
 * Códigos de erro do Clipster (SPEC §23). O main só envia o código; o texto vem do i18n,
 * no idioma da interface e no tom da personalidade quando o erro pode ser suavizado.
 */
export const CLIPSTER_ERROR_CODES = [
  'PROVIDER_NOT_CONFIGURED',
  'AUTH_INVALID',
  'MODEL_NOT_FOUND',
  'RATE_LIMITED',
  'QUOTA_OR_BILLING',
  'PROVIDER_OVERLOADED',
  'TIMEOUT',
  'OFFLINE',
  'CONTEXT_TOO_LONG',
  'CANCELLED',
  'SECURE_STORAGE_UNAVAILABLE',
  'STORAGE_RESET',
  'IPC_FAILURE',
  'UNKNOWN'
] as const;

export type ClipsterErrorCode = (typeof CLIPSTER_ERROR_CODES)[number];

/** Erros em que o modo Espirituoso pode usar uma frase mais leve (mesma clareza e ação). */
export const SOFTENABLE_ERROR_CODES = [
  'PROVIDER_NOT_CONFIGURED',
  'RATE_LIMITED',
  'PROVIDER_OVERLOADED',
  'TIMEOUT',
  'OFFLINE',
  'CONTEXT_TOO_LONG',
  'STORAGE_RESET'
] as const satisfies readonly ClipsterErrorCode[];

export type SoftenableErrorCode = (typeof SOFTENABLE_ERROR_CODES)[number];

/** Erros que aparecem numa resposta (CANCELLED não é erro: a resposta fica "interrompida"). */
export type DisplayedErrorCode = Exclude<ClipsterErrorCode, 'CANCELLED'>;

export type ErrorAction =
  'configureAi' | 'useDemo' | 'openSettings' | 'chooseModel' | 'retry' | 'newConversation';

/** Ações oferecidas junto com cada erro (SPEC §23). */
export const ERROR_ACTIONS: Readonly<Record<ClipsterErrorCode, readonly ErrorAction[]>> = {
  PROVIDER_NOT_CONFIGURED: ['configureAi', 'useDemo'],
  AUTH_INVALID: ['openSettings'],
  MODEL_NOT_FOUND: ['chooseModel'],
  RATE_LIMITED: ['retry'],
  QUOTA_OR_BILLING: ['openSettings'],
  PROVIDER_OVERLOADED: ['retry'],
  TIMEOUT: ['retry'],
  OFFLINE: ['retry'],
  CONTEXT_TOO_LONG: ['newConversation'],
  CANCELLED: [],
  SECURE_STORAGE_UNAVAILABLE: [],
  STORAGE_RESET: [],
  IPC_FAILURE: ['retry'],
  UNKNOWN: ['retry']
};

export function isSoftenable(code: ClipsterErrorCode): code is SoftenableErrorCode {
  return (SOFTENABLE_ERROR_CODES as readonly string[]).includes(code);
}

export function isClipsterErrorCode(value: unknown): value is ClipsterErrorCode {
  return typeof value === 'string' && (CLIPSTER_ERROR_CODES as readonly string[]).includes(value);
}
