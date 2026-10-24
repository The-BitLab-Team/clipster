import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTER_BASE_SIZE } from '../../src/shared/constants/ui';
import { CHARACTER_STATES } from '../../src/shared/character/states';
import {
  allowsBlink,
  CharacterManifestSchema,
  parseCharacterManifest,
  resolvePose,
  type CharacterManifest
} from '../../src/shared/schemas/characterManifest';

const PACK_DIR = resolve(__dirname, '../../assets/character/placeholder');
const manifest: CharacterManifest = parseCharacterManifest(
  JSON.parse(readFileSync(join(PACK_DIR, 'manifest.json'), 'utf8'))
);
const rig = readFileSync(join(PACK_DIR, manifest.rig), 'utf8');
const poses = readFileSync(join(PACK_DIR, manifest.styles), 'utf8');

describe('pacote de arte "placeholder"', () => {
  it('o manifesto é válido e os arquivos existem', () => {
    expect(manifest.format).toBe('svg-rig');
    expect(existsSync(join(PACK_DIR, manifest.rig))).toBe(true);
    expect(existsSync(join(PACK_DIR, manifest.styles))).toBe(true);
  });

  it('o tamanho do pacote bate com o da janela', () => {
    expect(manifest.size).toEqual(CHARACTER_BASE_SIZE);
    expect(rig).toContain(
      `viewBox="0 0 ${CHARACTER_BASE_SIZE.width.toString()} ${CHARACTER_BASE_SIZE.height.toString()}"`
    );
  });

  it('tem pose para todos os estados da SPEC §5.3', () => {
    for (const state of CHARACTER_STATES) {
      expect(manifest.states[state], state).toBeDefined();
      if (state !== 'idle') expect(poses, state).toContain(`[data-state='${state}']`);
    }
  });

  it('o rig tem as partes que as poses usam', () => {
    const required = [
      'data-hit="true"',
      'clp-pose',
      'clp-handle--left',
      'clp-handle--right',
      'clp-visor',
      'clp-eyes--open',
      'clp-eyes--closed',
      'clp-eyes--happy',
      'clp-eyes--x',
      'clp-eyes--wide',
      'clp-eye--left',
      'clp-mouth--smile',
      'clp-mouth--open',
      'clp-mouth--flat',
      'clp-mouth--frown',
      'clp-mouth--grin',
      'clp-prop--dots',
      'clp-prop--zzz',
      'clp-prop--question',
      'clp-prop--alert',
      'clp-prop--sparkles',
      'clp-badge'
    ];
    for (const part of required) expect(rig, part).toContain(part);
  });

  it('não usa estilos inline nem scripts (bloqueados pela CSP)', () => {
    expect(rig).not.toMatch(/<style|style="|<script|on[a-z]+="/i);
  });

  it('acessórios ficam fora da área clicável', () => {
    expect(rig).toMatch(/<g class="clp-props" pointer-events="none">/);
  });

  it('loops infinitos só em estados curtos (thinking, talking)', () => {
    const rules = poses.split('}').filter((block) => /animation:[^;]*infinite/.test(block));
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule, rule).toMatch(/\[data-state='(thinking|talking)'\]/);
    }
  });

  it('toda animação e transição exige movimento completo', () => {
    const blocks = poses.split('}').filter((block) => /\b(animation|transition):/.test(block));
    for (const block of blocks) expect(block, block).toContain("[data-motion='full']");
  });

  it('estado sem pose cai no fallback; piscada respeita o manifesto', () => {
    const partial = parseCharacterManifest({
      ...manifest,
      states: { idle: { blink: true }, sleeping: { blink: false } }
    });
    expect(resolvePose(partial, 'thinking')).toBe('idle');
    expect(resolvePose(partial, 'sleeping')).toBe('sleeping');
    expect(allowsBlink(partial, 'thinking')).toBe(true);
    expect(allowsBlink(partial, 'sleeping')).toBe(false);
  });

  it('recusa manifesto com fallback sem pose ou formato desconhecido', () => {
    expect(
      CharacterManifestSchema.safeParse({ ...manifest, states: { sleeping: { blink: false } } })
        .success
    ).toBe(false);
    expect(CharacterManifestSchema.safeParse({ ...manifest, format: 'lottie' }).success).toBe(
      false
    );
    expect(
      CharacterManifestSchema.safeParse({
        ...manifest,
        states: { ...manifest.states, dancing: {} }
      }).success
    ).toBe(false);
  });
});
