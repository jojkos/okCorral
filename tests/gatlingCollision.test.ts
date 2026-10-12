import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameState, WalkingWomanState } from '../shared/types';
import { bulletLaneFeet, slotLayout } from '../shared/arenaGeometry';
import { gatlingContact, gatlingPosition } from '../shared/gatlingGeometry';
import { initialStrongWindState, advanceWalkingWoman, runOverWomanWithGatling } from '../server/randomEvents';
import { resolveActions } from '../server/actions';
import { presentState, VOLLEY } from '../src/lib/presentation';
import { gatlingWomanFrame } from '../src/host/arena/gatling';
import { initialRainState } from '../server/rain';

const cart = { phase: 'active' as const, targets: [], cooldownRoundsRemaining: 0 };
function civilian(slot = 0, fromSlot = slot, phase: 'walking' | 'dead' = 'walking'): WalkingWomanState {
  return { phase, slot, fromSlot, direction: slot < fromSlot ? 'up' : 'down',
    cooldownRoundsRemaining: 0, bloodTrail: phase === 'dead' ? [fromSlot, ...(slot !== fromSlot ? [slot] : [])] : [], killedFromTeam: null };
}
function game(woman: WalkingWomanState, shoot = false): GameState {
  return { roomCode:'HITS',revision:0,phase:'planning',tick:11,config:{tickDuration:4000,slotsPerSide:5},tickStartTime:10000,
    gatlingMan:cart,strongWind:initialStrongWindState(),rain:initialRainState(),walkingWoman:woman,pendingSuicides:[],lastTickSuicides:[],
    players: ['sheriffs','outlaws'].map((team,i) => ({id:String(i),name:team,team,slot:woman.slot ?? 0,hp:3,ammo:1,isAlive:true,
      actionLocked:true,currentAction:shoot && i===0?'SHOOT_STRAIGHT':'NONE',isCovered:false})),
    barrels:[],pendingActions:[],lastTickBullets:[],winner:null } as GameState;
}

test('arrival kills a living civilian in either walking direction at the swept contact position', () => {
  const L = slotLayout(5);
  for (const before of [civilian(1,0), civilian(0,1), civilian(0), civilian(0,-1)]) {
    const after = runOverWomanWithGatling(before, cart, 5, 'arrival');
    const hit = after.gatlingCrush!;
    assert.ok(hit, 'path really crosses the carriage');
    assert.equal(after.phase, 'dead'); assert.equal(after.crushedByGatling, true);
    assert.equal(hit.before.phase, 'walking'); assert.equal(after.killedFromTeam, null);
    const womanY = bulletLaneFeet(L, before.fromSlot! + (before.slot! - before.fromSlot!) * hit.at);
    assert.ok(Math.abs(womanY - gatlingPosition(hit.at).contactY) < 0.0001);
    assert.ok(Math.abs(after.fromSlot! - (womanY-L.feet[0])/L.slotHeight) < 0.0001);
  }
});

test('a living civilian below the stopped cart survives the volley, then dies on departure without player guilt', () => {
  const alive = civilian(3,2);
  assert.equal(runOverWomanWithGatling(alive, cart, 5, 'arrival'), alive);
  const {state, bullets} = resolveActions(game(alive));
  assert.equal(state.walkingWoman.phase, 'dead');
  assert.equal(state.walkingWoman.gatlingCrush?.leg, 'departure');
  assert.equal(state.walkingWoman.gatlingCrush?.before.phase, 'walking');
  assert.deepEqual(state.pendingSuicides, []);
  assert.equal(bullets.filter(b=>b.hit==='woman').length, 0);
  assert.equal(state.walkingWoman.killedFromTeam, null);
});

test('the carriage crosses every visible lane at all supported arena sizes', () => {
  for (let slots=2;slots<=8;slots++) for (let slot=0;slot<slots;slot++) {
    const L=slotLayout(slots), woman=runOverWomanWithGatling(civilian(slot),cart,slots);
    const hit=woman.gatlingCrush!;
    assert.ok(hit, `lane ${slot} of ${slots} must be on the carriage path`);
    const progress=hit.leg==='arrival'?hit.at:1, elapsed=hit.leg==='departure'?hit.at:-1;
    assert.ok(Math.abs(gatlingPosition(progress,elapsed).contactY-bulletLaneFeet(L,slot))<0.0001);
    const frame=gatlingWomanFrame(L,woman,cart,progress,elapsed,false);
    assert.equal(frame.woman.phase,'dead');
    assert.equal(frame.crush?.fall,1, 'reduced motion still reveals the corpse');
  }
});

