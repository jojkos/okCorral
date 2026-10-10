import type { GameState } from '../../shared/types';

// Presentation only. The server's rules and round durations are unchanged.
// Resolution timeline (ms after resolutionStartedAt), shared by host + phones:
//   0 → reveal   every player's chosen action pops up, aim lines appear
//   reveal → move   movers slide to their new lane
//   move         the volley fires (ammo spent)
//   impact       bullets land; health and barrels update
//   settle       callouts fade; server starts next round at RESOLUTION_MS
export const VOLLEY = { reveal: 450, move: 850, impact: 1250, settle: 2100 };
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
