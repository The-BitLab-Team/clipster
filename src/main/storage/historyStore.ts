import { copyFileSync, readFileSync, rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ConversationMessage } from '../../shared/ai/conversation';
import { HISTORY_FILE_MAX_BYTES, HISTORY_WRITE_DEBOUNCE_MS } from '../../shared/constants/ai';
import {
  HISTORY_SCHEMA_VERSION,
  HistoryFileSchema,
  StoredConversationSchema
} from '../../shared/schemas/conversation';
import type { StoredConversation } from '../ai/assistantService';
import type { Logger } from '../logging/logger';
import { writeFileAtomic, writeFileAtomicSync } from './atomicWrite';

/**
 * Histórico de conversas (SPEC §13). Só existe com "Salvar histórico" ligado.
 * - leitura tolerante: conversa inválida é descartada; arquivo ilegível vira backup;
 * - retenção aplicada ao carregar e quando a configuração muda;
 * - arquivo limitado a ~5 MB: as conversas mais antigas saem primeiro;
 * - escrita atômica e com debounce; gravação síncrona ao sair.
 */

export interface HistoryStoreOptions {
  filePath: string;
  /** 0 = guardar para sempre. */
  retentionDays: number;
  logger: Logger;
  maxBytes?: number;
  writeDebounceMs?: number;
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function byUpdatedAt(a: StoredConversation, b: StoredConversation): number {
  return a.updatedAt.localeCompare(b.updatedAt);
}

/** Converte o resultado do Zod (campos opcionais `| undefined`) no tipo exato da conversa. */
function toConversation(parsed: unknown): StoredConversation | null {
  const result = StoredConversationSchema.safeParse(parsed);
  if (!result.success) return null;
  const messages: ConversationMessage[] = result.data.messages.map((message) => {
    const base: ConversationMessage = {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      status: message.status === 'streaming' ? 'interrupted' : message.status
    };
    if (message.error === undefined) return base;
    const error: NonNullable<ConversationMessage['error']> = { code: message.error.code };
    if (message.error.retryAfterSeconds !== undefined) {
      error.retryAfterSeconds = message.error.retryAfterSeconds;
    }
    if (message.error.supportCode !== undefined) error.supportCode = message.error.supportCode;
    return { ...base, error };
  });
  return {
    id: result.data.id,
    createdAt: result.data.createdAt,
    updatedAt: result.data.updatedAt,
    messages
  };
}

export class HistoryStore {
  private conversations: StoredConversation[];
  private retentionDays: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private pendingWrite: Promise<void> = Promise.resolve();
  private readonly now: () => Date;
  private readonly maxBytes: number;

  private constructor(
    private readonly options: HistoryStoreOptions,
    conversations: StoredConversation[]
  ) {
    this.conversations = conversations;
    this.retentionDays = options.retentionDays;
    this.now = options.now ?? (() => new Date());
    this.maxBytes = options.maxBytes ?? HISTORY_FILE_MAX_BYTES;
  }

  static load(options: HistoryStoreOptions): HistoryStore {
    const conversations = HistoryStore.read(options);
    const store = new HistoryStore(options, conversations);
    if (store.applyLimits()) store.scheduleWrite();
    return store;
  }

  private static read(options: HistoryStoreOptions): StoredConversation[] {
    let text: string;
    try {
      text = readFileSync(options.filePath, 'utf8');
    } catch (error) {
      if (!isMissingFile(error)) options.logger.warn('history.read_failed', { error });
      return [];
    }
    let root: unknown;
    try {
      root = JSON.parse(text);
    } catch {
      root = undefined;
    }
    const parsed = HistoryFileSchema.safeParse(root);
    if (!parsed.success) {
      const stamp = (options.now?.() ?? new Date()).toISOString().replace(/[:.]/g, '-');
      const backupPath = join(dirname(options.filePath), `history.corrupt-${stamp}.json`);
      try {
        copyFileSync(options.filePath, backupPath);
      } catch (error) {
        options.logger.warn('history.backup_failed', { error });
      }
      options.logger.warn('history.recovered', { backupPath });
      return [];
    }
    const conversations: StoredConversation[] = [];
    let dropped = 0;
    for (const item of parsed.data.conversations) {
      const conversation = toConversation(item);
      if (conversation === null) dropped += 1;
      else conversations.push(conversation);
    }
    if (dropped > 0) options.logger.warn('history.invalid_conversations', { dropped });
    return conversations.sort(byUpdatedAt);
  }

