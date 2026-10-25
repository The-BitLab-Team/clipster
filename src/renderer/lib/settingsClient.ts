import type { AppInfo, IpcResult } from '../../shared/ipc/api';
import type { Settings, SettingsPatch } from '../../shared/schemas/settings';

/**
 * Store externo (para `useSyncExternalStore`) que espelha as configurações do main.
 * O main é a fonte da verdade: o renderer só pede mudanças e recebe o resultado.
 */

export type SettingsSnapshot =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; settings: Settings; info: AppInfo };

let snapshot: SettingsSnapshot = { status: 'loading' };
const listeners = new Set<() => void>();
let started = false;

function emit(next: SettingsSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function start(): void {
  if (started) return;
  started = true;
  const api = window.clipster;
  void Promise.all([api.settings.get(), api.app.info()]).then(([settings, info]) => {
    if (!settings.ok || !info.ok) {
      emit({ status: 'error' });
      return;
    }
    emit({ status: 'ready', settings: settings.data, info: info.data });
  });
  api.settings.onChange((settings) => {
    if (snapshot.status === 'ready') emit({ ...snapshot, settings });
  });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): SettingsSnapshot {
  return snapshot;
}

export async function updateSettings(patch: SettingsPatch): Promise<IpcResult<Settings>> {
  const result = await window.clipster.settings.update(patch);
  if (result.ok && snapshot.status === 'ready') emit({ ...snapshot, settings: result.data });
  return result;
}
