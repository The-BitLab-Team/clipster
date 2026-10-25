import type { Locale } from '../../../../shared/i18n';
import { getPersonality } from '../../../../shared/personalities';
import type { PersonalityId } from '../../../../shared/schemas/settings';

/**
 * Repertório do modo Demo (SPEC §20.3, Apêndice B): respostas por palavra-chave, por
 * personalidade, por idioma e por sistema operacional. Não é IA e não finge ser.
 */

export type OsFamily = 'windows' | 'macos' | 'linux';

export interface DemoContext {
  lang: Locale;
  os: OsFamily;
  osName: string;
  personality: PersonalityId;
  now: Date;
  timeZone: string;
}

type ByOs<T> = Readonly<Record<OsFamily, T>>;
type ByLang<T> = Readonly<Record<Locale, T>>;

export type TopicId =
  'rename' | 'screenshot' | 'copyPaste' | 'time' | 'identity' | 'capabilities' | 'greeting';

interface Topic {
  id: TopicId;
  /** Palavras ou expressões, já sem acento. `*` no fim = prefixo (renome* → renomeio, renomear). */
  keywords: ByLang<readonly string[]>;
  answer: (context: DemoContext) => string;
}

export function osFamily(platform: NodeJS.Platform): OsFamily {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}

/** Minúsculas, sem acentos e sem pontuação, com espaços nas pontas para casar palavras inteiras. */
export function normalize(text: string): string {
  const plain = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}/]+/gu, ' ')
    .trim();
  return ` ${plain} `;
}

function matches(normalized: string, keyword: string): boolean {
  if (keyword.endsWith('*')) return normalized.includes(` ${keyword.slice(0, -1)}`);
  return normalized.includes(` ${keyword} `);
}

const STOPWORDS: ByLang<readonly string[]> = {
  'pt-BR': [
    'como',
    'eu',
    'um',
    'uma',
    'o',
    'os',
    'as',
    'de',
    'do',
    'da',
    'que',
    'voce',
    'faco',
    'tiro',
    'para',
    'no',
    'na',
    'meu',
    'minha',
    'isso',
    'qual',
    'sao',
    'tem',
    'posso',
    'pode',
    'horas',
    'oi',
    'ola',
    'obrigado',
    'nao',
    'com',
    'arquivo',
    'tela',
    'quem',
    'faz',
    'fazer'
  ],
  en: [
    'how',
    'do',
    'i',
    'an',
    'the',
    'to',
    'of',
    'what',
    'is',
    'are',
    'you',
    'my',
    'can',
    'in',
    'on',
    'it',
    'this',
    'that',
    'who',
    'file',
    'screen',
    'please',
    'thanks',
    'hi',
    'hello',
    'time',
    'take',
    'does'
  ]
};

/** Idioma da mensagem por palavras comuns; empate fica com o idioma da interface. */
export function detectLanguage(text: string, fallback: Locale): Locale {
  const words = normalize(text).trim().split(' ');
  const score = (lang: Locale): number =>
    words.filter((word) => STOPWORDS[lang].includes(word)).length;
  const pt = score('pt-BR');
  const en = score('en');
  if (pt === en) return fallback;
  return pt > en ? 'pt-BR' : 'en';
}

// ───────────────────────────── respostas ─────────────────────────────

function compose(steps: string, outro: string): string {
  return `${steps}\n\n${outro}`;
}

const RENAME_STEPS: ByLang<ByOs<string>> = {
  'pt-BR': {
    windows:
      '1. Abra o Explorador de Arquivos e selecione o arquivo.\n2. Pressione **F2** (ou clique com o botão direito › **Renomear**).\n3. Digite o novo nome e pressione **Enter**.',
    macos:
      '1. No Finder, selecione o arquivo.\n2. Pressione **Return** (ou clique com o botão direito › **Renomear**).\n3. Digite o novo nome e pressione **Return** de novo.',
    linux:
      '1. No gerenciador de arquivos (Arquivos, Dolphin…), selecione o arquivo.\n2. Pressione **F2** (ou clique com o botão direito › **Renomear**).\n3. Digite o novo nome e pressione **Enter**.\n\nNo terminal: `mv nome-antigo.txt nome-novo.txt`.'
  },
  en: {
    windows:
      '1. Open File Explorer and select the file.\n2. Press **F2** (or right-click › **Rename**).\n3. Type the new name and press **Enter**.',
    macos:
      '1. In Finder, select the file.\n2. Press **Return** (or right-click › **Rename**).\n3. Type the new name and press **Return** again.',
    linux:
      '1. In your file manager (Files, Dolphin…), select the file.\n2. Press **F2** (or right-click › **Rename**).\n3. Type the new name and press **Enter**.\n\nIn a terminal: `mv old-name.txt new-name.txt`.'
  }
};

