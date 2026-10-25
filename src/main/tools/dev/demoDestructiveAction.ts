import { z } from 'zod';
import { TOOL_DESCRIPTIONS } from '../../../shared/personalities/tools';
import { localizedText } from '../localizedText';
import { defineTool, displayText } from '../types';

/**
 * Só em desenvolvimento e testes (SPEC §22.3): finge apagar um arquivo. Existe para testar o
 * pedido de permissão de uma ação destrutiva, que é sempre "uma vez". Não toca no disco.
 */
export const demoDestructiveAction = defineTool({
  name: 'demoDestructiveAction',
  description: TOOL_DESCRIPTIONS.demoDestructiveAction,
  inputSchema: z.strictObject({ target: displayText(200) }),
  permissions: ['filesystem.write'],
  risk: 'destructive',
  describeAction: ({ target }) => localizedText('tool.demoDestructiveAction.action', { target }),
  execute: ({ target }) =>
    Promise.resolve({ ok: true, data: { target, deleted: false, testTool: true } })
});
