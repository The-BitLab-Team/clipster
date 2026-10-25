import type {
  AiStatus,
  ConnectionResult,
  KeyedProvider,
  KeyStatus,
  ModelListResult
} from '../../shared/ai/providers';
import type { AiSettings } from '../../shared/schemas/settings';
import type { Logger } from '../logging/logger';
import type { SecretStatus, SecretStore } from '../storage/secretStore';
import { toClipsterError } from './errors';
import { AnthropicProvider } from './providers/anthropic';
import { DEMO_MODEL, type DemoProvider } from './providers/demo/demoProvider';
import { OpenAiCompatibleProvider } from './providers/openaiCompatible';
import { originOf } from './providers/shared';
import type { AIProvider } from './types';

/**
 * Escolhe e monta o provider a partir das configurações e do cofre de chaves (SPEC §20).
 * O resto do app só vê `AIProvider`; aqui é o único lugar que conhece cada provedor.
 */

export interface ProviderRegistryOptions {
  settings: () => AiSettings;
  secrets: SecretStore;
  demo: DemoProvider;
  logger: Logger;
  /** Só em E2E: servidor simulado no lugar de api.anthropic.com. */
  anthropicBaseUrl?: string | null;
  /** Para testes: injeta o `fetch`. */
  fetch?: typeof fetch;
}

/** Tempo para listar modelos e testar conexão nas Configurações. */
const SETTINGS_REQUEST_TIMEOUT_MS = 15_000;

/** A API oficial da OpenAI sempre exige chave; servidores locais, em geral, não. */
export function requiresKey(provider: KeyedProvider, baseUrl: string): boolean {
  if (provider === 'anthropic') return true;
  try {
    return new URL(baseUrl).hostname === 'api.openai.com';
  } catch {
    return false;
  }
}

export function toKeyStatus(status: SecretStatus): KeyStatus {
  return {
    hasKey: status.hasKey,
    hint: status.hint,
    secureBackend: status.secureBackend,
    originMismatch: status.originMismatch,
    savedFor: status.origin,
    source: status.source
  };
}

export class ProviderRegistry {
  constructor(private readonly options: ProviderRegistryOptions) {}

  private origin(provider: KeyedProvider): string | null {
    return provider === 'openai-compatible'
      ? originOf(this.options.settings().openaiCompatible.baseUrl)
      : null;
  }

  /** Provider pronto para conversar, ou `null` se falta algo (ver `status()`). */
  resolve(): AIProvider | null {
    return this.status().ready ? this.build(this.options.settings().provider) : null;
  }

  /** Modelo da IA escolhida. Nunca fixo no código: vem das Configurações (SPEC §20.4). */
  model(): string {
    const ai = this.options.settings();
    switch (ai.provider) {
      case 'demo':
        return DEMO_MODEL.id;
      case 'openai-compatible':
        return ai.openaiCompatible.model;
      case 'anthropic':
        return ai.anthropic.model;
      case 'none':
        return '';
    }
  }

  status(): AiStatus {
    const ai = this.options.settings();
    const { provider } = ai;
    const notReady = (issue: AiStatus['issue']): AiStatus => ({ provider, ready: false, issue });
    switch (provider) {
      case 'none':
        return notReady('noProvider');
      case 'demo':
        return { provider, ready: true, issue: null };
      case 'openai-compatible':
      case 'anthropic': {
        const baseUrl = ai.openaiCompatible.baseUrl;
        if (requiresKey(provider, baseUrl) && this.key(provider) === null) {
          return notReady('missingKey');
        }
        const model = provider === 'anthropic' ? ai.anthropic.model : ai.openaiCompatible.model;
        if (model === '') return notReady('missingModel');
        return { provider, ready: true, issue: null };
      }
    }
  }

  keyStatus(provider: KeyedProvider): KeyStatus {
    return toKeyStatus(this.options.secrets.status(provider, this.origin(provider)));
  }

  /** Lança SecretError (cofre inseguro sem confirmação, chave inválida, falha ao gravar). */
  setKey(provider: KeyedProvider, value: string, allowInsecure: boolean): KeyStatus {
    return toKeyStatus(
      this.options.secrets.set(provider, value, { origin: this.origin(provider), allowInsecure })
    );
  }

  clearKey(provider: KeyedProvider): KeyStatus {
    return toKeyStatus(this.options.secrets.clear(provider, this.origin(provider)));
  }

  async listModels(provider: KeyedProvider): Promise<ModelListResult> {
    const instance = this.buildForSettings(provider);
    if (instance === null) return { status: 'error', code: 'MISSING_KEY' };
    try {
      const models = await instance.listModels(AbortSignal.timeout(SETTINGS_REQUEST_TIMEOUT_MS));
      return { status: 'ok', models };
    } catch (error) {
      const mapped = toClipsterError(error);
      this.options.logger.warn('ai.models_failed', {
        provider,
        code: mapped.code,
        detail: mapped.message
      });
      return {
        status: 'error',
        code: mapped.code === 'CANCELLED' ? 'TIMEOUT' : mapped.code
      };
    }
  }

  async testConnection(provider: KeyedProvider): Promise<ConnectionResult> {
    const instance = this.buildForSettings(provider);
    if (instance === null) return { status: 'error', code: 'MISSING_KEY' };
    const result = await instance.testConnection(AbortSignal.timeout(SETTINGS_REQUEST_TIMEOUT_MS));
    if (result.status === 'connected') {
      this.options.logger.info('ai.connection_ok', { provider, models: result.modelCount });
      return result;
    }
    // O detalhe técnico fica só no log; a interface recebe o código.
    this.options.logger.warn('ai.connection_failed', {
      provider,
      code: result.code,
      detail: result.detail
    });
    return { status: 'error', code: result.code };
  }

  private key(provider: KeyedProvider): string | null {
    return this.options.secrets.get(provider, this.origin(provider));
  }

  /** Instância para as Configurações: não exige modelo escolhido, só a chave quando necessária. */
  private buildForSettings(provider: KeyedProvider): AIProvider | null {
    const baseUrl = this.options.settings().openaiCompatible.baseUrl;
    if (requiresKey(provider, baseUrl) && this.key(provider) === null) return null;
    return this.build(provider);
  }

  private build(provider: AiSettings['provider']): AIProvider | null {
    const ai = this.options.settings();
    switch (provider) {
      case 'none':
        return null;
      case 'demo':
        return this.options.demo;
      case 'openai-compatible':
        return new OpenAiCompatibleProvider({
          baseUrl: ai.openaiCompatible.baseUrl,
          apiKey: this.key('openai-compatible'),
          ...(this.options.fetch === undefined ? {} : { fetch: this.options.fetch })
        });
      case 'anthropic': {
        const apiKey = this.key('anthropic');
        if (apiKey === null) return null;
        return new AnthropicProvider({
          apiKey,
          ...(this.options.anthropicBaseUrl == null
            ? {}
            : { baseURL: this.options.anthropicBaseUrl }),
          ...(this.options.fetch === undefined ? {} : { fetch: this.options.fetch })
        });
      }
    }
  }
}
