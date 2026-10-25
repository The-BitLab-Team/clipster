import { z } from 'zod';
import { MAX_COPY_CHARS, MAX_USER_MESSAGE_CHARS } from '../constants/ai';
import { isProviderConsoleUrl } from '../ai/urls';
import { CLIPSTER_ERROR_CODES } from '../errors/codes';
import { StoredToolActivitySchema } from './permissions';

/** Uma resposta guarda no máximo isto de atividades de ferramenta. */
const MAX_STORED_TOOL_ACTIVITIES = 50;
import { AiProviderIdSchema, PersonalityIdSchema } from './settings';

/**
 * Esquemas Zod da conversa: payloads de IPC do chat e o arquivo `history.json` (SPEC §13).
 * Só o main importa este módulo.
 */

export const ChatSendPayloadSchema = z.strictObject({
  text: z
    .string()
    .max(MAX_USER_MESSAGE_CHARS)
    .refine((value) => value.trim().length > 0, 'Mensagem vazia.')
});

export const ChatCancelPayloadSchema = z.strictObject({
  requestId: z.string().min(1).max(64)
});

export const ChatTypingPayloadSchema = z.strictObject({
  typing: z.boolean()
});

export const HistoryClearPayloadSchema = z.strictObject({
  confirmed: z.literal(true)
});

export const OnboardingCompletePayloadSchema = z.strictObject({
  personality: PersonalityIdSchema,
  /** "Configurar IA agora" abre as Configurações; aqui só chega demo ou nenhum. */
  provider: AiProviderIdSchema.extract(['none', 'demo'])
});

export const ClipboardWritePayloadSchema = z.strictObject({
  text: z.string().max(MAX_COPY_CHARS)
});

export const BalloonResizePayloadSchema = z.strictObject({
  height: z.number().int().min(40).max(4000)
});

const DisplayedErrorCodeSchema = z.enum(CLIPSTER_ERROR_CODES).exclude(['CANCELLED']);

export const StoredMessageSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(['user', 'assistant']),
  content: z.string().max(MAX_COPY_CHARS),
  createdAt: z.iso.datetime(),
  status: z.enum(['streaming', 'complete', 'interrupted', 'error']),
  error: z
    .object({
      code: DisplayedErrorCodeSchema,
      retryAfterSeconds: z.number().int().nonnegative().optional(),
      supportCode: z.string().max(16).optional(),
      consoleUrl: z.string().refine(isProviderConsoleUrl).optional()
    })
    .optional(),
  tools: z.array(StoredToolActivitySchema).max(MAX_STORED_TOOL_ACTIVITIES).optional()
});

export const StoredConversationSchema = z.object({
  id: z.string().min(1).max(64),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  messages: z.array(StoredMessageSchema)
});

export const HISTORY_SCHEMA_VERSION = 1;

export const HistoryFileSchema = z.object({
  schemaVersion: z.literal(HISTORY_SCHEMA_VERSION),
  conversations: z.array(z.unknown())
});
