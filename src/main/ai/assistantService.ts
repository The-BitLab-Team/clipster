import { randomUUID } from 'node:crypto';
import type {
  ChatEvent,
  ConversationMessage,
  ConversationSnapshot
} from '../../shared/ai/conversation';
import type { CharacterEvent } from '../../shared/character/stateMachine';
import {
  AI_TIMEOUTS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  MAX_USER_MESSAGE_CHARS,
  STREAM_DELTA_FLUSH_MS,
  type AiTimeouts
} from '../../shared/constants/ai';
import { MAX_TOOL_CALLS_PER_MESSAGE } from '../../shared/constants/tools';
import type { Locale } from '../../shared/i18n';
import type { PersonalityProfile } from '../../shared/personalities/types';
import type { ToolActivity } from '../../shared/tools/types';
import type { Logger } from '../logging/logger';
import { buildChatContext, type ChatEnvironment } from './contextBuilder';
import { ClipsterError, newSupportCode, toClipsterError, toErrorInfo } from './errors';
import type { ToolHost, ToolRunContext } from '../tools/executor';
import type {
  AIProvider,
  ChatRequest,
  ChatStreamEvent,
  ToolCall,
  ToolResult,
  ToolRound
} from './types';

/**
 * Dono da conversa atual (SPEC §13, §17.2, §20.5). Vive no main, então fechar ou recarregar
 * o balão não perde nada. Uma requisição por vez; fechar o balão não cancela a geração.
 *
 * Eventos de uma requisição vão só para a janela que pediu; trocas da conversa inteira
 * (`reset`) vão para as janelas de chat.
 */

export type ChatTarget = number | 'chat-windows';

export interface StoredConversation {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
}

export type AssistantErrorCode =
  'BUSY' | 'NOT_CONFIGURED' | 'EMPTY' | 'TOO_LONG' | 'NOTHING_TO_RETRY';

export class AssistantError extends Error {
  constructor(
    readonly code: AssistantErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AssistantError';
  }
}

export interface AssistantServiceOptions {
  /** Provider escolhido nas Configurações; `null` = nenhum configurado. */
  resolveProvider: () => AIProvider | null;
  model: () => string;
  personality: () => PersonalityProfile;
  uiLocale: () => Locale;
  environment: () => ChatEnvironment;
  emit: (target: ChatTarget, event: ChatEvent) => void;
  onCharacterEvent: (event: CharacterEvent) => void;
  /** Conversa mudou e está num ponto estável (sem resposta em andamento): salvar, se for o caso. */
  onConversationSettled: (conversation: StoredConversation) => void;
  logger: Logger;
  initialConversation?: StoredConversation | null;
  timeouts?: AiTimeouts;
  /** Só em testes: vale mais que os tempos-limite próprios do provider. */
  forceTimeouts?: AiTimeouts | null;
  /** Ferramentas (SPEC §22). Sem isso, nenhuma é oferecida ao modelo. */
  tools?: ToolHost | null;
  maxToolCalls?: number;
  deltaFlushMs?: number;
  newId?: () => string;
  now?: () => Date;
}

interface ActiveRequest {
  requestId: string;
  requester: number;
  providerId: AIProvider['id'];
  consoleUrl: string | undefined;
  controller: AbortController;
  message: ConversationMessage;
  pending: string;
  flushTimer: ReturnType<typeof setTimeout> | null;
  firstTokenTimer: ReturnType<typeof setTimeout> | null;
  totalTimer: ReturnType<typeof setTimeout> | null;
  /** Tempo total restante; o relógio para enquanto as ferramentas rodam ou esperam o usuário. */
  totalRemainingMs: number;
  totalStartedAt: number;
  timeouts: AiTimeouts;
  /** Chamadas de ferramenta nesta resposta (limite: SPEC §22.2). */
  toolCalls: number;
  /** Primeiro pedaço de texto da rodada atual (cada rodada de ferramentas começa outra). */
  gotFirstToken: boolean;
  /** O provider deu sinal de vida (ex.: modelo pensando) antes do primeiro texto. */
  gotActivity: boolean;
  finished: boolean;
  startedAt: number;
}

