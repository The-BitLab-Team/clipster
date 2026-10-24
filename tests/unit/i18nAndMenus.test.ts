import { describe, expect, it } from 'vitest';
import {
  buildCharacterContextMenu,
  buildTrayMenu,
  MENU_COMMANDS,
  type MenuItemSpec,
  type MenuState
} from '../../src/main/menus/menuFactory';
import {
  dictionaryKeys,
  localeFromLanguageTag,
  resolveLocale,
  translate
} from '../../src/shared/i18n';
import { resolveMotion } from '../../src/shared/ui/motion';

describe('i18n', () => {
  it('pt-BR e en têm exatamente as mesmas chaves', () => {
    expect(dictionaryKeys('en')).toEqual(dictionaryKeys('pt-BR'));
  });

  it('nenhuma tradução está vazia', () => {
    for (const locale of ['pt-BR', 'en'] as const) {
      for (const key of dictionaryKeys(locale)) {
        expect(translate(locale, key as Parameters<typeof translate>[1]).trim()).not.toBe('');
      }
    }
  });

  it('resolve o idioma do sistema: qualquer pt* vira pt-BR, o resto vira en', () => {
    expect(resolveLocale('system', ['pt-BR'])).toBe('pt-BR');
    expect(resolveLocale('system', ['pt-PT', 'en-US'])).toBe('pt-BR');
    expect(resolveLocale('system', ['es-ES'])).toBe('en');
    expect(resolveLocale('system', [])).toBe('en');
    expect(resolveLocale('en', ['pt-BR'])).toBe('en');
    expect(localeFromLanguageTag(' PT ')).toBe('pt-BR');
  });

  it('interpola variáveis e mantém marcadores desconhecidos', () => {
    expect(
      translate('pt-BR', 'settings.about.runtime', { electron: '45.0.0', chrome: '156' })
    ).toBe('Electron 45.0.0 · Chromium 156');
    expect(translate('en', 'settings.saveError', {})).toBe('Could not save: {message}');
  });
});

const baseState: MenuState = {
  locale: 'pt-BR',
  personality: 'helpful',
  alwaysOnTop: true,
  quietMode: false,
  characterVisible: true,
  chatAvailable: false
};

function flatten(items: readonly MenuItemSpec[]): MenuItemSpec[] {
  return items.flatMap((item) =>
    item.kind === 'submenu' ? [item, ...flatten(item.items)] : [item]
  );
}

function find(items: readonly MenuItemSpec[], id: string): MenuItemSpec | undefined {
  return flatten(items).find((item) => item.id === id);
}

describe('menus (SPEC §11)', () => {
  it('bandeja tem os itens da especificação, na ordem', () => {
    const labels = buildTrayMenu(baseState)
      .filter((item) => item.kind !== 'separator')
      .map((item) => ('label' in item ? item.label : ''));
    expect(labels).toEqual([
      'Abrir Clipster',
      'Personalidade',
      'Sempre visível',
      'Modo silencioso',
      'Configurações…',
      'Esconder Clipster',
      'Sair'
    ]);
  });

  it('reflete o estado atual (personalidade, checkboxes e visibilidade)', () => {
    const menu = buildTrayMenu({
      ...baseState,
      personality: 'witty',
      alwaysOnTop: false,
      characterVisible: false
    });
    expect(find(menu, 'personality-witty')).toMatchObject({ checked: true });
    expect(find(menu, 'personality-helpful')).toMatchObject({ checked: false });
    expect(find(menu, 'always-on-top')).toMatchObject({ checked: false });
    expect(find(menu, 'visibility')).toMatchObject({ label: 'Mostrar Clipster' });
  });

  it('menu de contexto tem "Conversar" desabilitado enquanto o chat não existe', () => {
    const menu = buildCharacterContextMenu(baseState);
    expect(find(menu, 'talk')).toMatchObject({
      enabled: false,
      label: 'Conversar com o Clipster (em breve)'
    });
    expect(
      find(buildCharacterContextMenu({ ...baseState, chatAvailable: true }), 'talk')
    ).toMatchObject({
      enabled: true
    });
  });

  it('traduz para inglês', () => {
    const menu = buildCharacterContextMenu({ ...baseState, locale: 'en' });
    expect(find(menu, 'quit')).toMatchObject({ label: 'Quit' });
    expect(find(menu, 'personality-witty')).toMatchObject({ label: 'Witty' });
  });

  it('todo comando usado nos menus é conhecido', () => {
    const commands = [
      ...flatten(buildTrayMenu(baseState)),
      ...flatten(buildCharacterContextMenu(baseState))
    ]
      .filter((item) => 'command' in item)
      .map((item) => ('command' in item ? item.command : ''));
    for (const command of commands) expect(MENU_COMMANDS).toContain(command);
  });
});

describe('resolveMotion', () => {
  it('segue o sistema quando a preferência é "system"', () => {
    expect(resolveMotion('system', true)).toBe('reduced');
    expect(resolveMotion('system', false)).toBe('full');
  });

  it('a escolha explícita do usuário vence o sistema', () => {
    expect(resolveMotion('full', true)).toBe('full');
    expect(resolveMotion('off', false)).toBe('off');
  });
});
