import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  ask,
  balloonBounds,
  balloonPage,
  characterBounds,
  characterView,
  clickCharacter,
  conversation,
  createUserDataDir,
  currentSettings,
  eventually,
  flushHistory,
  isBalloonVisible,
  isCharacterVisible,
  isSettingsWindowOpen,
  launchClipster,
  openBalloon,
  readClipboard,
  recordStates,
  removeUserDataDir,
  RETURNING_USER,
  runCommand,
  waitForExit,
  waitForPage
} from './helpers';

/**
 * Fase 3 — conversa (SPEC §34): balão, Demo com streaming, Parar, personalidades, Markdown
 * seguro, histórico opcional e primeira execução. O primeiro teste é o cenário do MVP (§37).
 */

let userDataDir: string;

test.beforeEach(() => {
  userDataDir = createUserDataDir();
});

test.afterEach(() => {
  removeUserDataDir(userDataDir);
});

const DEMO_USER = { ...RETURNING_USER, ai: { provider: 'demo' } } as const;

test('cenário do MVP (SPEC §37) com o modo demonstração', async () => {
  // 1–2. Primeira execução: o personagem aparece e o balão de boas-vindas surge sozinho,
  // sem tirar o foco de quem estava sendo usado.
  const first = await launchClipster(userDataDir, {
    settings: { general: { language: 'pt-BR' } },
    env: { CLIPSTER_E2E_DEMO_DELAY_MS: '25' }
  });
  let savedPosition: { x: number; y: number };
  try {
    const { app, characterPage } = first;
    const balloon = await balloonPage(app);
    await eventually(
      () => isBalloonVisible(app),
      (visible) => visible
    );
    expect(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.webContents.getURL() ?? null
      )
    ).toBeNull();
    await expect(balloon.getByRole('heading', { name: 'Oi! Eu sou o Clipster.' })).toBeVisible();

    // 3. Arrastar o personagem: o balão vai junto.
    const balloonBefore = await balloonBounds(app);
    await characterPage.mouse.move(80, 110);
    await characterPage.mouse.down();
    await characterPage.mouse.move(70, 100, { steps: 4 });
    await characterPage.mouse.move(-60, -40, { steps: 8 });
    await characterPage.mouse.up();
    const balloonAfter = await eventually(
      () => balloonBounds(app),
      (bounds) => bounds !== null && bounds.x !== balloonBefore?.x
    );
    const characterAfter = await characterBounds(app);
    if (characterAfter === null || balloonAfter === null) throw new Error('sem bounds');
    // Encostado no personagem: acima dele ou, sem espaço, abaixo (com o rabicho invertido).
    const above = balloonAfter.y + balloonAfter.height <= characterAfter.y + 1;
    const below = balloonAfter.y >= characterAfter.y + characterAfter.height - 1;
    expect(above || below).toBe(true);
    await expect(balloon.getByTestId('balloon')).toHaveAttribute(
      'data-vertical',
      above ? 'above' : 'below'
    );

    // 4. Clicar no personagem fecha e abre o balão.
    await clickCharacter(characterPage);
    await eventually(
      () => isBalloonVisible(app),
      (visible) => !visible
    );
    await clickCharacter(characterPage);
    await eventually(
      () => isBalloonVisible(app),
      (visible) => visible
    );

    // 5. Onboarding: aceita o modo demonstração.
    await balloon.getByRole('button', { name: 'Continuar' }).click();
    await expect(balloon.getByRole('heading', { name: /Como você prefere/ })).toBeVisible();
    await balloon.getByRole('button', { name: 'Continuar' }).click();
    await balloon.getByRole('button', { name: 'Experimentar no modo demonstração' }).click();
    await eventually(
      () => currentSettings(app),
      (settings) => settings?.firstRunCompleted === true && settings.ai.provider === 'demo'
    );
    await expect(balloon.locator('.badge-demo')).toBeVisible();

    // 6–7. Pergunta: pensando → falando → à disposição, com a resposta para o sistema certo.
    const states = await recordStates(characterPage);
    await ask(app, balloon, 'Como eu renomeio um arquivo?');
    const seen = await states();
    const thinking = seen.indexOf('thinking');
    const talking = seen.indexOf('talking');
    expect(thinking).toBeGreaterThanOrEqual(0);
    expect(talking).toBeGreaterThan(thinking);
    expect(seen.at(-1)).toBe('idle');
    const firstAnswer = balloon.getByTestId('message-clipster').last();
    await expect(firstAnswer).toContainText(process.platform === 'darwin' ? 'Return' : 'F2');
    await expect(firstAnswer).toContainText('Renomear');

    // 8. Prestativo → Espirituoso, pelo seletor do balão.
    await balloon.getByRole('radio', { name: 'Espirituoso' }).click();
    await expect(balloon.getByText('Modo Espirituoso ativado. Prometo moderação.')).toBeVisible();

    // 9–10. Resposta continua útil, agora no tom novo.
    await ask(app, balloon, 'Como faço uma captura de tela?');
    const secondAnswer = balloon.getByTestId('message-clipster').last();
    await expect(secondAnswer).toContainText('provas documentais');
    await expect(secondAnswer.locator('ol > li')).toHaveCount(3);

    // 11. Fechar o balão: o Clipster continua no desktop.
    await balloon.getByRole('button', { name: 'Fechar' }).click();
    await eventually(
      () => isBalloonVisible(app),
      (visible) => !visible
    );
    expect(await isCharacterVisible(app)).toBe(true);

    // 12. Pela bandeja: personalidade, Configurações, esconder e sair.
    await runCommand(app, 'setPersonality:helpful');
    await runCommand(app, 'openSettings');
    expect(await isSettingsWindowOpen(app)).toBe(true);
    await runCommand(app, 'hide');
    await eventually(
      () => isCharacterVisible(app),
      (visible) => !visible
    );
    expect((await currentSettings(app))?.hideTipShown).toBe(true);
    const position = await characterBounds(app);
    if (position === null) throw new Error('sem posição');
    savedPosition = { x: position.x, y: position.y };
    const exit = waitForExit(app);
    await runCommand(app, 'quit').catch(() => undefined);
    expect(await exit).toBe(0);
  } finally {
    await first.app.close().catch(() => undefined);
  }

  // 13. Ao abrir de novo, preferências e posição permanecem; sem histórico, a conversa recomeça.
  const second = await launchClipster(userDataDir);
  try {
    const settings = await currentSettings(second.app);
    expect(settings).toMatchObject({
      personality: 'helpful',
      firstRunCompleted: true,
      ai: { provider: 'demo' },
      privacy: { saveHistory: false }
    });
    const restored = await eventually(
      () => characterBounds(second.app),
      (bounds) => bounds !== null
    );
    expect(restored).toMatchObject(savedPosition);
    expect((await conversation(second.app))?.messages).toEqual([]);
    expect(existsSync(join(userDataDir, 'history.json'))).toBe(false);
    // Fora da primeira execução, o balão não aparece sozinho.
    await second.characterPage.waitForTimeout(2_000);
    expect(await isBalloonVisible(second.app)).toBe(false);
  } finally {
    await second.app.close();
  }
});

