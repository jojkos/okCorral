import type { Bullet, Team } from '../../../shared/types';
import { flightPoint, type ShotFlight } from '../../../shared/ballistics';
import { drawHat, roundRect } from '../../lib/cowboyDraw';
import { CANVAS_W, FONT, TEAM_COL, easeOutBack, clamp01 } from './layout';

type ParticleKind = 'dot' | 'square' | 'streak' | 'smoke';
export interface Particle {
  kind?: ParticleKind;
  x: number; y: number; vx: number; vy: number;
  drag?: number; gravity?: number; size: number; rot?: number; vr?: number;
  life: number; age: number; color: string; fade?: boolean;
}

const PARTICLE_CAP = 900;
export class ParticleSystem {
  parts: Particle[] = [];
  add(p: Particle) {
    if (this.parts.length >= PARTICLE_CAP) this.parts.shift();
    this.parts.push(p);
  }
  step(dt: number) {
    for (const p of this.parts) {
      p.age += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const d = 1 - (p.drag ?? 1.5) * dt;
      p.vx *= d; p.vy *= d;
      p.vy += (p.gravity ?? 0) * dt;
      if (p.vr) p.rot = (p.rot ?? 0) + p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.age < p.life);
  }
  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.parts) {
      const life = p.age / p.life;
      ctx.globalAlpha = p.fade ? 1 - life : 1;
      ctx.fillStyle = p.color;
      if (p.kind === 'smoke') {
        ctx.globalAlpha = (1 - life) * 0.35;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + life * 2.2), 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'square') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot ?? 0);
        const s = p.size * (1 - life * 0.3);
        ctx.fillRect(-s, -s / 3, s * 2, s * 0.66);
        ctx.restore();
      } else if (p.kind === 'streak') {
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size * (1 - life);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - life * 0.4), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

export interface Muzzle { x: number; y: number; t: number; life: number; dir: number }
export interface BulletAnim extends ShotFlight { id: string; bornAt: number; dur: number; team: Team; hit: Bullet['hit']; source?: Bullet['source'] }
export interface Impact { x: number; y: number; t: number; kind: 'player' | 'barrel' | 'bullet' | 'woman'; lethal?: boolean }
export interface Floater { x: number; y: number; text: string; t: number; color: string; size: number; life: number }
export interface Banner { text: string; sub?: string; t: number; life: number; color: string; size: number; y: number }
export interface FlyingHat { x: number; y: number; vx: number; vy: number; rot: number; vr: number; ground: number; team: Team; appearance?: number; s: number; landed: boolean }
export interface EmoteFx { emoji: string; x: number; y: number; t: number; name: string; team: Team }

