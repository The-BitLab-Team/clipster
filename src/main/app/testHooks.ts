import type { Settings } from '../../shared/schemas/settings';

/**
 * Ganchos usados apenas pelos testes E2E (SPEC §29.3). Só são publicados em
 * `globalThis.__clipsterTest` quando o app inicia com CLIPSTER_E2E=1, e vivem no
 * main process: nenhum renderer consegue alcançá-los.
 */
export interface TestHooks {
  run: (command: string) => void;
  characterBounds: () => { x: number; y: number; width: number; height: number } | null;
  isCharacterVisible: () => boolean;
  isAlwaysOnTop: () => boolean;
  isSettingsWindowOpen: () => boolean;
  settings: () => Settings;
  flushSettings: () => Promise<void>;
}

declare global {
  var __clipsterTest: TestHooks | undefined;
}
