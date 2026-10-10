import type { ActionType, GameState, Player } from "../shared/types.js";

export const BOT_NAMES = [
  "Dusty", "Slim", "Hank", "Lefty", "Rusty", "Buck", "Cactus Jo", "Rattler",
  "Mad Dog", "Whiskey", "Two-Gun", "Doc Bot", "Sundance", "Calamity",
];

// A simple, beatable bot. It only reads public board state (positions, ammo,
// barrel HP) — the same information a human sees on the TV — and picks one
// legal action. Randomness keeps it from being predictable.
export function chooseBotAction(state: GameState, bot: Player): ActionType {
  const slots = state.config.slotsPerSide;
  const enemies = state.players.filter(
    (p) => p.team !== bot.team && p.isAlive && p.slot >= 0,
  );
  const friends = state.players.filter(
    (p) => p.team === bot.team && p.isAlive && p.slot >= 0 && p.id !== bot.id,
  );
  const myBarrel = state.barrels.find((b) => b.team === bot.team && b.slot === bot.slot);
  const barrelUp = !!myBarrel && myBarrel.hp > 0;
  const enemyBarrel = (slot: number) =>
    state.barrels.find((b) => b.team !== bot.team && b.slot === slot)?.hp ?? 0;

  // Enemies with a bullet who could hit my lane this round.
  const threats = enemies.filter((e) => e.ammo > 0 && Math.abs(e.slot - bot.slot) <= 1).length;

  const shots: { action: ActionType; slot: number }[] = [
    { action: "SHOOT_STRAIGHT", slot: bot.slot },
    { action: "SHOOT_UP", slot: bot.slot - 1 },
    { action: "SHOOT_DOWN", slot: bot.slot + 1 },
  ];
  const targets = shots.filter(
    (s) => s.slot >= 0 && s.slot < slots && enemies.some((e) => e.slot === s.slot),
  );

  const roll = Math.random();

  if (bot.ammo === 0) {
    if (threats > 0 && barrelUp && roll < 0.35) return "COVER";
    return "RELOAD";
  }

  if (targets.length > 0) {
    // Prefer targets whose barrel is gone or who can't shoot back.
    const scored = targets
      .map((t) => {
        const e = enemies.find((x) => x.slot === t.slot)!;
        return { ...t, score: (enemyBarrel(t.slot) === 0 ? 2 : 0) + (e.ammo === 0 ? 1 : 0) + Math.random() * 1.5 };
      })
      .sort((a, b) => b.score - a.score);
    if (threats > 0 && barrelUp && roll < 0.25) return "COVER";
    if (bot.ammo < 3 && roll > 0.85) return "RELOAD";
    return scored[0].action;
  }

  // Nobody in reach: reposition toward the nearest enemy lane, reload, or hide.
  if (threats > 0 && barrelUp && roll < 0.3) return "COVER";
  if (bot.ammo < 3 && roll < 0.55) return "RELOAD";
  const nearest = enemies
    .map((e) => e.slot)
    .sort((a, b) => Math.abs(a - bot.slot) - Math.abs(b - bot.slot))[0];
  if (nearest !== undefined) {
    const dir = nearest < bot.slot ? -1 : 1;
    const next = bot.slot + dir;
    if (next >= 0 && next < slots && !friends.some((f) => f.slot === next)) {
      return dir < 0 ? "MOVE_UP" : "MOVE_DOWN";
    }
  }
  return bot.ammo < 3 ? "RELOAD" : barrelUp ? "COVER" : "NONE";
}
