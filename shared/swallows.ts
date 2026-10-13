import type { SwallowEntryEdge, SwallowState } from './types.js';
import { flightPoint, type ShotFlight } from './ballistics.js';
import { rand } from './random.js';

export const SWALLOW_FALL_MS = 430;
export const SWALLOW_HIT_RADIUS = { x: 12, y: 9 };
export const SWALLOW_ENTRY_EDGES = ['left', 'top', 'right', 'bottom'] as const;

const safeSeed = (bird: SwallowState) => Number.isFinite(bird.seed) ? bird.seed : 0;

/** Serialized edge and delay keep the whole flock's approach identical on
 * host, clients and the shot resolver, including a mid-entry reconnect. */
export function swallowArrival(bird: SwallowState) {
  const seed = safeSeed(bird);
  const edge: SwallowEntryEdge = SWALLOW_ENTRY_EDGES.includes(bird.entryEdge as SwallowEntryEdge)
    ? bird.entryEdge! : SWALLOW_ENTRY_EDGES[Math.floor(rand(seed + 37) * 4)];
  const delay = typeof bird.entryDelay === 'number' && Number.isFinite(bird.entryDelay)
    ? Math.min(600, Math.max(0, bird.entryDelay)) : 0;
  let duration = 2300 + rand(seed + 11) * 300;
  let target = orbit(seed, (delay + duration) / 1000);
  // Avoid merging at an almost-stationary orbit turning point: even a C1
  // curve would need a visually sharp last-millisecond change of heading.
  if (Math.hypot(target.dx, target.dy) < 60) for (const alternativeDuration of [2300, 2600]) {
    const alternative = orbit(seed, (delay + alternativeDuration) / 1000);
    if (Math.hypot(alternative.dx, alternative.dy) > Math.hypot(target.dx, target.dy)) {
      duration = alternativeDuration;
      target = alternative;
    }
  }
  const startsAt = (Number.isFinite(bird.bornAt) ? bird.bornAt : 0) + delay;
  return { edge, delay, duration, startsAt, endsAt: startsAt + duration };
}

/** Do not clamp shadows onto the bottom of the visible street: a bird still
 * outside the canvas must not leave a detached shadow on the playing field. */
export const swallowGroundY = (y: number) => y + 64;

function orbit(seed: number, t: number) {
  const speed = .7 + rand(seed + 1) * .4;
  const radius = 170 + rand(seed + 3) * 100;
  const a = rand(seed) * Math.PI * 2 + t * speed;
  const b = rand(seed + 2) * Math.PI * 2 + t * .86;
  return {
    x: 800 + Math.sin(a) * radius,
    y: 180 + rand(seed + 4) * 550 + Math.sin(b) * 68,
    dx: Math.cos(a) * radius * speed,
    dy: Math.cos(b) * 68 * .86,
  };
}

/** Enter from beyond the complete sprite/shadow, then join the original low
 * orbit with matching position AND velocity. Absolute server time also works
 * after reconnect; the renderer and the shot resolver share this trajectory. */
export function swallowPosition(bird: SwallowState, now: number) {
  const seed = safeSeed(bird), bornAt = Number.isFinite(bird.bornAt) ? bird.bornAt : 0;
  const time = Number.isFinite(now) ? now : bornAt;
  const t = Math.max(0, time - bornAt) / 1000;
  const arrival = swallowArrival(bird);
  let pose = orbit(seed, t);
  if (time < arrival.endsAt) {
    const p = Math.max(0, (time - arrival.startsAt) / arrival.duration), q = 1 - p;
    const seconds = arrival.duration / 1000;
    const target = orbit(seed, (arrival.endsAt - bornAt) / 1000);
    const cross = rand(seed + 7), horizontal = arrival.edge === 'left' || arrival.edge === 'right';
    const start = horizontal
      ? { x: arrival.edge === 'left' ? -128 : 1728, y: 100 + cross * 680 }
      : { x: 220 + cross * 1160, y: arrival.edge === 'top' ? -140 : 1040 };
    const chordX = target.x - start.x, chordY = target.y - start.y;
    const chordLength = Math.hypot(chordX, chordY);
    const bend = chordX * target.dy - chordY * target.dx;
    const side = Math.abs(bend) > .00001 ? -Math.sign(bend) : (rand(seed + 19) < .5 ? -1 : 1);
    const loft = Math.min(400, Math.max(200, chordLength * .35));
    // Bank around the incoming orbital tangent rather than approaching it in
    // a straight line and stopping/reversing when the orbit points outward.
    const control = {
      x: start.x + chordX * .38 - chordY / chordLength * side * loft,
      y: start.y + chordY * .38 + chordX / chordLength * side * loft,
    };
    if (arrival.edge === 'left') control.x = Math.max(start.x + 80, control.x);
    else if (arrival.edge === 'right') control.x = Math.min(start.x - 80, control.x);
    else if (arrival.edge === 'top') control.y = Math.max(start.y + 80, control.y);
    else control.y = Math.min(start.y - 80, control.y);
    const endControl = { x: target.x - target.dx * seconds / 3, y: target.y - target.dy * seconds / 3 };
    pose = {
      x: q ** 3 * start.x + 3 * q * q * p * control.x + 3 * q * p * p * endControl.x + p ** 3 * target.x,
      y: q ** 3 * start.y + 3 * q * q * p * control.y + 3 * q * p * p * endControl.y + p ** 3 * target.y,
      dx: (3 * q * q * (control.x - start.x) + 6 * q * p * (endControl.x - control.x) + 3 * p * p * (target.x - endControl.x)) / seconds,
      dy: (3 * q * q * (control.y - start.y) + 6 * q * p * (endControl.y - control.y) + 3 * p * p * (target.y - endControl.y)) / seconds,
    };
  }
  return { x: pose.x, y: pose.y, angle: Math.atan2(pose.dy, pose.dx), flap: Math.sin(t * 20 + seed), groundY: swallowGroundY(pose.y) };
}

/** Swept relative-motion hit test. Returning a hit never trims/stops a bullet. */
export function swallowIntersection(bird: SwallowState, flight: ShotFlight, start: number, duration: number) {
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) return null;
  const from = Math.max(0, (swallowArrival(bird).startsAt - start) / duration);
  if (from > 1) return null;
  const relative = (p: number) => {
    const bullet = flightPoint(flight, p), swallow = swallowPosition(bird, start + duration * p);
    return { x: (bullet.x - swallow.x) / SWALLOW_HIT_RADIUS.x, y: (bullet.y - swallow.y) / SWALLOW_HIT_RADIUS.y };
  };
  let before = relative(from);
  if (before.x * before.x + before.y * before.y <= 1) return from;
  if (from === 1) return null;
  const steps = 256;
  for (let i = 1; i <= steps; i++) {
    const after = relative(from + (1 - from) * i / steps), dx = after.x - before.x, dy = after.y - before.y;
    const a = dx * dx + dy * dy, b = 2 * (before.x * dx + before.y * dy), c = before.x * before.x + before.y * before.y - 1;
    const disc = b * b - 4 * a * c;
    if (a > 1e-12 && disc >= 0) {
      const at = (-b - Math.sqrt(disc)) / (2 * a);
      if (at >= 0 && at <= 1) return from + (1 - from) * (i - 1 + at) / steps;
    }
    before = after;
  }
  return null;
}
