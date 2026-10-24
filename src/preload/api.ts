import type {
  ClipsterApi,
  IpcEventChannel,
  IpcEventPayloads,
  IpcInvokeChannel,
  IpcInvokeResponses,
  IpcResult
} from '../shared/ipc/api';
import { IpcChannel } from '../shared/ipc/channels';

/**
 * Constrói a API `window.clipster` (SPEC §17.1). Recebe um `ipcRenderer` mínimo por
 * parâmetro para poder ser testada sem Electron. Nunca expõe o `ipcRenderer` em si.
 */

export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

export function createClipsterApi(ipc: IpcRendererLike): ClipsterApi {
  // O main process é a parte confiável: ele valida tudo e sempre responde com o envelope
  // IpcResult do tipo declarado em IpcInvokeResponses para o canal. Este é o único ponto
  // em que o tipo da resposta é afirmado.
  const invoke = <C extends IpcInvokeChannel>(
    channel: C,
    ...args: unknown[]
  ): Promise<IpcResult<IpcInvokeResponses[C]>> =>
    ipc.invoke(channel, ...args) as Promise<IpcResult<IpcInvokeResponses[C]>>;

  const subscribe = <C extends IpcEventChannel>(
    channel: C,
    listener: (payload: IpcEventPayloads[C]) => void
  ): (() => void) => {
    const wrapped = (_event: unknown, payload: unknown): void => {
      // Payload emitido pelo main (fonte confiável). O objeto do evento não é repassado.
      listener(payload as IpcEventPayloads[C]);
    };
    ipc.on(channel, wrapped);
    return () => {
      ipc.removeListener(channel, wrapped);
    };
  };

  return {
    settings: {
      get: () => invoke(IpcChannel.settingsGet),
      update: (patch) => invoke(IpcChannel.settingsUpdate, patch),
      onChange: (listener) => subscribe(IpcChannel.settingsChanged, listener)
    },
    character: {
      dragStart: () => {
        ipc.send(IpcChannel.characterDragStart);
      },
      dragMove: (delta) => {
        ipc.send(IpcChannel.characterDragMove, { dx: delta.dx, dy: delta.dy });
      },
      dragEnd: () => {
        ipc.send(IpcChannel.characterDragEnd);
      },
      setClickThrough: (ignore) => {
        ipc.send(IpcChannel.characterSetClickThrough, { ignore });
      },
      click: () => {
        ipc.send(IpcChannel.characterClick);
      },
      openContextMenu: () => {
        ipc.send(IpcChannel.characterContextMenu);
      }
    },
    windows: {
      openSettings: (section) =>
        section === undefined
          ? invoke(IpcChannel.windowsOpenSettings)
          : invoke(IpcChannel.windowsOpenSettings, { section }),
      onSettingsNavigate: (listener) => subscribe(IpcChannel.windowsSettingsNavigate, listener),
      hideClipster: () => invoke(IpcChannel.windowsHideClipster)
    },
    app: {
      info: () => invoke(IpcChannel.appInfo),
      quit: () => invoke(IpcChannel.appQuit)
    },
    shell: {
      openExternal: (url) => invoke(IpcChannel.shellOpenExternal, { url })
    },
    diagnostics: {
      openLogs: () => invoke(IpcChannel.diagnosticsOpenLogs)
    },
    log: {
      write: (level, message, context) => {
        ipc.send(
          IpcChannel.logWrite,
          context === undefined ? { level, message } : { level, message, context }
        );
      }
    }
  };
}
