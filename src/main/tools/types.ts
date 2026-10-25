import { z } from 'zod';
import type { Locale } from '../../shared/i18n';
import type { LocalizedString } from '../../shared/personalities/types';
import type { KnownToolName, PermissionId, RiskLevel } from '../../shared/tools/types';

/** Ferramentas (SPEC §22.1). Executam só no main. */

/** O que uma ferramenta pode saber do ambiente. Nada além disso. */
export interface ToolContext {
  locale: Locale;
  timeZone: string;
  now: Date;
  signal: AbortSignal;
  app: {
    name: string;
    version: string;
    electron: string;
    chrome: string;
    platform: NodeJS.Platform;
    arch: string;
  };
}

export type ToolOutput = { ok: true; data: unknown } | { ok: false; reason: string };

export interface ClipsterTool<I> {
  name: KnownToolName;
  description: LocalizedString;
  /** Argumentos validados antes de qualquer outra coisa. */
  inputSchema: z.ZodType<I>;
  /** Vazio = não precisa de permissão. */
  permissions: readonly PermissionId[];
  risk: RiskLevel;
  /** Texto do pedido de permissão, gerado a partir dos argumentos já validados. */
  describeAction(input: I): LocalizedString;
  execute(input: I, ctx: ToolContext): Promise<ToolOutput>;
}

/** Uma chamada já validada, pronta para pedir permissão e executar. */
export interface PreparedCall {
  action: LocalizedString;
  execute(ctx: ToolContext): Promise<ToolOutput>;
}

/** Ferramenta registrada: o tipo dos argumentos fica escondido atrás da validação. */
export interface RegisteredTool {
  name: KnownToolName;
  description: LocalizedString;
  permissions: readonly PermissionId[];
  risk: RiskLevel;
  /** JSON Schema dos argumentos, enviado ao modelo. */
  inputJsonSchema: Readonly<Record<string, unknown>>;
  prepare(input: unknown): { ok: true; call: PreparedCall } | { ok: false; issues: string[] };
}

export function defineTool<I>(tool: ClipsterTool<I>): RegisteredTool {
  const inputJsonSchema: Record<string, unknown> = {
    ...z.toJSONSchema(tool.inputSchema, { io: 'input' })
  };
  delete inputJsonSchema.$schema;
  return {
    name: tool.name,
    description: tool.description,
    permissions: tool.permissions,
    risk: tool.risk,
    inputJsonSchema,
    prepare(input) {
      const parsed = tool.inputSchema.safeParse(input ?? {});
      if (!parsed.success) {
        return {
          ok: false,
          issues: parsed.error.issues.map(
            (issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`
          )
        };
      }
      const value = parsed.data;
      return {
        ok: true,
        call: {
          action: tool.describeAction(value),
          execute: (ctx) => tool.execute(value, ctx)
        }
      };
    }
  };
}

/**
 * Texto vindo do modelo que vai aparecer num pedido de permissão: uma linha, sem caracteres
 * de controle nem de direção de texto (que poderiam disfarçar um nome de arquivo).
 */
export const displayText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !hasHiddenCharacters(value), {
      message: 'caracteres de controle não são permitidos'
    });

/** Controle (C0/C1) e marcas de direção de texto, que deixam um nome parecer outro. */
function hasHiddenCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (
      code < 0x20 ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    ) {
      return true;
    }
  }
  return false;
}
