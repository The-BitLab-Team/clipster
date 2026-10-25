import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startOpenAiCompatibleMock } from '../support/mockProviders';
import {
  ask,
  conversation,
  createUserDataDir,
  currentSettings,
  launchClipster,
  openBalloon,
  removeUserDataDir,
  RETURNING_USER,
  runCommand,
  waitForPage
} from './helpers';

/**
 * Fase 5 — ferramentas e permissões (SPEC §22, §34): o fluxo de permissão de ponta a ponta,
 * pelo balão e pelas Configurações. As ferramentas de teste só existem com
 * `CLIPSTER_DEV_TOOLS=1` (e nunca no app instalado).
 */

const DEMO_USER = { ...RETURNING_USER, ai: { provider: 'demo' } };
const DEV_TOOLS = { CLIPSTER_DEV_TOOLS: '1' };

let userDataDir: string;

test.beforeEach(() => {
  userDataDir = createUserDataDir();
});

test.afterEach(() => {
  removeUserDataDir(userDataDir);
});

/** Envia sem esperar a resposta terminar (ela vai parar no pedido de permissão). */
async function sendOnly(balloon: Page, text: string): Promise<void> {
  await balloon.locator('#message').fill(text);
  await balloon.locator('#message').press('Enter');
}

const lastReply = (balloon: Page) => balloon.getByTestId('message-clipster').last();
const lastTool = (balloon: Page) => lastReply(balloon).getByTestId('tool-activity').last();

function audits(): { tool: string; decision: string; success: boolean }[] {
  const log = readFileSync(join(userDataDir, 'logs', 'clipster.log'), 'utf8');
  return log
    .split('\n')
    .filter((line) => line.includes('"tool.audit"'))
    .map(
      (line) =>
        (JSON.parse(line) as { ctx: { tool: string; decision: string; success: boolean } }).ctx
    );
}

test('Demo: "que horas são?" passa pela ferramenta do relógio, sem pedir nada', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, { settings: DEMO_USER });
  try {
    const balloon = await openBalloon(app, characterPage);
    await ask(app, balloon, 'Que horas são?');
    await expect(lastTool(balloon)).toHaveAttribute('data-tool', 'getCurrentTime');
    await expect(lastTool(balloon)).toHaveAttribute('data-status', 'done');
    await expect(lastTool(balloon)).toHaveText(/Consultou o relógio/);
    await expect(lastReply(balloon)).toContainText(/Agora são \d{2}:\d{2}/);
    await expect(balloon.getByTestId('permission-request')).toHaveCount(0);
    expect(audits()).toEqual([
      expect.objectContaining({ tool: 'getCurrentTime', decision: 'not_required', success: true })
    ]);
  } finally {
    await app.close();
  }
});

test('ação destrutiva: texto da ferramenta, foco em Cancelar, só "uma vez", personagem avisando', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, {
    settings: DEMO_USER,
    env: DEV_TOOLS
  });
  try {
    const balloon = await openBalloon(app, characterPage);
    await sendOnly(balloon, '/simular ferramenta apagar relatorio-final.docx');

    const card = balloon.getByTestId('permission-request');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-risk', 'destructive');
    await expect(card.getByTestId('permission-action')).toHaveText(
      'Apagar o arquivo “relatorio-final.docx”. (Ferramenta de teste: nada é apagado de verdade.)'
    );
    await expect(card).toContainText('Não dá para desfazer.');
    await expect(card).toContainText('Precisa de: alterar ou apagar arquivos.');
    await expect(card.getByRole('button')).toHaveText(['Cancelar', 'Permitir uma vez']);
    await expect(card.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await expect(characterPage.locator('#character')).toHaveAttribute('data-state', 'notification');

    await card.getByRole('button', { name: 'Cancelar' }).click();
    await expect(card).toHaveCount(0);
    await expect(lastTool(balloon)).toHaveAttribute('data-status', 'denied');
    await expect(lastReply(balloon)).toContainText('Tudo bem, não fiz nada.');
    await expect(characterPage.locator('#character')).toHaveAttribute('data-state', 'idle');

    await sendOnly(balloon, '/simular ferramenta apagar relatorio-final.docx');
    await balloon.getByRole('button', { name: 'Permitir uma vez' }).click();
    await expect(lastTool(balloon)).toHaveAttribute('data-status', 'done');
    await expect(lastReply(balloon)).toContainText('“relatorio-final.docx” continua no lugar');

    // Nada guardado; auditoria sem os argumentos.
    expect((await currentSettings(app))?.permissions.grants).toEqual([]);
    expect(audits().map((item) => [item.tool, item.decision, item.success])).toEqual([
      ['demoDestructiveAction', 'denied', false],
      ['demoDestructiveAction', 'granted_once', true]
    ]);
    expect(readFileSync(join(userDataDir, 'logs', 'clipster.log'), 'utf8')).not.toContain(
      'relatorio-final'
    );
  } finally {
    await app.close();
  }
});

