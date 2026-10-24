import type { AppCapabilities, AppInfo } from '../../shared/ipc/api';
import { IpcChannel } from '../../shared/ipc/channels';
import {
  ClickThroughPayloadSchema,
  DragMovePayloadSchema,
  LogWritePayloadSchema,
  NoPayloadSchema,
  OpenExternalPayloadSchema,
  OpenSettingsPayloadSchema,
  SettingsPatchSchema,
  type DragMovePayload
} from '../../shared/ipc/payloads';
import type { Settings, SettingsPatch, SettingsSection } from '../../shared/schemas/settings';
import type { Logger } from '../logging/logger';
import { isSafeExternalUrl } from '../security/urls';
import { IpcHandlerError, type IpcRegistry, type WindowRole } from './registry';

/**
 * Liga cada canal do Apêndice C da SPEC à sua implementação, com os papéis de janela
 * autorizados (menor privilégio: a janela do personagem não altera configurações, por exemplo).
 */

export interface IpcHandlerDeps {
  registry: IpcRegistry;
  capabilities: AppCapabilities;
  rendererLogger: Logger;
  settings: {
    get: () => Settings;
    update: (patch: SettingsPatch) => Settings;
  };
  character: {
    dragStart: () => void;
    dragMove: (delta: DragMovePayload) => void;
    dragEnd: () => void;
    setClickThrough: (ignore: boolean) => void;
    click: () => void;
    openContextMenu: () => void;
  };
  app: {
    info: () => AppInfo;
    openSettings: (section: SettingsSection | undefined) => void;
    hideClipster: () => void;
    quit: () => void;
    openLogsFolder: () => Promise<void>;
    openExternal: (url: string) => Promise<void>;
  };
}

const ALL_WINDOWS: readonly WindowRole[] = ['character', 'settings', 'balloon'];
const UI_WINDOWS: readonly WindowRole[] = ['settings', 'balloon'];
const CHARACTER_ONLY: readonly WindowRole[] = ['character'];

export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  const { registry } = deps;

  registry.handle(IpcChannel.settingsGet, { schema: NoPayloadSchema, roles: ALL_WINDOWS }, () =>
    deps.settings.get()
  );

  registry.handle(
    IpcChannel.settingsUpdate,
    { schema: SettingsPatchSchema, roles: UI_WINDOWS },
    (patch) => {
      if (patch.general?.launchAtLogin === true && !deps.capabilities.launchAtLogin) {
        throw new IpcHandlerError('UNSUPPORTED', 'Iniciar com o sistema não está disponível aqui.');
      }
      return deps.settings.update(patch);
    }
  );

  registry.on(
    IpcChannel.characterDragStart,
    { schema: NoPayloadSchema, roles: CHARACTER_ONLY },
    () => {
      deps.character.dragStart();
    }
  );
  registry.on(
    IpcChannel.characterDragMove,
    { schema: DragMovePayloadSchema, roles: CHARACTER_ONLY },
    (delta) => {
      deps.character.dragMove(delta);
    }
  );
  registry.on(
    IpcChannel.characterDragEnd,
    { schema: NoPayloadSchema, roles: CHARACTER_ONLY },
    () => {
      deps.character.dragEnd();
    }
  );
  registry.on(
    IpcChannel.characterSetClickThrough,
    { schema: ClickThroughPayloadSchema, roles: CHARACTER_ONLY },
    ({ ignore }) => {
      deps.character.setClickThrough(ignore);
    }
  );
  registry.on(IpcChannel.characterClick, { schema: NoPayloadSchema, roles: CHARACTER_ONLY }, () => {
    deps.character.click();
  });
  registry.on(
    IpcChannel.characterContextMenu,
    { schema: NoPayloadSchema, roles: CHARACTER_ONLY },
    () => {
      deps.character.openContextMenu();
    }
  );

  registry.handle(
    IpcChannel.windowsOpenSettings,
    { schema: OpenSettingsPayloadSchema, roles: ALL_WINDOWS },
    (payload) => {
      deps.app.openSettings(payload?.section);
      return null;
    }
  );
  registry.handle(
    IpcChannel.windowsHideClipster,
    { schema: NoPayloadSchema, roles: ALL_WINDOWS },
    () => {
      deps.app.hideClipster();
      return null;
    }
  );

  registry.handle(IpcChannel.appInfo, { schema: NoPayloadSchema, roles: ALL_WINDOWS }, () =>
    deps.app.info()
  );
  registry.handle(IpcChannel.appQuit, { schema: NoPayloadSchema, roles: ALL_WINDOWS }, () => {
    deps.app.quit();
    return null;
  });

  registry.handle(
    IpcChannel.shellOpenExternal,
    { schema: OpenExternalPayloadSchema, roles: UI_WINDOWS },
    async ({ url }) => {
      if (!isSafeExternalUrl(url)) return { opened: false };
      await deps.app.openExternal(url);
      return { opened: true };
    }
  );

  registry.handle(
    IpcChannel.diagnosticsOpenLogs,
    { schema: NoPayloadSchema, roles: ['settings'] },
    async () => {
      await deps.app.openLogsFolder();
      return null;
    }
  );

  registry.on(
    IpcChannel.logWrite,
    { schema: LogWritePayloadSchema, roles: ALL_WINDOWS },
    ({ level, message, context }, { role }) => {
      deps.rendererLogger[level](message, { ...context, window: role });
    }
  );
}
