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

/** Piscada do placeholder: intervalo aleatório entre estes limites. */
export const BLINK_INTERVAL_MS = { min: 4000, max: 8000 } as const;
export const POKE_ANIMATION_MS = 420;

export const SETTINGS_WINDOW_SIZE = {
  width: 720,
  height: 520,
  minWidth: 600,
  minHeight: 440
} as const;
