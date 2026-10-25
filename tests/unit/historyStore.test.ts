import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StoredConversation } from '../../src/main/ai/assistantService';
import { HistoryStore } from '../../src/main/storage/historyStore';
import { memoryLogger } from './logRecords';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'clipster-history-'));
  file = join(dir, 'history.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const NOW = new Date('2026-10-24T12:00:00.000Z');

function conversation(id: string, daysAgo: number, content = 'oi'): StoredConversation {
  const at = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
  return {
    id,
    createdAt: at,
    updatedAt: at,
    messages: [
      { id: `${id}-u`, role: 'user', content, createdAt: at, status: 'complete' },
      { id: `${id}-a`, role: 'assistant', content: 'Olá!', createdAt: at, status: 'complete' }
    ]
  };
}

function load(retentionDays = 30, maxBytes?: number) {
  const { logger } = memoryLogger();
  return HistoryStore.load({
    filePath: file,
    retentionDays,
    logger,
    now: () => NOW,
    writeDebounceMs: 0,
    ...(maxBytes === undefined ? {} : { maxBytes })
  });
}

describe('HistoryStore (SPEC §13)', () => {
  it('grava, reabre e devolve a conversa mais recente', async () => {
    const store = load();
    store.save(conversation('a', 2));
    store.save(conversation('b', 1));
    store.save({ ...conversation('a', 0), messages: conversation('a', 0, 'de novo').messages });
    await store.flush();

    const reopened = load();
    expect(reopened.size).toBe(2);
    expect(reopened.latest()?.id).toBe('a');
    expect(reopened.latest()?.messages[0]?.content).toBe('de novo');
  });

  it('não salva conversa vazia', async () => {
    const store = load();
    store.save({ ...conversation('a', 0), messages: [] });
    await store.flush();
    expect(existsSync(file)).toBe(false);
  });

  it('aplica a retenção ao carregar e quando a configuração muda; 0 = sempre', async () => {
    const store = load(0);
    store.save(conversation('velha', 40));
    store.save(conversation('media', 10));
    store.save(conversation('nova', 1));
    await store.flush();

    expect(load(0).size).toBe(3);
    const thirty = load(30);
    expect(thirty.all().map((item) => item.id)).toEqual(['media', 'nova']);
    thirty.setRetention(7);
    expect(thirty.all().map((item) => item.id)).toEqual(['nova']);
    await thirty.flush();
    expect(load(0).size).toBe(1);
  });

  it('limita o tamanho do arquivo removendo as conversas mais antigas', async () => {
    const store = load(0, 3_000);
    for (let index = 0; index < 10; index += 1) {
      store.save(conversation(`c${index.toString()}`, 10 - index, 'x'.repeat(400)));
    }
    await store.flush();
    expect(readFileSync(file).byteLength).toBeLessThanOrEqual(3_000);
    const ids = load(0)
      .all()
      .map((item) => item.id);
    expect(ids.at(-1)).toBe('c9');
    expect(ids).not.toContain('c0');
  });

  it('arquivo corrompido: guarda um backup e começa vazio, sem travar', () => {
    writeFileSync(file, '{ isso não é json');
    const store = load();
    expect(store.size).toBe(0);
    expect(readdirSync(dir).some((name) => name.startsWith('history.corrupt-'))).toBe(true);
  });

  it('descarta só as conversas inválidas', () => {
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        conversations: [conversation('boa', 1), { id: 'ruim', messages: 'não é lista' }]
      })
    );
    expect(
      load()
        .all()
        .map((item) => item.id)
    ).toEqual(['boa']);
  });

  it('resposta salva em andamento volta como interrompida', () => {
    const broken = conversation('x', 1);
    const second = broken.messages[1];
    if (second !== undefined) second.status = 'streaming';
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, conversations: [broken] }));
    expect(load().latest()?.messages[1]?.status).toBe('interrupted');
  });

  it('limpar apaga disco e memória, mesmo com gravação pendente', async () => {
    const store = load();
    store.save(conversation('a', 0));
    await store.clear();
    expect(store.size).toBe(0);
    expect(existsSync(file)).toBe(false);
    await store.flush();
    expect(existsSync(file)).toBe(false);
  });

  it('flushSync grava na hora (usado ao sair)', () => {
    const { logger } = memoryLogger();
    const store = HistoryStore.load({
      filePath: file,
      retentionDays: 30,
      logger,
      now: () => NOW,
      writeDebounceMs: 60_000
    });
    store.save(conversation('a', 0));
    store.flushSync();
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      conversations: [{ id: 'a' }]
    });
  });
});
