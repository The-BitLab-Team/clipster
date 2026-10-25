import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import {
  app,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  screen,
  shell,
  webContents,
  type BrowserWindow
} from 'electron';
import type { ChatEvent } from '../../shared/ai/conversation';
import { isCharacterState, type CharacterState } from '../../shared/character/states';
import type { DemoTiming } from '../../shared/constants/ai';
import { APP_NAME, REPOSITORY_URL } from '../../shared/constants/app';
import {
  BALLOON_PRECREATE_DELAY_MS,
  DISPLAY_CHANGE_DEBOUNCE_MS,
  FIRST_RUN_BALLOON_DELAY_MS
} from '../../shared/constants/ui';
import { createTranslator, resolveLocale, type Locale } from '../../shared/i18n';
import type { AppCapabilities, AppInfo, OnboardingResult } from '../../shared/ipc/api';
import { IpcChannel } from '../../shared/ipc/channels';
import type {
  PersonalityId,
  Settings,
  SettingsPatch,
  SettingsSection
} from '../../shared/schemas/settings';
import { AssistantService, type ChatTarget } from '../ai/assistantService';
import { PersonalityManager } from '../ai/personalityManager';
import { DEMO_MODEL, DemoProvider } from '../ai/providers/demo/demoProvider';
import type { AIProvider } from '../ai/types';
import { CharacterStateHost } from '../character/characterStateHost';
import { registerIpcHandlers } from '../ipc/handlers';
import { IpcHandlerError, IpcRegistry, type WindowRole } from '../ipc/registry';
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
import { HistoryStore } from '../storage/historyStore';
import type { SettingsStore } from '../storage/settingsStore';
import { TrayController } from '../tray/trayController';
import { BalloonWindow } from '../windows/balloonWindow';
import { CharacterWindow } from '../windows/characterWindow';
import { SettingsWindowManager } from '../windows/settingsWindow';
import { applyLaunchAtLogin } from './loginItem';
import { pageUrl } from './pages';
import type { TestHooks } from './testHooks';

/**
 * Orquestra janelas, bandeja, menus, conversa e IPC. É o único lugar que traduz comandos do
 * usuário (menus, IPC, atalho, testes) em efeitos, e o único que reage a mudanças de configuração.
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
  userDataDir: string;
  capabilities: AppCapabilities;
  /** Ferramentas de desenvolvimento (pré-visualizar estados). Falso no app instalado. */
  devTools: boolean;
  /** Comandos `/simular …` do Demo: só em desenvolvimento e testes. */
  allowSimulations: boolean;
  /** Só para E2E: substitui "Dormir após inatividade" por um tempo curto, em ms. */
  sleepAfterMsOverride: number | null;
  /** Só para E2E: ritmo do Demo. `null` = padrão. */
  demoTiming: DemoTiming | null;
}

export class AppController {
  private character: CharacterWindow | null = null;
  private balloon: BalloonWindow | null = null;
  private tray: TrayController | null = null;
  private readonly settingsWindow: SettingsWindowManager;
  private readonly roles = new Map<number, WindowRole>();
  private readonly registry: IpcRegistry;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private displayTimer: ReturnType<typeof setTimeout> | null = null;
  private quitting = false;
  private registeredShortcut: string | null = null;
  private history: HistoryStore | null = null;
  private readonly characterState: CharacterStateHost;
  private readonly personalities: PersonalityManager;
  private readonly demo: DemoProvider;
  private readonly assistant: AssistantService;

