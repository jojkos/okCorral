import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS_H, bulletLaneFeet, slotLayout, womanScale } from '../shared/arenaGeometry';
import { civilianFeet, civilianLaneFeet, civilianSlotAtFeet } from '../shared/civilianGeometry';
import { civilianIntersection, playerShotCurve, shotCivilianHit } from '../shared/ballistics';
import { gatlingPosition, GATLING_DEPARTURE_MS, GATLING_DEPARTURE_DURATION_MS } from '../shared/gatlingGeometry';
import { gatlingTravel, gatlingWomanFrame } from '../src/host/arena/gatling';
import { advanceWalkingWoman, initialStrongWindState, runOverWomanWithGatling } from '../server/randomEvents';
import type { WalkingWomanState } from '../shared/types';

const cart = { phase: 'active' as const, targets: [], cooldownRoundsRemaining: 0 };
function woman(slot: number, fromSlot: number, direction: 'up' | 'down', phase: 'walking' | 'dead' = 'walking'): WalkingWomanState {
  return { phase, slot, fromSlot, direction, cooldownRoundsRemaining: 0, bloodTrail: [], killedFromTeam: null };
}

test('civilian begins and finishes beyond the entire canvas in both directions at every arena size', () => {
  for (const count of [2, 5, 8]) for (const direction of ['up', 'down'] as const) {
    const L = slotLayout(count), start = direction === 'down' ? -1 : count;
    const first = direction === 'down' ? 0 : count - 1, last = direction === 'down' ? count - 1 : 0;
    const end = direction === 'down' ? count : -1;
    const entry = woman(first, start, direction), exit = woman(end, last, direction);
    const offscreen = (y: number) => y < -32 || y - 168 * womanScale(L) > CANVAS_H + 32;
    assert.ok(offscreen(civilianFeet(L, entry, 0)!));
    assert.ok(offscreen(civilianFeet(L, exit, 1)!));
    assert.equal(civilianFeet(L, entry, 1), bulletLaneFeet(L, first));
    assert.equal(civilianFeet(L, exit, 0), bulletLaneFeet(L, last));
    const sign = direction === 'down' ? 1 : -1;
    for (const state of [entry, exit]) {
      let previous = civilianFeet(L, state, 0)!;
      for (let i = 1; i <= 100; i++) {
        const next = civilianFeet(L, state, i / 100)!;
        assert.ok((next - previous) * sign > 0, 'walking never reverses or pauses at an edge');
        assert.ok(Math.abs(next - previous) < 7, 'each small time step stays continuous');
        previous = next;
      }
    }
  }
});

test('waiting/return transitions happen only when the full surviving civilian is outside view', () => {
  for (const count of [2, 5, 8]) for (const direction of ['up', 'down'] as const) {
    const L = slotLayout(count), outside = direction === 'down' ? count : -1;
    let state = woman(outside, direction === 'down' ? count - 1 : 0, direction);
    const oldEnd = civilianFeet(L, state, 1);
    state = advanceWalkingWoman(state, 10, count, initialStrongWindState());
    assert.equal(state.phase, 'waiting');
    assert.equal(civilianFeet(L, state, 1), null);
    for (let i = 0; i < 3; i++) state = advanceWalkingWoman(state, 11 + i, count, initialStrongWindState());
    assert.equal(state.phase, 'walking');
    assert.equal(civilianFeet(L, state, 0), oldEnd, 'return starts where the survivor really left');
  }
});

test('playable civilian lanes and projectile hitboxes are unchanged; exited civilians cannot be hit', () => {
  for (const count of [2, 5, 8]) {
    const L = slotLayout(count);
    for (let slot = 0; slot < count; slot++) assert.equal(civilianLaneFeet(L, slot), bulletLaneFeet(L, slot));
    for (const slot of [-1, -.72, 0, .3, count - 1, count - .5, count]) {
      assert.ok(Math.abs(civilianSlotAtFeet(L, civilianLaneFeet(L, slot)) - slot) < 1e-10);
    }
    for (const outside of [-1, count]) for (let slot = 0; slot < count; slot++) {
      assert.equal(civilianIntersection(playerShotCurve(L, 'sheriffs', slot, slot, slot), L, outside), null);
    }
  }
});

