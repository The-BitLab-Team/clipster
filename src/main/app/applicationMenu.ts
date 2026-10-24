import { Menu, type MenuItemConstructorOptions } from 'electron';

/**
 * Menu da aplicação. No Windows/Linux não há menu (as janelas são sem moldura ou têm
 * `setMenu(null)`). No macOS um menu mínimo é necessário para Cmd+Q e atalhos de edição.
 */
export function installApplicationMenu(platform: NodeJS.Platform): void {
  if (platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
