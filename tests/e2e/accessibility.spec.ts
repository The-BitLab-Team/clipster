import axe from 'axe-core';
import { expect, test, type Page } from '@playwright/test';
import {
  createUserDataDir,
  launchClipster,
  openBalloon,
  removeUserDataDir,
  runCommand,
  waitForPage
} from './helpers';

/**
 * Acessibilidade (SPEC §14, Fase 6): auditoria automática com o axe-core (WCAG 2.0/2.1/2.2
 * nível A e AA, mais as boas práticas) em cada tela e estado importante, nos dois temas, e
 * uso só pelo teclado com foco visível. Leitor de tela e alto contraste de verdade ficam no
 * roteiro manual (docs/qa-checklist.md).
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

interface Violation {
  id: string;
  help: string;
  targets: string[];
}

/** Roda o axe dentro da página (o injetor do @axe-core/playwright abre abas, o Electron não deixa). */
async function audit(page: Page): Promise<Violation[]> {
  await page.evaluate(axe.source);
  return page.evaluate(async (tags) => {
    const runner = (window as unknown as { axe: typeof axe }).axe;
    const result = await runner.run(document, {
      runOnly: { type: 'tag', values: tags },
      resultTypes: ['violations']
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(' '))
    }));
  }, TAGS);
}

async function expectAccessible(page: Page, label: string): Promise<void> {
  expect(await audit(page), label).toEqual([]);
}

/** O elemento focado tem um indicador visível (contorno ou sombra). */
function focusIndicator(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || element === document.body) return null;
    const ring = (target: Element | null): boolean => {
      if (target === null) return false;
      const style = getComputedStyle(target);
      return (
        (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
        style.boxShadow !== 'none'
      );
    };
    const svg = element.querySelector('svg');
    // O indicador pode estar no próprio elemento ou na caixa que o envolve (campo de texto).
    const visible =
      ring(element) ||
      ring(element.parentElement) ||
      (svg !== null && getComputedStyle(svg).filter !== 'none');
    const name = element.getAttribute('aria-label') ?? element.textContent.trim();
    return { name: name.slice(0, 40), tag: element.tagName.toLowerCase(), visible };
  });
}

let userDataDir: string;

test.beforeEach(() => {
  userDataDir = createUserDataDir();
});

test.afterEach(() => {
  removeUserDataDir(userDataDir);
});

for (const theme of ['light', 'dark'] as const) {
  test(`auditoria automática do personagem, do balão e das Configurações (tema ${theme})`, async () => {
    const { app, characterPage } = await launchClipster(userDataDir, {
      settings: { general: { language: 'pt-BR' }, appearance: { theme } },
      env: { CLIPSTER_DEV_TOOLS: '1' }
    });
    try {
      await expectAccessible(characterPage, 'personagem');

      // Primeira execução: o balão abre sozinho no onboarding.
      const balloon = await waitForPage(app, 'balloon.html');
      await balloon.locator('.onboarding').waitFor();
      await expectAccessible(balloon, 'onboarding');
      await balloon.getByRole('button', { name: 'Pular' }).click();
      await runCommand(app, 'openSettings');
      const settings = await waitForPage(app, 'settings.html');

      // Sem IA: o balão explica e oferece as saídas.
      await openBalloon(app, characterPage);
      await expect(balloon.getByTestId('no-provider')).toBeVisible();
      await expectAccessible(balloon, 'balão sem IA');

      await balloon.getByRole('button', { name: 'Usar modo demonstração' }).click();
      await expectAccessible(balloon, 'balão vazio');

      for (const text of ['/simular markdown', '/simular erro 429', 'Que horas são?']) {
        await balloon.locator('#message').fill(text);
        await balloon.locator('#message').press('Enter');
        await expect(balloon.getByRole('button', { name: 'Enviar' })).toBeVisible();
      }
      await expectAccessible(balloon, 'conversa: Markdown, erro e ferramenta');

      await balloon.locator('#message').fill('/simular ferramenta ler Fotos');
      await balloon.locator('#message').press('Enter');
      await balloon.getByTestId('permission-request').waitFor();
      await expectAccessible(balloon, 'pedido de permissão');
      await balloon.getByRole('button', { name: 'Sempre' }).click();

      for (const section of ['Geral', 'IA', 'Personalidade', 'Aparência', 'Privacidade', 'Sobre']) {
        await settings.getByRole('button', { name: section, exact: true }).click();
        if (section === 'IA')
          await settings.locator('#ai-provider').selectOption('openai-compatible');
        if (section === 'Privacidade') await settings.getByTestId('permissions-list').waitFor();
        await expectAccessible(settings, `Configurações › ${section}`);
      }
    } finally {
      await app.close();
    }
  });
}

test('teclado: o balão e as Configurações funcionam sem mouse, sempre com foco visível', async () => {
  const { app, characterPage } = await launchClipster(userDataDir, {
    settings: { firstRunCompleted: true, general: { language: 'pt-BR' }, ai: { provider: 'demo' } }
  });
  try {
    const balloon = await openBalloon(app, characterPage);
    await expect(balloon.locator('#message')).toBeFocused();

    // Do campo de texto para trás: todos os controles do cabeçalho, com foco visível.
    const stops: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      await balloon.keyboard.press('Shift+Tab');
      const focused = await focusIndicator(balloon);
      if (focused === null) break;
      expect(focused.visible, `foco visível em ${focused.name}`).toBe(true);
      stops.push(focused.name);
    }
    // "Nova conversa" fica desabilitado com a conversa vazia; no grupo de personalidade, só
    // a opção marcada recebe Tab (as setas trocam).
    expect(stops).toEqual(expect.arrayContaining(['Fechar', 'Prestativo', 'Mensagens']));

    // Personalidade pelas setas; pergunta e resposta só com o teclado.
    await balloon.getByRole('radio', { name: 'Prestativo' }).focus();
    await balloon.keyboard.press('ArrowRight');
    await expect(balloon.getByRole('radio', { name: 'Espirituoso' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await balloon.locator('#message').focus();
    await balloon.keyboard.type('Que horas são?');
    await balloon.keyboard.press('Enter');
    await expect(balloon.getByTestId('message-clipster').last()).toContainText('São');

    // Configurações: navegação por Tab, com foco visível em cada parada.
    await runCommand(app, 'openSettings');
    const settings = await waitForPage(app, 'settings.html');
    await settings.getByRole('button', { name: 'Geral', exact: true }).focus();
    for (let index = 0; index < 12; index += 1) {
      await settings.keyboard.press('Tab');
      const focused = await focusIndicator(settings);
      if (focused === null) continue;
      expect(focused.visible, `foco visível em ${focused.name}`).toBe(true);
    }
    await settings.getByRole('button', { name: 'Aparência', exact: true }).focus();
    await settings.keyboard.press('Enter');
    await expect(settings.getByRole('heading', { name: 'Aparência' })).toBeVisible();
  } finally {
    await app.close();
  }
});
