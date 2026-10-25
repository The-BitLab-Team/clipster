/**
 * Lista explícita de canais IPC (SPEC §26, item 4; Apêndice C).
 * Nenhum outro canal é registrado no main nem chamado pelo preload.
 */
export const IpcChannel = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsChanged: 'settings:changed',

  characterDragStart: 'character:dragStart',
  characterDragMove: 'character:dragMove',
  characterDragEnd: 'character:dragEnd',
  characterSetClickThrough: 'character:setClickThrough',
  characterClick: 'character:click',
  characterContextMenu: 'character:contextMenu',
  characterGetView: 'character:getView',
  characterView: 'character:view',

  chatSend: 'chat:send',
  chatCancel: 'chat:cancel',
  chatRetry: 'chat:retry',
  chatEvent: 'chat:event',
  chatConversationGet: 'chat:conversation:get',
  chatConversationNew: 'chat:conversation:new',
  chatHistoryClear: 'chat:history:clear',
  chatTyping: 'chat:typing',
  onboardingComplete: 'onboarding:complete',

  secretsSet: 'secrets:set',
  secretsClear: 'secrets:clear',
  secretsStatus: 'secrets:status',
  aiModelsList: 'ai:models:list',
  aiConnectionTest: 'ai:connection:test',
  aiStatusGet: 'ai:status:get',
  aiStatus: 'ai:status',

  permissionsRespond: 'permissions:respond',
  permissionsList: 'permissions:list',
  permissionsRevoke: 'permissions:revoke',
  permissionsChanged: 'permissions:changed',

  windowsBalloonClose: 'windows:balloon:close',
  balloonResize: 'balloon:resize',
  balloonPlacement: 'balloon:placement',
  balloonShown: 'balloon:shown',

  windowsOpenSettings: 'windows:settings:open',
  windowsSettingsNavigate: 'windows:settings:navigate',
  windowsHideClipster: 'windows:hideClipster',

  appInfo: 'app:info',
  appQuit: 'app:quit',

  shellOpenExternal: 'shell:openExternal',
  clipboardWriteText: 'clipboard:writeText',
  diagnosticsOpenLogs: 'diagnostics:openLogs',
  logWrite: 'log:write'
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];
