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
  type ModelInfo
} from '../../types';
import { answerFor } from './repertoire';
import { MARKDOWN_PROBE, parseSimulation } from './simulations';

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
  readonly capabilities = { streaming: true, cancel: true, tools: false, listModels: true };
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
          : answerFor({
              text,
              uiLocale: hints.uiLocale,
              platform: hints.platform,
              osName: osDisplayName(hints.platform),
              personality: hints.personality,
              now: hints.now,
              timeZone: hints.timeZone
            });

    for (const chunk of chunkText(answer.text)) {
      await sleep(this.timing.chunkMs, signal);
      yield { type: 'text-delta', text: chunk };
    }

    if (simulation?.kind === 'drop') {
      yield { type: 'error', error: new ClipsterError('OFFLINE', 'Queda simulada no modo Demo.') };
      return;
    }
    yield { type: 'done', stopReason: 'end_turn' };
  }

  generateResponse(request: ChatRequest): Promise<ChatResponse> {
    return collectResponse(this.streamResponse(request));
  }

  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve([DEMO_MODEL]);
  }

  testConnection(): Promise<ConnectionStatus> {
    return Promise.resolve({ status: 'connected' });
  }
}