test('Parar interrompe a resposta, que fica marcada; Esc para e depois fecha', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, {
    settings: DEMO_USER,
    env: { CLIPSTER_E2E_DEMO_DELAY_MS: '60' }
  });
  try {
    const balloon = await openBalloon(app, characterPage);
    const input = balloon.locator('#message');
    await input.fill('Como eu renomeio um arquivo?');
    await input.press('Enter');
    await eventually(
      () => characterView(app),
      (view) => view?.state === 'talking'
    );
    await expect(balloon.getByRole('button', { name: 'Enviar' })).toHaveCount(0);
    await balloon.getByRole('button', { name: 'Parar' }).click();

    await expect(balloon.getByTestId('interrupted')).toBeVisible();
    const snapshot = await conversation(app);
    const reply = snapshot?.messages.at(-1);
    expect(reply?.status).toBe('interrupted');
    expect(reply?.content.length).toBeGreaterThan(0);
    await eventually(
      () => characterView(app),
      (view) => view?.state === 'idle'
    );

    // Esc durante a geração para; com nada gerando, fecha o balão.
    await input.fill('Como faço uma captura de tela?');
    await input.press('Enter');
    await eventually(
      () => conversation(app),
      (current) => current?.activeRequestId !== null
    );
    await balloon.keyboard.press('Escape');
    await eventually(
      () => conversation(app),
      (current) => current?.activeRequestId === null
    );
    expect((await conversation(app))?.messages.at(-1)?.status).toBe('interrupted');
    await balloon.keyboard.press('Escape');
    await eventually(
      () => isBalloonVisible(app),
      (visible) => !visible
    );
  } finally {
    await app.close();
  }
});

