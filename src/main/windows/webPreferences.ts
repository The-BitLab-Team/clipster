import type { WebPreferences } from 'electron';

/**
 * Preferências obrigatórias de toda janela (SPEC §26, item 1).
 * Centralizadas para que nenhuma janela nasça com uma configuração mais fraca.
 */
export function secureWebPreferences(preloadPath: string, allowDevTools: boolean): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    // Corretor ortográfico desligado até existir campo de texto que precise dele (SPEC §26, item 14).
    spellcheck: false,
    devTools: allowDevTools
  };
}
