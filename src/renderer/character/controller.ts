import type { CharacterState, CharacterView } from '../../shared/character/states';
import type { MotionLevel } from '../../shared/ui/motion';

/**
 * Abstração de desenho do personagem (SPEC §5.5). Só renderiza o que recebe: quem decide
 * o estado é a máquina de estados no main. Cada formato de arte (svg-rig, sprite sheet,
 * Lottie…) implementa esta interface num adaptador próprio.
 */
export interface CharacterController {
  /** Pose atualmente desenhada (já resolvida pelo fallback do pacote). */
  readonly state: CharacterState;
  setView(view: CharacterView): void;
  setMotion(level: MotionLevel): void;
  /** Reação curta a um clique (independe do estado). */
  poke(): void;
  destroy(): void;
}