test('erros simulados: mensagem clara, código, ação e personagem em "problema"', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, { settings: DEMO_USER });
  try {
    const balloon = await openBalloon(app, characterPage);

    await ask(app, balloon, '/simular erro 429');
    const rateLimited = balloon.getByTestId('error-card').last();
    await expect(rateLimited).toHaveAttribute('data-code', 'RATE_LIMITED');
    await expect(rateLimited).toContainText('Tente de novo em 20 s');
    await expect(rateLimited).toContainText(/Código: CLP-[0-9A-F]{4}/);
    await expect(rateLimited.getByRole('button', { name: /Tentar de novo em/ })).toBeDisabled();
    expect((await characterView(app))?.state).toBe('error');

    await ask(app, balloon, '/simular erro 401');
    const auth = balloon.getByTestId('error-card').last();
    await expect(auth).toContainText('A chave de API foi recusada');
    await auth.getByRole('button', { name: 'Abrir Configurações' }).click();
    const settingsPage = await waitForPage(app, 'settings.html');
    await expect(settingsPage.getByRole('heading', { level: 1 })).toHaveText('IA');

    // Queda no meio: o texto parcial fica, com o erro logo abaixo.
    await ask(app, balloon, '/simular queda');
    const dropped = balloon.getByTestId('message-clipster').last();
    await expect(dropped).toContainText('Começando a responder');
    await expect(dropped.getByTestId('error-card')).toHaveAttribute('data-code', 'OFFLINE');

    // Tentar de novo refaz a pergunta sem duplicar a mensagem do usuário.
    const before = await conversation(app);
    const failedId = before?.messages.at(-1)?.id;
    await dropped.getByRole('button', { name: 'Tentar de novo' }).click();
    const after = await eventually(
      () => conversation(app),
      (current) => current?.activeRequestId === null && current.messages.at(-1)?.id !== failedId
    );
    expect(after?.messages.length).toBe(before?.messages.length);
    expect(after?.messages.filter((m) => m.content === '/simular queda')).toHaveLength(1);

    // Nova conversa limpa o balão e volta a saudação.
    await balloon.getByRole('button', { name: 'Nova conversa' }).click();
    await expect(balloon.getByTestId('message-clipster')).toHaveCount(0);
    expect((await conversation(app))?.messages).toEqual([]);
    await expect(balloon.getByRole('button', { name: 'Que horas são?' })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('sem IA configurada: o balão explica e oferece o modo demonstração', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, { settings: RETURNING_USER });
  try {
    const balloon = await openBalloon(app, characterPage);
    await expect(balloon.getByTestId('no-provider')).toContainText('Nenhuma IA configurada');
    await expect(balloon.locator('#message')).toHaveCount(0);
    await balloon.getByRole('button', { name: 'Usar modo demonstração' }).click();
    await expect(balloon.locator('#message')).toBeVisible();
    await expect(balloon.locator('.badge-demo')).toBeVisible();

    // Sugestão de pergunta do modo Demo.
    await balloon.getByRole('button', { name: 'Que horas são?' }).click();
    await expect(balloon.getByTestId('message-clipster').last()).toContainText(/\d{1,2}:\d{2}/);
  } finally {
    await app.close();
  }
});

test('Markdown seguro: sem imagens remotas, sem HTML, links validados; Copiar funciona', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, { settings: DEMO_USER });
  try {
    const balloon = await openBalloon(app, characterPage);
    await ask(app, balloon, '/simular markdown');
    const answer = balloon.getByTestId('message-clipster').last();

    await expect(answer.locator('img')).toHaveCount(0);
    await expect(answer.locator('b, script')).toHaveCount(0);
    await expect(answer).toContainText('[imagem: logo remoto]');
    await expect(answer.getByRole('link', { name: 'link seguro' })).toHaveAttribute(
      'title',
      'Abre example.com no navegador'
    );
    await expect(answer.getByRole('link', { name: 'link perigoso' })).toHaveCount(0);
    await expect(answer.getByRole('cell', { name: 'Renomear' })).toBeVisible();
    expect(
      await balloon.evaluate(() => document.querySelectorAll('[onclick], [onerror]').length)
    ).toBe(0);

    await answer.getByRole('button', { name: 'Copiar código' }).click();
    await eventually(
      () => readClipboard(app),
      (text) => text === "console.log('oi');"
    );

    await ask(app, balloon, 'Quem é você?');
    const identity = balloon.getByTestId('message-clipster').last();
    await identity.getByRole('button', { name: 'Copiar', exact: true }).click();
    await eventually(
      () => readClipboard(app),
      (text) => text.startsWith('Eu sou o Clipster') && text.includes('**modo demonstração**')
    );
  } finally {
    await app.close();
  }
});

