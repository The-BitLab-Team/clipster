import type { SavedPosition } from '../../shared/schemas/settings';
import { DEFAULT_SCREEN_MARGIN_DIP } from '../../shared/constants/ui';

/**
 * Funções puras de posicionamento (SPEC §19.4). Sem dependência do Electron:
 * recebem a lista de monitores e devolvem coordenadas em DIP.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

export interface DisplayInfo {
  id: number;
  bounds: Rect;
  /** Área útil (sem barra de tarefas/dock). */
  workArea: Rect;
  scaleFactor: number;
  isPrimary: boolean;
}

export interface ResolvedPosition extends Point {
  displayId: number | null;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

export function distanceToRect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

export function rectFullyInside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** Mantém o retângulo inteiro dentro da área (alinha ao topo/esquerda se não couber). */
export function clampToArea(position: Point, size: Size, area: Rect): Point {
  return {
    x: Math.round(clamp(position.x, area.x, area.x + area.width - size.width)),
    y: Math.round(clamp(position.y, area.y, area.y + area.height - size.height))
  };
}

export function primaryDisplay(displays: readonly DisplayInfo[]): DisplayInfo {
  const primary = displays.find((display) => display.isPrimary) ?? displays[0];
  if (primary === undefined) {
    throw new Error('Nenhum monitor disponível.');
  }
  return primary;
}

/** Monitor que contém o centro do retângulo; senão, o mais próximo dele. */
export function displayForRect(rect: Rect, displays: readonly DisplayInfo[]): DisplayInfo {
  const center = rectCenter(rect);
  const containing = displays.find((display) => containsPoint(display.workArea, center));
  if (containing !== undefined) return containing;

  let best = primaryDisplay(displays);
  let bestDistance = distanceToRect(center, best.workArea);
  for (const display of displays) {
    const distance = distanceToRect(center, display.workArea);
    if (distance < bestDistance) {
      best = display;
      bestDistance = distance;
    }
  }
  return best;
}

export function defaultPosition(
  display: DisplayInfo,
  size: Size,
  margin: number = DEFAULT_SCREEN_MARGIN_DIP
): Point {
  const area = display.workArea;
  return clampToArea(
    {
      x: area.x + area.width - size.width - margin,
      y: area.y + area.height - size.height - margin
    },
    size,
    area
  );
}

function relativeAxis(value: number, start: number, available: number): number {
  if (available <= 0) return 0;
  return clamp((value - start) / available, 0, 1);
}

/** Converte uma posição absoluta no formato persistido (absoluta + relativa à área útil). */
export function computeSavedPosition(
  position: Point,
  size: Size,
  displays: readonly DisplayInfo[]
): SavedPosition {
  const display = displayForRect({ ...position, ...size }, displays);
  const area = display.workArea;
  return {
    x: Math.round(position.x),
    y: Math.round(position.y),
    displayId: display.id,
    relX: relativeAxis(position.x, area.x, area.width - size.width),
    relY: relativeAxis(position.y, area.y, area.height - size.height)
  };
}

function fromRelative(saved: SavedPosition, size: Size, display: DisplayInfo): Point {
  const area = display.workArea;
  return clampToArea(
    {
      x: area.x + saved.relX * Math.max(0, area.width - size.width),
      y: area.y + saved.relY * Math.max(0, area.height - size.height)
    },
    size,
    area
  );
}

/**
 * Decide onde o personagem aparece (SPEC §19.4):
 * 1. monitor salvo existe → posição absoluta, limitada à área útil dele;
 * 2. monitor sumiu → posição relativa aplicada ao monitor principal;
 * 3. sem dados → canto inferior direito do monitor principal;
 * 4. sempre termina com a janela inteira dentro de uma área útil.
 */
export function resolveCharacterPosition(
  saved: SavedPosition | null,
  displays: readonly DisplayInfo[],
  size: Size,
  margin: number = DEFAULT_SCREEN_MARGIN_DIP
): ResolvedPosition {
  const primary = primaryDisplay(displays);

  if (saved === null) {
    return { ...defaultPosition(primary, size, margin), displayId: primary.id };
  }

  const savedDisplay =
    saved.displayId === null ? undefined : displays.find((d) => d.id === saved.displayId);

  if (savedDisplay !== undefined) {
    const position = clampToArea({ x: saved.x, y: saved.y }, size, savedDisplay.workArea);
    return { ...position, displayId: savedDisplay.id };
  }

  const position = fromRelative(saved, size, primary);
  return { ...position, displayId: primary.id };
}

/** Garante que uma posição qualquer (ex.: após troca de monitores) fique visível. */
export function ensureVisible(
  position: Point,
  size: Size,
  displays: readonly DisplayInfo[]
): ResolvedPosition {
  const rect = { ...position, ...size };
  const display = displayForRect(rect, displays);
  return { ...clampToArea(position, size, display.workArea), displayId: display.id };
}

/** Durante o arrasto: deixa passar de um monitor a outro, mas nunca sair da área útil. */
export function constrainDragPosition(
  position: Point,
  size: Size,
  displays: readonly DisplayInfo[]
): Point {
  const { x, y } = ensureVisible(position, size, displays);
  return { x, y };
}

/** Novo tamanho mantendo o centro, depois limitado à área visível. */
export function resizeAroundCenter(
  current: Rect,
  nextSize: Size,
  displays: readonly DisplayInfo[]
): Rect {
  const center = rectCenter(current);
  const position = {
    x: Math.round(center.x - nextSize.width / 2),
    y: Math.round(center.y - nextSize.height / 2)
  };
  const visible = ensureVisible(position, nextSize, displays);
  return { x: visible.x, y: visible.y, ...nextSize };
}

export function scaledSize(base: Size, scale: number): Size {
  return { width: Math.round(base.width * scale), height: Math.round(base.height * scale) };
}
