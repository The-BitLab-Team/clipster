import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import type { ConversationSnapshot } from '../../src/shared/ai/conversation';
import type { CharacterEvent } from '../../src/shared/character/stateMachine';
import type { CharacterView } from '../../src/shared/character/states';
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

export interface LaunchOptions {
  args?: readonly string[];
  env?: Readonly<Record<string, string>>;
  /**
   * Configurações gravadas antes de abrir (campos ausentes ficam no padrão). Sem isto, é a
   * primeira execução de verdade: o balão de boas-vindas aparece sozinho.
   */
  settings?: Readonly<Record<string, unknown>>;
}

/** Configurações de quem já passou pela primeira execução, em português. */
export const RETURNING_USER = {
  firstRunCompleted: true,
  general: { language: 'pt-BR' }
} as const;

export async function launchClipster(
  userDataDir: string,
  options: LaunchOptions = {}
): Promise<LaunchedApp> {
  if (options.settings !== undefined) {
    writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify(options.settings));
  }
  const app = await electron.launch({
    args: [PROJECT_ROOT, ...sandboxArgs(), ...(options.args ?? [])],
    env: {
      ...process.env,
      ...options.env,
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

export function characterView(app: ElectronApplication): Promise<CharacterView | null> {
  return app.evaluate(() => globalThis.__clipsterTest?.characterView() ?? null);
}

export function dispatchCharacterEvent(
  app: ElectronApplication,
  event: CharacterEvent
): Promise<void> {
  return app.evaluate((_electron, payload) => {
    globalThis.__clipsterTest?.dispatchCharacterEvent(payload);
  }, event);
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

// ── Balão e conversa (Fase 3) ──────────────────────────────────────────────

export function balloonPage(app: ElectronApplication): Promise<Page> {
  return waitForPage(app, 'balloon.html');
}

export function isBalloonVisible(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(() => globalThis.__clipsterTest?.isBalloonVisible() ?? false);
}

export function balloonBounds(app: ElectronApplication): Promise<Bounds | null> {
  return app.evaluate(() => globalThis.__clipsterTest?.balloonBounds() ?? null);
}

export function conversation(app: ElectronApplication): Promise<ConversationSnapshot | null> {
  return app.evaluate(() => globalThis.__clipsterTest?.conversation() ?? null);
}

export function readClipboard(app: ElectronApplication): Promise<string> {
  return app.evaluate(() => globalThis.__clipsterTest?.readClipboard() ?? Promise.resolve(''));
}

export function flushHistory(app: ElectronApplication): Promise<void> {
  return app.evaluate(() => globalThis.__clipsterTest?.flushHistory() ?? Promise.resolve());
}

/** Clique real no visor do personagem (abre/fecha o balão). */
export async function clickCharacter(characterPage: Page): Promise<void> {
  await characterPage.mouse.click(80, 110);
}

/** Abre o balão pelo personagem e devolve a página dele, já visível. */
export async function openBalloon(app: ElectronApplication, characterPage: Page): Promise<Page> {
  const page = await balloonPage(app);
  await page.getByTestId('balloon').waitFor();
  if (!(await isBalloonVisible(app))) await clickCharacter(characterPage);
  await eventually(
    () => isBalloonVisible(app),
    (visible) => visible
  );
  return page;
}

/** Envia uma pergunta pelo campo de texto e espera a resposta terminar. */
export async function ask(app: ElectronApplication, balloon: Page, text: string): Promise<void> {
  const before = (await conversation(app))?.messages.length ?? 0;
  await balloon.locator('#message').fill(text);
  await balloon.locator('#message').press('Enter');
  await eventually(
    () => conversation(app),
    (snapshot) =>
      snapshot !== null &&
      snapshot.messages.length >= before + 2 &&
      snapshot.activeRequestId === null,
    15_000
  );
}

/** Registra, na janela do personagem, cada pose que aparece (para conferir sequências). */
export async function recordStates(characterPage: Page): Promise<() => Promise<string[]>> {
  // `__states` é um global criado só por este teste, na página do personagem.
  await characterPage.evaluate(() => {
    const target = document.getElementById('character');
    const seen: string[] = [];
    (window as unknown as { __states: string[] }).__states = seen;
    if (target === null) return;
    new MutationObserver(() => {
      const state = target.dataset.state ?? '';
      if (seen.at(-1) !== state) seen.push(state);
    }).observe(target, { attributes: true, attributeFilter: ['data-state'] });
  });
  return () =>
    characterPage.evaluate(() => [...(window as unknown as { __states: string[] }).__states]);
}
