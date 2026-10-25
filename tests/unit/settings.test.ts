import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  SettingsPatchSchema,
  SettingsSchema
} from '../../src/shared/schemas/settings';
import { migrateSettings, parseStoredSettings } from '../../src/main/storage/settingsRecovery';

describe('esquema de configurações', () => {
  it('os padrões são válidos e conservadores em privacidade', () => {
    expect(SettingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.general.launchAtLogin).toBe(false);
    expect(DEFAULT_SETTINGS.privacy.saveHistory).toBe(false);
    expect(DEFAULT_SETTINGS.ai.provider).toBe('none');
    expect(DEFAULT_SETTINGS.ai.openaiCompatible.model).toBe('');
    expect(DEFAULT_SETTINGS.ai.anthropic.model).toBe('');
  });

  it('o patch rejeita campos desconhecidos e campos gerenciados pelo main', () => {
    expect(SettingsPatchSchema.safeParse({ general: { foo: true } }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ window: { characterPosition: null } }).success).toBe(
      false
    );
    expect(SettingsPatchSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ firstRunCompleted: true }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ hideTipShown: true }).success).toBe(false);
  });

  it('tamanho do chat fica entre 85% e 130%', () => {
    expect(SettingsPatchSchema.safeParse({ appearance: { chatScale: 1.3 } }).success).toBe(true);
    expect(SettingsPatchSchema.safeParse({ appearance: { chatScale: 1.5 } }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ appearance: { chatScale: 0.8 } }).success).toBe(false);
  });

  it('o patch rejeita valores fora do intervalo', () => {
    expect(SettingsPatchSchema.safeParse({ appearance: { characterScale: 3 } }).success).toBe(
      false
    );
    expect(SettingsPatchSchema.safeParse({ personality: 'grumpy' }).success).toBe(false);
    expect(
      SettingsPatchSchema.safeParse({
        ai: { openaiCompatible: { baseUrl: 'file:///etc/passwd', model: '' } }
      }).success
    ).toBe(false);
  });

  it('applySettingsPatch mescla por seção sem perder os outros campos', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, {
      general: { alwaysOnTop: false },
      personality: 'witty'
    });
    expect(next.general).toEqual({ ...DEFAULT_SETTINGS.general, alwaysOnTop: false });
    expect(next.personality).toBe('witty');
    expect(next.appearance).toEqual(DEFAULT_SETTINGS.appearance);
  });

  it('applySettingsPatch ignora chaves com undefined', () => {
    const patch = SettingsPatchSchema.parse({ general: { alwaysOnTop: undefined } });
    expect(applySettingsPatch(DEFAULT_SETTINGS, patch)).toEqual(DEFAULT_SETTINGS);
  });

  it('applySettingsPatch valida o resultado', () => {
    expect(() =>
      applySettingsPatch(DEFAULT_SETTINGS, { appearance: { characterScale: 9 } })
    ).toThrow(ZodError);
  });
});

