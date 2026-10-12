import type { Bullet, GameState } from './types.js';
import { bulletLaneFeet, CANVAS_W, facingOf, gunHeight, slotLayout, teamX } from './arenaGeometry.js';
import { finishShot, playerShotCurve, trimCurve, type ShotFlight } from './ballistics.js';
import { gatlingMuzzlePoint } from './gatlingGeometry.js';

/** Freeze the complete visible flight after combat resolution. Bird hits use
 * this same curve, including cover, civilian stops, clashes and off-board misses. */
export function resolvedBulletFlight(state: GameState, b: Bullet): ShotFlight {
  const L = slotLayout(state.config.slotsPerSide), enemy = b.targetTeam ?? (b.fromTeam === 'sheriffs' ? 'outlaws' : 'sheriffs');
  const dir = b.source === 'gatling' ? (enemy === 'outlaws' ? 1 : -1) : facingOf(b.fromTeam);
  const origin = b.source === 'gatling' ? gatlingMuzzlePoint(L, { team: enemy, slot: b.aimedSlot }) : null;
  const curve = playerShotCurve(L, b.fromTeam, b.fromSlot, b.aimedSlot, b.toSlot);
  if (!origin && (b.hit === 'woman' || b.hit === 'bullet')) return trimCurve(curve, b.hit === 'woman' ? b.civilianHitT ?? 0.5 : 0.5);
  const fromX = origin?.x ?? curve.fromX, fromY = origin?.y ?? curve.fromY;
  const feet = bulletLaneFeet(L, b.toSlot), aimedY = bulletLaneFeet(L, b.aimedSlot) - gunHeight(L);
  let toX = teamX(L, enemy), toY = feet - 72 * L.s;
  if (b.hit === 'player') {
    const target = state.players.find(p => p.id === b.targetId);
    if (target) {
      toX = target.isCovered ? (enemy === 'sheriffs' ? L.sheriffBarrel : L.outlawBarrel) - facingOf(enemy) * 10 * L.s : teamX(L, enemy);
      toY = feet - (target.isCovered ? 46 : 74) * L.s;
    }
  } else if (b.hit === 'barrel') {
    toX = (enemy === 'sheriffs' ? L.sheriffBarrel : L.outlawBarrel) - dir * 22 * L.s;
    toY = feet - 88 * L.s * 0.55;
  } else {
    const edge = dir > 0 ? CANVAS_W + 60 : -60;
    if (!origin) return trimCurve(curve, (edge - fromX) / (curve.toX - fromX));
    toY = fromY + (toY - fromY) * (edge - fromX) / (toX - fromX); toX = edge;
  }
  return origin ? { fromX, fromY, controlX: (fromX + toX) / 2, controlY: (fromY + aimedY) / 2, toX, toY }
    : finishShot(curve, toX, toY);
}
