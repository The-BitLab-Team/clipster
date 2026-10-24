import type { AnimationPreference } from '../schemas/settings';

export type MotionLevel = 'full' | 'reduced' | 'off';

/** Combina a preferência do app com `prefers-reduced-motion` do sistema (SPEC §14). */
export function resolveMotion(
  preference: AnimationPreference,
  systemPrefersReduced: boolean
): MotionLevel {
  if (preference === 'system') return systemPrefersReduced ? 'reduced' : 'full';
  return preference;
}
