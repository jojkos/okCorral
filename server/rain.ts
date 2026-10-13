import type { Bullet, GameState, RainState, StrongWindState, SwallowState } from '../shared/types.js';
import { slotLayout } from '../shared/arenaGeometry.js';
import { resolvedBulletFlight } from '../shared/bulletFlight.js';
import { swallowIntersection, swallowPosition, SWALLOW_ENTRY_EDGES } from '../shared/swallows.js';
import { VOLLEY } from '../shared/volley.js';

export const FIRST_RAIN_ROUND = 5;
export const RAIN_CHANCE = 0.1;
export const RAIN_WARNING_ROUNDS = 2;
export const SWALLOW_COUNT = 6;
export const initialRainState = (): RainState => ({ phase: 'dry', warningRoundsRemaining: 0, swallows: [], ammoAppliedTick: null });

export function advanceRain(previous: RainState = initialRainState(), round: number, slots: number, wind: StrongWindState, now: number, random: () => number = Math.random): RainState {
  const shift = wind.phase === 'active' ? (wind.direction === 'down' ? 1 : wind.direction === 'up' ? -1 : 0) * slotLayout(slots).slotHeight : 0;
  const swallows = previous.swallows.filter(b => !b.remains || (b.remains.y >= -40 && b.remains.y <= 950)).map(b => !b.remains ? b
    : { ...b, remains: { ...b.remains, fromY: b.remains.y, y: b.remains.y + shift } });
  if (previous.phase === 'warning') {
    const left = previous.warningRoundsRemaining - 1;
    return { ...previous, phase: left > 0 ? 'warning' : 'active', warningRoundsRemaining: left,
      swallows: left > 0 ? swallows : swallows.filter(b => b.remains) };
  }
  const dry: RainState = { ...previous, phase: 'dry', warningRoundsRemaining: 0, swallows: swallows.filter(b => b.remains) };
  // Roll two rounds ahead, so the first possible rain is round five, not seven.
  if (round < FIRST_RAIN_ROUND - RAIN_WARNING_ROUNDS || random() >= RAIN_CHANCE) return dry;
  const flock: SwallowState[] = Array.from({ length: SWALLOW_COUNT }, (_, i) => ({
    id: `swallow-${round}-${i}`, seed: Math.floor(random() * 1_000_000_000) + i * 137, bornAt: now,
    entryEdge: SWALLOW_ENTRY_EDGES[i % SWALLOW_ENTRY_EDGES.length], entryDelay: i * 120,
  }));
  return { ...dry, phase: 'warning', warningRoundsRemaining: RAIN_WARNING_ROUNDS, swallows: [...dry.swallows, ...flock] };
}

/** Applied once at rain onset, before actions/bots: no surprise mid-volley loss. */
export function applyRainAmmo(state: GameState) {
  if (state.rain.phase !== 'active' || state.rain.ammoAppliedTick === state.tick) return;
  for (const p of state.players) if (p.isAlive && p.slot >= 0) p.ammo = Math.max(0, p.ammo - 1);
  state.rain.ammoAppliedTick = state.tick;
}

export function resolveSwallowHits(state: GameState, bullets: Bullet[]) {
  if (!state.rain?.swallows.some(b => !b.remains)) return;
  const start = state.resolutionStartedAt ?? (state.tickStartTime ?? 0) + state.config.tickDuration;
  state.rain.swallows = state.rain.swallows.map(bird => {
    if (bird.remains) return bird;
    let first = Infinity;
    for (const bullet of bullets) {
      const fire = bullet.firedAt ?? VOLLEY.move;
      const p = swallowIntersection(bird, bullet.flight ?? resolvedBulletFlight(state, bullet), start + fire, VOLLEY.impact - fire);
      if (p !== null) first = Math.min(first, fire + p * (VOLLEY.impact - fire));
    }
    if (!Number.isFinite(first)) return bird;
    const point = swallowPosition(bird, start + first);
    return { ...bird, remains: { x: point.x, y: point.groundY, fromY: point.groundY,
      hitX: point.x, hitY: point.y, hitAngle: point.angle, hitAt: first, hitTick: state.tick } };
  });
}
