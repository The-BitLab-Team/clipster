import { describe, expect, it, vi } from 'vitest';
import { createClipsterApi } from '../../src/preload/api';
import { IpcChannel } from '../../src/shared/ipc/channels';
import { DEFAULT_SETTINGS } from '../../src/shared/schemas/settings';
import { FakeIpcRenderer } from './fakes';

describe('API do preload (window.clipster)', () => {
  it('expõe só os grupos previstos, sem ipcRenderer', () => {
    const api = createClipsterApi(new FakeIpcRenderer());
    expect(Object.keys(api).sort()).toEqual([
      'app',
      'character',
      'diagnostics',
      'log',
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
    await api.character.getView();
    api.character.onView(() => undefined);
    api.character.dragStart();
    api.character.dragMove({ dx: 1, dy: 2 });
    api.character.dragEnd();
    api.character.setClickThrough(true);
    api.character.click();
    api.character.openContextMenu();
    api.log.write('info', 'oi');

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
