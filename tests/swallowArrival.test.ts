import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Bullet, GameState, SwallowState } from '../shared/types';
import { rand } from '../shared/random';
import { flightPoint } from '../shared/ballistics';
import { swallowArrival, swallowIntersection, swallowPosition, SWALLOW_ENTRY_EDGES, SWALLOW_FALL_MS, SWALLOW_HIT_RADIUS } from '../shared/swallows';
import { advanceRain, initialRainState, resolveSwallowHits, SWALLOW_COUNT } from '../server/rain';
import { initialGatlingManState, initialStrongWindState, initialWalkingWomanState } from '../server/randomEvents';
import { createWeatherPresentation, stepWeatherPresentation } from '../src/host/arena/weatherPresentation';
import { drawSwallows } from '../src/host/arena/rain';
import { VOLLEY } from '../shared/volley';

function flock(seed = 17, now = 10000) {
  let calls = 0;
  return advanceRain(initialRainState(), 3, 5, initialStrongWindState(), now,
    () => calls++ === 0 ? 0 : ((seed + calls * 179) % 997) / 997).swallows;
}

/** The unchanged absolute-time orbit, computed independently of the new entry. */
function orbit(bird: SwallowState, now: number) {
  const age = Math.max(0, now - bird.bornAt) / 1000;
  const speed = .7 + rand(bird.seed + 1) * .4;
  const radius = 170 + rand(bird.seed + 3) * 100;
  const a = rand(bird.seed) * Math.PI * 2 + age * speed;
  const b = rand(bird.seed + 2) * Math.PI * 2 + age * .86;
  return { x: 800 + Math.sin(a) * radius, y: 180 + rand(bird.seed + 4) * 550 + Math.sin(b) * 68,
    dx: Math.cos(a) * radius * speed, dy: Math.cos(b) * 68 * .86 };
}

function game(birds: SwallowState[], resolutionStartedAt: number): GameState {
  return { roomCode: 'BIRD', revision: 0, phase: 'resolution', tick: 3,
    config: { tickDuration: 1000, slotsPerSide: 5 }, tickStartTime: resolutionStartedAt - 1000, resolutionStartedAt,
    rain: { ...initialRainState(), phase: 'warning', warningRoundsRemaining: 2, swallows: birds },
    strongWind: initialStrongWindState(), walkingWoman: initialWalkingWomanState(), gatlingMan: initialGatlingManState(),
    players: [], barrels: [], pendingSuicides: [], lastTickSuicides: [], pendingActions: [], lastTickBullets: [], winner: null };
}

function arrivalShot(bird: SwallowState) {
  const arrival = swallowArrival(bird), crossing = arrival.startsAt + arrival.duration * .62;
  const point = swallowPosition(bird, crossing), startedAt = crossing - 1000;
  const bullet: Bullet = { id: 'arrival-shot', fromTeam: 'sheriffs', fromSlot: 0, aimedSlot: 0, toSlot: 0,
    trajectory: 'straight', hit: 'miss', firedAt: 750,
    flight: { fromX: point.x - 400, fromY: point.y, controlX: point.x, controlY: point.y, toX: point.x + 400, toY: point.y } };
  return { bullet, startedAt };
}

test('each six-swallow flock enters from all four edges with a bounded authoritative stagger', () => {
  assert.equal(SWALLOW_COUNT, 6);
  assert.deepEqual([...SWALLOW_ENTRY_EDGES].sort(), ['bottom', 'left', 'right', 'top']);
  for (const seed of [0, 17, 101, 398, 811]) {
    const birds = flock(seed);
    assert.equal(birds.length, 6);
    assert.equal(new Set(birds.map(b => b.id)).size, 6);
    assert.deepEqual([...new Set(birds.map(b => swallowArrival(b).edge))].sort(), ['bottom', 'left', 'right', 'top']);
    assert.equal(new Set(birds.map(b => swallowArrival(b).delay)).size, 6, 'birds must not enter all at once');
    for (const bird of birds) {
      const entry = swallowArrival(bird);
      assert.ok(entry.delay >= 0 && entry.delay <= 600);
      assert.ok(entry.duration >= 2300 && entry.duration <= 2600);
      assert.equal(entry.startsAt, bird.bornAt + entry.delay);
      assert.equal(entry.endsAt, entry.startsAt + entry.duration);
      assert.ok(entry.endsAt - bird.bornAt >= 2300 && entry.endsAt - bird.bornAt <= 3200);
    }
  }
});

