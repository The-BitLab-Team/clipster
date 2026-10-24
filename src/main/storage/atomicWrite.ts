import { renameSync, writeFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

/**
 * Escrita atômica: grava em arquivo temporário e renomeia (SPEC §13).
 * No Windows, antivírus e indexadores podem segurar o arquivo por instantes;
 * por isso o rename é repetido algumas vezes antes de desistir.
 */

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RETRIES = 5;
const RETRY_DELAY_MS = 40;

function tempPathFor(filePath: string): string {
  return `${filePath}.${process.pid.toString()}.${randomBytes(4).toString('hex')}.tmp`;
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    RETRYABLE.has(error.code)
  );
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export async function writeFileAtomic(filePath: string, data: string): Promise<void> {
  const temp = tempPathFor(filePath);
  await writeFile(temp, data, 'utf8');
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temp, filePath);
      return;
    } catch (error) {
      if (!isRetryable(error) || attempt >= RETRIES) throw error;
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
}

export function writeFileAtomicSync(filePath: string, data: string): void {
  const temp = tempPathFor(filePath);
  writeFileSync(temp, data, 'utf8');
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(temp, filePath);
      return;
    } catch (error) {
      if (!isRetryable(error) || attempt >= RETRIES) throw error;
      const until = Date.now() + RETRY_DELAY_MS;
      while (Date.now() < until) {
        // Espera curta e síncrona: só usada ao sair do app.
      }
    }
  }
}
