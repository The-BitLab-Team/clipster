import type { DisplayedErrorCode } from '../errors/codes';
import type { AiProviderId } from '../schemas/settings';

/** Tipos dos provedores de IA vistos pela interface (Configurações e balão). Sem segredos. */

/** Provedores que usam chave de API. */
export type KeyedProvider = 'anthropic' | 'openai-compatible';

export interface ModelInfo {
  id: string;
  name: string;
  /** O provedor avisou que o modelo vai ser desativado. */
  deprecated?: boolean;
}

/** Códigos de "Testar conexão" e da lista de modelos: os da SPEC §23 mais dois da configuração. */
export type ConnectionErrorCode =
  | DisplayedErrorCode
  /** O endereço respondeu, mas não parece um servidor compatível (sem `/models`). */
  | 'NOT_COMPATIBLE'
  /** Falta a chave de API. */
  | 'MISSING_KEY';

export type ConnectionResult =
  { status: 'connected'; modelCount: number } | { status: 'error'; code: ConnectionErrorCode };

export type ModelListResult =
  { status: 'ok'; models: ModelInfo[] } | { status: 'error'; code: ConnectionErrorCode };

/** O que a interface sabe da chave: nunca a chave em si (SPEC §21). */
export interface KeyStatus {
  hasKey: boolean;
  /** Últimos 4 caracteres, para mostrar "•••• 1234". */
  hint: string | null;
  /** Há cofre de verdade (DPAPI, Keychain, libsecret/kwallet)? */
  secureBackend: boolean;
  /** Compatível com OpenAI: a chave salva é de outro endereço e não será usada. */
  originMismatch: boolean;
  /** Endereço ao qual a chave salva pertence. */
  savedFor: string | null;
  /** `env`: veio do .env (só em desenvolvimento). */
  source: 'stored' | 'env' | null;
}

export type AiIssue = 'noProvider' | 'missingModel' | 'missingKey';

/** Se dá para conversar agora com a IA escolhida e, se não, o que falta. */
export interface AiStatus {
  provider: AiProviderId;
  ready: boolean;
  issue: AiIssue | null;
}