test('histórico ligado: a conversa volta ao reabrir; "Limpar histórico" apaga tudo', async () => {
  const settings = { ...DEMO_USER, privacy: { saveHistory: true, historyRetentionDays: 30 } };
  const first = await launchClipster(userDataDir, { settings });
  try {
    const balloon = await openBalloon(first.app, first.characterPage);
    await ask(first.app, balloon, 'Quem é você?');
    await flushHistory(first.app);
  } finally {
    await first.app.close();
  }
  const historyFile = join(userDataDir, 'history.json');
  expect(readFileSync(historyFile, 'utf8')).toContain('Quem é você?');

  const second = await launchClipster(userDataDir);
  try {
    const balloon = await openBalloon(second.app, second.characterPage);
    await expect(balloon.getByTestId('message-user')).toContainText('Quem é você?');

    await runCommand(second.app, 'openSettings');
    const settingsPage = await waitForPage(second.app, 'settings.html');
    await settingsPage.getByRole('button', { name: 'Privacidade' }).click();
    await settingsPage.getByRole('button', { name: 'Limpar histórico' }).click();
    // Ação destrutiva: o foco começa em Cancelar.
    await expect(settingsPage.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await settingsPage.getByRole('button', { name: 'Apagar histórico' }).click();
    await expect(settingsPage.getByText('Histórico apagado.')).toBeVisible();

    expect(existsSync(historyFile)).toBe(false);
    expect((await conversation(second.app))?.messages).toEqual([]);
    await expect(balloon.getByTestId('message-user')).toHaveCount(0);
  } finally {
    await second.app.close();
  }
});

test('desligar o histórico pergunta se apaga o que já foi salvo', async () => {
  const settings = { ...DEMO_USER, privacy: { saveHistory: true, historyRetentionDays: 30 } };
  const { app, characterPage } = await launchClipster(userDataDir, { settings });
  try {
    const balloon = await openBalloon(app, characterPage);
    await ask(app, balloon, 'oi');
    await flushHistory(app);
    expect(existsSync(join(userDataDir, 'history.json'))).toBe(true);

    await runCommand(app, 'openSettings');
    const settingsPage = await waitForPage(app, 'settings.html');
    await settingsPage.getByRole('button', { name: 'Privacidade' }).click();
    await settingsPage.locator('#save-history').uncheck();
    await expect(settingsPage.getByText('Quer apagar também o que já foi salvo?')).toBeVisible();
    await settingsPage.getByRole('button', { name: 'Apagar', exact: true }).click();
    await eventually(
      () => Promise.resolve(existsSync(join(userDataDir, 'history.json'))),
      (exists) => !exists
    );
    expect((await currentSettings(app))?.privacy.saveHistory).toBe(false);
  } finally {
    await app.close();
  }
});

test('tamanho do chat nas Configurações muda a largura do balão', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, { settings: DEMO_USER });
  try {
    await openBalloon(app, characterPage);
    expect((await balloonBounds(app))?.width).toBe(360);
    await runCommand(app, 'openSettings');
    const settingsPage = await waitForPage(app, 'settings.html');
    await settingsPage.getByRole('button', { name: 'Aparência' }).click();
    await settingsPage.locator('#chat-scale').fill('1.3');
    await eventually(
      () => balloonBounds(app),
      (bounds) => bounds?.width === Math.round(340 * 1.3) + 20
    );
  } finally {
    await app.close();
  }
});

test('privacidade: conversar no modo Demo não faz nenhuma requisição de rede', async () => {
  const netLog = join(userDataDir, 'net-log.json');
  const { app, characterPage } = await launchClipster(userDataDir, {
    settings: DEMO_USER,
    args: [`--log-net-log=${netLog}`]
  });
  try {
    const balloon = await openBalloon(app, characterPage);
    await ask(app, balloon, 'Como eu renomeio um arquivo?');
    await ask(app, balloon, '/simular markdown');
    await balloon.waitForTimeout(1_000);
  } finally {
    await app.close();
  }
  const urls = [...readFileSync(netLog, 'utf8').matchAll(/"url":"([^"]+)"/g)].map(
    (match) => match[1] ?? ''
  );
  expect(urls.filter((url) => /^(https?|wss?):/.test(url))).toEqual([]);
});

test('menor privilégio: o balão não fala pelo personagem e vice-versa', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, { settings: DEMO_USER });
  try {
    const balloon = await openBalloon(app, characterPage);
    const fromCharacter = await characterPage.evaluate(() => window.clipster.chat.send('oi'));
    expect(fromCharacter).toMatchObject({ ok: false, error: { code: 'FORBIDDEN_SENDER' } });
    const fromBalloon = await balloon.evaluate(() => window.clipster.character.getView());
    expect(fromBalloon).toMatchObject({ ok: false, error: { code: 'FORBIDDEN_SENDER' } });
    const clear = await balloon.evaluate(() => window.clipster.chat.clearHistory());
    expect(clear).toMatchObject({ ok: false, error: { code: 'FORBIDDEN_SENDER' } });
  } finally {
    await app.close();
  }
});
