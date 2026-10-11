import type { Barrel, Team } from '../../../shared/types';
import { COL, roundRect } from '../../lib/cowboyDraw';
import { CANVAS_H, CANVAS_W, FONT, Layout, TEAM_COL, barrelHeight, rand } from './layout';

export function drawBackground(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, t: number) {
  const pad = 60;
  if (img && img.complete && img.naturalWidth) {
    ctx.drawImage(img, -pad, -pad, CANVAS_W + pad * 2, CANVAS_H + pad * 2);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    g.addColorStop(0, '#152e3b'); g.addColorStop(0.55, '#66565b'); g.addColorStop(1, '#2a2524');
    ctx.fillStyle = g; ctx.fillRect(-pad, -pad, CANVAS_W + pad * 2, CANVAS_H + pad * 2);
  }
  // Heat shimmer over the horizon + darken the play area so actors pop.
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, 'rgba(10,22,30,0.25)');
  g.addColorStop(0.35, 'rgba(14,24,30,0.38)');
  g.addColorStop(1, 'rgba(8,14,18,0.72)');
  ctx.fillStyle = g; ctx.fillRect(-pad, -pad, CANVAS_W + pad * 2, CANVAS_H + pad * 2);
  // Slow drifting clouds for life.
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#f6d7ae';
  for (let i = 0; i < 4; i++) {
    const x = ((rand(i * 13) * CANVAS_W + t * (6 + i * 3)) % (CANVAS_W + 400)) - 200;
    const y = 70 + i * 28;
    ctx.beginPath(); ctx.ellipse(x, y, 160 + i * 30, 12 + i * 3, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Boardwalk under each team column + dusty main street between them. */
export function drawLanes(ctx: CanvasRenderingContext2D, L: Layout, threatened: Set<string>) {
  ctx.save();
  // Street dust band
  const street = ctx.createLinearGradient(0, L.top, 0, L.top + L.slotHeight * L.n);
  street.addColorStop(0, 'rgba(160,112,72,0.10)');
  street.addColorStop(1, 'rgba(120,80,50,0.22)');
  ctx.fillStyle = street;
  ctx.fillRect(470, L.top, 660, L.slotHeight * L.n);

  for (let i = 0; i < L.n; i++) {
    const y0 = L.top + L.slotHeight * i;
    const h = L.slotHeight;
    for (const team of ['sheriffs', 'outlaws'] as Team[]) {
      const x0 = team === 'sheriffs' ? 40 : 1130;
      const w = 430;
      // Planks
      const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
      g.addColorStop(0, i % 2 ? 'rgba(74,50,34,0.55)' : 'rgba(84,58,38,0.60)');
      g.addColorStop(1, 'rgba(40,26,18,0.72)');
      ctx.fillStyle = g;
      roundRect(ctx, x0, y0 + 3, w, h - 6, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        const py = y0 + 3 + ((h - 6) * k) / 4;
        ctx.beginPath(); ctx.moveTo(x0 + 8, py); ctx.lineTo(x0 + w - 8, py); ctx.stroke();
      }
      // Quiet wood details at the plank ends; keep the player lane uncluttered.
      for (let k = 0; k < 4; k++) {
        const py = y0 + 3 + (h - 6) * (k + 0.5) / 4;
        ctx.strokeStyle = 'rgba(223,170,106,0.10)';
        ctx.beginPath();
        ctx.moveTo(x0 + 14, py + 3); ctx.lineTo(x0 + 65 + rand(i * 17 + k) * 38, py + 2);
        ctx.moveTo(x0 + w - 85, py - 4); ctx.lineTo(x0 + w - 14, py - 3);
        ctx.stroke();
        for (const nx of [x0 + 11, x0 + w - 11]) {
          ctx.fillStyle = 'rgba(8,12,14,0.46)';
          ctx.beginPath(); ctx.arc(nx, py, 2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(241,191,130,0.16)';
          ctx.fillRect(nx - 1, py - 1, 2, 1);
        }
      }
      // Sunlit street lip and a soft contact shadow below its raised edge.
      const edgeX = team === 'sheriffs' ? x0 + w : x0;
      const contact = ctx.createLinearGradient(edgeX - 10, 0, edgeX + 10, 0);
      contact.addColorStop(team === 'sheriffs' ? 0 : 1, 'rgba(12,13,13,0.30)');
      contact.addColorStop(team === 'sheriffs' ? 1 : 0, 'rgba(12,13,13,0)');
      ctx.fillStyle = contact;
      ctx.fillRect(edgeX - 10, y0 + 8, 20, h - 16);
      ctx.fillStyle = 'rgba(221,166,101,0.27)';
      ctx.fillRect(team === 'sheriffs' ? edgeX - 6 : edgeX + 3, y0 + 8, 3, h - 16);
      // Team-tinted edge facing the street
      ctx.fillStyle = TEAM_COL[team].glow + '0.35)';
      ctx.fillRect(team === 'sheriffs' ? x0 + w - 4 : x0, y0 + 6, 4, h - 12);
      if (threatened.has(`${team}-${i}`)) {
        ctx.fillStyle = 'rgba(255,90,60,0.10)';
        roundRect(ctx, x0, y0 + 3, w, h - 6, 10); ctx.fill();
      }
    }
    // Lane number in the street, faint, for callouts ("lane 3").
    ctx.fillStyle = 'rgba(240,215,175,0.16)';
    ctx.font = `bold ${Math.round(Math.min(44, h * 0.42))}px ${FONT.title}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), L.midX, L.ys[i]);
    ctx.strokeStyle = 'rgba(239,206,159,0.12)'; ctx.lineWidth = 2; ctx.setLineDash([6, 14]);
    ctx.beginPath(); ctx.moveTo(500, L.ys[i]); ctx.lineTo(L.midX - 40, L.ys[i]); ctx.moveTo(L.midX + 40, L.ys[i]); ctx.lineTo(1100, L.ys[i]); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

export interface BarrelLook {
  /** 0..1 — someone is crouched behind this barrel. */
  cover: number;
  team: Team;
  /** Recently hit → wobble. */
  wobble: number;
  /** Covered but barrel already broken — show warning. */
  t: number;
}

/** Barrel anchored with its base on the boardwalk at (x, feetY). */
export function drawBarrel(ctx: CanvasRenderingContext2D, L: Layout, x: number, feetY: number, barrel: Barrel | undefined, look: BarrelLook) {
  if (!barrel) return;
  const s = L.s;
  const h = barrelHeight(L);
  const w = 62 * s;
  const hp = barrel.hp;
  ctx.save();
  ctx.translate(x, feetY);
  if (look.wobble > 0) ctx.rotate(Math.sin(look.t * 50) * 0.06 * look.wobble);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(0, 0, w * 0.62, 7 * s, 0, 0, Math.PI * 2); ctx.fill();

  if (hp <= 0) {
    // Pile of broken staves + a lone hoop.
    ctx.fillStyle = COL.woodDark;
    ctx.beginPath(); ctx.ellipse(0, -3 * s, w * 0.55, 8 * s, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.translate((-24 + i * 10) * s, -6 * s);
      ctx.rotate((rand(i * 7 + barrel.slot) - 0.5) * 1.4);
      ctx.fillStyle = i % 2 ? COL.wood : COL.woodLight;
      ctx.fillRect(-3 * s, -16 * s, 7 * s, 18 * s);
      ctx.restore();
    }
    ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.ellipse(10 * s, -4 * s, 16 * s, 5 * s, 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    return;
  }

  // Lean a little more as it takes damage.
  ctx.rotate((3 - hp) * 0.035 * (barrel.team === 'sheriffs' ? 1 : -1));

  // Cover glow: unmistakable team-coloured halo when someone hides here.
  if (look.cover > 0.02) {
    ctx.save();
    ctx.globalAlpha = look.cover;
    ctx.shadowColor = TEAM_COL[look.team].main;
    ctx.shadowBlur = 26 * s;
    ctx.strokeStyle = TEAM_COL[look.team].main;
    ctx.lineWidth = 4 * s;
    roundRect(ctx, -w / 2 - 4 * s, -h - 6 * s, w + 8 * s, h + 8 * s, 14 * s); ctx.stroke();
    ctx.restore();
  }

  const body = hp === 3 ? COL.wood : hp === 2 ? '#5a371e' : '#45291a';
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, COL.woodDark); g.addColorStop(0.45, body); g.addColorStop(0.6, COL.woodLight); g.addColorStop(1, COL.woodDark);
  ctx.fillStyle = g;
  // Bulging barrel silhouette
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, 0);
  ctx.quadraticCurveTo(-w * 0.58, -h / 2, -w * 0.42, -h);
  ctx.lineTo(w * 0.42, -h);
  ctx.quadraticCurveTo(w * 0.58, -h / 2, w * 0.42, 0);
  ctx.closePath();
  ctx.fill();
  // Staves
  ctx.strokeStyle = 'rgba(0,0,0,0.32)'; ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(i * w * 0.16, -2); ctx.quadraticCurveTo(i * w * 0.2, -h / 2, i * w * 0.16, -h + 2); ctx.stroke();
  }
  // Hoops
  ctx.fillStyle = '#2a2420';
  for (const f of [0.2, 0.78]) { ctx.fillRect(-w * 0.55, -h * f - 3 * s, w * 1.1, 6 * s); }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (const f of [0.2, 0.78]) { ctx.fillRect(-w * 0.55, -h * f - 3 * s, w * 1.1, 1.5); }
  // Lid
  ctx.fillStyle = COL.woodLight;
  ctx.beginPath(); ctx.ellipse(0, -h, w * 0.42, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COL.woodDark;
  ctx.beginPath(); ctx.ellipse(0, -h, w * 0.34, 5 * s, 0, 0, Math.PI * 2); ctx.fill();

  // Damage: bullet holes and cracks that read from across the room.
  if (hp < 3) {
    ctx.fillStyle = '#120a06';
    ctx.beginPath(); ctx.arc(-10 * s, -h * 0.5, 4.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#120a06'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(-10 * s, -h * 0.5); ctx.lineTo(-18 * s, -h * 0.62); ctx.moveTo(-10 * s, -h * 0.5); ctx.lineTo(-4 * s, -h * 0.36); ctx.stroke();
  }
  if (hp < 2) {
    ctx.fillStyle = '#120a06';
    ctx.beginPath(); ctx.arc(12 * s, -h * 0.32, 5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#120a06'; ctx.lineWidth = 2.5 * s;
    ctx.beginPath(); ctx.moveTo(12 * s, -h * 0.95); ctx.lineTo(6 * s, -h * 0.6); ctx.lineTo(14 * s, -h * 0.4); ctx.lineTo(8 * s, -h * 0.05); ctx.stroke();
    // Missing chunk off the lid
    ctx.fillStyle = 'rgba(10,6,4,0.9)';
    ctx.beginPath(); ctx.moveTo(w * 0.1, -h - 4 * s); ctx.lineTo(w * 0.42, -h - 2 * s); ctx.lineTo(w * 0.38, -h + 12 * s); ctx.closePath(); ctx.fill();
  }

  // HP notches on the barrel's belly — readable even with someone crouched behind.
  const pw = 13 * s, ph = 10 * s;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, -pw * 2.4, -h * 0.5 - ph * 0.9, pw * 4.8, ph * 1.8, 4); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const px = (i - 1) * pw * 1.5;
    ctx.fillStyle = i < hp ? COL.goldBright : 'rgba(40,30,24,0.9)';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1.5;
    roundRect(ctx, px - pw / 2, -h * 0.5 - ph / 2, pw, ph, 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

export function drawVignette(ctx: CanvasRenderingContext2D, danger: number) {
  const g = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.32, CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.9);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, danger > 0 ? `rgba(120,10,10,${0.25 + danger * 0.35})` : 'rgba(6,14,20,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(-60, -60, CANVAS_W + 120, CANVAS_H + 120);
}
