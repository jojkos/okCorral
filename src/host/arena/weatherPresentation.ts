import type { GameState, StrongWindState, SwallowState } from '../../../shared/types';
import { swallowPosition } from '../../../shared/swallows';
import { createWindMotion, stepWindMotion, type WindMotion } from './windMotion';

const calm = (): StrongWindState => ({ phase: 'calm', direction: null, activeRoundsRemaining: 0, cooldownRoundsRemaining: 0 });
const approach = (value: number, target: number, seconds: number, duration: number) =>
  value + Math.sign(target - value) * Math.min(Math.abs(target - value), seconds / duration);
const wrap = (value: number, span: number) => ((value % span) + span) % span;
const WIND_CLEAR_DISTANCE = 1400;

export interface WindPresentation {
  weather: StrongWindState;
  motion: WindMotion;
  /** A departing field no longer wraps back into view. */
  exitTravel: number | null;
  exitAge: number;
  opacity: number;
  activeMix: number;
}

export interface DepartingSwallow {
  bird: SwallowState;
  startedAt: number;
  duration: number;
  start: { x: number; y: number };
  control: { x: number; y: number };
  end: { x: number; y: number };
  endControl: { x: number; y: number };
}

export interface WeatherPresentation {
  /** Wall-clock seconds: weather never inherits combat hit-stop. */
  time: number;
  roomCode: string | null;
  tick: number;
  wind: WindPresentation;
  departingWinds: WindPresentation[];
  cloud: number;
  rainfall: number;
  wetness: number;
  clearing: boolean;
  previousRain: 'dry' | 'warning' | 'active';
  liveBirds: Map<string, SwallowState>;
  departingBirds: DepartingSwallow[];
}

export const createWeatherPresentation = (): WeatherPresentation => ({
  time: 0, roomCode: null, tick: -1,
  wind: { weather: calm(), motion: createWindMotion(), exitTravel: null, exitAge: 0, opacity: 0, activeMix: 0 },
  departingWinds: [], cloud: 0, rainfall: 0, wetness: 0, clearing: false, previousRain: 'dry',
  liveBirds: new Map(), departingBirds: [],
});

/** Identical at the transition boundary; thereafter every existing particle
 * leaves by the downstream edge instead of respawning upstream. */
export function windParticleY(wind: WindPresentation, base: number, span: number, multiplier = 1) {
  const travel = wind.motion.travel * multiplier;
  if (wind.exitTravel === null) return wrap(base + travel, span);
  const exitTravel = wind.exitTravel * multiplier;
  return wrap(base + exitTravel, span) + travel - exitTravel;
}

function stepWind(frame: WindPresentation, incoming: StrongWindState, seconds: number, motion: boolean) {
  const visible = incoming.phase !== 'calm' && incoming.direction !== null;
  if (visible) {
    if (frame.weather.direction !== incoming.direction || frame.exitTravel !== null) {
      // A completely new front is introduced gently, never reversed in place.
      frame.motion = createWindMotion();
      frame.opacity = 0;
      frame.activeMix = 0;
    }
    frame.weather = { ...incoming };
    frame.exitTravel = null;
    frame.exitAge = 0;
    frame.opacity = approach(frame.opacity, 1, seconds, 0.9);
    frame.activeMix = approach(frame.activeMix, incoming.phase === 'active' ? 1 : 0, seconds, 0.85);
  } else if (frame.weather.phase !== 'calm') {
    if (frame.exitTravel === null) frame.exitTravel = frame.motion.travel;
    frame.exitAge += seconds;
    // Reduced-motion mode keeps shapes still and fades the event gently.
    if (!motion) frame.opacity = approach(frame.opacity, 0, seconds, 1.4);
  }

  stepWindMotion(frame.motion, frame.weather, seconds, motion);
  if (frame.exitTravel !== null &&
      (Math.abs(frame.motion.travel - frame.exitTravel) >= WIND_CLEAR_DISTANCE || frame.opacity <= 0)) {
    frame.weather = calm();
    frame.motion.speed = 0;
    frame.exitTravel = null;
    frame.exitAge = 0;
    frame.opacity = 0;
    frame.activeMix = 0;
  }
}

function departingSwallow(bird: SwallowState, now: number, duration: number): DepartingSwallow {
  const pose = swallowPosition(bird, now), next = swallowPosition(bird, now + 16);
  const direction = Math.cos(pose.angle) < 0 ? -1 : 1;
  const end = { x: direction < 0 ? -100 : 1700, y: Math.max(-100, pose.y - 200) };
  // Start with the exact loop-flight tangent so the escape has no corner.
  const tangentSeconds = duration / 3000;
  return {
    bird: { ...bird }, startedAt: now, duration, start: { x: pose.x, y: pose.y }, end,
    control: { x: pose.x + (next.x - pose.x) / 0.016 * tangentSeconds, y: pose.y + (next.y - pose.y) / 0.016 * tangentSeconds },
    endControl: { x: end.x - direction * 300, y: end.y + 45 },
  };
}

