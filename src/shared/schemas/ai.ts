import { z } from 'zod';

/** Payloads de IPC das chaves e dos provedores de IA (SPEC Apêndice C). Só o main importa. */

export const KeyedProviderSchema = z.enum(['anthropic', 'openai-compatible']);

export const SecretSetPayloadSchema = z.strictObject({
  provider: KeyedProviderSchema,
  value: z.string().min(1).max(512),
  /** O usuário confirmou salvar mesmo sem cofre seguro (Linux sem kwallet/libsecret). */
  allowInsecure: z.boolean().optional()
});

export const ProviderPayloadSchema = z.strictObject({
  provider: KeyedProviderSchema
});
