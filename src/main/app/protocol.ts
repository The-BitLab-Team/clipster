import { readFile } from 'node:fs/promises';
import { protocol } from 'electron';
import { APP_PROTOCOL } from '../../shared/constants/app';
import type { Logger } from '../logging/logger';
import { PRODUCTION_CSP } from '../security/csp';
import { mimeTypeFor, resolveAppRequestPath } from './protocolPath';

/**
 * Protocolo próprio `app://clipster/` em vez de `file://` (SPEC §26, item 2).
 * Precisa ser registrado como privilegiado antes do evento `ready`.
 */
export function registerAppSchemeAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_PROTOCOL,
      privileges: { standard: true, secure: true, supportFetchAPI: true }
    }
  ]);
}

export function handleAppProtocol(rendererRoot: string, logger: Logger): void {
  protocol.handle(APP_PROTOCOL, async (request) => {
    const filePath = resolveAppRequestPath(request.url, rendererRoot);
    if (filePath === null) {
      logger.warn('protocol.rejected', { url: request.url });
      return new Response('Not found', { status: 404 });
    }
    try {
      const body = await readFile(filePath);
      const contentType = mimeTypeFor(filePath);
      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache'
      };
      if (contentType.startsWith('text/html')) {
        headers['Content-Security-Policy'] = PRODUCTION_CSP;
      }
      return new Response(body, { status: 200, headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}
