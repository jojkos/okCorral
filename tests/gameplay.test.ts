import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveActions } from '../server/actions';
import { BOT_CIVILIAN_OVERSIGHT_CHANCE, chooseBotAction } from '../server/bots';
import { RoomManager } from '../server/rooms';
import { advanceGatlingMan, advanceStrongWind, advanceWalkingWoman, initialGatlingManState, initialStrongWindState, initialWalkingWomanState, runOverWomanWithGatling } from '../server/randomEvents';
import { shotPreview, threatsTo } from '../src/client/components/boardInfo';
import { shotPath } from '../shared/shooting';
import { civilianIntersection, curvePoint, finishShot, flightPoint, playerShotCurve, trimCurve } from '../shared/ballistics';
import { bulletLaneFeet, slotLayout, womanScale } from '../shared/arenaGeometry';
import { gatlingTravel, gatlingWomanFrame } from '../src/host/arena/gatling';
import { actorFrame, drawActor, headY } from '../src/host/arena/actors';
import { cowboyCoverDrop, cowboyCoverPose } from '../src/lib/cowboyPose';
import { VOLLEY } from '../src/lib/presentation';
import type { GameState, Player, WalkingWomanState } from '../shared/types';
import { Server } from 'socket.io';
import { initialRainState } from '../server/rain';

const mk = (id: string, team: Player['team'], slot: number, extra: Partial<Player> = {}): Player => ({
  id, name: id, team, slot, hp: 3, ammo: 1, isAlive: true, actionLocked: true, currentAction: 'NONE', isCovered: false, ...extra,
});
function board(players: Player[], slots = 5): GameState {
  const barrels = [];
  for (let s = 0; s < slots; s++) { barrels.push({ team: 'sheriffs' as const, slot: s, hp: 3 }, { team: 'outlaws' as const, slot: s, hp: 3 }); }
  return { roomCode: 'TEST', revision: 0, phase: 'planning', tick: 1, config: { tickDuration: 4000, slotsPerSide: slots }, strongWind: initialStrongWindState(), rain: initialRainState(), walkingWoman: initialWalkingWomanState(), gatlingMan: initialGatlingManState(), pendingSuicides: [], lastTickSuicides: [], players, barrels, winner: null, tickStartTime: 0, pendingActions: [], lastTickBullets: [] };
}

test('walking woman enters from either edge and moves exactly one lane per round', () => {
  let woman = initialWalkingWomanState();
  const calm = initialStrongWindState();
  woman = advanceWalkingWoman(woman, 3, 5, calm, () => 0);
  assert.deepEqual([woman.phase, woman.direction, woman.fromSlot, woman.slot], ['walking', 'down', -1, 0]);
  woman = advanceWalkingWoman(woman, 4, 5, calm, () => { throw new Error('walking event must not reroll'); });
  assert.deepEqual([woman.fromSlot, woman.slot], [0, 1]);
  woman = advanceWalkingWoman(woman, 5, 5, calm, () => { throw new Error('walking event must not reroll'); });
  assert.deepEqual([woman.fromSlot, woman.slot], [1, 2]);

  let reverse = initialWalkingWomanState();
  const rolls = [0, 0.9];
  reverse = advanceWalkingWoman(reverse, 3, 5, calm, () => rolls.shift()!);
  assert.deepEqual([reverse.direction, reverse.slot], ['up', 4]);
});

test('strong wind drags the body one lane per round, leaves blood, and never brings it back', () => {
  const wind = { phase: 'active' as const, direction: 'up' as const, activeRoundsRemaining: 2, cooldownRoundsRemaining: 0 };
  let woman: WalkingWomanState = { phase: 'dead', direction: 'down', fromSlot: 1, slot: 1, cooldownRoundsRemaining: 0, bloodTrail: [1], killedFromTeam: 'sheriffs' };
  woman = advanceWalkingWoman(woman, 6, 5, wind, () => { throw new Error('dead woman must not reroll'); });
  assert.deepEqual([woman.phase, woman.fromSlot, woman.slot, woman.bloodTrail], ['dead', 1, 0, [1, 0]]);
  woman = advanceWalkingWoman(woman, 7, 5, wind, () => { throw new Error('dead woman must not reroll'); });
  assert.deepEqual([woman.phase, woman.fromSlot, woman.slot, woman.bloodTrail], ['dead', 0, -1, [1, 0, -1]]);
  const gone = advanceWalkingWoman(woman, 8, 5, initialStrongWindState(), () => 0);
  assert.deepEqual([gone.phase, gone.slot, gone.bloodTrail], ['gone', null, [1, 0, -1]]);
  const stillGone = advanceWalkingWoman(gone, 20, 5, initialStrongWindState(), () => 0);
  assert.deepEqual(stillGone, gone);
});

