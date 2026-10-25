/** Limites e tempos da conversa e da camada de IA (SPEC §8, §13, §20). */

/** Tamanho máximo de uma mensagem do usuário (validado no balão e no main). */
export const MAX_USER_MESSAGE_CHARS = 4000;

/** Tempos-limite de uma resposta (SPEC §20.5). */
export const AI_TIMEOUTS = {
  /** Sem primeiro token nesse tempo → TIMEOUT. */
  firstTokenMs: 30_000,
  /** Resposta inteira acima desse tempo → TIMEOUT. */
  totalMs: 120_000
} as const;

export interface AiTimeouts {
  firstTokenMs: number;
  totalMs: number;
}

/** O balão é pequeno: respostas curtas (SPEC §20.1). */
export const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

/** Quanto do histórico vai para o modelo: o que vier primeiro (SPEC §20.2). */
export const CONTEXT_HISTORY_LIMITS = { messages: 20, chars: 12_000 } as const;

/** Agrupamento dos pedaços de resposta enviados ao balão (SPEC §20.5). */
export const STREAM_DELTA_FLUSH_MS = 40;

/** Ritmo do modo Demo: pausa antes da primeira palavra e entre pedaços. */
export const DEMO_TIMING = { thinkingMs: 700, chunkMs: 28 } as const;

export interface DemoTiming {
  thinkingMs: number;
  chunkMs: number;
}

/** Limite do arquivo de histórico (SPEC §13): as conversas mais antigas saem primeiro. */
export const HISTORY_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const HISTORY_WRITE_DEBOUNCE_MS = 400;

/** Tamanho máximo de um texto copiado pelo botão "Copiar". */
export const MAX_COPY_CHARS = 200_000;
