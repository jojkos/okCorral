import type { StrongWindState } from '../../../shared/types';

export interface WindMotion {
  /** Signed distance travelled, independent of the combat slow-motion clock. */
  travel: number;
  speed: number;
}

export const createWindMotion = (): WindMotion => ({ travel: 0, speed: 0 });

/** Integrate velocity instead of multiplying the entire match age by the
 * current speed: warning -> active must accelerate, never teleport the brush.
 * The exact exponential integral also keeps speed identical at 20/60/144 FPS. */
export function stepWindMotion(frame: WindMotion, wind: StrongWindState, seconds: number, motion: boolean) {
  if (!motion || seconds <= 0 || !Number.isFinite(seconds)) return;
  const direction = wind.direction === 'up' ? -1 : 1;
  const target = wind.phase === 'calm' || !wind.direction ? 0
    : direction * (wind.phase === 'active' ? 210 : 75);
  // A new event must never initially drift in the previous event's direction.
  if (frame.speed * target < 0) frame.speed = 0;
  const ease = 1 - Math.exp(-5 * seconds);
  frame.travel += target * seconds + (frame.speed - target) * ease / 5;
  frame.speed += (target - frame.speed) * ease;
}
