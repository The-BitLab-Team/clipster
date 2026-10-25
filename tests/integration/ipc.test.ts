import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { registerIpcHandlers, type IpcHandlerDeps } from '../../src/main/ipc/handlers';
import { IpcHandlerError, IpcRegistry, type WindowRole } from '../../src/main/ipc/registry';
import { createLogger, MemorySink } from '../../src/main/logging/logger';
import { isTrustedRendererUrl } from '../../src/main/security/urls';
import { IpcChannel } from '../../src/shared/ipc/channels';
import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  type Settings
} from '../../src/shared/schemas/settings';
import { AssistantService, type ChatTarget } from '../../src/main/ai/assistantService';
import { DemoProvider } from '../../src/main/ai/providers/demo/demoProvider';
import type { ChatEvent } from '../../src/shared/ai/conversation';
import { PERSONALITIES } from '../../src/shared/personalities';
import { ProviderRegistry } from '../../src/main/ai/providerRegistry';
import { SecretStore, type SafeStorageLike } from '../../src/main/storage/secretStore';
import { startAnthropicMock, type MockServer } from '../support/mockProviders';
import { FakeIpcMain, type FakeSender } from './fakes';

/** Integração renderer → preload → IPC → main, com Electron substituído por dublês (SPEC §29.2). */

const CHARACTER: FakeSender = { id: 1, url: 'app://clipster/character.html' };
const SETTINGS: FakeSender = { id: 2, url: 'app://clipster/settings.html?section=general' };
const STRANGER: FakeSender = { id: 3, url: 'https://evil.example/' };
const SPOOFED: FakeSender = { id: 99, url: 'app://clipster/character.html' };
const NO_FRAME: FakeSender = { id: 1, url: null };
const BALLOON: FakeSender = { id: 4, url: 'app://clipster/balloon.html' };

function setup(
  roles: Record<number, WindowRole> = {
    1: 'character',
    2: 'settings',
    3: 'settings',
    4: 'balloon'
  }
) {
  const ipcMain = new FakeIpcMain();
  const sink = new MemorySink();
  const logger = createLogger({ level: 'debug', sinks: [sink] });
  const registry = new IpcRegistry({
    ipcMain,
    isTrustedUrl: (url) => isTrustedRendererUrl(url, { devServerOrigin: null }),
    roleOf: (id) => roles[id] ?? null,
    logger
  });
  return { ipcMain, registry, sink };
}

