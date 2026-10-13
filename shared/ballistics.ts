import type { Team, WalkingWomanState } from './types.js';
import { bulletLaneFeet, facingOf, gunHeight, slotLayout, teamX, womanScale, type Layout } from './arenaGeometry.js';
import { civilianLaneFeet } from './civilianGeometry.js';

export interface ShotCurve {
  fromX: number; fromY: number; controlX: number; controlY: number; toX: number; toY: number;
}
export interface ShotFlight extends ShotCurve {
  // An optional final segment reaches cover/body without bending the earlier
  // street crossing. Civilian collision must not depend on the far target.
  via?: { x: number; y: number; controlX: number; controlY: number; t: number };
}
export function playerShotCurve(L: Layout, team: Team, slot: number, aimedSlot: number, targetSlot: number): ShotCurve {
  const dir = facingOf(team);
  const fromX = teamX(L, team) + dir * 65 * L.s;
  const fromY = bulletLaneFeet(L, slot) - gunHeight(L);
  return {
    fromX, fromY, controlX: L.midX,
    controlY: (fromY + bulletLaneFeet(L, aimedSlot) - gunHeight(L)) / 2,
    toX: 2 * L.midX - fromX, toY: bulletLaneFeet(L, targetSlot) - gunHeight(L),
  };
}
export function curvePoint(c: ShotCurve, t: number) {
  const u = 1 - t;
  return {
    x: u * u * c.fromX + 2 * u * t * c.controlX + t * t * c.toX,
    y: u * u * c.fromY + 2 * u * t * c.controlY + t * t * c.toY,
    dx: 2 * u * (c.controlX - c.fromX) + 2 * t * (c.toX - c.controlX),
    dy: 2 * u * (c.controlY - c.fromY) + 2 * t * (c.toY - c.controlY),
  };
}
/** Exact de Casteljau prefix (or extrapolation), never retarget the curve. */
export function trimCurve(c: ShotCurve, t: number): ShotCurve {
  const end = curvePoint(c, t);
  return { fromX: c.fromX, fromY: c.fromY,
    controlX: c.fromX + (c.controlX - c.fromX) * t,
    controlY: c.fromY + (c.controlY - c.fromY) * t, toX: end.x, toY: end.y };
}
export function finishShot(c: ShotCurve, toX: number, toY: number): ShotFlight {
  // 60% lies beyond the entire civilian silhouette from either direction.
  const split = 0.6, point = curvePoint(c, split), first = trimCurve(c, split);
  const endT = (toX - c.fromX) / (c.toX - c.fromX);
  return { ...first, toX, toY, via: { x: point.x, y: point.y, t: split / endT,
    controlX: point.x + point.dx * (endT - split) / 2,
    controlY: point.y + point.dy * (endT - split) / 2 } };
}
export function flightPoint(c: ShotFlight, t: number) {
  if (!c.via) return curvePoint(c, t);
  const v = c.via;
  return t <= v.t
    ? curvePoint({ ...c, toX: v.x, toY: v.y }, t / v.t)
    : curvePoint({ fromX: v.x, fromY: v.y, controlX: v.controlX, controlY: v.controlY, toX: c.toX, toY: c.toY }, (t - v.t) / (1 - v.t));
}

function roots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-9) return Math.abs(b) < 1e-9 ? [] : [-c / b];
  const d = b * b - 4 * a * c;
  return d < 0 ? [] : [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)];
}
/** First intersection with the standing body, not with the destination lane.
 * A tapered silhouette follows head, shoulders, arms, skirt and boots; cosmetic
 * stride/basket motion doesn't change the authoritative hitbox mid-volley. */
export function civilianIntersection(c: ShotCurve, L: Layout, slot: number): number | null {
  const s = womanScale(L), feet = civilianLaneFeet(L, slot);
  const outline = [[-17,-167],[17,-167],[22,-126],[30,-114],[32,-72],[25,-64],[35,-17],[21,-13],[21,2],[-21,2],[-21,-13],[-35,-17],[-25,-64],[-32,-72],[-30,-114],[-22,-126]];
  const points = outline.map(([x,y]) => ({x: L.midX + x*s, y: feet + y*s}));
  let first: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i+1) % points.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const cross = (x: number, y: number) => x * dy - y * dx;
    for (const t of roots(cross(c.fromX - 2*c.controlX + c.toX, c.fromY - 2*c.controlY + c.toY),
      cross(2*(c.controlX-c.fromX), 2*(c.controlY-c.fromY)), cross(c.fromX-a.x, c.fromY-a.y))) {
      if (t < 0 || t > 1) continue;
      const p = curvePoint(c, t);
      const along = ((p.x-a.x)*dx + (p.y-a.y)*dy) / (dx*dx + dy*dy);
      if (along >= -1e-7 && along <= 1+1e-7 && (first === null || t < first)) first = t;
    }
  }
  return first;
}
export function shotCivilianHit(slots: number, team: Team, slot: number, path: {aimedSlot: number; targetSlot: number}, woman: WalkingWomanState) {
  // A survivor who has finished leaving is no longer part of the showdown.
  // Extreme wind-curved shots must not kill her invisibly beyond the canvas.
  if (woman.phase !== 'walking' || woman.slot === null || woman.slot < 0 || woman.slot >= slots) return null;
  const L = slotLayout(slots);
  return civilianIntersection(playerShotCurve(L, team, slot, path.aimedSlot, path.targetSlot), L, woman.slot);
}
