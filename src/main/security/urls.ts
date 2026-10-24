import { APP_HOST, APP_PROTOCOL } from '../../shared/constants/app';

/**
 * URLs externas só podem ser http(s), sem credenciais embutidas (SPEC §26, item 7).
 * A análise usa `URL`; nunca comparação de prefixo.
 */
export function isSafeExternalUrl(input: string): boolean {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username !== '' || url.password !== '') return false;
  return url.hostname.length > 0;
}

export interface TrustedOrigins {
  /** Origem do servidor de desenvolvimento do Vite, quando houver. */
  devServerOrigin: string | null;
}

/**
 * Um frame só pode falar com o main se veio do protocolo do app ou do servidor de dev.
 * Esquemas não especiais (como `app:`) têm `origin === "null"`, por isso comparamos
 * protocolo e host diretamente.
 */
export function isTrustedRendererUrl(input: string, trusted: TrustedOrigins): boolean {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (url.protocol === `${APP_PROTOCOL}:` && url.host === APP_HOST) return true;
  return trusted.devServerOrigin !== null && url.origin === trusted.devServerOrigin;
}
