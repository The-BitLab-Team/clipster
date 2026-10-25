import { z } from 'zod';
import { TOOL_DESCRIPTIONS } from '../../../shared/personalities/tools';
import { localizedText } from '../localizedText';
import { defineTool, displayText } from '../types';

/**
 * Só em desenvolvimento e testes: finge listar uma pasta e devolve uma lista inventada.
 * Existe para testar as permissões de leitura ("nesta sessão", "sempre" e Revogar).
 */
export const demoReadAction = defineTool({
  name: 'demoReadAction',
  description: TOOL_DESCRIPTIONS.demoReadAction,
  inputSchema: z.strictObject({ folder: displayText(200) }),
  permissions: ['filesystem.read'],
  risk: 'read',
  describeAction: ({ folder }) => localizedText('tool.demoReadAction.action', { folder }),
  execute: ({ folder }) =>
    Promise.resolve({
      ok: true,
      data: {
        folder,
        files: ['notas.txt', 'foto-da-viagem.jpg', 'orcamento.xlsx'],
        madeUp: true
      }
    })
});
