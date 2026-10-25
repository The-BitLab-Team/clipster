import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDotEnv } from '../../src/main/app/devEnv';
import {
  keyHint,
  SecretStore,
  type SafeStorageLike,
  type SecretStoreOptions
} from '../../src/main/storage/secretStore';
import { memoryLogger } from './logRecords';

/** Cofre falso: "cifra" invertendo os bytes, para provar que o arquivo não guarda texto puro. */
function fakeSafeStorage(options: { available?: boolean; backend?: string } = {}): SafeStorageLike {
  return {
    isEncryptionAvailable: () => options.available ?? true,
    encryptString: (text) => Buffer.from(text, 'utf8').reverse(),
    decryptString: (buffer) => Buffer.from(buffer).reverse().toString('utf8'),
    getSelectedStorageBackend: () => options.backend ?? 'gnome_libsecret'
  };
}

const KEY = 'sk-ant-falsa-abcdefghijklmnop1234'; // chave fictícia
const OPENAI = 'https://api.openai.com';
const OLLAMA = 'http://localhost:11434';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'clipster-secrets-'));
  file = join(dir, 'secrets.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function load(overrides: Partial<SecretStoreOptions> = {}) {
  const { logger, raw } = memoryLogger();
  const store = SecretStore.load({
    filePath: file,
    safeStorage: fakeSafeStorage(),
    platform: 'win32',
    logger,
    ...overrides
  });
  return { store, logs: raw };
}

describe('SecretStore (SPEC §21)', () => {
  it('guarda cifrado, devolve só o final da chave e relê do disco', () => {
    const { store, logs } = load();
    const status = store.set('anthropic', `  ${KEY}  `, { origin: null, allowInsecure: false });
    expect(status).toMatchObject({
      hasKey: true,
      hint: '1234',
      secureBackend: true,
      source: 'stored'
    });

    const onDisk = readFileSync(file, 'utf8');
    expect(onDisk).not.toContain(KEY);
    expect(onDisk).not.toContain('abcdefghijklmnop');
    expect(logs()).not.toContain(KEY);

    expect(load().store.get('anthropic')).toBe(KEY);
  });

  it('sem cofre de verdade (Linux "basic_text") exige confirmação', () => {
    const { store } = load({
      platform: 'linux',
      safeStorage: fakeSafeStorage({ backend: 'basic_text' })
    });
    expect(store.status('anthropic').secureBackend).toBe(false);
    expect(() => store.set('anthropic', KEY, { origin: null, allowInsecure: false })).toThrow(
      expect.objectContaining({ code: 'INSECURE_STORAGE' })
    );
    expect(store.status('anthropic').hasKey).toBe(false);
    store.set('anthropic', KEY, { origin: null, allowInsecure: true });
    expect(store.get('anthropic')).toBe(KEY);
  });

  it('sem criptografia disponível, também pede confirmação e guarda sem texto puro legível', () => {
    const { store } = load({ safeStorage: fakeSafeStorage({ available: false }) });
    expect(store.status('anthropic').secureBackend).toBe(false);
    store.set('anthropic', KEY, { origin: null, allowInsecure: true });
    expect(readFileSync(file, 'utf8')).not.toContain(KEY);
    expect(store.get('anthropic')).toBe(KEY);
  });

  it('a chave do compatível com OpenAI só vale para o endereço em que foi salva', () => {
    const { store } = load();
    store.set('openai-compatible', KEY, { origin: OPENAI, allowInsecure: false });
    expect(store.get('openai-compatible', OPENAI)).toBe(KEY);
    expect(store.get('openai-compatible', OLLAMA)).toBeNull();
    expect(store.status('openai-compatible', OLLAMA)).toMatchObject({
      hasKey: false,
      originMismatch: true,
      origin: OPENAI
    });
  });

  it('remover apaga a chave', () => {
    const { store } = load();
    store.set('anthropic', KEY, { origin: null, allowInsecure: false });
    expect(store.clear('anthropic').hasKey).toBe(false);
    expect(load().store.get('anthropic')).toBeNull();
  });

  it('recusa chaves inválidas', () => {
    const { store } = load();
    for (const bad of ['', 'curta', 'tem espaço no meio da chave', 'x'.repeat(600)]) {
      expect(() => store.set('anthropic', bad, { origin: null, allowInsecure: false })).toThrow(
        expect.objectContaining({ code: 'INVALID_KEY' })
      );
    }
  });

  it('arquivo corrompido ou cifra ilegível: sem chave, sem travar', () => {
    writeFileSync(file, '{ quebrado');
    expect(load().store.status('anthropic').hasKey).toBe(false);
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        keys: {
          anthropic: { value: 'AAAA', encrypted: true, hint: '1234', origin: null, savedAt: 'x' }
        }
      })
    );
    const broken = load({
      safeStorage: {
        ...fakeSafeStorage(),
        decryptString: () => {
          throw new Error('DPAPI');
        }
      }
    });
    expect(broken.store.get('anthropic')).toBeNull();
  });

  it('em desenvolvimento, usa o .env como reserva; OPENAI_API_KEY só para api.openai.com', () => {
    const { store } = load({
      envKeys: { anthropic: KEY, 'openai-compatible': 'sk-openai-env-key-9999' },
      envOpenAiOrigin: OPENAI
    });
    expect(store.get('anthropic')).toBe(KEY);
    expect(store.status('anthropic')).toMatchObject({ source: 'env', hint: '1234' });
    expect(store.get('openai-compatible', OPENAI)).toBe('sk-openai-env-key-9999');
    expect(store.get('openai-compatible', OLLAMA)).toBeNull();
  });

  it('dica só com chaves longas o bastante', () => {
    expect(keyHint('sk-123456789012')).toBe('9012');
    expect(keyHint('curtinha')).toBeNull();
  });
});

describe('.env de desenvolvimento', () => {
  it('lê pares, ignora comentários e remove aspas', () => {
    expect(
      parseDotEnv(
        '# comentário\nANTHROPIC_API_KEY="sk-ant-1"\nexport OPENAI_API_KEY=sk-2 # fim\nVAZIO=\nlixo'
      )
    ).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-1', OPENAI_API_KEY: 'sk-2', VAZIO: '' });
  });
});
