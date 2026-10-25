import { randomBytes } from 'node:crypto';
import type { ChatErrorInfo } from '../../shared/ai/conversation';
import type { ClipsterErrorCode, DisplayedErrorCode } from '../../shared/errors/codes';

/**
 * Erro interno do Clipster (SPEC §23). A mensagem técnica fica só no log; a interface
 * recebe apenas o código e mostra o texto amigável do i18n. Nunca há stack trace na tela.
 */
export class ClipsterError extends Error {
  readonly code: ClipsterErrorCode;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    code: ClipsterErrorCode,
    detail?: string,
    options: { retryAfterSeconds?: number; cause?: unknown } = {}
  ) {
    super(detail ?? code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ClipsterError';
    this.code = code;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** Qualquer erro vira ClipsterError; o que não for conhecido vira UNKNOWN. */
export function toClipsterError(error: unknown): ClipsterError {
  if (error instanceof ClipsterError) return error;
  return new ClipsterError('UNKNOWN', error instanceof Error ? error.message : String(error), {
    cause: error
  });
}

/** Código curto para o usuário informar ao suporte; o mesmo código vai para o log. */
export function newSupportCode(): string {
  return `CLP-${randomBytes(2).toString('hex').toUpperCase()}`;
}

/** Informação de erro que vai para o balão: só código, espera e código de suporte. */
export function toErrorInfo(
  error: ClipsterError,
  supportCode: string,
  consoleUrl?: string
): ChatErrorInfo {
  const code: DisplayedErrorCode = error.code === 'CANCELLED' ? 'UNKNOWN' : error.code;
  const info: ChatErrorInfo = { code, supportCode };
  if (code === 'RATE_LIMITED' && error.retryAfterSeconds !== undefined) {
    info.retryAfterSeconds = error.retryAfterSeconds;
  }
  if (code === 'QUOTA_OR_BILLING' && consoleUrl !== undefined) info.consoleUrl = consoleUrl;
  return info;
}