export function departingSwallowPose(flight: DepartingSwallow, now: number) {
  const p = Math.max(0, Math.min(1, (now - flight.startedAt) / flight.duration)), q = 1 - p;
  const { start: a, control: b, endControl: c, end: d } = flight;
  const x = q ** 3 * a.x + 3 * q * q * p * b.x + 3 * q * p * p * c.x + p ** 3 * d.x;
  const y = q ** 3 * a.y + 3 * q * q * p * b.y + 3 * q * p * p * c.y + p ** 3 * d.y;
  const dx = 3 * q * q * (b.x - a.x) + 6 * q * p * (c.x - b.x) + 3 * p * p * (d.x - c.x);
  const dy = 3 * q * q * (b.y - a.y) + 6 * q * p * (c.y - b.y) + 3 * p * p * (d.y - c.y);
  return { x, y, angle: Math.atan2(dy, dx), flap: Math.sin((now - flight.bird.bornAt) * .02 + flight.bird.seed), groundY: Math.min(876, y + 64), progress: p };
}

/** Presentation-only tails. The server remains authoritative for ammunition,
 * hit tests, corpses and event duration; departing live birds are not targets. */
export function stepWeatherPresentation(frame: WeatherPresentation, gs: GameState, now: number, realSeconds: number, motion: boolean) {
  const seconds = Number.isFinite(realSeconds) ? Math.max(0, realSeconds) : 0;
  if ((frame.roomCode !== null && frame.roomCode !== gs.roomCode) || gs.tick < frame.tick || gs.phase === 'lobby') {
    Object.assign(frame, createWeatherPresentation());
  }
  frame.roomCode = gs.roomCode;
  frame.tick = gs.tick;
  frame.time += seconds;
  const nextWind = gs.strongWind;
  if (nextWind.phase !== 'calm' && nextWind.direction && frame.wind.weather.phase !== 'calm' &&
      (frame.wind.exitTravel !== null || frame.wind.weather.direction !== nextWind.direction)) {
    // On short rounds the next front may arrive before the previous brush has
    // cleared the street. Let the old field finish instead of reversing it.
    frame.wind.exitTravel ??= frame.wind.motion.travel;
    frame.departingWinds.push(frame.wind);
    frame.wind = createWeatherPresentation().wind;
  }
  for (const tail of frame.departingWinds) stepWind(tail, calm(), seconds, motion);
  frame.departingWinds = frame.departingWinds.filter(tail => tail.weather.phase !== 'calm');
  stepWind(frame.wind, gs.strongWind, seconds, motion);

  const rain = gs.rain?.phase ?? 'dry';
  if (rain === 'dry' && frame.previousRain !== 'dry') frame.clearing = true;
  if (rain !== 'dry') frame.clearing = false;
  const cloudTarget = rain === 'active' ? 1 : rain === 'warning' ? (gs.rain.warningRoundsRemaining > 1 ? .25 : .5) : 0;
  frame.cloud = approach(frame.cloud, cloudTarget, seconds, rain === 'dry' ? 4.5 : 3);
  frame.rainfall = approach(frame.rainfall, rain === 'active' ? 1 : 0, seconds, rain === 'active' ? .9 : 1.4);
  frame.wetness = approach(frame.wetness, rain === 'active' ? 1 : 0, seconds, rain === 'active' ? 1.8 : 6);
  if (frame.cloud === 0) frame.clearing = false;
  frame.previousRain = rain;

  const birds = gs.rain?.swallows ?? [];
  const currentIds = new Set(birds.map(b => b.id));
  // Their authoritative hit boxes have left with the warning. Anchor the
  // escape deadline to the server's round start, not receipt of a delayed
  // snapshot. Never replay a missed flock during a volley or after tab resume.
  const planningRemaining = gs.phase === 'planning'
    ? (gs.tickStartTime ?? now) + gs.config.tickDuration - now : 0;
  const departureDuration = Math.min(3100, planningRemaining - 150);
  if (departureDuration > 0) for (const bird of frame.liveBirds.values()) {
    if (!currentIds.has(bird.id)) frame.departingBirds.push(departingSwallow(bird, now, departureDuration));
  }
  // A late authoritative hit always wins over a retained escape animation.
  // Retaining only birds seen alive also prevents any corpse from resurrecting.
  frame.departingBirds = frame.departingBirds.filter(b => gs.phase === 'planning' && !currentIds.has(b.bird.id) && now - b.startedAt < b.duration);
  frame.liveBirds = new Map(birds.filter(b => !b.remains).map(b => [b.id, { ...b }]));
}