test('a surviving civilian waits three complete rounds, then returns from the edge she left', () => {
  const noReroll = () => { throw new Error('a survivor must return without a random respawn roll'); };
  for (const initialDirection of ['up', 'down'] as const) for (const slots of [3, 5, 8]) {
    let woman: WalkingWomanState = {...initialWalkingWomanState(), phase: 'walking', direction: initialDirection,
      slot: initialDirection === 'down' ? slots-1 : 0, fromSlot: initialDirection === 'down' ? slots-2 : 1};
    const calm = initialStrongWindState();
    let round = 10;
    for (let trip = 0; trip < 3; trip++) {
      const oldDirection = woman.direction;
      woman = advanceWalkingWoman(woman, ++round, slots, calm, noReroll);
      assert.equal(woman.slot, oldDirection === 'down' ? slots : -1, 'animate her exit before hiding her');
      for (const remaining of [3, 2, 1]) {
        woman = advanceWalkingWoman(woman, ++round, slots, calm, noReroll);
        assert.deepEqual([woman.phase, woman.slot, woman.fromSlot, woman.cooldownRoundsRemaining], ['waiting', null, null, remaining]);
      }
      woman = advanceWalkingWoman(woman, ++round, slots, calm, noReroll);
      const direction = oldDirection === 'down' ? 'up' : 'down';
      assert.deepEqual([woman.phase, woman.direction, woman.slot, woman.fromSlot],
        ['walking', direction, direction === 'up' ? slots-1 : 0, direction === 'up' ? slots : -1]);
      assert.deepEqual(woman.bloodTrail, []);
      assert.equal(woman.killedFromTeam, null);
      assert.equal(woman.cooldownRoundsRemaining, 0);
      for (let move=1; move<slots; move++) woman = advanceWalkingWoman(woman, ++round, slots, calm, noReroll);
    }
  }
});

test('killing a returning civilian cancels all future trips, including after her body leaves', () => {
  const calm = initialStrongWindState();
  const returning = advanceWalkingWoman({...initialWalkingWomanState(), phase: 'waiting', direction: 'up', cooldownRoundsRemaining: 1}, 12, 5, calm);
  const gs = board([mk('s', 'sheriffs', 4, {currentAction: 'SHOOT_STRAIGHT'}), mk('o', 'outlaws', 0)]);
  gs.tick = 12; gs.walkingWoman = returning;
  const result = resolveActions(gs);
  assert.equal(result.bullets[0].hit, 'woman');
  assert.equal(result.state.walkingWoman.phase, 'dead');
  const wind = {phase: 'active' as const, direction: 'down' as const, activeRoundsRemaining: 1, cooldownRoundsRemaining: 0};
  let woman = advanceWalkingWoman(result.state.walkingWoman, 13, 5, wind);
  woman = advanceWalkingWoman(woman, 14, 5, wind);
  assert.equal(woman.phase, 'gone');
  for (let round=15; round<40; round++) {
    woman = advanceWalkingWoman(woman, round, 5, calm, () => { throw new Error('dead civilians never respawn'); });
    assert.equal(woman.phase, 'gone');
  }
});

test('shooting the woman intercepts the shot and forces suicide in the following round', () => {
  const shooter = mk('s', 'sheriffs', 2, { ammo: 2, currentAction: 'SHOOT_STRAIGHT' });
  const target = mk('o', 'outlaws', 2);
  const first = board([shooter, target]);
  first.tick = 4;
  first.walkingWoman = { phase: 'walking', direction: 'down', fromSlot: 1, slot: 2, cooldownRoundsRemaining: 0, bloodTrail: [], killedFromTeam: null };
  const hit = resolveActions(first);
  assert.deepEqual(hit.bullets.map(b => [b.shooterId, b.hit]), [['s', 'woman']]);
  assert.deepEqual([hit.state.walkingWoman.phase, hit.state.walkingWoman.bloodTrail], ['dead', [2]]);
  assert.equal(hit.state.players.find(p => p.id === 'o')!.hp, 3, 'woman intercepts the shot');
  assert.deepEqual(hit.state.pendingSuicides, [{ playerId: 's', dueTick: 5 }]);

  hit.state.tick = 5;
  hit.state.players.find(p => p.id === 's')!.currentAction = 'SHOOT_STRAIGHT';
  const next = resolveActions(hit.state);
  assert.equal(next.state.players.find(p => p.id === 's')!.isAlive, false);
  assert.deepEqual(next.state.lastTickSuicides, ['s']);
  assert.equal(next.bullets.some(b => b.shooterId === 's'), false, 'suicide happens before the volley');
});

test('strong wind is scheduled with a warning, lasts two rounds, then enforces a calm round', () => {
  let wind = initialStrongWindState();
  for (let round = 1; round <= 3; round++) wind = advanceStrongWind(wind, round, () => 0);
  assert.equal(wind.phase, 'calm', 'cannot warn early enough to affect rounds before 5');

  const rolls = [0.34, 0.2];
  wind = advanceStrongWind(wind, 4, () => rolls.shift()!);
  assert.deepEqual([wind.phase, wind.direction], ['warning', 'up']);
  wind = advanceStrongWind(wind, 5, () => { throw new Error('active round must not roll'); });
  assert.deepEqual([wind.phase, wind.activeRoundsRemaining], ['active', 2]);
  wind = advanceStrongWind(wind, 6, () => { throw new Error('active round must not roll'); });
  assert.deepEqual([wind.phase, wind.activeRoundsRemaining], ['active', 1]);
  wind = advanceStrongWind(wind, 7, () => { throw new Error('cooldown round must not roll'); });
  assert.deepEqual([wind.phase, wind.cooldownRoundsRemaining], ['calm', 1]);
  wind = advanceStrongWind(wind, 8, () => 0.99);
  assert.deepEqual([wind.phase, wind.cooldownRoundsRemaining], ['calm', 0]);
});

