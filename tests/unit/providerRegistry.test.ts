import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProviderRegistry, requiresKey } from '../../src/main/ai/providerRegistry';
import { DemoProvider } from '../../src/main/ai/providers/demo/demoProvider';
import { AnthropicProvider } from '../../src/main/ai/providers/anthropic';
import { OpenAiCompatibleProvider } from '../../src/main/ai/providers/openaiCompatible';
import { SecretStore, type SafeStorageLike } from '../../src/main/storage/secretStore';
import { DEFAULT_SETTINGS, type AiSettings } from '../../src/shared/schemas/settings';
import { startOpenAiCompatibleMock, type MockServer } from '../support/mockProviders';
import { memoryLogger } from './logRecords';

const safeStorage: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(text, 'utf8').reverse(),
  decryptString: (buffer) => Buffer.from(buffer).reverse().toString('utf8')
};

let dir: string;
let ai: AiSettings;
let registry: ProviderRegistry;
let mock: MockServer;

beforeAll(async () => {
  mock = await startOpenAiCompatibleMock({ chunkDelayMs: 1 });
});
afterAll(async () => {
  await mock.close();
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'clipster-registry-'));
  ai = DEFAULT_SETTINGS.ai;
  const { logger } = memoryLogger();
  registry = new ProviderRegistry({
    settings: () => ai,
    secrets: SecretStore.load({
      filePath: join(dir, 'secrets.json'),
      safeStorage,
      platform: 'win32',
      logger
    }),
    demo: new DemoProvider({ allowSimulations: false }),
    logger
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('ProviderRegistry', () => {
  it('nenhuma IA e modo Demo', () => {
    expect(registry.status()).toEqual({ provider: 'none', ready: false, issue: 'noProvider' });
    expect(registry.resolve()).toBeNull();
    ai = { ...ai, provider: 'demo' };
    expect(registry.status().ready).toBe(true);
    expect(registry.resolve()).toBeInstanceOf(DemoProvider);
    expect(registry.model()).toBe('demo');
  });

  it('servidor local: não precisa de chave, só do modelo', () => {
    ai = { ...ai, provider: 'openai-compatible' };
    expect(registry.status().issue).toBe('missingModel');
    ai = {
      ...ai,
      openaiCompatible: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2:3b' }
    };
    expect(registry.status()).toEqual({ provider: 'openai-compatible', ready: true, issue: null });
    expect(registry.resolve()).toBeInstanceOf(OpenAiCompatibleProvider);
    expect(registry.model()).toBe('llama3.2:3b');
  });

  it('API oficial da OpenAI exige chave; a chave fica presa ao endereço', () => {
    ai = {
      ...ai,
      provider: 'openai-compatible',
      openaiCompatible: { baseUrl: 'https://api.openai.com/v1', model: 'um-modelo' }
    };
    expect(registry.status().issue).toBe('missingKey');
    registry.setKey('openai-compatible', 'sk-openai-1234567890', false);
    expect(registry.status().ready).toBe(true);

    // Trocou para um servidor na rede: a chave da OpenAI não vai junto.
    ai = { ...ai, openaiCompatible: { baseUrl: 'http://192.168.0.5:11434/v1', model: 'm' } };
    expect(registry.keyStatus('openai-compatible')).toMatchObject({
      hasKey: false,
      originMismatch: true,
      savedFor: 'https://api.openai.com'
    });
  });

  it('Anthropic: chave e modelo', () => {
    ai = { ...ai, provider: 'anthropic' };
    expect(registry.status().issue).toBe('missingKey');
    registry.setKey('anthropic', 'sk-ant-1234567890ab', false);
    expect(registry.status().issue).toBe('missingModel');
    ai = { ...ai, anthropic: { model: 'claude-x' } };
    expect(registry.resolve()).toBeInstanceOf(AnthropicProvider);
    expect(registry.keyStatus('anthropic')).toMatchObject({ hasKey: true, hint: '90ab' });
    registry.clearKey('anthropic');
    expect(registry.status().issue).toBe('missingKey');
  });

  it('lista modelos e testa conexão de um servidor local sem chave', async () => {
    ai = { ...ai, openaiCompatible: { baseUrl: mock.url, model: '' } };
    expect(await registry.listModels('openai-compatible')).toEqual({
      status: 'ok',
      models: [
        { id: 'llama3.2:3b', name: 'llama3.2:3b' },
        { id: 'qwen2.5:7b', name: 'qwen2.5:7b' }
      ]
    });
    expect(await registry.testConnection('openai-compatible')).toEqual({
      status: 'connected',
      modelCount: 2
    });
    expect(await registry.listModels('anthropic')).toEqual({
      status: 'error',
      code: 'MISSING_KEY'
    });
  });

  it('quem exige chave', () => {
    expect(requiresKey('anthropic', '')).toBe(true);
    expect(requiresKey('openai-compatible', 'https://api.openai.com/v1')).toBe(true);
    expect(requiresKey('openai-compatible', 'http://localhost:1234/v1')).toBe(false);
  });
});