test('only actual player shots incur guilt: no interception after an arrival crush, normal guilt before departure', () => {
  const before = civilian(0);
  const crushed = runOverWomanWithGatling(before, cart, 5, 'arrival');
  const arrival = game(crushed, true); arrival.players.forEach(p=>p.slot=0);
  const a = resolveActions(arrival);
  assert.ok(a.bullets.some(b=>b.hit==='player'));
  assert.deepEqual(a.state.pendingSuicides, []);
  const d = resolveActions(game(civilian(3), true));
  assert.ok(d.bullets.some(b=>b.hit==='woman'));
  assert.deepEqual(d.state.pendingSuicides, [{playerId:'0',dueTick:12}]);
  assert.equal(d.state.walkingWoman.gatlingCrush?.before.phase, 'dead');
  assert.equal(d.state.walkingWoman.killedFromTeam, 'sheriffs');
});

test('warning, offscreen survivors, absent civilians and already crushed bodies are never killed again', () => {
  const alive = civilian(4,3);
  assert.equal(runOverWomanWithGatling(alive, {...cart,phase:'warning'},5), alive);
  const exited = civilian(5,4);
  assert.equal(runOverWomanWithGatling(exited,cart,5), exited);
  const behind = civilian(-1,0);
  assert.equal(gatlingContact(slotLayout(5),behind,'departure'), null);
  for (const phase of ['waiting','inactive','gone'] as const) {
    const absent = {...alive,phase,slot:null,fromSlot:null};
    assert.equal(runOverWomanWithGatling(absent,cart,5), absent);
  }
  const crushed = runOverWomanWithGatling(civilian(0),cart,5);
  assert.equal(runOverWomanWithGatling(crushed,cart,5), crushed);
});

test('a wind-dragged corpse does not teleport to its pending lane before being hit', () => {
  const L = slotLayout(5), before = civilian(1,0,'dead');
  const corpse = runOverWomanWithGatling(before,cart,5,'arrival');
  const hit = corpse.gatlingCrush!;
  assert.ok(hit.slot > 0 && hit.slot < 1);
  assert.deepEqual(corpse.bloodTrail, [0, hit.slot, hit.slot+1], 'no blood at an unvisited wind destination');
  const p = hit.at-0.0001;
  const frame = gatlingWomanFrame(L,corpse,cart,p,-1,true);
  const y = bulletLaneFeet(L,frame.woman.fromSlot!) + (frame.woman.slot!-frame.woman.fromSlot!)*L.slotHeight*frame.progress;
  assert.ok(Math.abs(y-bulletLaneFeet(L,p)) < 0.00001);
  assert.equal(frame.woman.crushedByGatling, false);
});

test('host and phone reveal both arrival and departure deaths at contact, including after reconnect', () => {
  for (const leg of ['arrival','departure'] as const) for (const duration of [1000,4000,10000]) {
    const before = civilian(leg==='arrival'?0:3);
    const woman = runOverWomanWithGatling(before,cart,5,leg), hit = woman.gatlingCrush!;
    const state = game(woman); state.config.tickDuration=duration;
    let when = 10000 + hit.at*duration;
    if (leg==='departure') {
      state.phase='resolution'; state.resolutionStartedAt=10000+duration;
      state.resolutionFrom={players:structuredClone(state.players),barrels:[],walkingWoman:before};
      when=state.resolutionStartedAt+hit.at;
      assert.equal(presentState(state,state.resolutionStartedAt+VOLLEY.impact+1).walkingWoman.phase,'walking');
    }
    assert.equal(presentState(state,when-1).walkingWoman.phase,'walking');
    assert.equal(presentState(state,when+1).walkingWoman.phase,'dead');
    const resumed = JSON.parse(JSON.stringify(state));
    assert.deepEqual(presentState(resumed,when+100).walkingWoman,presentState(state,when+100).walkingWoman);
    const frame = gatlingWomanFrame(slotLayout(5),woman,cart,leg==='arrival'?hit.at:1,leg==='arrival'?-1:hit.at,true,duration);
    assert.ok(frame.crush!.fall < 0.00001 && frame.crush!.compression < 0.00001, 'no instant pose/size swap');
  }
});

test('the fallen body settles, remains dead and slides away instead of returning alive', () => {
  let woman = runOverWomanWithGatling(civilian(0),cart,5,'arrival');
  const frame = gatlingWomanFrame(slotLayout(5),woman,cart,1,2500,true);
  assert.equal(frame.crush?.fall,1); assert.equal(frame.crush?.compression,1);
  assert.equal(frame.crush?.dust,0); assert.equal(frame.crush?.bump,0);
  for (let round=12;round<40;round++) {
    woman=advanceWalkingWoman(woman,round,5,initialStrongWindState(),()=>{throw Error('dead civilian must never roll for return');});
    assert.ok(woman.phase==='dead'||woman.phase==='gone');
    assert.equal(woman.gatlingCrush,undefined);
  }
  assert.equal(woman.phase,'gone');
});