test('all legal wind-assisted/offboard shots ignore an exited civilian without ignoring in-board bodies', () => {
  for (const count of [2, 5, 8]) for (const team of ['sheriffs', 'outlaws'] as const) {
    for (let slot = 0; slot < count; slot++) for (const aim of [slot - 1, slot, slot + 1]) for (const shift of [-1, 0, 1]) {
      for (const outside of [-1, count]) {
        const body = woman(outside, outside === -1 ? 0 : count - 1, outside === -1 ? 'up' : 'down');
        assert.equal(shotCivilianHit(count, team, slot, { aimedSlot: aim, targetSlot: aim + shift }, body), null);
      }
    }
    let hits = 0;
    for (const slot of [0, count - 1]) {
      const aim = slot === 0 ? -1 : count;
      const body = woman(slot, slot, 'down');
      const expected = civilianIntersection(playerShotCurve(slotLayout(count), team, slot, aim, slot), slotLayout(count), slot);
      const actual = shotCivilianHit(count, team, slot, { aimedSlot: aim, targetSlot: slot }, body);
      // On two very tall lanes the upward curve passes above her head; other
      // curves still hit the body exactly where the drawn flight intersects.
      assert.equal(actual, expected);
      if (actual !== null) hits++;
    }
    assert.ok(hits > 0, 'offboard aiming must still permit hits on a visible civilian');
  }
});

test('gatling enters from offscreen, slows into its firing position and clears the bottom before removal', () => {
  const start = gatlingTravel(0), parked = gatlingTravel(1);
  assert.ok(start.y + 112 * start.scale < -32, 'even the carriage shadow starts outside view');
  assert.equal(parked.y, 425);
  let previous = start;
  for (let i = 1; i <= 1000; i++) {
    const next = gatlingTravel(i / 1000);
    assert.ok(next.y >= previous.y && next.p >= previous.p);
    assert.ok(next.y - previous.y < 2);
    previous = next;
  }
  assert.ok(Math.abs(gatlingTravel(.78).y - gatlingTravel(.7799).y) < .001, 'no hard stop at arrival');
  for (const elapsed of [0, 850, 1144, 1250, GATLING_DEPARTURE_MS]) assert.equal(gatlingTravel(1, elapsed).y, parked.y);
  const almostGone = gatlingTravel(1, GATLING_DEPARTURE_MS + GATLING_DEPARTURE_DURATION_MS - 1);
  assert.ok(almostGone.y - 227 * almostGone.scale > CANVAS_H + 32);
  assert.equal(gatlingTravel(1, 2600).alpha, 0);
});

test('reduced-motion cart uses a gradual entrance and departure with no travel or abrupt opacity change', () => {
  assert.equal(gatlingTravel(0, -1, false).alpha, 0);
  assert.equal(gatlingTravel(1, 0, false).alpha, 1);
  let alpha = 0;
  for (let i = 0; i <= 1000; i++) {
    const frame = gatlingTravel(i / 1000, -1, false);
    assert.equal(frame.y, 425); assert.equal(frame.scale, .9);
    assert.ok(frame.alpha >= alpha && frame.alpha - alpha < .01);
    alpha = frame.alpha;
  }
  for (let elapsed = GATLING_DEPARTURE_MS; elapsed <= 2600; elapsed++) {
    const frame = gatlingTravel(1, elapsed, false);
    assert.ok(frame.alpha <= alpha && alpha - frame.alpha < .01);
    alpha = frame.alpha;
  }
  assert.equal(alpha, 0);
});

