import { app, ipcMain, Menu, screen, shell, type BrowserWindow } from 'electron';
import { APP_NAME, REPOSITORY_URL } from '../../shared/constants/app';
import { DISPLAY_CHANGE_DEBOUNCE_MS } from '../../shared/constants/ui';
import { createTranslator, resolveLocale, type Locale } from '../../shared/i18n';
import type { AppCapabilities, AppInfo } from '../../shared/ipc/api';
import { IpcChannel } from '../../shared/ipc/channels';
import type { PersonalityId, Settings, SettingsSection } from '../../shared/schemas/settings';
import { registerIpcHandlers } from '../ipc/handlers';
import { IpcRegistry, type WindowRole } from '../ipc/registry';
import type { Logger } from '../logging/logger';
import { toElectronTemplate } from '../menus/electronMenu';
import {
  buildCharacterContextMenu,
  buildTrayMenu,
  MENU_COMMANDS,
  type MenuCommand,
  type MenuState
} from '../menus/menuFactory';
import { isTrustedRendererUrl } from '../security/urls';
import type { SettingsStore } from '../storage/settingsStore';
import { TrayController } from '../tray/trayController';
import { CharacterWindow } from '../windows/characterWindow';
import { SettingsWindowManager } from '../windows/settingsWindow';
import { applyLaunchAtLogin } from './loginItem';
import { CharacterStateHost } from '../character/characterStateHost';
import { isCharacterState, type CharacterState } from '../../shared/character/states';
import { pageUrl } from './pages';
import type { TestHooks } from './testHooks';

/**
 * Orquestra janelas, bandeja, menus e IPC. É o único lugar que traduz comandos do
 * usuário (menus, IPC, testes) em efeitos, e o único que reage a mudanças de configuração.
 */

export interface AppControllerOptions {
  store: SettingsStore;
  logger: Logger;
  platform: NodeJS.Platform;
  isPackaged: boolean;
  devServerUrl: string | null;
  preloadPath: string;
  trayIconPath: string;
  trayTemplateIconPath: string;
  appIconPath: string;
  logsDir: string;
  capabilities: AppCapabilities;
  /** Ferramentas de desenvolvimento (pré-visualizar estados). Falso no app instalado. */
  devTools: boolean;
  /** Só para E2E: substitui "Dormir após inatividade" por um tempo curto, em ms. */
  sleepAfterMsOverride: number | null;
}

export class AppController {
  private character: CharacterWindow | null = null;
  private tray: TrayController | null = null;
  private readonly settingsWindow: SettingsWindowManager;
  private readonly roles = new Map<number, WindowRole>();
  private readonly registry: IpcRegistry;
  private displayTimer: ReturnType<typeof setTimeout> | null = null;
  private quitting = false;
  private readonly characterState: CharacterStateHost;

  constructor(private readonly options: AppControllerOptions) {
    this.characterState = new CharacterStateHost({
      inactivityMs: () => this.inactivityMs(),
      onView: (view) => {
        const win = this.character?.window;
        if (win !== undefined && !win.isDestroyed()) {
          win.webContents.send(IpcChannel.characterView, view);
        }
      },
      logger: options.logger.child('character-state')
    });

    const devServerOrigin =
      options.devServerUrl === null ? null : new URL(options.devServerUrl).origin;

    this.registry = new IpcRegistry({
      ipcMain,
      isTrustedUrl: (url) => isTrustedRendererUrl(url, { devServerOrigin }),
      roleOf: (id) => this.roles.get(id) ?? null,
      logger: options.logger.child('ipc')
    });

    this.settingsWindow = new SettingsWindowManager({
      preloadPath: options.preloadPath,
      allowDevTools: !options.isPackaged,
      urlFor: (section) =>
        pageUrl('settings', options.devServerUrl, section === undefined ? undefined : { section }),
      title: () => this.t('settings.title'),
      iconPath: options.platform === 'linux' ? options.appIconPath : undefined,
      logger: options.logger.child('settings-window'),
      onCreated: (id) => this.roles.set(id, 'settings'),
      onClosed: (id) => this.roles.delete(id)
    });
  }

  // ───────────────────────── ciclo de vida ─────────────────────────

  start(): void {
    const settings = this.options.store.get();
    this.registerIpc();
    this.createCharacter(settings);
    this.createTray();

    this.options.store.onChange((next, previous) => {
      this.onSettingsChanged(next, previous);
    });

    const onDisplaysChanged = (): void => {
      this.scheduleDisplayCheck();
    };
    screen.on('display-added', onDisplaysChanged);
    screen.on('display-removed', onDisplaysChanged);
    screen.on('display-metrics-changed', onDisplaysChanged);

    applyLaunchAtLogin(
      settings.general.launchAtLogin,
      this.options.capabilities.launchAtLogin,
      this.options.logger
    );

    const { loadInfo } = this.options.store;
    this.characterState.dispatch({ type: 'APP_READY', firstRun: loadInfo.createdFresh });
    if (loadInfo.createdFresh) this.options.logger.info('app.first_run');
    if (loadInfo.recovered) {
      this.options.logger.warn('app.settings_recovered', { issues: loadInfo.issues });
    }
  }

