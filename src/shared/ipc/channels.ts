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

  windowsOpenSettings: 'windows:settings:open',
  windowsSettingsNavigate: 'windows:settings:navigate',
  windowsHideClipster: 'windows:hideClipster',

  appInfo: 'app:info',
  appQuit: 'app:quit',

  shellOpenExternal: 'shell:openExternal',
  diagnosticsOpenLogs: 'diagnostics:openLogs',
  logWrite: 'log:write'
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];
