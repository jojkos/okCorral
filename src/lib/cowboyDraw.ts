import type { Team } from '../../shared/types';

export const COL = {
  sheriff: '#3a6fb5',
  sheriffDark: '#1f3d6b',
  sheriffLight: '#8ab3de',
  outlaw: '#b53a3a',
  outlawDark: '#6b1f1f',
  outlawLight: '#de8a8a',
  wood: '#6b4423',
  woodDark: '#3e2417',
  woodLight: '#a06a3d',
  gold: '#e0b04a',
  goldBright: '#ffd875',
  bone: '#f4e9d6',
  ink: '#1a0e08',
  blood: '#a11b1b',
} as const;

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawRevolver(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#2a2420';
  ctx.fillRect(0, -3, 18, 7);
  ctx.fillStyle = '#1a1612';
  ctx.fillRect(14, -2, 10, 5);
  ctx.fillStyle = '#3a3430';
  ctx.beginPath();
  ctx.arc(6, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1612';
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.arc(6 + Math.cos(a) * 2.5, Math.sin(a) * 2.5, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#6b3a1a';
  ctx.beginPath();
  ctx.moveTo(-2, 3);
  ctx.lineTo(6, 3);
  ctx.lineTo(4, 13);
  ctx.lineTo(-4, 11);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(0, -3, 18, 1);
  ctx.restore();
}

// drawCowboy is self-contained: caller sets up transform (position/scale).
// time (seconds) drives idle sway; seed shifts sway phase per-character.
export function drawCowboy(
  ctx: CanvasRenderingContext2D,
  team: Team,
  facing: 1 | -1,
  time: number,
  seed = 0,
) {
  const isSheriff = team === 'sheriffs';
  const primary = isSheriff ? COL.sheriff : COL.outlaw;
  const primaryDark = isSheriff ? COL.sheriffDark : COL.outlawDark;
  const primaryLight = isSheriff ? COL.sheriffLight : COL.outlawLight;

  ctx.save();
  ctx.scale(facing * 0.9, 0.9);

  const sway = Math.sin(time * 1.5 + seed) * 2;
  ctx.translate(0, sway);

  // Legs + boots
  ctx.fillStyle = '#3a2818';
  ctx.fillRect(-14, 22, 11, 38);
  ctx.fillRect(3, 22, 11, 38);
  ctx.fillStyle = '#1a0e08';
  ctx.fillRect(-16, 54, 15, 10);
  ctx.fillRect(1, 54, 15, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(-16, 54, 15, 2);
  ctx.fillRect(1, 54, 15, 2);

  // Torso + vest
  ctx.fillStyle = primaryDark;
  roundRect(ctx, -22, -12, 44, 40, 6);
  ctx.fill();
  ctx.fillStyle = primary;
  roundRect(ctx, -18, -10, 36, 32, 5);
  ctx.fill();
  // Belt + buckle
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(-22, 22, 44, 6);
  ctx.fillStyle = COL.gold;
  ctx.fillRect(-4, 22, 8, 6);

  // Badge or bandana-X
  if (isSheriff) {
    drawStar(ctx, -8, 0, 6, 3, COL.goldBright);
  } else {
    ctx.strokeStyle = COL.bone;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-12, -4); ctx.lineTo(-2, 6);
    ctx.moveTo(-2, -4); ctx.lineTo(-12, 6);
    ctx.stroke();
  }

  // Front arm + gun hand
  ctx.fillStyle = primaryDark;
  ctx.fillRect(6, -6, 26, 10);
  ctx.fillStyle = '#d9b38c';
  ctx.fillRect(30, -7, 8, 12);
  drawRevolver(ctx, 34, -2);

  // Rear arm
  ctx.fillStyle = primary;
  ctx.fillRect(-26, -6, 18, 10);

  // Neck
  ctx.fillStyle = '#d9b38c';
  ctx.fillRect(-6, -22, 12, 12);

  // Head
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath();
  ctx.arc(0, -30, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(-14, -34, 28, 8);
  ctx.fillStyle = '#1a0e08';
  ctx.fillRect(-6, -29, 3, 1.5);
  ctx.fillRect(3, -29, 3, 1.5);
  if (!isSheriff) {
    ctx.fillStyle = '#1a0e08';
    ctx.fillRect(-6, -22, 12, 2);
    ctx.fillRect(-7, -22, 2, 3);
    ctx.fillRect(5, -22, 2, 3);
  }

  // Bandana
  ctx.fillStyle = primary;
  ctx.fillRect(-9, -20, 18, 5);
  ctx.fillStyle = primaryLight;
  ctx.fillRect(-9, -20, 18, 1);

  // Hat
  ctx.fillStyle = isSheriff ? '#5a3a1a' : '#1a0e08';
  ctx.beginPath();
  ctx.ellipse(0, -40, 22, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, -10, -54, 20, 14, 3);
  ctx.fill();
  ctx.fillStyle = isSheriff ? COL.goldBright : COL.outlawDark;
  ctx.fillRect(-10, -44, 20, 2);

  ctx.restore();
}