describe('IpcRegistry', () => {
  it('valida origem, papel da janela e payload antes de chamar o handler', async () => {
    const { ipcMain, registry } = setup();
    const handler = vi.fn((payload: { n: number }) => payload.n * 2);
    registry.handle(
      IpcChannel.appInfo,
      { schema: z.strictObject({ n: z.number() }), roles: ['settings'] },
      handler
    );

    expect(await ipcMain.invoke(IpcChannel.appInfo, SETTINGS, { n: 21 })).toEqual({
      ok: true,
      data: 42
    });
    expect(await ipcMain.invoke(IpcChannel.appInfo, STRANGER, { n: 1 })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN_SENDER' }
    });
    expect(await ipcMain.invoke(IpcChannel.appInfo, CHARACTER, { n: 1 })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN_SENDER' }
    });
    expect(await ipcMain.invoke(IpcChannel.appInfo, SPOOFED, { n: 1 })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN_SENDER' }
    });
    expect(
      await ipcMain.invoke(IpcChannel.appInfo, { ...NO_FRAME, id: 2 }, { n: 1 })
    ).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN_SENDER' }
    });
    expect(await ipcMain.invoke(IpcChannel.appInfo, SETTINGS, { n: 'x' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' }
    });
    expect(await ipcMain.invoke(IpcChannel.appInfo, SETTINGS, { n: 1 }, 'extra')).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' }
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('erros inesperados viram INTERNAL genérico, sem vazar detalhes', async () => {
    const { ipcMain, registry, sink } = setup();
    registry.handle(IpcChannel.appInfo, { schema: z.undefined(), roles: ['settings'] }, () => {
      throw new Error('C:\\Users\\marco\\segredo.txt não encontrado');
    });
    const result = await ipcMain.invoke(IpcChannel.appInfo, SETTINGS);
    expect(result).toEqual({ ok: false, error: { code: 'INTERNAL', message: 'Erro interno.' } });
    expect(sink.lines.some((line) => line.includes('ipc.handler_failed'))).toBe(true);
  });

  it('IpcHandlerError mantém código e mensagem pensados para o usuário', async () => {
    const { ipcMain, registry } = setup();
    registry.handle(IpcChannel.appInfo, { schema: z.undefined(), roles: ['settings'] }, () => {
      throw new IpcHandlerError('UNSUPPORTED', 'Não disponível.');
    });
    expect(await ipcMain.invoke(IpcChannel.appInfo, SETTINGS)).toEqual({
      ok: false,
      error: { code: 'UNSUPPORTED', message: 'Não disponível.' }
    });
  });

  it('não permite registrar o mesmo canal duas vezes e libera tudo no dispose', () => {
    const { ipcMain, registry } = setup();
    registry.handle(IpcChannel.appInfo, { schema: z.undefined(), roles: ['settings'] }, () => null);
    expect(() => {
      registry.handle(
        IpcChannel.appInfo,
        { schema: z.undefined(), roles: ['settings'] },
        () => null
      );
    }).toThrow('já registrado');
    registry.on(IpcChannel.logWrite, { schema: z.unknown(), roles: ['settings'] }, () => undefined);
    registry.dispose();
    expect(ipcMain.handlers.size).toBe(0);
    expect(ipcMain.listeners.size).toBe(0);
  });
});

const ANTHROPIC_KEY = 'sk-ant-integracao-1234567890';

/** Cofre falso: só "cifra" invertendo os bytes. Backend configurável (Linux sem cofre). */
let backend = 'gnome_libsecret';
const fakeSafeStorage: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(text, 'utf8').reverse(),
  decryptString: (buffer) => Buffer.from(buffer).reverse().toString('utf8'),
  getSelectedStorageBackend: () => backend
};

