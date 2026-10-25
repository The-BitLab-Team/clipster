import type { ConversationSnapshot } from '../../shared/ai/conversation';
import type {
  AiStatus,
  ConnectionResult,
  KeyedProvider,
  KeyStatus,
  ModelListResult
} from '../../shared/ai/providers';
import { ProviderPayloadSchema, SecretSetPayloadSchema } from '../../shared/schemas/ai';
import {
  PermissionRespondPayloadSchema,
  PermissionRevokePayloadSchema
} from '../../shared/schemas/permissions';
import type { PermissionDecision, PermissionGrantView } from '../../shared/tools/types';
import { SecretError } from '../storage/secretStore';
import type { AppCapabilities, AppInfo, OnboardingResult } from '../../shared/ipc/api';
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
import type { CharacterView } from '../../shared/character/states';
import {
  BalloonResizePayloadSchema,
  ChatCancelPayloadSchema,
  ChatSendPayloadSchema,
  ChatTypingPayloadSchema,
  ClipboardWritePayloadSchema,
  HistoryClearPayloadSchema,
  OnboardingCompletePayloadSchema
} from '../../shared/schemas/conversation';
import { AssistantError } from '../ai/assistantService';
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
    getView: () => CharacterView;
    dragStart: () => void;
    dragMove: (delta: DragMovePayload) => void;
    dragEnd: () => void;
    setClickThrough: (ignore: boolean) => void;
    click: () => void;
    openContextMenu: () => void;
  };
  chat: {
    send: (text: string, requester: number) => { requestId: string };
    cancel: (requestId: string) => boolean;
    retry: (requester: number) => { requestId: string };
    conversation: () => ConversationSnapshot;
    newConversation: () => ConversationSnapshot;
    clearHistory: () => Promise<void>;
    typing: () => void;
  };
  onboarding: {
    complete: (result: OnboardingResult) => void;
  };
  balloon: {
    close: () => void;
    resize: (height: number) => void;
  };
  ai: {
    status: () => AiStatus;
    keyStatus: (provider: KeyedProvider) => KeyStatus;
    setKey: (provider: KeyedProvider, value: string, allowInsecure: boolean) => KeyStatus;
    clearKey: (provider: KeyedProvider) => KeyStatus;
    listModels: (provider: KeyedProvider) => Promise<ModelListResult>;
    testConnection: (provider: KeyedProvider) => Promise<ConnectionResult>;
  };
  permissions: {
    respond: (requestId: string, decision: PermissionDecision) => boolean;
    list: () => PermissionGrantView[];
    revoke: (grantId: string) => boolean;
  };
  clipboard: {
    writeText: (text: string) => Promise<void>;
  };
  app: {
    info: () => AppInfo;
    openSettings: (section: SettingsSection | undefined) => void;
    hideClipster: () => void;
    quit: () => void;
    openLogsFolder: () => Promise<void>;
    copyDiagnostics: () => Promise<void>;
    openExternal: (url: string) => Promise<void>;
  };
}

const ALL_WINDOWS: readonly WindowRole[] = ['character', 'settings', 'balloon'];
const UI_WINDOWS: readonly WindowRole[] = ['settings', 'balloon'];
const CHARACTER_ONLY: readonly WindowRole[] = ['character'];
const BALLOON_ONLY: readonly WindowRole[] = ['balloon'];
const SETTINGS_ONLY: readonly WindowRole[] = ['settings'];

