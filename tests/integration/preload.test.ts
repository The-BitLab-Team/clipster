import { describe, expect, it, vi } from 'vitest';
import { createClipsterApi } from '../../src/preload/api';
import { IpcChannel } from '../../src/shared/ipc/channels';
import { DEFAULT_SETTINGS } from '../../src/shared/schemas/settings';
import { FakeIpcRenderer } from './fakes';

describe('API do preload (window.clipster)', () => {
  it('expõe só os grupos previstos, sem ipcRenderer', () => {
    const api = createClipsterApi(new FakeIpcRenderer());
    expect(Object.keys(api).sort()).toEqual([
      'ai',
      'app',
      'balloon',
      'character',
      'chat',
      'clipboard',
      'diagnostics',
      'log',
      'onboarding',
      'permissions',
      'settings',
      'shell',
      'windows'
    ]);
    expect(JSON.stringify(Object.keys(api))).not.toContain('ipc');
  });

  it('usa apenas canais da lista explícita', async () => {
    const ipc = new FakeIpcRenderer();
    const api = createClipsterApi(ipc);
    await api.settings.get();
    await api.settings.update({ personality: 'witty' });
    await api.windows.openSettings('about');
    await api.windows.openSettings();
    await api.windows.hideClipster();
    await api.app.info();
    await api.app.quit();
    await api.shell.openExternal('https://example.com');
    await api.diagnostics.openLogs();
    await api.diagnostics.copy();
    await api.character.getView();
    api.character.onView(() => undefined);
    api.character.dragStart();
    api.character.dragMove({ dx: 1, dy: 2 });
    api.character.dragEnd();
    api.character.setClickThrough(true);
    api.character.click();
    api.character.openContextMenu();
    api.log.write('info', 'oi');
    await api.chat.send('oi');
    await api.chat.cancel('r1');
    await api.chat.retry();
    await api.chat.getConversation();
    await api.chat.newConversation();
    await api.chat.clearHistory();
    api.chat.typing();
    api.chat.onEvent(() => undefined);
    await api.onboarding.complete({ personality: 'helpful', provider: 'demo' });
    await api.balloon.close();
    api.balloon.resize(240.6);
    api.balloon.onPlacement(() => undefined);
    api.balloon.onShown(() => undefined);
    await api.clipboard.writeText('texto');
    await api.ai.status();
    api.ai.onStatus(() => undefined);
    await api.ai.keyStatus('anthropic');
    await api.ai.setKey('anthropic', 'sk-ant-1234567890');
    await api.ai.setKey('openai-compatible', 'sk-1234567890', true);
    await api.ai.clearKey('anthropic');
    await api.ai.listModels('openai-compatible');
    await api.ai.testConnection('anthropic');
    await api.permissions.respond('p1', 'once');
    await api.permissions.list();
    await api.permissions.revoke('g1');
    api.permissions.onChange(() => undefined);

    const known = new Set<string>(Object.values(IpcChannel));
    for (const call of [...ipc.invoked, ...ipc.sent]) expect(known.has(call.channel)).toBe(true);

    expect(ipc.invoked).toContainEqual({
      channel: IpcChannel.windowsOpenSettings,
      args: [{ section: 'about' }]
    });
    expect(ipc.invoked).toContainEqual({ channel: IpcChannel.windowsOpenSettings, args: [] });
    expect(ipc.sent).toContainEqual({
      channel: IpcChannel.characterDragMove,
      args: [{ dx: 1, dy: 2 }]
    });
    expect(ipc.invoked).toContainEqual({
      channel: IpcChannel.chatHistoryClear,
      args: [{ confirmed: true }]
    });
    expect(ipc.sent).toContainEqual({ channel: IpcChannel.balloonResize, args: [{ height: 241 }] });
    expect(ipc.invoked).toContainEqual({
      channel: IpcChannel.secretsSet,
      args: [{ provider: 'anthropic', value: 'sk-ant-1234567890' }]
    });
    expect(ipc.invoked).toContainEqual({
      channel: IpcChannel.secretsSet,
      args: [{ provider: 'openai-compatible', value: 'sk-1234567890', allowInsecure: true }]
    });
  });

  it('não repassa campos extras no arrasto', () => {
    const ipc = new FakeIpcRenderer();
    const api = createClipsterApi(ipc);
    api.character.dragMove({ dx: 3, dy: 4, evil: true } as unknown as { dx: number; dy: number });
    expect(ipc.sent[0]).toEqual({
      channel: IpcChannel.characterDragMove,
      args: [{ dx: 3, dy: 4 }]
    });
  });

  it('inscrições entregam só o payload e podem ser canceladas', () => {
    const ipc = new FakeIpcRenderer();
    const api = createClipsterApi(ipc);
    const listener = vi.fn();
    const unsubscribe = api.settings.onChange(listener);
    expect(ipc.listenerCount(IpcChannel.settingsChanged)).toBe(1);

    ipc.dispatch(IpcChannel.settingsChanged, DEFAULT_SETTINGS);
    expect(listener).toHaveBeenCalledExactlyOnceWith(DEFAULT_SETTINGS);

    unsubscribe();
    expect(ipc.listenerCount(IpcChannel.settingsChanged)).toBe(0);
    ipc.dispatch(IpcChannel.settingsChanged, DEFAULT_SETTINGS);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('devolve o envelope do main sem alterações', async () => {
    const ipc = new FakeIpcRenderer(() => ({
      ok: false,
      error: { code: 'INTERNAL', message: 'Erro interno.' }
    }));
    const api = createClipsterApi(ipc);
    expect(await api.settings.get()).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: 'Erro interno.' }
    });
  });
});
