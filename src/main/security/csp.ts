/**
 * Content Security Policy (SPEC §26, item 3).
 * Produção: nenhuma rede, nenhum script ou estilo inline.
 * Desenvolvimento: libera só o necessário para o HMR do Vite.
 */
export const PRODUCTION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ');

export function developmentCsp(devServerOrigin: string): string {
  const ws = devServerOrigin.replace(/^http/, 'ws');
  return [
    "default-src 'none'",
    // O preâmbulo do React Refresh é um script inline: aceitável apenas em dev.
    `script-src 'self' 'unsafe-inline' ${devServerOrigin}`,
    `style-src 'self' 'unsafe-inline' ${devServerOrigin}`,
    `img-src 'self' data: ${devServerOrigin}`,
    `font-src 'self' ${devServerOrigin}`,
    `connect-src 'self' ${devServerOrigin} ${ws}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ');
}
