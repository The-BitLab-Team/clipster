import { join } from 'node:path';
import { app, safeStorage, session } from 'electron';
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
import { readDotEnv } from './app/devEnv';
import { SecretStore, type SecretProvider } from './storage/secretStore';
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

/** Só em E2E: ritmo do Demo (atraso entre pedaços; a pausa inicial é 10×). Padrão: 0. */
function e2eDemoTiming(): { thinkingMs: number; chunkMs: number } {
  const value = Number(process.env.CLIPSTER_E2E_DEMO_DELAY_MS ?? '0');
  const chunkMs = Number.isInteger(value) && value >= 0 ? value : 0;
  return { thinkingMs: chunkMs * 10, chunkMs };
}

/** Só em E2E: tempos-limite curtos da IA ("primeiroToken,total", em ms). */
function e2eAiTimeouts(): { firstTokenMs: number; totalMs: number } | null {
  const [first, total] = (process.env.CLIPSTER_E2E_AI_TIMEOUTS ?? '').split(',').map(Number);
  if (first === undefined || total === undefined) return null;
  return Number.isInteger(first) && Number.isInteger(total) && first > 0 && total > 0
    ? { firstTokenMs: first, totalMs: total }
    : null;
}

/** Só em E2E: prazo curto para responder a um pedido de permissão, em ms. */
function e2ePermissionTimeoutMs(): number | null {
  const value = Number(process.env.CLIPSTER_E2E_PERMISSION_TIMEOUT_MS ?? '');
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Só em desenvolvimento (SPEC §21): chaves do `.env` na raiz do projeto, como reserva. */
function devEnvKeys(): Partial<Record<SecretProvider, string>> {
  if (app.isPackaged || isE2E) return {};
  const env = readDotEnv(join(app.getAppPath(), '.env'));
  const keys: Partial<Record<SecretProvider, string>> = {};
  if (env.ANTHROPIC_API_KEY !== undefined && env.ANTHROPIC_API_KEY !== '') {
    keys.anthropic = env.ANTHROPIC_API_KEY;
  }
  if (env.OPENAI_API_KEY !== undefined && env.OPENAI_API_KEY !== '') {
    keys['openai-compatible'] = env.OPENAI_API_KEY;
  }
  return keys;
}

/** Só em E2E: tempo curto para testar o sono por inatividade. */
function e2eSleepAfterMs(): number | null {
  const value = Number(process.env.CLIPSTER_E2E_SLEEP_AFTER_MS);
  return Number.isInteger(value) && value > 0 ? value : null;
}

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

  // safeStorage só funciona depois do `ready` (SPEC §21).
  const secrets = SecretStore.load({
    filePath: join(userData, 'secrets.json'),
    safeStorage,
    platform: process.platform,
    logger: logger.child('secrets'),
    envKeys: devEnvKeys(),
    envOpenAiOrigin: 'https://api.openai.com'
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
    userDataDir: userData,
    capabilities: {
      launchAtLogin: isLaunchAtLoginSupported({
        platform: process.platform,
        isPackaged: app.isPackaged,
        isE2E
      }),
      clickThrough: process.platform === 'win32' || process.platform === 'darwin'
    },
    devTools: !app.isPackaged,
    allowSimulations: !app.isPackaged || isE2E,
    sleepAfterMsOverride: isE2E ? e2eSleepAfterMs() : null,
    demoTiming: isE2E ? e2eDemoTiming() : null,
    secrets,
    anthropicBaseUrl: isE2E ? (process.env.CLIPSTER_E2E_ANTHROPIC_BASE_URL ?? null) : null,
    aiTimeoutsOverride: isE2E ? e2eAiTimeouts() : null,
    // Ferramentas fictícias de teste (SPEC §22.3): nunca no app instalado, salvo nos testes E2E.
    toolDevTools: (!app.isPackaged || isE2E) && process.env.CLIPSTER_DEV_TOOLS === '1',
    permissionTimeoutMs: isE2E ? e2ePermissionTimeoutMs() : null
  });

  app.on('second-instance', () => {
    controller.onSecondInstance();
  });
  app.on('activate', () => {
    void controller.showCharacter();
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
