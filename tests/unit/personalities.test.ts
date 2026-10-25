import { describe, expect, it, vi } from 'vitest';
import { PersonalityManager } from '../../src/main/ai/personalityManager';
import { memoryLogger } from './logRecords';
import {
  BASE_INSTRUCTIONS,
  getPersonality,
  PERSONALITIES,
  pickLine
} from '../../src/shared/personalities';
import { BASE_PLACEHOLDERS } from '../../src/shared/personalities/base';
import { PersonalityProfileSchema } from '../../src/shared/personalities/schema';
import { PersonalityIdSchema } from '../../src/shared/schemas/settings';

describe('perfis de personalidade (SPEC §7)', () => {
  it('existe um perfil válido para cada id de personalidade', () => {
    for (const id of PersonalityIdSchema.options) {
      const profile = PERSONALITIES[id];
      expect(profile.id).toBe(id);
      expect(() => PersonalityProfileSchema.parse(profile)).not.toThrow();
    }
  });

  it('as instruções base usam só os marcadores conhecidos', () => {
    const used = [...BASE_INSTRUCTIONS.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    expect(new Set(used)).toEqual(new Set(BASE_PLACEHOLDERS));
  });

  it('o Espirituoso carrega as regras de moderação do humor', () => {
    const text = PERSONALITIES.witty.systemInstructions;
    expect(text).toMatch(/no máximo uma observação espirituosa/);
    expect(text).toMatch(/nunca do usuário/);
    expect(text).toMatch(/temas sensíveis/);
    expect(PERSONALITIES.helpful.systemInstructions).toMatch(/Sem sarcasmo/);
  });

  it('id desconhecido cai no Prestativo', () => {
    expect(getPersonality('pirate').id).toBe('helpful');
    expect(getPersonality('__proto__').id).toBe('helpful');
    expect(getPersonality('witty').id).toBe('witty');
  });

  it('pickLine escolhe dentro da lista, no idioma pedido', () => {
    const lines = PERSONALITIES.helpful.microcopy.greeting;
    expect(pickLine(lines, 'en', () => 0)).toBe(lines[0]?.en);
    expect(pickLine(lines, 'pt-BR', () => 0.9999)).toBe(lines.at(-1)?.['pt-BR']);
    expect(pickLine([], 'en')).toBe('');
  });
});

describe('PersonalityManager', () => {
  function setup(initial: string) {
    let current = initial;
    const { logger, records } = memoryLogger();
    const persist = vi.fn((id: string) => {
      current = id;
    });
    const manager = new PersonalityManager({ current: () => current, persist, logger });
    return { manager, persist, records };
  }

  it('resolve o perfil ativo e persiste a troca', () => {
    const { manager, persist } = setup('helpful');
    expect(manager.active.id).toBe('helpful');
    manager.set('witty');
    expect(persist).toHaveBeenCalledWith('witty');
    expect(manager.active.id).toBe('witty');
  });

  it('id salvo desconhecido: usa o Prestativo e registra um aviso', () => {
    const { manager, records } = setup('unknown-mode');
    expect(manager.active.id).toBe('helpful');
    expect(records().some((record) => record.msg === 'personality.unknown_id')).toBe(true);
  });

  it('valida os perfis ao iniciar, sem erros', () => {
    const { records } = setup('helpful');
    expect(records().filter((record) => record.level === 'error')).toEqual([]);
  });
});
