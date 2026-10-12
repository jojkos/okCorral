import type { SwallowState } from './types.js';
import { flightPoint, type ShotFlight } from './ballistics.js';
import { rand } from './random.js';

export const SWALLOW_FALL_MS = 430;
export const SWALLOW_HIT_RADIUS = { x: 12, y: 9 };

/** Low, looping flight above the street. Absolute server time also works after
 * reconnect; no local random positions can disagree with the shot resolver. */
export function swallowPosition(bird: SwallowState, now: number) {
  const t = Math.max(0, now - bird.bornAt) / 1000;
  const a = rand(bird.seed) * Math.PI * 2 + t * (0.7 + rand(bird.seed + 1) * 0.4);
  const b = rand(bird.seed + 2) * Math.PI * 2 + t * 0.86;
  const x = 800 + Math.sin(a) * (170 + rand(bird.seed + 3) * 100);
  const y = 180 + rand(bird.seed + 4) * 550 + Math.sin(b) * 68;
  const dx = Math.cos(a) * (170 + rand(bird.seed + 3) * 100) * (0.7 + rand(bird.seed + 1) * 0.4);
  const dy = Math.cos(b) * 68 * 0.86;
  return { x, y, angle: Math.atan2(dy, dx), flap: Math.sin(t * 20 + bird.seed), groundY: Math.min(876, y + 64) };
}

/** Swept relative-motion hit test. Returning a hit never trims/stops a bullet. */
export function swallowIntersection(bird: SwallowState, flight: ShotFlight, start: number, duration: number) {
  const relative = (p: number) => {
    const bullet = flightPoint(flight, p), swallow = swallowPosition(bird, start + duration * p);
    return { x: (bullet.x - swallow.x) / SWALLOW_HIT_RADIUS.x, y: (bullet.y - swallow.y) / SWALLOW_HIT_RADIUS.y };
  };
  let before = relative(0);
  if (before.x * before.x + before.y * before.y <= 1) return 0;
  const steps = 256;
  for (let i = 1; i <= steps; i++) {
    const after = relative(i / steps), dx = after.x - before.x, dy = after.y - before.y;
    const a = dx * dx + dy * dy, b = 2 * (before.x * dx + before.y * dy), c = before.x * before.x + before.y * before.y - 1;
    const disc = b * b - 4 * a * c;
    if (a > 1e-12 && disc >= 0) {
      const at = (-b - Math.sqrt(disc)) / (2 * a);
      if (at >= 0 && at <= 1) return (i - 1 + at) / steps;
    }
    before = after;
  }
  return null;
}
