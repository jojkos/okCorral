import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animationGame, wind } from './animationCases';
import { swallowPosition } from '../shared/swallows';
import { slotLayout } from '../shared/arenaGeometry';
import type { SwallowState } from '../shared/types';
import { createWeatherPresentation, departingSwallowPose, stepWeatherPresentation, windParticleY } from '../src/host/arena/weatherPresentation';

const bird = (id = 'bird'): SwallowState => ({ id, bornAt: 10000, seed: 17 });
const remains = { x: 800, y: 510, fromY: 510, hitX: 800, hitY: 450, hitAngle: 0, hitAt: 1000, hitTick: 12 };

test('wind stopping retains every particle continuously and blows it out without wrapping', () => {
  for (const direction of ['up', 'down'] as const) {
    const gs = animationGame(), state = createWeatherPresentation(), sign = direction === 'up' ? -1 : 1;
    gs.strongWind = wind('active', direction);
    stepWeatherPresentation(state, gs, 10000, 4, true);
    const before = Array.from({ length: 20 }, (_, i) => windParticleY(state.wind, i * 57, 1130));
    gs.strongWind = { ...wind('calm', direction), direction: null };
    stepWeatherPresentation(state, gs, 10000, 0, true);
    assert.equal(state.wind.weather.phase, 'active');
    assert.deepEqual(Array.from({ length: 20 }, (_, i) => windParticleY(state.wind, i * 57, 1130)), before);
    stepWeatherPresentation(state, gs, 11000, 1, true);
    for (let i = 0; i < before.length; i++) {
      const distance = windParticleY(state.wind, i * 57, 1130) - before[i];
      assert.ok(Math.abs(distance - sign * 210) < .00001, 'all retained particles keep moving downstream');
    }
    stepWeatherPresentation(state, gs, 18000, 7, true);
    assert.equal(state.wind.weather.phase, 'calm');
    assert.equal(state.wind.opacity, 0);
    assert.equal(state.wind.motion.speed, 0);
  }
});

test('a quick opposite wind preserves the previous departing field until it clears', () => {
  const gs = animationGame(), state = createWeatherPresentation();
  gs.strongWind = wind('active', 'down');
  stepWeatherPresentation(state, gs, 10000, 4, true);
  gs.strongWind = { ...wind('calm', 'down'), direction: null };
  stepWeatherPresentation(state, gs, 11000, 1, true);
  const previous = state.wind, previousTravel = previous.motion.travel;
  gs.strongWind = wind('warning', 'up');
  stepWeatherPresentation(state, gs, 11200, .2, true);
  assert.equal(state.departingWinds[0], previous);
  assert.ok(previous.motion.travel > previousTravel);
  assert.ok(state.wind.motion.travel < 0);
  stepWeatherPresentation(state, gs, 19000, 8, true);
  assert.equal(state.departingWinds.length, 0);
});

test('repeated short-round winds stay bounded and fully clear at every supported arena size', () => {
  for (const slots of [2, 5, 8]) {
    const gs = animationGame(), state = createWeatherPresentation(), L = slotLayout(slots), span = L.slotHeight * L.n + 400;
    gs.config.slotsPerSide = slots; gs.config.tickDuration = 1000;
    for (let round = 0; round < 32; round++) {
      const phase = (['warning', 'active', 'active', 'calm'] as const)[round % 4];
      const direction = Math.floor(round / 4) % 2 ? 'up' : 'down';
      gs.strongWind = wind(phase, direction); gs.tick++;
      for (let frame = 0; frame < 72; frame++) {
        stepWeatherPresentation(state, gs, round * 3600 + frame * 50, .05, true);
        assert.ok(state.departingWinds.length <= 1, 'at most one old front overlaps a new one');
        for (const tail of [...state.departingWinds, state.wind]) {
          if (tail.exitTravel === null || Math.abs(tail.motion.travel - tail.exitTravel) < span + 70) continue;
          for (let base = 0; base < span; base += 47) {
            const y = L.top - 200 + windParticleY(tail, base, span);
            assert.ok(y + 50 < L.top || y - 50 > L.top + L.slotHeight * L.n);
          }
        }
      }
    }
    gs.strongWind = { ...wind('calm', 'up'), direction: null };
    stepWeatherPresentation(state, gs, 200000, 20, true);
    assert.equal(state.departingWinds.length, 0);
    assert.equal(state.wind.weather.phase, 'calm');
  }
});