export class AssistantService {
  private conversationId: string;
  private createdAt: string;
  private messages: ConversationMessage[];
  private active: ActiveRequest | null = null;
  private readonly timeouts: AiTimeouts;
  private readonly flushMs: number;
  private readonly newId: () => string;
  private readonly now: () => Date;

  constructor(private readonly options: AssistantServiceOptions) {
    this.timeouts = options.timeouts ?? AI_TIMEOUTS;
    this.flushMs = options.deltaFlushMs ?? STREAM_DELTA_FLUSH_MS;
    this.newId = options.newId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    const initial = options.initialConversation ?? null;
    this.conversationId = initial?.id ?? this.newId();
    this.createdAt = initial?.createdAt ?? this.now().toISOString();
    // Uma resposta salva no meio (app fechado à força) volta como interrompida.
    this.messages = (initial?.messages ?? []).map((message) =>
      settledTools(message.status === 'streaming' ? { ...message, status: 'interrupted' } : message)
    );
  }

  get isGenerating(): boolean {
    return this.active !== null;
  }

  snapshot(): ConversationSnapshot {
    return {
      id: this.conversationId,
      messages: this.messages.map((message) => ({ ...message })),
      activeRequestId: this.active?.requestId ?? null
    };
  }

  /** A conversa no formato do histórico, sem resposta em andamento. */
  storedConversation(): StoredConversation {
    return {
      id: this.conversationId,
      createdAt: this.createdAt,
      updatedAt: this.now().toISOString(),
      messages: this.messages.filter((item) => item.status !== 'streaming')
    };
  }

  /** Envia uma pergunta. Lança AssistantError se não der para enviar agora. */
  send(text: string, requester: number): { requestId: string } {
    const content = text.trim();
    if (content.length === 0) throw new AssistantError('EMPTY', 'Mensagem vazia.');
    if (content.length > MAX_USER_MESSAGE_CHARS) {
      throw new AssistantError('TOO_LONG', 'Mensagem longa demais.');
    }
    const provider = this.requireIdleAndProvider();
    const userMessage: ConversationMessage = {
      id: this.newId(),
      role: 'user',
      content,
      createdAt: this.now().toISOString(),
      status: 'complete'
    };
    this.messages.push(userMessage);
    return this.run(provider, requester, [userMessage]);
  }

  /** Tenta de novo a última pergunta, se a última resposta falhou ou foi interrompida. */
  retry(requester: number): { requestId: string } {
    const provider = this.requireIdleAndProvider();
    const last = this.messages.at(-1);
    const previous = this.messages.at(-2);
    const failed = last?.role === 'assistant' && last.status !== 'complete';
    if (!failed || previous?.role !== 'user') {
      throw new AssistantError('NOTHING_TO_RETRY', 'Não há resposta para tentar de novo.');
    }
    this.messages.pop();
    this.options.emit('chat-windows', { type: 'reset', conversation: this.snapshot() });
    return this.run(provider, requester, []);
  }

  cancel(requestId: string): boolean {
    const active = this.active;
    if (active?.requestId !== requestId || active.finished) return false;
    active.controller.abort();
    this.settle(active, 'interrupted');
    return true;
  }

  /** Começa uma conversa nova. A anterior continua no histórico, se ele estiver ligado. */
  newConversation(): ConversationSnapshot {
    this.cancelActive();
    this.conversationId = this.newId();
    this.createdAt = this.now().toISOString();
    this.messages = [];
    const snapshot = this.snapshot();
    this.options.emit('chat-windows', { type: 'reset', conversation: snapshot });
    return snapshot;
  }

  /** Histórico apagado: a conversa em memória também some (SPEC §13). */
  clear(): void {
    this.newConversation();
  }

  dispose(): void {
    this.cancelActive();
  }

  // ───────────────────────── internos ─────────────────────────

  private requireIdleAndProvider(): AIProvider {
    if (this.active !== null) {
      throw new AssistantError('BUSY', 'Já existe uma resposta em andamento.');
    }
    const provider = this.options.resolveProvider();
    if (provider === null) {
      throw new AssistantError('NOT_CONFIGURED', 'Nenhuma IA configurada.');
    }
    return provider;
  }

