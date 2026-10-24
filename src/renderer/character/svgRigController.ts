import { BLINK_INTERVAL_MS, POKE_ANIMATION_MS } from '../../shared/constants/ui';
import type { CharacterState, CharacterView } from '../../shared/character/states';
import {
  allowsBlink,
  resolvePose,
  type CharacterManifest
} from '../../shared/schemas/characterManifest';
import type { MotionLevel } from '../../shared/ui/motion';
import type { CharacterController } from './controller';

/**
 * Adaptador do formato `svg-rig`: monta o SVG uma vez e troca de pose só mudando
 * atributos (`data-state`, `data-badge`). As poses e animações ficam no CSS do pacote.
 * Nenhum timer contínuo: a única agenda é a piscada ocasional, e só em poses que a permitem.
 */

export interface SvgRigPack {
  manifest: CharacterManifest;
  rigMarkup: string;
}

const BLINK_DURATION_MS = 200;

function mountSvg(target: HTMLElement, markup: string): void {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = parsed.documentElement;
  if (svg.nodeName !== 'svg') throw new Error('Rig do personagem inválido.');
  target.replaceChildren(document.importNode(svg, true));
}

export function createSvgRigController(
  root: HTMLElement,
  pack: SvgRigPack,
  initialMotion: MotionLevel
): CharacterController {
  mountSvg(root, pack.rigMarkup);

  let state: CharacterState = pack.manifest.fallbackState;
  let motion: MotionLevel = initialMotion;
  let blinkTimer: ReturnType<typeof setTimeout> | null = null;
  let pokeTimer: ReturnType<typeof setTimeout> | null = null;

  const clearBlink = (): void => {
    if (blinkTimer !== null) clearTimeout(blinkTimer);
    blinkTimer = null;
  };

  const scheduleBlink = (): void => {
    clearBlink();
    if (motion !== 'full' || document.hidden || !allowsBlink(pack.manifest, state)) return;
    const delay =
      BLINK_INTERVAL_MS.min + Math.random() * (BLINK_INTERVAL_MS.max - BLINK_INTERVAL_MS.min);
    blinkTimer = setTimeout(() => {
      root.classList.add('is-blinking');
      setTimeout(() => {
        root.classList.remove('is-blinking');
      }, BLINK_DURATION_MS);
      scheduleBlink();
    }, delay);
  };

  const onVisibility = (): void => {
    scheduleBlink();
  };
  document.addEventListener('visibilitychange', onVisibility);

  const applyMotion = (): void => {
    document.documentElement.dataset.motion = motion;
  };

  const apply = (view: CharacterView): void => {
    state = resolvePose(pack.manifest, view.state);
    root.dataset.state = state;
    root.dataset.badge = String(view.badge);
    scheduleBlink();
  };

  applyMotion();
  apply({ state, badge: false });

  return {
    get state() {
      return state;
    },
    setView(view) {
      if (
        resolvePose(pack.manifest, view.state) === state &&
        root.dataset.badge === String(view.badge)
      ) {
        return;
      }
      apply(view);
    },
    setMotion(level) {
      motion = level;
      applyMotion();
      scheduleBlink();
    },
    poke() {
      if (motion === 'off') return;
      root.classList.remove('is-poked');
      // Força reflow para reiniciar a animação se o usuário clicar várias vezes.
      root.getBoundingClientRect();
      root.classList.add('is-poked');
      if (pokeTimer !== null) clearTimeout(pokeTimer);
      pokeTimer = setTimeout(() => {
        root.classList.remove('is-poked');
      }, POKE_ANIMATION_MS);
    },
    destroy() {
      clearBlink();
      if (pokeTimer !== null) clearTimeout(pokeTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
