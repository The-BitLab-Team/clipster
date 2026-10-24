import './character.css';
import idleSvg from '../../../assets/character/placeholder/idle.svg?raw';
import {
  BLINK_INTERVAL_MS,
  DRAG_THRESHOLD_DIP,
  POKE_ANIMATION_MS
} from '../../shared/constants/ui';
import { createTranslator, resolveLocale } from '../../shared/i18n';
import type { AppInfo } from '../../shared/ipc/api';
import type { Settings } from '../../shared/schemas/settings';
import { resolveMotion, type MotionLevel } from '../../shared/ui/motion';
import { installErrorReporting } from '../lib/errorReporting';

/**
 * Janela do personagem (Fase 1). Sem React: só DOM, CSS e poucos listeners.
 * Responsável por: desenhar o placeholder, arrasto manual, clique, menu de contexto,
 * clique através das áreas transparentes e uma piscada ocasional.
 */

installErrorReporting('character');

const api = window.clipster;
const root = document.getElementById('character');
if (root === null) throw new Error('Elemento #character não encontrado.');
const character: HTMLElement = root;

// ── Desenho ─────────────────────────────────────────────────────────────

function mountSvg(target: HTMLElement, markup: string): void {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = parsed.documentElement;
  if (svg.nodeName !== 'svg') throw new Error('Asset do personagem inválido.');
  target.replaceChildren(document.importNode(svg, true));
}

mountSvg(character, idleSvg);

function isOverFigure(clientX: number, clientY: number): boolean {
  const element = document.elementFromPoint(clientX, clientY);
  return element?.closest('[data-hit]') != null;
}

// ── Preferências (idioma e movimento) ───────────────────────────────────

let settings: Settings | null = null;
let info: AppInfo | null = null;
let motion: MotionLevel = 'full';
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function applyPreferences(): void {
  if (settings === null || info === null) return;
  const locale = resolveLocale(settings.general.language, info.systemLanguages);
  const t = createTranslator(locale);
  document.documentElement.lang = locale;
  character.setAttribute('aria-label', t('character.label'));

  motion = resolveMotion(settings.appearance.animations, reducedMotionQuery.matches);
  document.documentElement.dataset.motion = motion;
  scheduleBlink();
}

reducedMotionQuery.addEventListener('change', applyPreferences);

// ── Piscada ocasional (um único timer, pausado quando oculto) ───────────

let blinkTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleBlink(): void {
  if (blinkTimer !== null) clearTimeout(blinkTimer);
  blinkTimer = null;
  if (motion !== 'full' || document.hidden) return;
  const delay =
    BLINK_INTERVAL_MS.min + Math.random() * (BLINK_INTERVAL_MS.max - BLINK_INTERVAL_MS.min);
  blinkTimer = setTimeout(() => {
    character.classList.add('is-blinking');
    setTimeout(() => {
      character.classList.remove('is-blinking');
    }, 200);
    scheduleBlink();
  }, delay);
}

document.addEventListener('visibilitychange', scheduleBlink);

function poke(): void {
  if (motion === 'off') return;
  character.classList.remove('is-poked');
  // Força reflow para reiniciar a animação se o usuário clicar várias vezes.
  character.getBoundingClientRect();
  character.classList.add('is-poked');
  setTimeout(() => {
    character.classList.remove('is-poked');
  }, POKE_ANIMATION_MS);
}

// ── Clique através das áreas transparentes (SPEC §19.3) ─────────────────

let ignoringMouse = true; // o main cria a janela já ignorando o mouse (Windows/macOS)

function setIgnoreMouse(ignore: boolean): void {
  if (info?.capabilities.clickThrough !== true || ignore === ignoringMouse) return;
  ignoringMouse = ignore;
  api.character.setClickThrough(ignore);
}

// ── Arrasto manual e clique (SPEC §19.2) ────────────────────────────────

interface PointerSession {
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
}

let session: PointerSession | null = null;
let pendingDelta: { dx: number; dy: number } | null = null;
let frame = 0;

function flushDrag(): void {
  frame = 0;
  if (pendingDelta !== null) {
    api.character.dragMove(pendingDelta);
    pendingDelta = null;
  }
}

function endSession(completed: boolean): void {
  const current = session;
  if (current === null) return;
  session = null;
  if (character.hasPointerCapture(current.pointerId)) {
    character.releasePointerCapture(current.pointerId);
  }
  if (current.dragging) {
    if (frame !== 0) cancelAnimationFrame(frame);
    flushDrag();
    api.character.dragEnd();
    character.classList.remove('is-dragging');
  } else if (completed) {
    poke();
    api.character.click();
  }
}

character.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !isOverFigure(event.clientX, event.clientY)) return;
  event.preventDefault();
  setIgnoreMouse(false);
  session = {
    pointerId: event.pointerId,
    startX: event.screenX,
    startY: event.screenY,
    dragging: false
  };
  character.setPointerCapture(event.pointerId);
});

character.addEventListener('pointermove', (event) => {
  const current = session;
  if (current?.pointerId !== event.pointerId) return;
  const dx = event.screenX - current.startX;
  const dy = event.screenY - current.startY;
  if (!current.dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_DIP) {
    current.dragging = true;
    character.classList.add('is-dragging');
    api.character.dragStart();
  }
  if (current.dragging) {
    pendingDelta = { dx, dy };
    if (frame === 0) frame = requestAnimationFrame(flushDrag);
  }
});

character.addEventListener('pointerup', (event) => {
  if (session?.pointerId === event.pointerId) endSession(true);
});
character.addEventListener('pointercancel', () => {
  endSession(false);
});
character.addEventListener('lostpointercapture', () => {
  endSession(false);
});
window.addEventListener('blur', () => {
  endSession(false);
});

document.addEventListener('mousemove', (event) => {
  if (session !== null) return;
  setIgnoreMouse(!isOverFigure(event.clientX, event.clientY));
});
document.documentElement.addEventListener('mouseleave', () => {
  if (session === null) setIgnoreMouse(true);
});

character.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (isOverFigure(event.clientX, event.clientY)) api.character.openContextMenu();
});

character.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    poke();
    api.character.click();
  } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    api.character.openContextMenu();
  }
});

// ── Inicialização ────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const [settingsResult, infoResult] = await Promise.all([api.settings.get(), api.app.info()]);
  if (!settingsResult.ok || !infoResult.ok) {
    api.log.write('error', 'character.init_failed');
    return;
  }
  settings = settingsResult.data;
  info = infoResult.data;
  if (!info.capabilities.clickThrough) ignoringMouse = false;
  applyPreferences();

  api.settings.onChange((next) => {
    settings = next;
    applyPreferences();
  });
}

void init();
