import type { LocalizedString } from '../personalities/types';

/**
 * Ferramentas e permissões (SPEC §22). Tipos compartilhados entre o main (que executa e
 * decide) e as janelas (que mostram a atividade e o pedido de permissão).
 */

export const PERMISSION_IDS = [
  'clipboard.read',
  'clipboard.write',
  'filesystem.read',
  'filesystem.write',
  'applications.open',
  'notifications.send',
  'screen.observe',
  'network.fetch'
] as const;

export type PermissionId = (typeof PERMISSION_IDS)[number];

export const RISK_LEVELS = ['read', 'write', 'destructive'] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

export const GRANT_SCOPES = ['once', 'session', 'always'] as const;

/** Por quanto tempo vale uma permissão concedida. */
export type GrantScope = (typeof GRANT_SCOPES)[number];

export type PermissionDecision = 'deny' | GrantScope;

/**
 * Escopos que o usuário pode escolher, por risco (SPEC §22.2). Uma ação destrutiva é sempre
 * confirmada de novo: nunca "nesta sessão", nunca "sempre".
 */
export const SCOPES_BY_RISK: Readonly<Record<RiskLevel, readonly GrantScope[]>> = {
  read: ['once', 'session', 'always'],
  write: ['once', 'session'],
  destructive: ['once']
};

/**
 * Ferramentas que o app conhece. O nome é estável (SPEC §22.1) e serve de chave para os
 * rótulos no i18n. As duas `demo*` só existem com `CLIPSTER_DEV_TOOLS=1` fora do app instalado.
 */
export const KNOWN_TOOLS = [
  'getCurrentTime',
  'getClipsterVersion',
  'demoDestructiveAction',
  'demoReadAction'
] as const;

export type KnownToolName = (typeof KNOWN_TOOLS)[number];

export function isKnownTool(name: string): name is KnownToolName {
  return (KNOWN_TOOLS as readonly string[]).includes(name);
}

/** Pedido de permissão mostrado no balão. O texto vem da ferramenta, nunca do modelo. */
export interface PermissionPrompt {
  id: string;
  action: LocalizedString;
  risk: RiskLevel;
  scopes: readonly GrantScope[];
  permissions: readonly PermissionId[];
  /** ISO 8601: sem resposta até aqui, o pedido é cancelado. */
  expiresAt: string;
}

/**
 * - `awaiting`: esperando a permissão do usuário (`prompt` presente);
 * - `running`: executando;
 * - `done`: terminou bem;
 * - `denied`: o usuário não permitiu (ou não respondeu a tempo);
 * - `failed`: ferramenta desconhecida, argumentos inválidos, limite atingido ou erro.
 */
export type ToolActivityStatus = 'awaiting' | 'running' | 'done' | 'denied' | 'failed';

/** Uma chamada de ferramenta, como aparece junto da resposta no balão. */
export interface ToolActivity {
  /** Id da chamada (vem do provider). */
  id: string;
  /** `null`: o modelo pediu uma ferramenta que não existe. */
  tool: KnownToolName | null;
  status: ToolActivityStatus;
  prompt?: PermissionPrompt;
}

/** Permissão concedida, como aparece em Privacidade › Permissões. */
export interface PermissionGrantView {
  id: string;
  tool: KnownToolName;
  permissions: readonly PermissionId[];
  scope: 'session' | 'always';
  /** ISO 8601. */
  grantedAt: string;
}
