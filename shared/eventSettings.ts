import type { GameConfig, RandomEventSettings } from './types.js';

export function eventSettings(config: Pick<GameConfig, 'events'>): RandomEventSettings {
  return {
    strongWind: config.events?.strongWind !== false,
    walkingWoman: config.events?.walkingWoman !== false,
    gatlingMan: config.events?.gatlingMan !== false,
    rain: config.events?.rain !== false,
  };
}
