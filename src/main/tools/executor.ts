import { TOOL_EXECUTION_TIMEOUT_MS, TOOL_RESULT_MAX_CHARS } from '../../shared/constants/tools';
import type { Locale } from '../../shared/i18n';
import { TOOL_RESULT_NOTES, type ToolResultNote } from '../../shared/personalities/tools';
import type { PermissionPrompt, ToolActivity } from '../../shared/tools/types';
import type { ToolCall, ToolDefinition, ToolResult } from '../ai/types';
import type { Logger } from '../logging/logger';
import {
  isGranted,
  type PermissionManager,
  type PermissionResolution
} from '../permissions/permissionManager';
import type { ToolRegistry } from './registry';
import type { ToolContext, ToolOutput } from './types';

/**
 * Executa uma chamada de ferramenta pedida pelo modelo (SPEC §22.2):
 * nome conhecido → argumentos validados → permissão → execução com tempo-limite → auditoria.
 *
 * O resultado volta ao modelo como dado (JSON). Nada do que a ferramenta devolve concede
 * permissões ou dispara outra ferramenta: cada chamada passa por aqui de novo.
 */

export interface ToolRunContext {
  requestId: string;
  locale: Locale;
  timeZone: string;
  now: () => Date;
  signal: AbortSignal;
  /** Atualização para o balão (executando, esperando permissão, pronto…). */
  onActivity: (activity: ToolActivity) => void;
}

/** O que o AssistantService precisa das ferramentas. */
export interface ToolHost {
  definitions(locale: Locale): ToolDefinition[];
  run(call: ToolCall, ctx: ToolRunContext): Promise<ToolResult>;
  /** Resultado para uma chamada recusada por limite, sem executar nada. */
  refuse(call: ToolCall, ctx: ToolRunContext, reason: 'limitReached'): ToolResult;
}

export interface ToolExecutorOptions {
  registry: ToolRegistry;
  permissions: PermissionManager;
  logger: Logger;
  app: () => ToolContext['app'];
  executionTimeoutMs?: number;
}

type AuditDecision = PermissionResolution | 'unknown_tool' | 'invalid_input' | 'limit_reached';

export class ToolExecutor implements ToolHost {
  private readonly executionTimeoutMs: number;

  constructor(private readonly options: ToolExecutorOptions) {
    this.executionTimeoutMs = options.executionTimeoutMs ?? TOOL_EXECUTION_TIMEOUT_MS;
  }

  definitions(locale: Locale): ToolDefinition[] {
    return this.options.registry.definitions(locale);
  }

  refuse(call: ToolCall, ctx: ToolRunContext, reason: 'limitReached'): ToolResult {
    const tool = this.options.registry.get(call.name);
    ctx.onActivity({ id: call.id, tool: tool?.name ?? null, status: 'failed' });
    this.audit(ctx.requestId, tool?.name ?? null, 'limit_reached', false, 0);
    return errorResult(call, reason);
  }

  async run(call: ToolCall, ctx: ToolRunContext): Promise<ToolResult> {
    const startedAt = Date.now();
    const tool = this.options.registry.get(call.name);
    if (tool === undefined) {
      ctx.onActivity({ id: call.id, tool: null, status: 'failed' });
      this.audit(ctx.requestId, null, 'unknown_tool', false, 0);
      return errorResult(call, 'unknownTool');
    }

    const activity = (status: ToolActivity['status'], prompt?: PermissionPrompt) => {
      ctx.onActivity(
        prompt === undefined
          ? { id: call.id, tool: tool.name, status }
          : { id: call.id, tool: tool.name, status, prompt }
      );
    };

    const prepared = tool.prepare(call.input);
    if (!prepared.ok) {
      activity('failed');
      this.audit(ctx.requestId, tool.name, 'invalid_input', false, 0);
      return errorResult(call, 'invalidInput', { issues: prepared.issues.slice(0, 5) });
    }

    activity('running');
    const resolution = await this.options.permissions.request({
      tool: tool.name,
      permissions: tool.permissions,
      risk: tool.risk,
      action: prepared.call.action,
      signal: ctx.signal,
      onPrompt: (prompt) => {
        activity('awaiting', prompt);
      }
    });
    if (!isGranted(resolution)) {
      activity('denied');
      this.audit(ctx.requestId, tool.name, resolution, false, Date.now() - startedAt);
      return errorResult(
        call,
        resolution === 'timeout' ? 'timeout' : resolution === 'cancelled' ? 'cancelled' : 'denied'
      );
    }

    activity('running');
    const output = await this.execute(() =>
      prepared.call.execute({
        locale: ctx.locale,
        timeZone: ctx.timeZone,
        now: ctx.now(),
        signal: ctx.signal,
        app: this.options.app()
      })
    );
    const success = output.ok;
    activity(success ? 'done' : 'failed');
    this.audit(ctx.requestId, tool.name, resolution, success, Date.now() - startedAt);
    if (!output.ok) {
      return errorResult(call, output.reason === 'too_slow' ? 'tooSlow' : 'failed');
    }
    return {
      callId: call.id,
      name: call.name,
      content: truncate(JSON.stringify(output.data ?? null)),
      isError: false
    };
  }

  private async execute(run: () => Promise<ToolOutput>): Promise<ToolOutput> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tooSlow = new Promise<ToolOutput>((resolve) => {
      timer = setTimeout(() => {
        resolve({ ok: false, reason: 'too_slow' });
      }, this.executionTimeoutMs);
    });
    try {
      return await Promise.race([run(), tooSlow]);
    } catch (error) {
      this.options.logger.warn('tool.failed', { error });
      return { ok: false, reason: 'exception' };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Auditoria local (SPEC §22.2): ferramenta, decisão e sucesso. Nunca os argumentos. */
  private audit(
    requestId: string,
    tool: string | null,
    decision: AuditDecision,
    success: boolean,
    durationMs: number
  ): void {
    this.options.logger.info('tool.audit', {
      requestId,
      tool: tool ?? 'unknown',
      decision,
      success,
      durationMs
    });
  }
}

function errorResult(
  call: ToolCall,
  note: ToolResultNote,
  extra: Record<string, unknown> = {}
): ToolResult {
  return {
    callId: call.id,
    name: call.name,
    content: truncate(JSON.stringify({ error: note, message: TOOL_RESULT_NOTES[note], ...extra })),
    isError: true
  };
}

function truncate(text: string): string {
  return text.length <= TOOL_RESULT_MAX_CHARS ? text : `${text.slice(0, TOOL_RESULT_MAX_CHARS)}…`;
}