  private cancelActive(): void {
    const active = this.active;
    if (active === null || active.finished) return;
    active.controller.abort();
    this.settle(active, 'interrupted');
  }

  private run(
    provider: AIProvider,
    requester: number,
    newMessages: ConversationMessage[]
  ): { requestId: string } {
    const requestId = this.newId();
    const history = [...this.messages];
    const reply: ConversationMessage = {
      id: this.newId(),
      role: 'assistant',
      content: '',
      createdAt: this.now().toISOString(),
      status: 'streaming'
    };
    this.messages.push(reply);

    const active: ActiveRequest = {
      requestId,
      requester,
      providerId: provider.id,
      consoleUrl: provider.consoleUrl,
      controller: new AbortController(),
      message: reply,
      pending: '',
      flushTimer: null,
      firstTokenTimer: null,
      totalTimer: null,
      totalRemainingMs: 0,
      totalStartedAt: 0,
      timeouts: this.options.forceTimeouts ?? provider.timeouts ?? this.timeouts,
      toolCalls: 0,
      gotFirstToken: false,
      gotActivity: false,
      finished: false,
      startedAt: Date.now()
    };
    this.active = active;

    this.options.emit(requester, {
      type: 'start',
      requestId,
      messages: [...newMessages, { ...reply }]
    });
    this.options.onCharacterEvent({ type: 'MESSAGE_SENT' });

    const personality = this.options.personality();
    const uiLocale = this.options.uiLocale();
    const environment = this.options.environment();
    const context = buildChatContext({ personality, uiLocale, environment, history });
    const tools = provider.capabilities.tools
      ? (this.options.tools?.definitions(uiLocale) ?? [])
      : [];
    const request: ChatRequest = {
      requestId,
      system: context.system,
      messages: context.messages,
      model: this.options.model(),
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      signal: active.controller.signal,
      hints: {
        personality: personality.id,
        uiLocale,
        platform: environment.platform,
        timeZone: environment.timeZone,
        now: environment.now
      },
      ...(personality.temperaturePreference === undefined
        ? {}
        : { temperature: personality.temperaturePreference }),
      ...(tools.length > 0 ? { tools } : {})
    };

    active.totalRemainingMs = active.timeouts.totalMs;
    this.startTimers(active);

    this.options.logger.info('ai.request', {
      requestId,
      provider: provider.id,
      personality: personality.id,
      messages: context.messages.length,
      tools: tools.length
    });

    void this.consume(active, provider, request, {
      requestId,
      locale: uiLocale,
      timeZone: environment.timeZone,
      now: this.now,
      signal: active.controller.signal,
      onActivity: (activity) => {
        this.onToolActivity(active, activity);
      }
    });
    return { requestId };
  }

  /**
   * Lê a resposta; se o modelo pedir ferramentas, executa (com permissão, SPEC §22) e pede a
   * continuação, até ele responder só com texto. No máximo `maxToolCalls` chamadas: passando
   * disso, as chamadas são recusadas e a rodada seguinte vai sem ferramentas.
   */
  private async consume(
    active: ActiveRequest,
    provider: AIProvider,
    first: ChatRequest,
    toolContext: ToolRunContext
  ): Promise<void> {
    const host = this.options.tools ?? null;
    const maxCalls = this.options.maxToolCalls ?? MAX_TOOL_CALLS_PER_MESSAGE;
    const rounds: ToolRound[] = [];
    let request = first;
    try {
      for (;;) {
        const round = await this.readRound(active, provider.streamResponse(request));
        if (round === null || active.finished) return;
        if (round.calls.length === 0 || host === null || request.tools === undefined) {
          this.settle(active, 'complete');
          return;
        }

        this.flush(active);
        this.pauseTimers(active);
        const results: ToolResult[] = [];
        for (const call of round.calls) {
          if (isOver(active)) return;
          if (active.toolCalls >= maxCalls) {
            results.push(host.refuse(call, toolContext, 'limitReached'));
            continue;
          }
          active.toolCalls += 1;
          results.push(await host.run(call, toolContext));
        }
        if (isOver(active)) return;

        rounds.push({
          text: round.text,
          calls: round.calls,
          results,
          ...(round.continuation === undefined ? {} : { continuation: round.continuation })
        });
        request = {
          ...(active.toolCalls >= maxCalls ? withoutTools(first) : first),
          toolRounds: [...rounds]
        };
        active.gotFirstToken = false;
        active.gotActivity = false;
        this.startTimers(active);
      }
    } catch (error) {
      // Abortado por Parar ou tempo-limite: já foi tratado.
      if (active.finished || active.controller.signal.aborted) return;
      this.fail(active, toClipsterError(error));
    }
  }

