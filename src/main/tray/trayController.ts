import { nativeImage, Tray, type Menu } from 'electron';
import type { Logger } from '../logging/logger';

/** Ícone na bandeja do sistema (SPEC §11). */

export interface TrayControllerOptions {
  iconPath: string;
  /** macOS usa imagem "template" monocromática, que se adapta ao tema da barra. */
  template: boolean;
  tooltip(): string;
  buildMenu(): Menu;
  /** Clique esquerdo no Windows. */
  onPrimaryClick(): void;
  logger: Logger;
}

export class TrayController {
  private tray: Tray | null = null;

  constructor(private readonly options: TrayControllerOptions) {}

  create(): void {
    const image = nativeImage.createFromPath(this.options.iconPath);
    if (image.isEmpty()) {
      this.options.logger.warn('tray.icon_missing', { iconPath: this.options.iconPath });
    }
    if (this.options.template) image.setTemplateImage(true);

    this.tray = new Tray(image);
    this.tray.setToolTip(this.options.tooltip());
    this.tray.setContextMenu(this.options.buildMenu());
    if (process.platform === 'win32') {
      this.tray.on('click', () => {
        this.options.onPrimaryClick();
      });
    }
  }

  refresh(): void {
    if (this.tray === null || this.tray.isDestroyed()) return;
    this.tray.setToolTip(this.options.tooltip());
    this.tray.setContextMenu(this.options.buildMenu());
  }

  /**
   * Dica junto ao ícone. Só no Windows, onde o ícone pode ficar escondido em "ícones ocultos";
   * no macOS ele fica sempre visível na barra de menus e no Linux não há essa API.
   */
  showHint(title: string, content: string): void {
    if (process.platform !== 'win32' || this.tray === null || this.tray.isDestroyed()) return;
    this.tray.displayBalloon({ iconType: 'info', title, content, noSound: true });
  }

  destroy(): void {
    if (this.tray !== null && !this.tray.isDestroyed()) this.tray.destroy();
    this.tray = null;
  }
}
