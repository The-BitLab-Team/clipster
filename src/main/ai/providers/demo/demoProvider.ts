import { DEMO_TIMING, type DemoTiming } from '../../../../shared/constants/ai';
import { osDisplayName } from '../../contextBuilder';
import { ClipsterError } from '../../errors';
import {
  collectResponse,
  type AIProvider,
  type ChatRequest,
  type ChatResponse,
  type ChatStreamEvent,
  type ConnectionStatus,
  type ModelInfo,
  type ToolCall
} from '../../types';
import { answerFor, contextFor, topicOf, type AnswerInput } from './repertoire';
import { MARKDOWN_PROBE, parseSimulation, type Simulation } from './simulations';
import { limitReachedAnswer, toolFollowUp } from './toolAnswers';

/**
 * Provider de demonstração (SPEC §20.3). Disponível em desenvolvimento e no app instalado,
 * sempre rotulado como "Demo". Respostas pré-programadas, streaming simulado e cancelável.
 */

export interface DemoProviderOptions {
  timing?: DemoTiming;
  /** Comandos `/simular …`. Somente em desenvolvimento e testes. */
  allowSimulations: boolean;
}

export const DEMO_MODEL: ModelInfo = { id: 'demo', name: 'Demo' };

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

/** Espera cancelável. Com 0 ms ainda devolve o controle ao event loop. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolveSleep, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolveSleep();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Pedaços de duas palavras, preservando espaços e quebras de linha. */
export function chunkText(text: string): string[] {
  const tokens = text.match(/\S+\s*|\s+/g) ?? [];
  const chunks: string[] = [];
  for (let index = 0; index < tokens.length; index += 2) {
    chunks.push(tokens.slice(index, index + 2).join(''));
  }
  return chunks;
}

export class DemoProvider implements AIProvider {
  readonly id = 'demo' as const;
  readonly capabilities = { streaming: true, cancel: true, tools: true, listModels: true };
  private readonly timing: DemoTiming;

  constructor(private readonly options: DemoProviderOptions) {
    this.timing = options.timing ?? DEMO_TIMING;
  }

  async *streamResponse(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const { signal, hints } = request;
    const question = request.messages.findLast((message) => message.role === 'user');
    const text = question?.content ?? '';
    const simulation = this.options.allowSimulations ? parseSimulation(text) : null;

    await sleep(this.timing.thinkingMs, signal);

    const answerInput: AnswerInput = {
      text,
      uiLocale: hints.uiLocale,
      platform: hints.platform,
      osName: osDisplayName(hints.platform),
      personality: hints.personality,
      now: hints.now,
      timeZone: hints.timeZone
    };

    // Ferramentas (SPEC §20.3, §22): pede a ferramenta; na rodada seguinte, responde com o resultado.
    const call = request.tools === undefined ? null : toolCallFor(request, simulation);
    if (call !== null) {
      yield { type: 'tool-call', call };
      yield { type: 'done', stopReason: 'tool_use' };
      return;
    }
    const lastRound = request.toolRounds?.at(-1);
    if (lastRound !== undefined) {
      const looping = simulation?.kind === 'tool' && simulation.tool === 'loop';
      const context = contextFor(answerInput);
      yield* this.speak(
        looping ? limitReachedAnswer(context) : toolFollowUp(context, lastRound),
        signal
      );
      yield { type: 'done', stopReason: 'end_turn' };
      return;
    }

    if (simulation?.kind === 'timeout') {
      // Nunca responde: quem encerra é o tempo-limite do AssistantService ou o Parar.
      await new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(abortError());
        });
      });
    }
    if (simulation?.kind === 'error') {
      yield {
        type: 'error',
        error: new ClipsterError(
          simulation.code,
          'Erro simulado no modo Demo.',
          simulation.retryAfterSeconds === undefined
            ? {}
            : { retryAfterSeconds: simulation.retryAfterSeconds }
        )
      };
      return;
    }

    const answer =
      simulation?.kind === 'markdown'
        ? { text: MARKDOWN_PROBE }
        : simulation?.kind === 'drop'
          ? {
              text:
                hints.uiLocale === 'pt-BR'
                  ? 'Começando a responder, e então a conexão'
                  : 'Starting to answer, and then the connection'
            }
          : answerFor(answerInput);

    yield* this.speak(answer.text, signal);

    if (simulation?.kind === 'drop') {
      yield { type: 'error', error: new ClipsterError('OFFLINE', 'Queda simulada no modo Demo.') };
      return;
    }
    yield { type: 'done', stopReason: 'end_turn' };
  }

  private async *speak(text: string, signal: AbortSignal): AsyncGenerator<ChatStreamEvent> {
    for (const chunk of chunkText(text)) {
      await sleep(this.timing.chunkMs, signal);
      yield { type: 'text-delta', text: chunk };
    }
  }

  generateResponse(request: ChatRequest): Promise<ChatResponse> {
    return collectResponse(this.streamResponse(request));
  }

  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve([DEMO_MODEL]);
  }

  testConnection(): Promise<ConnectionStatus> {
    return Promise.resolve({ status: 'connected', modelCount: 1 });
  }
}

/**
 * Qual ferramenta o Demo pede nesta rodada, se alguma:
 * - primeira rodada de "que horas são?" → `getCurrentTime`; "qual a sua versão?" → `getClipsterVersion`;
 * - simulações de desenvolvimento → as ferramentas de teste (ou, em `loop`, `getCurrentTime`
 *   de novo a cada rodada, até o limite tirar as ferramentas da requisição).
 */
function toolCallFor(request: ChatRequest, simulation: Simulation | null): ToolCall | null {
  const round = request.toolRounds?.length ?? 0;
  const id = `demo-call-${String(round + 1)}`;
  if (simulation?.kind === 'tool') {
    if (simulation.tool === 'loop') return { id, name: 'getCurrentTime', input: {} };
    if (round > 0) return null;
    return simulation.tool === 'demoDestructiveAction'
      ? {
          id,
          name: simulation.tool,
          input: { target: simulation.argument || 'relatorio-final.docx' }
        }
      : { id, name: simulation.tool, input: { folder: simulation.argument || 'Documentos' } };
  }
  if (round > 0) return null;
  const question = request.messages.findLast((message) => message.role === 'user');
  const topic = topicOf(question?.content ?? '');
  const offered = (name: string) => request.tools?.some((tool) => tool.name === name) === true;
  if (topic === 'time' && offered('getCurrentTime'))
    return { id, name: 'getCurrentTime', input: {} };
  if (topic === 'version' && offered('getClipsterVersion')) {
    return { id, name: 'getClipsterVersion', input: {} };
  }
  return null;
}
