/** Categorias da janela de Configurações (SPEC §12). Sem Zod: usado também no renderer. */
export const SETTINGS_SECTIONS = [
  'general',
  'ai',
  'personality',
  'appearance',
  'privacy',
  'about'
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number];

export function isSettingsSection(value: unknown): value is SettingsSectionId {
  return typeof value === 'string' && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}
