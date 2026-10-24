import type { CharacterView } from '../character/states';
import type { Settings, SettingsPatch, SettingsSection } from '../schemas/settings';
import type { IpcChannel } from './channels';
import type { DragMovePayload, LogLevel } from './payloads';

/** Envelope de toda resposta `invoke` (SPEC §17.3). */
export type IpcErrorCode = 'INVALID_PAYLOAD' | 'FORBIDDEN_SENDER' | 'UNSUPPORTED' | 'INTERNAL';

export interface IpcError {
  code: IpcErrorCode;
  message: string;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

export interface AppCapabilities {
  /** Login item só existe no app instalado em Windows/macOS (SPEC §27.2). */
  launchAtLogin: boolean;
  /** Clique através das áreas transparentes (Windows/macOS) (SPEC §19.3). */
  clickThrough: boolean;
}

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  platform: string;
  systemLanguages: string[];
  isPackaged: boolean;
  repositoryUrl: string | null;
  capabilities: AppCapabilities;
}

export type Unsubscribe = () => void;

/** Tipo da resposta de cada canal `invoke`. Mantém preload e main de acordo. */
export interface IpcInvokeResponses {
  [IpcChannel.settingsGet]: Settings;
  [IpcChannel.settingsUpdate]: Settings;
  [IpcChannel.characterGetView]: CharacterView;
  [IpcChannel.windowsOpenSettings]: null;
  [IpcChannel.windowsHideClipster]: null;
  [IpcChannel.appInfo]: AppInfo;
  [IpcChannel.appQuit]: null;
  [IpcChannel.shellOpenExternal]: { opened: boolean };
  [IpcChannel.diagnosticsOpenLogs]: null;
}

/** Payload de cada evento enviado do main para o renderer. */
export interface IpcEventPayloads {
  [IpcChannel.settingsChanged]: Settings;
  [IpcChannel.windowsSettingsNavigate]: SettingsSection;
  [IpcChannel.characterView]: CharacterView;
}

export type IpcInvokeChannel = keyof IpcInvokeResponses;
export type IpcEventChannel = keyof IpcEventPayloads;

/** API exposta pelo preload em `window.clipster`. Nada além disso chega ao renderer. */
export interface ClipsterApi {
  settings: {
    get(): Promise<IpcResult<Settings>>;
    update(patch: SettingsPatch): Promise<IpcResult<Settings>>;
    onChange(listener: (settings: Settings) => void): Unsubscribe;
  };
  character: {
    getView(): Promise<IpcResult<CharacterView>>;
    onView(listener: (view: CharacterView) => void): Unsubscribe;
    dragStart(): void;
    dragMove(delta: DragMovePayload): void;
    dragEnd(): void;
    setClickThrough(ignore: boolean): void;
    click(): void;
    openContextMenu(): void;
  };
  windows: {
    openSettings(section?: SettingsSection): Promise<IpcResult<null>>;
    onSettingsNavigate(listener: (section: SettingsSection) => void): Unsubscribe;
    hideClipster(): Promise<IpcResult<null>>;
  };
  app: {
    info(): Promise<IpcResult<AppInfo>>;
    quit(): Promise<IpcResult<null>>;
  };
  shell: {
    openExternal(url: string): Promise<IpcResult<{ opened: boolean }>>;
  };
  diagnostics: {
    openLogs(): Promise<IpcResult<null>>;
  };
  log: {
    write(
      level: LogLevel,
      message: string,
      context?: Record<string, string | number | boolean | null>
    ): void;
  };
}
