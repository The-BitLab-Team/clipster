import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startAnthropicMock, startOpenAiCompatibleMock } from '../support/mockProviders';
import {
  ask,
  conversation,
  createUserDataDir,
  currentSettings,
  eventually,
  launchClipster,
  openBalloon,
  recordStates,
  removeUserDataDir,
  RETURNING_USER,
  runCommand,
  waitForPage
} from './helpers';

/**
 * Fase 4 — IA real (SPEC §34). Sem acesso a modelos de verdade neste ambiente, os testes usam
 * servidores locais que seguem os protocolos documentados: um compatível com OpenAI (como
 * Ollama e LM Studio) e um da Anthropic. A conversa com os serviços reais fica no roteiro
 * manual (docs/qa-checklist.md).
 */

let userDataDir: string;

test.beforeEach(() => {
  userDataDir = createUserDataDir();
});

test.afterEach(() => {
  removeUserDataDir(userDataDir);
});

async function openAiSettings(app: Parameters<typeof runCommand>[0]): Promise<Page> {
  await runCommand(app, 'openSettings');
  const settingsPage = await waitForPage(app, 'settings.html');
  await settingsPage.getByRole('button', { name: 'IA', exact: true }).click();
  return settingsPage;
}

/** Sem cofre de senhas (Linux sem keyring), a tela pede confirmação antes de salvar a chave. */
async function saveKey(settingsPage: Page, provider: string, key: string): Promise<void> {
  const field = settingsPage.getByTestId(`key-${provider}`);
  await field.locator('input[type="password"]').fill(key);
  const confirm = field.getByLabel('Entendo o risco: salvar mesmo assim');
  if ((await confirm.count()) > 0) await confirm.check();
  await field.getByRole('button', { name: 'Salvar chave' }).click();
  await expect(field.getByRole('status')).toContainText(`•••• ${key.slice(-4)}`);
}

test('servidor local (como Ollama): configurar pela tela e conversar com streaming', async () => {
  const server = await startOpenAiCompatibleMock({ chunkDelayMs: 40 });
  const { app, characterPage } = await launchClipster(userDataDir, { settings: RETURNING_USER });
  try {
    const settingsPage = await openAiSettings(app);
    await settingsPage.locator('#ai-provider').selectOption('openai-compatible');
    await settingsPage.locator('#ai-base-url').fill(server.url);
    await settingsPage.locator('#ai-base-url').press('Enter');
    await expect(settingsPage.locator('#ai-model option', { hasText: 'llama3.2:3b' })).toHaveCount(
      1
    );
    await settingsPage.locator('#ai-model').selectOption('llama3.2:3b');
    await settingsPage.getByRole('button', { name: 'Testar conexão' }).click();
    await expect(settingsPage.getByTestId('connection-status')).toHaveText(
      'Conectado. Modelos disponíveis: 2.'
    );
    expect((await currentSettings(app))?.ai).toEqual({
      provider: 'openai-compatible',
      openaiCompatible: { baseUrl: server.url, model: 'llama3.2:3b' },
      anthropic: { model: '' }
    });

    const balloon = await openBalloon(app, characterPage);
    await expect(balloon.locator('.badge-demo')).toHaveCount(0);
    const states = await recordStates(characterPage);
    await ask(app, balloon, 'Como eu renomeio um arquivo?');
    await expect(balloon.getByTestId('message-clipster').last()).toHaveText(
      /Olá do servidor local! Modelo: llama3\.2:3b\./
    );
    const seen = await states();
    expect(seen.indexOf('talking')).toBeGreaterThan(seen.indexOf('thinking'));
    expect(seen.at(-1)).toBe('idle');

    // O que foi enviado: instruções do Clipster primeiro, sem chave (servidor local).
    const sent = server.requests.findLast((item) => item.path === '/v1/chat/completions');
    const messages = sent?.body?.messages as { role: string; content: string }[];
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('Você é o Clipster');
    expect(messages[0]?.content).toContain('Personalidade: Prestativo');
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Como eu renomeio um arquivo?' });
    expect(sent?.headers.authorization).toBeUndefined();
  } finally {
    await app.close();
    await server.close();
  }
});

