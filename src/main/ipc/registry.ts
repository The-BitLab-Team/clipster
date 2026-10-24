import { ZodError, type z } from 'zod';
import type { IpcErrorCode, IpcResult } from '../../shared/ipc/api';
import type { IpcChannelName } from '../../shared/ipc/channels';
import type { Logger } from '../logging/logger';

/**
 * Registro central dos canais IPC (SPEC §26, item 4):
 * - só canais declarados aqui existem;
 * - todo remetente é validado (URL do frame + papel da janela);
 * - todo payload é validado com Zod;
 * - toda resposta `invoke` usa o envelope `{ ok, data } | { ok, error }`, sem stack trace.
 */

export type WindowRole = 'character' | 'settings' | 'balloon';

/** Subconjunto do evento IPC do Electron usado aqui (facilita testes). */
export interface IpcEventLike {
  sender: { id: number };
  senderFrame: { url: string } | null;
}

/** Subconjunto do `ipcMain` do Electron usado aqui (facilita testes). */
export interface IpcMainLike {
  handle(channel: string, listener: (event: IpcEventLike, ...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
  on(channel: string, listener: (event: IpcEventLike, ...args: unknown[]) => void): unknown;
  removeAllListeners(channel: string): unknown;
}

export interface IpcContext {
  role: WindowRole;
  webContentsId: number;
}

export class IpcHandlerError extends Error {
  constructor(
    readonly code: IpcErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'IpcHandlerError';
  }
}

export interface ChannelConfig<S extends z.ZodType> {
  schema: S;
  roles: readonly WindowRole[];
}

export interface IpcRegistryOptions {
  ipcMain: IpcMainLike;
  isTrustedUrl(url: string): boolean;
  roleOf(webContentsId: number): WindowRole | null;
  logger: Logger;
}

function failure(code: IpcErrorCode, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } };
}

function zodMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) return 'Dados inválidos.';
  const path = issue.path.map(String).join('.');
  return path === '' ? issue.message : `${path}: ${issue.message}`;
}

export class IpcRegistry {
  private readonly invokeChannels = new Set<string>();
  private readonly sendChannels = new Set<string>();

  constructor(private readonly options: IpcRegistryOptions) {}

  get registeredChannels(): string[] {
    return [...this.invokeChannels, ...this.sendChannels].sort();
  }

  private authorize(
    event: IpcEventLike,
    channel: string,
    roles: readonly WindowRole[]
  ): IpcContext | null {
    const frameUrl = event.senderFrame?.url ?? null;
    if (frameUrl === null || !this.options.isTrustedUrl(frameUrl)) {
      this.options.logger.warn('ipc.forbidden_origin', { channel });
      return null;
    }
    const role = this.options.roleOf(event.sender.id);
    if (role === null || !roles.includes(role)) {
      this.options.logger.warn('ipc.forbidden_role', { channel, role });
      return null;
    }
    return { role, webContentsId: event.sender.id };
  }

  private parse<S extends z.ZodType>(
    channel: string,
    schema: S,
    args: readonly unknown[]
  ): { ok: true; data: z.output<S> } | { ok: false; message: string } {
    if (args.length > 1) return { ok: false, message: 'Argumentos demais.' };
    const result = schema.safeParse(args[0]);
    if (result.success) return { ok: true, data: result.data };
    this.options.logger.warn('ipc.invalid_payload', { channel, issue: zodMessage(result.error) });
    return { ok: false, message: zodMessage(result.error) };
  }

  handle<S extends z.ZodType, R>(
    channel: IpcChannelName,
    config: ChannelConfig<S>,
    handler: (payload: z.output<S>, context: IpcContext) => R | Promise<R>
  ): void {
    if (this.invokeChannels.has(channel)) throw new Error(`Canal já registrado: ${channel}`);
    this.invokeChannels.add(channel);

    this.options.ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<R>> => {
      const context = this.authorize(event, channel, config.roles);
      if (context === null) return failure('FORBIDDEN_SENDER', 'Origem não autorizada.');

      const parsed = this.parse(channel, config.schema, args);
      if (!parsed.ok) return failure('INVALID_PAYLOAD', parsed.message);

      try {
        return { ok: true, data: await handler(parsed.data, context) };
      } catch (error) {
        if (error instanceof IpcHandlerError) return failure(error.code, error.message);
        if (error instanceof ZodError) return failure('INVALID_PAYLOAD', zodMessage(error));
        this.options.logger.error('ipc.handler_failed', { channel, error });
        return failure('INTERNAL', 'Erro interno.');
      }
    });
  }

  on<S extends z.ZodType>(
    channel: IpcChannelName,
    config: ChannelConfig<S>,
    handler: (payload: z.output<S>, context: IpcContext) => void
  ): void {
    if (this.sendChannels.has(channel)) throw new Error(`Canal já registrado: ${channel}`);
    this.sendChannels.add(channel);

    this.options.ipcMain.on(channel, (event, ...args) => {
      const context = this.authorize(event, channel, config.roles);
      if (context === null) return;
      const parsed = this.parse(channel, config.schema, args);
      if (!parsed.ok) return;
      try {
        handler(parsed.data, context);
      } catch (error) {
        this.options.logger.error('ipc.handler_failed', { channel, error });
      }
    });
  }

  dispose(): void {
    for (const channel of this.invokeChannels) this.options.ipcMain.removeHandler(channel);
    for (const channel of this.sendChannels) this.options.ipcMain.removeAllListeners(channel);
    this.invokeChannels.clear();
    this.sendChannels.clear();
  }
}
