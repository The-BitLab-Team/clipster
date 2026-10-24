import type { Session, WebContents } from 'electron';
import type { Logger } from '../logging/logger';
import { developmentCsp } from './csp';

/**
 * Endurecimento de sessão e de webContents (SPEC §26, itens 5 e 6).
 */

export function hardenSession(
  session: Session,
  options: { devServerOrigin: string | null; logger: Logger }
): void {
  // O Electron aprova todas as permissões se nenhum handler for definido.
  session.setPermissionRequestHandler((_contents, permission, callback) => {
    options.logger.warn('security.permission_denied', { permission });
    callback(false);
  });
  session.setPermissionCheckHandler(() => false);

  const devOrigin = options.devServerOrigin;
  if (devOrigin !== null) {
    // Em produção a CSP vem do handler do protocolo app://. Em dev, ela é injetada aqui.
    const csp = developmentCsp(devOrigin);
    session.webRequest.onHeadersReceived({ urls: [`${devOrigin}/*`] }, (details, callback) => {
      callback({
        responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] }
      });
    });
  }
}

/**
 * Corretor ortográfico (SPEC §26, item 14). Por padrão o Chromium baixa dicionários Hunspell
 * de um servidor do Google ao iniciar (verificado com --log-net-log: en-us-10-2.bdic).
 * Precisa ser desligado no evento `session-created`, antes de qualquer janela existir;
 * desligar depois do `ready` chega tarde demais. Também troca o endereço de download por um
 * endereço local inválido, como segunda barreira.
 */
export function disableSpellcheckerDownloads(session: Session): void {
  session.setSpellCheckerEnabled(false);
  session.setSpellCheckerDictionaryDownloadURL('http://127.0.0.1:9/');
  if (process.platform !== 'darwin') {
    // Sem idiomas, não há dicionário para buscar (no macOS o corretor é o do sistema).
    session.setSpellCheckerLanguages([]);
  }
}

export function hardenWebContents(contents: WebContents, logger: Logger): void {
  contents.on('will-navigate', (event, url) => {
    event.preventDefault();
    logger.warn('security.navigation_blocked', { url });
  });
  contents.on('will-redirect', (event, url) => {
    event.preventDefault();
    logger.warn('security.redirect_blocked', { url });
  });
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
    logger.warn('security.webview_blocked');
  });
  contents.setWindowOpenHandler(({ url }) => {
    logger.warn('security.window_open_blocked', { url });
    return { action: 'deny' };
  });
}
