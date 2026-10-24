import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import type { Settings } from '../../src/shared/schemas/settings';

/**
 * Abre o app pela pasta do projeto (usa o `main` do package.json), como no uso real:
 * assim `app.getVersion()` e `app.getAppPath()` se comportam como no app empacotado.
 */
const PROJECT_ROOT = resolve(__dirname, '../..');

export interface LaunchedApp {
  app: ElectronApplication;
  characterPage: Page;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function sandboxArgs(): string[] {
  // Rodando como root (contêineres), o Chromium exige --no-sandbox. Só afeta os testes.
  return process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : [];
}

export function createUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'clipster-e2e-'));
}

export function removeUserDataDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export async function waitForPage(app: ElectronApplication, fileName: string): Promise<Page> {
  const existing = app.windows().find((page) => page.url().includes(fileName));
  if (existing !== undefined) return existing;
  return app.waitForEvent('window', { predicate: (page) => page.url().includes(fileName) });
}

export async function launchClipster(
  userDataDir: string,
  extraArgs: readonly string[] = []
): Promise<LaunchedApp> {
  const app = await electron.launch({
    args: [PROJECT_ROOT, ...sandboxArgs(), ...extraArgs],
    env: {
      ...process.env,
      CLIPSTER_E2E: '1',
      CLIPSTER_USER_DATA_DIR: userDataDir
    }
  });
  const characterPage = await waitForPage(app, 'character.html');
  await characterPage.waitForLoadState('domcontentloaded');
  return { app, characterPage };
}

// Os ganchos abaixo rodam dentro do main process via `app.evaluate`.
// Eles só existem quando o app é iniciado com CLIPSTER_E2E=1 (ver src/main/index.ts).

export function runCommand(app: ElectronApplication, command: string): Promise<void> {
  return app.evaluate((_electron, name) => {
    const testHooks = globalThis.__clipsterTest;
    if (testHooks === undefined) throw new Error('Ganchos de teste indisponíveis.');
    testHooks.run(name);
  }, command);
}

export function characterBounds(app: ElectronApplication): Promise<Bounds | null> {
  return app.evaluate(() => globalThis.__clipsterTest?.characterBounds() ?? null);
}

export function isCharacterVisible(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(() => globalThis.__clipsterTest?.isCharacterVisible() ?? false);
}

export function isAlwaysOnTop(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(() => globalThis.__clipsterTest?.isAlwaysOnTop() ?? false);
}

export function isSettingsWindowOpen(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(() => globalThis.__clipsterTest?.isSettingsWindowOpen() ?? false);
}

export function currentSettings(app: ElectronApplication): Promise<Settings | null> {
  return app.evaluate(() => globalThis.__clipsterTest?.settings() ?? null);
}

export async function eventually<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  timeoutMs = 10_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (accept(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(`Condição não atingida a tempo. Último valor: ${JSON.stringify(value)}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
}

/** Espera o processo do Electron terminar e devolve o código de saída. */
export function waitForExit(app: ElectronApplication, timeoutMs = 10_000): Promise<number | null> {
  const child = app.process();
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('O app não encerrou a tempo.'));
    }, timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolveExit(code);
    });
  });
}
