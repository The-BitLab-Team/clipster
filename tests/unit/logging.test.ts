import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLogger, MemorySink, RotatingFileSink } from '../../src/main/logging/logger';
import { redact, REDACTED, redactString } from '../../src/main/logging/redact';

describe('redact', () => {
  it('remove valores de chaves sensíveis em qualquer nível', () => {
    const input = {
      provider: 'anthropic',
      apiKey: 'qualquer-coisa',
      nested: { Authorization: 'Bearer xyz', token: 't', list: [{ password: 'p' }] }
    };
    expect(redact(input)).toEqual({
      provider: 'anthropic',
      apiKey: REDACTED,
      nested: { Authorization: REDACTED, token: REDACTED, list: [{ password: REDACTED }] }
    });
  });

  it('remove padrões de credenciais dentro de textos', () => {
    const text = 'falhou com sk-ant-abc123DEF456ghi e Bearer abcdefghijkl123';
    expect(redactString(text)).toBe(`falhou com ${REDACTED} e ${REDACTED}`);
  });

  it('trata erros, referências circulares e profundidade', () => {
    const error = new Error('chave sk-1234567890abcdef inválida');
    const circular: Record<string, unknown> = { name: 'a' };
    circular.self = circular;
    const result = redact({ error, circular }) as {
      error: { message: string };
      circular: { self: unknown };
    };
    expect(result.error.message).toBe(`chave ${REDACTED} inválida`);
    expect(result.circular.self).toBe('[Circular]');
  });

  it('não altera valores comuns', () => {
    expect(redact({ count: 3, ok: true, label: 'Clipster' })).toEqual({
      count: 3,
      ok: true,
      label: 'Clipster'
    });
  });
});

describe('createLogger', () => {
  it('grava JSON Lines, filtra por nível e aplica redação', () => {
    const sink = new MemorySink();
    const logger = createLogger({
      level: 'info',
      sinks: [sink],
      now: () => new Date('2026-10-24T00:00:00.000Z')
    });
    logger.debug('ignorado');
    logger.child('ipc').warn('evento', { apiKey: 'segredo', channel: 'settings:get' });

    expect(sink.lines).toHaveLength(1);
    const entry = JSON.parse(sink.lines[0] ?? '{}') as Record<string, unknown>;
    expect(entry).toEqual({
      ts: '2026-10-24T00:00:00.000Z',
      level: 'warn',
      scope: 'main:ipc',
      msg: 'evento',
      ctx: { apiKey: REDACTED, channel: 'settings:get' }
    });
  });

  it('um sink com defeito não derruba o logger', () => {
    const good = new MemorySink();
    const logger = createLogger({
      level: 'debug',
      sinks: [
        {
          write: () => {
            throw new Error('disco cheio');
          }
        },
        good
      ]
    });
    expect(() => {
      logger.error('falha');
    }).not.toThrow();
    expect(good.lines).toHaveLength(1);
  });
});

describe('RotatingFileSink', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  });

  it('roda os arquivos por tamanho e mantém no máximo N arquivos', () => {
    dir = mkdtempSync(join(tmpdir(), 'clipster-logs-'));
    const sink = new RotatingFileSink(dir, 'clipster', 100, 3);
    for (let index = 0; index < 20; index += 1) {
      sink.write(`linha ${index.toString().padStart(2, '0')} ${'x'.repeat(30)}`);
    }
    const files = readdirSync(dir).sort();
    expect(files).toEqual(['clipster.1.log', 'clipster.2.log', 'clipster.log']);
    expect(readFileSync(join(dir, 'clipster.log'), 'utf8')).toContain('linha 19');
  });
});
