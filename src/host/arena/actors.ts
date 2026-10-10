import type { ActionType, Barrel, Player } from '../../../shared/types';
import { COL, drawCowboy, roundRect } from '../../lib/cowboyDraw';
import { FONT, Layout, TEAM_COL, barrelHeight, barrelX, clamp01, easeInOutQuad, easeOutBack, easeOutCubic, facingOf, nameSeed, teamX } from './layout';

export interface ActorAnim {
  cover?: number;
  flinchAt?: number;
  deathAt?: number;
  deathDur?: number;
  hatGone?: boolean;
}

export interface ActorFrame {
  /** Feet position after slide interpolation. */
  x: number;
  feet: number;
  /** 0..1 crouched behind barrel. */
  cover: number;
  covered: boolean;
  noCover: boolean;
}

/** Where (and how crouched) an actor is this frame. Pure function of state + clock. */
export function actorFrame(L: Layout, p: Player, from: Player | undefined, barrel: Barrel | undefined, elapsed: number, timeline: { reveal: number; move: number }, anim: ActorAnim, motion: boolean): ActorFrame {
  const x0 = teamX(L, p.team);
  let feet = L.feet[p.slot] ?? L.feet[0];
  if (from && from.slot !== p.slot && from.slot >= 0 && elapsed >= 0) {
    const k = clamp01((elapsed - timeline.reveal) / (timeline.move - timeline.reveal));
    if (k < 1) feet = L.feet[from.slot] + (feet - L.feet[from.slot]) * (motion ? easeInOutQuad(k) : k >= 0.5 ? 1 : 0);
  }
  const wantsCover = elapsed >= 0 && elapsed < timeline.reveal && from ? from.isCovered : p.isCovered;
  const target = p.isAlive && wantsCover ? 1 : 0;
  anim.cover = motion ? (anim.cover ?? target) + (target - (anim.cover ?? target)) * 0.2 : target;
  const barrelUp = !!barrel && barrel.hp > 0;
  const bx = barrelX(L, p.team);
  const x = x0 + (bx - x0 - facingOf(p.team) * 10 * L.s) * easeOutCubic(anim.cover);
  return { x, feet, cover: anim.cover, covered: target === 1 && barrelUp, noCover: target === 1 && !barrelUp };
}

export interface ActorPose { walk: number; recoil: number; reload: number }

export function drawActor(ctx: CanvasRenderingContext2D, L: Layout, p: Player, f: ActorFrame, anim: ActorAnim, pose: ActorPose, t: number, motion: boolean) {
  const s = L.s;
  const facing = facingOf(p.team);
  let flinch = 0;
  if (anim.flinchAt != null) {
    const ft = t - anim.flinchAt;
    if (ft < 0.4) flinch = Math.sin(ft * 45) * (1 - ft / 0.4) * 9 - facing * (1 - ft / 0.4) * 10;
  }
  let fall = 0;
  let alpha = 1;
  if (anim.deathAt != null) {
    const dur = anim.deathDur ?? 0.7;
    const k = clamp01((t - anim.deathAt) / dur);
    fall = easeOutBounce(k);
    alpha = 1 - clamp01((t - anim.deathAt - dur - 0.8) / 0.8) * 0.45;
  } else if (!p.isAlive) { fall = 1; alpha = 0.55; }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(f.x + (motion ? flinch : 0), f.feet);
  // Team-coloured ground glow so sides read instantly.
  if (p.isAlive) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 58 * s);
    g.addColorStop(0, TEAM_COL[p.team].glow + '0.45)');
    g.addColorStop(1, TEAM_COL[p.team].glow + '0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, 60 * s, 16 * s, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.ellipse(0, 0, 32 * s * (1 + fall * 0.8), 6 * s, 0, 0, Math.PI * 2); ctx.fill();

  // Fall backwards (away from the street), pivoting at the boots.
  ctx.rotate(-facing * fall * (Math.PI / 2 - 0.3));
  ctx.translate(0, fall * 4 * s);
  // Crouch: squash toward the boards.
  ctx.scale(s, s * (1 - f.cover * 0.3));
  ctx.translate(0, -63);
  drawCowboy(ctx, p.team, facing, motion ? t : 0, nameSeed(p.name), { ...pose, hat: !anim.hatGone });
  ctx.restore();
}

function easeOutBounce(x: number) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

