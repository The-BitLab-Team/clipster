import type { IpcEventLike, IpcMainLike } from '../../src/main/ipc/registry';
import type { IpcRendererLike } from '../../src/preload/api';

type InvokeListener = (event: IpcEventLike, ...args: unknown[]) => unknown;
type SendListener = (event: IpcEventLike, ...args: unknown[]) => void;

export interface FakeSender {
  id: number;
  url: string | null;
}

/** ipcMain em memória: permite simular remetentes com URL e id arbitrários. */
export class FakeIpcMain implements IpcMainLike {
  readonly handlers = new Map<string, InvokeListener>();
  readonly listeners = new Map<string, SendListener>();

  handle(channel: string, listener: InvokeListener): void {
    this.handlers.set(channel, listener);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }

  on(channel: string, listener: SendListener): this {
    this.listeners.set(channel, listener);
    return this;
  }

  removeAllListeners(channel: string): this {
    this.listeners.delete(channel);
    return this;
  }

  invoke(channel: string, sender: FakeSender, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (handler === undefined) return Promise.reject(new Error(`Sem handler para ${channel}`));
    return Promise.resolve(handler(event(sender), ...args));
  }

  emit(channel: string, sender: FakeSender, ...args: unknown[]): void {
    const listener = this.listeners.get(channel);
    if (listener === undefined) throw new Error(`Sem listener para ${channel}`);
    listener(event(sender), ...args);
  }
}

function event(sender: FakeSender): IpcEventLike {
  return {
    sender: { id: sender.id },
    senderFrame: sender.url === null ? null : { url: sender.url }
  };
}

/** Ponte que liga o preload ao FakeIpcMain, como o Electron faria. */
export class FakeIpcRenderer implements IpcRendererLike {
  readonly sent: { channel: string; args: unknown[] }[] = [];
  readonly invoked: { channel: string; args: unknown[] }[] = [];
  private readonly subscriptions = new Map<
    string,
    Set<(event: unknown, ...args: unknown[]) => void>
  >();

  constructor(
    private readonly respond: (channel: string, args: unknown[]) => unknown = () => ({
      ok: true,
      data: null
    })
  ) {}

  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    this.invoked.push({ channel, args });
    return Promise.resolve(this.respond(channel, args));
  }

  send(channel: string, ...args: unknown[]): void {
    this.sent.push({ channel, args });
  }

  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): this {
    const set = this.subscriptions.get(channel) ?? new Set();
    set.add(listener);
    this.subscriptions.set(channel, set);
    return this;
  }

  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): this {
    this.subscriptions.get(channel)?.delete(listener);
    return this;
  }

  listenerCount(channel: string): number {
    return this.subscriptions.get(channel)?.size ?? 0;
  }

  dispatch(channel: string, payload: unknown): void {
    const fakeEvent = { sender: 'ipc-renderer-event-should-not-leak' };
    for (const listener of this.subscriptions.get(channel) ?? []) listener(fakeEvent, payload);
  }
}
