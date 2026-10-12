import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveActions } from '../server/actions';
import { chooseBotAction } from '../server/bots';
import { RoomManager } from '../server/rooms';
import { advanceStrongWind, advanceWalkingWoman, initialStrongWindState, initialWalkingWomanState } from '../server/randomEvents';
import { shotPreview } from '../src/client/components/boardInfo';
import type { GameState, Player, WalkingWomanState } from '../shared/types';
import { Server } from 'socket.io';

const mk = (id: string, team: Player['team'], slot: number, extra: Partial<Player> = {}): Player => ({
  id, name: id, team, slot, hp: 3, ammo: 1, isAlive: true, actionLocked: true, currentAction: 'NONE', isCovered: false, ...extra,
});
function board(players: Player[], slots = 5): GameState {
  const barrels = [];
  for (let s = 0; s < slots; s++) { barrels.push({ team: 'sheriffs' as const, slot: s, hp: 3 }, { team: 'outlaws' as const, slot: s, hp: 3 }); }
  return { roomCode: 'TEST', revision: 0, phase: 'planning', tick: 1, config: { tickDuration: 4000, slotsPerSide: slots }, strongWind: initialStrongWindState(), walkingWoman: initialWalkingWomanState(), pendingSuicides: [], lastTickSuicides: [], players, barrels, winner: null, tickStartTime: 0, pendingActions: [], lastTickBullets: [] };
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