/** Big readable info plate on the outer edge: name, hearts, bullets. */
export function drawPlate(ctx: CanvasRenderingContext2D, L: Layout, p: Player, laneY: number, ready: boolean, planning: boolean, t: number, cover: 'safe' | 'exposed' | null = null) {
  const s = Math.max(0.75, Math.min(1, L.slotHeight / 120));
  const cx = p.team === 'sheriffs' ? 132 : 1468;
  const w = 168 * s, h = Math.min(L.slotHeight - 14, 100 * s);
  const col = TEAM_COL[p.team];
  ctx.save();
  ctx.translate(cx, laneY);
  ctx.globalAlpha = p.isAlive ? 1 : 0.5;
  ctx.fillStyle = 'rgba(14,9,6,0.86)';
  ctx.strokeStyle = ready && planning ? '#7ee08a' : col.main;
  ctx.lineWidth = ready && planning ? 3 : 2;
  roundRect(ctx, -w / 2, -h / 2, w, h, 10 * s); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col.dark;
  ctx.fillRect(p.team === 'sheriffs' ? -w / 2 : w / 2 - 6, -h / 2 + 6, 6, h - 12);

  const name = (p.name || '').toUpperCase().slice(0, 11);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(19 * s)}px ${FONT.mono}`;
  ctx.fillStyle = p.isAlive ? col.text : '#9a9a9a';
  ctx.fillText(p.isAlive ? name : `† ${name}`, 0, -h / 2 + 17 * s);
  if (p.isBot) {
    ctx.font = `bold ${Math.round(10 * s)}px ${FONT.mono}`;
    ctx.fillStyle = 'rgba(234,211,176,0.55)';
    ctx.fillText('BOT', w / 2 - 20 * s, -h / 2 + 9 * s);
  }

  if (p.isAlive) {
    const row1 = -h / 2 + h * 0.52, row2 = -h / 2 + h * 0.8;
    for (let i = 0; i < 3; i++) drawHeart(ctx, (i - 1) * 34 * s, row1, 13 * s, i < p.hp ? '#ff5a4f' : '#2e1414');
    for (let i = 0; i < 3; i++) drawCartridge(ctx, (i - 1) * 34 * s, row2, 12 * s, i < p.ammo);
  } else {
    ctx.font = `bold ${Math.round(15 * s)}px ${FONT.mono}`;
    ctx.fillStyle = '#b8a48a';
    ctx.fillText(p.stats?.diedOnTick ? `DOWN · RND ${p.stats.diedOnTick}` : 'GUNNED DOWN', 0, h * 0.1);
  }

  if (p.isAlive && cover) {
    const safe = cover === 'safe';
    ctx.save();
    ctx.translate(0, h / 2);
    if (!safe) { const k = 1 + Math.sin(t * 10) * 0.05; ctx.scale(k, k); }
    ctx.fillStyle = safe ? '#163a30' : '#4a0f0a';
    ctx.strokeStyle = safe ? '#8fe3c4' : '#ff6a55'; ctx.lineWidth = 2;
    roundRect(ctx, -58 * s, -12 * s, 116 * s, 24 * s, 7 * s); ctx.fill(); ctx.stroke();
    ctx.fillStyle = safe ? '#8fe3c4' : '#ff8a75';
    ctx.font = `bold ${Math.round(13 * s)}px ${FONT.mono}`;
    ctx.fillText(safe ? '⛨ IN COVER' : '⚠ NO COVER', 0, 1);
    ctx.restore();
  }
  if (planning && p.isAlive && ready) {
    ctx.fillStyle = '#7ee08a';
    const pulse = 1 + Math.sin(t * 5) * 0.04;
    ctx.save(); ctx.translate(p.team === 'sheriffs' ? w / 2 - 4 : -w / 2 + 4, -h / 2 + 2); ctx.scale(pulse, pulse);
    roundRect(ctx, -30 * s, -10 * s, 60 * s, 20 * s, 6 * s); ctx.fill();
    ctx.fillStyle = '#0d2412'; ctx.font = `bold ${Math.round(12 * s)}px ${FONT.mono}`;
    ctx.fillText('READY', 0, 1);
    ctx.restore();
  }
  ctx.restore();
}

export function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.75);
  ctx.bezierCurveTo(cx + size * 1.2, cy + size * 0.1, cx + size * 0.9, cy - size * 0.95, cx, cy - size * 0.3);
  ctx.bezierCurveTo(cx - size * 0.9, cy - size * 0.95, cx - size * 1.2, cy + size * 0.1, cx, cy + size * 0.75);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if (color !== '#2e1414') { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(cx - size * 0.38, cy - size * 0.35, size * 0.18, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

export function drawCartridge(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, loaded: boolean) {
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(Math.PI / 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1.6;
  // Brass case
  ctx.fillStyle = loaded ? '#e8b448' : 'rgba(60,50,44,0.9)';
  roundRect(ctx, -size * 0.9, -size * 0.55, size * 1.2, size * 1.1, 2); ctx.fill(); ctx.stroke();
  // Lead tip
  ctx.fillStyle = loaded ? '#9aa3a8' : '#1e1b19';
  ctx.beginPath(); ctx.moveTo(size * 0.3, -size * 0.5); ctx.quadraticCurveTo(size * 1.3, 0, size * 0.3, size * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (loaded) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-size * 0.8, -size * 0.4, size * 1.0, size * 0.22); }
  ctx.restore();
}

/** Planning: "…" while thinking, gold check badge once locked. */
export function drawIntentMarker(ctx: CanvasRenderingContext2D, L: Layout, x: number, headY: number, locked: boolean, t: number, motion: boolean) {
  const s = Math.max(0.7, L.s);
  ctx.save();
  ctx.translate(x, headY);
  if (locked) {
    const k = motion ? 1 + Math.sin(t * 4) * 0.05 : 1;
    ctx.scale(k * s, k * s);
    ctx.fillStyle = '#2f7a43'; ctx.strokeStyle = '#d8ffd8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-2, 6); ctx.lineTo(8, -6); ctx.stroke();
  } else {
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(244,233,214,0.92)'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
    roundRect(ctx, -26, -14, 52, 28, 12); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, 13); ctx.lineTo(0, 22); ctx.lineTo(5, 13); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const bounce = motion ? Math.max(0, Math.sin(t * 6 - i * 0.7)) * 4 : 0;
      ctx.fillStyle = '#3e2417';
      ctx.beginPath(); ctx.arc((i - 1) * 12, -bounce, 3.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

const ACTION_BADGE: Record<ActionType, { icon: string; label: string; color: string }> = {
  MOVE_UP: { icon: '▲', label: 'MOVE', color: '#9fd3ff' },
  MOVE_DOWN: { icon: '▼', label: 'MOVE', color: '#9fd3ff' },
  COVER: { icon: '⛨', label: 'COVER', color: '#8fe3c4' },
  RELOAD: { icon: '⟳', label: 'RELOAD', color: '#ffd875' },
  SHOOT_STRAIGHT: { icon: '➤', label: 'FIRE', color: '#ff9b7a' },
  SHOOT_UP: { icon: '➚', label: 'FIRE', color: '#ff9b7a' },
  SHOOT_DOWN: { icon: '➘', label: 'FIRE', color: '#ff9b7a' },
  NONE: { icon: '…', label: 'FROZE', color: '#b8b0a4' },
};

/** Resolution: pops each player's chosen action above their head. */
export function drawActionBadge(ctx: CanvasRenderingContext2D, L: Layout, x: number, headY: number, p: Player, age: number, override?: { label: string; color: string }) {
  if (age < 0) return;
  const s = Math.max(0.75, L.s);
  const b = ACTION_BADGE[p.currentAction];
  const label = override?.label ?? b.label;
  const color = override?.color ?? b.color;
  const pop = age < 0.25 ? easeOutBack(age / 0.25) : 1;
  const facing = facingOf(p.team);
  let icon = b.icon;
  if (p.currentAction.startsWith('SHOOT') && facing < 0) icon = p.currentAction === 'SHOOT_UP' ? '➚' : p.currentAction === 'SHOOT_DOWN' ? '➘' : '➤';
  ctx.save();
  ctx.translate(x, headY);
  ctx.scale(pop * s, pop * s);
  ctx.font = `bold 18px ${FONT.mono}`;
  const w = ctx.measureText(label).width + 50;
  ctx.fillStyle = 'rgba(14,9,6,0.92)'; ctx.strokeStyle = color; ctx.lineWidth = 3;
  roundRect(ctx, -w / 2, -17, w, 34, 9); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-7, 16); ctx.lineTo(0, 25); ctx.lineTo(7, 16); ctx.fillStyle = color; ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.save();
  ctx.translate(-w / 2 + 19, 1);
  if (facing < 0 && p.currentAction.startsWith('SHOOT')) ctx.scale(-1, 1);
  ctx.font = `bold 20px system-ui, sans-serif`;
  ctx.fillText(icon, 0, 0);
  ctx.restore();
  ctx.font = `bold 18px ${FONT.mono}`;
  ctx.fillText(label, 13, 1);
  ctx.restore();
}

/** Shield over a barrel that is actively protecting someone, or a warning if it's gone. */
export function drawCoverTag(ctx: CanvasRenderingContext2D, L: Layout, x: number, feet: number, covered: boolean, noCover: boolean, t: number) {
  if (!covered && !noCover) return;
  const s = Math.max(0.75, L.s);
  const y = feet - barrelHeight(L) - 44 * L.s;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (covered) {
    ctx.fillStyle = 'rgba(14,30,26,0.9)'; ctx.strokeStyle = '#8fe3c4'; ctx.lineWidth = 2.5;
    roundRect(ctx, -52, -14, 104, 28, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8fe3c4'; ctx.font = `bold 16px ${FONT.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⛨ SAFE', 0, 1);
  } else {
    const k = 1 + Math.sin(t * 10) * 0.06;
    ctx.scale(k, k);
    ctx.fillStyle = 'rgba(60,10,8,0.92)'; ctx.strokeStyle = '#ff6a55'; ctx.lineWidth = 2.5;
    roundRect(ctx, -70, -14, 140, 28, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff8a75'; ctx.font = `bold 16px ${FONT.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚠ NO COVER', 0, 1);
  }
  ctx.restore();
}

export const headY = (L: Layout, f: ActorFrame) => f.feet - 128 * L.s * (1 - f.cover * 0.3) - 26 * L.s;
export { COL };
