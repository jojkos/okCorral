import type { ActionType, StrongWindState } from './types.js';

export const SHOT_OFFSET: Partial<Record<ActionType, number>> = {
  SHOOT_UP: -1, SHOOT_STRAIGHT: 0, SHOOT_DOWN: 1,
};
export const SHOT_ACTIONS = ['SHOOT_UP', 'SHOOT_STRAIGHT', 'SHOOT_DOWN'] as const;
export const windOffset = (wind: StrongWindState) =>
  wind.phase === 'active' ? (wind.direction === 'up' ? -1 : wind.direction === 'down' ? 1 : 0) : 0;

/** Aim may be one lane beyond either edge. Only the wind-adjusted destination
 * decides whether the shot lands on the board; every fired shot costs ammo. */
export function shotPath(slot: number, action: ActionType, wind: StrongWindState, slots: number) {
  const offset = SHOT_OFFSET[action];
  if (offset == null) return null;
  const aimedSlot = slot + offset;
  const targetSlot = aimedSlot + windOffset(wind);
  return {
    aimedSlot, targetSlot,
    aimedOffBoard: aimedSlot < 0 || aimedSlot >= slots,
    offBoard: targetSlot < 0 || targetSlot >= slots,
    trajectory: offset < 0 ? 'up' as const : offset > 0 ? 'down' as const : 'straight' as const,
  };
}
