import { z } from 'zod';
import { GRANT_SCOPES, KNOWN_TOOLS, PERMISSION_IDS, RISK_LEVELS } from '../tools/types';

/** Esquemas de ferramentas e permissões (SPEC §22, Apêndice C). */

export const PermissionIdSchema = z.enum(PERMISSION_IDS);
export const RiskLevelSchema = z.enum(RISK_LEVELS);
export const GrantScopeSchema = z.enum(GRANT_SCOPES);
export const KnownToolNameSchema = z.enum(KNOWN_TOOLS);
export const PermissionDecisionSchema = z.enum(['deny', ...GRANT_SCOPES]);

/** Permissão "sempre", guardada em `settings.json`. As "nesta sessão" ficam só na memória. */
export const StoredGrantSchema = z.object({
  id: z.string().min(1).max(64),
  tool: KnownToolNameSchema,
  permissions: z.array(PermissionIdSchema).min(1).max(PERMISSION_IDS.length),
  grantedAt: z.iso.datetime()
});

export const PermissionsSettingsSchema = z.object({
  grants: z.array(StoredGrantSchema).max(64)
});

export const PermissionRespondPayloadSchema = z.strictObject({
  requestId: z.string().min(1).max(64),
  decision: PermissionDecisionSchema
});

export const PermissionRevokePayloadSchema = z.strictObject({
  grantId: z.string().min(1).max(64)
});

/** Atividade de ferramenta guardada no histórico (sem o pedido de permissão). */
export const StoredToolActivitySchema = z.object({
  id: z.string().min(1).max(128),
  tool: KnownToolNameSchema.nullable(),
  status: z.enum(['awaiting', 'running', 'done', 'denied', 'failed'])
});

export type StoredGrant = z.infer<typeof StoredGrantSchema>;
export type PermissionsSettings = z.infer<typeof PermissionsSettingsSchema>;