  get size(): number {
    return this.conversations.length;
  }

  /** Conversa mais recente, para continuar de onde parou. */
  latest(): StoredConversation | null {
    return this.conversations.at(-1) ?? null;
  }

  all(): StoredConversation[] {
    return [...this.conversations];
  }

  save(conversation: StoredConversation): void {
    if (conversation.messages.length === 0) return;
    const others = this.conversations.filter((item) => item.id !== conversation.id);
    this.conversations = [...others, conversation].sort(byUpdatedAt);
    this.applyLimits();
    this.scheduleWrite();
  }

  setRetention(days: number): void {
    this.retentionDays = days;
    if (this.applyLimits()) this.scheduleWrite();
  }

  /** Apaga disco e memória. Espera qualquer gravação em andamento terminar antes de apagar. */
  clear(): Promise<void> {
    this.clearTimer();
    this.dirty = false;
    this.conversations = [];
    this.pendingWrite = this.pendingWrite.then(() => rm(this.options.filePath, { force: true }));
    return this.pendingWrite;
  }

  async flush(): Promise<void> {
    this.clearTimer();
    if (this.dirty) this.writeNow();
    await this.pendingWrite;
  }

  flushSync(): void {
    this.clearTimer();
    if (!this.dirty) return;
    this.dirty = false;
    try {
      writeFileAtomicSync(this.options.filePath, this.serialize());
    } catch (error) {
      this.options.logger.error('history.write_failed', { error });
    }
  }

  /** Remove o arquivo sem carregar nada (histórico desligado + usuário pediu para apagar). */
  static deleteFileSync(filePath: string): void {
    rmSync(filePath, { force: true });
  }

  /** Retenção + limite de tamanho. Devolve true se algo foi removido. */
  private applyLimits(): boolean {
    const before = this.conversations.length;
    let changed = false;

    if (this.retentionDays > 0) {
      const cutoff = this.now().getTime() - this.retentionDays * DAY_MS;
      this.conversations = this.conversations.filter(
        (item) => Date.parse(item.updatedAt) >= cutoff
      );
    }

    while (this.conversations.length > 1 && this.byteSize() > this.maxBytes) {
      this.conversations.shift();
    }
    // Uma única conversa gigante: perde as mensagens mais antigas.
    const only = this.conversations[0];
    if (this.conversations.length === 1 && only !== undefined && this.byteSize() > this.maxBytes) {
      const messages = [...only.messages];
      while (messages.length > 1 && this.byteSize([{ ...only, messages }]) > this.maxBytes) {
        messages.shift();
      }
      this.conversations = [{ ...only, messages }];
      changed = true;
    }

    if (this.conversations.length !== before) changed = true;
    if (changed) {
      this.options.logger.info('history.trimmed', {
        removed: before - this.conversations.length,
        kept: this.conversations.length
      });
    }
    return changed;
  }

  private byteSize(conversations: StoredConversation[] = this.conversations): number {
    return Buffer.byteLength(this.serialize(conversations), 'utf8');
  }

  private serialize(conversations: StoredConversation[] = this.conversations): string {
    return `${JSON.stringify({ schemaVersion: HISTORY_SCHEMA_VERSION, conversations })}\n`;
  }

  private scheduleWrite(): void {
    this.dirty = true;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.writeNow();
    }, this.options.writeDebounceMs ?? HISTORY_WRITE_DEBOUNCE_MS);
  }

  private writeNow(): void {
    this.dirty = false;
    const data = this.serialize();
    this.pendingWrite = this.pendingWrite
      .then(() => writeFileAtomic(this.options.filePath, data))
      .catch((error: unknown) => {
        this.dirty = true;
        this.options.logger.error('history.write_failed', { error });
      });
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
