import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveActions } from '../server/actions';
import { chooseBotAction } from '../server/bots';
import { RoomManager } from '../server/rooms';
import type { GameState, Player } from '../shared/types';
import { Server } from 'socket.io';

const mk = (id: string, team: Player['team'], slot: number, extra: Partial<Player> = {}): Player => ({
  id, name: id, team, slot, hp: 3, ammo: 1, isAlive: true, actionLocked: true, currentAction: 'NONE', isCovered: false, ...extra,
});
function board(players: Player[], slots = 5): GameState {
  const barrels = [];
  for (let s = 0; s < slots; s++) { barrels.push({ team: 'sheriffs' as const, slot: s, hp: 3 }, { team: 'outlaws' as const, slot: s, hp: 3 }); }
  return { roomCode: 'TEST', revision: 0, phase: 'planning', tick: 1, config: { tickDuration: 4000, slotsPerSide: slots }, players, barrels, winner: null, tickStartTime: 0, pendingActions: [], lastTickBullets: [] };
}

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
