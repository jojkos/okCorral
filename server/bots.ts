import type { ActionType, GameState, Player } from "../shared/types.js";

export const BOT_NAMES = [
  "Dusty", "Slim", "Hank", "Lefty", "Rusty", "Buck", "Cactus Jo", "Rattler",
  "Mad Dog", "Whiskey", "Two-Gun", "Doc Bot", "Sundance", "Calamity",
];

// A simple, beatable bot. It only reads public board state (positions, ammo,
// barrel HP) — the same information a human sees on the TV — and picks one
// legal action by weighted chance, so it shoots, ducks, reloads *and* moves.
export function chooseBotAction(state: GameState, bot: Player): ActionType {
  const slots = state.config.slotsPerSide;
  const enemies = state.players.filter((p) => p.team !== bot.team && p.isAlive && p.slot >= 0);
  const friends = state.players.filter((p) => p.team === bot.team && p.isAlive && p.slot >= 0 && p.id !== bot.id);
  const barrelHp = (team: string, slot: number) => state.barrels.find((b) => b.team === team && b.slot === slot)?.hp ?? 0;
  const threatsAt = (lane: number) => enemies.filter((e) => e.ammo > 0 && Math.abs(e.slot - lane) <= 1).length;
  const myBarrel = barrelHp(bot.team, bot.slot) > 0;
  const threats = threatsAt(bot.slot);

  const options: { action: ActionType; w: number }[] = [];
  const add = (action: ActionType, w: number) => { if (w > 0) options.push({ action, w }); };

  // Shooting at someone in reach.
  if (bot.ammo > 0) {
    const shots: [ActionType, number][] = [["SHOOT_STRAIGHT", bot.slot], ["SHOOT_UP", bot.slot - 1], ["SHOOT_DOWN", bot.slot + 1]];
    for (const [action, lane] of shots) {
      if (lane < 0 || lane >= slots) continue;
      const target = enemies.find((e) => e.slot === lane);
      if (!target) continue;
      const exposed = barrelHp(target.team, lane) === 0;
      add(action, 4 + (exposed ? 3 : 0) + (target.ammo === 0 ? 1 : 0) + (target.hp === 1 ? 1.5 : 0));
    }
  }

  // Reloading: urgent when empty, occasional otherwise.
  if (bot.ammo === 0) add("RELOAD", threats > 0 ? 4 : 7);
  else if (bot.ammo < 3) add("RELOAD", threats > 0 ? 0.8 : 2);

  // Ducking behind an intact barrel when guns can reach us.
  if (myBarrel && threats > 0) add("COVER", 1.5 + threats);

  // Moving: dodge into a safer lane, leave a broken barrel, or close the distance.
  const moves: [ActionType, number][] = [["MOVE_UP", bot.slot - 1], ["MOVE_DOWN", bot.slot + 1]];
  const nearest = enemies.map((e) => e.slot).sort((a, b) => Math.abs(a - bot.slot) - Math.abs(b - bot.slot))[0];
  for (const [action, lane] of moves) {
    if (lane < 0 || lane >= slots || friends.some((f) => f.slot === lane)) continue;
    let w = 0.8; // a little wandering keeps bots unpredictable
    if (threats > 0) w += 1.5 + Math.max(0, threats - threatsAt(lane)) * 1.5; // dodge
    if (!myBarrel && barrelHp(bot.team, lane) > 0) w += 2; // get back behind cover
    if (nearest !== undefined && Math.abs(nearest - lane) < Math.abs(nearest - bot.slot) && Math.abs(nearest - bot.slot) > 1) w += 3; // chase
    add(action, w);
  }

  if (!options.length) return myBarrel ? "COVER" : "NONE";
  const total = options.reduce((sum, o) => sum + o.w, 0);
  let roll = Math.random() * total;
  for (const o of options) { roll -= o.w; if (roll <= 0) return o.action; }
  return options[options.length - 1].action;
}
