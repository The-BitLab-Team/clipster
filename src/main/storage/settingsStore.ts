import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  type SavedPosition,
  type Settings,
  type SettingsPatch
} from '../../shared/schemas/settings';
import { SETTINGS_WRITE_DEBOUNCE_MS } from '../../shared/constants/ui';
import type { Logger } from '../logging/logger';
import { writeFileAtomic, writeFileAtomicSync } from './atomicWrite';
import { parseStoredSettings } from './settingsRecovery';

/**
 * Fonte única da verdade das configurações (SPEC §13, §17.1).
 * Lê de forma tolerante, grava de forma atômica e com debounce, avisa os interessados.
 */

export type SettingsListener = (next: Settings, previous: Settings) => void;

export interface SettingsStoreOptions {
  filePath: string;
  logger: Logger;
  writeDebounceMs?: number;
  now?: () => Date;
}

export interface SettingsLoadInfo {
  /** Não existia arquivo: primeira execução. */
  createdFresh: boolean;
  /** Algum campo (ou o arquivo todo) era inválido e foi restaurado ao padrão. */
  recovered: boolean;
  issues: string[];
  backupPath: string | null;
}

function backupName(filePath: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return join(dirname(filePath), `settings.corrupt-${stamp}.json`);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export class SettingsStore {
  private current: Settings;
  private readonly listeners = new Set<SettingsListener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private pendingWrite: Promise<void> = Promise.resolve();

  private constructor(
    private readonly options: SettingsStoreOptions,
    initial: Settings,
    readonly loadInfo: SettingsLoadInfo
  ) {
    this.current = initial;
  }

  static load(options: SettingsStoreOptions): SettingsStore {
    const { filePath, logger } = options;
    const now = options.now ?? (() => new Date());
    mkdirSync(dirname(filePath), { recursive: true });

    let text: string | null = null;
    try {
      text = readFileSync(filePath, 'utf8');
    } catch (error) {
      if (!isMissingFile(error)) {
        logger.warn('settings.read_failed', { error });
      }
    }

    if (text === null) {
      return new SettingsStore(options, DEFAULT_SETTINGS, {
        createdFresh: true,
        recovered: false,
        issues: [],
        backupPath: null
      });
    }

    let raw: unknown;
    let issues: string[];
    let settings: Settings;
    try {
      raw = JSON.parse(text);
      ({ settings, issues } = parseStoredSettings(raw));
    } catch {
      settings = DEFAULT_SETTINGS;
      issues = ['json'];
    }

    let backupPath: string | null = null;
    if (issues.length > 0) {
      backupPath = backupName(filePath, now());
      try {
        copyFileSync(filePath, backupPath);
      } catch (error) {
        logger.warn('settings.backup_failed', { error });
        backupPath = null;
      }
      logger.warn('settings.recovered', { issues, backupPath });
    }

    const store = new SettingsStore(options, settings, {
      createdFresh: false,
      recovered: issues.length > 0,
      issues,
      backupPath
    });
    if (issues.length > 0) store.scheduleWrite();
    return store;
  }

  get(): Settings {
    return this.current;
  }

  /** Aplica um patch vindo do renderer. Lança `ZodError` se o resultado for inválido. */
  update(patch: SettingsPatch): Settings {
    return this.commit(applySettingsPatch(this.current, patch));
  }

  setCharacterPosition(position: SavedPosition | null): Settings {
    return this.commit({
      ...this.current,
      window: { ...this.current.window, characterPosition: position }
    });
  }

  setFirstRunCompleted(value: boolean): Settings {
    return this.commit({ ...this.current, firstRunCompleted: value });
  }

  onChange(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Grava imediatamente o que estiver pendente. */
  async flush(): Promise<void> {
    this.clearTimer();
    if (this.dirty) this.writeNow();
    await this.pendingWrite;
  }

  /** Versão síncrona, usada no `before-quit`. */
  flushSync(): void {
    this.clearTimer();
    if (!this.dirty) return;
    this.dirty = false;
    try {
      writeFileAtomicSync(this.options.filePath, this.serialize());
    } catch (error) {
      this.options.logger.error('settings.write_failed', { error });
    }
  }

  private commit(next: Settings): Settings {
    const previous = this.current;
    if (JSON.stringify(previous) === JSON.stringify(next)) return previous;
    this.current = next;
    this.scheduleWrite();
    for (const listener of this.listeners) {
      try {
        listener(next, previous);
      } catch (error) {
        this.options.logger.error('settings.listener_failed', { error });
      }
    }
    return next;
  }

  private scheduleWrite(): void {
    this.dirty = true;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.writeNow();
    }, this.options.writeDebounceMs ?? SETTINGS_WRITE_DEBOUNCE_MS);
  }

  private writeNow(): void {
    this.dirty = false;
    const data = this.serialize();
    this.pendingWrite = this.pendingWrite
      .then(() => writeFileAtomic(this.options.filePath, data))
      .catch((error: unknown) => {
        this.dirty = true;
        this.options.logger.error('settings.write_failed', { error });
      });
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private serialize(): string {
    return `${JSON.stringify(this.current, null, 2)}\n`;
  }
}
