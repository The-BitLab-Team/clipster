import { app } from 'electron';
import type { Logger } from '../logging/logger';

/**
 * Iniciar com o sistema (SPEC §27.2). Só faz sentido no app instalado, no Windows e no macOS:
 * em desenvolvimento o login item apontaria para o binário do Electron de dev, e o Electron
 * não oferece essa API no Linux.
 */
export function isLaunchAtLoginSupported(options: {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  isE2E: boolean;
}): boolean {
  return (
    options.isPackaged &&
    !options.isE2E &&
    (options.platform === 'win32' || options.platform === 'darwin')
  );
}

export function applyLaunchAtLogin(enabled: boolean, supported: boolean, logger: Logger): void {
  if (!supported) return;
  try {
    const current = app.getLoginItemSettings().openAtLogin;
    if (current !== enabled) {
      app.setLoginItemSettings({ openAtLogin: enabled });
      logger.info('login_item.updated', { enabled });
    }
  } catch (error) {
    logger.error('login_item.failed', { error });
  }
}