test('the complete bird and shadow remain offscreen before birth and throughout each stagger', () => {
  for (const seed of [0, 17, 811]) for (const bird of flock(seed)) {
    const arrival = swallowArrival(bird), initial = swallowPosition(bird, arrival.startsAt);
    for (const now of [bird.bornAt - 60000, bird.bornAt - 1, bird.bornAt, arrival.startsAt - 1, arrival.startsAt]) {
      const p = swallowPosition(bird, now);
      assert.equal(p.x, initial.x); assert.equal(p.y, initial.y);
      assert.ok(p.x + 35 < 0 || p.x - 35 > 1600 || p.y + 35 < 0 || p.y - 35 > 900,
        `${arrival.edge}: a rotated wing/tail must not pop into view`);
      assert.ok(p.x + 17 < 0 || p.x - 17 > 1600 || p.groundY + 3 < 0 || p.groundY - 3 > 900,
        `${arrival.edge}: an offscreen bird must not cast a clamped shadow inside the street`);
    }
  }
});

test('arrival joins the unchanged orbit continuously in position, speed and heading', () => {
  for (const seed of [0, 17, 101, 398, 811]) for (const bird of flock(seed)) {
    const arrival = swallowArrival(bird), end = arrival.endsAt;
    const joined = swallowPosition(bird, end), expected = orbit(bird, end);
    assert.ok(Math.hypot(joined.x - expected.x, joined.y - expected.y) < 1e-7);
    const epsilon = .05, before = swallowPosition(bird, end - epsilon), after = swallowPosition(bird, end + epsilon);
    const left = { x: (joined.x - before.x) * 1000 / epsilon, y: (joined.y - before.y) * 1000 / epsilon };
    const right = { x: (after.x - joined.x) * 1000 / epsilon, y: (after.y - joined.y) * 1000 / epsilon };
    assert.ok(Math.hypot(left.x - expected.dx, left.y - expected.dy) < 1, 'arrival tangent must meet orbital velocity');
    assert.ok(Math.hypot(right.x - expected.dx, right.y - expected.dy) < 1);
    assert.ok(Math.hypot(left.x - right.x, left.y - right.y) < 1, 'no velocity jump when joining');
    const headingDifference = Math.atan2(Math.sin(before.angle - after.angle), Math.cos(before.angle - after.angle));
    assert.ok(Math.abs(headingDifference) < .01, 'the bird must not snap to another heading');
    for (const later of [end + 100, end + 4000, end + 60000]) {
      const actual = swallowPosition(bird, later), old = orbit(bird, later);
      assert.ok(Math.hypot(actual.x - old.x, actual.y - old.y) < 1e-7, 'entry must not reset the shared orbital clock');
    }
  }
});

test('serialized reconnects and legacy birds reproduce the same deterministic entrance and orbit', () => {
  const legacy: SwallowState = { id: 'legacy', seed: 39277, bornAt: 10000 };
  for (const bird of [...flock(), legacy]) {
    const restored = JSON.parse(JSON.stringify(bird)) as SwallowState;
    const entry = swallowArrival(bird);
    assert.deepEqual(swallowArrival(restored), entry);
    for (const now of [bird.bornAt - 1, entry.startsAt, entry.startsAt + entry.duration * .3, entry.endsAt - 1, entry.endsAt, entry.endsAt + 3000]) {
      assert.deepEqual(swallowPosition(restored, now), swallowPosition(bird, now));
    }
  }
});

test('entry curves do not stall into a cusp or flip heading across a broad seed/edge sample', () => {
  for (const seed of [309133, ...Array.from({ length: 256 }, (_, i) => i * 1229)]) {
    for (const edge of SWALLOW_ENTRY_EDGES) {
      const bird: SwallowState = { id: 'turn-check', seed, bornAt: 10000, entryEdge: edge, entryDelay: 600 };
      const arrival = swallowArrival(bird);
      let before = swallowPosition(bird, arrival.startsAt);
      let travelHeading: number | undefined;
      for (let i = 1; i <= 300; i++) {
        const p = swallowPosition(bird, arrival.startsAt + arrival.duration * i / 300);
        const turn = Math.abs(Math.atan2(Math.sin(p.angle - before.angle), Math.cos(p.angle - before.angle)));
        assert.ok(turn < Math.PI / 3,
          `${edge} seed ${seed} flips ${(turn * 180 / Math.PI).toFixed(1)} degrees near entry ${i}/300`);
        assert.ok(Math.hypot(p.x - before.x, p.y - before.y) < 16, 'entry must remain continuous between frames');
        const nextHeading = Math.atan2(p.y - before.y, p.x - before.x);
        if (travelHeading !== undefined) {
          const pathTurn = Math.abs(Math.atan2(Math.sin(nextHeading - travelHeading), Math.cos(nextHeading - travelHeading)));
          assert.ok(pathTurn < Math.PI / 3, `${edge} seed ${seed} reverses actual travel near entry ${i}/300`);
        }
        travelHeading = nextHeading;
        before = p;
      }
    }
  }
});