const SCREENSHOT_STEPS: ByLang<ByOs<{ steps: string; tip: string }>> = {
  'pt-BR': {
    windows: {
      steps:
        '1. Pressione **Windows + Shift + S**.\n2. Escolha a área: retângulo, janela, tela inteira ou forma livre.\n3. A imagem vai para a área de transferência: cole com **Ctrl + V**, ou clique na notificação para editar e salvar.',
      tip: 'Dica: **Windows + Print Screen** salva a tela inteira direto em **Imagens › Capturas de Tela**.'
    },
    macos: {
      steps:
        '1. **Command + Shift + 3**: tela inteira.\n2. **Command + Shift + 4**: arraste para escolher uma área (aperte **Espaço** em seguida para capturar uma janela).\n3. **Command + Shift + 5**: painel com mais opções, inclusive gravar a tela.',
      tip: 'Dica: por padrão, as capturas vão para a Mesa (a área de trabalho).'
    },
    linux: {
      steps:
        '1. Pressione **Print Screen**. No GNOME abre a ferramenta de captura; no KDE, o Spectacle.\n2. Escolha área, janela ou tela inteira.\n3. Salve o arquivo ou copie a imagem.',
      tip: 'Dica: o atalho exato pode variar conforme o ambiente gráfico.'
    }
  },
  en: {
    windows: {
      steps:
        '1. Press **Windows + Shift + S**.\n2. Pick the area: rectangle, window, full screen or freeform.\n3. The image goes to the clipboard: paste it with **Ctrl + V**, or click the notification to edit and save it.',
      tip: 'Tip: **Windows + Print Screen** saves the whole screen straight to **Pictures › Screenshots**.'
    },
    macos: {
      steps:
        '1. **Command + Shift + 3**: whole screen.\n2. **Command + Shift + 4**: drag to select an area (press **Space** next to capture a window).\n3. **Command + Shift + 5**: a panel with more options, including screen recording.',
      tip: 'Tip: screenshots land on the Desktop by default.'
    },
    linux: {
      steps:
        '1. Press **Print Screen**. On GNOME it opens the screenshot tool; on KDE, Spectacle.\n2. Choose an area, a window or the whole screen.\n3. Save the file or copy the image.',
      tip: 'Tip: the exact shortcut may vary with your desktop environment.'
    }
  }
};

const COPY_STEPS: ByLang<ByOs<{ steps: string; tip: string }>> = {
  'pt-BR': {
    windows: {
      steps:
        '1. Selecione o texto ou o arquivo.\n2. **Ctrl + C** copia (ou **Ctrl + X** recorta).\n3. Vá até o destino e pressione **Ctrl + V**.',
      tip: 'Dica: **Windows + V** mostra o histórico da área de transferência (na primeira vez, o Windows pede para ativá-lo).'
    },
    macos: {
      steps:
        '1. Selecione o texto ou o arquivo.\n2. **Command + C** copia (ou **Command + X** recorta texto).\n3. Vá até o destino e pressione **Command + V**.',
      tip: 'Dica: no Finder, para *mover* um arquivo, copie com **Command + C** e cole com **Option + Command + V**.'
    },
    linux: {
      steps:
        '1. Selecione o texto ou o arquivo.\n2. **Ctrl + C** copia (ou **Ctrl + X** recorta).\n3. Vá até o destino e pressione **Ctrl + V**.',
      tip: 'Dica: no terminal, use **Ctrl + Shift + C** e **Ctrl + Shift + V**.'
    }
  },
  en: {
    windows: {
      steps:
        '1. Select the text or file.\n2. **Ctrl + C** copies (or **Ctrl + X** cuts).\n3. Go to the destination and press **Ctrl + V**.',
      tip: 'Tip: **Windows + V** shows your clipboard history (Windows asks you to turn it on the first time).'
    },
    macos: {
      steps:
        '1. Select the text or file.\n2. **Command + C** copies (or **Command + X** cuts text).\n3. Go to the destination and press **Command + V**.',
      tip: 'Tip: in Finder, to *move* a file, copy it with **Command + C** and paste with **Option + Command + V**.'
    },
    linux: {
      steps:
        '1. Select the text or file.\n2. **Ctrl + C** copies (or **Ctrl + X** cuts).\n3. Go to the destination and press **Ctrl + V**.',
      tip: 'Tip: in a terminal, use **Ctrl + Shift + C** and **Ctrl + Shift + V**.'
    }
  }
};

