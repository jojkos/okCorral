import type { GameState } from '../../shared/types';
import { presentGatlingWoman } from '../../shared/gatlingGeometry';

// Presentation only. The server's rules and round durations are unchanged.
// Resolution timeline (ms after resolutionStartedAt), shared by host + phones:
//   0 → reveal   every player's chosen action pops up, aim lines appear
//   reveal → move   movers slide to their new lane
//   move         the volley fires (ammo spent)
//   impact       bullets land; health and barrels update
//   settle       callouts fade; server starts next round at RESOLUTION_MS
import { VOLLEY } from '../../shared/volley';
export { VOLLEY } from '../../shared/volley';
export const estimateOffset = (sent: number, received: number, server: number) => server - (sent + received) / 2;
export function presentState(state: GameState, now: number): GameState {
  const progress = state.phase === 'planning' && state.tickStartTime != null
    ? Math.max(0, Math.min(1, (now - state.tickStartTime) / state.config.tickDuration)) : 1;
  const resolutionElapsed = state.phase === 'resolution' && state.resolutionStartedAt != null ? now - state.resolutionStartedAt : -1;
  const showCivilian = (frame: GameState): GameState => {
    const woman = presentGatlingWoman(frame.walkingWoman, progress, resolutionElapsed, state.config.tickDuration);
    return woman === frame.walkingWoman ? frame : { ...frame, walkingWoman: woman };
  };
  const before = state.resolutionFrom;
  if (state.phase !== 'resolution' || !before || state.resolutionStartedAt == null) return showCivilian(state);
  const elapsed = now - state.resolutionStartedAt;
  if (elapsed >= VOLLEY.impact) return showCivilian(state);
  return showCivilian({
    ...state,
    players: state.players.map(p => {
      const old = before.players.find(o => o.id === p.id);
      return old ? { ...p, hp: old.hp, isAlive: old.isAlive, ammo: elapsed < VOLLEY.move ? old.ammo : p.ammo } : p;
    }),
    barrels: before.barrels,
    walkingWoman: before.walkingWoman ?? state.walkingWoman,
    pendingSuicides: before.pendingSuicides ?? state.pendingSuicides,
  });
}
export function newerState(previous: GameState | null, incoming: GameState) {
  return !previous || previous.roomCode !== incoming.roomCode || incoming.revision >= previous.revision ? incoming : previous;
}