test('Claude (servidor simulado): chave só de escrita, modelos da API e conversa', async () => {
  const KEY = 'sk-ant-e2e-teste-1234567890';
  const server = await startAnthropicMock({ chunkDelayMs: 20, apiKey: KEY });
  const { app, characterPage } = await launchClipster(userDataDir, {
    settings: { ...RETURNING_USER, ai: { provider: 'anthropic' } },
    env: { CLIPSTER_E2E_ANTHROPIC_BASE_URL: server.url }
  });
  try {
    const balloon = await openBalloon(app, characterPage);
    await expect(balloon.getByTestId('no-provider')).toHaveAttribute('data-issue', 'missingKey');

    const settingsPage = await openAiSettings(app);
    await saveKey(settingsPage, 'anthropic', KEY);
    // A chave nunca volta para a tela nem fica em texto puro no disco.
    expect(await settingsPage.content()).not.toContain(KEY);
    expect(readFileSync(join(userDataDir, 'secrets.json'), 'utf8')).not.toContain(KEY);
    expect(readFileSync(join(userDataDir, 'settings.json'), 'utf8')).not.toContain(KEY);

    const options = settingsPage.locator('#ai-model option');
    await expect(options.filter({ hasText: 'Claude Teste Rápido' })).toHaveCount(1);
    await expect(
      options.filter({ hasText: 'Claude Teste Antigo (vai ser desativado)' })
    ).toHaveCount(1);
    await expect(options.filter({ hasText: 'Aposentado' })).toHaveCount(0);
    await settingsPage.locator('#ai-model').selectOption('claude-teste-rapido');
    await expect(balloon.getByTestId('no-provider')).toHaveCount(0);

    await ask(app, balloon, 'Tudo bem?');
    await expect(balloon.getByTestId('message-clipster').last()).toHaveText(
      /Olá, aqui é o Claude simulado \(claude-teste-rapido\)\./
    );
    const sent = server.requests.findLast((item) => item.path === '/v1/messages');
    expect(sent?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(sent?.body).not.toHaveProperty('temperature');
    expect(sent?.body?.system).toEqual(expect.stringContaining('Você é o Clipster'));

    // Sem crédito: o erro oferece o painel da conta (SPEC §23).
    await ask(app, balloon, '[402]');
    const quota = balloon.getByTestId('error-card').last();
    await expect(quota).toHaveAttribute('data-code', 'QUOTA_OR_BILLING');
    await expect(quota.getByRole('button')).toHaveText([
      'Abrir o painel da conta',
      'Abrir Configurações'
    ]);

    // Remover a chave: o balão volta a avisar.
    await settingsPage
      .getByTestId('key-anthropic')
      .getByRole('button', { name: 'Remover chave' })
      .click();
    await expect(balloon.getByTestId('no-provider')).toHaveAttribute('data-issue', 'missingKey');
  } finally {
    await app.close();
    await server.close();
  }
});

test('erros reais do servidor mostram a mensagem da SPEC §23', async () => {
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
    const lastError = () => balloon.getByTestId('error-card').last();

    await ask(app, balloon, '[401]');
    await expect(lastError()).toHaveAttribute('data-code', 'AUTH_INVALID');
    await expect(lastError()).toContainText('A chave de API foi recusada');

    await ask(app, balloon, '[429]');
    await expect(lastError()).toHaveAttribute('data-code', 'RATE_LIMITED');
    await expect(lastError()).toContainText('Tente de novo em 2 s');

    await ask(app, balloon, '[429-quota]');
    await expect(lastError()).toHaveAttribute('data-code', 'QUOTA_OR_BILLING');
    // Servidor local não tem "painel da conta": só Configurações.
    await expect(lastError().getByRole('button')).toHaveText(['Abrir Configurações']);

    await ask(app, balloon, '[400-context]');
    await expect(lastError()).toHaveAttribute('data-code', 'CONTEXT_TOO_LONG');
    await expect(lastError().getByRole('button', { name: 'Nova conversa' })).toBeVisible();

    await ask(app, balloon, '[503]');
    await expect(lastError()).toHaveAttribute('data-code', 'PROVIDER_OVERLOADED');

    // Servidor desligado no meio do uso.
    await server.close();
    await ask(app, balloon, 'ainda está aí?');
    await expect(lastError()).toHaveAttribute('data-code', 'OFFLINE');
    await expect(lastError()).toContainText('Não consegui me conectar');
  } finally {
    await app.close();
    await server.close();
  }
});

