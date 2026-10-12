import type { ActionType, GameState, Player } from "../shared/types.js";
import { SHOT_ACTIONS, shotPath, windOffset } from '../shared/shooting.js';
import { shotCivilianHit } from '../shared/ballistics.js';

export const BOT_NAMES = [
  "Dusty", "Slim", "Hank", "Lefty", "Rusty", "Buck", "Cactus Jo", "Rattler",
  "Mad Dog", "Whiskey", "Two-Gun", "Doc Bot", "Sundance", "Calamity",
];

// A small human-like lapse, not deliberate targeting of civilians. Only shots
// toward a living opponent can benefit from overlooking the interception.
export const BOT_CIVILIAN_OVERSIGHT_CHANCE = 0.1;

// Evaluate public board information, not locked actions or the gatling's
// pre-rolled targets. Usually cautious, with an occasional civilian oversight.
export function chooseBotAction(state: GameState, bot: Player, random: () => number = Math.random): ActionType {
  if (!bot.isAlive || bot.slot < 0 || state.pendingSuicides.some(p => p.playerId === bot.id && p.dueTick <= state.tick)) return 'NONE';
  const slots = state.config.slotsPerSide;
  const enemies = state.players.filter((p) => p.team !== bot.team && p.isAlive && p.slot >= 0);
  const friends = state.players.filter((p) => p.team === bot.team && p.isAlive && p.slot >= 0 && p.id !== bot.id);
  const barrelHp = (team: string, slot: number) => state.barrels.find((b) => b.team === team && b.slot === slot)?.hp ?? 0;
  const reaches = (from: Player, to: number) => SHOT_ACTIONS.some(a => {
    const path = shotPath(from.slot, a, state.strongWind, slots)!;
    return path.targetSlot === to && shotCivilianHit(slots, from.team, from.slot, path, state.walkingWoman) === null;
  });
  const gatlingPressure = state.gatlingMan.phase === 'active' ? 8 / (2 * slots) : 0;

  // Opponents can shoot only once, and may have several plausible targets.
  // A moving bot is harder to predict, but is exposed (its barrel won't block).
  const incomingAt = (lane: number, moving = false) => {
    let incoming = gatlingPressure;
    for (const enemy of enemies) {
      if (!enemy.ammo || !reaches(enemy, lane)) continue;
      const alternatives = friends.filter(f => reaches(enemy, f.slot)).length;
      incoming += (moving ? 0.32 : 0.72) / (1 + alternatives * 0.65);
    }
    return incoming;
  };
  const survivalCost = 3 + 5 / bot.hp + (bot.hp === 1 ? 12 : 0);
  const pressure = incomingAt(bot.slot);
  const coverHp = barrelHp(bot.team, bot.slot);
  const options: { action: ActionType; score: number }[] = [];
  const riskyShots: typeof options = [];
  const add = (action: ActionType, score: number) => options.push({ action, score });

  if (bot.ammo > 0) {
    for (const action of SHOT_ACTIONS) {
      const path = shotPath(bot.slot, action, state.strongWind, slots)!;
      if (path.offBoard) continue;
      const target = enemies.find(e => e.slot === path.targetSlot);
      if (!target) continue;
      const crossesCivilian = shotCivilianHit(slots, bot.team, bot.slot, path, state.walkingWoman) !== null;
      const hp = barrelHp(target.team, target.slot);
      // Cover from the previous round is evidence, not knowledge of this turn.
      const coverChance = hp <= 0 ? 0 : target.isCovered ? 0.62 : target.hp === 1 && target.ammo > 0 ? 0.42 : 0.22;
      const damageValue = 5 + (target.hp === 1 ? 3 : 0) + (target.ammo === 0 ? 0.7 : 0);
      const breakingCover = hp === 1 ? 2.8 : 1.3;
      const ammoCost = bot.ammo === 1 ? 0.9 : 0.4;
      const score = damageValue * (1 - coverChance) + breakingCover * coverChance - ammoCost - pressure * survivalCost;
      if (crossesCivilian) riskyShots.push({ action, score: score - 0.9 });
      else add(action, score);
    }
  }

  if (bot.ammo < 3) {
    const value = bot.ammo === 0 ? 4.2 : bot.ammo === 1 ? 1.9 : 0.9;
    add('RELOAD', value - pressure * survivalCost);
  }
  if (coverHp > 0 && pressure > 0) {
    // Expected overflow of a Poisson volley accounts for a weakened barrel:
    // one plank is much less useful against several loaded enemies.
    let probability = Math.exp(-pressure);
    let absorbed = 0;
    let cumulative = probability;
    for (let n = 1; n <= coverHp; n++) {
      absorbed += 1 - cumulative;
      probability *= pressure / n;
      cumulative += probability;
    }
    const overflow = Math.max(0, pressure - absorbed);
    add('COVER', 0.5 - overflow * survivalCost - absorbed * 0.18);
  }

  const rangeGap = (lane: number) => enemies.length
    ? Math.min(...enemies.map(e => Math.max(0, Math.abs(e.slot - lane - windOffset(state.strongWind)) - 1)))
    : 0;
  const moves: [ActionType, number][] = [['MOVE_UP', bot.slot - 1], ['MOVE_DOWN', bot.slot + 1]];
  for (const [action, lane] of moves) {
    if (lane < 0 || lane >= slots || friends.some(f => f.slot === lane)) continue;
    const danger = incomingAt(lane, true);
    const rangeGain = (rangeGap(bot.slot) - rangeGap(lane)) * (bot.ammo ? 2.5 : 0.8);
    const futureCover = coverHp <= 0 && barrelHp(bot.team, lane) > 0 ? 0.8 : 0;
    const dodge = pressure > gatlingPressure ? 1.15 : 0;
    add(action, 0.6 + rangeGain + futureCover + dodge - danger * survivalCost);
  }

  if (!options.length && !riskyShots.length) return 'NONE';
  let choice = random();
  if (riskyShots.length) {
    const oversight = choice < BOT_CIVILIAN_OVERSIGHT_CHANCE;
    // Reuse a uniform subinterval for the normal weighted decision. The lapse
    // only admits risky shots; it never forces one over a better safe action.
    choice = oversight ? choice / BOT_CIVILIAN_OVERSIGHT_CHANCE
      : (choice - BOT_CIVILIAN_OVERSIGHT_CHANCE) / (1 - BOT_CIVILIAN_OVERSIGHT_CHANCE);
    if (oversight) options.push(...riskyShots);
  }
  if (!options.length) return 'NONE';
  const best = Math.max(...options.map(o => o.score));
  const candidates = options.filter(o => o.score >= best - 2.25);
  const weights = candidates.map(o => Math.exp((o.score - best) / 0.8));
  let roll = choice * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i].action;
  }
  return candidates[candidates.length - 1].action;
}
