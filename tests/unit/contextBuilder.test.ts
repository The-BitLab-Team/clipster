import { userInfo, hostname, homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  buildChatContext,
  osDisplayName,
  trimHistory,
  type ChatEnvironment
} from '../../src/main/ai/contextBuilder';
import type { ConversationMessage } from '../../src/shared/ai/conversation';
import { PERSONALITIES } from '../../src/shared/personalities';

const ENV: ChatEnvironment = {
  appName: 'Clipster',
  appVersion: '0.3.0',
  platform: 'win32',
  now: new Date('2026-10-24T21:30:00Z'),
  timeZone: 'America/Sao_Paulo'
};

let seq = 0;
function message(
  role: ConversationMessage['role'],
  content: string,
  status: ConversationMessage['status'] = 'complete'
): ConversationMessage {
  seq += 1;
  return { id: `m${seq}`, role, content, createdAt: ENV.now.toISOString(), status };
}

describe('ContextBuilder (SPEC §20.2)', () => {
  it('monta base + personalidade, com idioma, sistema, data e app', () => {
    const { system, messages } = buildChatContext({
      personality: PERSONALITIES.witty,
      uiLocale: 'pt-BR',
      environment: ENV,
      history: [message('user', 'Como eu renomeio um arquivo?')]
    });
    expect(system.indexOf('Você é o Clipster')).toBe(0);
    expect(system.indexOf('Personalidade: Espirituoso')).toBeGreaterThan(
      system.indexOf('Se não souber algo')
    );
    expect(system).toContain('use português do Brasil');
    expect(system).toContain('O usuário usa Windows.');
    expect(system).toContain('(America/Sao_Paulo)');
    expect(system).toContain('sábado, 24 de outubro de 2026');
    expect(system).toContain('Clipster 0.3.0');
    expect(system).not.toMatch(/\{\w+\}/);
    expect(messages).toHaveLength(1);
  });

  it('a troca de personalidade muda só a camada de personalidade', () => {
    const input = {
      uiLocale: 'en' as const,
      environment: { ...ENV, platform: 'darwin' as const },
      history: [message('user', 'hi')]
    };
    const helpful = buildChatContext({ ...input, personality: PERSONALITIES.helpful }).system;
    const witty = buildChatContext({ ...input, personality: PERSONALITIES.witty }).system;
    expect(helpful).toContain('Personalidade: Prestativo');
    expect(witty).toContain('Personalidade: Espirituoso');
    expect(helpful).toContain('use inglês');
    expect(helpful).toContain('macOS');
    expect(helpful.split('Personalidade:')[0]).toBe(witty.split('Personalidade:')[0]);
  });

  it('não inclui dados do sistema que nunca podem entrar sem permissão', () => {
    const { system } = buildChatContext({
      personality: PERSONALITIES.helpful,
      uiLocale: 'pt-BR',
      environment: { ...ENV, platform: process.platform },
      history: [message('user', 'oi')]
    });
    for (const secret of [userInfo().username, hostname(), homedir()]) {
      if (secret.length >= 3) expect(system).not.toContain(secret);
    }
  });

  it('corta o histórico em 20 mensagens', () => {
    const history: ConversationMessage[] = [];
    for (let index = 0; index < 30; index += 1) {
      history.push(message(index % 2 === 0 ? 'user' : 'assistant', `mensagem ${index}`));
    }
    history.push(message('user', 'pergunta atual'));
    const trimmed = trimHistory(history);
    expect(trimmed.length).toBeLessThanOrEqual(20);
    expect(trimmed.at(-1)?.content).toBe('pergunta atual');
    expect(trimmed[0]?.role).toBe('user');
  });

  it('corta o histórico em ~12.000 caracteres', () => {
    const long = 'x'.repeat(5000);
    const history = [
      message('user', long),
      message('assistant', long),
      message('user', long),
      message('assistant', long),
      message('user', 'agora')
    ];
    const trimmed = trimHistory(history);
    const chars = trimmed.reduce((total, item) => total + item.content.length, 0);
    expect(chars).toBeLessThanOrEqual(12_000);
    expect(trimmed.at(-1)?.content).toBe('agora');
    expect(trimmed[0]?.role).toBe('user');
  });

  it('a pergunta atual sempre entra, mesmo se for maior que o limite', () => {
    const trimmed = trimHistory([message('user', 'y'.repeat(20_000))]);
    expect(trimmed).toHaveLength(1);
  });

  it('deixa de fora erros, respostas vazias e respostas em andamento', () => {
    const history = [
      message('user', 'primeira'),
      message('assistant', 'parcial', 'interrupted'),
      message('user', 'segunda'),
      message('assistant', '', 'error'),
      message('user', 'terceira'),
      message('assistant', 'em andamento', 'streaming')
    ];
    expect(trimHistory(history).map((item) => item.content)).toEqual([
      'primeira',
      'parcial',
      'segunda',
      'terceira'
    ]);
  });

  it('nomes de sistema para o modelo', () => {
    expect(osDisplayName('win32')).toBe('Windows');
    expect(osDisplayName('darwin')).toBe('macOS');
    expect(osDisplayName('linux')).toBe('Linux');
  });
});
