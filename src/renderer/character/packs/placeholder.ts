import manifestJson from '../../../../assets/character/placeholder/manifest.json';
import rigMarkup from '../../../../assets/character/placeholder/clipster.svg?raw';
import '../../../../assets/character/placeholder/poses.css';
import { parseCharacterManifest } from '../../../shared/schemas/characterManifest';
import type { SvgRigPack } from '../svgRigController';

/**
 * Pacote de arte em uso. Para trocar o personagem, crie outra pasta em
 * assets/character/ com manifest.json, o SVG e o CSS de poses, e importe-a aqui.
 * O manifesto é validado com Zod ao carregar (SPEC §5.4).
 */
export const placeholderPack: SvgRigPack = {
  manifest: parseCharacterManifest(manifestJson),
  rigMarkup
};
