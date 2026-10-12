import type { GameState } from '../shared/types.js';
import { eventSettings } from '../shared/eventSettings.js';
import { advanceGatlingMan, advanceStrongWind, advanceWalkingWoman, initialGatlingManState, initialStrongWindState, initialWalkingWomanState, runOverWomanWithGatling } from './randomEvents.js';
import { advanceRain, applyRainAmmo, initialRainState } from './rain.js';

/** Lobby switches govern the authoritative event scheduler, including warnings,
 * ammo loss and ambient actors, not just what the host draws. */
export function advanceRoundEvents(state: GameState, now = Date.now(), random: () => number = Math.random) {
  const enabled = eventSettings(state.config), slots = state.config.slotsPerSide;
  state.strongWind = enabled.strongWind ? advanceStrongWind(state.strongWind, state.tick, random) : initialStrongWindState();
  state.rain = enabled.rain ? advanceRain(state.rain, state.tick, slots, state.strongWind, now, random) : initialRainState();
  applyRainAmmo(state);
  state.walkingWoman = enabled.walkingWoman ? advanceWalkingWoman(state.walkingWoman, state.tick, slots, state.strongWind, random) : initialWalkingWomanState();
  state.gatlingMan = enabled.gatlingMan ? advanceGatlingMan(state.gatlingMan, state.tick, slots, random) : initialGatlingManState();
  state.walkingWoman = runOverWomanWithGatling(state.walkingWoman, state.gatlingMan, slots, 'arrival');
}