test('tempo-limite e Parar com um servidor de verdade', async () => {
  const server = await startOpenAiCompatibleMock();
  const { app, characterPage } = await launchClipster(userDataDir, {
    settings: {
      ...RETURNING_USER,
      ai: {
        provider: 'openai-compatible',
        openaiCompatible: { baseUrl: server.url, model: 'llama3.2:3b' }
      }
    },
    env: { CLIPSTER_E2E_AI_TIMEOUTS: '1500,20000' }
  });
  try {
    const balloon = await openBalloon(app, characterPage);
    await ask(app, balloon, '[stall]');
    await expect(balloon.getByTestId('error-card').last()).toHaveAttribute('data-code', 'TIMEOUT');

    const input = balloon.locator('#message');
    await input.fill('[slow]');
    await input.press('Enter');
    await eventually(
      () => conversation(app),
      (snapshot) => (snapshot?.messages.at(-1)?.content.length ?? 0) > 0
    );
    await balloon.getByRole('button', { name: 'Parar' }).click();
    await expect(balloon.getByTestId('interrupted')).toBeVisible();
    expect((await conversation(app))?.messages.at(-1)?.status).toBe('interrupted');
  } finally {
    await app.close();
    await server.close();
  }
});

test('endereço errado: "Testar conexão" explica o que conferir', async () => {
  const server = await startOpenAiCompatibleMock();
  const { app } = await launchClipster(userDataDir, {
    settings: {
      ...RETURNING_USER,
      ai: {
        provider: 'openai-compatible',
        openaiCompatible: { baseUrl: server.url.replace('/v1', ''), model: '' }
      }
    }
  });
  try {
    const settingsPage = await openAiSettings(app);
    await settingsPage.getByRole('button', { name: 'Testar conexão' }).click();
    await expect(settingsPage.getByTestId('connection-status')).toContainText('termina em /v1');

    // Endereço inválido não é salvo.
    await settingsPage.locator('#ai-base-url').fill('ftp://servidor');
    await settingsPage.locator('#ai-base-url').press('Enter');
    await expect(settingsPage.locator('#ai-base-url-hint')).toContainText('http:// ou https://');
    expect((await currentSettings(app))?.ai.openaiCompatible.baseUrl).toBe(
      server.url.replace('/v1', '')
    );
  } finally {
    await app.close();
    await server.close();
  }
});

test('configurações da versão anterior (v1) são migradas sem perder o servidor e o modelo', async () => {
  const server = await startOpenAiCompatibleMock();
  const { app, characterPage } = await launchClipster(userDataDir, {
    settings: {
      schemaVersion: 1,
      firstRunCompleted: true,
      general: { language: 'pt-BR' },
      ai: { provider: 'openai-compatible', baseUrl: server.url, model: 'qwen2.5:7b' }
    }
  });
  try {
    expect((await currentSettings(app))?.ai.openaiCompatible).toEqual({
      baseUrl: server.url,
      model: 'qwen2.5:7b'
    });
    const balloon = await openBalloon(app, characterPage);
    await ask(app, balloon, 'oi');
    await expect(balloon.getByTestId('message-clipster').last()).toContainText('qwen2.5:7b');
  } finally {
    await app.close();
    await server.close();
  }
});
