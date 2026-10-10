import type { GameState } from '../../shared/types';

// Presentation only. The server's rules and round durations are unchanged.
export const VOLLEY = { move: 420, impact: 840, settle: 1450 };
export const estimateOffset = (sent: number, received: number, server: number) => server - (sent + received) / 2;
export function presentState(state: GameState, now: number): GameState {
  const before = state.resolutionFrom;
  if (state.phase !== 'resolution' || !before || state.resolutionStartedAt == null) return state;
  const elapsed = now - state.resolutionStartedAt;
  if (elapsed >= VOLLEY.impact) return state;
  return {
    ...state,
    players: state.players.map(p => {
      const old = before.players.find(o => o.id === p.id);
      return old ? { ...p, hp: old.hp, isAlive: old.isAlive, ammo: elapsed < VOLLEY.move ? old.ammo : p.ammo } : p;
    }),
    barrels: before.barrels,
  };
}
export function newerState(previous: GameState | null, incoming: GameState) {
  return !previous || previous.roomCode !== incoming.roomCode || incoming.revision >= previous.revision ? incoming : previous;
}