  /** Uma rodada do provider. `null` = a resposta terminou com erro (já tratado). */
  private async readRound(
    active: ActiveRequest,
    stream: AsyncIterable<ChatStreamEvent>
  ): Promise<{ text: string; calls: ToolCall[]; continuation?: unknown } | null> {
    let text = '';
    const calls: ToolCall[] = [];
    for await (const event of stream) {
      if (active.finished) return null;
      if (event.type === 'text-delta') {
        text += this.onDelta(active, event.text, text.length === 0);
      } else if (event.type === 'thinking') {
        if (!active.gotActivity) {
          active.gotActivity = true;
          this.clearTimer(active, 'firstTokenTimer');
        }
      } else if (event.type === 'tool-call') {
        if (!active.gotActivity) {
          active.gotActivity = true;
          this.clearTimer(active, 'firstTokenTimer');
        }
        calls.push(event.call);
      } else if (event.type === 'error') {
        this.fail(active, event.error);
        return null;
      } else {
        return event.continuation === undefined
          ? { text, calls }
          : { text, calls, continuation: event.continuation };
      }
    }
    return { text, calls };
  }

  /** Devolve o texto acrescentado (o pedaço, mais um separador entre rodadas). */
  private onDelta(active: ActiveRequest, chunk: string, firstOfRound: boolean): string {
    if (chunk.length === 0) return '';
    // Texto depois de uma rodada de ferramentas começa num parágrafo novo.
    const separator =
      firstOfRound && active.toolCalls > 0 && active.message.content.trim().length > 0
        ? '\n\n'
        : '';
    const text = separator + chunk;
    if (!active.gotFirstToken) {
      active.gotFirstToken = true;
      this.clearTimer(active, 'firstTokenTimer');
      this.options.onCharacterEvent({ type: 'FIRST_TOKEN' });
    }
    active.message.content += text;
    active.pending += text;
    if (this.flushMs <= 0) {
      this.flush(active);
      return chunk;
    }
    active.flushTimer ??= setTimeout(() => {
      active.flushTimer = null;
      this.flush(active);
    }, this.flushMs);
    return chunk;
  }

  private onToolActivity(active: ActiveRequest, activity: ToolActivity): void {
    if (active.finished) return;
    const tools = active.message.tools ?? [];
    const previous = tools.find((item) => item.id === activity.id);
    active.message.tools =
      previous === undefined
        ? [...tools, activity]
        : tools.map((item) => (item.id === activity.id ? activity : item));
    this.options.emit(active.requester, {
      type: 'tool',
      requestId: active.requestId,
      messageId: active.message.id,
      activity
    });
    if (activity.status === 'awaiting') {
      this.options.onCharacterEvent({ type: 'PERMISSION_REQUESTED' });
    } else if (previous?.status === 'awaiting') {
      this.options.onCharacterEvent({ type: 'PERMISSION_RESOLVED' });
    }
  }

  private startTimers(active: ActiveRequest): void {
    this.clearTimer(active, 'firstTokenTimer');
    this.clearTimer(active, 'totalTimer');
    active.firstTokenTimer = setTimeout(() => {
      this.timeOut(active, 'first_token');
    }, active.timeouts.firstTokenMs);
    active.totalStartedAt = Date.now();
    active.totalTimer = setTimeout(
      () => {
        this.timeOut(active, 'total');
      },
      Math.max(0, active.totalRemainingMs)
    );
  }