describe('leitura tolerante (parseStoredSettings)', () => {
  it('arquivo válido é lido sem problemas', () => {
    const stored = { ...DEFAULT_SETTINGS, personality: 'witty' };
    expect(parseStoredSettings(JSON.parse(JSON.stringify(stored)))).toEqual({
      settings: stored,
      issues: []
    });
  });

  it('arquivo da versão anterior (sem hideTipShown) é lido sem erro; valor inválido é reportado', () => {
    const older: Record<string, unknown> = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Record<
      string,
      unknown
    >; // cópia simples de um objeto JSON
    delete older.hideTipShown;
    expect(parseStoredSettings(older)).toEqual({
      settings: DEFAULT_SETTINGS,
      issues: []
    });
    const broken = parseStoredSettings({ ...DEFAULT_SETTINGS, hideTipShown: 'sim' });
    expect(broken.issues).toEqual(['hideTipShown']);
    expect(broken.settings.hideTipShown).toBe(false);
  });

  it('campos ausentes recebem o padrão sem serem tratados como erro', () => {
    const result = parseStoredSettings({ schemaVersion: 1, general: { alwaysOnTop: false } });
    expect(result.issues).toEqual([]);
    expect(result.settings.general.alwaysOnTop).toBe(false);
    expect(result.settings.general.language).toBe('system');
  });

  it('campo inválido volta ao padrão e é reportado, sem perder os vizinhos válidos', () => {
    const result = parseStoredSettings({
      ...DEFAULT_SETTINGS,
      general: { ...DEFAULT_SETTINGS.general, alwaysOnTop: 'sim', quietMode: true },
      appearance: { ...DEFAULT_SETTINGS.appearance, characterScale: 99 }
    });
    expect(result.issues).toEqual(['general.alwaysOnTop', 'appearance.characterScale']);
    expect(result.settings.general.alwaysOnTop).toBe(true);
    expect(result.settings.general.quietMode).toBe(true);
    expect(result.settings.appearance.characterScale).toBe(1);
  });

  it('campos desconhecidos (de versões futuras) são descartados sem erro', () => {
    const result = parseStoredSettings({
      ...DEFAULT_SETTINGS,
      general: { ...DEFAULT_SETTINGS.general, futureOption: 1 },
      newSection: {}
    });
    expect(result.issues).toEqual([]);
    expect(result.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('seção com tipo errado vira o padrão', () => {
    const result = parseStoredSettings({ ...DEFAULT_SETTINGS, privacy: 'nada' });
    expect(result.issues).toEqual(['privacy']);
    expect(result.settings.privacy).toEqual(DEFAULT_SETTINGS.privacy);
  });

  it('posição salva inválida é descartada', () => {
    const result = parseStoredSettings({
      ...DEFAULT_SETTINGS,
      window: { characterPosition: { x: 'a', y: 0, displayId: 1, relX: 0, relY: 0 } }
    });
    expect(result.issues).toEqual(['window.characterPosition']);
    expect(result.settings.window.characterPosition).toBeNull();
  });

  it('conteúdo que não é objeto vira o padrão', () => {
    expect(parseStoredSettings([1, 2]).issues).toEqual(['root']);
    expect(parseStoredSettings(undefined)).toEqual({ settings: DEFAULT_SETTINGS, issues: [] });
  });

  it('migrateSettings trata arquivo sem versão como v1 e leva à versão atual', () => {
    expect(migrateSettings({ personality: 'witty' })).toEqual({
      personality: 'witty',
      schemaVersion: 2,
      ai: {
        openaiCompatible: { baseUrl: 'http://localhost:11434/v1', model: '' },
        anthropic: { model: '' }
      }
    });
  });

  it('v1 → v2: endereço e modelo passam para o provedor compatível com OpenAI', () => {
    const v1 = {
      schemaVersion: 1,
      personality: 'witty',
      ai: { provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', model: 'qwen' }
    };
    const { settings, issues } = parseStoredSettings(v1);
    expect(issues).toEqual([]);
    expect(settings.schemaVersion).toBe(2);
    expect(settings.ai).toEqual({
      provider: 'openai-compatible',
      openaiCompatible: { baseUrl: 'http://localhost:1234/v1', model: 'qwen' },
      anthropic: { model: '' }
    });
    expect(settings.personality).toBe('witty');
  });

  it('sem versão mas já no formato novo: as seções existentes são mantidas', () => {
    const { settings } = parseStoredSettings({
      ai: {
        provider: 'anthropic',
        openaiCompatible: { baseUrl: 'http://localhost:1234/v1', model: 'qwen' },
        anthropic: { model: 'claude-x' }
      }
    });
    expect(settings.ai).toEqual({
      provider: 'anthropic',
      openaiCompatible: { baseUrl: 'http://localhost:1234/v1', model: 'qwen' },
      anthropic: { model: 'claude-x' }
    });
  });

  it('v1 com endereço inválido: só esse campo volta ao padrão', () => {
    const { settings, issues } = parseStoredSettings({
      schemaVersion: 1,
      ai: { provider: 'openai-compatible', baseUrl: 'ftp://x', model: 'm' }
    });
    expect(issues).toEqual(['ai.openaiCompatible']);
    expect(settings.ai.provider).toBe('openai-compatible');
    expect(settings.ai.openaiCompatible.baseUrl).toBe('http://localhost:11434/v1');
  });
});