  constructor(private readonly options: AppControllerOptions) {
    const settings = options.store.get();

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

    this.personalities = new PersonalityManager({
      current: () => options.store.get().personality,
      persist: (personality) => options.store.update({ personality }),
      logger: options.logger.child('personality')
    });

    this.demo = new DemoProvider({
      allowSimulations: options.allowSimulations,
      ...(options.demoTiming === null ? {} : { timing: options.demoTiming })
    });

    if (settings.privacy.saveHistory) this.history = this.loadHistory(settings);

    this.assistant = new AssistantService({
      resolveProvider: () => this.resolveProvider(),
      model: () =>
        options.store.get().ai.provider === 'demo' ? DEMO_MODEL.id : options.store.get().ai.model,
      personality: () => this.personalities.active,
      uiLocale: () => this.locale,
      environment: () => ({
        appName: APP_NAME,
        appVersion: app.getVersion(),
        platform: options.platform,
        now: new Date(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }),
      emit: (target, event) => {
        this.sendChatEvent(target, event);
      },
      onCharacterEvent: (event) => {
        this.characterState.dispatch(event);
      },
      onConversationSettled: (conversation) => {
        this.history?.save(conversation);
      },
      logger: options.logger.child('assistant'),
      initialConversation: this.history?.latest() ?? null
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
    this.syncGlobalShortcut(settings);

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

    // Balão pré-criado e escondido: abre na hora quando o usuário clicar (SPEC §19.5).
    this.later(BALLOON_PRECREATE_DELAY_MS, () => {
      this.ensureBalloon();
    });

    const { loadInfo } = this.options.store;
    this.characterState.dispatch({ type: 'APP_READY', firstRun: loadInfo.createdFresh });
    if (loadInfo.createdFresh) this.options.logger.info('app.first_run');
    if (loadInfo.recovered) {
      this.options.logger.warn('app.settings_recovered', { issues: loadInfo.issues });
    }

    // Primeira execução: o balão aparece sozinho com a saudação, sem tirar o foco (SPEC §9).
    if (!settings.firstRunCompleted && !settings.general.startHidden) {
      this.later(FIRST_RUN_BALLOON_DELAY_MS, () => {
        const current = this.options.store.get();
        if (!current.firstRunCompleted && this.character?.isVisible() === true) {
          void this.openBalloon({ focus: false, wokeUp: false });
        }
      });
    }
  }

  /** Chamado no `before-quit`: cancela respostas, grava tudo de forma síncrona e limpa. */
  prepareQuit(): void {
    if (this.quitting) return;
    this.quitting = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    if (this.displayTimer !== null) clearTimeout(this.displayTimer);
    this.assistant.dispose();
    this.characterState.dispose();
    this.character?.commitPositionNow();
    this.options.store.flushSync();
    this.history?.flushSync();
    globalShortcut.unregisterAll();
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
        void this.showCharacter();
        return;
      case 'talk':
        void this.openBalloon({ focus: true, wokeUp: this.isSleeping() });
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
        else void this.showCharacter();
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

  async showCharacter(): Promise<void> {
    await this.character?.showInactive();
    this.tray?.refresh();
  }

  /** Outra instância foi aberta: mostra o Clipster existente, com um "feliz" rápido (SPEC §27.1). */
  onSecondInstance(): void {
    void this.showCharacter();
    this.characterState.dispatch({ type: 'SUCCESS_FEEDBACK' });
  }

  hideCharacter(): void {
    this.balloon?.hide();
    this.character?.hide();
    this.tray?.refresh();
    this.showHideTipOnce();
  }

  openSettings(section?: SettingsSection): void {
    this.settingsWindow.open(section);
  }

  setPersonality(personality: PersonalityId): void {
    this.personalities.set(personality);
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
      },
      isBalloonVisible: () => this.balloon?.isVisible() ?? false,
      balloonBounds: () => this.balloon?.window.getBounds() ?? null,
      clickCharacter: () => {
        this.onCharacterClick();
      },
      conversation: () => this.assistant.snapshot(),
      flushHistory: async () => {
        await this.history?.flush();
      },
      readClipboard: () => clipboard.readText()
    };
  }

  // ───────────────────────── balão ─────────────────────────

  private ensureBalloon(): BalloonWindow {
    if (this.balloon !== null) return this.balloon;
    const settings = this.options.store.get();
    const balloon = new BalloonWindow({
      preloadPath: this.options.preloadPath,
      url: pageUrl('balloon', this.options.devServerUrl),
      allowDevTools: !this.options.isPackaged,
      alwaysOnTop: settings.general.alwaysOnTop,
      chatScale: settings.appearance.chatScale,
      logger: this.options.logger.child('balloon'),
      characterBounds: () => {
        const win = this.character?.window;
        return win === undefined || win.isDestroyed() ? null : win.getBounds();
      },
      isQuitting: () => this.quitting,
      onShown: () => {
        this.characterState.dispatch({ type: 'BALLOON_OPENED' });
      },
      onHidden: () => {
        this.characterState.dispatch({ type: 'BALLOON_CLOSED' });
      }
    });
    this.roles.set(balloon.webContentsId, 'balloon');
    this.balloon = balloon;
    return balloon;
  }

  private async openBalloon(options: { focus: boolean; wokeUp: boolean }): Promise<void> {
    if (this.character?.isVisible() !== true) await this.showCharacter();
    await this.ensureBalloon().show(options);
  }

  private toggleBalloon(focus: boolean): void {
    if (this.balloon?.isVisible() === true) this.balloon.hide();
    else void this.openBalloon({ focus, wokeUp: this.isSleeping() });
  }

  private onCharacterClick(): void {
    const wokeUp = this.isSleeping();
    this.characterState.dispatch({ type: 'CLICK' });
    if (this.balloon?.isVisible() === true) this.balloon.hide();
    else void this.openBalloon({ focus: true, wokeUp });
  }

  private isSleeping(): boolean {
    return this.characterState.view.state === 'sleeping';
  }

  private sendChatEvent(target: ChatTarget, event: ChatEvent): void {
    if (target === 'chat-windows') {
      const win = this.balloon?.window;
      if (win !== undefined && !win.isDestroyed())
        win.webContents.send(IpcChannel.chatEvent, event);
      return;
    }
    // Só para a janela que fez a pergunta, e só se ela ainda é uma janela de chat.
    if (this.roles.get(target) !== 'balloon') return;
    const contents = webContents.fromId(target);
    if (contents !== undefined && !contents.isDestroyed()) {
      contents.send(IpcChannel.chatEvent, event);
    }
  }

  // ───────────────────────── histórico, atalho, dica ─────────────────────────

  private historyPath(): string {
    return join(this.options.userDataDir, 'history.json');
  }

  private loadHistory(settings: Settings): HistoryStore {
    return HistoryStore.load({
      filePath: this.historyPath(),
      retentionDays: settings.privacy.historyRetentionDays,
      logger: this.options.logger.child('history')
    });
  }

  /** "Limpar histórico": apaga disco e memória (SPEC §13). */
  private async clearHistory(): Promise<void> {
    // Primeiro a conversa (uma resposta em andamento é salva ao ser interrompida); depois o disco.
    this.assistant.clear();
    if (this.history !== null) await this.history.clear();
    else await rm(this.historyPath(), { force: true });
    this.options.logger.info('history.cleared');
  }

  /** Registra o atalho global desejado. Devolve false se outro programa já o usa. */
  private syncGlobalShortcut(settings: Settings): boolean {
    const { enabled, accelerator } = settings.general.globalShortcut;
    const desired = enabled ? accelerator : null;
    if (desired === this.registeredShortcut) return true;
    if (this.registeredShortcut !== null) globalShortcut.unregister(this.registeredShortcut);
    this.registeredShortcut = null;
    if (desired === null) return true;
    let ok = false;
    try {
      ok = globalShortcut.register(desired, () => {
        this.toggleBalloon(true);
      });
    } catch (error) {
      this.options.logger.warn('shortcut.invalid', { accelerator: desired, error });
    }
    if (ok) this.registeredShortcut = desired;
    else this.options.logger.warn('shortcut.unavailable', { accelerator: desired });
    return ok;
  }

  private updateSettings(patch: SettingsPatch): Settings {
    const shortcut = patch.general?.globalShortcut;
    if (shortcut?.enabled === true) {
      const current = this.options.store.get();
      const ok = this.syncGlobalShortcut({
        ...current,
        general: { ...current.general, globalShortcut: shortcut }
      });
      if (!ok) {
        throw new IpcHandlerError('SHORTCUT_IN_USE', 'Esse atalho já está em uso.');
      }
    }
    return this.options.store.update(patch);
  }

  private completeOnboarding(result: OnboardingResult): void {
    const patch: SettingsPatch = { personality: result.personality };
    if (result.provider === 'demo') patch.ai = { provider: 'demo' };
    this.options.store.completeOnboarding(patch);
    this.options.logger.info('onboarding.completed', { provider: result.provider });
  }

  /** Primeira vez que o usuário esconde o Clipster: uma única dica (SPEC §9). */
  private showHideTipOnce(): void {
    if (this.options.store.get().hideTipShown) return;
    this.options.store.setHideTipShown(true);
    this.tray?.showHint(this.t('tip.hidden.title'), this.t('tip.hidden.body'));
  }

  private resolveProvider(): AIProvider | null {
    switch (this.options.store.get().ai.provider) {
      case 'demo':
        return this.demo;
      case 'none':
      case 'openai-compatible':
      case 'anthropic':
        // Providers reais chegam na Fase 4.
        return null;
    }
  }

  // ───────────────────────── internos ─────────────────────────

  private later(ms: number, callback: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.quitting) callback();
    }, ms);
    this.timers.add(timer);
  }

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
        // Windows: clique esquerdo mostra o personagem e abre/fecha o balão (SPEC §11).
        this.toggleBalloon(true);
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
        update: (patch) => this.updateSettings(patch)
      },
      character: {
        getView: () => this.characterState.view,
        dragStart: () => {
          this.character?.dragStart();
          this.characterState.dispatch({ type: 'DRAG_START' });
        },
        dragMove: ({ dx, dy }) => {
          this.character?.dragMove(dx, dy);
          if (this.balloon?.isVisible() === true) this.balloon.reposition();
        },
        dragEnd: () => {
          this.character?.dragEnd();
          this.characterState.dispatch({ type: 'DRAG_END' });
        },
        setClickThrough: (ignore) => this.character?.setClickThrough(ignore),
        click: () => {
          this.onCharacterClick();
        },
        openContextMenu: () => this.character?.popupMenu(this.buildMenu('context'))
      },
      chat: {
        send: (text, requester) => this.assistant.send(text, requester),
        cancel: (requestId) => this.assistant.cancel(requestId),
        retry: (requester) => this.assistant.retry(requester),
        conversation: () => this.assistant.snapshot(),
        newConversation: () => this.assistant.newConversation(),
        clearHistory: () => this.clearHistory(),
        typing: () => {
          this.characterState.dispatch({ type: 'USER_TYPING' });
        }
      },
      onboarding: {
        complete: (result) => {
          this.completeOnboarding(result);
        }
      },
      balloon: {
        close: () => this.balloon?.hide(),
        resize: (height) => this.balloon?.setContentHeight(height)
      },
      clipboard: {
        writeText: (text) => clipboard.writeText(text)
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
      this.balloon?.setAlwaysOnTop(next.general.alwaysOnTop);
    }
    if (next.appearance.characterScale !== previous.appearance.characterScale) {
      this.character?.setScale(next.appearance.characterScale);
      this.balloon?.reposition();
    }
    if (next.appearance.chatScale !== previous.appearance.chatScale) {
      this.balloon?.setChatScale(next.appearance.chatScale);
    }
    if (next.general.launchAtLogin !== previous.general.launchAtLogin) {
      applyLaunchAtLogin(
        next.general.launchAtLogin,
        this.options.capabilities.launchAtLogin,
        this.options.logger
      );
    }
    if (
      JSON.stringify(next.general.globalShortcut) !==
      JSON.stringify(previous.general.globalShortcut)
    ) {
      this.syncGlobalShortcut(next);
    }
    if (next.general.sleepAfterMinutes !== previous.general.sleepAfterMinutes) {
      this.characterState.refreshInactivity();
    }
    if (next.personality !== previous.personality) {
      // Feedback visual da troca de personalidade (SPEC §7.4).
      this.characterState.dispatch({ type: 'SUCCESS_FEEDBACK' });
    }
    if (next.privacy.saveHistory !== previous.privacy.saveHistory) {
      if (next.privacy.saveHistory) {
        this.history = this.loadHistory(next);
        this.history.save(this.assistant.storedConversation());
      } else {
        // Desligado: para de gravar. O arquivo só some se o usuário pedir (SPEC §12).
        this.history?.flushSync();
        this.history = null;
      }
    } else if (next.privacy.historyRetentionDays !== previous.privacy.historyRetentionDays) {
      this.history?.setRetention(next.privacy.historyRetentionDays);
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
      this.balloon?.window ?? null,
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
      this.balloon?.reposition();
    }, DISPLAY_CHANGE_DEBOUNCE_MS);
  }
}
