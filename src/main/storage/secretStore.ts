import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Logger } from '../logging/logger';
import { writeFileAtomicSync } from './atomicWrite';

/**
 * Chaves de API (SPEC §21). Só no main, cifradas com `safeStorage` (DPAPI no Windows,
 * Keychain no macOS, kwallet/libsecret no Linux) e gravadas em `secrets.json`, nunca em
 * `settings.json`. A chave nunca volta para o renderer: só "tem chave" e os 4 últimos dígitos.
 *
 * A chave do provedor compatível com OpenAI fica presa ao endereço (origem) em que foi salva:
 * se o usuário trocar o endereço, ela não é enviada ao servidor novo.
 */

export type SecretProvider = 'anthropic' | 'openai-compatible';

/** Subconjunto do `safeStorage` do Electron (facilita testes). */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
  getSelectedStorageBackend?(): string;
}

export interface SecretStatus {
  hasKey: boolean;
  /** Últimos 4 caracteres (ex.: "1234"), ou null. */
  hint: string | null;
  /** Há cofre de verdade? No Linux sem kwallet/libsecret ("basic_text"), não. */
  secureBackend: boolean;
  /** Para o compatível com OpenAI: endereço ao qual a chave salva pertence. */
  origin: string | null;
  /** A chave salva é de outro endereço e não será usada no atual. */
  originMismatch: boolean;
  /** De onde veio a chave em uso. `env` só em desenvolvimento (.env). */
  source: 'stored' | 'env' | null;
}

export class SecretError extends Error {
  constructor(
    readonly code: 'INSECURE_STORAGE' | 'INVALID_KEY' | 'WRITE_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'SecretError';
  }
}

const EntrySchema = z.object({
  value: z.string().min(1),
  encrypted: z.boolean(),
  hint: z.string().max(8).nullable(),
  origin: z.string().max(2048).nullable(),
  savedAt: z.string()
});

const FileSchema = z.object({
  schemaVersion: z.literal(1),
  keys: z.partialRecord(z.enum(['anthropic', 'openai-compatible']), EntrySchema)
});

type Entry = z.infer<typeof EntrySchema>;
type SecretsFile = z.infer<typeof FileSchema>;

/** Uma chave plausível: sem espaços nem quebras de linha, até 512 caracteres. */
export const ApiKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(512)
  .regex(/^\S+$/, 'A chave não pode ter espaços.');

export function keyHint(key: string): string | null {
  return key.length >= 12 ? key.slice(-4) : null;
}