  /** Chamado no `before-quit`: grava tudo de forma síncrona e limpa a bandeja. */
  prepareQuit(): void {
    if (this.quitting) return;
    this.quitting = true;
    if (this.displayTimer !== null) clearTimeout(this.displayTimer);
    this.characterState.dispose();
    this.character?.commitPositionNow();
    this.options.store.flushSync();
    this.tray?.destroy();
    this.options.logger.info('app.quitting');
  }

  get isQuitting(): boolean {
    return this.quitting;
  }

  // ───────────────────────── comandos ─────────────────────────

  run(command: MenuCommand): void {
    this.options.logger.debug('command', { command });
    switch (command) {
      case 'open':
        this.showCharacter();
        return;
      case 'talk':
        // O balão de conversa chega na Fase 3. Até lá, abrir = mostrar o personagem.
        this.showCharacter();
        return;
      case 'setPersonality:helpful':
        this.setPersonality('helpful');
        return;
      case 'setPersonality:witty':
        this.setPersonality('witty');
        return;
      case 'toggleAlwaysOnTop':
        this.options.store.update({
          general: { alwaysOnTop: !this.options.store.get().general.alwaysOnTop }
        });
        return;
      case 'toggleQuietMode':
        this.options.store.update({
          general: { quietMode: !this.options.store.get().general.quietMode }
        });
        return;
      case 'openSettings':
        this.openSettings();
        return;
      case 'toggleVisibility':
        if (this.character?.isVisible() === true) this.hideCharacter();
        else this.showCharacter();
        return;
      case 'hide':
        this.hideCharacter();
        return;
      case 'quit':
        this.quit();
        return;
      default:
        this.previewState(command);
    }
  }

  /** Pré-visualização de estados (submenu de desenvolvimento). */
  private previewState(command: `previewState:${CharacterState}`): void {
    if (!this.options.devTools) return;
    const state = command.slice('previewState:'.length);
    if (isCharacterState(state)) this.characterState.dispatch({ type: 'PREVIEW', state });
  }

  showCharacter(): void {
    void this.character?.showInactive().then(() => {
      this.tray?.refresh();
    });
  }

  hideCharacter(): void {
    this.character?.hide();
    this.tray?.refresh();
  }

  openSettings(section?: SettingsSection): void {
    this.settingsWindow.open(section);
  }

  setPersonality(personality: PersonalityId): void {
    this.options.store.update({ personality });
  }

  quit(): void {
    app.quit();
  }

  appInfo(): AppInfo {
    return {
      name: APP_NAME,
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      platform: this.options.platform,
      systemLanguages: app.getPreferredSystemLanguages(),
      isPackaged: this.options.isPackaged,
      repositoryUrl: REPOSITORY_URL,
      capabilities: this.options.capabilities
    };
  }

  testHooks(): TestHooks {
    return {
      run: (command) => {
        const known = MENU_COMMANDS.find((item) => item === command);
        if (known === undefined) throw new Error(`Comando desconhecido: ${command}`);
        this.run(known);
      },
      characterBounds: () => this.character?.window.getBounds() ?? null,
      isCharacterVisible: () => this.character?.isVisible() ?? false,
      isAlwaysOnTop: () => this.character?.window.isAlwaysOnTop() ?? false,
      isSettingsWindowOpen: () => this.settingsWindow.browserWindow !== null,
      settings: () => this.options.store.get(),
      flushSettings: () => this.options.store.flush(),
      characterView: () => this.characterState.view,
      dispatchCharacterEvent: (event) => {
        this.characterState.dispatch(event);
      }
    };
  }

  // ───────────────────────── internos ─────────────────────────

  private get locale(): Locale {
    return resolveLocale(
      this.options.store.get().general.language,
      app.getPreferredSystemLanguages()
    );
  }

  private t(...args: Parameters<ReturnType<typeof createTranslator>>): string {
    return createTranslator(this.locale)(...args);
  }

  private menuState(): MenuState {
    const settings = this.options.store.get();
    return {
      locale: this.locale,
      personality: settings.personality,
      alwaysOnTop: settings.general.alwaysOnTop,
      quietMode: settings.general.quietMode,
      characterVisible: this.character?.isVisible() ?? false,
      chatAvailable: false,
      devTools: this.options.devTools
    };
  }

  private buildMenu(kind: 'tray' | 'context'): Menu {
    const state = this.menuState();
    const items = kind === 'tray' ? buildTrayMenu(state) : buildCharacterContextMenu(state);
    return Menu.buildFromTemplate(
      toElectronTemplate(items, (command) => {
        this.run(command);
      })
    );
  }

