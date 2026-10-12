import type { Team } from '../../../shared/types';
import type { Layout } from '../../../shared/arenaGeometry';
export { CANVAS_W, CANVAS_H, slotLayout, teamX, facingOf, gunHeight, bulletLaneFeet, womanScale, type Layout } from '../../../shared/arenaGeometry';
export const barrelX = (L: Layout, team: Team) => (team === 'sheriffs' ? L.sheriffBarrel : L.outlawBarrel);
/** Lowest y a floating badge may sit at without hiding under the top HUD. */
export const BADGE_MIN_Y = 140;
/** Height of a barrel, in canvas px. */
export const barrelHeight = (L: Layout) => 88 * L.s;

export { rand } from '../../../shared/random';
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
