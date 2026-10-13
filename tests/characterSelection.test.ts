import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'socket.io';
import { RoomManager, publicState } from '../server/rooms';
import { SelectAppearanceSchema } from '../shared/validation';
import type { GameState, Team } from '../shared/types';

let fixtureId = 0;
function setup(slotsPerSide = 8) {
  const suffix = ++fixtureId;
  const host = `looks-host-${suffix}`, alice = `looks-alice-${suffix}`, bob = `looks-bob-${suffix}`;
  const broadcasts: GameState[] = [];
  const io = { to: () => ({ emit: (event: string, state: GameState) => {
    if (event === 'gameState') broadcasts.push(structuredClone(state));
  } }) } as unknown as Server;
  const manager = new RoomManager(io);
  const room = manager.createRoom(host, { tickDuration: 4000, slotsPerSide,
    events: { strongWind: false, walkingWoman: false, gatlingMan: false, rain: false } });
  manager.joinRoom(alice, room, 'Alice'); manager.joinRoom(bob, room, 'Bob');
  manager.selectTeam(alice, room, 'sheriffs'); manager.selectTeam(bob, room, 'outlaws');
  const state = manager.resumeHost(room, host).state!;
  return { manager, room, host, alice, bob, state, broadcasts };
}

test('only the eight integer character IDs are accepted without coercion', () => {
  for (let id = 0; id < 8; id++) assert.equal(SelectAppearanceSchema.safeParse(id).success, true);
  for (const value of [-1, 8, 99, 1.5, NaN, Infinity, '0', '7', null, undefined, {}, [], { playerId: 'other', appearance: 2 }]) {
    assert.equal(SelectAppearanceSchema.safeParse(value).success, false, String(value));
  }
});

test('each valid choice is broadcast while gameplay attributes and other players stay unchanged', () => {
  const { manager, room, alice, bob, state, broadcasts } = setup();
  try {
    const other = structuredClone(state.players.find((p) => p.id === bob)!);
    const before = structuredClone(state.players.find((p) => p.id === alice)!);
    for (let appearance = 0; appearance < 8; appearance++) {
      assert.equal(manager.selectAppearance(alice, room, appearance).success, true);
      assert.deepEqual(state.players.find((p) => p.id === alice), { ...before, appearance });
      assert.deepEqual(state.players.find((p) => p.id === bob), other);
      assert.equal(broadcasts.at(-1)!.players.find((p) => p.id === alice)!.appearance, appearance);
    }
    assert.equal(broadcasts.length, 8);
    assert.equal(state.revision, 8);
    assert.equal(publicState({ ...state, phase: 'planning' }).players.find((p) => p.id === alice)!.appearance, 7);
  } finally { manager.endSession(room); }
});

test('malformed selections are rejected atomically by the room manager too', () => {
  const { manager, room, alice, state, broadcasts } = setup();
  try {
    const before = structuredClone(state);
    for (const value of [-1, 8, 1.5, NaN, '3', null, {}, { appearance: 1 }]) {
      assert.equal(manager.selectAppearance(alice, room, value as number).success, false);
      assert.deepEqual(state, before);
    }
    assert.equal(broadcasts.length, 0);
  } finally { manager.endSession(room); }
});

test('only a joined human may choose their own design, not a host, outsider, bot or another room member', () => {
  const a = setup(), b = setup();
  try {
    a.manager.addBot(a.room, 'sheriffs');
    const bot = a.state.players.find((p) => p.isBot)!;
    const before = structuredClone(a.state);
    for (const playerId of [a.host, 'stranger', bot.id, b.alice]) {
      assert.equal(a.manager.selectAppearance(playerId, a.room, 6).success, false);
    }
    assert.equal(a.manager.selectAppearance(a.alice, b.room, 6).success, false);
    assert.equal(a.manager.selectAppearance(a.alice, 'MISSING', 6).success, false);
    assert.deepEqual(a.state, before);
    assert.equal(a.manager.selectAppearance(a.alice, a.room, 6).success, true);
    assert.equal(a.state.players.find((p) => p.id === a.bob)!.appearance, 0);
    assert.equal(b.state.players.find((p) => p.id === b.alice)!.appearance, 0);
  } finally { a.manager.endSession(a.room); b.manager.endSession(b.room); }
});

