import { createLogger, MemorySink, type Logger } from '../../src/main/logging/logger';

export interface LogRecord {
  level: string;
  msg: string;
  ctx?: Record<string, unknown>;
}

/** Logger em memória para testes, com acesso às linhas já decodificadas. */
export function memoryLogger(): { logger: Logger; records: () => LogRecord[]; raw: () => string } {
  const sink = new MemorySink();
  return {
    logger: createLogger({ level: 'debug', sinks: [sink] }),
    records: () => sink.lines.map((line) => JSON.parse(line) as LogRecord),
    raw: () => sink.lines.join('\n')
  };
}