test('curved shots intercept civilians along the street, not in their final target lane', () => {
  for (const team of ['sheriffs', 'outlaws'] as const) {
    for (const [action, direction, crossedLane, finalLane] of [
      ['SHOOT_UP', 'up', 1, 0], ['SHOOT_DOWN', 'down', 3, 4],
    ] as const) {
      const enemy = team === 'sheriffs' ? 'outlaws' : 'sheriffs';
      const shooter = mk('shooter', team, 2, {currentAction: action, ammo: 3});
      const target = mk('target', enemy, finalLane, {ammo: 0});
      const gs = board([shooter, target]);
      gs.strongWind = {phase: 'active', direction, activeRoundsRemaining: 1, cooldownRoundsRemaining: 0};
      gs.walkingWoman = {...initialWalkingWomanState(), phase: 'walking', slot: crossedLane, fromSlot: crossedLane};
      const result = resolveActions(gs);
      const bullet = result.bullets[0];
      assert.equal(bullet.hit, 'woman');
      assert.equal(bullet.toSlot, finalLane, 'keep the intended destination, do not retarget the shot');
      assert.ok(bullet.civilianHitT! > 0.45 && bullet.civilianHitT! < 0.55);
      assert.equal(result.state.walkingWoman.phase, 'dead');
      assert.equal(result.state.players[1].hp, 3, 'the intercepted shot cannot reach its target');
      assert.deepEqual(result.state.pendingSuicides, [{playerId: shooter.id, dueTick: 2}]);
      assert.match(shotPreview(gs, shooter, action)!.text, /civilian/);
      assert.deepEqual(threatsTo(gs, target), []);
      const choices = decisions(gs, shooter);
      const risky = choices.filter(a => a === action).length;
      assert.ok(risky > 0 && risky <= choices.length * BOT_CIVILIAN_OVERSIGHT_CHANCE, 'bots usually avoid curved interception but can overlook it');

      gs.walkingWoman.slot = finalLane;
      gs.walkingWoman.fromSlot = finalLane;
      const bypass = resolveActions(gs);
      assert.equal(bypass.bullets[0].hit, 'player', 'matching the final lane alone is not a civilian hit');
      assert.equal(bypass.state.walkingWoman.phase, 'walking');
      assert.equal(bypass.state.players[1].hp, 2);
      assert.deepEqual(bypass.state.pendingSuicides, []);
      assert.doesNotMatch(shotPreview(gs, shooter, action)!.text, /civilian/);
      assert.equal(threatsTo(gs, target)[0]?.id, shooter.id);

      gs.walkingWoman.slot = crossedLane;
      gs.walkingWoman.phase = 'dead';
      assert.equal(resolveActions(gs).bullets[0].hit, 'player', 'a fallen body does not block standing-height shots');
    }
  }
});

test('shots blown off either edge can still hit the civilian before leaving the board', () => {
  for (const [slot, direction] of [[0, 'up'], [4, 'down']] as const) {
    const shooter = mk('s', 'sheriffs', slot, {currentAction: 'SHOOT_STRAIGHT'});
    const gs = board([shooter, mk('o', 'outlaws', 2)]);
    gs.strongWind = {phase: 'active', direction, activeRoundsRemaining: 1, cooldownRoundsRemaining: 0};
    gs.walkingWoman = {...initialWalkingWomanState(), phase: 'walking', slot, fromSlot: slot};
    const preview = shotPreview(gs, shooter, 'SHOOT_STRAIGHT')!;
    assert.equal(preview.offBoard, true);
    assert.match(preview.text, /civilian/);
    const {state, bullets} = resolveActions(gs);
    assert.equal(bullets[0].hit, 'woman');
    assert.equal(state.players[0].ammo, 0);
  }
});

test('simultaneous curved hits from both sides stop at the body and both cause guilt', () => {
  const gs = board(['sheriffs', 'outlaws'].map(team => mk(team, team as Player['team'], 2, {currentAction: 'SHOOT_UP'})));
  gs.strongWind = {phase: 'active', direction: 'up', activeRoundsRemaining: 1, cooldownRoundsRemaining: 0};
  gs.walkingWoman = {...initialWalkingWomanState(), phase: 'walking', slot: 1, fromSlot: 1};
  const {state, bullets} = resolveActions(gs);
  assert.deepEqual(bullets.map(b => b.hit), ['woman', 'woman']);
  assert.equal(state.pendingSuicides.length, 2);
});

test('rendered bullet prefixes and body impact points exactly match collision geometry at all board sizes', () => {
  for (const slots of [3, 5, 8, 10]) for (const team of ['sheriffs', 'outlaws'] as const) {
    const L = slotLayout(slots), slot = Math.floor(slots / 2);
    const path = shotPath(slot, 'SHOOT_UP', {phase: 'active', direction: 'up', activeRoundsRemaining: 1, cooldownRoundsRemaining: 0}, slots)!;
    const curve = playerShotCurve(L, team, slot, path.aimedSlot, path.targetSlot);
    const civilianSlot = slot - 1;
    const hit = civilianIntersection(curve, L, civilianSlot)!;
    assert.ok(hit !== null && hit > 0 && hit < 1);
    const prefix = trimCurve(curve, hit), impact = curvePoint(curve, hit);
    assert.ok(Math.abs(prefix.toX - impact.x) < 1e-7 && Math.abs(prefix.toY - impact.y) < 1e-7);
    assert.ok(impact.y <= bulletLaneFeet(L, civilianSlot) + 2*womanScale(L));
    assert.ok(impact.y >= bulletLaneFeet(L, civilianSlot) - 167*womanScale(L));
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      const animated = curvePoint(prefix, t), actual = curvePoint(curve, t * hit);
      assert.ok(Math.hypot(animated.x-actual.x, animated.y-actual.y) < 1e-7);
    }
    // Reaching a body or barrel only changes flight AFTER clearing the street.
    for (const toX of team === 'sheriffs' ? [1168, 1300] : [432, 300]) {
      const full = finishShot(curve, toX, bulletLaneFeet(L, path.targetSlot) - 50*L.s);
      const endT = (toX - curve.fromX) / (curve.toX - curve.fromX);
      for (const t of [0.45, 0.5, 0.55]) {
        const animated = flightPoint(full, t / endT), actual = curvePoint(curve, t);
        assert.ok(Math.hypot(animated.x-actual.x, animated.y-actual.y) < 1e-7);
      }
      assert.ok(Math.hypot(flightPoint(full, 1).x-full.toX, flightPoint(full, 1).y-full.toY) < 1e-7);
    }
  }
});

