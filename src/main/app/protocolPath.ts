import { extname, normalize, resolve, sep } from 'node:path';
import { APP_HOST, APP_PROTOCOL } from '../../shared/constants/app';

/**
 * Converte `app://clipster/<caminho>` em um arquivo dentro da pasta do renderer.
 * Devolve `null` para host errado, caminho inválido ou tentativa de sair da pasta
 * (path traversal). Função pura, testada em tests/unit/protocolPath.test.ts.
 */
export function resolveAppRequestPath(requestUrl: string, rootDir: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_PROTOCOL}:` || url.host !== APP_HOST) return null;

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  // Pedidos legítimos nunca têm "..": qualquer tentativa é recusada, mesmo que ficasse na pasta.
  if (pathname.split(/[/\\]/).includes('..')) return null;

  const relative = normalize(pathname).replace(/^[/\\]+/, '');
  if (relative === '' || relative === '.') return null;

  const root = resolve(rootDir);
  const target = resolve(root, relative);
  if (!target.startsWith(root + sep)) return null;
  return target;
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

export function mimeTypeFor(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}