/** Traduz os erros do AssistantService para o envelope do IPC. */
function assistantCall<T>(call: () => T): T {
  try {
    return call();
  } catch (error) {
    if (!(error instanceof AssistantError)) throw error;
    switch (error.code) {
      case 'BUSY':
        throw new IpcHandlerError('BUSY', error.message);
      case 'NOT_CONFIGURED':
        throw new IpcHandlerError('NOT_CONFIGURED', error.message);
      case 'EMPTY':
      case 'TOO_LONG':
      case 'NOTHING_TO_RETRY':
        throw new IpcHandlerError('INVALID_PAYLOAD', error.message);
    }
  }
}

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

  registry.handle(
    IpcChannel.characterGetView,
    { schema: NoPayloadSchema, roles: CHARACTER_ONLY },
    () => deps.character.getView()
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

  // ── Conversa (SPEC §8, §20.5): só o balão conversa; só as Configurações apagam o histórico.

  registry.handle(
    IpcChannel.chatSend,
    { schema: ChatSendPayloadSchema, roles: BALLOON_ONLY },
    ({ text }, { webContentsId }) => assistantCall(() => deps.chat.send(text, webContentsId))
  );
  registry.handle(
    IpcChannel.chatCancel,
    { schema: ChatCancelPayloadSchema, roles: BALLOON_ONLY },
    ({ requestId }) => ({ cancelled: deps.chat.cancel(requestId) })
  );
  registry.handle(
    IpcChannel.chatRetry,
    { schema: NoPayloadSchema, roles: BALLOON_ONLY },
    (_payload, { webContentsId }) => assistantCall(() => deps.chat.retry(webContentsId))
  );
  registry.handle(
    IpcChannel.chatConversationGet,
    { schema: NoPayloadSchema, roles: BALLOON_ONLY },
    () => deps.chat.conversation()
  );
  registry.handle(
    IpcChannel.chatConversationNew,
    { schema: NoPayloadSchema, roles: BALLOON_ONLY },
    () => deps.chat.newConversation()
  );
  registry.handle(
    IpcChannel.chatHistoryClear,
    { schema: HistoryClearPayloadSchema, roles: SETTINGS_ONLY },
    async () => {
      await deps.chat.clearHistory();
      return { cleared: true };
    }
  );
  registry.on(
    IpcChannel.chatTyping,
    { schema: ChatTypingPayloadSchema, roles: BALLOON_ONLY },
    ({ typing }) => {
      if (typing) deps.chat.typing();
    }
  );
  registry.handle(
    IpcChannel.onboardingComplete,
    { schema: OnboardingCompletePayloadSchema, roles: BALLOON_ONLY },
    (result) => {
      deps.onboarding.complete(result);
      return null;
    }
  );

  // ── IA e chaves (SPEC §20, §21): só as Configurações mexem em chaves e testam conexão.

  registry.handle(IpcChannel.aiStatusGet, { schema: NoPayloadSchema, roles: UI_WINDOWS }, () =>
    deps.ai.status()
  );

  // Permissões das ferramentas (SPEC §22): responder só pelo balão, onde o pedido aparece;
  // ver e revogar só pelas Configurações. Nenhum canal cria uma permissão sem pedido pendente.
  registry.handle(
    IpcChannel.permissionsRespond,
    { schema: PermissionRespondPayloadSchema, roles: BALLOON_ONLY },
    ({ requestId, decision }) => ({ accepted: deps.permissions.respond(requestId, decision) })
  );
  registry.handle(
    IpcChannel.permissionsList,
    { schema: NoPayloadSchema, roles: SETTINGS_ONLY },
    () => deps.permissions.list()
  );
  registry.handle(
    IpcChannel.permissionsRevoke,
    { schema: PermissionRevokePayloadSchema, roles: SETTINGS_ONLY },
    ({ grantId }) => ({ revoked: deps.permissions.revoke(grantId) })
  );
  registry.handle(
    IpcChannel.secretsStatus,
    { schema: ProviderPayloadSchema, roles: SETTINGS_ONLY },
    ({ provider }) => deps.ai.keyStatus(provider)
  );
  registry.handle(
    IpcChannel.secretsSet,
    { schema: SecretSetPayloadSchema, roles: SETTINGS_ONLY },
    ({ provider, value, allowInsecure }) => {
      try {
        return deps.ai.setKey(provider, value, allowInsecure === true);
      } catch (error) {
        if (!(error instanceof SecretError)) throw error;
        if (error.code === 'INSECURE_STORAGE') {
          throw new IpcHandlerError('INSECURE_STORAGE', error.message);
        }
        if (error.code === 'INVALID_KEY')
          throw new IpcHandlerError('INVALID_PAYLOAD', error.message);
        throw new IpcHandlerError('INTERNAL', error.message);
      }
    }
  );
  registry.handle(
    IpcChannel.secretsClear,
    { schema: ProviderPayloadSchema, roles: SETTINGS_ONLY },
    ({ provider }) => deps.ai.clearKey(provider)
  );
  registry.handle(
    IpcChannel.aiModelsList,
    { schema: ProviderPayloadSchema, roles: SETTINGS_ONLY },
    ({ provider }) => deps.ai.listModels(provider)
  );
  registry.handle(
    IpcChannel.aiConnectionTest,
    { schema: ProviderPayloadSchema, roles: SETTINGS_ONLY },
    ({ provider }) => deps.ai.testConnection(provider)
  );

  registry.handle(
    IpcChannel.windowsBalloonClose,
    { schema: NoPayloadSchema, roles: BALLOON_ONLY },
    () => {
      deps.balloon.close();
      return null;
    }
  );
  registry.on(
    IpcChannel.balloonResize,
    { schema: BalloonResizePayloadSchema, roles: BALLOON_ONLY },
    ({ height }) => {
      deps.balloon.resize(height);
    }
  );
  registry.handle(
    IpcChannel.clipboardWriteText,
    { schema: ClipboardWritePayloadSchema, roles: BALLOON_ONLY },
    async ({ text }) => {
      await deps.clipboard.writeText(text);
      return null;
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

  registry.handle(
    IpcChannel.diagnosticsCopy,
    { schema: NoPayloadSchema, roles: ['settings'] },
    async () => {
      await deps.app.copyDiagnostics();
      return { copied: true };
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
