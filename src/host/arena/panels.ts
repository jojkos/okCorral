import { roundRect } from '../../lib/cowboyDraw';

/** Dark stained wood with an inset border and small brass mounting pins. */
export function drawWoodPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent: string) {
  ctx.save();
  ctx.fillStyle = 'rgba(17,17,14,0.35)';
  roundRect(ctx, x + 3, y + 5, w, h, 5); ctx.fill();
  const wood = ctx.createLinearGradient(x, y, x, y + h);
  wood.addColorStop(0, '#493b2c'); wood.addColorStop(0.14, '#302a23'); wood.addColorStop(0.8, '#241f1b'); wood.addColorStop(1, '#362b21');
  ctx.fillStyle = wood; ctx.strokeStyle = '#ac8d5b'; ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 5); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(185,151,97,0.11)'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(x + 9, y + h * i / 4); ctx.lineTo(x + w - 9, y + h * i / 4 + 1); ctx.stroke();
  }
  ctx.strokeStyle = accent; ctx.globalAlpha *= 0.6;
  roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 2); ctx.stroke();
  for (const px of [x + 9, x + w - 9]) for (const py of [y + 9, y + h - 9]) {
    ctx.fillStyle = '#c9ac74'; ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
