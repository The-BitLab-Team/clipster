import { describe, expect, it } from 'vitest';
import { diagnosticsReport, type DiagnosticsInput } from '../../src/main/app/diagnostics';
import { DEFAULT_SETTINGS } from '../../src/shared/schemas/settings';

const input = (overrides: Partial<DiagnosticsInput> = {}): DiagnosticsInput => ({
  app: {
    name: 'Clipster',
    version: '0.6.0',
    electron: '45.0.0',
    chrome: '146.0.0.0',
    node: '24.1.0',
    platform: 'win32',
    arch: 'x64',
    osRelease: '10.0.26100',
    isPackaged: true
  },
  locale: 'pt-BR',
  systemLanguages: ['pt-BR', 'en-US'],
  settings: {
    ...DEFAULT_SETTINGS,
    ai: {
      provider: 'openai-compatible',
      openaiCompatible: { baseUrl: 'http://192.168.0.10:11434/v1', model: 'llama3.2:3b' },
      anthropic: { model: '' }
    }
  },
  ai: { provider: 'openai-compatible', ready: true, issue: null },
  model: 'llama3.2:3b',
  secureStorage: true,
  displays: [
    { width: 1920, height: 1080, scaleFactor: 1 },
    { width: 2560, height: 1440, scaleFactor: 1.5 }
  ],
  permissions: { always: 1, session: 0 },
  toolDevTools: false,
  ...overrides
});

describe('Copiar diagnóstico (SPEC §24)', () => {
  it('traz versões, sistema, telas e a IA escolhida', () => {
    const report = diagnosticsReport(input());
    expect(report).toContain('Clipster 0.6.0 (installed)');
    expect(report).toContain('OS: win32 10.0.26100 x64');
    expect(report).toContain('Displays: 1920x1080@1x, 2560x1440@1.5x');
    expect(report).toContain('AI: openai-compatible · model llama3.2:3b · server remote · ready');
    expect(report).toContain('Tool permissions: 1 always, 0 this session');
  });

  it('nunca leva o endereço do servidor, chaves ou conversas', () => {
    const report = diagnosticsReport(input());
    expect(report).not.toContain('192.168');
    expect(report).not.toMatch(/sk-|key:|hint/i);
  });

  it('IA que falta configurar aparece com o motivo', () => {
    const report = diagnosticsReport(
      input({
        settings: DEFAULT_SETTINGS,
        ai: { provider: 'none', ready: false, issue: 'noProvider' },
        model: ''
      })
    );
    expect(report).toContain('AI: none · not ready (noProvider)');
  });
});
