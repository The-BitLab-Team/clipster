import { execFileSync } from 'node:child_process';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  balloonBounds,
  characterBounds,
  createUserDataDir,
  eventually,
  launchClipster,
  openBalloon,
  removeUserDataDir,
  RETURNING_USER,
  type Bounds
} from './helpers';

/**
 * Vários monitores e escala (SPEC §19.4, Fase 6) com monitores de verdade para o Electron:
 * um servidor X com o driver "dummy", em que o teste liga e desliga a segunda saída com o
 * `xrandr`. Só roda com `npm run test:e2e:monitors` (Linux, ver scripts/e2e-monitors.sh);
 * no `npm run test:e2e` comum (Xvfb, uma tela só), é pulado.
 */

test.skip(
  process.env.CLIPSTER_E2E_XRANDR !== '1',
  'Precisa de um servidor X com duas saídas (npm run test:e2e:monitors).'
);

const SECOND = 'DUMMY1';

function xrandr(...args: string[]): void {
  execFileSync('xrandr', args, { stdio: 'ignore' });
}

/** O driver "dummy" só atualiza a lista de monitores quando alguém a consulta. */
function refreshMonitors(): void {
  xrandr('--listmonitors');
}

function enableSecondMonitor(): void {
  xrandr('--output', 'DUMMY0', '--mode', '1920x1080', '--pos', '0x0', '--primary');
  xrandr('--output', SECOND, '--mode', '1920x1200', '--pos', '1920x0');
  refreshMonitors();
}

interface DisplayInfo {
  id: number;
  bounds: Bounds;
  workArea: Bounds;
  scaleFactor: number;
}

function displays(app: ElectronApplication): Promise<DisplayInfo[]> {
  return app.evaluate(({ screen }) =>
    screen.getAllDisplays().map((display) => ({
      id: display.id,
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor
    }))
  );
}

function inside(inner: Bounds | null, outer: Bounds): boolean {
  return (
    inner !== null &&
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** Arrasto sintético pelo visor, em passos (como uma mão de verdade). */
async function drag(page: Page, dx: number, dy: number): Promise<void> {
  await page.mouse.move(80, 110);
  await page.mouse.down();
  const steps = 20;
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(80 + (dx * step) / steps, 110 + (dy * step) / steps);
  }
  await page.mouse.up();
}

let userDataDir: string;

test.beforeEach(() => {
  enableSecondMonitor();
  userDataDir = createUserDataDir();
});

test.afterEach(() => {
  enableSecondMonitor();
  removeUserDataDir(userDataDir);
});

test('dois monitores: arrastar para o segundo, reabrir no mesmo lugar, balão no mesmo monitor', async () => {
  const first = await launchClipster(userDataDir, {
    settings: { ...RETURNING_USER, ai: { provider: 'demo' } }
  });
  let saved: Bounds;
  try {
    const [primary, second] = await displays(first.app);
    if (primary === undefined || second === undefined) throw new Error('Esperava dois monitores.');
    expect(second.bounds.x).toBe(1920);

    const start = await eventually(
      () => characterBounds(first.app),
      (bounds) => bounds !== null
    );
    expect(inside(start, primary.workArea)).toBe(true);

    await drag(first.characterPage, 1000, -300);
    const moved = await eventually(
      () => characterBounds(first.app),
      (bounds) => inside(bounds, second.workArea)
    );
    if (moved === null) throw new Error('Sem posição depois do arrasto.');
    saved = moved;

    const balloon = await openBalloon(first.app, first.characterPage);
    await balloon.getByTestId('balloon').waitFor();
    await eventually(
      () => balloonBounds(first.app),
      (bounds) => inside(bounds, second.workArea)
    );
  } finally {
    await first.app.close();
  }

  const second = await launchClipster(userDataDir);
  try {
    const restored = await eventually(
      () => characterBounds(second.app),
      (bounds) => bounds !== null
    );
    expect(restored).toMatchObject({ x: saved.x, y: saved.y });
  } finally {
    await second.app.close();
  }
});

test('monitor desligado com o personagem nele: ele volta para uma tela visível', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, {
    settings: { ...RETURNING_USER, ai: { provider: 'demo' } }
  });
  try {
    const [primary, second] = await displays(app);
    if (primary === undefined || second === undefined) throw new Error('Esperava dois monitores.');
    await drag(characterPage, 1000, -300);
    await eventually(
      () => characterBounds(app),
      (bounds) => inside(bounds, second.workArea)
    );
    await openBalloon(app, characterPage);

    xrandr('--output', SECOND, '--off');
    refreshMonitors();
    await eventually(
      () => displays(app),
      (list) => list.length === 1
    );
    await eventually(
      () => characterBounds(app),
      (bounds) => inside(bounds, primary.workArea)
    );
    await eventually(
      () => balloonBounds(app),
      (bounds) => inside(bounds, primary.workArea)
    );
  } finally {
    await app.close();
  }
});

test('escala de 150%: tamanhos em DIP, tudo dentro da área útil', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, {
    settings: { ...RETURNING_USER, ai: { provider: 'demo' } },
    args: ['--force-device-scale-factor=1.5']
  });
  try {
    const list = await displays(app);
    expect(list.map((display) => display.scaleFactor)).toEqual([1.5, 1.5]);
    const [primary] = list;
    if (primary === undefined) throw new Error('Sem monitor.');
    expect(primary.bounds).toMatchObject({ width: 1280, height: 720 });

    const bounds = await eventually(
      () => characterBounds(app),
      (value) => value !== null
    );
    expect(bounds).toMatchObject({ width: 160, height: 160 });
    expect(inside(bounds, primary.workArea)).toBe(true);
    // Na tela física, o personagem ocupa 240 px: a escala vem do sistema, não do app.
    const devicePixels = await characterPage.evaluate(() => ({
      width: Math.round(window.innerWidth * window.devicePixelRatio),
      ratio: window.devicePixelRatio
    }));
    expect(devicePixels).toEqual({ width: 240, ratio: 1.5 });

    await openBalloon(app, characterPage);
    await eventually(
      () => balloonBounds(app),
      (value) => inside(value, primary.workArea)
    );
  } finally {
    await app.close();
  }
});
