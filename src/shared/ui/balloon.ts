/** Tipos do balão de conversa compartilhados entre main e balão (SPEC §8). */

/** Onde o balão ficou em relação ao personagem, para desenhar o "rabicho". */
export interface BalloonPlacement {
  /** `above`: o rabicho fica embaixo, apontando para o personagem. */
  vertical: 'above' | 'below';
  /** Posição horizontal da ponta do rabicho, em DIP a partir da borda esquerda da janela. */
  tailX: number;
}

export interface BalloonShown {
  /** Aberto por ação do usuário: o campo de texto recebe o foco. */
  focus: boolean;
  /** O personagem estava dormindo quando foi clicado. */
  wokeUp: boolean;
}

/** Medidas do balão em DIP, com escala do chat 100% (SPEC §8.1). */
export const BALLOON_SIZE = {
  width: 340,
  /** Altura máxima do conteúdo; acima disso a lista de mensagens rola. */
  maxContentHeight: 460,
  /** Altura do rabicho. */
  tail: 12,
  /** Folga transparente em volta, para a sombra. */
  pad: 10
} as const;

export const CHAT_SCALE = { min: 0.85, max: 1.3, step: 0.05 } as const;