test('designs are locked in planning, resolution and ended phases', () => {
  const { manager, room, alice, state, broadcasts } = setup();
  try {
    manager.selectAppearance(alice, room, 4);
    for (const phase of ['planning', 'resolution', 'ended'] as const) {
      state.phase = phase;
      assert.equal(manager.selectAppearance(alice, room, 7).success, false);
      assert.equal(state.players.find((p) => p.id === alice)!.appearance, 4);
    }
    assert.equal(broadcasts.length, 1);
  } finally { manager.endSession(room); }
});

test('character choice survives team changes, taking another lane, disconnect and rejoin', () => {
  const { manager, room, alice, state } = setup();
  try {
    manager.selectAppearance(alice, room, 7);
    assert.equal(manager.selectTeam(alice, room, 'outlaws').success, true);
    assert.equal(manager.takeSeat(alice, room, 'sheriffs', 3).success, true);
    manager.leaveTeam(alice, room);
    assert.equal(manager.selectTeam(alice, room, 'outlaws').success, true);
    manager.handleDisconnect(alice);
    const joined = manager.joinRoom(alice, room, 'Alice');
    assert.equal(joined.success, true);
    assert.equal(joined.player!.appearance, 7);
    assert.equal(joined.player!.team, 'outlaws');
    assert.equal(state.players.filter((p) => p.id === alice).length, 1);
    assert.equal(manager.selectAppearance(alice, room, 2).success, true);
  } finally { manager.endSession(room); }
});

test('new players and legacy players without an appearance use design zero', () => {
  const { manager, room, alice, state } = setup();
  try {
    assert.equal(state.players.find((p) => p.id === alice)!.appearance, 0);
    delete state.players.find((p) => p.id === alice)!.appearance;
    manager.handleDisconnect(alice);
    assert.equal(manager.joinRoom(alice, room, 'Alice').player!.appearance, 0);
  } finally { manager.endSession(room); }
});

test('returning to the lobby and starting another match retain human and bot appearances', () => {
  const { manager, room, host, alice, bob } = setup();
  try {
    manager.selectAppearance(alice, room, 6); manager.selectAppearance(bob, room, 3);
    manager.addBot(room, 'sheriffs'); manager.addBot(room, 'outlaws');
    const looks = () => manager.resumeHost(room, host).state!.players.map((p) => [p.id, p.appearance]);
    const before = looks();
    assert.equal(manager.startGame(room).success, true);
    assert.deepEqual(looks(), before);
    manager.handleDisconnect(alice);
    assert.equal(manager.joinRoom(alice, room, 'Alice').player!.appearance, 6);
    manager.resetToLobby(room);
    assert.deepEqual(looks(), before);
    assert.equal(manager.startGame(room).success, true);
    assert.deepEqual(looks(), before);
  } finally { manager.endSession(room); }
});

test('bots fill each team with unused designs first and reuse the freed design when replaced', () => {
  const { manager, room, alice, bob, state } = setup();
  try {
    manager.selectAppearance(alice, room, 3); manager.selectAppearance(bob, room, 5);
    for (const team of ['sheriffs', 'outlaws'] as Team[]) {
      for (let i = 0; i < 7; i++) assert.equal(manager.addBot(room, team).success, true);
      const players = state.players.filter((p) => p.team === team);
      assert.equal(new Set(players.map((p) => p.appearance)).size, 8);
      assert.deepEqual(players.map((p) => p.appearance).sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
      manager.removeBot(room, team);
      assert.equal(manager.addBot(room, team).success, true);
      assert.equal(new Set(state.players.filter((p) => p.team === team).map((p) => p.appearance)).size, 8);
    }
  } finally { manager.endSession(room); }
});
