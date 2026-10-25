import { z } from 'zod';
import { TOOL_DESCRIPTIONS } from '../../../shared/personalities/tools';
import { osDisplayName } from '../../ai/contextBuilder';
import { localizedText } from '../localizedText';
import { defineTool } from '../types';

/** Versões do app e dos componentes (SPEC §22.3). Sem permissão. */
export const getClipsterVersion = defineTool({
  name: 'getClipsterVersion',
  description: TOOL_DESCRIPTIONS.getClipsterVersion,
  inputSchema: z.object({}),
  permissions: [],
  risk: 'read',
  describeAction: () => localizedText('tool.getClipsterVersion.label'),
  execute: (_input, ctx) =>
    Promise.resolve({
      ok: true,
      data: {
        app: ctx.app.name,
        version: ctx.app.version,
        electron: ctx.app.electron,
        chromium: ctx.app.chrome,
        os: osDisplayName(ctx.app.platform),
        arch: ctx.app.arch
      }
    })
});