export interface SecretStoreOptions {
  filePath: string;
  safeStorage: SafeStorageLike;
  platform: NodeJS.Platform;
  logger: Logger;
  /** Só em desenvolvimento: chaves lidas do `.env` (SPEC §21). */
  envKeys?: Partial<Record<SecretProvider, string>>;
  /** Origem à qual a chave `OPENAI_API_KEY` do .env se aplica. */
  envOpenAiOrigin?: string;
  now?: () => Date;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export class SecretStore {
  private data: SecretsFile;

  private constructor(
    private readonly options: SecretStoreOptions,
    data: SecretsFile
  ) {
    this.data = data;
  }

  static load(options: SecretStoreOptions): SecretStore {
    let data: SecretsFile = { schemaVersion: 1, keys: {} };
    try {
      const parsed = FileSchema.safeParse(JSON.parse(readFileSync(options.filePath, 'utf8')));
      if (parsed.success) data = parsed.data;
      else options.logger.warn('secrets.invalid_file');
    } catch (error) {
      if (!isMissingFile(error)) options.logger.warn('secrets.read_failed');
    }
    return new SecretStore(options, data);
  }

  /** Há um cofre de verdade para cifrar as chaves? */
  secureBackend(): boolean {
    const { safeStorage, platform } = this.options;
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (platform === 'linux' && safeStorage.getSelectedStorageBackend !== undefined) {
      const backend = safeStorage.getSelectedStorageBackend();
      return backend !== 'basic_text' && backend !== 'unknown';
    }
    return true;
  }

  status(provider: SecretProvider, origin: string | null = null): SecretStatus {
    const entry = this.data.keys[provider];
    const secureBackend = this.secureBackend();
    const mismatch =
      entry !== undefined &&
      provider === 'openai-compatible' &&
      entry.origin !== null &&
      origin !== null &&
      entry.origin !== origin;
    if (entry !== undefined && !mismatch) {
      return {
        hasKey: true,
        hint: entry.hint,
        secureBackend,
        origin: entry.origin,
        originMismatch: false,
        source: 'stored'
      };
    }
    const env = this.envKey(provider, origin);
    if (env !== null) {
      return {
        hasKey: true,
        hint: keyHint(env),
        secureBackend,
        origin,
        originMismatch: mismatch,
        source: 'env'
      };
    }
    return {
      hasKey: false,
      hint: null,
      secureBackend,
      origin: entry?.origin ?? null,
      originMismatch: mismatch,
      source: null
    };
  }

  /**
   * Guarda uma chave. Sem cofre de verdade, só com `allowInsecure` (o usuário confirmou
   * depois de ver o aviso, SPEC §21).
   */
  set(
    provider: SecretProvider,
    value: string,
    options: { origin: string | null; allowInsecure: boolean }
  ): SecretStatus {
    const parsed = ApiKeySchema.safeParse(value);
    if (!parsed.success) throw new SecretError('INVALID_KEY', 'Chave inválida.');
    const key = parsed.data;
    const secure = this.secureBackend();
    if (!secure && !options.allowInsecure) {
      throw new SecretError('INSECURE_STORAGE', 'Não há cofre seguro neste sistema.');
    }
    const { safeStorage } = this.options;
    const encrypted = safeStorage.isEncryptionAvailable();
    const stored = encrypted
      ? safeStorage.encryptString(key).toString('base64')
      : Buffer.from(key, 'utf8').toString('base64');
    const entry: Entry = {
      value: stored,
      encrypted,
      hint: keyHint(key),
      origin: provider === 'openai-compatible' ? options.origin : null,
      savedAt: (this.options.now?.() ?? new Date()).toISOString()
    };
    this.write({ ...this.data, keys: { ...this.data.keys, [provider]: entry } });
    this.options.logger.info('secrets.saved', { provider, secure });
    return this.status(provider, options.origin);
  }

  clear(provider: SecretProvider, origin: string | null = null): SecretStatus {
    if (this.data.keys[provider] !== undefined) {
      const keys: SecretsFile['keys'] = {};
      for (const name of ['anthropic', 'openai-compatible'] as const) {
        const entry = this.data.keys[name];
        if (name !== provider && entry !== undefined) keys[name] = entry;
      }
      this.write({ ...this.data, keys });
      this.options.logger.info('secrets.cleared', { provider });
    }
    return this.status(provider, origin);
  }

  /** A chave em texto puro, só para o provider no main. Nunca vai para log nem para o renderer. */
  get(provider: SecretProvider, origin: string | null = null): string | null {
    const entry = this.data.keys[provider];
    const usable =
      entry !== undefined &&
      !(provider === 'openai-compatible' && entry.origin !== null && entry.origin !== origin);
    if (usable) {
      try {
        const buffer = Buffer.from(entry.value, 'base64');
        return entry.encrypted
          ? this.options.safeStorage.decryptString(buffer)
          : buffer.toString('utf8');
      } catch {
        // Ex.: arquivo copiado de outro usuário do Windows (DPAPI). Tratado como "sem chave".
        this.options.logger.warn('secrets.decrypt_failed', { provider });
        return null;
      }
    }
    return this.envKey(provider, origin);
  }

  private envKey(provider: SecretProvider, origin: string | null): string | null {
    const value = this.options.envKeys?.[provider];
    if (value === undefined || value === '') return null;
    if (provider === 'openai-compatible' && origin !== this.options.envOpenAiOrigin) return null;
    return value;
  }

  private write(next: SecretsFile): void {
    try {
      writeFileAtomicSync(this.options.filePath, `${JSON.stringify(next, null, 2)}\n`);
      this.data = next;
    } catch (error) {
      this.options.logger.error('secrets.write_failed', { error });
      throw new SecretError('WRITE_FAILED', 'Não foi possível gravar a chave.');
    }
  }
}