  /** Ferramentas rodando ou esperando o usuário não contam no tempo-limite da IA. */
  private pauseTimers(active: ActiveRequest): void {
    this.clearTimer(active, 'firstTokenTimer');
    if (active.totalTimer !== null) {
      active.totalRemainingMs -= Date.now() - active.totalStartedAt;
      this.clearTimer(active, 'totalTimer');
    }
  }

  private flush(active: ActiveRequest): void {
    if (active.pending.length === 0) return;
    const text = active.pending;
    active.pending = '';
    this.options.emit(active.requester, {
      type: 'delta',
      requestId: active.requestId,
      messageId: active.message.id,
      text
    });
  }

  private timeOut(active: ActiveRequest, which: 'first_token' | 'total'): void {
    if (active.finished) return;
    if (which === 'first_token' && (active.gotFirstToken || active.gotActivity)) return;
    active.controller.abort();
    this.fail(active, new ClipsterError('TIMEOUT', `Tempo-limite: ${which}`));
  }

  private fail(active: ActiveRequest, error: ClipsterError): void {
    if (active.finished) return;
    if (error.code === 'CANCELLED') {
      this.settle(active, 'interrupted');
      return;
    }
    const supportCode = newSupportCode();
    this.options.logger.warn('ai.error', {
      requestId: active.requestId,
      provider: active.providerId,
      code: error.code,
      supportCode,
      detail: error.message,
      durationMs: Date.now() - active.startedAt
    });
    this.settle(active, 'error', toErrorInfo(error, supportCode, active.consoleUrl));
  }

  private settle(
    active: ActiveRequest,
    status: 'complete' | 'interrupted' | 'error',
    error?: ConversationMessage['error']
  ): void {
    if (active.finished) return;
    this.flush(active);
    active.finished = true;
    this.clearTimer(active, 'flushTimer');
    this.clearTimer(active, 'firstTokenTimer');
    this.clearTimer(active, 'totalTimer');
    if (this.active === active) this.active = null;

    const message: ConversationMessage = settledTools(
      error === undefined ? { ...active.message, status } : { ...active.message, status, error }
    );
    const index = this.messages.findIndex((item) => item.id === message.id);
    if (index !== -1) this.messages[index] = message;

    const base = { requestId: active.requestId, message: { ...message } };
    if (status === 'complete') {
      this.options.emit(active.requester, { type: 'done', ...base });
      this.options.onCharacterEvent({ type: 'STREAM_DONE' });
      this.options.logger.info('ai.done', {
        requestId: active.requestId,
        provider: active.providerId,
        durationMs: Date.now() - active.startedAt,
        chars: message.content.length
      });
    } else if (status === 'interrupted') {
      this.options.emit(active.requester, { type: 'cancelled', ...base });
      this.options.onCharacterEvent({ type: 'CANCELLED' });
      this.options.logger.info('ai.cancelled', { requestId: active.requestId });
    } else {
      this.options.emit(active.requester, { type: 'error', ...base });
      this.options.onCharacterEvent({ type: 'AI_ERROR' });
    }

    this.options.onConversationSettled(this.storedConversation());
  }

  private clearTimer(
    active: ActiveRequest,
    key: 'flushTimer' | 'firstTokenTimer' | 'totalTimer'
  ): void {
    const timer = active[key];
    if (timer !== null) {
      clearTimeout(timer);
      active[key] = null;
    }
  }
}

/**
 * Resposta encerrada: nenhum pedido de permissão fica em aberto. Esperando → não permitido;
 * executando → não deu certo (a resposta acabou antes).
 */
function settledTools(message: ConversationMessage): ConversationMessage {
  if (message.tools === undefined) return message;
  return {
    ...message,
    tools: message.tools.map((activity) => ({
      id: activity.id,
      tool: activity.tool,
      status:
        activity.status === 'awaiting'
          ? 'denied'
          : activity.status === 'running'
            ? 'failed'
            : activity.status
    }))
  };
}

/** Lido depois de um `await`: Parar ou o tempo-limite podem ter encerrado a resposta. */
function isOver(active: { finished: boolean }): boolean {
  return active.finished;
}

/** A mesma requisição, sem oferecer ferramentas (limite atingido). */
function withoutTools(request: ChatRequest): ChatRequest {
  const copy = { ...request };
  delete copy.tools;
  return copy;
}