test('leitura: "Sempre" vale nas próximas vezes, aparece em Privacidade e pode ser revogada', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, {
    settings: DEMO_USER,
    env: DEV_TOOLS
  });
  try {
    const balloon = await openBalloon(app, characterPage);
    await sendOnly(balloon, '/simular ferramenta ler Fotos');
    const card = balloon.getByTestId('permission-request');
    await expect(card.getByRole('button')).toHaveText([
      'Cancelar',
      'Permitir uma vez',
      'Nesta sessão',
      'Sempre'
    ]);
    await card.getByRole('button', { name: 'Sempre' }).click();
    await expect(lastReply(balloon)).toContainText('notas.txt');
    expect((await currentSettings(app))?.permissions.grants).toEqual([
      expect.objectContaining({ tool: 'demoReadAction', permissions: ['filesystem.read'] })
    ]);

    // Da próxima vez, não pergunta.
    await ask(app, balloon, '/simular ferramenta ler Música');
    await expect(lastReply(balloon)).toContainText('“Música”');
    await expect(card).toHaveCount(0);

    // Privacidade › Permissões lista e revoga.
    await runCommand(app, 'openSettings');
    const settingsPage = await waitForPage(app, 'settings.html');
    await settingsPage.getByRole('button', { name: 'Privacidade', exact: true }).click();
    const list = settingsPage.getByTestId('permissions-list');
    await expect(list).toContainText('Ferramenta de teste: ver arquivos');
    await expect(list).toContainText('ler arquivos · Sempre');
    await list.getByRole('button', { name: 'Revogar' }).click();
    await expect(settingsPage.getByTestId('permissions-empty')).toBeVisible();
    expect((await currentSettings(app))?.permissions.grants).toEqual([]);

    // Revogada: pergunta de novo. Esc recusa.
    await sendOnly(balloon, '/simular ferramenta ler Fotos');
    await expect(card).toBeVisible();
    await balloon.keyboard.press('Escape');
    await expect(lastTool(balloon)).toHaveAttribute('data-status', 'denied');

    // "Nesta sessão" aparece na lista enquanto o app estiver aberto, e também pode ser revogada.
    await sendOnly(balloon, '/simular ferramenta ler Fotos');
    await card.getByRole('button', { name: 'Nesta sessão' }).click();
    await expect(lastTool(balloon)).toHaveAttribute('data-status', 'done');
    await expect(list).toContainText('Até fechar o Clipster');
    expect((await currentSettings(app))?.permissions.grants).toEqual([]);
  } finally {
    await app.close();
  }
});

test('sem resposta ao pedido = cancelado; Parar também cancela', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, {
    settings: DEMO_USER,
    env: { ...DEV_TOOLS, CLIPSTER_E2E_PERMISSION_TIMEOUT_MS: '1500' }
  });
  try {
    const balloon = await openBalloon(app, characterPage);
    await sendOnly(balloon, '/simular ferramenta apagar a.txt');
    await expect(balloon.getByTestId('permission-request')).toBeVisible();
    await expect(lastReply(balloon)).toContainText('Fiquei sem resposta', { timeout: 10_000 });
    await expect(lastTool(balloon)).toHaveAttribute('data-status', 'denied');

    await sendOnly(balloon, '/simular ferramenta apagar b.txt');
    await expect(balloon.getByTestId('permission-request')).toBeVisible();
    await balloon.getByRole('button', { name: 'Parar' }).click();
    await expect(balloon.getByTestId('permission-request')).toHaveCount(0);
    await expect(lastReply(balloon)).toHaveAttribute('data-status', 'interrupted');
    await expect(lastTool(balloon)).toHaveAttribute('data-status', 'denied');
    await expect(characterPage.locator('#character')).toHaveAttribute('data-state', 'idle');
    expect(audits().map((item) => item.decision)).toEqual(['timeout', 'cancelled']);
  } finally {
    await app.close();
  }
});

test('sem CLIPSTER_DEV_TOOLS, as ferramentas de teste não existem', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, { settings: DEMO_USER });
  try {
    const balloon = await openBalloon(app, characterPage);
    await ask(app, balloon, '/simular ferramenta apagar x.txt');
    await expect(lastTool(balloon)).toHaveAttribute('data-tool', 'unknown');
    await expect(lastTool(balloon)).toHaveText(/Ferramenta desconhecida: não deu certo/);
    await expect(lastReply(balloon)).toContainText('CLIPSTER_DEV_TOOLS=1');
    await expect(balloon.getByTestId('permission-request')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('servidor compatível com OpenAI: chamada de ferramenta de verdade pelo protocolo', async () => {
  const server = await startOpenAiCompatibleMock();
  const { app, characterPage } = await launchClipster(userDataDir, {
    settings: {
      ...RETURNING_USER,
      ai: {
        provider: 'openai-compatible',
        openaiCompatible: { baseUrl: server.url, model: 'llama3.2:3b' }
      }
    }
  });
  try {
    const balloon = await openBalloon(app, characterPage);
    await ask(app, balloon, 'que horas são? [tool:getCurrentTime]');
    await expect(lastTool(balloon)).toHaveAttribute('data-status', 'done');
    await expect(lastReply(balloon)).toContainText('Resultado: {"iso"');
    const offered = server.requests.find((item) => item.path === '/v1/chat/completions')?.body
      ?.tools as { function: { name: string } }[];
    expect(offered.map((tool) => tool.function.name)).toEqual([
      'getCurrentTime',
      'getClipsterVersion'
    ]);
    expect((await conversation(app))?.messages.at(-1)?.tools).toEqual([
      { id: 'call_mock1', tool: 'getCurrentTime', status: 'done' }
    ]);
  } finally {
    await app.close();
    await server.close();
  }
});
