import { describe, expect, it } from 'vitest';
import {
  clampToArea,
  computeSavedPosition,
  constrainDragPosition,
  displayForRect,
  ensureVisible,
  resizeAroundCenter,
  resolveCharacterPosition,
  scaledSize,
  type DisplayInfo
} from '../../src/main/windows/placement';

const SIZE = { width: 160, height: 160 };

function display(
  id: number,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { primary?: boolean; taskbar?: number; scaleFactor?: number } = {}
): DisplayInfo {
  const taskbar = options.taskbar ?? 40;
  return {
    id,
    bounds: { x, y, width, height },
    workArea: { x, y, width, height: height - taskbar },
    scaleFactor: options.scaleFactor ?? 1,
    isPrimary: options.primary ?? false
  };
}

const primary = display(1, 0, 0, 1920, 1080, { primary: true });
const left = display(2, -1280, 0, 1280, 1024, { scaleFactor: 1.25 });
const above = display(3, 0, -1440, 2560, 1440, { scaleFactor: 1.5 });

describe('resolveCharacterPosition', () => {
  it('sem posição salva, usa o canto inferior direito da área útil do monitor principal', () => {
    const result = resolveCharacterPosition(null, [left, primary], SIZE);
    expect(result).toEqual({ x: 1920 - 160 - 24, y: 1040 - 160 - 24, displayId: 1 });
  });

  it('restaura a posição absoluta quando o monitor salvo ainda existe', () => {
    const saved = { x: -900, y: 300, displayId: 2, relX: 0.3, relY: 0.4 };
    expect(resolveCharacterPosition(saved, [primary, left], SIZE)).toEqual({
      x: -900,
      y: 300,
      displayId: 2
    });
  });

  it('limita à área útil quando a resolução do monitor salvo diminuiu', () => {
    const smaller = display(1, 0, 0, 1280, 720, { primary: true });
    const saved = { x: 1700, y: 850, displayId: 1, relX: 1, relY: 1 };
    expect(resolveCharacterPosition(saved, [smaller], SIZE)).toEqual({
      x: 1280 - 160,
      y: 680 - 160,
      displayId: 1
    });
  });

  it('aplica a posição relativa no monitor principal quando o monitor salvo foi desconectado', () => {
    const saved = { x: -1000, y: 100, displayId: 2, relX: 0.5, relY: 0 };
    const result = resolveCharacterPosition(saved, [primary], SIZE);
    expect(result).toEqual({ x: Math.round((1920 - 160) / 2), y: 0, displayId: 1 });
  });

  it('funciona com monitor acima do principal (coordenadas negativas em y)', () => {
    const saved = { x: 100, y: -1000, displayId: 3, relX: 0, relY: 0 };
    expect(resolveCharacterPosition(saved, [primary, above], SIZE)).toEqual({
      x: 100,
      y: -1000,
      displayId: 3
    });
  });

  it('usa o primeiro monitor se nenhum estiver marcado como principal', () => {
    const only = display(9, 100, 100, 800, 600);
    const result = resolveCharacterPosition(null, [only], SIZE);
    expect(result.displayId).toBe(9);
  });

  it('lança erro claro se não houver monitores', () => {
    expect(() => resolveCharacterPosition(null, [], SIZE)).toThrow('Nenhum monitor');
  });
});

describe('computeSavedPosition', () => {
  it('guarda posição absoluta, monitor e posição relativa à área útil', () => {
    const saved = computeSavedPosition({ x: 880, y: 440 }, SIZE, [primary, left]);
    expect(saved.displayId).toBe(1);
    expect(saved.x).toBe(880);
    expect(saved.relX).toBeCloseTo(880 / (1920 - 160));
    expect(saved.relY).toBeCloseTo(440 / (1040 - 160));
  });

  it('identifica o monitor pela posição do centro da janela', () => {
    expect(computeSavedPosition({ x: -500, y: 200 }, SIZE, [primary, left]).displayId).toBe(2);
  });

  it('é o inverso de resolveCharacterPosition', () => {
    const saved = computeSavedPosition({ x: 321, y: 654 }, SIZE, [primary, left, above]);
    expect(resolveCharacterPosition(saved, [primary, left, above], SIZE)).toMatchObject({
      x: 321,
      y: 654
    });
  });
});

describe('ensureVisible / constrainDragPosition', () => {
  it('traz de volta uma janela que ficou fora de todas as telas', () => {
    expect(ensureVisible({ x: 5000, y: 5000 }, SIZE, [primary, left])).toEqual({
      x: 1920 - 160,
      y: 1040 - 160,
      displayId: 1
    });
  });

  it('permite arrastar para outro monitor', () => {
    expect(constrainDragPosition({ x: -700, y: 500 }, SIZE, [primary, left])).toEqual({
      x: -700,
      y: 500
    });
  });

  it('não deixa arrastar para baixo da barra de tarefas', () => {
    expect(constrainDragPosition({ x: 100, y: 1000 }, SIZE, [primary])).toEqual({
      x: 100,
      y: 1040 - 160
    });
  });
});

describe('utilitários', () => {
  it('clampToArea alinha ao topo/esquerda quando a janela é maior que a área', () => {
    expect(
      clampToArea(
        { x: 50, y: 50 },
        { width: 500, height: 500 },
        { x: 0, y: 0, width: 300, height: 300 }
      )
    ).toEqual({
      x: 0,
      y: 0
    });
  });

  it('displayForRect escolhe o monitor mais próximo quando o centro está fora de todos', () => {
    expect(displayForRect({ x: -3000, y: 100, width: 160, height: 160 }, [primary, left]).id).toBe(
      2
    );
  });

  it('resizeAroundCenter mantém o centro e continua visível', () => {
    const next = resizeAroundCenter({ x: 800, y: 400, ...SIZE }, scaledSize(SIZE, 1.5), [primary]);
    expect(next).toEqual({ x: 760, y: 360, width: 240, height: 240 });
  });

  it('scaledSize arredonda para pixels inteiros', () => {
    expect(scaledSize(SIZE, 0.75)).toEqual({ width: 120, height: 120 });
    expect(scaledSize({ width: 161, height: 161 }, 1.25)).toEqual({ width: 201, height: 201 });
  });
});