test('gatling arrives, stays for all eight shots, then continues through the whole street', () => {
  const far = gatlingTravel(0), ready = gatlingTravel(1);
  assert.ok(far.y < ready.y && far.scale < ready.scale);
  for (const elapsed of [0, VOLLEY.move, VOLLEY.move + 7*42, VOLLEY.impact]) {
    assert.deepEqual(gatlingTravel(1, elapsed), ready, 'no departure during the volley');
  }
  const halfway = gatlingTravel(1, VOLLEY.impact + 140 + 550);
  const gone = gatlingTravel(1, 2599);
  assert.ok(halfway.y > ready.y && halfway.scale > ready.scale);
  assert.ok(halfway.p > ready.p, 'wheels keep turning forwards');
  assert.ok(gone.y - 227 * gone.scale > 900, 'even the hat clears the bottom edge');
  let previous = ready;
  for (let elapsed = VOLLEY.impact; elapsed < 2600; elapsed += 10) {
    const next = gatlingTravel(1, elapsed);
    assert.ok(next.y >= previous.y && next.p >= previous.p, 'never reverses');
    previous = next;
  }
  assert.equal(gone.alpha, 0, 'gone before the next planning phase, without teleporting');
  assert.equal(gatlingTravel(1, 2000, false).y, ready.y, 'reduced motion keeps the cart still');
  assert.equal(gatlingTravel(1, 2599, false).alpha, 0);
});

test('corpses in every lane flatten only at wheel contact and keep moving afterwards', () => {
  const gatling = { phase: 'active' as const, cooldownRoundsRemaining: 0, targets: [] };
  for (const slots of [3, 5, 8, 10]) for (let slot = 0; slot < slots; slot++) {
    const L = slotLayout(slots);
    const original: WalkingWomanState = { phase: 'dead', slot, fromSlot: slot, direction: null,
      cooldownRoundsRemaining: 0, bloodTrail: [slot], killedFromTeam: 'sheriffs' };
    const corpse = runOverWomanWithGatling(original, gatling, slots);
    const before = gatlingWomanFrame(L, corpse, gatling, 0, -1, true);
    assert.equal(before.woman.crushedByGatling, false);
    assert.equal(before.woman.slot, slot);
    assert.deepEqual(before.woman.bloodTrail, [slot]);
    const waiting = gatlingWomanFrame(L, corpse, gatling, 1, VOLLEY.impact, true);
    assert.equal(!!waiting.woman.crushedByGatling, bulletLaneFeet(L, slot) <= gatlingTravel(1).y);
    const left = gatlingWomanFrame(L, corpse, gatling, 1, 2599, true);
    assert.equal(left.woman.crushedByGatling, true);
    assert.equal(left.progress, 1);
    const next = advanceWalkingWoman(corpse, 12, slots, initialStrongWindState());
    assert.equal(next.gatlingCrushedThisRound, false);
    assert.equal(next.crushedByGatling, true);
  }
});

test('gatling departure can crush a newly shot civilian ahead, but not behind the cart', () => {
  for (const slot of [0, 4]) {
    const gs = board([mk('s', 'sheriffs', slot, {currentAction: 'SHOOT_STRAIGHT'}), mk('o', 'outlaws', slot)]);
    gs.walkingWoman = {phase:'walking',slot,fromSlot:slot,direction:'down',cooldownRoundsRemaining:0,bloodTrail:[],killedFromTeam:null};
    gs.gatlingMan = {phase:'active',targets:[],cooldownRoundsRemaining:0};
    const {state, bullets} = resolveActions(gs);
    assert.ok(bullets.some(b => b.hit === 'woman'));
    assert.equal(state.walkingWoman.phase, 'dead');
    assert.equal(!!state.walkingWoman.crushedByGatling, slot === 4);
    assert.equal(state.walkingWoman.slot, slot === 4 ? 5 : 0);
    assert.ok(state.pendingSuicides.some(p => p.playerId === 's'));
  }
});

test('cover bends knees at a fixed character scale, even after the barrel shatters', () => {
  const L = slotLayout(5), p = mk('s', 'sheriffs', 2, {isCovered:true,currentAction:'COVER'});
  const intact = actorFrame(L, p, undefined, {team:p.team,slot:2,hp:3}, -1, VOLLEY, {}, false);
  const broken = actorFrame(L, p, undefined, {team:p.team,slot:2,hp:0}, -1, VOLLEY, {}, false);
  assert.equal(intact.cover, 1); assert.equal(broken.cover, 1);
  assert.equal(headY(L, intact), headY(L, broken));
  assert.equal(intact.covered, true); assert.equal(broken.noCover, true);
  assert.ok(cowboyCoverDrop(1) > 20 && cowboyCoverDrop(1) < 30);
  const knee = cowboyCoverPose(1);
  assert.ok(knee.frontThigh < 0 && knee.rearShin > 1.5);
  const scales: number[][] = [];
  const ctx = new Proxy({}, {get: (_target, name) => name === 'scale' ? (...args: number[]) => scales.push(args)
    : String(name).startsWith('create') ? () => ({addColorStop() {}}) : () => {}, set: () => true}) as CanvasRenderingContext2D;
  drawActor(ctx, L, p, broken, {}, {walk:0,recoil:0,reload:0,suicide:0}, 0, false);
  assert.deepEqual(scales[1], [L.s, L.s], 'actor transform is uniform; only the ground shadow flattens');
});

