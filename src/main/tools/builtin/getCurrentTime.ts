import { z } from 'zod';
import { TOOL_DESCRIPTIONS } from '../../../shared/personalities/tools';
import { localizedText } from '../localizedText';
import { defineTool } from '../types';

/** Data e hora do computador, no fuso do usuário (SPEC §22.3). Sem permissão. */
export const getCurrentTime = defineTool({
  name: 'getCurrentTime',
  description: TOOL_DESCRIPTIONS.getCurrentTime,
  inputSchema: z.object({}),
  permissions: [],
  risk: 'read',
  describeAction: () => localizedText('tool.getCurrentTime.label'),
  execute: (_input, ctx) => {
    const format = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(ctx.locale, { ...options, timeZone: ctx.timeZone }).format(ctx.now);
    return Promise.resolve({
      ok: true,
      data: {
        iso: ctx.now.toISOString(),
        date: format({ dateStyle: 'full' }),
        time: format({ timeStyle: 'short' }),
        timeZone: ctx.timeZone
      }
    });
  }
});
