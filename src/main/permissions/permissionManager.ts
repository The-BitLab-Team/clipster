import { randomUUID } from 'node:crypto';
import { PERMISSION_TIMEOUT_MS } from '../../shared/constants/tools';
import type { LocalizedString } from '../../shared/personalities/types';
import type { StoredGrant } from '../../shared/schemas/permissions';
import {
  SCOPES_BY_RISK,
  type GrantScope,
  type KnownToolName,
  type PermissionDecision,
  type PermissionGrantView,
  type PermissionId,
  type PermissionPrompt,
  type RiskLevel
} from '../../shared/tools/types';

/**
 * Permissões das ferramentas (SPEC §22.2).
 *
 * - "uma vez" vale só para a chamada; "nesta sessão" fica na memória até sair do app;
 *   "sempre" vai para `settings.json`.
 * - Ação destrutiva: só "uma vez", e concessões guardadas nunca valem para ela. Escrita: nunca
 *   "sempre". Isso é conferido também ao ler as concessões (um `settings.json` editado à mão
 *   não libera nada além do que o risco permite).
 * - Uma permissão só nasce de `respond` a um pedido pendente. Sem resposta = cancelar.
 */

export type PermissionResolution =
  | 'not_required'
  | 'already_granted'
  | 'granted_once'
  | 'granted_session'
  | 'granted_always'
  | 'denied'
  | 'timeout'
  | 'cancelled';

export function isGranted(resolution: PermissionResolution): boolean {
  return (
    resolution === 'not_required' ||
    resolution === 'already_granted' ||
    resolution.startsWith('granted_')
  );
}

export interface PermissionRequest {
  tool: KnownToolName;
  permissions: readonly PermissionId[];
  risk: RiskLevel;
  /** Texto gerado pela ferramenta a partir dos argumentos validados. */
  action: LocalizedString;
  /** Parar, nova conversa etc.: o pedido some e conta como cancelado. */
  signal: AbortSignal;
  /** Chamado uma vez, quando o pedido precisa ser mostrado ao usuário. */
  onPrompt: (prompt: PermissionPrompt) => void;
}

export interface GrantStorage {
  load(): readonly StoredGrant[];
  save(grants: StoredGrant[]): void;
}

export interface PermissionManagerOptions {
  storage: GrantStorage;
  timeoutMs?: number;
  now?: () => Date;
  newId?: () => string;
  /** Concessões mudaram (para atualizar Privacidade › Permissões). */
  onChange?: () => void;
}

interface Pending {
  prompt: PermissionPrompt;
  tool: KnownToolName;
  resolve: (resolution: PermissionResolution) => void;
}

export class PermissionManager {
  private readonly sessionGrants: StoredGrant[] = [];
  private readonly pending = new Map<string, Pending>();
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(private readonly options: PermissionManagerOptions) {
    this.timeoutMs = options.timeoutMs ?? PERMISSION_TIMEOUT_MS;
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomUUID;
  }

  /** Já existe uma concessão válida para esta ferramenta e este risco? */
  existingGrant(
    tool: KnownToolName,
    permissions: readonly PermissionId[],
    risk: RiskLevel
  ): 'session' | 'always' | null {
    const allowed = SCOPES_BY_RISK[risk];
    const covers = (grant: StoredGrant) =>
      grant.tool === tool && permissions.every((item) => grant.permissions.includes(item));
    if (allowed.includes('always') && this.options.storage.load().some(covers)) return 'always';
    if (allowed.includes('session') && this.sessionGrants.some(covers)) return 'session';
    return null;
  }

  request(request: PermissionRequest): Promise<PermissionResolution> {
    if (request.permissions.length === 0) return Promise.resolve('not_required');
    if (this.existingGrant(request.tool, request.permissions, request.risk) !== null) {
      return Promise.resolve('already_granted');
    }
    if (request.signal.aborted) return Promise.resolve('cancelled');

    return new Promise((resolve) => {
      const id = this.newId();
      const prompt: PermissionPrompt = {
        id,
        action: request.action,
        risk: request.risk,
        scopes: SCOPES_BY_RISK[request.risk],
        permissions: [...request.permissions],
        expiresAt: new Date(this.now().getTime() + this.timeoutMs).toISOString()
      };
      const finish = (resolution: PermissionResolution) => {
        if (!this.pending.delete(id)) return;
        clearTimeout(timer);
        request.signal.removeEventListener('abort', onAbort);
        resolve(resolution);
      };
      const onAbort = () => {
        finish('cancelled');
      };
      const timer = setTimeout(() => {
        finish('timeout');
      }, this.timeoutMs);
      request.signal.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, { prompt, tool: request.tool, resolve: finish });
      request.onPrompt(prompt);
    });
  }

  /**
   * Resposta do usuário. Devolve `false` se o pedido não existe mais ou se a escolha não é
   * permitida para esse risco (ex.: "sempre" para uma ação destrutiva).
   */
  respond(requestId: string, decision: PermissionDecision): boolean {
    const pending = this.pending.get(requestId);
    if (pending === undefined) return false;
    if (decision === 'deny') {
      pending.resolve('denied');
      return true;
    }
    if (!pending.prompt.scopes.includes(decision)) return false;
    this.grant(pending.tool, pending.prompt.permissions, decision);
    pending.resolve(`granted_${decision}`);
    return true;
  }

  isPending(requestId: string): boolean {
    return this.pending.has(requestId);
  }

  /** Concessões que valem além de uma chamada, para Privacidade › Permissões. */
  list(): PermissionGrantView[] {
    const view = (grant: StoredGrant, scope: 'session' | 'always'): PermissionGrantView => ({
      id: grant.id,
      tool: grant.tool,
      permissions: grant.permissions,
      scope,
      grantedAt: grant.grantedAt
    });
    return [
      ...this.options.storage.load().map((grant) => view(grant, 'always')),
      ...this.sessionGrants.map((grant) => view(grant, 'session'))
    ].sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
  }

  revoke(grantId: string): boolean {
    const sessionIndex = this.sessionGrants.findIndex((grant) => grant.id === grantId);
    if (sessionIndex !== -1) {
      this.sessionGrants.splice(sessionIndex, 1);
      this.options.onChange?.();
      return true;
    }
    const stored = this.options.storage.load();
    const remaining = stored.filter((grant) => grant.id !== grantId);
    if (remaining.length === stored.length) return false;
    this.options.storage.save(remaining);
    this.options.onChange?.();
    return true;
  }

  private grant(
    tool: KnownToolName,
    permissions: readonly PermissionId[],
    scope: GrantScope
  ): void {
    if (scope === 'once') return;
    const grant: StoredGrant = {
      id: this.newId(),
      tool,
      permissions: [...permissions],
      grantedAt: this.now().toISOString()
    };
    if (scope === 'session') {
      this.sessionGrants.push(grant);
    } else {
      // Uma concessão "sempre" substitui outras da mesma ferramenta.
      const others = this.options.storage.load().filter((item) => item.tool !== tool);
      this.options.storage.save([...others, grant]);
    }
    this.options.onChange?.();
  }
}
