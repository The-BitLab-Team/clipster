import { describe, expect, it } from 'vitest';
import {
  addNotice,
  applyChatEvent,
  EMPTY_CHAT,
  fromSnapshot,
  plainText,
  timeline
} from '../../src/renderer/balloon/chatState';
import type { ConversationMessage } from '../../src/shared/ai/conversation';
import { createTranslator } from '../../src/shared/i18n';
import { errorActions, errorMessage, showsSupportCode } from '../../src/shared/errors/messages';
import { StoredMessageSchema } from '../../src/shared/schemas/conversation';
import { CLIPSTER_ERROR_CODES } from '../../src/shared/errors/codes';

const AT = '2026-10-24T12:00:00.000Z';

function msg(
  id: string,
  role: ConversationMessage['role'],
  content: string,
  status: ConversationMessage['status'] = 'complete'
): ConversationMessage {
  return { id, role, content, createdAt: AT, status };
}

describe('estado da conversa no balão', () => {
  it('start → delta → done reconstrói a resposta e libera o envio', () => {
    let state = fromSnapshot({ id: 'c1', messages: [], activeRequestId: null });
    state = applyChatEvent(state, {
      type: 'start',
      requestId: 'r1',
      messages: [msg('u1', 'user', 'oi'), msg('a1', 'assistant', '', 'streaming')]
    });
    expect(state.activeRequestId).toBe('r1');
    state = applyChatEvent(state, { type: 'delta', requestId: 'r1', messageId: 'a1', text: 'Olá' });
    state = applyChatEvent(state, { type: 'delta', requestId: 'r1', messageId: 'a1', text: '!' });
    expect(state.messages[1]?.content).toBe('Olá!');
    state = applyChatEvent(state, {
      type: 'done',
      requestId: 'r1',
      message: msg('a1', 'assistant', 'Olá!')
    });
    expect(state.activeRequestId).toBeNull();
    expect(state.messages.map((m) => m.status)).toEqual(['complete', 'complete']);
  });

  it('delta de mensagem desconhecida é ignorado; reset troca tudo e apaga avisos', () => {
    let state = addNotice(EMPTY_CHAT, 'n1', 'Modo Espirituoso ativado.');
    state = applyChatEvent(state, { type: 'delta', requestId: 'x', messageId: 'nada', text: 'a' });
    expect(state.messages).toEqual([]);
    state = applyChatEvent(state, {
      type: 'reset',
      conversation: { id: 'c2', messages: [msg('u', 'user', 'oi')], activeRequestId: null }
    });
    expect(state).toMatchObject({ conversationId: 'c2', notices: [] });
  });

  it('avisos aparecem depois da mensagem em que surgiram', () => {
    let state = fromSnapshot({
      id: 'c',
      messages: [msg('u1', 'user', 'a'), msg('a1', 'assistant', 'b')],
      activeRequestId: null
    });
    state = addNotice(state, 'n1', 'troca');
    state = applyChatEvent(state, {
      type: 'start',
      requestId: 'r',
      messages: [msg('u2', 'user', 'c'), msg('a2', 'assistant', '', 'streaming')]
    });
    const order = timeline(state).map((item) =>
      item.kind === 'message' ? item.message.id : item.notice.id
    );
    expect(order).toEqual(['u1', 'a1', 'n1', 'u2', 'a2']);

    const empty = addNotice(EMPTY_CHAT, 'n0', 'acordei');
    const [only] = timeline(empty);
    expect(only?.kind === 'notice' && only.notice.id).toBe('n0');
  });

  it('texto para leitor de tela sem símbolos de Markdown', () => {
    expect(plainText('1. Pressione **F2** e `Enter`.\n## Dica\n*cuidado*')).toBe(
      '1. Pressione F2 e Enter.\nDica\ncuidado'
    );
  });
});

describe('mensagens de erro (SPEC §23)', () => {
  const pt = createTranslator('pt-BR');

  it('todos os códigos exibidos têm texto e ações conhecidas', () => {
    for (const code of CLIPSTER_ERROR_CODES) {
      if (code === 'CANCELLED') continue;
      const text = errorMessage(
        pt,
        { code, supportCode: 'CLP-1A2B', retryAfterSeconds: 5 },
        'helpful'
      );
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/\{\w+\}/);
      errorActions({ code });
    }
  });

  it('Espirituoso suaviza só onde é permitido', () => {
    const timeout = { code: 'TIMEOUT' as const };
    expect(errorMessage(pt, timeout, 'witty')).not.toBe(errorMessage(pt, timeout, 'helpful'));
    const auth = { code: 'AUTH_INVALID' as const };
    expect(errorMessage(pt, auth, 'witty')).toBe(errorMessage(pt, auth, 'helpful'));
  });

  it('espera do RATE_LIMITED e código de suporte', () => {
    expect(errorMessage(pt, { code: 'RATE_LIMITED', retryAfterSeconds: 20 }, 'helpful')).toContain(
      '20 s'
    );
    expect(errorMessage(pt, { code: 'RATE_LIMITED' }, 'helpful')).toContain('daqui a pouco');
    expect(errorMessage(pt, { code: 'UNKNOWN', supportCode: 'CLP-9F00' }, 'helpful')).toContain(
      'CLP-9F00'
    );
    expect(showsSupportCode({ code: 'UNKNOWN', supportCode: 'CLP-9F00' })).toBe(false);
    expect(showsSupportCode({ code: 'TIMEOUT', supportCode: 'CLP-9F00' })).toBe(true);
    expect(errorActions({ code: 'PROVIDER_NOT_CONFIGURED' })).toEqual(['configureAi', 'useDemo']);
  });

  it('cota/cobrança: painel da conta só quando o main informou um painel conhecido', () => {
    expect(errorActions({ code: 'QUOTA_OR_BILLING' })).toEqual(['openSettings']);
    expect(
      errorActions({ code: 'QUOTA_OR_BILLING', consoleUrl: 'https://platform.claude.com/' })
    ).toEqual(['openConsole', 'openSettings']);
    const message = (consoleUrl: string) => ({
      id: 'm1',
      role: 'assistant',
      content: '',
      createdAt: '2026-10-24T21:30:00.000Z',
      status: 'error',
      error: { code: 'QUOTA_OR_BILLING', consoleUrl }
    });
    expect(StoredMessageSchema.safeParse(message('https://platform.openai.com/')).success).toBe(
      true
    );
    expect(StoredMessageSchema.safeParse(message('https://phishing.example/')).success).toBe(false);
  });
});
