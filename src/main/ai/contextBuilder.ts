import type { ConversationMessage } from '../../shared/ai/conversation';
import { CONTEXT_HISTORY_LIMITS } from '../../shared/constants/ai';
import type { Locale } from '../../shared/i18n';
import { BASE_INSTRUCTIONS } from '../../shared/personalities';
import type { BasePlaceholder } from '../../shared/personalities/base';
import type { PersonalityProfile } from '../../shared/personalities/types';

/**
 * Monta o prompt de sistema e as mensagens enviadas ao provider (SPEC §20.2), nesta ordem:
 * instruções base → personalidade → idioma → ambiente → (ferramentas, Fase 5) → histórico.
 *
 * Função pura. Recebe só o que pode entrar no contexto: área de transferência, tela,
 * arquivos, janelas, apps abertos, histórico do navegador e nome de usuário do sistema
 * nem chegam até aqui.
 */

export interface ChatEnvironment {
  appName: string;
  appVersion: string;
  platform: NodeJS.Platform;
  now: Date;
  timeZone: string;
}

export interface ContextInput {
  personality: PersonalityProfile;
  uiLocale: Locale;
  environment: ChatEnvironment;
  /** Conversa até a mensagem atual do usuário, inclusive. */
  history: readonly ConversationMessage[];
  limits?: { messages: number; chars: number };
}

export interface ChatContext {
  system: string;
  messages: ConversationMessage[];
}

const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = {
  'pt-BR': 'português do Brasil',
  en: 'inglês'
};

export function osDisplayName(platform: NodeJS.Platform): string {
  switch (platform) {
    case 'win32':
      return 'Windows';
    case 'darwin':
      return 'macOS';
    case 'linux':
      return 'Linux';
    default:
      return platform;
  }
}

export function formatDateTime(now: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone
  }).format(now);
}

function fillPlaceholders(template: string, values: Readonly<Record<BasePlaceholder, string>>) {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? values[name as BasePlaceholder] : match
  ); // `name` checado por Object.hasOwn
}

/** Só mensagens que o modelo deve ver: sem erros, sem respostas em andamento ou vazias. */
function usableForContext(message: ConversationMessage): boolean {
  if (message.role === 'user') return message.content.trim().length > 0;
  return (
    (message.status === 'complete' || message.status === 'interrupted') &&
    message.content.trim().length > 0
  );
}

/**
 * Últimas N mensagens ou ~M caracteres, o que vier primeiro. A mais recente (a pergunta
 * atual) sempre entra; o recorte nunca começa por uma resposta do assistente.
 */
export function trimHistory(
  messages: readonly ConversationMessage[],
  limits: { messages: number; chars: number } = CONTEXT_HISTORY_LIMITS
): ConversationMessage[] {
  const usable = messages.filter(usableForContext);
  const kept: ConversationMessage[] = [];
  let chars = 0;
  for (let index = usable.length - 1; index >= 0; index -= 1) {
    const message = usable[index];
    if (message === undefined) continue;
    const nextChars = chars + message.content.length;
    if (kept.length > 0 && (kept.length >= limits.messages || nextChars > limits.chars)) break;
    kept.unshift(message);
    chars = nextChars;
  }
  while (kept.length > 1 && kept[0]?.role !== 'user') kept.shift();
  return kept;
}

export function buildChatContext(input: ContextInput): ChatContext {
  const { environment } = input;
  const base = fillPlaceholders(BASE_INSTRUCTIONS, {
    uiLanguage: LANGUAGE_NAMES[input.uiLocale],
    osName: osDisplayName(environment.platform),
    dateTime: formatDateTime(environment.now, input.uiLocale, environment.timeZone),
    timeZone: environment.timeZone,
    appName: environment.appName,
    appVersion: environment.appVersion
  });
  return {
    system: `${base}\n\n${input.personality.systemInstructions}`,
    messages: trimHistory(input.history, input.limits)
  };
}