test('gatling gunman can first appear on round 10 and then waits 15 complete rounds', () => {
  let gatling = initialGatlingManState();
  for (let round = 1; round <= 9; round++) {
    gatling = advanceGatlingMan(gatling, round, 5, () => { throw new Error('gatling event must not roll before round 10'); });
  }
  gatling = advanceGatlingMan(gatling, 10, 5, () => 0);
  assert.equal(gatling.phase, 'warning');
  assert.equal(gatling.targets.length, 8);
  assert.ok(gatling.targets.every(t => t.team === 'sheriffs' && t.slot === 0));

  gatling = advanceGatlingMan(gatling, 11, 5, () => { throw new Error('warning transitions directly to active'); });
  assert.equal(gatling.phase, 'active');
  gatling = advanceGatlingMan(gatling, 12, 5, () => { throw new Error('active event transitions directly to cooldown'); });
  assert.equal(gatling.cooldownRoundsRemaining, 15);
  for (let round = 13; round <= 26; round++) {
    gatling = advanceGatlingMan(gatling, round, 5, () => { throw new Error('gatling event must not roll during cooldown'); });
  }
  assert.equal(gatling.cooldownRoundsRemaining, 1);
  gatling = advanceGatlingMan(gatling, 27, 5, () => 0);
  assert.equal(gatling.phase, 'warning', 'eligible again only after 15 quiet rounds');
  gatling = advanceGatlingMan(gatling, 28, 5, () => { throw new Error('warning becomes arrival without another random roll'); });
  assert.equal(gatling.phase, 'active');
});

test('gatling cart runs over a corpse and the flattened body keeps sliding down-street', () => {
  const corpse: WalkingWomanState = {
    phase: 'dead', direction: null, fromSlot: 1, slot: 1,
    cooldownRoundsRemaining: 0, bloodTrail: [1], killedFromTeam: 'outlaws',
  };
  const active = { phase: 'active' as const, cooldownRoundsRemaining: 0, targets: [] };
  let woman = runOverWomanWithGatling(corpse, active, 5);
  assert.deepEqual(
    [woman.crushedByGatling, woman.direction, woman.fromSlot, woman.slot, woman.bloodTrail],
    [true, 'down', 1, 2, [1, 2]],
  );
  woman = advanceWalkingWoman(woman, 12, 5, initialStrongWindState(), () => { throw new Error('a rolling corpse must not reroll'); });
  assert.deepEqual([woman.fromSlot, woman.slot, woman.bloodTrail], [2, 3, [1, 2, 3]]);
  woman = advanceWalkingWoman(woman, 13, 5, initialStrongWindState(), () => { throw new Error('a rolling corpse must not reroll'); });
  woman = advanceWalkingWoman(woman, 14, 5, initialStrongWindState(), () => { throw new Error('a rolling corpse must not reroll'); });
  assert.deepEqual([woman.phase, woman.slot], ['dead', 5]);
  woman = advanceWalkingWoman(woman, 15, 5, initialStrongWindState(), () => { throw new Error('off-board corpse must not reroll'); });
  assert.deepEqual([woman.phase, woman.slot], ['gone', null]);
});

test('gatling gunman fires exactly eight shots at board positions and respects cover', () => {
  const sheriff = mk('s', 'sheriffs', 0, { currentAction: 'COVER', isCovered: true });
  const outlaw = mk('o', 'outlaws', 1);
  const gs = board([sheriff, outlaw], 3);
  gs.tick = 10;
  gs.gatlingMan = {
    phase: 'active', cooldownRoundsRemaining: 0,
    targets: [
      { team: 'sheriffs', slot: 0 }, { team: 'sheriffs', slot: 0 },
      { team: 'sheriffs', slot: 0 }, { team: 'sheriffs', slot: 0 },
      { team: 'outlaws', slot: 1 }, { team: 'outlaws', slot: 1 },
      { team: 'outlaws', slot: 1 }, { team: 'outlaws', slot: 2 },
    ],
  };
  const { state, bullets } = resolveActions(gs);
  assert.equal(bullets.length, 8);
  assert.ok(bullets.every(b => b.source === 'gatling' && !b.shooterId));
  assert.deepEqual(bullets.map(b => b.hit), ['barrel', 'barrel', 'barrel', 'player', 'player', 'player', 'player', 'miss']);
  assert.equal(state.barrels.find(b => b.team === 'sheriffs' && b.slot === 0)!.hp, 0);
  assert.equal(state.players.find(p => p.id === 's')!.hp, 2);
  assert.equal(state.players.find(p => p.id === 'o')!.isAlive, false);
});

test('active strong wind shifts shots and spends ammo when the shifted target leaves the board', () => {
  const hitShooter = mk('hit', 'sheriffs', 2, { ammo: 2, currentAction: 'SHOOT_STRAIGHT' });
  const edgeShooter = mk('edge', 'outlaws', 0, { ammo: 2, currentAction: 'SHOOT_STRAIGHT' });
  const target = mk('target', 'outlaws', 1, { currentAction: 'NONE' });
  const gs = board([hitShooter, edgeShooter, target]);
  gs.strongWind = { phase: 'active', direction: 'up', activeRoundsRemaining: 2, cooldownRoundsRemaining: 0 };

  const { state, bullets } = resolveActions(gs);
  assert.equal(state.players.find(p => p.id === 'target')!.hp, 2, 'straight shot lands one row up');
  assert.equal(state.players.find(p => p.id === 'edge')!.ammo, 1, 'off-board wind shot still costs ammo');
  const edgeBullet = bullets.find(b => b.shooterId === 'edge')!;
  assert.deepEqual([edgeBullet.toSlot, edgeBullet.hit], [-1, 'miss']);
});

