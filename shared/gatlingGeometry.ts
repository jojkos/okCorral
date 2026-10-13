import { bulletLaneFeet, type Layout } from './arenaGeometry.js';
import { civilianFeet, civilianSlotAtFeet } from './civilianGeometry.js';
import type { GatlingCrush, GatlingTarget, WalkingWomanState } from './types.js';

/** Centre-street travel in the same world coordinates as player/civilian lanes. */
export const GATLING_ENTRY_Y = -140;
export const GATLING_STOP_Y = 425;
export const GATLING_EXIT_Y = 1275;
export const GATLING_DEPARTURE_MS = 1390;
export const GATLING_DEPARTURE_DURATION_MS = 1100;
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Same projection as the carriage mesh, available to the authoritative resolver. */
export function gatlingMuzzlePoint(L: Layout, target: GatlingTarget) {
  const scale = 0.9, floor = 0.46, height = 0.89, mount = 103, muzzle = 137;
  const pivotY = GATLING_STOP_Y - mount * height * scale;
  const dx = (target.team === 'sheriffs' ? L.sheriffX : L.outlawX) - L.midX;
  const dy = bulletLaneFeet(L, target.slot) - 72 * L.s - pivotY;
  const yaw = Math.atan2(dx, dy / floor);
  return { x: L.midX + Math.sin(yaw) * muzzle * scale,
    y: pivotY + Math.cos(yaw) * muzzle * floor * scale,
    angle: Math.atan2(Math.cos(yaw) * floor, Math.sin(yaw)) };
}

/** Authoritative path used by collision detection and drawing. */
export function gatlingPosition(roundProgress: number, resolutionElapsed = -1) {
  const arrival = clamp(roundProgress / 0.78);
  const departure = clamp((resolutionElapsed - GATLING_DEPARTURE_MS) / GATLING_DEPARTURE_DURATION_MS);
  const distance = arrival * arrival * (3 - 2 * arrival), forward = departure * departure;
  const scale = 0.38 + 0.52 * distance + 0.32 * forward;
  const y = GATLING_ENTRY_Y + (GATLING_STOP_Y - GATLING_ENTRY_Y) * distance + (GATLING_EXIT_Y - GATLING_STOP_Y) * forward;
  return { arrival, departure, scale, y, contactY: y + 14 * scale, p: distance + forward * 2.8 };
}

/** Swept collision against the moving civilian, not just the destination lane.
 * Arrival uses planning progress; departure happens after shots have landed. */
export function gatlingContact(L: Layout, woman: WalkingWomanState, leg: 'arrival' | 'departure') {
  if (woman.slot === null || (woman.phase !== 'walking' && woman.phase !== 'dead')) return null;
  const feet = (p: number) => civilianFeet(L, woman, leg === 'arrival' ? p : 1)!;
  const cart = (p: number) => leg === 'arrival' ? gatlingPosition(p).contactY
    : gatlingPosition(1, GATLING_DEPARTURE_MS + p * GATLING_DEPARTURE_DURATION_MS).contactY;
  // Keep checking through the whole planning phase: a pedestrian may walk
  // into the carriage after it reaches its firing position.
  const end = 1;
  const gap = (p: number) => feet(p) - cart(p);
  let previous = gap(0);
  for (let i = 0; i <= 256; i++) {
    const p = end * i / 256, next = gap(p);
    if ((i === 0 && next >= -14 && next <= 0) || (i > 0 && previous > 0 && next <= 0)) {
      let lo = end * Math.max(0, i - 1) / 256, hi = p;
      for (let n = 0; n < 24; n++) { const mid = (lo + hi) / 2; if (gap(mid) > 0) lo = mid; else hi = mid; }
      const y = feet(hi);
      // Someone who already walked off-screen cannot be hit by an unseen cart.
      if (y >= 0 && y <= 900) return {
        leg, at: leg === 'arrival' ? hi : GATLING_DEPARTURE_MS + hi * GATLING_DEPARTURE_DURATION_MS,
        slot: civilianSlotAtFeet(L, y),
      };
    }
    previous = next;
  }
  return null;
}

export function gatlingCrushAge(crush: GatlingCrush, progress: number, elapsed: number, roundMs: number) {
  return crush.leg === 'arrival'
    ? (elapsed >= 0 ? roundMs + elapsed : progress * roundMs) - crush.at * roundMs
    : elapsed < 0 ? -Infinity : elapsed - crush.at;
}

export function gatlingCrushTrail(hit: GatlingCrush) {
  const trail = [...hit.before.bloodTrail];
  // A wind-drag destination is not yet visited when the cart intercepts it.
  if (hit.leg === 'arrival' && hit.before.fromSlot !== hit.before.slot && trail[trail.length - 1] === hit.before.slot) trail.pop();
  if (trail[trail.length - 1] !== hit.slot) trail.push(hit.slot);
  return [...trail, hit.slot + 1];
}

/** Clients may receive a resolved death early; reveal it only on contact. */
export function presentGatlingWoman(woman: WalkingWomanState, progress: number, elapsed: number, roundMs: number): WalkingWomanState {
  if (!woman.gatlingCrush || gatlingCrushAge(woman.gatlingCrush, progress, elapsed, roundMs) >= 0) return woman;
  return { ...woman, ...woman.gatlingCrush.before, crushedByGatling: false };
}
