import type { ToolResult, ToolRound } from '../../types';
import { byToneAndLang, timeAnswer, type DemoContext } from './repertoire';

/**
 * Respostas do Demo depois de uma ferramenta (SPEC §20.3: "que horas são?" passa pelo
 * `getCurrentTime`). O Demo lê o resultado como o modelo leria: como dado.
 */

type Parsed = Record<string, unknown>;

function parse(result: ToolResult): Parsed {
  try {
    const value: unknown = JSON.parse(result.content);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Parsed) // conferido acima: objeto simples
      : {};
  } catch {
    return {};
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function failure(context: DemoContext, error: string): string {
  const pt = context.lang === 'pt-BR';
  switch (error) {
    case 'denied':
      return byToneAndLang(context, {
        helpful: { 'pt-BR': 'Tudo bem, não fiz nada.', en: "All right, I didn't do anything." },
        witty: {
          'pt-BR': 'Entendido: mãos longe do teclado. Não fiz nada.',
          en: "Understood: hands off the keyboard. I didn't do anything."
        }
      });
    case 'timeout':
      return pt
        ? 'Fiquei sem resposta, então não fiz nada.'
        : "I didn't get an answer, so I didn't do anything.";
    case 'unknownTool':
      return pt
        ? 'Essa ferramenta de teste não está ligada. Ela só existe em desenvolvimento, com `CLIPSTER_DEV_TOOLS=1`.'
        : 'That test tool is not turned on. It only exists in development, with `CLIPSTER_DEV_TOOLS=1`.';
    case 'limitReached':
      return pt
        ? 'Parei por aqui: é o limite de ferramentas para uma mensagem.'
        : "I'll stop here: that's the tool limit for one message.";
    default:
      return pt ? 'A ferramenta não deu certo desta vez.' : "The tool didn't work this time.";
  }
}

function success(context: DemoContext, result: ToolResult, data: Parsed): string {
  const pt = context.lang === 'pt-BR';
  switch (result.name) {
    case 'getCurrentTime':
      return timeAnswer(context, {
        time: text(data.time),
        date: text(data.date),
        zone: text(data.timeZone)
      });
    case 'getClipsterVersion': {
      const facts = `**${text(data.app)} ${text(data.version)}** (Electron ${text(data.electron)}, Chromium ${text(data.chromium)}), ${pt ? 'no' : 'on'} ${text(data.os)}`;
      return byToneAndLang(context, {
        helpful: { 'pt-BR': `Estou na versão ${facts}.`, en: `I'm on version ${facts}.` },
        witty: {
          'pt-BR': `Versão ${facts}. Novinho em folha, ou quase.`,
          en: `Version ${facts}. Brand new, or close enough.`
        }
      });
    }
    case 'demoDestructiveAction':
      return pt
        ? `Pronto, de mentira: “${text(data.target)}” continua no lugar. Era só a ferramenta de teste.`
        : `Done, pretend-style: “${text(data.target)}” is still there. It was just the test tool.`;
    case 'demoReadAction': {
      const files = Array.isArray(data.files) ? data.files.map(text).join(', ') : '';
      return pt
        ? `Na pasta “${text(data.folder)}” (lista inventada pela ferramenta de teste): ${files}.`
        : `In the “${text(data.folder)}” folder (a list made up by the test tool): ${files}.`;
    }
    default:
      return pt ? 'Pronto.' : 'Done.';
  }
}

/** A simulação de loop ficou sem ferramentas: o AssistantService chegou ao limite. */
export function limitReachedAnswer(context: DemoContext): string {
  return failure(context, 'limitReached');
}

/** Texto depois da última rodada de ferramentas: um parágrafo por resultado. */
export function toolFollowUp(context: DemoContext, round: ToolRound): string {
  return round.results
    .map((result) => {
      const data = parse(result);
      return result.isError ? failure(context, text(data.error)) : success(context, result, data);
    })
    .join('\n\n');
}
