/** Dicionário de referência. Toda chave nova começa aqui (SPEC §4). */
export const ptBR = {
  'app.name': 'Clipster',

  'character.label': 'Clipster: clique para conversar, arraste para mover',

  'menu.open': 'Abrir Clipster',
  'menu.talk': 'Conversar com o Clipster',
  'menu.talkSoon': 'Conversar com o Clipster (em breve)',
  'menu.personality': 'Personalidade',
  'menu.alwaysOnTop': 'Sempre visível',
  'menu.quietMode': 'Modo silencioso',
  'menu.settings': 'Configurações…',
  'menu.hide': 'Esconder Clipster',
  'menu.show': 'Mostrar Clipster',
  'menu.hideShort': 'Esconder',
  'menu.quit': 'Sair',
  'tray.tooltip': 'Clipster',

  'personality.helpful.name': 'Prestativo',
  'personality.helpful.description': 'Educado, amigável e objetivo.',
  'personality.helpful.sample': '“Claro! Aqui estão os passos.”',
  'personality.witty.name': 'Espirituoso',
  'personality.witty.description': 'Igualmente útil, com humor seco e sarcasmo leve.',
  'personality.witty.sample': '“Pronto. Foi mais fácil do que parecia, admita.”',

  'settings.title': 'Clipster — Configurações',
  'settings.nav.label': 'Categorias de configuração',
  'settings.section.general': 'Geral',
  'settings.section.ai': 'IA',
  'settings.section.personality': 'Personalidade',
  'settings.section.appearance': 'Aparência',
  'settings.section.privacy': 'Privacidade',
  'settings.section.about': 'Sobre',
  'settings.loading': 'Carregando…',
  'settings.loadError': 'Não foi possível carregar as configurações.',
  'settings.saveError': 'Não foi possível salvar: {message}',

  'settings.general.language': 'Idioma',
  'settings.general.language.system': 'Seguir o sistema',
  'settings.general.language.pt-BR': 'Português (Brasil)',
  'settings.general.language.en': 'English',
  'settings.general.launchAtLogin': 'Iniciar com o sistema',
  'settings.general.launchAtLogin.unsupported':
    'Disponível no app instalado, no Windows e no macOS.',
  'settings.general.startHidden': 'Iniciar escondido (só na bandeja)',
  'settings.general.alwaysOnTop': 'Manter o Clipster sobre as outras janelas',
  'settings.general.quietMode': 'Modo silencioso',
  'settings.general.quietMode.hint': 'Suprime avisos que não sejam críticos.',

  'settings.ai.placeholder':
    'A conexão com uma IA chega em uma próxima versão. Por enquanto, nada sai do seu computador.',

  'settings.personality.hint':
    'A personalidade muda o tom das respostas, não o que o Clipster sabe fazer.',

  'settings.appearance.characterScale': 'Tamanho do personagem',
  'settings.appearance.animations': 'Animações',
  'settings.appearance.animations.system': 'Seguir o sistema',
  'settings.appearance.animations.full': 'Completas',
  'settings.appearance.animations.reduced': 'Reduzidas',
  'settings.appearance.animations.off': 'Desligadas',
  'settings.appearance.theme': 'Tema',
  'settings.appearance.theme.system': 'Seguir o sistema',
  'settings.appearance.theme.light': 'Claro',
  'settings.appearance.theme.dark': 'Escuro',

  'settings.privacy.summary':
    'O Clipster não observa sua tela, teclado, área de transferência, arquivos ou outros programas.',
  'settings.privacy.local': 'Configurações e posição ficam guardadas só neste computador.',
  'settings.privacy.noTelemetry': 'Sem telemetria: nada é enviado para fora.',

  'settings.about.version': 'Versão',
  'settings.about.runtime': 'Electron {electron} · Chromium {chrome}',
  'settings.about.license': 'Licença',
  'settings.about.licenseValue': 'A definir',
  'settings.about.repository': 'Repositório',
  'settings.about.openLogs': 'Abrir pasta de logs',
  'settings.about.disclaimer': 'Não afiliado à Microsoft.'
} as const;
