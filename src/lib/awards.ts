import type { GameState, Player, PlayerStats } from '../../shared/types';

export interface Award { id: string; title: string; blurb: string; icon: string; player: Player; value: number }

type Def = { id: string; title: string; icon: string; score: (s: PlayerStats) => number; min: number; blurb: (n: number) => string };
const DEFS: Def[] = [
  { id: 'sharpshooter', title: 'Sharpshooter', icon: '🎯', score: s => s.hits * 10 + s.kills * 15 - s.misses, min: 1, blurb: n => `${n} ${n === 1 ? 'hit' : 'hits'} on target` },
  { id: 'reaper', title: 'Undertaker', icon: '⚰️', score: s => s.kills, min: 1, blurb: n => `${n} ${n === 1 ? 'soul' : 'souls'} put in the ground` },
  { id: 'iron', title: 'Iron Barrel', icon: '🛢️', score: s => s.blocked, min: 1, blurb: n => `${n} ${n === 1 ? 'bullet' : 'bullets'} eaten by the barrel` },
  { id: 'trigger', title: 'Trigger-Happy', icon: '💥', score: s => s.misses, min: 2, blurb: n => `${n} shots into thin air` },
  { id: 'chicken', title: 'Yellow Belly', icon: '🐔', score: s => s.covers, min: 3, blurb: n => `hid behind a barrel ${n} times` },
  { id: 'dancer', title: 'Tumbleweed', icon: '🌵', score: s => s.moves, min: 3, blurb: n => `changed lanes ${n} times` },
  { id: 'hoarder', title: 'Ammo Hoarder', icon: '🔄', score: s => s.reloads, min: 3, blurb: n => `reloaded ${n} times` },
  { id: 'clang', title: 'Bullet Catcher', icon: '⚡', score: s => s.clashes, min: 1, blurb: n => `${n} ${n === 1 ? 'bullet' : 'bullets'} clashed mid-air` },
];
const raw: Record<string, (s: PlayerStats) => number> = {
  sharpshooter: s => s.hits, reaper: s => s.kills, iron: s => s.blocked, trigger: s => s.misses,
  chicken: s => s.covers, dancer: s => s.moves, hoarder: s => s.reloads, clang: s => s.clashes,
};

// Each player gets at most one award; each award goes to its top scorer.
export function computeAwards(gs: GameState, limit = 5): Award[] {
  const seated = gs.players.filter(p => p.slot >= 0 && p.stats);
  const used = new Set<string>();
  const out: Award[] = [];
  for (const d of DEFS) {
    const best = seated.filter(p => !used.has(p.id))
      .map(p => ({ p, score: d.score(p.stats!), value: raw[d.id](p.stats!) }))
      .filter(x => x.value >= d.min)
      .sort((a, b) => b.score - a.score)[0];
    if (!best) continue;
    used.add(best.p.id);
    out.push({ id: d.id, title: d.title, icon: d.icon, blurb: d.blurb(best.value), player: best.p, value: best.value });
    if (out.length >= limit) break;
  }
  return out;
}

export function mvp(gs: GameState): Player | null {
  const seated = gs.players.filter(p => p.slot >= 0 && p.stats);
  const score = (p: Player) => p.stats!.kills * 5 + p.stats!.hits * 2 + p.stats!.blocked + (p.isAlive ? 3 : 0);
  return seated.sort((a, b) => score(b) - score(a))[0] ?? null;
}
