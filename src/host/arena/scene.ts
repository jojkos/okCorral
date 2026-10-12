import type { Barrel, StrongWindState, Team, WalkingWomanState } from '../../../shared/types';
import { drawDeadWoman, drawGatlingWheelMarks, drawWomanBloodTrail } from './womanRemains';
import { drawAliveWoman } from './womanWalking';
import { COL, roundRect } from '../../lib/cowboyDraw';
import { CANVAS_H, CANVAS_W, Layout, TEAM_COL, barrelHeight, bulletLaneFeet, rand, womanScale } from './layout';


export function drawBackground(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, t: number) {
  const pad = 60;
  if (img && img.complete && img.naturalWidth) {
    ctx.drawImage(img, -pad, -pad, CANVAS_W + pad * 2, CANVAS_H + pad * 2);
  } else {
    const earth = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    earth.addColorStop(0, '#bda17a'); earth.addColorStop(1, '#927047');
    ctx.fillStyle = earth; ctx.fillRect(-pad, -pad, CANVAS_W + pad * 2, CANVAS_H + pad * 2);
    ctx.fillStyle = '#66553f';
    ctx.fillRect(-pad, -pad, 530, CANVAS_H + pad * 2);
    ctx.fillRect(1135, -pad, 525, CANVAS_H + pad * 2);
  }
  // Warm late-afternoon light. Keep the dirt bright enough for silhouettes,
  // blood and bullet trails to share a readable ground plane.
  const shade = ctx.createLinearGradient(0, 110, 0, CANVAS_H);
  shade.addColorStop(0, 'rgba(43,36,29,0.08)');
  shade.addColorStop(0.55, 'rgba(43,36,29,0.02)');
  shade.addColorStop(1, 'rgba(34,30,25,0.13)');
  ctx.fillStyle = shade; ctx.fillRect(-pad, -pad, CANVAS_W + pad * 2, CANVAS_H + pad * 2);
  ctx.save();
  ctx.beginPath(); ctx.rect(480, 130, 640, CANVAS_H); ctx.clip();
  for (let i = 0; i < 3; i++) {
    const x = 520 + ((t * (7 + i * 2) + i * 219) % 750);
    const y = 290 + i * 220;
    const haze = ctx.createRadialGradient(x, y, 5, x, y, 100);
    haze.addColorStop(0, 'rgba(245,222,174,0.07)'); haze.addColorStop(1, 'rgba(245,222,174,0)');
    ctx.save(); ctx.translate(0, y); ctx.scale(1, 0.2); ctx.translate(0, -y);
    ctx.fillStyle = haze; ctx.fillRect(x - 100, y - 100, 200, 200); ctx.restore();
  }
  ctx.restore();
}