test('wind reduced-motion departure fades without moving or cutting off suddenly', () => {
  const gs = animationGame(), state = createWeatherPresentation();
  stepWeatherPresentation(state, gs, 10000, 3, false);
  const travel = state.wind.motion.travel;
  gs.strongWind.phase = 'calm'; gs.strongWind.direction = null;
  stepWeatherPresentation(state, gs, 10300, .3, false);
  assert.equal(state.wind.motion.travel, travel);
  assert.ok(state.wind.opacity > 0 && state.wind.opacity < 1);
  stepWeatherPresentation(state, gs, 12000, 1.7, false);
  assert.equal(state.wind.opacity, 0);
  assert.equal(state.wind.weather.phase, 'calm');
});

test('storm clouds darken, rain softens, and daylight and dry ground return gradually', () => {
  const gs = animationGame(), state = createWeatherPresentation();
  gs.rain.phase = 'warning'; gs.rain.warningRoundsRemaining = 2;
  stepWeatherPresentation(state, gs, 10000, .15, true);
  assert.ok(state.cloud > 0 && state.cloud < .25);
  assert.equal(state.rainfall, 0);
  stepWeatherPresentation(state, gs, 11000, 1, true);
  assert.equal(state.cloud, .25);
  gs.rain.phase = 'active';
  stepWeatherPresentation(state, gs, 11100, .1, true);
  assert.ok(state.cloud > .25 && state.cloud < 1);
  assert.ok(state.rainfall > 0 && state.rainfall < 1);
  stepWeatherPresentation(state, gs, 15000, 4, true);
  assert.equal(state.cloud, 1); assert.equal(state.rainfall, 1); assert.equal(state.wetness, 1);
  gs.rain.phase = 'dry';
  stepWeatherPresentation(state, gs, 15100, .1, true);
  assert.ok(state.cloud > 0 && state.cloud < 1);
  assert.ok(state.rainfall > 0 && state.rainfall < 1);
  assert.ok(state.wetness > 0 && state.wetness < 1);
  assert.equal(state.clearing, true);
  stepWeatherPresentation(state, gs, 16600, 1.5, true);
  assert.equal(state.rainfall, 0);
  assert.ok(state.cloud > 0 && state.wetness > 0);
  stepWeatherPresentation(state, gs, 23000, 7, true);
  assert.equal(state.cloud, 0); assert.equal(state.wetness, 0); assert.equal(state.clearing, false);
});

test('surviving swallows fly off from their exact flight pose and are retired offscreen', () => {
  const gs = animationGame(), state = createWeatherPresentation(), survivor = bird();
  gs.rain.phase = 'warning'; gs.rain.swallows = [survivor];
  stepWeatherPresentation(state, gs, 12000, 1, true);
  gs.rain.phase = 'active'; gs.rain.swallows = []; gs.tickStartTime = 12500;
  stepWeatherPresentation(state, gs, 12500, .5, true);
  assert.equal(state.departingBirds.length, 1);
  const flight = state.departingBirds[0], pose = departingSwallowPose(flight, 12500), expected = swallowPosition(survivor, 12500);
  assert.equal(pose.x, expected.x); assert.equal(pose.y, expected.y);
  assert.ok(Math.abs(pose.angle - expected.angle) < .02, 'escape preserves flight direction');
  const middle = departingSwallowPose(flight, 14000);
  assert.ok(Number.isFinite(middle.x) && Number.isFinite(middle.y));
  const end = departingSwallowPose(flight, 15600);
  assert.ok(end.x < -50 || end.x > 1650, 'whole swallow has left the canvas before retirement');
  stepWeatherPresentation(state, gs, 15601, 3.1, true);
  assert.equal(state.departingBirds.length, 0);
});

test('killed birds never take off; late authoritative hits cancel retained escapes', () => {
  const gs = animationGame(), state = createWeatherPresentation(), survivor = bird();
  gs.rain.swallows = [survivor];
  stepWeatherPresentation(state, gs, 12000, 1, true);
  gs.rain.swallows = [{ ...survivor, remains }];
  stepWeatherPresentation(state, gs, 12500, .5, true);
  assert.equal(state.departingBirds.length, 0);
  gs.rain.swallows = [];
  stepWeatherPresentation(state, gs, 13000, .5, true);
  assert.equal(state.departingBirds.length, 0);
  gs.rain.swallows = [bird('late')];
  stepWeatherPresentation(state, gs, 13500, .5, true);
  gs.rain.swallows = [];
  gs.tickStartTime = 14000;
  stepWeatherPresentation(state, gs, 14000, .5, true);
  assert.equal(state.departingBirds.length, 1);
  gs.rain.swallows = [{ ...bird('late'), remains }];
  stepWeatherPresentation(state, gs, 14100, .1, true);
  assert.equal(state.departingBirds.length, 0);
});