describe('registerIpcHandlers (canais do Apêndice C)', () => {
  let settings: Settings;
  let deps: IpcHandlerDeps;
  let ipcMain: FakeIpcMain;
  let assistant: AssistantService;
  let chatEvents: { target: ChatTarget; event: ChatEvent }[];
  let anthropic: MockServer;
  let secretsDir: string;
  let providers: ProviderRegistry;

  beforeAll(async () => {
    anthropic = await startAnthropicMock({ chunkDelayMs: 1, apiKey: ANTHROPIC_KEY });
  });
  afterAll(async () => {
    await anthropic.close();
  });
  afterEach(() => {
    rmSync(secretsDir, { recursive: true, force: true });
    backend = 'gnome_libsecret';
  });

  beforeEach(() => {
    secretsDir = mkdtempSync(join(tmpdir(), 'clipster-ipc-'));
    const context = setup();
    ipcMain = context.ipcMain;
    settings = { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_SETTINGS.ai, provider: 'demo' } };
    chatEvents = [];
    const demo = new DemoProvider({
      timing: { thinkingMs: 0, chunkMs: 0 },
      allowSimulations: true
    });
    const logger = createLogger({ level: 'debug', sinks: [] });
    providers = new ProviderRegistry({
      settings: () => settings.ai,
      secrets: SecretStore.load({
        filePath: join(secretsDir, 'secrets.json'),
        safeStorage: fakeSafeStorage,
        platform: 'linux',
        logger
      }),
      demo,
      logger,
      anthropicBaseUrl: anthropic.url
    });
    assistant = new AssistantService({
      resolveProvider: () => providers.resolve(),
      model: () => providers.model(),
      personality: () => PERSONALITIES[settings.personality],
      uiLocale: () => 'pt-BR',
      environment: () => ({
        appName: 'Clipster',
        appVersion: '0.3.0',
        platform: 'win32',
        now: new Date('2026-10-24T12:00:00Z'),
        timeZone: 'UTC'
      }),
      emit: (target, event) => chatEvents.push({ target, event }),
      onCharacterEvent: () => undefined,
      onConversationSettled: () => undefined,
      logger: createLogger({ level: 'debug', sinks: [] }),
      deltaFlushMs: 0
    });
    deps = {
      registry: context.registry,
      capabilities: { launchAtLogin: false, clickThrough: true },
      rendererLogger: createLogger({ level: 'debug', sinks: [] }),
      settings: {
        get: () => settings,
        update: (patch) => {
          settings = applySettingsPatch(settings, patch);
          return settings;
        }
      },
      character: {
        getView: vi.fn(() => ({ state: 'sleeping' as const, badge: false })),
        dragStart: vi.fn(),
        dragMove: vi.fn(),
        dragEnd: vi.fn(),
        setClickThrough: vi.fn(),
        click: vi.fn(),
        openContextMenu: vi.fn()
      },
      chat: {
        send: (text, requester) => assistant.send(text, requester),
        cancel: (requestId) => assistant.cancel(requestId),
        retry: (requester) => assistant.retry(requester),
        conversation: () => assistant.snapshot(),
        newConversation: () => assistant.newConversation(),
        clearHistory: vi.fn(() => Promise.resolve()),
        typing: vi.fn()
      },
      onboarding: { complete: vi.fn() },
      balloon: { close: vi.fn(), resize: vi.fn() },
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
      ai: {
        status: () => providers.status(),
        keyStatus: (provider) => providers.keyStatus(provider),
        setKey: (provider, value, allowInsecure) =>
          providers.setKey(provider, value, allowInsecure),
        clearKey: (provider) => providers.clearKey(provider),
        listModels: (provider) => providers.listModels(provider),
        testConnection: (provider) => providers.testConnection(provider)
      },
      app: {
        info: vi.fn(() => ({
          name: 'Clipster',
          version: '0.1.0',
          electron: '45.0.0',
          chrome: '1',
          platform: 'win32',
          systemLanguages: ['pt-BR'],
          isPackaged: false,
          repositoryUrl: null,
          capabilities: { launchAtLogin: false, clickThrough: true }
        })),
        openSettings: vi.fn(),
        hideClipster: vi.fn(),
        quit: vi.fn(),
        openLogsFolder: vi.fn(() => Promise.resolve()),
        openExternal: vi.fn(() => Promise.resolve())
      }
    };
    registerIpcHandlers(deps);
  });

  it('Configurações alteram e persistem a personalidade', async () => {
    const result = await ipcMain.invoke(IpcChannel.settingsUpdate, SETTINGS, {
      personality: 'witty'
    });
    expect(result).toMatchObject({ ok: true, data: { personality: 'witty' } });
    expect(await ipcMain.invoke(IpcChannel.settingsGet, CHARACTER)).toMatchObject({
      ok: true,
      data: { personality: 'witty' }
    });
  });

  it('a janela do personagem não pode alterar configurações', async () => {
    expect(
      await ipcMain.invoke(IpcChannel.settingsUpdate, CHARACTER, { personality: 'witty' })
    ).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN_SENDER' }
    });
    expect(settings.personality).toBe('helpful');
  });

  it('valor fora do intervalo é recusado com mensagem útil', async () => {
    const result = await ipcMain.invoke(IpcChannel.settingsUpdate, SETTINGS, {
      appearance: { characterScale: 5 }
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    expect(JSON.stringify(result)).toContain('appearance.characterScale');
  });

  it('"Iniciar com o sistema" é recusado onde não é suportado', async () => {
    expect(
      await ipcMain.invoke(IpcChannel.settingsUpdate, SETTINGS, {
        general: { launchAtLogin: true }
      })
    ).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED' } });
  });

  it('canais do personagem só aceitam a janela do personagem', () => {
    ipcMain.emit(IpcChannel.characterDragMove, CHARACTER, { dx: 10, dy: -5 });
    ipcMain.emit(IpcChannel.characterDragMove, SETTINGS, { dx: 1, dy: 1 });
    ipcMain.emit(IpcChannel.characterDragMove, CHARACTER, { dx: 'muito', dy: 0 });
    expect(deps.character.dragMove).toHaveBeenCalledTimes(1);
    expect(deps.character.dragMove).toHaveBeenCalledWith({ dx: 10, dy: -5 });

    ipcMain.emit(IpcChannel.characterSetClickThrough, CHARACTER, { ignore: true });
    expect(deps.character.setClickThrough).toHaveBeenCalledWith(true);
  });

  it('links externos só abrem se forem http(s) seguros', async () => {
    expect(
      await ipcMain.invoke(IpcChannel.shellOpenExternal, SETTINGS, { url: 'https://github.com' })
    ).toEqual({ ok: true, data: { opened: true } });
    expect(
      await ipcMain.invoke(IpcChannel.shellOpenExternal, SETTINGS, { url: 'file:///C:/Windows' })
    ).toEqual({ ok: true, data: { opened: false } });
    expect(deps.app.openExternal).toHaveBeenCalledTimes(1);
    expect(
      await ipcMain.invoke(IpcChannel.shellOpenExternal, CHARACTER, { url: 'https://github.com' })
    ).toMatchObject({ ok: false });
  });

  it('abrir Configurações aceita seção válida e recusa seção desconhecida', async () => {
    await ipcMain.invoke(IpcChannel.windowsOpenSettings, CHARACTER, { section: 'about' });
    await ipcMain.invoke(IpcChannel.windowsOpenSettings, CHARACTER);
    expect(deps.app.openSettings).toHaveBeenNthCalledWith(1, 'about');
    expect(deps.app.openSettings).toHaveBeenNthCalledWith(2, undefined);
    expect(
      await ipcMain.invoke(IpcChannel.windowsOpenSettings, CHARACTER, { section: 'hacks' })
    ).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
  });

  it('a janela do personagem consulta a pose atual; as outras não', async () => {
    expect(await ipcMain.invoke(IpcChannel.characterGetView, CHARACTER)).toEqual({
      ok: true,
      data: { state: 'sleeping', badge: false }
    });
    expect(await ipcMain.invoke(IpcChannel.characterGetView, SETTINGS)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN_SENDER' }
    });
  });

  it('conversa pelo balão com o Demo; troca de personalidade vale para a resposta seguinte', async () => {
    const first = await ipcMain.invoke(IpcChannel.chatSend, BALLOON, {
      text: 'Como eu renomeio um arquivo?'
    });
    expect(first).toMatchObject({ ok: true });
    expect(JSON.stringify(first)).toMatch(/"requestId":"[^"]+"/);
    await vi.waitFor(() => {
      expect(chatEvents.at(-1)?.event.type).toBe('done');
    });
    expect(chatEvents.every((item) => item.target === BALLOON.id)).toBe(true);

    await ipcMain.invoke(IpcChannel.settingsUpdate, BALLOON, { personality: 'witty' });
    await ipcMain.invoke(IpcChannel.chatSend, BALLOON, { text: 'Como eu renomeio um arquivo?' });
    await vi.waitFor(() => {
      expect(assistant.snapshot().messages).toHaveLength(4);
      expect(assistant.snapshot().activeRequestId).toBeNull();
    });
    const [, helpful, , witty] = assistant.snapshot().messages;
    expect(helpful?.content).toContain('Dica: cuidado');
    expect(witty?.content).toContain('cartório');

    const conversation = await ipcMain.invoke(IpcChannel.chatConversationGet, BALLOON);
    expect(conversation).toMatchObject({ ok: true, data: { activeRequestId: null } });
  });

  it('só o balão conversa; só as Configurações apagam o histórico', async () => {
    for (const sender of [CHARACTER, SETTINGS, STRANGER]) {
      expect(await ipcMain.invoke(IpcChannel.chatSend, sender, { text: 'oi' })).toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN_SENDER' }
      });
    }
    expect(
      await ipcMain.invoke(IpcChannel.chatHistoryClear, BALLOON, { confirmed: true })
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN_SENDER' } });
    expect(
      await ipcMain.invoke(IpcChannel.chatHistoryClear, SETTINGS, { confirmed: false })
    ).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    expect(
      await ipcMain.invoke(IpcChannel.chatHistoryClear, SETTINGS, { confirmed: true })
    ).toEqual({ ok: true, data: { cleared: true } });
    expect(deps.chat.clearHistory).toHaveBeenCalledTimes(1);
  });

  it('mensagens vazias, longas demais ou com campos extras são recusadas', async () => {
    for (const payload of [{ text: '   ' }, { text: 'x'.repeat(4001) }, { text: 'oi', extra: 1 }]) {
      expect(await ipcMain.invoke(IpcChannel.chatSend, BALLOON, payload)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_PAYLOAD' }
      });
    }
    expect(assistant.snapshot().messages).toEqual([]);
  });

  it('uma resposta por vez (BUSY) e aviso claro sem IA configurada (NOT_CONFIGURED)', async () => {
    await ipcMain.invoke(IpcChannel.chatSend, BALLOON, { text: '/simular timeout' });
    expect(await ipcMain.invoke(IpcChannel.chatSend, BALLOON, { text: 'oi' })).toMatchObject({
      ok: false,
      error: { code: 'BUSY' }
    });
    const active = assistant.snapshot().activeRequestId ?? '';
    expect(await ipcMain.invoke(IpcChannel.chatCancel, BALLOON, { requestId: active })).toEqual({
      ok: true,
      data: { cancelled: true }
    });

    settings = { ...settings, ai: { ...settings.ai, provider: 'none' } };
    expect(await ipcMain.invoke(IpcChannel.chatSend, BALLOON, { text: 'oi' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_CONFIGURED' }
    });
  });

  it('onboarding, balão e área de transferência validam o payload', async () => {
    expect(
      await ipcMain.invoke(IpcChannel.onboardingComplete, BALLOON, {
        personality: 'witty',
        provider: 'demo'
      })
    ).toEqual({ ok: true, data: null });
    expect(deps.onboarding.complete).toHaveBeenCalledWith({
      personality: 'witty',
      provider: 'demo'
    });
    expect(
      await ipcMain.invoke(IpcChannel.onboardingComplete, BALLOON, {
        personality: 'witty',
        provider: 'anthropic'
      })
    ).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });

    ipcMain.emit(IpcChannel.balloonResize, BALLOON, { height: 300 });
    ipcMain.emit(IpcChannel.balloonResize, CHARACTER, { height: 300 });
    ipcMain.emit(IpcChannel.balloonResize, BALLOON, { height: -5 });
    expect(deps.balloon.resize).toHaveBeenCalledTimes(1);

    expect(
      await ipcMain.invoke(IpcChannel.clipboardWriteText, BALLOON, { text: 'copiado' })
    ).toEqual({ ok: true, data: null });
    expect(
      await ipcMain.invoke(IpcChannel.clipboardWriteText, CHARACTER, { text: 'copiado' })
    ).toMatchObject({ ok: false });
    expect(deps.clipboard.writeText).toHaveBeenCalledTimes(1);

    ipcMain.emit(IpcChannel.chatTyping, BALLOON, { typing: true });
    ipcMain.emit(IpcChannel.chatTyping, BALLOON, { typing: false });
    expect(deps.chat.typing).toHaveBeenCalledTimes(1);
  });

  it('Claude: chave pelas Configurações, modelos, conexão e conversa com o servidor simulado', async () => {
    settings = { ...settings, ai: { ...settings.ai, provider: 'anthropic' } };
    expect(await ipcMain.invoke(IpcChannel.aiStatusGet, BALLOON)).toEqual({
      ok: true,
      data: { provider: 'anthropic', ready: false, issue: 'missingKey' }
    });
    expect(
      await ipcMain.invoke(IpcChannel.aiModelsList, SETTINGS, { provider: 'anthropic' })
    ).toEqual({ ok: true, data: { status: 'error', code: 'MISSING_KEY' } });

    const saved = await ipcMain.invoke(IpcChannel.secretsSet, SETTINGS, {
      provider: 'anthropic',
      value: ANTHROPIC_KEY
    });
    expect(saved).toMatchObject({
      ok: true,
      data: { hasKey: true, hint: '7890', secureBackend: true }
    });
    expect(JSON.stringify(saved)).not.toContain(ANTHROPIC_KEY);

    const models = await ipcMain.invoke(IpcChannel.aiModelsList, SETTINGS, {
      provider: 'anthropic'
    });
    expect(models).toMatchObject({ ok: true, data: { status: 'ok' } });
    expect(JSON.stringify(models)).toContain('claude-teste-rapido');
    expect(
      await ipcMain.invoke(IpcChannel.aiConnectionTest, SETTINGS, { provider: 'anthropic' })
    ).toEqual({ ok: true, data: { status: 'connected', modelCount: 2 } });

    expect(await ipcMain.invoke(IpcChannel.aiStatusGet, BALLOON)).toMatchObject({
      data: { ready: false, issue: 'missingModel' }
    });
    settings = { ...settings, ai: { ...settings.ai, anthropic: { model: 'claude-teste-rapido' } } };
    expect(await ipcMain.invoke(IpcChannel.aiStatusGet, BALLOON)).toMatchObject({
      data: { ready: true, issue: null }
    });

    await ipcMain.invoke(IpcChannel.chatSend, BALLOON, { text: 'Tudo bem?' });
    await vi.waitFor(() => {
      expect(assistant.snapshot().messages.at(-1)?.status).toBe('complete');
    });
    expect(assistant.snapshot().messages.at(-1)?.content).toBe(
      'Olá, aqui é o Claude simulado (claude-teste-rapido).'
    );
  });

  it('chave: sem cofre seguro exige confirmação; só as Configurações mexem em chaves', async () => {
    backend = 'basic_text';
    expect(
      await ipcMain.invoke(IpcChannel.secretsSet, SETTINGS, {
        provider: 'anthropic',
        value: ANTHROPIC_KEY
      })
    ).toMatchObject({ ok: false, error: { code: 'INSECURE_STORAGE' } });
    expect(
      await ipcMain.invoke(IpcChannel.secretsSet, SETTINGS, {
        provider: 'anthropic',
        value: ANTHROPIC_KEY,
        allowInsecure: true
      })
    ).toMatchObject({ ok: true, data: { hasKey: true, secureBackend: false } });

    for (const sender of [BALLOON, CHARACTER, STRANGER]) {
      for (const channel of [
        IpcChannel.secretsSet,
        IpcChannel.secretsStatus,
        IpcChannel.aiModelsList
      ]) {
        expect(
          await ipcMain.invoke(channel, sender, { provider: 'anthropic', value: 'x'.repeat(20) })
        ).toMatchObject({ ok: false });
      }
    }
    expect(await ipcMain.invoke(IpcChannel.aiStatusGet, CHARACTER)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN_SENDER' }
    });
    expect(
      await ipcMain.invoke(IpcChannel.secretsSet, SETTINGS, {
        provider: 'anthropic',
        value: 'com espaço no meio'
      })
    ).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    expect(
      await ipcMain.invoke(IpcChannel.secretsClear, SETTINGS, { provider: 'anthropic' })
    ).toMatchObject({ ok: true, data: { hasKey: false } });
  });

  it('todos os canais registrados estão na lista explícita', () => {
    const known = new Set<string>(Object.values(IpcChannel));
    for (const channel of [...ipcMain.handlers.keys(), ...ipcMain.listeners.keys()]) {
      expect(known.has(channel)).toBe(true);
    }
  });
});
