/** Tamanho do personagem em DIP com escala 100%. Deve bater com o viewBox do asset. */
export const CHARACTER_BASE_SIZE = { width: 160, height: 160 } as const;

export const CHARACTER_SCALE = { min: 0.75, max: 1.5, step: 0.05 } as const;

/** Deslocamento mínimo (DIP) para um clique virar arrasto (SPEC §19.2). */
export const DRAG_THRESHOLD_DIP = 4;

/** Margem até a borda da área útil quando não há posição salva (SPEC §19.4). */
export const DEFAULT_SCREEN_MARGIN_DIP = 24;

export const POSITION_SAVE_DEBOUNCE_MS = 500;
export const SETTINGS_WRITE_DEBOUNCE_MS = 300;
export const DISPLAY_CHANGE_DEBOUNCE_MS = 250;

/** Durações dos estados transitórios do personagem (SPEC §6.2). */
export const CHARACTER_TIMINGS = {
  happyMs: 1500,
  confusedMs: 1200,
  /** Sem digitar por este tempo, `listening` volta a `idle`. */
  listeningMs: 3000,
  errorMs: 8000,
  notificationMs: 30_000,
  /** Pré-visualização de estados (só em desenvolvimento). */
  previewMs: 4000
} as const;

export type CharacterTimings = { readonly [K in keyof typeof CHARACTER_TIMINGS]: number };

/** Piscada do placeholder: intervalo aleatório entre estes limites. */
export const BLINK_INTERVAL_MS = { min: 4000, max: 8000 } as const;
export const POKE_ANIMATION_MS = 420;

/** O balão é criado escondido alguns segundos após iniciar, para abrir na hora (SPEC §19.5). */
export const BALLOON_PRECREATE_DELAY_MS = 1500;
/** Na primeira execução, o balão com a saudação aparece depois deste tempo (SPEC §9). */
export const FIRST_RUN_BALLOON_DELAY_MS = 1200;
/** Intervalo mínimo entre avisos de "digitando" enviados pelo balão. */
export const TYPING_NOTIFY_INTERVAL_MS = 1000;

export const SETTINGS_WINDOW_SIZE = {
  width: 720,
  height: 520,
  minWidth: 600,
  minHeight: 440
} as const;
