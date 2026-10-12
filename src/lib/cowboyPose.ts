/** Source-art dimensions stay fixed: cover bends joints, never scales the body. */
export const COWBOY_SPRITE_SCALE = 128 / 930;
export function cowboyCoverPose(amount = 0) {
  const cover = Math.max(0, Math.min(1, amount));
  return {
    cover,
    drop: 180 * cover,
    rearThigh: 0.28 * cover,
    rearShin: 1.55 * cover,
    frontThigh: -1.1 * cover,
    frontShin: 0.22 * cover,
  };
}
export const cowboyCoverDrop = (amount: number) => cowboyCoverPose(amount).drop * COWBOY_SPRITE_SCALE;
