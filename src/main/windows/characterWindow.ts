import { BrowserWindow, type Menu } from 'electron';
import type { SavedPosition } from '../../shared/schemas/settings';
import { CHARACTER_BASE_SIZE, POSITION_SAVE_DEBOUNCE_MS } from '../../shared/constants/ui';
import type { Logger } from '../logging/logger';
import { currentDisplays } from './displays';
import {
  computeSavedPosition,
  constrainDragPosition,
  ensureVisible,
  resizeAroundCenter,
  resolveCharacterPosition,
  scaledSize,
  type Rect
} from './placement';
import { secureWebPreferences } from './webPreferences';

/**
 * Janela do personagem (SPEC §19.1–19.4): transparente, sem moldura, fora da barra de tarefas,
 * nunca rouba foco, arrasto manual, clique através das áreas transparentes.
 */

export interface CharacterWindowOptions {
  preloadPath: string;
  url: string;
  scale: number;
  savedPosition: SavedPosition | null;
  alwaysOnTop: boolean;
  supportsClickThrough: boolean;
  allowDevTools: boolean;
  logger: Logger;
  isQuitting(): boolean;
  /** Fechar a janela (ex.: Alt+F4) esconde o Clipster em vez de sair. */
  onCloseRequested(): void;
  onPositionCommitted(position: SavedPosition): void;
}

export class CharacterWindow {
  readonly window: BrowserWindow;
  private readonly ready: Promise<void>;
  private dragOrigin: Rect | null = null;
  private ignoringMouse = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: CharacterWindowOptions) {
    const size = scaledSize(CHARACTER_BASE_SIZE, options.scale);
    const position = resolveCharacterPosition(options.savedPosition, currentDisplays(), size);

    this.window = new BrowserWindow({
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: options.alwaysOnTop,
      title: 'Clipster',
      webPreferences: secureWebPreferences(options.preloadPath, options.allowDevTools)
    });

    this.applyAlwaysOnTop(options.alwaysOnTop);
    if (process.platform === 'darwin') {
      this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    }

    this.window.on('close', (event) => {
      if (!options.isQuitting()) {
        event.preventDefault();
        options.onCloseRequested();
      }
    });

    this.ready = new Promise((resolveReady) => {
      this.window.once('ready-to-show', () => {
        resolveReady();
      });
    });

    this.setClickThrough(true);
    this.window.loadURL(options.url).catch((error: unknown) => {
      options.logger.error('character.load_failed', { error });
    });
  }

  get webContentsId(): number {
    return this.window.webContents.id;
  }

  isVisible(): boolean {
    return !this.window.isDestroyed() && this.window.isVisible();
  }

  /** Mostra sem tomar o foco do usuário (SPEC §2, regra 2). */
  async showInactive(): Promise<void> {
    await this.ready;
    if (this.window.isDestroyed()) return;
    this.ensureOnScreen();
    if (!this.window.isVisible()) this.window.showInactive();
  }

  hide(): void {
    if (!this.window.isDestroyed()) this.window.hide();
  }

  setAlwaysOnTop(flag: boolean): void {
    this.applyAlwaysOnTop(flag);
  }

  setScale(scale: number): void {
    const next = resizeAroundCenter(
      this.window.getBounds(),
      scaledSize(CHARACTER_BASE_SIZE, scale),
      currentDisplays()
    );
    this.window.setBounds(next);
    this.commitPositionSoon();
  }

  /** Recoloca o personagem numa área visível (troca de monitor, resolução ou DPI). */
  ensureOnScreen(): void {
    if (this.window.isDestroyed() || this.dragOrigin !== null) return;
    const bounds = this.window.getBounds();
    const visible = ensureVisible(bounds, bounds, currentDisplays());
    if (visible.x !== bounds.x || visible.y !== bounds.y) {
      this.window.setBounds({
        x: visible.x,
        y: visible.y,
        width: bounds.width,
        height: bounds.height
      });
      this.options.logger.info('character.repositioned', { displayId: visible.displayId });
      this.commitPositionSoon();
    }
  }

  dragStart(): void {
    this.dragOrigin = this.window.getBounds();
    this.setClickThrough(false);
  }

  /** `dx`/`dy` são o deslocamento total desde o início do arrasto, em DIP. */
  dragMove(dx: number, dy: number): void {
    const origin = this.dragOrigin;
    if (origin === null) return;
    const size = { width: origin.width, height: origin.height };
    const next = constrainDragPosition(
      { x: origin.x + dx, y: origin.y + dy },
      size,
      currentDisplays()
    );
    // setBounds com tamanho fixo evita que o Windows altere o tamanho ao cruzar monitores com DPI diferente.
    this.window.setBounds({ ...next, ...size });
  }

  dragEnd(): void {
    if (this.dragOrigin === null) return;
    this.dragOrigin = null;
    this.commitPositionSoon();
  }

  /** Só tem efeito no Windows e no macOS (a opção `forward` não existe no Linux). */
  setClickThrough(ignore: boolean): void {
    if (!this.options.supportsClickThrough || this.window.isDestroyed()) return;
    if (ignore && this.dragOrigin !== null) return;
    if (ignore === this.ignoringMouse) return;
    this.ignoringMouse = ignore;
    this.window.setIgnoreMouseEvents(ignore, { forward: true });
  }

  popupMenu(menu: Menu): void {
    if (this.window.isDestroyed()) return;
    this.setClickThrough(false);
    menu.popup({ window: this.window });
  }

  commitPositionNow(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.window.isDestroyed()) return;
    const bounds = this.window.getBounds();
    this.options.onPositionCommitted(computeSavedPosition(bounds, bounds, currentDisplays()));
  }

  destroy(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    if (!this.window.isDestroyed()) this.window.destroy();
  }

  private commitPositionSoon(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.commitPositionNow();
    }, POSITION_SAVE_DEBOUNCE_MS);
  }

  private applyAlwaysOnTop(flag: boolean): void {
    if (this.window.isDestroyed()) return;
    if (flag) this.window.setAlwaysOnTop(true, 'floating');
    else this.window.setAlwaysOnTop(false);
  }
}
