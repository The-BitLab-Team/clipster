import { join } from 'node:path';
import { app, session } from 'electron';
import trayIconPath from '../../resources/tray/tray.png?asset&asarUnpack';
import trayTemplateIconPath from '../../resources/tray/trayTemplate.png?asset&asarUnpack';
import appIconPath from '../../resources/icon.png?asset&asarUnpack';
import { APP_ID, APP_NAME } from '../shared/constants/app';
import { installApplicationMenu } from './app/applicationMenu';
import { AppController } from './app/controller';
import './app/testHooks';
import { isLaunchAtLoginSupported } from './app/loginItem';
import { handleAppProtocol, registerAppSchemeAsPrivileged } from './app/protocol';
import { ConsoleSink, createLogger, RotatingFileSink, type LogSink } from './logging/logger';
import {
  disableSpellcheckerDownloads,
  hardenSession,
  hardenWebContents
} from './security/hardening';
import { SettingsStore } from './storage/settingsStore';

/**
 * Ponto de entrada do main process (SPEC §17.1, §27).
 */

const isE2E = process.env.CLIPSTER_E2E === '1';
const e2eUserDataDir = process.env.CLIPSTER_USER_DATA_DIR;
const devServerUrl = !app.isPackaged ? (process.env.ELECTRON_RENDERER_URL ?? null) : null;

// Testes E2E nunca tocam nos dados reais do usuário (SPEC §29.3).
if (isE2E && e2eUserDataDir !== undefined && e2eUserDataDir !== '') {
  app.setPath('userData', e2eUserDataDir);
} else if (!app.isPackaged) {
  // Desenvolvimento usa uma pasta própria para não misturar com o app instalado.
  app.setPath('userData', join(app.getPath('appData'), `${APP_NAME} (dev)`));
}

registerAppSchemeAsPrivileged();

// Registrado antes do `ready` para alcançar a sessão padrão no momento em que ela nasce.
app.on('session-created', disableSpellcheckerDownloads);

async function main(): Promise<void> {
  await app.whenReady();

  const userData = app.getPath('userData');
  const logsDir = join(userData, 'logs');
  const sinks: LogSink[] = [new RotatingFileSink(logsDir)];
  if (!app.isPackaged) sinks.push(new ConsoleSink());
  const logger = createLogger({ level: app.isPackaged ? 'info' : 'debug', sinks });

  logger.info('app.starting', {
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    packaged: app.isPackaged,
    e2e: isE2E
  });

  if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

  app.on('web-contents-created', (_event, contents) => {
    hardenWebContents(contents, logger.child('security'));
  });
  hardenSession(session.defaultSession, {
    devServerOrigin: devServerUrl === null ? null : new URL(devServerUrl).origin,
    logger: logger.child('security')
  });
  if (devServerUrl === null) {
    handleAppProtocol(join(__dirname, '../renderer'), logger.child('protocol'));
  }
  installApplicationMenu(process.platform);

  const store = SettingsStore.load({
    filePath: join(userData, 'settings.json'),
    logger: logger.child('settings')
  });

  const controller = new AppController({
    store,
    logger,
    platform: process.platform,
    isPackaged: app.isPackaged,
    devServerUrl,
    preloadPath: join(__dirname, '../preload/index.js'),
    trayIconPath,
    trayTemplateIconPath,
    appIconPath,
    logsDir,
    capabilities: {
      launchAtLogin: isLaunchAtLoginSupported({
        platform: process.platform,
        isPackaged: app.isPackaged,
        isE2E
      }),
      clickThrough: process.platform === 'win32' || process.platform === 'darwin'
    }
  });

  app.on('second-instance', () => {
    controller.showCharacter();
  });
  app.on('activate', () => {
    controller.showCharacter();
  });
  app.on('before-quit', () => {
    controller.prepareQuit();
  });
  // O Clipster continua na bandeja quando não há janelas visíveis; só "Sair" encerra.
  app.on('window-all-closed', () => undefined);

  controller.start();

  if (isE2E) {
    globalThis.__clipsterTest = controller.testHooks();
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main().catch((error: unknown) => {
    console.error('Falha ao iniciar o Clipster:', error);
    app.exit(1);
  });
}
