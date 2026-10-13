import { CANVAS_H, bulletLaneFeet, womanScale, type Layout } from './arenaGeometry.js';
import type { WalkingWomanState } from './types.js';

/** The off-board lanes are beyond the whole sprite, not just beyond her feet.
 * All playable lanes retain their exact projectile/character coordinates. */
export function civilianLaneFeet(L: Layout, slot: number) {
  const first = L.feet[0], last = L.feet[L.n - 1];
  const top = -64, bottom = CANVAS_H + 180 * womanScale(L) + 64;
  if (slot < 0) return first + slot * (first - top);
  if (slot > L.n - 1) return last + (slot - L.n + 1) * (bottom - last);
  return bulletLaneFeet(L, slot);
}

/** Inverse for a contact at a fractional lane, including the entrance margin. */
export function civilianSlotAtFeet(L: Layout, feet: number) {
  const first = L.feet[0], last = L.feet[L.n - 1];
  if (feet < first) return (feet - first) / (first - civilianLaneFeet(L, -1));
  if (feet > last) return L.n - 1 + (feet - last) / (civilianLaneFeet(L, L.n) - last);
  return (feet - first) / L.slotHeight;
}

/** Rendering and swept cart collision share the complete, extended walk. */
export function civilianFeet(L: Layout, woman: Pick<WalkingWomanState, 'slot' | 'fromSlot'>, progress: number) {
  if (woman.slot === null) return null;
  const from = civilianLaneFeet(L, woman.fromSlot ?? woman.slot);
  const to = civilianLaneFeet(L, woman.slot);
  return from + (to - from) * Math.max(0, Math.min(1, progress));
}
