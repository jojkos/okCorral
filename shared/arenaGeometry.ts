import type { Team } from './types.js';

// World coordinates shared by rendering and authoritative projectile collision.
export const CANVAS_W = 1600;
export const CANVAS_H = 900;
export interface Layout {
  n: number; top: number; slotHeight: number; ys: number[]; feet: number[];
  s: number; sheriffX: number; sheriffBarrel: number; outlawBarrel: number; outlawX: number; midX: number;
}
export function slotLayout(n: number): Layout {
  const top = 142, slotHeight = (872 - top) / n;
  const s = Math.max(0.55, Math.min(1, slotHeight / 160));
  const ys = Array.from({ length: n }, (_, i) => top + slotHeight * (i + 0.5));
  const feet = ys.map(y => y + slotHeight * 0.5 - 8 * s - 6);
  return { n, top, slotHeight, ys, feet, s, sheriffX: 300, sheriffBarrel: 410, outlawBarrel: 1190, outlawX: 1300, midX: 800 };
}
export const teamX = (L: Layout, team: Team) => team === 'sheriffs' ? L.sheriffX : L.outlawX;
export const facingOf = (team: Team): 1 | -1 => team === 'sheriffs' ? 1 : -1;
export const gunHeight = (L: Layout) => 92 * L.s;
export const womanScale = (L: Layout) => Math.max(0.62, L.s * 0.92);
/** Extrapolates beyond the board for wind-assisted off-board aiming. */
export const bulletLaneFeet = (L: Layout, slot: number) => L.feet[0] + slot * L.slotHeight;