function byTone(context: DemoContext, texts: Readonly<Record<PersonalityId, ByLang<string>>>) {
  return texts[context.personality][context.lang];
}

function formatClock(context: DemoContext): { time: string; date: string } {
  const time = new Intl.DateTimeFormat(context.lang, {
    timeStyle: 'short',
    timeZone: context.timeZone
  }).format(context.now);
  const date = new Intl.DateTimeFormat(context.lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: context.timeZone
  }).format(context.now);
  return { time, date };
}

const TOPICS: readonly Topic[] = [
  {
    id: 'rename',
    keywords: {
      'pt-BR': ['renome*', 'mudar o nome', 'trocar o nome', 'alterar o nome', 'mudo o nome'],
      en: ['rename*', 'change the name', 'change a file name', 'change file name']
    },
    answer: (context) => {
      const outro = byTone(context, {
        helpful: {
          'pt-BR':
            'Dica: cuidado para não apagar a extensão (como `.docx` ou `.jpg`), que define o programa que abre o arquivo.',
          en: 'Tip: be careful not to delete the extension (like `.docx` or `.jpg`); it tells the system which app opens the file.'
        },
        witty: {
          'pt-BR': `Pronto: identidade nova, sem precisar ir ao cartório. Só não mexa na extensão (\`.docx\`, \`.jpg\`), senão o ${context.osName} finge que não conhece o arquivo.`,
          en: `Done: a brand-new identity, no paperwork required. Just leave the extension (\`.docx\`, \`.jpg\`) alone, or ${context.osName} will pretend it has never met the file.`
        }
      });
      return compose(RENAME_STEPS[context.lang][context.os], outro);
    }
  },
  {
    id: 'screenshot',
    keywords: {
      'pt-BR': [
        'captura de tela',
        'capturar a tela',
        'capturo a tela',
        'print',
        'printar',
        'print da tela',
        'printscreen'
      ],
      en: ['screenshot*', 'screen shot', 'screen capture', 'capture the screen', 'print screen']
    },
    answer: (context) => {
      const { steps, tip } = SCREENSHOT_STEPS[context.lang][context.os];
      const outro =
        context.personality === 'witty'
          ? context.lang === 'pt-BR'
            ? 'Pronto: provas documentais garantidas. Use com sabedoria.'
            : 'Done: documentary evidence secured. Use it wisely.'
          : tip;
      return compose(steps, outro);
    }
  },
  {
    id: 'copyPaste',
    keywords: {
      'pt-BR': ['copi*', 'colar', 'recort*', 'ctrl c'],
      en: ['copy*', 'paste*', 'cut and paste']
    },
    answer: (context) => {
      const { steps, tip } = COPY_STEPS[context.lang][context.os];
      const outro =
        context.personality === 'witty'
          ? context.lang === 'pt-BR'
            ? `${tip}\n\nO atalho mais usado da história da computação. Com razão.`
            : `${tip}\n\nThe most used shortcut in computing history. For good reason.`
          : tip;
      return compose(steps, outro);
    }
  },
  {
    id: 'time',
    keywords: {
      'pt-BR': ['que horas', 'que hora', 'horas sao', 'hora agora', 'horario agora'],
      en: ['what time', 'the time', 'time is it', 'current time']
    },
    answer: (context) => {
      const { time, date } = formatClock(context);
      const zone = context.timeZone;
      return byTone(context, {
        helpful: {
          'pt-BR': `Agora são **${time}** de ${date} (${zone}).`,
          en: `It's **${time}** on ${date} (${zone}).`
        },
        witty: {
          'pt-BR': `São **${time}** de ${date} (${zone}). Não que eu esteja contando.`,
          en: `It's **${time}** on ${date} (${zone}). Not that I'm counting.`
        }
      });
    }
  },
  {
    id: 'identity',
    keywords: {
      'pt-BR': [
        'quem e voce',
        'quem voce e',
        'quem e o clipster',
        'o que e voce',
        'qual seu nome',
        'qual o seu nome',
        'como voce se chama'
      ],
      en: ['who are you', 'what are you', 'your name', 'who is clipster']
    },
    answer: (context) =>
      byTone(context, {
        helpful: {
          'pt-BR':
            'Eu sou o Clipster, um pequeno assistente que mora na sua área de trabalho.\n\nAgora estou no **modo demonstração**: respondo só a algumas perguntas de exemplo, como renomear um arquivo ou fazer uma captura de tela. Para conversar de verdade, configure uma IA em **Configurações › IA**.',
          en: "I'm Clipster, a small assistant that lives on your desktop.\n\nRight now I'm in **demo mode**: I only answer a few sample questions, like renaming a file or taking a screenshot. To have a real conversation, set up an AI in **Settings › AI**."
        },
        witty: {
          'pt-BR':
            'Sou o Clipster: um prendedor de papel com ambições.\n\nNo **modo demonstração**, meu repertório é curto e ensaiado: renomear arquivos, captura de tela, copiar e colar, e as horas. Configure uma IA em **Configurações › IA** e a conversa melhora bastante.',
          en: "I'm Clipster: a binder clip with ambitions.\n\nIn **demo mode**, my repertoire is short and rehearsed: renaming files, screenshots, copy and paste, and the time. Set up an AI in **Settings › AI** and the conversation gets a lot better."
        }
      })
  },
  {
    id: 'capabilities',
    keywords: {
      'pt-BR': ['o que voce faz', 'o que voce sabe', 'o que voce pode', 'ajuda', 'socorro'],
      en: ['what can you do', 'what do you do', 'help']
    },
    answer: (context) => {
      const list =
        context.lang === 'pt-BR'
          ? '- como renomear um arquivo;\n- como fazer uma captura de tela;\n- como copiar e colar;\n- que horas são.'
          : '- how to rename a file;\n- how to take a screenshot;\n- how to copy and paste;\n- what time it is.';
      return byTone(context, {
        helpful: {
          'pt-BR': `No modo demonstração, sei responder a algumas perguntas de exemplo:\n\n${list}\n\nCom uma IA configurada em **Configurações › IA**, posso ajudar com quase qualquer assunto.`,
          en: `In demo mode, I can answer a few sample questions:\n\n${list}\n\nWith an AI set up in **Settings › AI**, I can help with almost anything.`
        },
        witty: {
          'pt-BR': `Lista curta, mas muito bem ensaiada:\n\n${list}\n\nCom uma IA configurada em **Configurações › IA**, eu deixo de ser um ator decorando falas.`,
          en: `A short list, but very well rehearsed:\n\n${list}\n\nWith an AI set up in **Settings › AI**, I stop being an actor reciting lines.`
        }
      });
    }
  },
  {
    id: 'greeting',
    keywords: {
      'pt-BR': ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'e ai'],
      en: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening']
    },
    answer: (context) =>
      byTone(context, {
        helpful: {
          'pt-BR':
            'Oi! Estou no modo demonstração. Experimente perguntar: *Como eu renomeio um arquivo?*',
          en: "Hi! I'm in demo mode. Try asking: *How do I rename a file?*"
        },
        witty: {
          'pt-BR':
            'Olá! Modo demonstração ligado, só falas ensaiadas. Experimente: *Como faço uma captura de tela?*',
          en: 'Hello! Demo mode on, rehearsed lines only. Try: *How do I take a screenshot?*'
        }
      })
  }
];

export interface DemoAnswer {
  topic: TopicId | 'fallback';
  lang: Locale;
  text: string;
}

export interface AnswerInput {
  text: string;
  uiLocale: Locale;
  platform: NodeJS.Platform;
  osName: string;
  personality: PersonalityId;
  now: Date;
  timeZone: string;
}

/** Primeira resposta cujo tema casa com a pergunta; senão, o convite para configurar uma IA. */
export function answerFor(input: AnswerInput): DemoAnswer {
  const normalized = normalize(input.text);
  const lang = detectLanguage(input.text, input.uiLocale);
  const context: DemoContext = {
    lang,
    os: osFamily(input.platform),
    osName: input.osName,
    personality: input.personality,
    now: input.now,
    timeZone: input.timeZone
  };
  for (const topic of TOPICS) {
    const all = [...topic.keywords['pt-BR'], ...topic.keywords.en];
    if (all.some((keyword) => matches(normalized, keyword))) {
      return { topic: topic.id, lang, text: topic.answer(context) };
    }
  }
  return {
    topic: 'fallback',
    lang,
    text: getPersonality(input.personality).microcopy.demoFallback[lang]
  };
}

export const DEMO_TOPICS: readonly TopicId[] = TOPICS.map((topic) => topic.id);
