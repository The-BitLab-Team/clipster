import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { FakeIpcMain, type FakeSender } from './fakes';

/** Integração renderer → preload → IPC → main, com Electron substituído por dublês (SPEC §29.2). */

const CHARACTER: FakeSender = { id: 1, url: 'app://clipster/character.html' };
const SETTINGS: FakeSender = { id: 2, url: 'app://clipster/settings.html?section=general' };
const STRANGER: FakeSender = { id: 3, url: 'https://evil.example/' };
const SPOOFED: FakeSender = { id: 99, url: 'app://clipster/character.html' };
const NO_FRAME: FakeSender = { id: 1, url: null };

function setup(
  roles: Record<number, WindowRole> = { 1: 'character', 2: 'settings', 3: 'settings' }
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

describe('registerIpcHandlers (canais do Apêndice C)', () => {
  let settings: Settings;
  let deps: IpcHandlerDeps;
  let ipcMain: FakeIpcMain;

  beforeEach(() => {
    const context = setup();
    ipcMain = context.ipcMain;
    settings = DEFAULT_SETTINGS;
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

  it('todos os canais registrados estão na lista explícita', () => {
    const known = new Set<string>(Object.values(IpcChannel));
    for (const channel of [...ipcMain.handlers.keys(), ...ipcMain.listeners.keys()]) {
      expect(known.has(channel)).toBe(true);
    }
  });
});