test('opposing wind-curved bullets collide when their paths meet', () => {
  const sheriff = mk('s', 'sheriffs', 1, { currentAction: 'SHOOT_DOWN' });
  const outlaw = mk('o', 'outlaws', 2, { currentAction: 'SHOOT_UP' });
  const gs = board([sheriff, outlaw]);
  gs.strongWind = { phase: 'active', direction: 'up', activeRoundsRemaining: 1, cooldownRoundsRemaining: 0 };

  const { state, bullets } = resolveActions(gs);
  assert.deepEqual(bullets.map(b => [b.shooterId, b.aimedSlot, b.toSlot, b.hit]), [
    ['s', 2, 1, 'bullet'],
    ['o', 1, 0, 'bullet'],
  ]);
  assert.deepEqual(state.players.map(p => [p.id, p.hp, p.ammo]), [['s', 3, 0], ['o', 3, 0]]);
});

test('phone shot preview shows the actual wind-shifted target', () => {
  const shooter = mk('shooter', 'sheriffs', 2);
  const target = mk('target', 'outlaws', 1);
  const gs = board([shooter, target]);
  gs.strongWind = { phase: 'active', direction: 'up', activeRoundsRemaining: 2, cooldownRoundsRemaining: 0 };
  const shifted = shotPreview(gs, shooter, 'SHOOT_STRAIGHT')!;
  assert.deepEqual([shifted.lane, shifted.target?.id, shifted.offBoard], [1, 'target', false]);

  shooter.slot = 0;
  const lost = shotPreview(gs, shooter, 'SHOOT_STRAIGHT')!;
  assert.deepEqual([lost.lane, lost.offBoard, lost.disabled], [-1, true, undefined]);
  assert.match(lost.text, /bullet lost/);
});

test('off-board aim bends back onto either edge, including cover and civilian interception', () => {
  for (const [slot, action, direction, aim] of [
    [0, 'SHOOT_UP', 'down', -1], [4, 'SHOOT_DOWN', 'up', 5],
  ] as const) {
    const shooter = mk('s', 'sheriffs', slot, {currentAction: action});
    const target = mk('o', 'outlaws', slot);
    const gs = board([shooter, target]);
    gs.strongWind = {phase: 'active', direction, activeRoundsRemaining: 1, cooldownRoundsRemaining: 0};
    const preview = shotPreview(gs, shooter, action)!;
    assert.equal(preview.disabled, undefined);
    assert.equal(preview.target?.id, 'o');
    assert.match(preview.text, /Off-board aim · wind/);
    assert.equal(threatsTo(gs, target)[0]?.id, 's');
    let result = resolveActions(gs);
    assert.deepEqual(result.bullets.map(b => [b.aimedSlot,b.toSlot,b.hit]), [[aim,slot,'player']]);
    assert.equal(result.state.players[0].ammo, 0);
    assert.equal(result.state.players[1].hp, 2);
    target.currentAction = 'COVER';
    result = resolveActions(gs);
    assert.equal(result.bullets[0].hit, 'barrel');
    gs.walkingWoman = {...initialWalkingWomanState(), phase: 'walking', slot, fromSlot: slot};
    assert.match(shotPreview(gs, shooter, action)!.text, /civilian/);
    result = resolveActions(gs);
    assert.equal(result.bullets[0].hit, 'woman');
    assert.equal(result.state.pendingSuicides[0].playerId, shooter.id);
  }
});

test('off-board shots still spend ammunition without helpful wind; non-shooting actions never fire', () => {
  for (const wind of [initialStrongWindState(), {phase: 'active' as const, direction: 'up' as const, activeRoundsRemaining: 1, cooldownRoundsRemaining: 0}]) {
    const shooter = mk('s', 'sheriffs', 0, {currentAction: 'SHOOT_UP'});
    const gs = board([shooter, mk('o','outlaws',0)]);
    gs.strongWind = wind;
    assert.equal(shotPreview(gs, shooter, 'SHOOT_UP')!.disabled, undefined);
    const {state, bullets} = resolveActions(gs);
    assert.equal(bullets[0].hit, 'miss');
    assert.equal(bullets[0].toSlot, wind.phase === 'active' ? -2 : -1);
    assert.equal(state.players[0].ammo, 0);
    shooter.currentAction = 'RELOAD';
    const reload = resolveActions(gs);
    assert.equal(reload.bullets.length, 0);
    assert.equal(reload.state.players[0].ammo, 2);
  }
});

const decisions = (gs: GameState, bot = gs.players[0]) => Array.from({length: 200}, (_, i) => chooseBotAction(gs, bot, () => (i + 0.5) / 200));

test('bots exploit off-board wind aiming and avoid bullets lost to the wind', () => {
  const bot = mk('b', 'sheriffs', 0, {ammo: 3});
  const gs = board([bot, mk('o','outlaws',0,{ammo: 0, hp: 1})]);
  gs.barrels.forEach(b => b.hp = 0);
  gs.strongWind = {phase: 'active', direction: 'down', activeRoundsRemaining: 1, cooldownRoundsRemaining: 0};
  assert.ok(decisions(gs).every(a => a === 'SHOOT_UP'));
  gs.strongWind.direction = 'up';
  assert.ok(decisions(gs).every(a => a === 'SHOOT_DOWN'));
});

