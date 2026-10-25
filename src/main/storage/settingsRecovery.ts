import type { z } from 'zod';
import {
  AiSettingsSchema,
  AppearanceSettingsSchema,
  DEFAULT_SETTINGS,
  GeneralSettingsSchema,
  PersonalityIdSchema,
  PrivacySettingsSchema,
  SETTINGS_SCHEMA_VERSION,
  SettingsSchema,
  WindowStateSchema,
  type Settings
} from '../../shared/schemas/settings';

/**
 * Leitura tolerante do arquivo de configurações (SPEC §13):
 * - aplica migrações por `schemaVersion`;
 * - campo ausente → valor padrão (não é erro: acontece quando uma versão nova cria campos);
 * - campo inválido → valor padrão + registro em `issues` (o arquivo original é guardado como backup);
 * - nunca lança exceção.
 */

export interface ParsedSettings {
  settings: Settings;
  /** Campos com valor inválido que foram trocados pelo padrão. */
  issues: string[];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * v1 → v2: `ai.baseUrl`/`ai.model` passam a ser do provedor compatível com OpenAI.
 * Arquivo sem `schemaVersion` mas já no formato novo (editado à mão, por exemplo) mantém
 * as seções `openaiCompatible`/`anthropic` que já tiver.
 */
function migrateV1toV2(raw: UnknownRecord): UnknownRecord {
  const ai = isRecord(raw.ai) ? raw.ai : {};
  const { baseUrl, model, openaiCompatible, anthropic, ...rest } = ai;
  const legacy: UnknownRecord = {};
  if (baseUrl !== undefined) legacy.baseUrl = baseUrl;
  if (model !== undefined) legacy.model = model;
  return {
    ...raw,
    schemaVersion: 2,
    ai: {
      ...rest,
      openaiCompatible: {
        ...DEFAULT_SETTINGS.ai.openaiCompatible,
        ...(isRecord(openaiCompatible) ? openaiCompatible : {}),
        ...legacy
      },
      anthropic: isRecord(anthropic) ? anthropic : DEFAULT_SETTINGS.ai.anthropic
    }
  };
}

/**
 * Migrações de esquema, em ordem. Arquivo sem versão é tratado como v1.
 * Arquivo de uma versão mais nova (downgrade): mantém o que for compatível.
 */
export function migrateSettings(raw: UnknownRecord): UnknownRecord {
  const version = raw.schemaVersion ?? 1;
  let current = raw;
  if (version === 1) current = migrateV1toV2(current);
  return { ...current, schemaVersion: SETTINGS_SCHEMA_VERSION };
}

function recoverSection<S extends z.ZodObject>(
  section: string,
  schema: S,
  defaults: z.output<S>,
  raw: unknown,
  issues: string[]
): z.output<S> {
  if (raw === undefined) return defaults;
  if (!isRecord(raw)) {
    issues.push(section);
    return defaults;
  }
  const candidate: UnknownRecord = { ...defaults };
  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    const value = raw[key];
    if (value === undefined) continue;
    const parsed = (fieldSchema as z.ZodType).safeParse(value); // `shape` é tipado por chave; aqui iteramos genericamente.
    if (parsed.success) {
      candidate[key] = parsed.data;
    } else {
      issues.push(`${section}.${key}`);
    }
  }
  const result = schema.safeParse(candidate);
  if (result.success) return result.data;
  issues.push(section);
  return defaults;
}

export function parseStoredSettings(raw: unknown): ParsedSettings {
  const issues: string[] = [];
  if (!isRecord(raw)) {
    return { settings: DEFAULT_SETTINGS, issues: raw === undefined ? [] : ['root'] };
  }

  const migrated = migrateSettings(raw);

  const personality = PersonalityIdSchema.safeParse(migrated.personality);
  if (migrated.personality !== undefined && !personality.success) issues.push('personality');

  const firstRunRaw = migrated.firstRunCompleted;
  if (firstRunRaw !== undefined && typeof firstRunRaw !== 'boolean')
    issues.push('firstRunCompleted');

  const hideTipRaw = migrated.hideTipShown;
  if (hideTipRaw !== undefined && typeof hideTipRaw !== 'boolean') issues.push('hideTipShown');

  const candidate: Settings = {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    firstRunCompleted:
      typeof firstRunRaw === 'boolean' ? firstRunRaw : DEFAULT_SETTINGS.firstRunCompleted,
    hideTipShown: typeof hideTipRaw === 'boolean' ? hideTipRaw : DEFAULT_SETTINGS.hideTipShown,
    general: recoverSection(
      'general',
      GeneralSettingsSchema,
      DEFAULT_SETTINGS.general,
      migrated.general,
      issues
    ),
    personality: personality.success ? personality.data : DEFAULT_SETTINGS.personality,
    appearance: recoverSection(
      'appearance',
      AppearanceSettingsSchema,
      DEFAULT_SETTINGS.appearance,
      migrated.appearance,
      issues
    ),
    privacy: recoverSection(
      'privacy',
      PrivacySettingsSchema,
      DEFAULT_SETTINGS.privacy,
      migrated.privacy,
      issues
    ),
    ai: recoverSection('ai', AiSettingsSchema, DEFAULT_SETTINGS.ai, migrated.ai, issues),
    window: recoverSection(
      'window',
      WindowStateSchema,
      DEFAULT_SETTINGS.window,
      migrated.window,
      issues
    )
  };

  return { settings: SettingsSchema.parse(candidate), issues };
}
