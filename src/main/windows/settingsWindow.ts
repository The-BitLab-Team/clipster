import { BrowserWindow, nativeTheme } from 'electron';
import type { SettingsSection } from '../../shared/schemas/settings';
import { SETTINGS_WINDOW_SIZE } from '../../shared/constants/ui';
import { IpcChannel } from '../../shared/ipc/channels';
import type { Logger } from '../logging/logger';
import { secureWebPreferences } from './webPreferences';

/**
 * Janela de Configurações (SPEC §12, §19.5): moldura nativa, criada sob demanda,
 * destruída ao fechar. Abrir é sempre uma ação do usuário, então ela recebe foco.
 */

export interface SettingsWindowOptions {
  preloadPath: string;
  allowDevTools: boolean;
  urlFor(section: SettingsSection | undefined): string;
  title(): string;
  iconPath: string | undefined;
  logger: Logger;
  onCreated(webContentsId: number): void;
  onClosed(webContentsId: number): void;
}

export class SettingsWindowManager {
  private window: BrowserWindow | null = null;

  constructor(private readonly options: SettingsWindowOptions) {}

  get webContentsId(): number | null {
    return this.window === null || this.window.isDestroyed() ? null : this.window.webContents.id;
  }

  get browserWindow(): BrowserWindow | null {
    return this.window !== null && !this.window.isDestroyed() ? this.window : null;
  }

  open(section?: SettingsSection): void {
    const existing = this.browserWindow;
    if (existing !== null) {
      if (section !== undefined) {
        existing.webContents.send(IpcChannel.windowsSettingsNavigate, section);
      }
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      return;
    }

    const win = new BrowserWindow({
      width: SETTINGS_WINDOW_SIZE.width,
      height: SETTINGS_WINDOW_SIZE.height,
      minWidth: SETTINGS_WINDOW_SIZE.minWidth,
      minHeight: SETTINGS_WINDOW_SIZE.minHeight,
      show: false,
      title: this.options.title(),
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#14181c' : '#f4f6f8',
      autoHideMenuBar: true,
      ...(this.options.iconPath === undefined ? {} : { icon: this.options.iconPath }),
      webPreferences: secureWebPreferences(this.options.preloadPath, this.options.allowDevTools)
    });
    if (process.platform !== 'darwin') win.setMenu(null);

    const webContentsId = win.webContents.id;
    this.window = win;
    this.options.onCreated(webContentsId);

    win.once('ready-to-show', () => {
      win.show();
      win.focus();
    });
    win.on('closed', () => {
      this.options.onClosed(webContentsId);
      this.window = null;
    });

    win.loadURL(this.options.urlFor(section)).catch((error: unknown) => {
      this.options.logger.error('settings_window.load_failed', { error });
    });
  }

  setTitle(title: string): void {
    this.browserWindow?.setTitle(title);
  }

  close(): void {
    this.browserWindow?.close();
  }
}