test('arrival collision uses the exact animated position and never stops or rewrites the projectile', () => {
  for (const bird of flock().slice(0, 4)) {
    const { bullet, startedAt } = arrivalShot(bird), arrival = swallowArrival(bird);
    const original = structuredClone(bullet), duplicate = { ...bird, id: `${bird.id}-second` };
    const state = game([bird, duplicate], startedAt);
    const fraction = swallowIntersection(bird, bullet.flight!, startedAt + bullet.firedAt!, VOLLEY.impact - bullet.firedAt!);
    assert.notEqual(fraction, null);
    const at = startedAt + bullet.firedAt! + fraction! * (VOLLEY.impact - bullet.firedAt!);
    assert.ok(at > arrival.startsAt && at < arrival.endsAt, 'the fixture must actually hit during entry');
    const rendered = swallowPosition(bird, at), projectile = flightPoint(bullet.flight!, fraction!);
    const distance = ((rendered.x - projectile.x) / SWALLOW_HIT_RADIUS.x) ** 2 + ((rendered.y - projectile.y) / SWALLOW_HIT_RADIUS.y) ** 2;
    assert.ok(distance < 1.01, 'collision must touch the rendered bird, not its eventual orbit');
    resolveSwallowHits(state, [bullet]);
    assert.deepEqual(bullet, original);
    assert.ok(state.rain.swallows.every(b => b.remains), 'one continuing shot can kill overlapping birds');
    for (const resolved of state.rain.swallows) {
      const remains = resolved.remains!, visible = swallowPosition(bird, startedAt + remains.hitAt);
      assert.deepEqual([remains.hitX, remains.hitY, remains.hitAngle, remains.y], [visible.x, visible.y, visible.angle, visible.groundY]);
    }
    const corpses = structuredClone(state.rain.swallows);
    resolveSwallowHits(state, [bullet]);
    assert.deepEqual(state.rain.swallows, corpses, 'an entry kill is resolved only once');
    assert.deepEqual(state.pendingSuicides, []);
  }
});

test('a projectile cannot hit an unborn or still-staggered bird parked outside the canvas', () => {
  for (const bird of flock()) {
    const entry = swallowArrival(bird), point = swallowPosition(bird, entry.startsAt - 1);
    const flight = { fromX: point.x - 400, fromY: point.y, controlX: point.x, controlY: point.y, toX: point.x + 400, toY: point.y };
    assert.equal(swallowIntersection(bird, flight, entry.startsAt - 600, 500), null);
    assert.equal(swallowIntersection(bird, flight, entry.startsAt - 270, 500), null,
      'a crossing just before launch cannot be counted later in the same bullet interval');
  }
});

function captureBird(gs: GameState, now: number, elapsed: number, motion: boolean) {
  const calls: string[] = [], values: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_target, key) { return key in values ? values[String(key)] : (..._args: unknown[]) => { calls.push(String(key)); }; },
    set(_target, key, value) { values[String(key)] = value; return true; },
  });
  for (const layer of ['ground', 'air'] as const) drawSwallows(ctx, gs, now, 1, elapsed, motion, layer);
  return calls;
}

test('a bird killed on entry falls from that point and never reappears as a live arriving or departing bird', () => {
  for (const motion of [true, false]) {
    const bird = flock()[0], { bullet, startedAt } = arrivalShot(bird), state = game([bird], startedAt);
    const presentation = createWeatherPresentation();
    stepWeatherPresentation(presentation, state, startedAt + 750, .016, motion);
    assert.ok(presentation.liveBirds.has(bird.id));
    resolveSwallowHits(state, [bullet]);
    const hitAt = state.rain.swallows[0].remains!.hitAt;
    for (const elapsed of [hitAt + 1, hitAt + SWALLOW_FALL_MS + 1]) {
      const calls = captureBird(state, startedAt + elapsed, elapsed, motion);
      assert.ok(calls.includes('translate'), 'dead bird is still rendered');
      assert.equal(calls.includes('fillRect'), false, 'the live bird eye must not be drawn after contact');
      stepWeatherPresentation(presentation, state, startedAt + elapsed, .016, motion);
      assert.equal(presentation.liveBirds.has(bird.id), false);
      assert.equal(presentation.departingBirds.some(b => b.bird.id === bird.id), false);
    }
    state.phase = 'planning'; state.tick++; state.tickStartTime = startedAt + 4000;
    state.rain = advanceRain({ ...state.rain, warningRoundsRemaining: 1 }, state.tick, 5, state.strongWind, state.tickStartTime, () => .9);
    stepWeatherPresentation(presentation, state, state.tickStartTime, .016, motion);
    assert.ok(state.rain.swallows[0].remains);
    assert.equal(presentation.departingBirds.some(b => b.bird.id === bird.id), false);
  }
});