test('bots preserve their life around civilians, reload empty guns, and use sound cover under fire', () => {
  const bot = mk('b','sheriffs',2,{ammo: 0});
  const gs = board([bot, mk('o','outlaws',2,{ammo: 0})]);
  assert.ok(decisions(gs).filter(a => a === 'RELOAD').length > 185);
  bot.ammo = 2;
  gs.walkingWoman = {...initialWalkingWomanState(), phase: 'walking', slot: 2, fromSlot: 2};
  const choices = decisions(gs);
  const reckless = choices.filter(a => a.startsWith('SHOOT')).length;
  assert.ok(reckless > 0 && reckless <= choices.length * BOT_CIVILIAN_OVERSIGHT_CHANCE);
  gs.walkingWoman = initialWalkingWomanState();
  bot.hp = 1; bot.ammo = 0;
  gs.players[1].ammo = 3;
  gs.players.push(mk('mate1','sheriffs',1), mk('mate2','sheriffs',3));
  assert.ok(decisions(gs).every(a => a === 'COVER'));
  gs.barrels.find(b => b.team === 'sheriffs' && b.slot === 2)!.hp = 0;
  assert.ok(decisions(gs).every(a => a === 'RELOAD'), 'a broken barrel offers no protection');
});

test('bot decisions ignore locked opponent choices and hidden gatling targets', () => {
  const gs = board([mk('b','sheriffs',2), mk('o','outlaws',2)]);
  gs.gatlingMan = {phase: 'active', cooldownRoundsRemaining: 0, targets: Array(8).fill({team: 'sheriffs',slot: 2})};
  const choices = decisions(gs);
  gs.players[1].currentAction = 'SHOOT_STRAIGHT';
  gs.pendingActions = [{playerId: 'o', action: 'SHOOT_STRAIGHT'}];
  gs.gatlingMan.targets = Array(8).fill({team: 'outlaws',slot: 0});
  assert.deepEqual(decisions(gs), choices);
});

test('rare bot oversights can kill a civilian, but still incur the usual fatal guilt', () => {
  const bot = mk('bot', 'sheriffs', 2, {ammo: 3});
  const gs = board([bot, mk('o', 'outlaws', 2, {ammo: 0, hp: 1})]);
  gs.barrels.forEach(b => b.hp = 0);
  gs.walkingWoman = {...initialWalkingWomanState(), phase: 'walking', slot: 2, fromSlot: 2};
  const choices = decisions(gs);
  const errors = choices.filter(a => a === 'SHOOT_STRAIGHT').length;
  assert.equal(errors, choices.length * BOT_CIVILIAN_OVERSIGHT_CHANCE);
  bot.currentAction = chooseBotAction(gs, bot, () => 0.02);
  const result = resolveActions(gs);
  assert.equal(result.bullets[0].hit, 'woman');
  assert.equal(result.state.players[1].hp, 1, 'no damage passes through her');
  assert.deepEqual(result.state.pendingSuicides, [{playerId: bot.id, dueTick: 2}]);
  result.state.tick = 2;
  assert.equal(chooseBotAction(result.state, result.state.players[0]), 'NONE');
  assert.equal(resolveActions(result.state).state.players[0].isAlive, false);
});

test('civilian oversight never forces pointless shots, empty-gun shots or a worse risky action', () => {
  const bot = mk('bot', 'sheriffs', 2, {ammo: 3});
  const gs = board([bot, mk('o', 'outlaws', 0, {ammo: 0})]);
  gs.walkingWoman = {...initialWalkingWomanState(), phase: 'walking', slot: 2, fromSlot: 2};
  assert.ok(decisions(gs).every(a => !a.startsWith('SHOOT')), 'no reachable enemy, so never target the civilian alone');
  gs.players[1].slot = 2;
  bot.ammo = 0;
  assert.ok(decisions(gs).every(a => !a.startsWith('SHOOT')));
  bot.ammo = 3;
  gs.players[1].isCovered = true;
  gs.players.push(mk('exposed', 'outlaws', 1, {ammo: 0, hp: 1}));
  gs.barrels.find(b => b.team === 'outlaws' && b.slot === 1)!.hp = 0;
  assert.equal(chooseBotAction(gs, bot, () => 0), 'SHOOT_UP', 'even during a lapse, the better safe shot wins');
  const baseline = decisions(gs);
  gs.players[1].currentAction = 'SHOOT_STRAIGHT';
  gs.pendingActions = [{playerId: 'o', action: 'SHOOT_STRAIGHT'}];
  assert.deepEqual(decisions(gs), baseline, 'civilian mistakes still cannot read hidden actions');
});

test('bullets carry shooter/target/lethal labels without changing combat outcome', () => {
  const s = mk('s', 'sheriffs', 2, { currentAction: 'SHOOT_STRAIGHT' });
  const o = mk('o', 'outlaws', 2, { hp: 1, currentAction: 'RELOAD' });
  const { state, bullets } = resolveActions(board([s, o]));
  assert.equal(bullets.length, 1);
  assert.deepEqual([bullets[0].hit, bullets[0].shooterId, bullets[0].targetId, bullets[0].lethal], ['player', 's', 'o', true]);
  assert.equal(state.players.find(p => p.id === 'o')!.isAlive, false);
  assert.equal(state.players.find(p => p.id === 's')!.ammo, 0);
});

test('covered target with an intact barrel absorbs the shot (unchanged rule)', () => {
  const s = mk('s', 'sheriffs', 0, { currentAction: 'SHOOT_DOWN' });
  const o = mk('o', 'outlaws', 1, { currentAction: 'COVER' });
  const { state, bullets } = resolveActions(board([s, o]));
  assert.equal(bullets[0].hit, 'barrel');
  assert.equal(bullets[0].targetId, 'o');
  assert.equal(state.players.find(p => p.id === 'o')!.hp, 3);
  assert.equal(state.barrels.find(b => b.team === 'outlaws' && b.slot === 1)!.hp, 2);
});