  private createCharacter(settings: Settings): void {
    const character = new CharacterWindow({
      preloadPath: this.options.preloadPath,
      url: pageUrl('character', this.options.devServerUrl),
      scale: settings.appearance.characterScale,
      savedPosition: settings.window.characterPosition,
      alwaysOnTop: settings.general.alwaysOnTop,
      supportsClickThrough: this.options.capabilities.clickThrough,
      allowDevTools: !this.options.isPackaged,
      logger: this.options.logger.child('character'),
      isQuitting: () => this.quitting,
      onCloseRequested: () => {
        this.hideCharacter();
      },
      onPositionCommitted: (position) => {
        this.options.store.setCharacterPosition(position);
      }
    });
    this.character = character;
    this.roles.set(character.webContentsId, 'character');
    character.window.on('show', () => this.tray?.refresh());
    character.window.on('hide', () => this.tray?.refresh());

    if (!settings.general.startHidden) {
      void character.showInactive();
    }
  }

  private createTray(): void {
    const isMac = this.options.platform === 'darwin';
    this.tray = new TrayController({
      iconPath: isMac ? this.options.trayTemplateIconPath : this.options.trayIconPath,
      template: isMac,
      tooltip: () => this.t('tray.tooltip'),
      buildMenu: () => this.buildMenu('tray'),
      onPrimaryClick: () => {
        this.showCharacter();
      },
      logger: this.options.logger.child('tray')
    });
    this.tray.create();
  }

  private registerIpc(): void {
    registerIpcHandlers({
      registry: this.registry,
      capabilities: this.options.capabilities,
      rendererLogger: this.options.logger.child('renderer'),
      settings: {
        get: () => this.options.store.get(),
        update: (patch) => this.options.store.update(patch)
      },
      character: {
        getView: () => this.characterState.view,
        dragStart: () => {
          this.character?.dragStart();
          this.characterState.dispatch({ type: 'DRAG_START' });
        },
        dragMove: ({ dx, dy }) => this.character?.dragMove(dx, dy),
        dragEnd: () => {
          this.character?.dragEnd();
          this.characterState.dispatch({ type: 'DRAG_END' });
        },
        setClickThrough: (ignore) => this.character?.setClickThrough(ignore),
        click: () => {
          // Fase 3: além disso, abrir o balão de conversa.
          this.characterState.dispatch({ type: 'CLICK' });
        },
        openContextMenu: () => this.character?.popupMenu(this.buildMenu('context'))
      },
      app: {
        info: () => this.appInfo(),
        openSettings: (section) => {
          this.openSettings(section);
        },
        hideClipster: () => {
          this.hideCharacter();
        },
        quit: () => {
          this.quit();
        },
        openLogsFolder: async () => {
          const error = await shell.openPath(this.options.logsDir);
          if (error !== '') this.options.logger.warn('diagnostics.open_logs_failed', { error });
        },
        openExternal: (url) => shell.openExternal(url)
      }
    });
  }

  private onSettingsChanged(next: Settings, previous: Settings): void {
    if (next.general.alwaysOnTop !== previous.general.alwaysOnTop) {
      this.character?.setAlwaysOnTop(next.general.alwaysOnTop);
    }
    if (next.appearance.characterScale !== previous.appearance.characterScale) {
      this.character?.setScale(next.appearance.characterScale);
    }
    if (next.general.launchAtLogin !== previous.general.launchAtLogin) {
      applyLaunchAtLogin(
        next.general.launchAtLogin,
        this.options.capabilities.launchAtLogin,
        this.options.logger
      );
    }
    if (next.general.sleepAfterMinutes !== previous.general.sleepAfterMinutes) {
      this.characterState.refreshInactivity();
    }
    if (next.personality !== previous.personality) {
      // Feedback visual da troca de personalidade (SPEC §7.4).
      this.characterState.dispatch({ type: 'SUCCESS_FEEDBACK' });
    }

    const menuRelevant =
      next.general.language !== previous.general.language ||
      next.personality !== previous.personality ||
      next.general.alwaysOnTop !== previous.general.alwaysOnTop ||
      next.general.quietMode !== previous.general.quietMode;
    if (menuRelevant) this.tray?.refresh();

    // A posição muda a cada arrasto e só interessa ao main.
    const onlyPositionChanged =
      JSON.stringify({ ...next, window: null }) === JSON.stringify({ ...previous, window: null });
    if (!onlyPositionChanged) this.broadcast(next);
  }

  private broadcast(settings: Settings): void {
    const windows: (BrowserWindow | null)[] = [
      this.character?.window ?? null,
      this.settingsWindow.browserWindow
    ];
    for (const win of windows) {
      if (win !== null && !win.isDestroyed()) {
        win.webContents.send(IpcChannel.settingsChanged, settings);
      }
    }
  }

  private inactivityMs(): number | null {
    if (this.options.sleepAfterMsOverride !== null) return this.options.sleepAfterMsOverride;
    const minutes = this.options.store.get().general.sleepAfterMinutes;
    return minutes === 0 ? null : minutes * 60_000;
  }

  private scheduleDisplayCheck(): void {
    if (this.displayTimer !== null) clearTimeout(this.displayTimer);
    this.displayTimer = setTimeout(() => {
      this.displayTimer = null;
      this.character?.ensureOnScreen();
    }, DISPLAY_CHANGE_DEBOUNCE_MS);
  }
}
