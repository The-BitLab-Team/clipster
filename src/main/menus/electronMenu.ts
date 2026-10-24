import type { MenuItemConstructorOptions } from 'electron';
import type { MenuCommand, MenuItemSpec } from './menuFactory';

/** Converte a descrição pura dos menus em template do Electron. */
export function toElectronTemplate(
  items: readonly MenuItemSpec[],
  run: (command: MenuCommand) => void
): MenuItemConstructorOptions[] {
  return items.map((item): MenuItemConstructorOptions => {
    switch (item.kind) {
      case 'separator':
        return { type: 'separator', id: item.id };
      case 'submenu':
        return { id: item.id, label: item.label, submenu: toElectronTemplate(item.items, run) };
      case 'checkbox':
      case 'radio':
        return {
          id: item.id,
          type: item.kind,
          label: item.label,
          checked: item.checked,
          click: () => {
            run(item.command);
          }
        };
      case 'command':
        return {
          id: item.id,
          label: item.label,
          enabled: item.enabled,
          click: () => {
            run(item.command);
          }
        };
    }
  });
}
