import './character.css';
import { DRAG_THRESHOLD_DIP } from '../../shared/constants/ui';
import type { CharacterView } from '../../shared/character/states';
import { createTranslator, resolveLocale } from '../../shared/i18n';
import type { AppInfo } from '../../shared/ipc/api';
import type { Settings } from '../../shared/schemas/settings';
import { resolveMotion } from '../../shared/ui/motion';
import { installErrorReporting } from '../lib/errorReporting';
import type { CharacterController } from './controller';
import { placeholderPack } from './packs/placeholder';
import { createSvgRigController } from './svgRigController';

/**
 * Janela do personagem. Sem React: DOM, CSS e poucos listeners.
 * Desenha o estado que o main decide (SPEC §6.1), cuida do arrasto manual, do clique,
 * do menu de contexto e do clique através das áreas transparentes.
 */

installErrorReporting('character');

const api = window.clipster;
const root = document.getElementById('character');
if (root === null) throw new Error('Elemento #character não encontrado.');
const character: HTMLElement = root;

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const controller: CharacterController = createSvgRigController(
  character,
  placeholderPack,
  resolveMotion('system', reducedMotionQuery.matches)
);

function isOverFigure(clientX: number, clientY: number): boolean {
  const element = document.elementFromPoint(clientX, clientY);
  return element?.closest('[data-hit]') != null;
}

// ── Preferências, estado e rótulo acessível ────────────────────────────────

let settings: Settings | null = null;
let info: AppInfo | null = null;
let view: CharacterView = { state: controller.state, badge: false };

function render(): void {
  controller.setView(view);
  if (settings === null || info === null) return;
  const locale = resolveLocale(settings.general.language, info.systemLanguages);
  const t = createTranslator(locale);
  document.documentElement.lang = locale;
  character.setAttribute(
    'aria-label',
    t('character.label', { state: t(`character.state.${controller.state}`) })
  );
}

function applyMotion(): void {
  if (settings === null) return;
  controller.setMotion(resolveMotion(settings.appearance.animations, reducedMotionQuery.matches));
}

reducedMotionQuery.addEventListener('change', applyMotion);

// ── Clique através das áreas transparentes (SPEC §19.3) ────────────────────

let ignoringMouse = true; // o main cria a janela já ignorando o mouse (Windows/macOS)

function setIgnoreMouse(ignore: boolean): void {
  if (info?.capabilities.clickThrough !== true || ignore === ignoringMouse) return;
  ignoringMouse = ignore;
  api.character.setClickThrough(ignore);
}

// ── Arrasto manual e clique (SPEC §19.2) ───────────────────────────────────

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

function activate(): void {
  controller.poke();
  api.character.click();
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
    activate();
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
    activate();
  } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    api.character.openContextMenu();
  }
});

// ── Inicialização ──────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Inscreve antes de consultar, para não perder uma mudança que aconteça no meio.
  api.character.onView((next) => {
    view = next;
    render();
  });
  api.settings.onChange((next) => {
    settings = next;
    applyMotion();
    render();
  });

  const [settingsResult, infoResult, viewResult] = await Promise.all([
    api.settings.get(),
    api.app.info(),
    api.character.getView()
  ]);
  if (!settingsResult.ok || !infoResult.ok || !viewResult.ok) {
    api.log.write('error', 'character.init_failed');
    return;
  }
  settings = settingsResult.data;
  info = infoResult.data;
  view = viewResult.data;
  if (!info.capabilities.clickThrough) ignoringMouse = false;
  applyMotion();
  render();
}

void init();
