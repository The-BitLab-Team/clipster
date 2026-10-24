import type { ptBR } from './pt-BR';

/** O `satisfies` garante, em tempo de compilação, as mesmas chaves do pt-BR. */
export const en = {
  'app.name': 'Clipster',

  'character.label': 'Clipster ({state}): click to talk, drag to move',
  'character.state.idle': 'ready',
  'character.state.listening': 'listening',
  'character.state.thinking': 'thinking',
  'character.state.talking': 'talking',
  'character.state.happy': 'happy',
  'character.state.confused': 'confused',
  'character.state.sleeping': 'sleeping',
  'character.state.error': 'having a problem',
  'character.state.notification': 'has a notice',
  'character.state.dragging': 'being moved',

  'menu.open': 'Open Clipster',
  'menu.talk': 'Talk to Clipster',
  'menu.talkSoon': 'Talk to Clipster (coming soon)',
  'menu.personality': 'Personality',
  'menu.alwaysOnTop': 'Always on Top',
  'menu.quietMode': 'Quiet Mode',
  'menu.settings': 'Settings…',
  'menu.hide': 'Hide Clipster',
  'menu.show': 'Show Clipster',
  'menu.hideShort': 'Hide',
  'menu.quit': 'Quit',
  'menu.previewState': 'Preview state (dev)',
  'tray.tooltip': 'Clipster',

  'personality.helpful.name': 'Helpful',
  'personality.helpful.description': 'Polite, friendly and to the point.',
  'personality.helpful.sample': '“Sure! Here are the steps.”',
  'personality.witty.name': 'Witty',
  'personality.witty.description': 'Just as useful, with dry humor and light sarcasm.',
  'personality.witty.sample': '“Done. That was easier than it looked, admit it.”',

  'settings.title': 'Clipster — Settings',
  'settings.nav.label': 'Settings categories',
  'settings.section.general': 'General',
  'settings.section.ai': 'AI',
  'settings.section.personality': 'Personality',
  'settings.section.appearance': 'Appearance',
  'settings.section.privacy': 'Privacy',
  'settings.section.about': 'About',
  'settings.loading': 'Loading…',
  'settings.loadError': 'Could not load settings.',
  'settings.saveError': 'Could not save: {message}',

  'settings.general.language': 'Language',
  'settings.general.language.system': 'Follow the system',
  'settings.general.language.pt-BR': 'Português (Brasil)',
  'settings.general.language.en': 'English',
  'settings.general.launchAtLogin': 'Launch Clipster when I sign in',
  'settings.general.launchAtLogin.unsupported':
    'Available in the installed app on Windows and macOS.',
  'settings.general.startHidden': 'Start hidden (tray only)',
  'settings.general.alwaysOnTop': 'Keep Clipster above other windows',
  'settings.general.quietMode': 'Quiet Mode',
  'settings.general.quietMode.hint': 'Suppresses non-critical notices.',
  'settings.general.sleepAfter': 'Sleep after being idle',
  'settings.general.sleepAfter.hint': 'Clipster naps when nobody interacts with it.',
  'settings.general.sleepAfter.5': '5 minutes',
  'settings.general.sleepAfter.10': '10 minutes',
  'settings.general.sleepAfter.30': '30 minutes',
  'settings.general.sleepAfter.0': 'Never',

  'settings.ai.placeholder':
    'Connecting to an AI is coming in a future version. For now, nothing leaves your computer.',

  'settings.personality.hint':
    'Personality changes the tone of the answers, not what Clipster can do.',

  'settings.appearance.characterScale': 'Character size',
  'settings.appearance.animations': 'Animations',
  'settings.appearance.animations.system': 'Follow the system',
  'settings.appearance.animations.full': 'Full',
  'settings.appearance.animations.reduced': 'Reduced',
  'settings.appearance.animations.off': 'Off',
  'settings.appearance.theme': 'Theme',
  'settings.appearance.theme.system': 'Follow the system',
  'settings.appearance.theme.light': 'Light',
  'settings.appearance.theme.dark': 'Dark',

  'settings.privacy.summary':
    'Clipster does not watch your screen, keyboard, clipboard, files or other apps.',
  'settings.privacy.local': 'Settings and position are stored only on this computer.',
  'settings.privacy.noTelemetry': 'No telemetry: nothing is sent out.',

  'settings.about.version': 'Version',
  'settings.about.runtime': 'Electron {electron} · Chromium {chrome}',
  'settings.about.license': 'License',
  'settings.about.licenseValue': 'To be decided',
  'settings.about.repository': 'Repository',
  'settings.about.openLogs': 'Open logs folder',
  'settings.about.disclaimer': 'Not affiliated with Microsoft.'
} satisfies Record<keyof typeof ptBR, string>;
