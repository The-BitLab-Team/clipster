import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, MemorySink } from '../../src/main/logging/logger';
import { SettingsStore } from '../../src/main/storage/settingsStore';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/schemas/settings';

let dir: string;
let file: string;
let sink: MemorySink;

function load(): SettingsStore {
  return SettingsStore.load({
    filePath: file,
    logger: createLogger({ level: 'debug', sinks: [sink] }),
    writeDebounceMs: 5,
    now: () => new Date('2026-10-24T12:00:00.000Z')
  });
}

function readSaved(): Settings {
  return JSON.parse(readFileSync(file, 'utf8')) as Settings;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'clipster-settings-'));
  file = join(dir, 'nested', 'settings.json');
  sink = new MemorySink();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('SettingsStore', () => {
  it('primeira execução: usa padrões e não cria arquivo até haver mudança', async () => {
    const store = load();
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(store.loadInfo).toMatchObject({ createdFresh: true, recovered: false });
    await store.flush();
    expect(readdirSync(join(dir, 'nested'))).toEqual([]);
  });

  it('update persiste em disco e sobrevive a uma nova carga', async () => {
    const store = load();
    store.update({ personality: 'witty', general: { quietMode: true } });
    await store.flush();
    expect(readSaved().personality).toBe('witty');

    const reloaded = load();
    expect(reloaded.get().personality).toBe('witty');
    expect(reloaded.get().general.quietMode).toBe(true);
    expect(reloaded.loadInfo.createdFresh).toBe(false);
  });

  it('avisa os interessados com o valor novo e o anterior', () => {
    const store = load();
    const listener = vi.fn();
    const unsubscribe = store.onChange(listener);
    store.update({ personality: 'witty' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ personality: 'witty' });
    expect(listener.mock.calls[0]?.[1]).toMatchObject({ personality: 'helpful' });

    unsubscribe();
    store.update({ personality: 'helpful' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('não avisa nem grava quando nada mudou', async () => {
    const store = load();
    const listener = vi.fn();
    store.onChange(listener);
    store.update({ personality: 'helpful' });
    await store.flush();
    expect(listener).not.toHaveBeenCalled();
    expect(readdirSync(join(dir, 'nested'))).toEqual([]);
  });

  it('rejeita patch inválido sem alterar o estado', () => {
    const store = load();
    expect(() => store.update({ appearance: { characterScale: 10 } })).toThrow();
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('JSON corrompido: guarda backup, carrega padrões e reescreve o arquivo', async () => {
    load();
    writeFileSync(file, '{ isto não é json', 'utf8');
    const store = load();
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(store.loadInfo).toMatchObject({ recovered: true, issues: ['json'] });
    expect(store.loadInfo.backupPath).toContain('settings.corrupt-2026-10-24T12-00-00-000Z.json');
    await store.flush();
    expect(readSaved()).toEqual(DEFAULT_SETTINGS);
    const backups = readdirSync(join(dir, 'nested')).filter((name) =>
      name.startsWith('settings.corrupt-')
    );
    expect(backups).toHaveLength(1);
    expect(sink.lines.some((line) => line.includes('settings.recovered'))).toBe(true);
  });

  it('campo inválido no arquivo: recupera só aquele campo', () => {
    load(); // cria a pasta
    const stored = {
      ...DEFAULT_SETTINGS,
      personality: 'witty',
      general: { ...DEFAULT_SETTINGS.general, language: 'klingon' }
    };
    writeFileSync(file, JSON.stringify(stored), 'utf8');
    const store = load();
    expect(store.get().personality).toBe('witty');
    expect(store.get().general.language).toBe('system');
    expect(store.loadInfo.issues).toEqual(['general.language']);
  });

  it('flushSync grava imediatamente (usado ao sair do app)', () => {
    const store = load();
    store.setCharacterPosition({ x: 10, y: 20, displayId: 1, relX: 0.1, relY: 0.2 });
    store.flushSync();
    expect(readSaved().window.characterPosition).toEqual({
      x: 10,
      y: 20,
      displayId: 1,
      relX: 0.1,
      relY: 0.2
    });
  });

  it('não deixa arquivos temporários para trás', async () => {
    const store = load();
    store.update({ personality: 'witty' });
    store.update({ personality: 'helpful' });
    store.update({ personality: 'witty' });
    await store.flush();
    expect(readdirSync(join(dir, 'nested')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
