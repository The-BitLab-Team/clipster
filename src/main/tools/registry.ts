import type { Locale } from '../../shared/i18n';
import { localized } from '../../shared/personalities';
import type { ToolDefinition } from '../ai/types';
import { getClipsterVersion } from './builtin/getClipsterVersion';
import { getCurrentTime } from './builtin/getCurrentTime';
import { demoDestructiveAction } from './dev/demoDestructiveAction';
import { demoReadAction } from './dev/demoReadAction';
import type { RegisteredTool } from './types';

/** Ferramentas disponíveis nesta execução do app (SPEC §22). */
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  constructor(tools: readonly RegisteredTool[] = []) {
    for (const tool of tools) this.register(tool);
  }

  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.name)) throw new Error(`Ferramenta repetida: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  /** Busca pelo nome que o modelo mandou. Nome desconhecido → `undefined`. */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  list(): RegisteredTool[] {
    return [...this.tools.values()];
  }

  /** Definições para o provider, com a descrição no idioma da interface. */
  definitions(locale: Locale): ToolDefinition[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: localized(tool.description, locale),
      inputSchema: tool.inputJsonSchema
    }));
  }
}

/**
 * `devTools`: as ferramentas fictícias de teste (SPEC §22.3), só com `CLIPSTER_DEV_TOOLS=1`
 * e fora do app instalado.
 */
export function createToolRegistry(options: { devTools: boolean }): ToolRegistry {
  const tools = [getCurrentTime, getClipsterVersion];
  if (options.devTools) tools.push(demoDestructiveAction, demoReadAction);
  return new ToolRegistry(tools);
}
