import { z } from 'zod';
import { SETTINGS_SECTIONS } from '../constants/sections';
import { CHARACTER_SCALE } from '../constants/ui';

/**
 * Esquema das configurações (SPEC §12 e §13).
 *
 * Cada seção é declarada uma vez como "shape". A partir dela saem:
 * - o esquema de armazenamento (`z.object`, ignora campos desconhecidos ao ler do disco);
 * - o esquema de patch do IPC (`z.strictObject(...).partial()`, rejeita campos desconhecidos).
 */

export const SETTINGS_SCHEMA_VERSION = 1;

export const LanguagePreferenceSchema = z.enum(['system', 'pt-BR', 'en']);
export const PersonalityIdSchema = z.enum(['helpful', 'witty']);
export const AnimationPreferenceSchema = z.enum(['system', 'full', 'reduced', 'off']);
export const ThemePreferenceSchema = z.enum(['system', 'light', 'dark']);
export const AiProviderIdSchema = z.enum(['none', 'demo', 'openai-compatible', 'anthropic']);
export const SleepAfterMinutesSchema = z.union([
  z.literal(0),
  z.literal(5),
  z.literal(10),
  z.literal(30)
]);
export const HistoryRetentionDaysSchema = z.union([
  z.literal(0),
  z.literal(7),
  z.literal(30),
  z.literal(90)
]);

export const SettingsSectionSchema = z.enum(SETTINGS_SECTIONS);

const httpUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Use um endereço http:// ou https://');

export const SavedPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  displayId: z.number().int().nullable(),
  relX: z.number().min(0).max(1),
  relY: z.number().min(0).max(1)
});

const generalShape = {
  language: LanguagePreferenceSchema,
  launchAtLogin: z.boolean(),
  startHidden: z.boolean(),
  alwaysOnTop: z.boolean(),
  quietMode: z.boolean(),
  sleepAfterMinutes: SleepAfterMinutesSchema,
  globalShortcut: z.strictObject({
    enabled: z.boolean(),
    accelerator: z.string().min(1).max(64)
  })
};

const appearanceShape = {
  characterScale: z.number().min(CHARACTER_SCALE.min).max(CHARACTER_SCALE.max),
  chatScale: z.number().min(0.85).max(1.3),
  animations: AnimationPreferenceSchema,
  theme: ThemePreferenceSchema,
  sounds: z.boolean()
};

const privacyShape = {
  saveHistory: z.boolean(),
  historyRetentionDays: HistoryRetentionDaysSchema
};

const aiShape = {
  provider: AiProviderIdSchema,
  baseUrl: httpUrl,
  model: z.string().max(256)
};

const windowShape = {
  characterPosition: SavedPositionSchema.nullable()
};

export const GeneralSettingsSchema = z.object(generalShape);
export const AppearanceSettingsSchema = z.object(appearanceShape);
export const PrivacySettingsSchema = z.object(privacyShape);
export const AiSettingsSchema = z.object(aiShape);
export const WindowStateSchema = z.object(windowShape);

export const SettingsSchema = z.object({
  schemaVersion: z.literal(SETTINGS_SCHEMA_VERSION),
  firstRunCompleted: z.boolean(),
  general: GeneralSettingsSchema,
  personality: PersonalityIdSchema,
  appearance: AppearanceSettingsSchema,
  privacy: PrivacySettingsSchema,
  ai: AiSettingsSchema,
  window: WindowStateSchema
});

/**
 * Patch enviado pelos renderers. `schemaVersion`, `firstRunCompleted` e `window`
 * não podem ser alterados por esse caminho: são gerenciados pelo main process.
 */
export const SettingsPatchSchema = z.strictObject({
  general: z.strictObject(generalShape).partial().optional(),
  personality: PersonalityIdSchema.optional(),
  appearance: z.strictObject(appearanceShape).partial().optional(),
  privacy: z.strictObject(privacyShape).partial().optional(),
  ai: z.strictObject(aiShape).partial().optional()
});

export type LanguagePreference = z.infer<typeof LanguagePreferenceSchema>;
export type PersonalityId = z.infer<typeof PersonalityIdSchema>;
export type SleepAfterMinutes = z.infer<typeof SleepAfterMinutesSchema>;
export type AnimationPreference = z.infer<typeof AnimationPreferenceSchema>;
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;
export type SettingsSection = z.infer<typeof SettingsSectionSchema>;
export type SavedPosition = z.infer<typeof SavedPositionSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  firstRunCompleted: false,
  general: {
    language: 'system',
    launchAtLogin: false,
    startHidden: false,
    alwaysOnTop: true,
    quietMode: false,
    sleepAfterMinutes: 10,
    globalShortcut: { enabled: false, accelerator: 'CommandOrControl+Shift+Space' }
  },
  personality: 'helpful',
  appearance: {
    characterScale: 1,
    chatScale: 1,
    animations: 'system',
    theme: 'system',
    sounds: false
  },
  privacy: {
    saveHistory: false,
    historyRetentionDays: 30
  },
  ai: {
    provider: 'none',
    baseUrl: 'http://localhost:11434/v1',
    model: ''
  },
  window: {
    characterPosition: null
  }
};

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>; // Object.entries perde o tipo das chaves; os valores vêm do próprio objeto.
}

/**
 * Aplica um patch já validado sobre as configurações atuais e valida o resultado.
 * Lança `ZodError` se o resultado for inválido.
 */
export function applySettingsPatch(current: Settings, patch: SettingsPatch): Settings {
  const next = {
    ...current,
    general: { ...current.general, ...withoutUndefined(patch.general ?? {}) },
    personality: patch.personality ?? current.personality,
    appearance: { ...current.appearance, ...withoutUndefined(patch.appearance ?? {}) },
    privacy: { ...current.privacy, ...withoutUndefined(patch.privacy ?? {}) },
    ai: { ...current.ai, ...withoutUndefined(patch.ai ?? {}) }
  };
  return SettingsSchema.parse(next);
}
