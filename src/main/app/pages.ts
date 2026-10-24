import { APP_BASE_URL } from '../../shared/constants/app';

export type PageName = 'character' | 'settings';

/**
 * URL de cada página. Em `electron-vite dev` usa o servidor do Vite (HMR);
 * no build (inclusive E2E e preview) usa o protocolo `app://clipster/`.
 */
export function pageUrl(
  page: PageName,
  devServerUrl: string | null,
  query?: Readonly<Record<string, string>>
): string {
  const base = devServerUrl ?? APP_BASE_URL;
  const url = new URL(`${base.replace(/\/$/, '')}/${page}.html`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url.toString();
}
