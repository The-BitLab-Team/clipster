import { BrowserWindow } from 'electron';
import { IpcChannel } from '../../shared/ipc/channels';
import { BALLOON_SIZE, type BalloonPlacement } from '../../shared/ui/balloon';
import type { Logger } from '../logging/logger';
import { placeBalloon, type BalloonLayout } from './balloonPlacement';
import { currentDisplays } from './displays';
import type { Rect } from './placement';
import { secureWebPreferences } from './webPreferences';

/**
 * Balão de conversa (SPEC §8, §19.5): segunda janela, transparente, sem moldura e fora da
 * barra de tarefas, ancorada ao personagem. Criada uma vez e depois só escondida/mostrada.
 * A altura acompanha o conteúdo (informada pelo próprio balão) até o limite; depois rola.
 */

export interface BalloonWindowOptions {
  preloadPath: string;
  url: string;
  allowDevTools: boolean;
  alwaysOnTop: boolean;
  chatScale: number;
  logger: Logger;
  /** Retângulo atual da janela do personagem. */
  characterBounds: () => Rect | null;
  isQuitting: () => boolean;
  onShown: () => void;
  onHidden: () => void;
}

/** Altura usada até o balão informar a sua. */
const INITIAL_CONTENT_HEIGHT = 220;

export function balloonMaxHeight(chatScale: number): number {
  return (
    Math.ceil(BALLOON_SIZE.maxContentHeight * chatScale) + BALLOON_SIZE.pad + BALLOON_SIZE.tail
  );
}

export function balloonWidth(chatScale: number): number {
  return Math.round(BALLOON_SIZE.width * chatScale) + 2 * BALLOON_SIZE.pad;
}

export class BalloonWindow {
  readonly window: BrowserWindow;
  private readonly ready: Promise<void>;
  private contentHeight = INITIAL_CONTENT_HEIGHT;
  private chatScale: number;
  private placement: BalloonPlacement | null = null;

  constructor(private readonly options: BalloonWindowOptions) {
    this.chatScale = options.chatScale;
    const width = balloonWidth(this.chatScale);
    this.window = new BrowserWindow({
      width,
      height: this.contentHeight,
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
      // Corretor ortográfico segue desligado: ligá-lo baixaria dicionários (SPEC §26, item 14).
      webPreferences: secureWebPreferences(options.preloadPath, options.allowDevTools)
    });
    this.applyAlwaysOnTop(options.alwaysOnTop);
    if (process.platform === 'darwin') {
      this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    }

    this.window.on('close', (event) => {
      // Fechar (ex.: Alt+F4 com o balão focado) só esconde.
      if (!options.isQuitting()) {
        event.preventDefault();
        this.hide();
      }
    });
    this.window.on('show', () => {
      options.onShown();
    });
    this.window.on('hide', () => {
      options.onHidden();
    });

    this.ready = new Promise((resolveReady) => {
      this.window.webContents.once('did-finish-load', () => {
        resolveReady();
      });
    });
    this.window.loadURL(options.url).catch((error: unknown) => {
      options.logger.error('balloon.load_failed', { error });
    });
  }

  get webContentsId(): number {
    return this.window.webContents.id;
  }

  isVisible(): boolean {
    return !this.window.isDestroyed() && this.window.isVisible();
  }

  /**
   * Mostra o balão. Com `focus`, é ação do usuário: a janela e o campo de texto recebem o foco.
   * Sem `focus` (ex.: primeira execução), aparece sem tirar o foco de ninguém (SPEC §2).
   */
  async show(options: { focus: boolean; wokeUp: boolean }): Promise<void> {
    await this.ready;
    if (this.window.isDestroyed()) return;
    this.reposition();
    if (options.focus) {
      this.window.show();
      this.window.focus();
    } else if (!this.window.isVisible()) {
      this.window.showInactive();
    }
    this.window.webContents.send(IpcChannel.balloonShown, options);
  }

  hide(): void {
    if (!this.window.isDestroyed() && this.window.isVisible()) this.window.hide();
  }

  setContentHeight(height: number): void {
    const next = Math.min(Math.max(height, 40), balloonMaxHeight(this.chatScale));
    if (next === this.contentHeight) return;
    this.contentHeight = next;
    this.reposition();
  }

  setChatScale(scale: number): void {
    this.chatScale = scale;
    this.reposition();
  }

  setAlwaysOnTop(flag: boolean): void {
    this.applyAlwaysOnTop(flag);
  }

  /** Recalcula a posição a partir do personagem (arrasto, monitores, tamanho). */
  reposition(): void {
    if (this.window.isDestroyed()) return;
    const character = this.options.characterBounds();
    if (character === null) return;
    const size = { width: balloonWidth(this.chatScale), height: this.contentHeight };
    const layout = placeBalloon(character, size, currentDisplays());
    this.window.setBounds({ x: layout.x, y: layout.y, width: size.width, height: size.height });
    this.sendPlacement(layout);
  }

  destroy(): void {
    if (!this.window.isDestroyed()) this.window.destroy();
  }

  private sendPlacement(layout: BalloonLayout): void {
    const placement: BalloonPlacement = { vertical: layout.vertical, tailX: layout.tailX };
    if (
      this.placement?.vertical === placement.vertical &&
      this.placement.tailX === placement.tailX
    ) {
      return;
    }
    this.placement = placement;
    this.window.webContents.send(IpcChannel.balloonPlacement, placement);
  }

  private applyAlwaysOnTop(flag: boolean): void {
    if (this.window.isDestroyed()) return;
    if (flag) this.window.setAlwaysOnTop(true, 'floating');
    else this.window.setAlwaysOnTop(false);
  }
}