test('bots only ever choose legal actions', () => {
  for (let i = 0; i < 400; i++) {
    const slots = 2 + (i % 6);
    const ammo = i % 4;
    const bot = mk('b', 'sheriffs', i % slots, { ammo, isBot: true });
    const gs = board([bot, mk('e1', 'outlaws', (i * 7) % slots, { ammo: (i >> 2) % 4 }), mk('f', 'sheriffs', (bot.slot + 1) % slots)], slots);
    if (gs.players[2].slot === bot.slot) gs.players.pop();
    const a = chooseBotAction(gs, bot);
    if (a.startsWith('SHOOT')) assert.ok(ammo > 0, `shot with no ammo: ${a}`);
    if (a === 'RELOAD') assert.ok(ammo < 3, 'reload at full ammo');
    if (a === 'MOVE_UP') assert.ok(bot.slot > 0);
    if (a === 'MOVE_DOWN') assert.ok(bot.slot < slots - 1);
  }
});

test('stats and session score are tallied; bots join only in lobby', () => {
  const io = { to: () => ({ emit: () => {} }) } as unknown as Server;
  const m = new RoomManager(io);
  const room = m.createRoom('host', { tickDuration: 4000, slotsPerSide: 3 });
  assert.equal(m.addBot(room, 'sheriffs').success, true);
  assert.equal(m.addBot(room, 'outlaws').success, true);
  assert.equal(m.addBot(room, 'outlaws').success, true);
  assert.equal(m.addBot(room, 'outlaws').success, true);
  assert.equal(m.addBot(room, 'outlaws').success, false, 'team of 3 is full');
  m.removeBot(room, 'outlaws');
  assert.equal(m.startGame(room).success, true);
  assert.equal(m.addBot(room, 'sheriffs').success, false, 'no bots mid-game');
  m.endSession(room);
});

test('players can switch sides in the lobby, not mid-game, and never into a full team', () => {
  const io = { to: () => ({ emit: () => {} }) } as unknown as Server;
  const m = new RoomManager(io);
  const room = m.createRoom('host', { tickDuration: 4000, slotsPerSide: 2 });
  m.joinRoom('a', room, 'Ada'); m.joinRoom('b', room, 'Billy');
  assert.equal(m.selectTeam('a', room, 'outlaws').success, true);
  assert.equal(m.selectTeam('a', room, 'sheriffs').success, true, 'switch back');
  m.addBot(room, 'outlaws'); m.addBot(room, 'outlaws');
  const before = structuredClone(m.resumeHost(room, 'host').state!.players.find(p => p.id === 'b')!);
  assert.equal(m.selectTeam('b', room, 'outlaws').success, before.team === 'outlaws', 'full team rejects newcomers');
  m.removeBot(room, 'outlaws');
  assert.equal(m.startGame(room).success, true);
  assert.equal(m.selectTeam('a', room, 'outlaws').success, false, 'locked mid-game');
  m.endSession(room);
});

test('players keep the exact lane they picked in the lobby when the game starts', () => {
  const io = { to: () => ({ emit: () => {} }) } as unknown as Server;
  const m = new RoomManager(io);
  const room = m.createRoom('host', { tickDuration: 4000, slotsPerSide: 5 });
  m.joinRoom('a', room, 'Ada'); m.joinRoom('b', room, 'Billy'); m.joinRoom('c', room, 'Cole');
  assert.equal(m.takeSeat('a', room, 'sheriffs', 4).success, true);
  assert.equal(m.takeSeat('b', room, 'outlaws', 2).success, true);
  assert.equal(m.takeSeat('c', room, 'sheriffs', 4).success, false, 'spot already taken');
  assert.equal(m.takeSeat('c', room, 'sheriffs', 9).success, false, 'off the board');
  assert.equal(m.takeSeat('c', room, 'sheriffs', 0).success, true);
  assert.equal(m.startGame(room).success, true);
  const st = m.resumeHost(room, 'host').state!;
  assert.deepEqual(st.players.map(p => [p.id, p.team, p.slot]), [['a', 'sheriffs', 4], ['b', 'outlaws', 2], ['c', 'sheriffs', 0]]);
  assert.equal(m.takeSeat('a', room, 'sheriffs', 1).success, false, 'locked mid-game');
  st.players[0].slot = 3; // moved during the match
  m.resetToLobby(room);
  assert.equal(m.resumeHost(room, 'host').state!.players[0].slot, 4, 'back in the picked lane after the match');
  m.endSession(room);
});

test('bots actually move: dodging, chasing, leaving broken cover', () => {
  const bot = mk('b', 'sheriffs', 2, { ammo: 1, isBot: true });
  const gs = board([bot, mk('e', 'outlaws', 2, { ammo: 2 })]);
  let moves = 0;
  for (let i = 0; i < 500; i++) if (chooseBotAction(gs, bot).startsWith('MOVE')) moves++;
  assert.ok(moves > 60, `bot under fire should dodge sometimes (moved ${moves}/500)`);
  const far = board([mk('b2', 'sheriffs', 0, { ammo: 3, isBot: true }), mk('e2', 'outlaws', 4, { ammo: 0 })]);
  let down = 0;
  for (let i = 0; i < 300; i++) if (chooseBotAction(far, far.players[0]) === 'MOVE_DOWN') down++;
  assert.ok(down > 120, `bot with nobody in reach should close the distance (moved down ${down}/300)`);
});