test('extended entrances, living collisions, corpses and offscreen pushes use the same physical position', () => {
  for (const count of [2, 5, 8]) for (const phase of ['walking', 'dead'] as const) {
    const L = slotLayout(count);
    for (const before of [woman(0, -1, 'down', phase), woman(0, 1, 'up', phase), woman(count - 1, count - 1, 'down', phase)]) {
      const after = runOverWomanWithGatling(before, cart, count), hit = after.gatlingCrush!;
      assert.ok(hit);
      const progress = hit.leg === 'arrival' ? hit.at : 1, elapsed = hit.leg === 'departure' ? hit.at : -1;
      const physical = civilianFeet(L, before, progress)!;
      assert.ok(Math.abs(physical - gatlingPosition(progress, elapsed).contactY) < .0001);
      const full = gatlingWomanFrame(L, after, cart, progress, elapsed, true);
      assert.ok(Math.abs(civilianFeet(L, full.woman, full.progress)! - physical) < .0001, 'crush starts exactly at the drawn feet');
      const reduced = gatlingWomanFrame(L, after, cart, progress, elapsed, false);
      assert.equal(reduced.woman.phase, 'dead');
      assert.equal(reduced.crush?.fall, 1);
      assert.equal(reduced.crush?.compression, 1);
    }
  }
});

test('fractional corpses finish drifting offscreen before removal, including wind stopping at the upper edge', () => {
  for (const count of [2, 5, 8]) for (const direction of ['up', 'down'] as const) {
    const L = slotLayout(count), active = { ...initialStrongWindState(), phase: 'active' as const, direction };
    let state = woman(direction === 'up' ? .65 : count - 1.65, direction === 'up' ? .65 : count - 1.65, direction, 'dead');
    state = advanceWalkingWoman(state, 12, count, active);
    assert.equal(state.phase, 'dead');
    const stopped = advanceWalkingWoman(state, 13, count, initialStrongWindState());
    assert.equal(stopped.phase, 'dead', 'a partially offboard body must not disappear when wind stops');
    assert.equal(civilianFeet(L, stopped, 0), civilianFeet(L, state, 1));
    for (let round = 14; round < 20; round++) {
      const previous = state, endpoint = civilianFeet(L, previous, 1)!;
      state = advanceWalkingWoman(state, round, count, active);
      if (state.phase === 'gone') {
        assert.ok(endpoint + 50 * womanScale(L) < 0 || endpoint - 50 * womanScale(L) > CANVAS_H,
          'the whole corpse must already be out of view');
        break;
      }
      assert.equal(civilianFeet(L, state, 0), endpoint, 'each drift starts where the previous one ended');
    }
    assert.equal(state.phase, 'gone');
  }
});

test('fractional crushed bodies remain continuous across the cart departure and every subsequent round', () => {
  for (const count of [2, 5, 8]) {
    const L = slotLayout(count);
    for (const before of [woman(0, -1, 'down'), woman(0, 1, 'up'), woman(count - 1, count - 2, 'down')]) {
      let state = runOverWomanWithGatling(before, cart, count);
      assert.ok(state.gatlingCrush);
      const completed = gatlingWomanFrame(L, state, cart, 1, 2599, true);
      assert.equal(completed.progress, 1, 'the cart completes its entire push before the next phase');
      let endpoint = civilianFeet(L, completed.woman, completed.progress)!;
      for (let round = 12; round < 24; round++) {
        state = advanceWalkingWoman(state, round, count, initialStrongWindState());
        if (state.phase === 'gone') {
          assert.ok(endpoint - 50 * womanScale(L) > CANVAS_H);
          break;
        }
        assert.equal(state.phase, 'dead');
        assert.equal(civilianFeet(L, state, 0), endpoint, 'corpse must not reset its crushed pose/position at the next round');
        endpoint = civilianFeet(L, state, 1)!;
      }
      assert.equal(state.phase, 'gone');
    }
  }
});
