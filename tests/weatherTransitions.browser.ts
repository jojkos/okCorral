import type { GameState } from '../shared/types';
import { slotLayout } from '../shared/arenaGeometry';
import { drawStrongWindWeather } from '../src/host/arena/scene';
import { drawRain, drawRainGround, drawSwallows } from '../src/host/arena/rain';
import { createWeatherPresentation, stepWeatherPresentation, type WeatherPresentation } from '../src/host/arena/weatherPresentation';
import type { AnimationCase } from './animationCases';

function game(slots: number): GameState {
  return {
    roomCode: 'WEATHER', revision: 1, tick: 12, phase: 'planning', tickStartTime: 10000,
    config: { tickDuration: 4000, slotsPerSide: slots },
    strongWind: { phase: 'calm', direction: null, activeRoundsRemaining: 0, cooldownRoundsRemaining: 0 },
    rain: { phase: 'dry', warningRoundsRemaining: 0, swallows: [], ammoAppliedTick: null },
    walkingWoman: { phase: 'inactive', slot: null, fromSlot: null, direction: null, cooldownRoundsRemaining: 0, bloodTrail: [], killedFromTeam: null },
    gatlingMan: { phase: 'inactive', cooldownRoundsRemaining: 0, targets: [] },
    players: [], barrels: [], pendingActions: [], pendingSuicides: [], lastTickSuicides: [], lastTickBullets: [], winner: null,
  };
}

function paint(ctx: CanvasRenderingContext2D, gs: GameState, state: WeatherPresentation, now: number, motion: boolean) {
  // Balanced wrapper also makes a legitimately fully cleared frame testable.
  ctx.save();
  const L = slotLayout(gs.config.slotsPerSide);
  drawRainGround(ctx, gs, state.time, motion, state);
  drawSwallows(ctx, gs, now, 1, -1, motion, 'ground', state);
  for (const wind of [...state.departingWinds, state.wind]) drawStrongWindWeather(ctx, L, wind.weather, wind.motion.travel, wind);
  drawSwallows(ctx, gs, now, 1, -1, motion, 'air', state);
  drawRain(ctx, gs, state.time, motion, state);
  ctx.restore();
}

export const weatherTransitionCases: AnimationCase[] = [
  ...(['up', 'down'] as const).map(direction => ({
    name: `Wind ${direction} blows completely away`,
    draw(ctx: CanvasRenderingContext2D, progress: number, motion: boolean, slots: number) {
      const gs = game(slots), state = createWeatherPresentation();
      gs.strongWind = { phase: 'active', direction, activeRoundsRemaining: 1, cooldownRoundsRemaining: 0 };
      stepWeatherPresentation(state, gs, 10000, 4, motion);
      gs.strongWind = { ...gs.strongWind, phase: 'calm', direction: null };
      stepWeatherPresentation(state, gs, 10000 + progress * 8000, progress * 8, motion);
      paint(ctx, gs, state, 10000 + progress * 8000, motion);
    },
  })),
  {
    name: 'Wind old front exits while opposite front arrives',
    draw(ctx, progress, motion, slots) {
      const gs = game(slots), state = createWeatherPresentation();
      gs.strongWind = { phase: 'active', direction: 'down', activeRoundsRemaining: 1, cooldownRoundsRemaining: 0 };
      stepWeatherPresentation(state, gs, 10000, 4, motion);
      gs.strongWind = { ...gs.strongWind, phase: 'calm', direction: null };
      stepWeatherPresentation(state, gs, 11000, 1, motion);
      gs.strongWind = { ...gs.strongWind, phase: 'warning', direction: 'up' };
      stepWeatherPresentation(state, gs, 11000 + progress * 4500, progress * 4.5, motion);
      paint(ctx, gs, state, 11000 + progress * 4500, motion);
    },
  },
  {
    name: 'Rain clouds gather gradually before rainfall',
    draw(ctx, progress, motion, slots) {
      const gs = game(slots), state = createWeatherPresentation(), time = progress * 8;
      gs.rain.phase = 'warning'; gs.rain.warningRoundsRemaining = 2;
      stepWeatherPresentation(state, gs, 10000 + Math.min(time, 2) * 1000, Math.min(time, 2), motion);
      if (time > 2) {
        gs.rain.warningRoundsRemaining = 1;
        stepWeatherPresentation(state, gs, 12000 + Math.min(time - 2, 2) * 1000, Math.min(time - 2, 2), motion);
      }
      if (time > 4) {
        gs.rain.phase = 'active';
        stepWeatherPresentation(state, gs, 14000 + (time - 4) * 1000, time - 4, motion);
      }
      paint(ctx, gs, state, 10000 + time * 1000, motion);
    },
  },
  {
    name: 'Rain clears into dawn and puddles dry',
    draw(ctx, progress, motion, slots) {
      const gs = game(slots), state = createWeatherPresentation();
      gs.rain.phase = 'active';
      stepWeatherPresentation(state, gs, 10000, 4, motion);
      gs.rain.phase = 'dry';
      stepWeatherPresentation(state, gs, 10000 + progress * 6500, progress * 6.5, motion);
      paint(ctx, gs, state, 10000 + progress * 6500, motion);
    },
  },
  ...([4000, 1000] as const).map(duration => ({
    name: `Surviving swallows leave before volley (${duration / 1000}s round)`,
    draw(ctx: CanvasRenderingContext2D, progress: number, motion: boolean, slots: number) {
      const gs = game(slots), state = createWeatherPresentation(), time = progress * (duration === 1000 ? 1000 : 3500);
      gs.config.tickDuration = duration;
      gs.rain.swallows = Array.from({ length: 6 }, (_, i) => ({ id: `bird-${i}`, seed: 17 + i * 39, bornAt: 10000 }));
      stepWeatherPresentation(state, gs, 10000, 1, motion);
      gs.rain.swallows = [];
      gs.tickStartTime = 11000;
      stepWeatherPresentation(state, gs, 11000, 0, motion);
      stepWeatherPresentation(state, gs, 11000 + time, time / 1000, motion);
      paint(ctx, gs, state, 11000 + time, motion);
    },
  })),
  {
    name: 'Storm wind rain and survivors clear together',
    draw(ctx, progress, motion, slots) {
      const gs = game(slots), state = createWeatherPresentation();
      gs.strongWind = { phase: 'active', direction: 'up', activeRoundsRemaining: 1, cooldownRoundsRemaining: 0 };
      gs.rain.phase = 'active';
      gs.rain.swallows = Array.from({ length: 4 }, (_, i) => ({ id: `bird-${i}`, seed: 17 + i * 39, bornAt: 10000 }));
      stepWeatherPresentation(state, gs, 10000, 4, motion);
      gs.strongWind = { ...gs.strongWind, phase: 'calm', direction: null }; gs.rain.phase = 'dry'; gs.rain.swallows = [];
      gs.tickStartTime = 11000;
      stepWeatherPresentation(state, gs, 11000, 0, motion);
      stepWeatherPresentation(state, gs, 11000 + progress * 8000, progress * 8, motion);
      paint(ctx, gs, state, 11000 + progress * 8000, motion);
    },
  },
];
