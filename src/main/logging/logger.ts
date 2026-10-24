import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { LogLevel } from '../../shared/ipc/payloads';
import { redact, redactString } from './redact';

/** Logger estruturado em JSON Lines (SPEC §24). */

export type LogContext = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(scope: string): Logger;
}

export interface LogSink {
  write(line: string, level: LogLevel): void;
}

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export interface LoggerOptions {
  level: LogLevel;
  sinks: readonly LogSink[];
  scope?: string;
  now?: () => Date;
}

export function createLogger(options: LoggerOptions): Logger {
  const now = options.now ?? (() => new Date());
  const scope = options.scope ?? 'main';

  const log = (level: LogLevel, message: string, context?: LogContext): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[options.level]) return;
    const entry = {
      ts: now().toISOString(),
      level,
      scope,
      msg: redactString(message),
      ...(context === undefined ? {} : { ctx: redact(context) })
    };
    let line: string;
    try {
      line = JSON.stringify(entry);
    } catch {
      line = JSON.stringify({
        ts: entry.ts,
        level,
        scope,
        msg: entry.msg,
        ctx: '[Unserializable]'
      });
    }
    for (const sink of options.sinks) {
      try {
        sink.write(line, level);
      } catch {
        // Um sink com defeito nunca pode derrubar o app.
      }
    }
  };

  return {
    debug: (message, context) => {
      log('debug', message, context);
    },
    info: (message, context) => {
      log('info', message, context);
    },
    warn: (message, context) => {
      log('warn', message, context);
    },
    error: (message, context) => {
      log('error', message, context);
    },
    child: (childScope) => createLogger({ ...options, scope: `${scope}:${childScope}` })
  };
}

export class ConsoleSink implements LogSink {
  write(line: string, level: LogLevel): void {
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
}

export class MemorySink implements LogSink {
  readonly lines: string[] = [];
  write(line: string): void {
    this.lines.push(line);
  }
}

/** Arquivo com rotação por tamanho: clipster.log, clipster.1.log, clipster.2.log… */
export class RotatingFileSink implements LogSink {
  private readonly filePath: string;
  private size: number;

  constructor(
    private readonly directory: string,
    private readonly baseName = 'clipster',
    private readonly maxBytes = 1_000_000,
    private readonly maxFiles = 3
  ) {
    mkdirSync(directory, { recursive: true });
    this.filePath = join(directory, `${baseName}.log`);
    this.size = existsSync(this.filePath) ? statSync(this.filePath).size : 0;
  }

  get path(): string {
    return this.filePath;
  }

  write(line: string): void {
    const data = `${line}\n`;
    const bytes = Buffer.byteLength(data, 'utf8');
    if (this.size + bytes > this.maxBytes && this.size > 0) {
      this.rotate();
    }
    appendFileSync(this.filePath, data, 'utf8');
    this.size += bytes;
  }

  private rotated(index: number): string {
    return join(this.directory, `${this.baseName}.${index}.log`);
  }

  private rotate(): void {
    const oldest = this.rotated(this.maxFiles - 1);
    if (existsSync(oldest)) rmSync(oldest, { force: true });
    for (let index = this.maxFiles - 2; index >= 1; index -= 1) {
      const source = this.rotated(index);
      if (existsSync(source)) renameSync(source, this.rotated(index + 1));
    }
    if (existsSync(this.filePath)) renameSync(this.filePath, this.rotated(1));
    this.size = 0;
  }
}
