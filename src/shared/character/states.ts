/** Estados do personagem (SPEC §5.3). `dragging` é opcional na arte: sem pose, usa o fallback. */
export const CHARACTER_STATES = [
  'idle',
  'listening',
  'thinking',
  'talking',
  'happy',
  'confused',
  'sleeping',
  'error',
  'notification',
  'dragging'
] as const;

export type CharacterState = (typeof CHARACTER_STATES)[number];

export function isCharacterState(value: unknown): value is CharacterState {
  return typeof value === 'string' && (CHARACTER_STATES as readonly string[]).includes(value);
}

/** O que a janela do personagem precisa saber para se desenhar. */
export interface CharacterView {
  state: CharacterState;
  /** Há um aviso ainda não visto: mostra um indicador discreto (SPEC §6.2). */
  badge: boolean;
}