test('surviving swallow exit finishes before the next volley on the shortest rounds', () => {
  const gs = animationGame(), state = createWeatherPresentation();
  gs.config.tickDuration = 1000; gs.rain.swallows = [bird()];
  stepWeatherPresentation(state, gs, 10000, .1, true);
  gs.rain.swallows = []; gs.tickStartTime = 10100;
  stepWeatherPresentation(state, gs, 10100, .1, true);
  assert.equal(state.departingBirds[0].duration, 850);
  const end = departingSwallowPose(state.departingBirds[0], 10950);
  assert.ok(end.x < -50 || end.x > 1650);
  stepWeatherPresentation(state, gs, 10951, .851, true);
  assert.equal(state.departingBirds.length, 0);
});

test('delayed planning updates finish the flock before the original server deadline', () => {
  const gs = animationGame(), state = createWeatherPresentation();
  gs.config.tickDuration = 1000; gs.rain.swallows = [bird()];
  stepWeatherPresentation(state, gs, 10000, .1, true);
  gs.tick++; gs.tickStartTime = 20000; gs.rain.swallows = [];
  stepWeatherPresentation(state, gs, 20400, .1, true);
  assert.equal(state.departingBirds.length, 1);
  assert.equal(state.departingBirds[0].duration, 450);
  assert.equal(state.departingBirds[0].startedAt + state.departingBirds[0].duration, 20850);
  stepWeatherPresentation(state, gs, 20851, .451, true);
  assert.equal(state.departingBirds.length, 0);
});

test('missed or backgrounded rain onset never replays an invulnerable flock during resolution', () => {
  for (const phase of ['planning', 'resolution', 'ended'] as const) {
    const gs = animationGame(), state = createWeatherPresentation();
    gs.config.tickDuration = 1000; gs.rain.swallows = [bird()];
    stepWeatherPresentation(state, gs, 10000, .1, true);
    gs.tick++; gs.tickStartTime = 10000; gs.phase = phase; gs.resolutionStartedAt = 11000; gs.rain.swallows = [];
    stepWeatherPresentation(state, gs, 12000, 0, true);
    assert.equal(state.departingBirds.length, 0, `${phase} must not replay a missed departure`);
  }
});

test('an early authoritative resolution cancels any still-retained decorative escape', () => {
  const gs = animationGame(), state = createWeatherPresentation();
  gs.rain.swallows = [bird()];
  stepWeatherPresentation(state, gs, 10000, .1, true);
  gs.tickStartTime = 10100; gs.rain.swallows = [];
  stepWeatherPresentation(state, gs, 10100, .1, true);
  assert.equal(state.departingBirds.length, 1);
  gs.phase = 'resolution'; gs.resolutionStartedAt = 10200;
  stepWeatherPresentation(state, gs, 10200, .1, true);
  assert.equal(state.departingBirds.length, 0);
});

test('reconnect and rematch do not synthesize a departed flock from stale state', () => {
  const gs = animationGame(), state = createWeatherPresentation();
  stepWeatherPresentation(state, gs, 12000, 1, true);
  assert.equal(state.departingBirds.length, 0);
  gs.rain.swallows = [bird()];
  stepWeatherPresentation(state, gs, 13000, 1, true);
  gs.tick = 1; gs.rain.phase = 'dry'; gs.rain.swallows = []; gs.strongWind.phase = 'calm';
  stepWeatherPresentation(state, gs, 14000, 1, true);
  assert.equal(state.departingBirds.length, 0);
  assert.equal(state.wind.opacity, 0);
  assert.equal(state.cloud, 0);
  assert.equal(state.wetness, 0);
});

test('weather presentation does not mutate the authoritative state or corpse positions', () => {
  const gs = animationGame(), snapshot = structuredClone(gs), state = createWeatherPresentation();
  stepWeatherPresentation(state, gs, 12000, 2, true);
  assert.deepEqual(gs, snapshot);
  gs.rain.swallows = [{ ...bird(), remains }];
  const corpse = structuredClone(gs.rain.swallows);
  stepWeatherPresentation(state, gs, 14000, 2, true);
  assert.deepEqual(gs.rain.swallows, corpse);
});
