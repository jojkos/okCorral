import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'socket.io';
import type { GameConfig, GameState, RandomEventSettings } from '../shared/types';
import { eventSettings } from '../shared/eventSettings';
import { GameConfigPatchSchema, GameConfigSchema } from '../shared/validation';
import { RoomManager } from '../server/rooms';
import { advanceRoundEvents } from '../server/roundEvents';
import { initialGatlingManState, initialStrongWindState, initialWalkingWomanState } from '../server/randomEvents';
import { initialRainState } from '../server/rain';

const allOff: RandomEventSettings = { strongWind: false, walkingWoman: false, gatlingMan: false, rain: false };
function setup(config: GameConfig = { tickDuration: 4000, slotsPerSide: 5 }) {
  const broadcasts: GameState[] = [];
  const io = { to: () => ({ emit: (event: string, state: GameState) => { if (event === 'gameState') broadcasts.push(structuredClone(state)); } }) } as unknown as Server;
  const manager = new RoomManager(io), room = manager.createRoom('host', config);
  manager.joinRoom('a', room, 'Ada'); manager.joinRoom('b', room, 'Billy');
  manager.selectTeam('a', room, 'sheriffs'); manager.selectTeam('b', room, 'outlaws');
  return { manager, room, broadcasts, state: manager.resumeHost(room, 'host').state! };
}

test('legacy configs default all events on; explicit false flags survive creation without sharing mutable defaults', () => {
  const a = setup(), b = setup({ tickDuration: 4000, slotsPerSide: 5, events: { rain: false } });
  try {
    assert.deepEqual(a.state.config.events, { strongWind: true, walkingWoman: true, gatlingMan: true, rain: true });
    assert.equal(b.state.config.events!.rain, false); assert.equal(b.state.config.events!.strongWind, true);
    a.manager.updateConfig(a.room, 'host', { events: { strongWind: false } });
    assert.equal(b.state.config.events!.strongWind, true);
    assert.deepEqual(eventSettings(GameConfigSchema.parse({})), { strongWind: true, walkingWoman: true, gatlingMan: true, rain: true });
  } finally { a.manager.endSession(a.room); b.manager.endSession(b.room); }
});

test('only the host in the lobby can patch switches, and each patch preserves unrelated settings', () => {
  const { manager, room, state } = setup();
  try {
    manager.updateConfig(room, 'a', { events: allOff }); assert.equal(state.config.events!.rain, true);
    manager.updateConfig(room, 'host', { events: { rain: false } });
    manager.updateConfig(room, 'host', { events: { walkingWoman: false } });
    manager.updateConfig(room, 'host', { tickDuration: 2500 });
    assert.deepEqual(state.config.events, { strongWind: true, walkingWoman: false, gatlingMan: true, rain: false });
    manager.updateConfig(room, 'host', { events: { rain: true } });
    assert.equal(state.config.events!.walkingWoman, false); assert.equal(state.config.tickDuration, 2500);
    const config = structuredClone(state.config);
    manager.startGame(room); manager.updateConfig(room, 'host', { events: allOff });
    assert.deepEqual(manager.resumeHost(room, 'host').state!.config, config);
    for (const phase of ['resolution', 'ended'] as const) {
      manager.resumeHost(room, 'host').state!.phase = phase;
      manager.updateConfig(room, 'host', { events: allOff });
      assert.deepEqual(manager.resumeHost(room, 'host').state!.config, config);
    }
  } finally { manager.endSession(room); }
});

test('malformed switch values and unknown event names are rejected atomically', () => {
  for (const value of ['false', 0, null, [], { unknown: true }]) {
    assert.equal(GameConfigPatchSchema.safeParse({ events: { rain: value } }).success, false);
  }
  assert.equal(GameConfigPatchSchema.safeParse({ events: { aliens: true } }).success, false);
  assert.equal(GameConfigPatchSchema.safeParse(null).success, false);
  const { manager, room, state } = setup();
  try {
    const before = structuredClone(state.config);
    manager.updateConfig(room, 'host', { tickDuration: 2000, events: { rain: 'false' } } as unknown as Partial<GameConfig>);
    assert.deepEqual(state.config, before);
    manager.updateConfig(room, 'host', { events: {} }); assert.deepEqual(state.config, before);
  } finally { manager.endSession(room); }
});

test('all-off skips event random rolls, warning actors and ammo loss, even with a stale active event', () => {
  const { manager, room, state } = setup({ tickDuration: 4000, slotsPerSide: 5, events: allOff });
  try {
    state.rain.phase = 'active'; state.rain.swallows = [{ id: 'old', seed: 1, bornAt: 0 }];
    state.strongWind = { phase: 'active', direction: 'up', activeRoundsRemaining: 2, cooldownRoundsRemaining: 0 };
    state.walkingWoman = { ...initialWalkingWomanState(), phase: 'walking', slot: 0, fromSlot: -1, direction: 'down' };
    state.gatlingMan = { phase: 'warning', cooldownRoundsRemaining: 0, targets: [{ team: 'sheriffs', slot: 0 }] };
    for (let tick = 1; tick <= 80; tick++) {
      state.tick = tick;
      advanceRoundEvents(state, tick * 4000, () => { throw Error('disabled events must not roll'); });
      assert.deepEqual(state.strongWind, initialStrongWindState());
      assert.deepEqual(state.walkingWoman, initialWalkingWomanState());
      assert.deepEqual(state.gatlingMan, initialGatlingManState());
      assert.deepEqual(state.rain, initialRainState());
    }
    assert.deepEqual(state.players.map(p => p.ammo), [1, 1]);
  } finally { manager.endSession(room); }
});

test('each enabled event still activates independently while the other three stay completely disabled', () => {
  for (const key of Object.keys(allOff) as (keyof RandomEventSettings)[]) {
    const { manager, room, state } = setup({ tickDuration: 4000, slotsPerSide: 5, events: { ...allOff, [key]: true } });
    try {
      let active = false;
      for (let tick = 1; tick <= 40; tick++) {
        state.tick = tick; advanceRoundEvents(state, tick * 4000, () => 0);
        active ||= state[key].phase === (key === 'walkingWoman' ? 'walking' : 'active');
        if (key !== 'strongWind') assert.deepEqual(state.strongWind, initialStrongWindState());
        if (key !== 'walkingWoman') assert.deepEqual(state.walkingWoman, initialWalkingWomanState());
        if (key !== 'gatlingMan') assert.deepEqual(state.gatlingMan, initialGatlingManState());
        if (key !== 'rain') assert.deepEqual(state.rain, initialRainState());
      }
      assert.ok(active, key);
      assert.deepEqual(state.players.map(p => p.ammo), key === 'rain' ? [0, 0] : [1, 1]);
    } finally { manager.endSession(room); }
  }
});

test('host reconnect and returning to the lobby preserve switches for the next match', () => {
  const { manager, room, state, broadcasts } = setup();
  try {
    manager.updateConfig(room, 'host', { events: { strongWind: false, gatlingMan: false } });
    const settings = structuredClone(state.config.events);
    manager.handleDisconnect('host'); manager.resumeHost(room, 'host'); manager.broadcastState(room);
    assert.deepEqual(broadcasts.at(-1)!.config.events, settings);
    manager.startGame(room); manager.resetToLobby(room);
    assert.deepEqual(manager.resumeHost(room, 'host').state!.config.events, settings);
    manager.startGame(room); assert.deepEqual(manager.resumeHost(room, 'host').state!.config.events, settings);
  } finally { manager.endSession(room); }
});
