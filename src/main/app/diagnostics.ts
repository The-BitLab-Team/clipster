import { isLocalUrl } from '../../shared/ai/urls';
import type { AiStatus } from '../../shared/ai/providers';
import type { Locale } from '../../shared/i18n';
import type { Settings } from '../../shared/schemas/settings';

/**
 * "Copiar diagnóstico" (SPEC §24): o que ajuda a entender um problema, sem nada pessoal.
 * Nunca entram: chaves (nem os últimos caracteres), conversas, endereço do servidor de IA,
 * caminhos de pastas ou nome de usuário. Formato técnico, igual em qualquer idioma.
 */

export interface DiagnosticsInput {
  app: {
    name: string;
    version: string;
    electron: string;
    chrome: string;
    node: string;
    platform: NodeJS.Platform;
    arch: string;
    osRelease: string;
    isPackaged: boolean;
  };
  locale: Locale;
  systemLanguages: readonly string[];
  settings: Settings;
  ai: AiStatus;
  model: string;
  secureStorage: boolean;
  displays: readonly { width: number; height: number; scaleFactor: number }[];
  permissions: { always: number; session: number };
  toolDevTools: boolean;
}

export function diagnosticsReport(input: DiagnosticsInput): string {
  const { app, settings } = input;
  const ai = settings.ai;
  const server =
    ai.provider === 'openai-compatible'
      ? isLocalUrl(ai.openaiCompatible.baseUrl)
        ? 'local'
        : 'remote'
      : '-';
  const lines = [
    `${app.name} ${app.version} (${app.isPackaged ? 'installed' : 'development'})`,
    `Electron ${app.electron} · Chromium ${app.chrome} · Node ${app.node}`,
    `OS: ${app.platform} ${app.osRelease} ${app.arch}`,
    `Language: ${input.locale} (setting: ${settings.general.language}; system: ${input.systemLanguages.slice(0, 3).join(', ') || '-'})`,
    `Displays: ${input.displays.map((display) => `${String(display.width)}x${String(display.height)}@${String(display.scaleFactor)}x`).join(', ') || '-'}`,
    `AI: ${ai.provider}${input.model === '' ? '' : ` · model ${input.model}`}${server === '-' ? '' : ` · server ${server}`} · ${input.ai.ready ? 'ready' : `not ready (${input.ai.issue ?? '-'})`}`,
    `Secure key storage: ${input.secureStorage ? 'yes' : 'no'}`,
    `Personality: ${settings.personality}`,
    `Appearance: theme ${settings.appearance.theme}, animations ${settings.appearance.animations}, character ${String(Math.round(settings.appearance.characterScale * 100))}%, chat ${String(Math.round(settings.appearance.chatScale * 100))}%`,
    `General: always on top ${onOff(settings.general.alwaysOnTop)}, start hidden ${onOff(settings.general.startHidden)}, launch at login ${onOff(settings.general.launchAtLogin)}, shortcut ${onOff(settings.general.globalShortcut.enabled)}, sleep after ${String(settings.general.sleepAfterMinutes)} min`,
    `History: ${settings.privacy.saveHistory ? `on (${String(settings.privacy.historyRetentionDays)} days)` : 'off'}`,
    `Tool permissions: ${String(input.permissions.always)} always, ${String(input.permissions.session)} this session${input.toolDevTools ? ' · dev tools on' : ''}`
  ];
  return lines.join('\n');
}

function onOff(value: boolean): string {
  return value ? 'on' : 'off';
}
