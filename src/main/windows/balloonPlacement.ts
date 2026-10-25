import { clampToArea, displayForRect, type DisplayInfo, type Rect, type Size } from './placement';

/**
 * Posição do balão em relação ao personagem (SPEC §8.2). Função pura, testada em unidade.
 *
 * Preferência: acima e à esquerda do personagem, com o rabicho apontando para o centro dele.
 * Sem espaço na área útil do monitor do personagem, inverte na horizontal e/ou na vertical;
 * por fim, limita à área útil.
 */

export interface BalloonLayout extends Rect {
  vertical: 'above' | 'below';
  horizontal: 'left' | 'right';
  /** Ponta do rabicho, em DIP a partir da borda esquerda do balão. */
  tailX: number;
}

export interface BalloonPlacementOptions {
  /** Distância da ponta do rabicho até a borda do balão do lado do personagem. */
  tailInset: number;
  /** A ponta do rabicho nunca chega mais perto da borda do que isto (cantos arredondados). */
  minTailInset: number;
}

export const DEFAULT_BALLOON_PLACEMENT: BalloonPlacementOptions = {
  tailInset: 44,
  minTailInset: 26
};

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function placeBalloon(
  character: Rect,
  size: Size,
  displays: readonly DisplayInfo[],
  options: BalloonPlacementOptions = DEFAULT_BALLOON_PLACEMENT
): BalloonLayout {
  const area = displayForRect(character, displays).workArea;
  const areaRight = area.x + area.width;
  const areaBottom = area.y + area.height;
  const centerX = character.x + character.width / 2;

  const leftX = centerX + options.tailInset - size.width;
  const rightX = centerX - options.tailInset;
  const fitsLeft = leftX >= area.x;
  const fitsRight = rightX + size.width <= areaRight;
  const horizontal: BalloonLayout['horizontal'] = fitsLeft
    ? 'left'
    : fitsRight
      ? 'right'
      : centerX - area.x >= areaRight - centerX
        ? 'left'
        : 'right';

  const aboveY = character.y - size.height;
  const belowY = character.y + character.height;
  const fitsAbove = aboveY >= area.y;
  const fitsBelow = belowY + size.height <= areaBottom;
  const vertical: BalloonLayout['vertical'] = fitsAbove
    ? 'above'
    : fitsBelow
      ? 'below'
      : character.y - area.y >= areaBottom - (character.y + character.height)
        ? 'above'
        : 'below';

  const position = clampToArea(
    { x: horizontal === 'left' ? leftX : rightX, y: vertical === 'above' ? aboveY : belowY },
    size,
    area
  );
  const tailX = Math.round(
    clamp(centerX - position.x, options.minTailInset, size.width - options.minTailInset)
  );
  return { ...position, ...size, vertical, horizontal, tailX };
}
