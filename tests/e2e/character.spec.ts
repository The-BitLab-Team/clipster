import { expect, test, type Page } from '@playwright/test';
import {
  characterView,
  createUserDataDir,
  dispatchCharacterEvent,
  eventually,
  launchClipster,
  removeUserDataDir,
  runCommand,
  waitForPage
} from './helpers';

/**
 * Fase 2 — personagem (SPEC §34): estados, máquina de estados, sono por inatividade,
 * movimento reduzido e ausência de animações contínuas em repouso.
 */

let userDataDir: string;

test.beforeEach(() => {
  userDataDir = createUserDataDir();
});

test.afterEach(() => {
  removeUserDataDir(userDataDir);
});

function stateOf(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.getElementById('character')?.dataset.state);
}

async function expectState(page: Page, state: string, timeout = 10_000): Promise<void> {
  await expect(page.getByTestId('character')).toHaveAttribute('data-state', state, { timeout });
}

/** Animações CSS/transições em andamento na janela do personagem. */
function animationSummary(page: Page) {
  return page.evaluate(() => {
    const running = document
      .getAnimations()
      .filter((animation) => animation.playState === 'running');
    return {
      total: running.length,
      infinite: running.filter((animation) => animation.effect?.getTiming().iterations === Infinity)
        .length
    };
  });
}

test('primeira execução: começa feliz e volta para idle sozinho', async () => {
  const { app, characterPage } = await launchClipster(userDataDir);
  try {
    await expectState(characterPage, 'happy');
    await expectState(characterPage, 'idle', 5_000);
  } finally {
    await app.close();
  }
});

test('dorme após o tempo sem interação e acorda confuso ao ser clicado', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, {
    env: { CLIPSTER_E2E_SLEEP_AFTER_MS: '1500' }
  });
  try {
    await expectState(characterPage, 'sleeping', 8_000);
    await expect(characterPage.getByTestId('character')).toHaveAttribute(
      'aria-label',
      /dormindo|sleeping/
    );

    await characterPage.mouse.click(80, 110);
    await expectState(characterPage, 'confused');
    await expectState(characterPage, 'idle', 5_000);
    expect(await characterView(app)).toEqual({ state: 'idle', badge: false });
  } finally {
    await app.close();
  }
});

test('trocar a personalidade deixa o Clipster feliz por um instante', async () => {
  const { app, characterPage } = await launchClipster(userDataDir);
  try {
    await expectState(characterPage, 'idle', 5_000);
    await runCommand(app, 'setPersonality:witty');
    await expectState(characterPage, 'happy');
    await expectState(characterPage, 'idle', 5_000);
  } finally {
    await app.close();
  }
});

test('durante o arrasto mostra a pose "sendo arrastado"', async () => {
  const { app, characterPage } = await launchClipster(userDataDir);
  try {
    await expectState(characterPage, 'idle', 5_000);
    await characterPage.mouse.move(80, 110);
    await characterPage.mouse.down();
    await characterPage.mouse.move(72, 102, { steps: 4 });
    await expectState(characterPage, 'dragging');
    await characterPage.mouse.up();
    await expectState(characterPage, 'idle');
  } finally {
    await app.close();
  }
});

test('aviso: pose de atenção, depois só o indicador até ser visto', async () => {
  const { app, characterPage } = await launchClipster(userDataDir);
  try {
    await expectState(characterPage, 'idle', 5_000);
    await dispatchCharacterEvent(app, { type: 'NOTIFICATION' });
    await expectState(characterPage, 'notification');

    await dispatchCharacterEvent(app, { type: 'TRANSIENT_ELAPSED' });
    await expectState(characterPage, 'idle');
    const character = characterPage.getByTestId('character');
    await expect(character).toHaveAttribute('data-badge', 'true');
    await expect(character.locator('.clp-badge')).toHaveCSS('opacity', '1');

    await dispatchCharacterEvent(app, { type: 'NOTIFICATION_DISMISSED' });
    await expect(character).toHaveAttribute('data-badge', 'false');
  } finally {
    await app.close();
  }
});

test('fluxo de resposta simulado: pensando → falando → idle', async () => {
  const { app, characterPage } = await launchClipster(userDataDir);
  try {
    await expectState(characterPage, 'idle', 5_000);
    await dispatchCharacterEvent(app, { type: 'MESSAGE_SENT' });
    await expectState(characterPage, 'thinking');
    await dispatchCharacterEvent(app, { type: 'FIRST_TOKEN' });
    await expectState(characterPage, 'talking');
    await dispatchCharacterEvent(app, { type: 'STREAM_DONE' });
    await expectState(characterPage, 'idle');
  } finally {
    await app.close();
  }
});

test('desempenho: em repouso não há animação contínua; loops só em estados curtos', async () => {
  const { app, characterPage } = await launchClipster(userDataDir);
  try {
    await expectState(characterPage, 'idle', 5_000);
    await characterPage.waitForTimeout(400);
    expect((await animationSummary(characterPage)).infinite).toBe(0);

    await runCommand(app, 'previewState:thinking');
    await expectState(characterPage, 'thinking');
    expect((await animationSummary(characterPage)).infinite).toBeGreaterThan(0);

    await runCommand(app, 'previewState:sleeping');
    await expectState(characterPage, 'sleeping');
    await characterPage.waitForTimeout(300);
    const sleeping = await animationSummary(characterPage);
    expect(sleeping.total).toBeGreaterThan(0);
    expect(sleeping.infinite).toBe(0);
  } finally {
    await app.close();
  }
});

test('"Animações: Desligadas" remove animações e a pré-visualização volta sozinha', async () => {
  const { app, characterPage } = await launchClipster(userDataDir);
  try {
    await expectState(characterPage, 'idle', 5_000);
    await runCommand(app, 'openSettings');
    const settingsPage = await waitForPage(app, 'settings.html');
    await settingsPage.getByRole('button', { name: /Aparência|Appearance/ }).click();
    await settingsPage.locator('#animations').selectOption('off');
    await expect(characterPage.locator('html')).toHaveAttribute('data-motion', 'off');

    await runCommand(app, 'previewState:thinking');
    await expectState(characterPage, 'thinking');
    await characterPage.waitForTimeout(300);
    expect(await animationSummary(characterPage)).toEqual({ total: 0, infinite: 0 });

    // A pré-visualização dura 4 s e volta para idle sem intervenção.
    await expectState(characterPage, 'idle', 8_000);
    expect(await stateOf(characterPage)).toBe('idle');
  } finally {
    await app.close();
  }
});

test('"Dormir depois de" aparece nas Configurações e é salvo', async () => {
  const { app } = await launchClipster(userDataDir);
  try {
    await runCommand(app, 'openSettings');
    const settingsPage = await waitForPage(app, 'settings.html');
    const select = settingsPage.locator('#sleep-after');
    await expect(select).toHaveValue('10');
    await select.selectOption('0');
    await eventually(
      () => app.evaluate(() => globalThis.__clipsterTest?.settings().general.sleepAfterMinutes),
      (value) => value === 0
    );
  } finally {
    await app.close();
  }
});
