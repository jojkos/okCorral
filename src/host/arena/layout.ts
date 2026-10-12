import type { Team } from '../../../shared/types';

export const CANVAS_W = 1600;
export const CANVAS_H = 900;

export interface Layout {
  n: number;
  top: number;
  slotHeight: number;
  /** Lane centre lines. */
  ys: number[];
  /** Where boots touch the boardwalk in each lane. */
  feet: number[];
  /** Character scale (1 ≈ 128px tall). */
  s: number;
  sheriffX: number;
  sheriffBarrel: number;
  outlawBarrel: number;
  outlawX: number;
  midX: number;
}

export function slotLayout(n: number): Layout {
  const top = 142;
  const bottom = 872;
  const slotHeight = (bottom - top) / n;
  // Leave ~40px above each head so action badges never collide with the lane above / the HUD.
  const s = Math.max(0.55, Math.min(1, slotHeight / 160));
  const ys = Array.from({ length: n }, (_, i) => top + slotHeight * (i + 0.5));
  const feet = ys.map((y) => y + slotHeight * 0.5 - 8 * s - 6);
  return {
    n, top, slotHeight, ys, feet, s,
    sheriffX: 300,
    sheriffBarrel: 410,
    outlawBarrel: 1190,
    outlawX: 1300,
    midX: 800,
  };
}

export const teamX = (L: Layout, team: Team) => (team === 'sheriffs' ? L.sheriffX : L.outlawX);
export const barrelX = (L: Layout, team: Team) => (team === 'sheriffs' ? L.sheriffBarrel : L.outlawBarrel);
/** Lowest y a floating badge may sit at without hiding under the top HUD. */
export const BADGE_MIN_Y = 140;
export const facingOf = (team: Team): 1 | -1 => (team === 'sheriffs' ? 1 : -1);
/** Height of the gun hand above the feet, in canvas px. */
export const gunHeight = (L: Layout) => 92 * L.s;
/** Height of a barrel, in canvas px. */
export const barrelHeight = (L: Layout) => 74 * L.s;
/** Lane baseline for bullets, including wind-blown misses beyond either edge. */
export const bulletLaneFeet = (L: Layout, slot: number) => {
  if (slot < 0) return L.feet[0] - L.slotHeight;
  if (slot >= L.n) return L.feet[L.n - 1] + L.slotHeight;
  return L.feet[slot];
};

export function rand(seed: number) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOutBack = (t: number) => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const nameSeed = (name: string) => Array.from(name).reduce((n, c) => n + c.charCodeAt(0), 0);

export const TEAM_COL = {
  sheriffs: { main: '#5fb3b0', dark: '#285462', glow: 'rgba(95,179,176,', text: '#bff0e8' },
  outlaws: { main: '#d0714f', dark: '#663931', glow: 'rgba(208,113,79,', text: '#ffd0b8' },
} as const;

export const FONT = {
  title: '"Rye", Georgia, serif',
  mono: '"Space Mono", ui-monospace, monospace',
};
