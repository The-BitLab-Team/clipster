import type { PermissionDecision, PermissionGrantView } from '../tools/types';
import type { ChatEvent, ConversationSnapshot } from '../ai/conversation';
import type {
  AiStatus,
  ConnectionResult,
  KeyedProvider,
  KeyStatus,
  ModelListResult
} from '../ai/providers';
import type { CharacterView } from '../character/states';
import type { PersonalityId, Settings, SettingsPatch, SettingsSection } from '../schemas/settings';
import type { BalloonPlacement, BalloonShown } from '../ui/balloon';
import type { IpcChannel } from './channels';
import type { DragMovePayload, LogLevel } from './payloads';

/** Envelope de toda resposta `invoke` (SPEC §17.3). */
export type IpcErrorCode =
  | 'INVALID_PAYLOAD'
  | 'FORBIDDEN_SENDER'
  | 'UNSUPPORTED'
  | 'INTERNAL'
  /** Já existe uma resposta em andamento (uma por vez). */
  | 'BUSY'
  /** Nenhuma IA configurada. */
  | 'NOT_CONFIGURED'
  /** O atalho global escolhido já é usado por outro programa. */
  | 'SHORTCUT_IN_USE'
  /** Não há cofre seguro para a chave; é preciso confirmar (SPEC §21). */
  | 'INSECURE_STORAGE';

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
  [IpcChannel.chatSend]: { requestId: string };
  [IpcChannel.chatCancel]: { cancelled: boolean };
  [IpcChannel.chatRetry]: { requestId: string };
  [IpcChannel.chatConversationGet]: ConversationSnapshot;
  [IpcChannel.chatConversationNew]: ConversationSnapshot;
  [IpcChannel.chatHistoryClear]: { cleared: boolean };
  [IpcChannel.onboardingComplete]: null;
  [IpcChannel.windowsBalloonClose]: null;
  [IpcChannel.clipboardWriteText]: null;
  [IpcChannel.secretsSet]: KeyStatus;
  [IpcChannel.secretsClear]: KeyStatus;
  [IpcChannel.secretsStatus]: KeyStatus;
  [IpcChannel.aiModelsList]: ModelListResult;
  [IpcChannel.aiConnectionTest]: ConnectionResult;
  [IpcChannel.aiStatusGet]: AiStatus;
  [IpcChannel.permissionsRespond]: { accepted: boolean };
  [IpcChannel.permissionsList]: PermissionGrantView[];
  [IpcChannel.permissionsRevoke]: { revoked: boolean };
  [IpcChannel.windowsOpenSettings]: null;
  [IpcChannel.windowsHideClipster]: null;
  [IpcChannel.appInfo]: AppInfo;
  [IpcChannel.appQuit]: null;
  [IpcChannel.shellOpenExternal]: { opened: boolean };
  [IpcChannel.diagnosticsOpenLogs]: null;
  [IpcChannel.diagnosticsCopy]: { copied: boolean };
}

/** Payload de cada evento enviado do main para o renderer. */
export interface IpcEventPayloads {
  [IpcChannel.settingsChanged]: Settings;
  [IpcChannel.windowsSettingsNavigate]: SettingsSection;
  [IpcChannel.characterView]: CharacterView;
  [IpcChannel.chatEvent]: ChatEvent;
  [IpcChannel.balloonPlacement]: BalloonPlacement;
  [IpcChannel.balloonShown]: BalloonShown;
  [IpcChannel.aiStatus]: AiStatus;
  [IpcChannel.permissionsChanged]: null;
}

export interface OnboardingResult {
  personality: PersonalityId;
  /** "Configurar IA agora" abre as Configurações e conta como "nenhum" aqui. */
  provider: 'none' | 'demo';
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
  chat: {
    send(text: string): Promise<IpcResult<{ requestId: string }>>;
    cancel(requestId: string): Promise<IpcResult<{ cancelled: boolean }>>;
    retry(): Promise<IpcResult<{ requestId: string }>>;
    getConversation(): Promise<IpcResult<ConversationSnapshot>>;
    newConversation(): Promise<IpcResult<ConversationSnapshot>>;
    /** Apaga o histórico salvo e a conversa atual. Só pela janela de Configurações. */
    clearHistory(): Promise<IpcResult<{ cleared: boolean }>>;
    /** Usuário digitando: alimenta o estado `listening`. */
    typing(): void;
    onEvent(listener: (event: ChatEvent) => void): Unsubscribe;
  };
  onboarding: {
    complete(result: OnboardingResult): Promise<IpcResult<null>>;
  };
  ai: {
    /** Se dá para conversar com a IA escolhida e, se não, o que falta. */
    status(): Promise<IpcResult<AiStatus>>;
    onStatus(listener: (status: AiStatus) => void): Unsubscribe;
    /** Só as Configurações: a chave vai uma vez para o main e nunca volta (SPEC §21). */
    keyStatus(provider: KeyedProvider): Promise<IpcResult<KeyStatus>>;
    setKey(
      provider: KeyedProvider,
      value: string,
      allowInsecure?: boolean
    ): Promise<IpcResult<KeyStatus>>;
    clearKey(provider: KeyedProvider): Promise<IpcResult<KeyStatus>>;
    listModels(provider: KeyedProvider): Promise<IpcResult<ModelListResult>>;
    testConnection(provider: KeyedProvider): Promise<IpcResult<ConnectionResult>>;
  };
  permissions: {
    /** Só o balão: resposta ao pedido de permissão de uma ferramenta (SPEC §22.2). */
    respond(
      requestId: string,
      decision: PermissionDecision
    ): Promise<IpcResult<{ accepted: boolean }>>;
    /** Só as Configurações: permissões que valem além de uma chamada. */
    list(): Promise<IpcResult<PermissionGrantView[]>>;
    revoke(grantId: string): Promise<IpcResult<{ revoked: boolean }>>;
    onChange(listener: () => void): Unsubscribe;
  };
  balloon: {
    close(): Promise<IpcResult<null>>;
    /** Altura do conteúdo, em DIP, para a janela acompanhar. */
    resize(height: number): void;
    onPlacement(listener: (placement: BalloonPlacement) => void): Unsubscribe;
    onShown(listener: (shown: BalloonShown) => void): Unsubscribe;
  };
  clipboard: {
    writeText(text: string): Promise<IpcResult<null>>;
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
    /** Copia para a área de transferência um resumo técnico, sem chaves nem conversas. */
    copy(): Promise<IpcResult<{ copied: boolean }>>;
  };
  log: {
    write(
      level: LogLevel,
      message: string,
      context?: Record<string, string | number | boolean | null>
    ): void;
  };
}
