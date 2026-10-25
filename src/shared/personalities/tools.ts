import type { KnownToolName } from '../tools/types';
import type { LocalizedString } from './types';

/**
 * Descrições das ferramentas para a IA (SPEC §22.1). Ficam aqui, junto dos outros prompts,
 * para o dono do produto poder lê-las e ajustá-las num lugar só. Os rótulos que o usuário
 * vê (balão, Configurações, pedido de permissão) ficam no i18n (`tool.<nome>.*`).
 */
export const TOOL_DESCRIPTIONS: Readonly<Record<KnownToolName, LocalizedString>> = {
  getCurrentTime: {
    'pt-BR':
      'Consulta a data e a hora atuais do computador do usuário, no fuso horário dele. Use quando a pergunta depender da hora ou da data exatas.',
    en: "Gets the current date and time on the user's computer, in their time zone. Use it when the answer depends on the exact time or date."
  },
  getClipsterVersion: {
    'pt-BR':
      'Informa a versão do Clipster e dos componentes (Electron, Chromium) e o sistema operacional. Use quando o usuário perguntar sobre a versão ou para ajudar com um problema.',
    en: 'Returns the version of Clipster and its components (Electron, Chromium) and the operating system. Use it when the user asks about the version or to help with a problem.'
  },
  demoDestructiveAction: {
    'pt-BR':
      'FERRAMENTA DE TESTE: finge apagar um arquivo pelo nome (`target`). Não apaga nada de verdade. Use só quando o usuário pedir explicitamente para testar a ferramenta destrutiva.',
    en: 'TEST TOOL: pretends to delete a file by name (`target`). Nothing is actually deleted. Use it only when the user explicitly asks to test the destructive tool.'
  },
  demoReadAction: {
    'pt-BR':
      'FERRAMENTA DE TESTE: finge listar os arquivos de uma pasta (`folder`) e devolve uma lista inventada. Use só quando o usuário pedir explicitamente para testar a ferramenta de leitura.',
    en: 'TEST TOOL: pretends to list the files in a folder (`folder`) and returns a made-up list. Use it only when the user explicitly asks to test the read tool.'
  }
};

/**
 * Notas que acompanham um resultado de ferramenta que não deu certo. Vão para a IA (em
 * inglês, curtas e técnicas), nunca para a tela.
 */
export const TOOL_RESULT_NOTES = {
  unknownTool: 'This tool does not exist. Answer without it.',
  invalidInput: 'Invalid arguments. Fix them or answer without the tool.',
  denied:
    'The user did not allow this action. Do not try again unless the user asks; you may explain how they can do it themselves.',
  timeout:
    'The user did not answer the permission request in time. Do not try again unless the user asks.',
  cancelled: 'The request was cancelled.',
  limitReached: 'Tool call limit for this message reached. Answer with what you already have.',
  failed: 'The tool failed. Answer without it.',
  tooSlow: 'The tool took too long and was stopped. Answer without it.'
} as const;

export type ToolResultNote = keyof typeof TOOL_RESULT_NOTES;
