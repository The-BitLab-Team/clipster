import { z } from 'zod';
import { SettingsPatchSchema, SettingsSectionSchema } from '../schemas/settings';

/** Esquemas Zod dos payloads de cada canal (SPEC §17, §26). */

export const NoPayloadSchema = z.undefined();

export const DragMovePayloadSchema = z.strictObject({
  dx: z.number().min(-100_000).max(100_000),
  dy: z.number().min(-100_000).max(100_000)
});

export const ClickThroughPayloadSchema = z.strictObject({
  ignore: z.boolean()
});

export const OpenSettingsPayloadSchema = z
  .strictObject({
    section: SettingsSectionSchema.optional()
  })
  .optional();

export const OpenExternalPayloadSchema = z.strictObject({
  url: z.string().min(1).max(2048)
});

export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

export const LogWritePayloadSchema = z.strictObject({
  level: LogLevelSchema,
  message: z.string().min(1).max(2000),
  context: z
    .record(z.string().max(64), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
    .optional()
});

export { SettingsPatchSchema };

export type DragMovePayload = z.infer<typeof DragMovePayloadSchema>;
export type LogLevel = z.infer<typeof LogLevelSchema>;
export type LogWritePayload = z.infer<typeof LogWritePayloadSchema>;
