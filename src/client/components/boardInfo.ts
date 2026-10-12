import type { ActionType, Barrel, GameState, Player, Team } from '../../../shared/types';

// Read-only helpers that describe the board for the phone UI. They never
// decide rules; the server stays authoritative for every outcome.

export const enemyOf = (team: Team): Team => (team === 'sheriffs' ? 'outlaws' : 'sheriffs');

export const shortName = (name: string, max = 7) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

// Prefer the living occupant; dead players keep their slot on the board.
export function laneOccupant(gs: GameState, team: Team, lane: number): Player | undefined {
  const here = gs.players.filter(p => p.team === team && p.slot === lane && p.slot >= 0);
  return here.find(p => p.isAlive) ?? here[0];
}

export const laneBarrel = (gs: GameState, team: Team, lane: number): Barrel | undefined =>
  gs.barrels.find(b => b.team === team && b.slot === lane);

export const SHOT_OFFSET: Partial<Record<ActionType, number>> = { SHOOT_UP: -1, SHOOT_STRAIGHT: 0, SHOOT_DOWN: 1 };
export const MOVE_OFFSET: Partial<Record<ActionType, number>> = { MOVE_UP: -1, MOVE_DOWN: 1 };

export type PreviewTone = 'open' | 'guarded' | 'empty' | 'off' | 'warn' | 'ok';
export interface Preview { lane: number; offBoard: boolean; text: string; tone: PreviewTone; target?: Player; disabled?: boolean }

export function shotPreview(gs: GameState, me: Player, action: ActionType): Preview | null {
  const d = SHOT_OFFSET[action];
  if (d == null) return null;
  const aimedLane = me.slot + d;
  if (aimedLane < 0 || aimedLane >= gs.config.slotsPerSide) return { lane: aimedLane, offBoard: true, text: 'Off the board', tone: 'off', disabled: true };
  const windOffset = gs.strongWind.phase === 'active' ? (gs.strongWind.direction === 'up' ? -1 : 1) : 0;
  const lane = aimedLane + windOffset;
  if (lane < 0 || lane >= gs.config.slotsPerSide) return { lane, offBoard: true, text: 'Off board · bullet lost', tone: 'warn' };
  const enemy = enemyOf(me.team);
  const target = gs.players.find(p => p.team === enemy && p.slot === lane && p.isAlive);
  if (!target) return { lane, offBoard: false, text: `→ empty lane ${lane + 1}`, tone: 'empty' };
  const barrel = laneBarrel(gs, enemy, lane);
  if (target.isCovered && barrel && barrel.hp > 0) {
    return { lane, offBoard: false, text: `→ ${shortName(target.name, 9)} · behind barrel ${barrel.hp}/3`, tone: 'guarded', target };
  }
  return { lane, offBoard: false, text: `→ ${shortName(target.name, 9)} · exposed!`, tone: 'open', target };
}

export function movePreview(gs: GameState, me: Player, action: ActionType): Preview | null {
  const d = MOVE_OFFSET[action];
  if (d == null) return null;
  const lane = me.slot + d;
  if (lane < 0 || lane >= gs.config.slotsPerSide) return { lane, offBoard: true, text: 'Edge of the board', tone: 'off' };
  const mate = gs.players.find(p => p.team === me.team && p.id !== me.id && p.slot === lane && p.isAlive);
  if (mate) return { lane, offBoard: false, text: `Lane occupied by ${shortName(mate.name, 9)}`, tone: 'warn' };
  return { lane, offBoard: false, text: `To lane ${lane + 1}`, tone: 'ok' };
}

// Living enemies with a loaded gun whose lane is within one of mine.
export function threatsTo(gs: GameState, me: Player): Player[] {
  const enemy = enemyOf(me.team);
  const windOffset = gs.strongWind.phase === 'active' ? (gs.strongWind.direction === 'up' ? -1 : 1) : 0;
  return gs.players.filter(p => p.team === enemy && p.isAlive && p.slot >= 0 && p.ammo > 0
    && [-1, 0, 1].some(aim => {
      const aimedLane = p.slot + aim;
      return aimedLane >= 0 && aimedLane < gs.config.slotsPerSide && aimedLane + windOffset === me.slot;
    }));
}
