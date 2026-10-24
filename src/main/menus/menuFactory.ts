import { CHARACTER_STATES, type CharacterState } from '../../shared/character/states';
import type { PersonalityId } from '../../shared/schemas/settings';
import { createTranslator, type Locale } from '../../shared/i18n';

/**
 * Fábrica única dos menus da bandeja e de contexto (SPEC §11).
 * Produz uma descrição pura dos itens; a conversão para `Menu` do Electron
 * fica em `electronMenu.ts`. Assim os dois menus nunca divergem e podem ser testados.
 */

export type MenuCommand =
  | 'open'
  | 'talk'
  | 'setPersonality:helpful'
  | 'setPersonality:witty'
  | 'toggleAlwaysOnTop'
  | 'toggleQuietMode'
  | 'openSettings'
  | 'toggleVisibility'
  | 'hide'
  | 'quit'
  | `previewState:${CharacterState}`;

export const MENU_COMMANDS: readonly MenuCommand[] = [
  'open',
  'talk',
  'setPersonality:helpful',
  'setPersonality:witty',
  'toggleAlwaysOnTop',
  'toggleQuietMode',
  'openSettings',
  'toggleVisibility',
  'hide',
  'quit',
  ...CHARACTER_STATES.map((state): MenuCommand => `previewState:${state}`)
];

export type MenuItemSpec =
  | { kind: 'command'; id: string; label: string; command: MenuCommand; enabled: boolean }
  | { kind: 'checkbox'; id: string; label: string; command: MenuCommand; checked: boolean }
  | { kind: 'radio'; id: string; label: string; command: MenuCommand; checked: boolean }
  | { kind: 'submenu'; id: string; label: string; items: MenuItemSpec[] }
  | { kind: 'separator'; id: string };

export interface MenuState {
  locale: Locale;
  personality: PersonalityId;
  alwaysOnTop: boolean;
  quietMode: boolean;
  characterVisible: boolean;
  /** O balão de conversa só existe a partir da Fase 3. */
  chatAvailable: boolean;
  /** Ferramentas de desenvolvimento (pré-visualizar estados). Nunca no app instalado. */
  devTools: boolean;
}

function personalitySubmenu(state: MenuState): MenuItemSpec {
  const t = createTranslator(state.locale);
  return {
    kind: 'submenu',
    id: 'personality',
    label: t('menu.personality'),
    items: [
      {
        kind: 'radio',
        id: 'personality-helpful',
        label: t('personality.helpful.name'),
        command: 'setPersonality:helpful',
        checked: state.personality === 'helpful'
      },
      {
        kind: 'radio',
        id: 'personality-witty',
        label: t('personality.witty.name'),
        command: 'setPersonality:witty',
        checked: state.personality === 'witty'
      }
    ]
  };
}

function previewSubmenu(state: MenuState): MenuItemSpec {
  const t = createTranslator(state.locale);
  return {
    kind: 'submenu',
    id: 'preview-state',
    label: t('menu.previewState'),
    items: CHARACTER_STATES.map((characterState) => ({
      kind: 'command',
      id: `preview-${characterState}`,
      label: characterState,
      command: `previewState:${characterState}`,
      enabled: true
    }))
  };
}

function talkItem(state: MenuState): MenuItemSpec {
  const t = createTranslator(state.locale);
  return {
    kind: 'command',
    id: 'talk',
    label: state.chatAvailable ? t('menu.talk') : t('menu.talkSoon'),
    command: 'talk',
    enabled: state.chatAvailable
  };
}

export function buildTrayMenu(state: MenuState): MenuItemSpec[] {
  const t = createTranslator(state.locale);
  return [
    { kind: 'command', id: 'open', label: t('menu.open'), command: 'open', enabled: true },
    { kind: 'separator', id: 'sep-1' },
    personalitySubmenu(state),
    {
      kind: 'checkbox',
      id: 'always-on-top',
      label: t('menu.alwaysOnTop'),
      command: 'toggleAlwaysOnTop',
      checked: state.alwaysOnTop
    },
    {
      kind: 'checkbox',
      id: 'quiet-mode',
      label: t('menu.quietMode'),
      command: 'toggleQuietMode',
      checked: state.quietMode
    },
    { kind: 'separator', id: 'sep-2' },
    {
      kind: 'command',
      id: 'settings',
      label: t('menu.settings'),
      command: 'openSettings',
      enabled: true
    },
    {
      kind: 'command',
      id: 'visibility',
      label: state.characterVisible ? t('menu.hide') : t('menu.show'),
      command: 'toggleVisibility',
      enabled: true
    },
    { kind: 'separator', id: 'sep-3' },
    { kind: 'command', id: 'quit', label: t('menu.quit'), command: 'quit', enabled: true }
  ];
}

export function buildCharacterContextMenu(state: MenuState): MenuItemSpec[] {
  const t = createTranslator(state.locale);
  return [
    talkItem(state),
    { kind: 'separator', id: 'sep-1' },
    personalitySubmenu(state),
    {
      kind: 'checkbox',
      id: 'always-on-top',
      label: t('menu.alwaysOnTop'),
      command: 'toggleAlwaysOnTop',
      checked: state.alwaysOnTop
    },
    { kind: 'separator', id: 'sep-2' },
    {
      kind: 'command',
      id: 'settings',
      label: t('menu.settings'),
      command: 'openSettings',
      enabled: true
    },
    { kind: 'command', id: 'hide', label: t('menu.hideShort'), command: 'hide', enabled: true },
    ...(state.devTools
      ? [{ kind: 'separator', id: 'sep-dev' } as const, previewSubmenu(state)]
      : []),
    { kind: 'command', id: 'quit', label: t('menu.quit'), command: 'quit', enabled: true }
  ];
}
