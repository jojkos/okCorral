import type { GameState, Team } from '../../../shared/types';
import { COL, drawStar, roundRect } from '../../lib/cowboyDraw';
import { CANVAS_W, CANVAS_H, FONT, TEAM_COL, easeOutBack, clamp01 } from './layout';
import { drawWoodPanel } from './panels';

export function drawHUD(ctx: CanvasRenderingContext2D, gs: GameState, timeLeft: number, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, 130);
  g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, CANVAS_W, 130);

  drawTeamBar(ctx, gs, 'sheriffs', 24, 16);
  drawTeamBar(ctx, gs, 'outlaws', CANVAS_W - 24 - 420, 16);

  const cx = CANVAS_W / 2;
  const planning = gs.phase === 'planning';
  const living = gs.players.filter((p) => p.isAlive && p.slot >= 0);
  const ready = living.filter((p) => p.actionLocked).length;
  ctx.save();
  drawWoodPanel(ctx, cx - 300, 14, 600, 98, COL.gold);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = COL.bone; ctx.font = `30px ${FONT.title}`;
  ctx.fillText(`ROUND ${gs.tick}`, cx - 280, 44);
  ctx.font = `bold 17px ${FONT.mono}`;
  ctx.fillStyle = planning ? COL.goldBright : '#ff9b7a';
  ctx.fillText(planning ? 'PICK YOUR MOVE ON YOUR PHONE' : '★ SHOWDOWN ★', cx - 280, 74);

  ctx.textAlign = 'right';
  const secs = planning ? Math.ceil(timeLeft / 1000) : 0;
  const urgent = planning && timeLeft < 3000;
  ctx.font = `bold 54px ${FONT.mono}`;
  ctx.fillStyle = urgent ? '#ff6a55' : COL.bone;
  ctx.fillText(planning ? `${(timeLeft / 1000).toFixed(1)}` : '—', cx + 282, 54);
  if (planning) {
    ctx.font = `bold 16px ${FONT.mono}`;
    ctx.fillStyle = ready === living.length ? '#7ee08a' : '#d7c6ac';
    ctx.fillText(`READY ${ready}/${living.length}`, cx + 282, 92);
  }
  void secs;

  // Timer bar
  const bx = cx - 280, by = 92, bw = 380, bh = 12;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, bx, by, bw, bh, 6); ctx.fill();
  const pct = planning ? clamp01(timeLeft / gs.config.tickDuration) : 1;
  ctx.fillStyle = !planning ? '#c4483a' : urgent ? '#ff6a55' : COL.goldBright;
  if (pct > 0) { roundRect(ctx, bx, by, Math.max(12, bw * pct), bh, 6); ctx.fill(); }
  ctx.restore();

  // Session score and room code along the bottom edge.
  ctx.save();
  ctx.font = `bold 15px ${FONT.mono}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(234,211,176,0.7)';
  const sc = gs.session;
  const score = sc && sc.sheriffs + sc.outlaws + sc.draws > 0 ? `SHERIFFS ${sc.sheriffs} — ${sc.outlaws} OUTLAWS   ·   ` : '';
  ctx.fillText(`${score}ROOM ${gs.roomCode}`, cx, CANVAS_H - 12);
  ctx.restore();
  void t;
}

function drawTeamBar(ctx: CanvasRenderingContext2D, gs: GameState, team: Team, x: number, y: number) {
  const col = TEAM_COL[team];
  const roster = gs.players.filter((p) => p.team === team && p.slot >= 0);
  const alive = roster.filter((p) => p.isAlive).length;
  const w = 420, h = 98;
  ctx.save();
  drawWoodPanel(ctx, x, y, w, h, col.main);
  const right = team === 'outlaws';
  const ix = right ? x + w - 44 : x + 44;
  if (team === 'sheriffs') drawStar(ctx, ix, y + 36, 22, 10, COL.goldBright);
  else drawSkull(ctx, ix, y + 36, 1.2);
  ctx.textBaseline = 'middle';
  ctx.textAlign = right ? 'right' : 'left';
  ctx.font = `30px ${FONT.title}`;
  ctx.fillStyle = col.text;
  ctx.fillText(team === 'sheriffs' ? 'SHERIFFS' : 'OUTLAWS', right ? x + w - 82 : x + 82, y + 36);
  ctx.textAlign = right ? 'left' : 'right';
  ctx.font = `bold 46px ${FONT.mono}`;
  ctx.fillStyle = alive === 0 ? '#8a7d70' : COL.bone;
  ctx.fillText(String(alive), right ? x + 20 : x + w - 20, y + 40);

  // One pip per gunslinger: filled alive, crossed out dead.
  const pipY = y + 76;
  roster.forEach((p, i) => {
    const px = right ? x + w - 50 - i * 34 : x + 50 + i * 34;
    ctx.beginPath(); ctx.arc(px, pipY, 12, 0, Math.PI * 2);
    ctx.fillStyle = p.isAlive ? col.main : '#2a2420'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    if (!p.isAlive) {
      ctx.strokeStyle = '#c4483a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(px - 7, pipY - 7); ctx.lineTo(px + 7, pipY + 7); ctx.moveTo(px + 7, pipY - 7); ctx.lineTo(px - 7, pipY + 7); ctx.stroke();
    } else {
      // Mini HP ticks under the pip
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = k < p.hp ? '#ff5a4f' : 'rgba(0,0,0,0.5)';
        ctx.fillRect(px - 9 + k * 7, pipY + 15, 5, 3);
      }
    }
  });
  ctx.restore();
}

export function drawSkull(ctx: CanvasRenderingContext2D, x: number, y: number, k = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = COL.bone;
  ctx.beginPath(); ctx.arc(0, -2, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(-9, 8, 18, 8);
  ctx.fillStyle = '#1a0e08';
  ctx.beginPath(); ctx.arc(-5, -2, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, -2, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(-1, 3, 2, 4);
  for (const dx of [-7, -2.5, 2, 6.5]) ctx.fillRect(dx, 11, 1.6, 5);
  ctx.restore();
}

/** 3-2-1 in the last seconds of planning. */
export function drawCountdown(ctx: CanvasRenderingContext2D, timeLeft: number, motion: boolean) {
  if (timeLeft <= 0 || timeLeft > 3000) return;
  const n = Math.ceil(timeLeft / 1000);
  const frac = 1 - (timeLeft % 1000) / 1000; // 0 at start of each second
  const k = motion ? easeOutBack(clamp01(frac / 0.25)) : 1;
  ctx.save();
  ctx.translate(CANVAS_W / 2, 470);
  ctx.globalAlpha = 0.85 * (1 - clamp01((frac - 0.6) / 0.4));
  ctx.scale(k * 1.2, k * 1.2);
  ctx.font = `160px ${FONT.title}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
  ctx.strokeText(String(n), 0, 0);
  ctx.fillStyle = n === 1 ? '#ff6a55' : '#ffd875';
  ctx.fillText(String(n), 0, 0);
  ctx.restore();
}

/** A one-line legend for the first couple of rounds. */
export function drawLegend(ctx: CanvasRenderingContext2D, gs: GameState) {
  if (gs.tick > 2) return;
  ctx.save();
  const y = CANVAS_H - 40;
  const items = [
    { c: '#7ee08a', t: '✓ = action locked' },
    { c: '#8fe3c4', t: '⛨ crouched behind barrel = safe' },
    { c: '#ff8a75', t: '⚠ standing / barrel broken = exposed' },
    { c: '#ffd875', t: '● barrel strength' },
  ];
  ctx.font = `bold 15px ${FONT.mono}`;
  const widths = items.map((i) => ctx.measureText(i.t).width + 36);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = CANVAS_W / 2 - total / 2;
  ctx.fillStyle = 'rgba(10,6,4,0.78)';
  roundRect(ctx, x - 14, y - 18, total + 28, 34, 10); ctx.fill();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  items.forEach((it, i) => { ctx.fillStyle = it.c; ctx.fillText(it.t, x + 10, y); x += widths[i]; });
  ctx.restore();
}
