import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  characterBounds,
  createUserDataDir,
  currentSettings,
  eventually,
  isAlwaysOnTop,
  isCharacterVisible,
  isSettingsWindowOpen,
  launchClipster,
  removeUserDataDir,
  runCommand,
  waitForExit,
  waitForPage
} from './helpers';

/**
 * Fase 1 — shell do desktop (SPEC §34). Cobre: app inicia, personagem aparece,
 * Configurações abrem e persistem, comandos da bandeja, arrasto + restauração de posição
 * e encerramento limpo.
 */

let userDataDir: string;

test.beforeEach(() => {
  userDataDir = createUserDataDir();
});

test.afterEach(() => {
  removeUserDataDir(userDataDir);
});

test('o app inicia e o personagem aparece no estado idle', async () => {
  const { app, characterPage } = await launchClipster(userDataDir);
  try {
    const character = characterPage.getByTestId('character');
    await expect(character).toHaveAttribute('data-state', 'idle');
    await expect(character.locator('svg [data-hit]')).toBeVisible();
    await expect(character).toHaveAttribute('aria-label', /Clipster/);

    await eventually(
      () => isCharacterVisible(app),
      (visible) => visible
    );
    expect(await isAlwaysOnTop(app)).toBe(true);

    const bounds = await characterBounds(app);
    expect(bounds).toMatchObject({ width: 160, height: 160 });

    const info = await characterPage.evaluate(() => window.clipster.app.info());
    expect(info.ok && info.data.version).toBe('0.5.0');
  } finally {
    await app.close();
  }
});

test('a janela do personagem não tem Node e expõe só a API do Clipster', async () => {
  const { app, characterPage } = await launchClipster(userDataDir);
  try {
    const globals = await characterPage.evaluate(() => ({
      hasRequire: typeof (globalThis as { require?: unknown }).require !== 'undefined',
      hasProcess: typeof (globalThis as { process?: unknown }).process !== 'undefined',
      apiKeys: Object.keys(window.clipster).sort()
    }));
    expect(globals.hasRequire).toBe(false);
    expect(globals.hasProcess).toBe(false);
    expect(globals.apiKeys).toEqual([
      'ai',
      'app',
      'balloon',
      'character',
      'chat',
      'clipboard',
      'diagnostics',
      'log',
      'onboarding',
      'permissions',
      'settings',
      'shell',
      'windows'
    ]);

    // A janela do personagem não tem permissão para alterar configurações (menor privilégio).
    const result = await characterPage.evaluate(() =>
      window.clipster.settings.update({ personality: 'witty' })
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN_SENDER', message: 'Origem não autorizada.' }
    });
  } finally {
    await app.close();
  }
});

test('Configurações abrem, alteram e persistem preferências', async () => {
  const { app } = await launchClipster(userDataDir);
  try {
    await runCommand(app, 'openSettings');
    const settingsPage = await waitForPage(app, 'settings.html');
    await expect(settingsPage.getByRole('heading', { level: 1 })).toHaveText(/Geral|General/);

    const alwaysOnTop = settingsPage.locator('#always-on-top');
    await expect(alwaysOnTop).toBeChecked();
    await alwaysOnTop.uncheck();
    await eventually(
      () => isAlwaysOnTop(app),
      (value) => !value
    );

    await settingsPage.getByRole('button', { name: /Personalidade|Personality/ }).click();
    await settingsPage.getByRole('radio', { name: /Espirituoso|Witty/ }).check();
    await eventually(
      () => currentSettings(app),
      (settings) => settings?.personality === 'witty'
    );

    // Iniciar com o sistema fica desabilitado fora do app instalado.
    await settingsPage.getByRole('button', { name: /Geral|General/ }).click();
    await expect(settingsPage.locator('#launch-at-login')).toBeDisabled();

    expect(await isSettingsWindowOpen(app)).toBe(true);
  } finally {
    await app.close();
  }

  const saved = JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')) as {
    personality: string;
    general: { alwaysOnTop: boolean };
  };
  expect(saved.personality).toBe('witty');
  expect(saved.general.alwaysOnTop).toBe(false);
});

test('comandos da bandeja: personalidade, esconder e mostrar', async () => {
  const { app } = await launchClipster(userDataDir);
  try {
    await eventually(
      () => isCharacterVisible(app),
      (visible) => visible
    );

    await runCommand(app, 'setPersonality:witty');
    expect((await currentSettings(app))?.personality).toBe('witty');

    await runCommand(app, 'hide');
    await eventually(
      () => isCharacterVisible(app),
      (visible) => !visible
    );

    await runCommand(app, 'toggleVisibility');
    await eventually(
      () => isCharacterVisible(app),
      (visible) => visible
    );

    await runCommand(app, 'toggleAlwaysOnTop');
    await eventually(
      () => isAlwaysOnTop(app),
      (value) => !value
    );
  } finally {
    await app.close();
  }
});

test('arrastar move o personagem e a posição é restaurada ao reabrir', async () => {
  const first = await launchClipster(userDataDir);
  let moved: { x: number; y: number };
  try {
    await eventually(
      () => isCharacterVisible(first.app),
      (visible) => visible
    );
    const before = await characterBounds(first.app);
    expect(before).not.toBeNull();

    // Arrasto sintético a partir do centro do visor (área clicável da silhueta).
    const page = first.characterPage;
    await page.mouse.move(80, 110);
    await page.mouse.down();
    await page.mouse.move(70, 100, { steps: 4 });
    await page.mouse.move(40, 70, { steps: 8 });
    await page.mouse.up();

    const after = await eventually(
      () => characterBounds(first.app),
      (bounds) =>
        bounds !== null && before !== null && (bounds.x !== before.x || bounds.y !== before.y)
    );
    if (after === null) throw new Error('Sem bounds após o arrasto.');
    moved = { x: after.x, y: after.y };
    expect(after.width).toBe(160);
    expect(after.height).toBe(160);
  } finally {
    await first.app.close();
  }

  const second = await launchClipster(userDataDir);
  try {
    const restored = await eventually(
      () => characterBounds(second.app),
      (bounds) => bounds !== null
    );
    expect(restored).toMatchObject(moved);
  } finally {
    await second.app.close();
  }
});

test('privacidade: o app não faz nenhuma requisição de rede ao iniciar e abrir Configurações', async () => {
  const netLog = join(userDataDir, 'net-log.json');
  const { app } = await launchClipster(userDataDir, {
    args: [`--log-net-log=${netLog}`]
  });
  try {
    await eventually(
      () => isCharacterVisible(app),
      (visible) => visible
    );
    await runCommand(app, 'openSettings');
    const settingsPage = await waitForPage(app, 'settings.html');
    await expect(settingsPage.getByRole('heading', { level: 1 })).toBeVisible();
    await settingsPage.waitForTimeout(2_000);
  } finally {
    await app.close();
  }
  const urls = [...readFileSync(netLog, 'utf8').matchAll(/"url":"([^"]+)"/g)].map(
    (match) => match[1] ?? ''
  );
  // O conteúdo vem do protocolo app:// (não passa pela rede). Qualquer URL http(s) seria um vazamento.
  expect(urls.filter((url) => /^(https?|wss?):/.test(url))).toEqual([]);
});

test('"Sair" encerra o processo corretamente', async () => {
  const { app } = await launchClipster(userDataDir);
  await eventually(
    () => isCharacterVisible(app),
    (visible) => visible
  );
  const exit = waitForExit(app);
  await runCommand(app, 'quit').catch(() => undefined);
  expect(await exit).toBe(0);
});