/** Dust and tumbleweeds live in the arena layer, behind the gunfighters. */
export function drawStrongWindWeather(ctx: CanvasRenderingContext2D, L: Layout, wind: StrongWindState, t: number, motion: boolean) {
  if (wind.phase === 'calm' || !wind.direction) return;
  const active = wind.phase === 'active';
  const dir = wind.direction === 'up' ? -1 : 1;
  const speed = motion ? (active ? 150 : 24) : 0;
  const span = L.slotHeight * L.n + 180;
  const wrap = (v: number) => ((v % span) + span) % span;

  ctx.save();
  ctx.beginPath();
  ctx.rect(472, L.top - 10, 656, L.slotHeight * L.n + 20);
  ctx.clip();

  // Dry, hand-drawn dust streaks make the strong phase visibly harsher.
  if (active) {
    ctx.lineCap = 'round';
    for (let i = 0; i < 13; i++) {
      const x = 500 + rand(i * 41 + 8) * 600;
      const base = rand(i * 53 + 17) * span;
      const y = L.top - 90 + wrap(base + t * speed * dir);
      const len = 50 + rand(i * 19) * 110;
      ctx.globalAlpha = 0.3 + rand(i * 7) * 0.22;
      const width = 2 + rand(i * 29) * 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 12, y + dir * len * 0.45, x - 8, y + dir * len);
      // Two-tone dust stays readable on the bright street, including rain.
      ctx.strokeStyle = '#80603c'; ctx.lineWidth = width + 2;
      ctx.stroke();
      ctx.strokeStyle = '#f4d69d'; ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  // The warning already reveals direction, but rolls much more gently.
  for (let i = 0; i < (active ? 5 : 3); i++) {
    const x = 560 + rand(i * 67 + 4) * 480;
    const base = rand(i * 37 + 3) * span;
    const y = L.top - 90 + wrap(base + t * speed * dir);
    const r = (active ? 24 : 19) + rand(i * 23) * 10;
    drawTumbleweed(ctx, x, y, r, motion ? t * dir * (active ? 4.5 : 1.1) + i : i, active ? 1 : 0.8, i + 1);
  }
  ctx.restore();
}


/** A clearly neutral civilian walking down the middle of the firing lanes. */
export function drawWalkingWoman(ctx: CanvasRenderingContext2D, L: Layout, woman: WalkingWomanState, t: number, motion: boolean, roundProgress: number, crush?: { fall: number; compression: number; dust: number }) {
  const s = womanScale(L);
  const headSide = woman.killedFromTeam === 'outlaws' ? -1 : 1;
  const targetFeet = woman.slot === null ? null : bulletLaneFeet(L, woman.slot);
  const fromFeet = woman.fromSlot === null ? targetFeet : bulletLaneFeet(L, woman.fromSlot);
  const feet = targetFeet === null || fromFeet === null
    ? null
    : fromFeet + (targetFeet - fromFeet) * roundProgress;
  drawGatlingWheelMarks(ctx, L, woman, feet);
  drawWomanBloodTrail(ctx, L, woman, s, headSide, roundProgress);
  if (woman.phase === 'inactive' || woman.phase === 'gone' || woman.slot === null || feet === null) return;
  const stride = motion && woman.phase === 'walking' ? Math.sin(t * 5.5) : 0;

  if (woman.phase === 'dead') {
    const fall = crush?.fall ?? 1;
    if (fall < 1) {
      ctx.save(); ctx.translate(L.midX - headSide * 35 * s * fall, feet);
      ctx.rotate(headSide * fall * Math.PI / 2); ctx.globalAlpha *= 1 - fall;
      drawAliveWoman(ctx, s, 0); ctx.restore();
    }
    ctx.save(); ctx.globalAlpha *= fall;
    drawDeadWoman(ctx, L.midX, feet, s, headSide, crush?.compression ?? !!woman.crushedByGatling);
    ctx.restore();
    if (crush && crush.dust > 0) {
      ctx.save();
      for (let i = 0; i < 9; i++) {
        const drift = 1 - crush.dust, side = i % 2 ? 1 : -1;
        ctx.globalAlpha = crush.dust * (0.12 + rand(i * 17) * 0.13);
        ctx.fillStyle = '#c4a273'; ctx.beginPath();
        ctx.ellipse(L.midX + side * (25 + drift * (30 + i * 3)) * s, feet - (5 + drift * 15) * s,
          (7 + drift * 13) * s, (3 + drift * 7) * s, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    return;
  }

  ctx.save();
  ctx.translate(L.midX, feet);
  ctx.fillStyle = 'rgba(5,10,12,0.42)';
  ctx.beginPath(); ctx.ellipse(0, 1 * s, 35 * s, 9 * s, 0, 0, Math.PI * 2); ctx.fill();
  drawAliveWoman(ctx, s, stride);
  ctx.restore();
}


function drawTumbleweed(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rotation: number, alpha: number, seed: number) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(1.08, 0.86); ctx.globalAlpha = alpha;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(58,38,20,0.3)'; ctx.shadowBlur = 2;

  // Several broken, lopsided loops form a thorny ball. Deliberately avoid a
  // clean outer rim, radial spokes or a centre hub — those read as a wheel.
  for (let strand = 0; strand < 4; strand++) {
    const points = 11;
    ctx.strokeStyle = strand % 2 ? '#8b5a31' : '#b27a42';
    ctx.lineWidth = 1.6 + strand * 0.35;
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const a = (Math.PI * 2 * i) / points + strand * 0.47;
      const wobble = 0.68 + rand(seed * 101 + strand * 29 + (i % points) * 13) * 0.34;
      const dent = 1 + Math.sin(a * 3 + seed + strand) * 0.11 + Math.cos(a * 5 - strand) * 0.07;
      const px = Math.cos(a) * r * wobble * dent + (strand - 1.5) * 1.5;
      const py = Math.sin(a) * r * wobble / dent;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // Loose branches criss-cross at unrelated angles instead of meeting in the
  // middle. A few ends poke outside the tangled silhouette.
  for (let i = 0; i < 10; i++) {
    const a = rand(seed * 211 + i * 31) * Math.PI * 2;
    const b = a + 1.2 + rand(seed * 307 + i * 17) * 2.6;
    const c = a - 0.7 + rand(seed * 419 + i * 23) * 1.4;
    const startR = r * (0.35 + rand(seed * 503 + i * 7) * 0.48);
    const endR = r * (0.45 + rand(seed * 601 + i * 11) * 0.65);
    ctx.strokeStyle = i % 3 ? '#9b6838' : '#c08a4b';
    ctx.lineWidth = 1.4 + rand(seed * 701 + i * 19) * 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * startR, Math.sin(a) * startR);
    ctx.bezierCurveTo(
      Math.cos(c) * r * 0.18, Math.sin(c) * r * 0.18,
      Math.cos(b - 0.5) * r * 0.58, Math.sin(b - 0.5) * r * 0.58,
      Math.cos(b) * endR, Math.sin(b) * endR,
    );
    ctx.stroke();
  }

  // Sparse curled tips sell dry brush rather than a geometric symbol.
  ctx.strokeStyle = '#c49355'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const a = rand(seed * 809 + i * 43) * Math.PI * 2;
    const sx = Math.cos(a) * r * 0.72, sy = Math.sin(a) * r * 0.72;
    ctx.beginPath(); ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(Math.cos(a + 0.45) * r * 1.12, Math.sin(a + 0.45) * r * 1.12, Math.cos(a + 0.15) * r * 1.02, Math.sin(a + 0.15) * r * 1.02);
    ctx.stroke();
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
  const w = 74 * s;
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

  const body = hp === 3 ? '#927042' : hp === 2 ? '#795932' : '#604426';
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, '#493a29'); g.addColorStop(0.36, body); g.addColorStop(0.57, '#ae8a51'); g.addColorStop(1, '#55412d');
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
  // Iron bands curve around the staves, catching light along the top rim.
  for (const f of [0.2, 0.78]) {
    const bandY = -h * f;
    ctx.fillStyle = '#343732'; ctx.strokeStyle = '#232821'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-w * 0.49, bandY - 4 * s);
    ctx.quadraticCurveTo(0, bandY + 2 * s, w * 0.49, bandY - 4 * s);
    ctx.lineTo(w * 0.49, bandY + 3 * s);
    ctx.quadraticCurveTo(0, bandY + 9 * s, -w * 0.49, bandY + 3 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#7b7d66'; ctx.lineWidth = 1.2 * s;
    ctx.beginPath(); ctx.moveTo(-w * 0.46, bandY - 3 * s); ctx.quadraticCurveTo(0, bandY + 2 * s, w * 0.46, bandY - 3 * s); ctx.stroke();
  }
  // Lid
  ctx.fillStyle = '#bb9960';
  ctx.beginPath(); ctx.ellipse(0, -h, w * 0.42, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#806038';
  ctx.beginPath(); ctx.ellipse(0, -h, w * 0.34, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#51422f'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-w * 0.29, -h - 2 * s); ctx.lineTo(w * 0.29, -h - 2 * s);
  ctx.moveTo(-w * 0.29, -h + 2 * s); ctx.lineTo(w * 0.29, -h + 2 * s); ctx.stroke();

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

  // Three brass pins in the lower hoop communicate the remaining strength.
  for (let i = 0; i < 3; i++) {
    const px = (i - 1) * 15 * s, py = -h * 0.2 + 2 * s;
    ctx.fillStyle = i < hp ? '#e7c579' : '#242721';
    ctx.strokeStyle = '#292a22'; ctx.lineWidth = 1.3 * s;
    ctx.beginPath(); ctx.arc(px, py, 4.2 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (i < hp) { ctx.fillStyle = '#ffe1a2'; ctx.fillRect(px - 1.5 * s, py - 2 * s, 2 * s, 1.2 * s); }
  }
  ctx.restore();
}

export function drawVignette(ctx: CanvasRenderingContext2D, danger: number) {
  const g = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.32, CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.9);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, danger > 0 ? `rgba(120,10,10,${0.25 + danger * 0.35})` : 'rgba(36,28,18,0.24)');
  ctx.fillStyle = g;
  ctx.fillRect(-60, -60, CANVAS_W + 120, CANVAS_H + 120);
}
