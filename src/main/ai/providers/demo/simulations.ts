import type { ClipsterErrorCode } from '../../../../shared/errors/codes';
import { normalize } from './repertoire';

/**
 * Comandos de simulação do Demo, **somente em desenvolvimento e testes** (SPEC §20.3):
 * testam a experiência de erro sem gastar tokens.
 *
 *   /simular erro 429   ·  /simulate error 429
 *   /simular timeout    ·  /simulate timeout
 *   /simular offline    ·  /simulate offline
 *   /simular queda      ·  /simulate drop      (cai no meio da resposta)
 *   /simular markdown   ·  /simulate markdown  (link perigoso, imagem e HTML: testa o Markdown seguro)
 */

export type Simulation =
  | { kind: 'error'; code: ClipsterErrorCode; retryAfterSeconds?: number }
  | { kind: 'timeout' }
  | { kind: 'drop' }
  | { kind: 'markdown' };

/** Resposta "maliciosa" para provar que o balão não carrega imagens nem executa HTML (SPEC §8.4). */
export const MARKDOWN_PROBE = [
  'Um [link seguro](https://example.com/docs), um [link perigoso](javascript:alert(1)) e uma imagem ![logo remoto](https://example.com/logo.png).',
  '',
  'HTML cru: <b onclick="alert(1)">negrito</b><img src="https://example.com/x.png" onerror="alert(1)"><script>alert(1)</script>',
  '',
  '| Atalho | Ação |',
  '| --- | --- |',
  '| F2 | Renomear |',
  '',
  '```js',
  "console.log('oi');",
  '```'
].join('\n');

const STATUS_TO_CODE: Readonly<Record<string, ClipsterErrorCode>> = {
  '400': 'CONTEXT_TOO_LONG',
  '401': 'AUTH_INVALID',
  '402': 'QUOTA_OR_BILLING',
  '403': 'AUTH_INVALID',
  '404': 'MODEL_NOT_FOUND',
  '429': 'RATE_LIMITED',
  '500': 'UNKNOWN',
  '503': 'PROVIDER_OVERLOADED',
  '529': 'PROVIDER_OVERLOADED'
};

export const SIMULATED_RETRY_AFTER_SECONDS = 20;

export function parseSimulation(text: string): Simulation | null {
  const words = normalize(text).trim().split(' ');
  const [command, action, argument] = words;
  if (command !== '/simular' && command !== '/simulate') return null;
  if (action === 'timeout') return { kind: 'timeout' };
  if (action === 'offline') return { kind: 'error', code: 'OFFLINE' };
  if (action === 'queda' || action === 'drop') return { kind: 'drop' };
  if (action === 'markdown') return { kind: 'markdown' };
  if ((action === 'erro' || action === 'error') && argument !== undefined) {
    const code = Object.hasOwn(STATUS_TO_CODE, argument) ? STATUS_TO_CODE[argument] : undefined;
    if (code === undefined) return { kind: 'error', code: 'UNKNOWN' };
    return code === 'RATE_LIMITED'
      ? { kind: 'error', code, retryAfterSeconds: SIMULATED_RETRY_AFTER_SECONDS }
      : { kind: 'error', code };
  }
  return null;
}
