import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/rooms';
import { estimateOffset, newerState, presentState, VOLLEY } from '../src/lib/presentation';
import type { GameState } from '../shared/types';
import { Server } from 'socket.io';

function setup() {
  const states: GameState[] = [];
  const io = { to: () => ({ emit: (event: string, data: GameState) => { if (event === 'gameState') states.push(structuredClone(data)); } }) } as unknown as Server;
  const manager = new RoomManager(io);
  const room = manager.createRoom('host', { tickDuration: 4000, slotsPerSide: 5 });
  manager.joinRoom('a', room, 'Ada'); manager.joinRoom('b', room, 'Billy');
  manager.selectTeam('a', room, 'sheriffs'); manager.selectTeam('b', room, 'outlaws');
  manager.startGame(room);
  return { manager, room, states };
}
test('clock estimate removes clock skew without adding the full network round trip', () => {
  assert.equal(estimateOffset(1000, 1100, 8050), 7000);
});
test('duplicate action acknowledgements preserve the first choice; expired rounds cannot lock the next round', () => {
  const { manager, room, states } = setup();
  try {
    const tick = states.at(-1)!.tick;
    assert.equal(manager.submitAction('a', room, 'RELOAD', tick, states.at(-1)!.tickStartTime!).accepted, true);
    assert.equal(manager.submitAction('a', room, 'COVER', tick, states.at(-1)!.tickStartTime!).action, 'RELOAD');
    assert.equal(manager.submitAction('b', room, 'COVER', tick-1, states.at(-1)!.tickStartTime!).accepted, false);
    assert.equal(manager.submitAction('b', room, 'COVER', tick, 1).accepted, false);
    manager.broadcastState(room);
    assert.equal(states.at(-1)!.players.find(p => p.id === 'b')!.actionLocked, false);
  } finally { manager.endSession(room); }
});
test('rejoining keeps player identity, position and confirmed choice', () => {
  const { manager, room, states } = setup();
  try {
    manager.submitAction('a', room, 'COVER', states.at(-1)!.tick, states.at(-1)!.tickStartTime!);
    manager.handleDisconnect('a');
    assert.equal(manager.joinRoom('a', room, 'Ada').success, true);
    manager.broadcastState(room);
    const state = states.at(-1)!;
    assert.equal(state.players.length, 2);
    // Broadcasts hide the choice during planning; the ack still returns it to its owner.
    assert.equal(state.players.find(p=>p.id==='a')!.actionLocked, true);
    assert.equal(state.players.find(p=>p.id==='a')!.currentAction, 'NONE');
    assert.equal(manager.submitAction('a', room, 'RELOAD', state.tick, state.tickStartTime!).action, 'COVER');
  } finally { manager.endSession(room); }
});
test('strong-wind warning survives broadcast, disconnect and reconnect', () => {
  const { manager, room, states } = setup();
  try {
    const authoritative = manager.resumeHost(room, 'host').state!;
    authoritative.strongWind = {
      phase: 'warning', direction: 'down', activeRoundsRemaining: 0, cooldownRoundsRemaining: 0,
    };
    manager.broadcastState(room);
    assert.deepEqual(states.at(-1)!.strongWind, authoritative.strongWind);

    manager.handleDisconnect('a');
    assert.equal(manager.joinRoom('a', room, 'Ada').success, true);
    manager.broadcastState(room);
    assert.deepEqual(states.at(-1)!.strongWind, {
      phase: 'warning', direction: 'down', activeRoundsRemaining: 0, cooldownRoundsRemaining: 0,
    });
  } finally { manager.endSession(room); }
});
test('damage and ammo reveal on the shared timeline without changing the authoritative result', () => {
  const { manager, room, states } = setup();
  try {
    const before = states.at(-1)!;
    const resolved: GameState = { ...structuredClone(before), phase:'resolution', resolutionStartedAt:1000, resolutionFrom:{ players:before.players, barrels:before.barrels } };
    resolved.players[0].hp=0; resolved.players[0].isAlive=false; resolved.players[0].ammo=0; resolved.barrels[0].hp=2;
    assert.equal(presentState(resolved,1000).players[0].ammo,1);
    assert.equal(presentState(resolved,1000+VOLLEY.move).players[0].ammo,0);
    assert.equal(presentState(resolved,1000+VOLLEY.impact-1).players[0].hp,3);
    assert.equal(presentState(resolved,1000+VOLLEY.impact).players[0].hp,0);
    assert.equal(presentState(resolved,1000+VOLLEY.impact).barrels[0].hp,2);
    assert.equal(resolved.players[0].hp,0);
  } finally { manager.endSession(room); }
});
test('a delayed resolution cannot overwrite a newer planning phase or a restarted match', () => {
  const { manager, room, states } = setup();
  try {
    const state = states.at(-1)!;
    const latest = { ...state, revision:20, tick:1 };
    assert.equal(newerState(latest, { ...state, revision:19, tick:8, phase:'resolution' }),latest);
    assert.equal(newerState(latest, { ...state, revision:21 }).revision,21);
  } finally { manager.endSession(room); }
});