export function drawMuzzles(ctx: CanvasRenderingContext2D, list: Muzzle[], t: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    const age = t - m.t;
    if (age > m.life) { list.splice(i, 1); continue; }
    const p = age / m.life;
    const a = 1 - p;
    const size = 36 + p * 60;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(m.x + m.dir * 16, m.y);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    g.addColorStop(0, `rgba(255,248,200,${a})`);
    g.addColorStop(0.3, `rgba(255,190,70,${a * 0.75})`);
    g.addColorStop(1, 'rgba(255,100,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill();
    // Directional flame cone
    ctx.fillStyle = `rgba(255,236,170,${a})`;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(m.dir * size * 1.2, 0); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

export function drawBullets(ctx: CanvasRenderingContext2D, list: BulletAnim[], t: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    const k = (t - b.bornAt) / b.dur;
    if (k > 1) { list.splice(i, 1); continue; }
    if (k < 0) continue;
    const { x, y, dx, dy } = flightPoint(b, k);
    const angle = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    const trail = 140;
    const tg = ctx.createLinearGradient(-trail, 0, 0, 0);
    tg.addColorStop(0, 'rgba(255,220,120,0)');
    tg.addColorStop(1, b.source === 'gatling' ? 'rgba(255,238,145,0.98)' : b.team === 'sheriffs' ? 'rgba(190,255,245,0.95)' : 'rgba(255,215,170,0.95)');
    ctx.fillStyle = tg; ctx.fillRect(-trail, -2.5, trail, 5);
    ctx.fillStyle = '#fffbe8';
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    gg.addColorStop(0, 'rgba(255,210,120,0.9)'); gg.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = gg; ctx.fillRect(-16, -16, 32, 32);
    ctx.restore();
  }
}

export function drawImpacts(ctx: CanvasRenderingContext2D, list: Impact[], t: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const im = list[i];
    const age = t - im.t;
    const life = im.lethal ? 0.9 : 0.55;
    if (age > life) { list.splice(i, 1); continue; }
    const p = age / life;
    ctx.save(); ctx.translate(im.x, im.y);
    ctx.globalCompositeOperation = 'lighter';
    if (im.kind === 'bullet') {
      const r = 26 + p * 90;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(255,255,230,${1 - p})`);
      g.addColorStop(0.5, `rgba(255,210,120,${(1 - p) * 0.6})`);
      g.addColorStop(1, 'rgba(255,100,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,240,180,${1 - p})`; ctx.lineWidth = 4 * (1 - p);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke();
      }
    } else if (im.kind === 'barrel') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(200,140,80,${(1 - p) * 0.55})`;
      ctx.beginPath(); ctx.arc(0, 0, 18 + p * 34, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      const r = 22 + p * (im.lethal ? 110 : 50);
      ctx.strokeStyle = `rgba(255,90,70,${(1 - p) * 0.9})`; ctx.lineWidth = 6 * (1 - p);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,120,90,${(1 - p) * 0.25})`;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

export function drawFloaters(ctx: CanvasRenderingContext2D, list: Floater[], t: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i];
    const age = t - d.t;
    if (age > d.life) { list.splice(i, 1); continue; }
    if (age < 0) continue;
    const p = age / d.life;
    const pop = age < 0.18 ? easeOutBack(age / 0.18) : 1;
    ctx.save();
    ctx.globalAlpha = 1 - Math.pow(p, 3);
    ctx.translate(d.x, d.y - p * 46);
    ctx.scale(pop, pop);
    ctx.font = `bold ${d.size}px ${FONT.mono}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(4, d.size / 5); ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineJoin = 'round';
    ctx.strokeText(d.text, 0, 0);
    ctx.fillStyle = d.color; ctx.fillText(d.text, 0, 0);
    ctx.restore();
  }
}

/** Big centre-screen wooden-sign stamp. */
export function drawBanners(ctx: CanvasRenderingContext2D, list: Banner[], t: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    const age = t - b.t;
    if (age > b.life) { list.splice(i, 1); continue; }
    if (age < 0) continue;
    const inP = clamp01(age / 0.22);
    const outP = clamp01((age - (b.life - 0.3)) / 0.3);
    const scale = (1.7 - 0.7 * easeOutBack(inP)) * (1 - outP * 0.15);
    ctx.save();
    ctx.globalAlpha = inP * (1 - outP);
    ctx.translate(CANVAS_W / 2, b.y);
    ctx.rotate(-0.03);
    ctx.scale(scale, scale);
    ctx.font = `${b.size}px ${FONT.title}`;
    const w = ctx.measureText(b.text).width + 90;
    const h = b.size * 1.35 + (b.sub ? 36 : 0);
    ctx.fillStyle = 'rgba(30,16,8,0.92)';
    ctx.strokeStyle = '#c9965a'; ctx.lineWidth = 4;
    roundRect(ctx, -w / 2, -h / 2, w, h, 10); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(201,150,90,0.35)'; ctx.lineWidth = 2;
    roundRect(ctx, -w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 6); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = b.color;
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowOffsetY = 4;
    ctx.fillText(b.text, 0, b.sub ? -16 : 4);
    if (b.sub) {
      ctx.shadowOffsetY = 0;
      ctx.font = `bold 22px ${FONT.mono}`;
      ctx.fillStyle = '#ead3b0';
      ctx.fillText(b.sub, 0, b.size * 0.55);
    }
    ctx.restore();
  }
}

export function stepHats(list: FlyingHat[], dt: number) {
  for (const h of list) {
    if (h.landed) continue;
    h.vy += 1400 * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt;
    if (h.y >= h.ground) { h.y = h.ground; h.vy *= -0.25; h.vx *= 0.5; h.vr *= 0.4; if (Math.abs(h.vy) < 60) { h.landed = true; h.rot = 0.15 * Math.sign(h.vx || 1); } }
  }
}
export function drawHats(ctx: CanvasRenderingContext2D, list: FlyingHat[]) {
  for (const h of list) {
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.rot); ctx.scale(h.s, h.s);
    drawHat(ctx, h.team, h.appearance);
    ctx.restore();
  }
}

export function drawEmotes(ctx: CanvasRenderingContext2D, list: EmoteFx[], t: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    const age = t - e.t;
    const life = 2.2;
    if (age > life) { list.splice(i, 1); continue; }
    const p = age / life;
    const pop = age < 0.25 ? easeOutBack(age / 0.25) : 1;
    ctx.save();
    ctx.globalAlpha = 1 - Math.pow(p, 4);
    ctx.translate(e.x + Math.sin(age * 5) * 8, e.y - p * 120);
    ctx.scale(pop, pop);
    ctx.fillStyle = 'rgba(20,12,8,0.75)';
    ctx.strokeStyle = TEAM_COL[e.team].main; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = '50px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e.emoji, 0, 3);
    ctx.font = `bold 15px ${FONT.mono}`;
    ctx.fillStyle = TEAM_COL[e.team].text;
    ctx.fillText(e.name.toUpperCase().slice(0, 12), 0, 56);
    ctx.restore();
  }
}
