import { describe, expect, it } from 'vitest';
import { placeBalloon } from '../../src/main/windows/balloonPlacement';
import { rectFullyInside, type DisplayInfo, type Rect } from '../../src/main/windows/placement';

function display(
  id: number,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { primary?: boolean; taskbar?: number } = {}
): DisplayInfo {
  const taskbar = options.taskbar ?? 40;
  return {
    id,
    bounds: { x, y, width, height },
    workArea: { x, y, width, height: height - taskbar },
    scaleFactor: 1,
    isPrimary: options.primary ?? false
  };
}

const primary = display(1, 0, 0, 1920, 1080, { primary: true });
const left = display(2, -1280, 0, 1280, 1024);
const above = display(3, 0, -1440, 2560, 1440);
const BALLOON = { width: 360, height: 300 };

function character(x: number, y: number, size = 160): Rect {
  return { x, y, width: size, height: size };
}

describe('placeBalloon (SPEC §8.2)', () => {
  it('padrão: acima e à esquerda, com o rabicho apontando para o centro do personagem', () => {
    const body = character(1736, 856); // canto inferior direito
    const layout = placeBalloon(body, BALLOON, [primary]);
    expect(layout.vertical).toBe('above');
    expect(layout.horizontal).toBe('left');
    expect(layout.y + layout.height).toBe(body.y);
    expect(layout.x + layout.tailX).toBe(body.x + body.width / 2);
    expect(rectFullyInside(layout, primary.workArea)).toBe(true);
  });

  it('perto da borda esquerda: abre para a direita', () => {
    const layout = placeBalloon(character(10, 700), BALLOON, [primary]);
    expect(layout.horizontal).toBe('right');
    expect(layout.vertical).toBe('above');
    expect(layout.x + layout.tailX).toBe(90);
    expect(rectFullyInside(layout, primary.workArea)).toBe(true);
  });

  it('perto do topo: abre para baixo', () => {
    const body = character(900, 20);
    const layout = placeBalloon(body, BALLOON, [primary]);
    expect(layout.vertical).toBe('below');
    expect(layout.y).toBe(body.y + body.height);
  });

  it('canto superior esquerdo: inverte nos dois eixos', () => {
    const layout = placeBalloon(character(0, 0), BALLOON, [primary]);
    expect(layout).toMatchObject({ vertical: 'below', horizontal: 'right', y: 160 });
    expect(rectFullyInside(layout, primary.workArea)).toBe(true);
  });

  it('nunca fica atrás da barra de tarefas', () => {
    const layout = placeBalloon(character(900, 520), { width: 360, height: 900 }, [primary]);
    expect(layout.y + layout.height).toBeLessThanOrEqual(1040);
    expect(layout.y).toBeGreaterThanOrEqual(0);
  });

  it('usa o monitor onde está o personagem, inclusive com coordenadas negativas', () => {
    const onLeft = placeBalloon(character(-1270, 600), BALLOON, [primary, left]);
    expect(rectFullyInside(onLeft, left.workArea)).toBe(true);
    expect(onLeft.horizontal).toBe('right');

    const onTop = placeBalloon(character(1200, -200), BALLOON, [primary, above]);
    expect(onTop.vertical).toBe('above');
    expect(rectFullyInside(onTop, above.workArea)).toBe(true);
  });

  it('o rabicho fica longe dos cantos arredondados quando o balão é limitado', () => {
    const tiny = display(4, 0, 0, 400, 400, { primary: true, taskbar: 0 });
    const layout = placeBalloon(character(240, 240), BALLOON, [tiny]);
    expect(layout.tailX).toBeGreaterThanOrEqual(26);
    expect(layout.tailX).toBeLessThanOrEqual(BALLOON.width - 26);
    expect(rectFullyInside(layout, tiny.workArea)).toBe(true);
  });

  it('acompanha o personagem quando ele é arrastado', () => {
    const first = placeBalloon(character(1000, 600), BALLOON, [primary]);
    const second = placeBalloon(character(1100, 650), BALLOON, [primary]);
    expect(second.x - first.x).toBe(100);
    expect(second.y - first.y).toBe(50);
  });
});
