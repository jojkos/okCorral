import { useEffect, useRef } from 'react';
import type { GameState, Player, Barrel, Bullet, Team } from '../../shared/types';
import { playGunshot, playBulletImpact } from '../sound';

interface CanvasArenaProps {
  gameState: GameState;
  bulletsToAnimate: Bullet[] | null;
  onBulletsConsumed?: () => void;
}

const CANVAS_W = 1600;
const CANVAS_H = 900;

const COL = {
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

function rand(seed: number) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

interface Layout {
  ys: number[];
  slotHeight: number;
  sheriffX: number;
  sheriffBarrel: number;
  outlawBarrel: number;
  outlawX: number;
  midX: number;
}

function slotLayout(slotsPerSide: number): Layout {
  const top = 240;
  const bottom = 860;
  const slotHeight = (bottom - top) / slotsPerSide;
  const ys = Array.from({ length: slotsPerSide }, (_, i) => top + slotHeight * (i + 0.5));
  return {
    ys,
    slotHeight,
    sheriffX: 320,
    sheriffBarrel: 560,
    outlawBarrel: 1040,
    outlawX: 1280,
    midX: 800,
  };
}

type ParticleKind = 'dot' | 'square' | 'streak';
interface Particle {
  kind?: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag?: number;
  gravity?: number;
  size: number;
  rot?: number;
  life: number;
  age: number;
  color: string;
  fade?: boolean;
}

const PARTICLE_CAP = 800;
class ParticleSystem {
  parts: Particle[] = [];
  add(p: Particle) {
    if (this.parts.length >= PARTICLE_CAP) this.parts.shift();
    this.parts.push(p);
  }
  step(dt: number) {
    for (const p of this.parts) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - (p.drag ?? 1.5) * dt;
      p.vy *= 1 - (p.drag ?? 1.5) * dt;
      p.vy += (p.gravity ?? 0) * dt;
    }
    this.parts = this.parts.filter((p) => p.age < p.life);
  }
  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.parts) {
      const life = p.age / p.life;
      const alpha = p.fade ? 1 - life : 1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.kind === 'square') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot ?? 0);
        const s = p.size * (1 - life * 0.3);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      } else if (p.kind === 'streak') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * (1 - life);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - life * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

interface PlayerAnim {
  slideFrom?: number;
  slideTo?: number;
  slideStart?: number;
  flinchAt?: number;
  deathAt?: number;
}
interface Muzzle { x: number; y: number; t: number; life: number; dir: number }
interface BulletAnim { id: string; fromX: number; fromY: number; toX: number; toY: number; bornAt: number; dur: number; team: Team; hit: Bullet['hit'] }
interface Impact { x: number; y: number; t: number; kind: 'player' | 'barrel' | 'bullet'; team: Team }
interface DamageNum { x: number; y: number; text: string; t: number; color: string }
interface DustMote { x: number; y: number; r: number; vx: number; vy: number; a: number }

interface AnimState {
  particles: ParticleSystem;
  bullets: BulletAnim[];
  muzzles: Muzzle[];
  impacts: Impact[];
  damages: DamageNum[];
  shake: { x: number; y: number; mag: number; until: number };
  flash: number;
  t: number;
  playerAnim: Record<string, PlayerAnim>;
  ambient: DustMote[];
  timeLeft: number;
}

export default function CanvasArena({ gameState, bulletsToAnimate, onBulletsConsumed }: CanvasArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const animRef = useRef<number | null>(null);
  const gsRef = useRef<GameState>(gameState);
  const stateRef = useRef<AnimState>({
    particles: new ParticleSystem(),
    bullets: [],
    muzzles: [],
    impacts: [],
    damages: [],
    shake: { x: 0, y: 0, mag: 0, until: 0 },
    flash: 0,
    t: 0,
    playerAnim: {},
    ambient: [],
    timeLeft: 0,
  });

  useEffect(() => { gsRef.current = gameState; }, [gameState]);

  useEffect(() => {
    const img = new Image();
    img.src = '/bg-saloon.png';
    img.onload = () => { bgRef.current = img; };
  }, []);

  useEffect(() => {
    const st = stateRef.current;
    for (let i = 0; i < 60; i++) {
      st.ambient.push({
        x: rand(i * 17) * CANVAS_W,
        y: rand(i * 31) * CANVAS_H,
        r: 0.5 + rand(i * 7) * 2,
        vx: (rand(i * 3) - 0.5) * 8,
        vy: -2 - rand(i * 5) * 6,
        a: 0.1 + rand(i * 11) * 0.3,
      });
    }
  }, []);

  const prevPlayersRef = useRef<Record<string, { slot: number; hp: number; isAlive: boolean }>>({});
  useEffect(() => {
    const prev = prevPlayersRef.current;
    const next: typeof prev = {};
    const st = stateRef.current;
    for (const p of gameState.players) {
      const last = prev[p.id];
      if (last && last.slot !== p.slot) {
        st.playerAnim[p.id] = {
          ...(st.playerAnim[p.id] || {}),
          slideFrom: last.slot,
          slideTo: p.slot,
          slideStart: st.t,
        };
      }
      if (last && last.hp > p.hp) {
        st.playerAnim[p.id] = { ...(st.playerAnim[p.id] || {}), flinchAt: st.t };
      }
      if (last && last.isAlive && !p.isAlive) {
        st.playerAnim[p.id] = { ...(st.playerAnim[p.id] || {}), deathAt: st.t };
      }
      next[p.id] = { slot: p.slot, hp: p.hp, isAlive: p.isAlive };
    }
    prevPlayersRef.current = next;
  }, [gameState.players]);

  useEffect(() => {
    if (!bulletsToAnimate || bulletsToAnimate.length === 0) return;
    const st = stateRef.current;
    const L = slotLayout(gameState.config.slotsPerSide);

    st.shake.mag = Math.min(28, 10 + bulletsToAnimate.length * 4);
    st.shake.until = st.t + 0.6;
    st.flash = Math.min(1, 0.25 + bulletsToAnimate.length * 0.1);

    const scheduled: ReturnType<typeof setTimeout>[] = [];
    bulletsToAnimate.forEach((b, i) => {
      const isSheriff = b.fromTeam === 'sheriffs';
      const fromX = isSheriff ? L.sheriffX + 60 : L.outlawX - 60;
      const fromY = L.ys[b.fromSlot];
      let toSlot = b.fromSlot;
      if (b.trajectory === 'up') toSlot -= 1;
      if (b.trajectory === 'down') toSlot += 1;
      toSlot = Math.max(0, Math.min(gameState.config.slotsPerSide - 1, toSlot));
      let toX = isSheriff ? L.outlawX - 60 : L.sheriffX + 60;
      let toY = L.ys[toSlot];

      if (b.hit === 'bullet') {
        toX = (fromX + toX) / 2;
        toY = (fromY + toY) / 2;
      } else if (b.hit === 'barrel') {
        toX = isSheriff ? L.outlawBarrel - 25 : L.sheriffBarrel + 25;
      }

      const launchDelay = i * 0.04;
      scheduled.push(setTimeout(() => {
        playGunshot();
        st.muzzles.push({ x: fromX, y: fromY, t: st.t, life: 0.18, dir: isSheriff ? 1 : -1 });
        for (let k = 0; k < 8; k++) {
          st.particles.add({
            x: fromX + (isSheriff ? 20 : -20),
            y: fromY + (Math.random() - 0.5) * 10,
            vx: (isSheriff ? 1 : -1) * (60 + Math.random() * 120),
            vy: -30 + (Math.random() - 0.5) * 40,
            gravity: -40,
            drag: 0.8,
            size: 6 + Math.random() * 8,
            life: 0.6 + Math.random() * 0.3,
            age: 0,
            color: `rgba(220,210,190,${0.3 + Math.random() * 0.4})`,
            fade: true,
          });
        }
        const speed = 2600;
        const dx = toX - fromX;
        const dy = toY - fromY;
        const dist = Math.hypot(dx, dy);
        const dur = dist / speed;
        st.bullets.push({
          id: `${b.id}-${i}`,
          fromX, fromY, toX, toY,
          bornAt: st.t, dur,
          team: b.fromTeam,
          hit: b.hit,
        });
        scheduled.push(setTimeout(() => {
          playBulletImpact(b.hit);
          if (b.hit !== 'miss') {
            st.impacts.push({ x: toX, y: toY, t: st.t, kind: b.hit as 'player' | 'barrel' | 'bullet', team: b.fromTeam });
            st.shake.mag = Math.max(st.shake.mag, b.hit === 'player' ? 22 : b.hit === 'bullet' ? 18 : 14);
            st.shake.until = Math.max(st.shake.until, st.t + 0.35);

            if (b.hit === 'barrel') {
              for (let k = 0; k < 18; k++) {
                const ang = Math.random() * Math.PI * 2;
                const sp = 180 + Math.random() * 300;
                st.particles.add({
                  kind: 'square',
                  x: toX, y: toY,
                  vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40,
                  gravity: 900, drag: 0.3,
                  size: 3 + Math.random() * 5,
                  rot: Math.random() * Math.PI,
                  life: 0.8 + Math.random() * 0.4, age: 0,
                  color: ['#6b4423', '#3e2417', '#a06a3d', '#8b5a2b'][Math.floor(Math.random() * 4)],
                  fade: true,
                });
              }
            } else if (b.hit === 'player') {
              for (let k = 0; k < 22; k++) {
                const ang = (isSheriff ? 0 : Math.PI) + (Math.random() - 0.5) * 1.6;
                const sp = 120 + Math.random() * 360;
                st.particles.add({
                  x: toX, y: toY,
                  vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 100,
                  gravity: 1100, drag: 0.4,
                  size: 2 + Math.random() * 4,
                  life: 0.7 + Math.random() * 0.5, age: 0,
                  color: `rgba(${(140 + Math.random() * 60) | 0},${(20 + Math.random() * 20) | 0},${(20 + Math.random() * 20) | 0},0.95)`,
                  fade: true,
                });
              }
              st.damages.push({ x: toX, y: toY - 30, text: '-1', t: st.t, color: '#ff4040' });
            } else if (b.hit === 'bullet') {
              for (let k = 0; k < 24; k++) {
                const ang = Math.random() * Math.PI * 2;
                const sp = 200 + Math.random() * 400;
                st.particles.add({
                  kind: 'streak',
                  x: toX, y: toY,
                  vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
                  drag: 1.5,
                  size: 2 + Math.random() * 2,
                  life: 0.35 + Math.random() * 0.2, age: 0,
                  color: ['#ffd875', '#fff3a0', '#ffb347'][Math.floor(Math.random() * 3)],
                  fade: true,
                });
              }
            }
          }
        }, dur * 1000));
      }, launchDelay * 1000));
    });

    const consumeTimer = setTimeout(() => { onBulletsConsumed?.(); }, 1500);
    return () => {
      scheduled.forEach(clearTimeout);
      clearTimeout(consumeTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulletsToAnimate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const gs = gsRef.current;
      st.t += dt;

      if (gs.phase === 'planning' && gs.tickStartTime) {
        const elapsed = Date.now() - gs.tickStartTime;
        st.timeLeft = Math.max(0, gs.config.tickDuration - elapsed);
      } else {
        st.timeLeft = 0;
      }

      st.particles.step(dt);

      for (const m of st.ambient) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y < -5) { m.y = CANVAS_H + 5; m.x = rand(st.t * 1000 + m.r) * CANVAS_W; }
        if (m.x < -5) m.x = CANVAS_W + 5;
        if (m.x > CANVAS_W + 5) m.x = -5;
      }

      const shakeActive = st.t < st.shake.until;
      if (shakeActive) {
        const remaining = Math.max(0, st.shake.until - st.t);
        const decay = remaining / 0.6;
        st.shake.x = (Math.random() - 0.5) * st.shake.mag * decay;
        st.shake.y = (Math.random() - 0.5) * st.shake.mag * decay;
      } else {
        st.shake.x *= 0.8;
        st.shake.y *= 0.8;
      }

      st.flash = Math.max(0, st.flash - dt * 4);

      draw(ctx, gs, st, bgRef.current);
      animRef.current = requestAnimationFrame(frame);
    };
    animRef.current = requestAnimationFrame(frame);
    return () => { if (animRef.current != null) cancelAnimationFrame(animRef.current); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'auto' }}
    />
  );
}

function draw(ctx: CanvasRenderingContext2D, gs: GameState, st: AnimState, bgImg: HTMLImageElement | null) {
  const L = slotLayout(gs.config.slotsPerSide);
  ctx.save();
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.translate(st.shake.x, st.shake.y);

  drawBackground(ctx, bgImg);
  drawVignette(ctx);
  drawFloor(ctx);
  drawLaneGuides(ctx, L);
  drawArena(ctx, L, gs, st);
  drawMuzzles(ctx, st);
  st.particles.draw(ctx);
  drawBullets(ctx, st);
  drawImpacts(ctx, st);
  drawDamages(ctx, st);
  drawDust(ctx, st);

  if (st.flash > 0.01) {
    ctx.fillStyle = `rgba(255,240,200,${st.flash * 0.35})`;
    ctx.fillRect(-50, -50, CANVAS_W + 100, CANVAS_H + 100);
  }

  ctx.restore();
  drawHUD(ctx, gs, st);
}

function drawBackground(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null) {
  const pad = 40;
  if (img && img.complete) {
    ctx.drawImage(img, -pad, -pad, CANVAS_W + pad * 2, CANVAS_H + pad * 2);
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    g.addColorStop(0, 'rgba(20,10,4,0.55)');
    g.addColorStop(0.5, 'rgba(60,30,10,0.15)');
    g.addColorStop(1, 'rgba(10,5,2,0.7)');
    ctx.fillStyle = g;
    ctx.fillRect(-pad, -pad, CANVAS_W + pad * 2, CANVAS_H + pad * 2);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    g.addColorStop(0, '#2a1708');
    g.addColorStop(0.5, '#5a3418');
    g.addColorStop(1, '#1a0a04');
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, CANVAS_W + 80, CANVAS_H + 80);
  }
}

function drawVignette(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.3, CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = g;
  ctx.fillRect(-40, -40, CANVAS_W + 80, CANVAS_H + 80);
}

function drawFloor(ctx: CanvasRenderingContext2D) {
  ctx.save();
  const floorY = 780;
  const g = ctx.createLinearGradient(0, floorY, 0, CANVAS_H);
  g.addColorStop(0, 'rgba(60,35,15,0.0)');
  g.addColorStop(0.3, 'rgba(70,40,18,0.55)');
  g.addColorStop(1, 'rgba(30,15,6,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(-40, floorY, CANVAS_W + 80, CANVAS_H - floorY + 40);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.2;
  for (let x = 40; x < CANVAS_W; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, floorY + 10);
    ctx.lineTo(x + 10, CANVAS_H);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLaneGuides(ctx: CanvasRenderingContext2D, L: Layout) {
  ctx.save();
  ctx.strokeStyle = 'rgba(224,176,74,0.08)';
  ctx.setLineDash([6, 10]);
  ctx.lineWidth = 1;
  L.ys.forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(220, y);
    ctx.lineTo(CANVAS_W - 220, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(224,176,74,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L.midX, 160);
  ctx.lineTo(L.midX, 820);
  ctx.stroke();
  ctx.restore();
}

function drawArena(ctx: CanvasRenderingContext2D, L: Layout, gs: GameState, st: AnimState) {
  for (let s = 0; s < gs.config.slotsPerSide; s++) {
    const y = L.ys[s];
    drawBarrel(ctx, L.sheriffBarrel, y, findBarrel(gs, 'sheriffs', s));
    drawPlayer(ctx, L, y, findPlayer(gs, 'sheriffs', s), 'sheriffs', st, gs);
    drawBarrel(ctx, L.outlawBarrel, y, findBarrel(gs, 'outlaws', s));
    drawPlayer(ctx, L, y, findPlayer(gs, 'outlaws', s), 'outlaws', st, gs);
  }
}

function findPlayer(gs: GameState, team: Team, slot: number): Player | undefined {
  const matches = gs.players.filter((p) => p.team === team && p.slot === slot);
  if (matches.length === 0) return undefined;
  return matches.find((p) => p.isAlive) ?? matches[0];
}
function findBarrel(gs: GameState, team: Team, slot: number): Barrel | undefined {
  return gs.barrels.find((b) => b.team === team && b.slot === slot);
}

function drawBarrel(ctx: CanvasRenderingContext2D, x: number, y: number, barrel: Barrel | undefined) {
  if (!barrel) return;
  ctx.save();
  ctx.translate(x, y + 14);
  ctx.scale(0.72, 0.72);
  const hp = barrel.hp;
  if (hp <= 0) {
    ctx.fillStyle = COL.woodDark;
    ctx.beginPath();
    ctx.ellipse(0, 35, 36, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COL.wood;
    for (let i = 0; i < 5; i++) {
      const px = -25 + i * 12 + Math.sin(i) * 2;
      const h = 8 + (i % 2) * 6;
      ctx.fillRect(px, 35 - h, 8, h);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-30, 27, 60, 10);
    ctx.restore();
    return;
  }

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 50, 42, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyColor = hp === 3 ? COL.wood : hp === 2 ? '#5a371e' : '#3e2417';
  const bodyGrad = ctx.createLinearGradient(-42, 0, 42, 0);
  bodyGrad.addColorStop(0, COL.woodDark);
  bodyGrad.addColorStop(0.5, bodyColor);
  bodyGrad.addColorStop(1, COL.woodDark);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, -40, -45, 80, 90, 12);
  ctx.fill();

  ctx.fillStyle = COL.woodLight;
  ctx.beginPath();
  ctx.ellipse(0, -45, 40, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COL.woodDark;
  ctx.beginPath();
  ctx.ellipse(0, -45, 34, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2a2420';
  ctx.fillRect(-42, -25, 84, 6);
  ctx.fillRect(-42, 22, 84, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(-42, -25, 84, 1.5);
  ctx.fillRect(-42, 22, 84, 1.5);

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    const px = i * 10;
    ctx.beginPath();
    ctx.moveTo(px, -43);
    ctx.lineTo(px, 43);
    ctx.stroke();
  }

  if (hp < 3) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-18, -10); ctx.lineTo(-10, 8); ctx.lineTo(-14, 20);
    ctx.stroke();
  }
  if (hp < 2) {
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(12, -20); ctx.lineTo(6, -2); ctx.lineTo(14, 14); ctx.lineTo(8, 28);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.beginPath(); ctx.arc(10, 0, 3, 0, Math.PI * 2); ctx.fill();
  }

  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < hp ? COL.gold : 'rgba(0,0,0,0.4)';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(-12 + i * 12, -58, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, L: Layout, y: number, player: Player | undefined, team: Team, st: AnimState, gs: GameState) {
  if (!player) {
    const x = team === 'sheriffs' ? L.sheriffX : L.outlawX;
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = team === 'sheriffs' ? COL.sheriff : COL.outlaw;
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  const anim = st.playerAnim[player.id] || {};
  let drawY = y;
  if (anim.slideFrom != null && anim.slideTo != null && anim.slideStart != null) {
    const dur = 0.45;
    const tt = Math.min(1, (st.t - anim.slideStart) / dur);
    if (tt < 1) {
      const fromY = L.ys[anim.slideFrom];
      const toY = L.ys[anim.slideTo];
      drawY = fromY + (toY - fromY) * easeInOutQuad(tt);
    }
  }

  const x = team === 'sheriffs' ? L.sheriffX : L.outlawX;
  const isSheriff = team === 'sheriffs';
  const facing = isSheriff ? 1 : -1;

  let flinch = 0;
  if (anim.flinchAt != null) {
    const ft = st.t - anim.flinchAt;
    if (ft < 0.35) flinch = Math.sin(ft * 40) * (1 - ft / 0.35) * 6;
  }

  let deadAngle = 0;
  let deadY = 0;
  let deadAlpha = 1;
  if (anim.deathAt != null) {
    const dt = st.t - anim.deathAt;
    const p = Math.min(1, dt / 0.8);
    deadAngle = easeOutCubic(p) * (Math.PI / 2 - 0.2) * facing;
    deadY = easeOutCubic(p) * 30;
    if (dt > 1.2) deadAlpha = Math.max(0.35, 1 - (dt - 1.2));
  } else if (!player.isAlive) {
    deadAngle = (Math.PI / 2 - 0.2) * facing;
    deadY = 30;
    deadAlpha = 0.4;
  }

  const barrel = findBarrel(gs, team, player.slot);
  const covered = player.isCovered && !!barrel && barrel.hp > 0;

  ctx.save();
  ctx.translate(x + flinch, drawY + deadY);
  ctx.rotate(deadAngle);
  ctx.globalAlpha = deadAlpha;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 60, 30, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (covered) {
    ctx.translate(0, 22);
    ctx.scale(1, 0.75);
  }

  drawCowboy(ctx, team, facing, st, player);

  if (player.actionLocked && player.isAlive) {
    ctx.save();
    ctx.globalAlpha = 1;
    const pulse = 1 + Math.sin(st.t * 8) * 0.15;
    ctx.translate(facing * -38, -78);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#4ade80';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✓', 0, 1);
    ctx.restore();
  }

  ctx.restore();

  if (player.isAlive) {
    const hudX = isSheriff ? x - 62 : x + 62;
    drawPlayerHUD(ctx, hudX, drawY, player);
  }

  ctx.save();
  ctx.globalAlpha = player.isAlive ? 0.92 : 0.45;
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeStyle = team === 'sheriffs' ? COL.sheriff : COL.outlaw;
  ctx.lineWidth = 1;
  const name = (player.name || '').toUpperCase().slice(0, 10);
  ctx.font = 'bold 12px ui-monospace, monospace';
  const w = Math.min(90, ctx.measureText(name).width + 14);
  const nameY = drawY + 58;
  roundRect(ctx, x - w / 2, nameY - 9, w, 18, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = player.isAlive ? COL.bone : '#999';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x, nameY);
  ctx.restore();
}

function drawCowboy(ctx: CanvasRenderingContext2D, team: Team, facing: number, st: AnimState, player: Player) {
  const isSheriff = team === 'sheriffs';
  const primary = isSheriff ? COL.sheriff : COL.outlaw;
  const primaryDark = isSheriff ? COL.sheriffDark : COL.outlawDark;
  const primaryLight = isSheriff ? COL.sheriffLight : COL.outlawLight;

  ctx.save();
  ctx.scale(facing * 0.9, 0.9);

  const sway = Math.sin(st.t * 1.5 + (player.id || '').length) * 2;
  ctx.translate(0, sway);

  ctx.fillStyle = '#3a2818';
  ctx.fillRect(-14, 22, 11, 38);
  ctx.fillRect(3, 22, 11, 38);
  ctx.fillStyle = '#1a0e08';
  ctx.fillRect(-16, 54, 15, 10);
  ctx.fillRect(1, 54, 15, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(-16, 54, 15, 2);
  ctx.fillRect(1, 54, 15, 2);

  ctx.fillStyle = primaryDark;
  roundRect(ctx, -22, -12, 44, 40, 6);
  ctx.fill();
  ctx.fillStyle = primary;
  roundRect(ctx, -18, -10, 36, 32, 5);
  ctx.fill();
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(-22, 22, 44, 6);
  ctx.fillStyle = COL.gold;
  ctx.fillRect(-4, 22, 8, 6);

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

  ctx.fillStyle = primaryDark;
  ctx.fillRect(6, -6, 26, 10);
  ctx.fillStyle = '#d9b38c';
  ctx.fillRect(30, -7, 8, 12);
  drawRevolver(ctx, 34, -2);

  ctx.fillStyle = primary;
  ctx.fillRect(-26, -6, 18, 10);

  ctx.fillStyle = '#d9b38c';
  ctx.fillRect(-6, -22, 12, 12);

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

  ctx.fillStyle = primary;
  ctx.fillRect(-9, -20, 18, 5);
  ctx.fillStyle = primaryLight;
  ctx.fillRect(-9, -20, 18, 1);

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

function drawRevolver(ctx: CanvasRenderingContext2D, x: number, y: number) {
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

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, color: string) {
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

function drawPlayerHUD(ctx: CanvasRenderingContext2D, x: number, y: number, player: Player) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) {
    drawHeart(ctx, x, y - 18 + i * 12, 5, i < player.hp ? '#ff4c4c' : '#2a1012');
  }
  for (let i = 0; i < 3; i++) {
    const by = y + 20 + i * 9;
    ctx.fillStyle = i < player.ammo ? COL.goldBright : '#333';
    ctx.strokeStyle = '#1a1410';
    ctx.lineWidth = 1;
    roundRect(ctx, x - 4, by - 3, 8, 6, 1.5);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.6);
  ctx.bezierCurveTo(cx + size, cy + size * 0.2, cx + size * 0.8, cy - size * 0.7, cx, cy - size * 0.1);
  ctx.bezierCurveTo(cx - size * 0.8, cy - size * 0.7, cx - size, cy + size * 0.2, cx, cy + size * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMuzzles(ctx: CanvasRenderingContext2D, st: AnimState) {
  for (let i = st.muzzles.length - 1; i >= 0; i--) {
    const m = st.muzzles[i];
    const age = st.t - m.t;
    if (age > m.life) { st.muzzles.splice(i, 1); continue; }
    const p = age / m.life;
    const alpha = 1 - p;
    const size = 30 + p * 50;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(m.x + m.dir * 30, m.y);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    g.addColorStop(0, `rgba(255,240,180,${alpha})`);
    g.addColorStop(0.3, `rgba(255,180,60,${alpha * 0.7})`);
    g.addColorStop(1, 'rgba(255,100,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,230,160,${alpha})`;
    ctx.lineWidth = 4 * (1 - p);
    for (let k = 0; k < 5; k++) {
      const ang = (k / 5) * Math.PI * 2 + p;
      const r1 = size * 0.3;
      const r2 = size * (0.9 + Math.random() * 0.3);
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
      ctx.lineTo(Math.cos(ang) * r2, Math.sin(ang) * r2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawBullets(ctx: CanvasRenderingContext2D, st: AnimState) {
  for (let i = st.bullets.length - 1; i >= 0; i--) {
    const b = st.bullets[i];
    const t = (st.t - b.bornAt) / b.dur;
    if (t > 1) { st.bullets.splice(i, 1); continue; }
    const x = b.fromX + (b.toX - b.fromX) * t;
    const y = b.fromY + (b.toY - b.fromY) * t;
    const angle = Math.atan2(b.toY - b.fromY, b.toX - b.fromX);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const trail = 80;
    const tg = ctx.createLinearGradient(-trail, 0, 0, 0);
    tg.addColorStop(0, 'rgba(255,220,120,0)');
    tg.addColorStop(1, 'rgba(255,240,180,0.9)');
    ctx.fillStyle = tg;
    ctx.fillRect(-trail, -2, trail, 4);
    ctx.fillStyle = '#fff9e0';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
    gg.addColorStop(0, 'rgba(255,200,100,0.8)');
    gg.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(-10, -10, 20, 20);
    ctx.restore();
  }
}

function drawImpacts(ctx: CanvasRenderingContext2D, st: AnimState) {
  for (let i = st.impacts.length - 1; i >= 0; i--) {
    const im = st.impacts[i];
    const age = st.t - im.t;
    const life = 0.5;
    if (age > life) { st.impacts.splice(i, 1); continue; }
    const p = age / life;
    ctx.save();
    ctx.translate(im.x, im.y);
    ctx.globalCompositeOperation = 'lighter';
    if (im.kind === 'bullet') {
      const r = 20 + p * 60;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(255,250,220,${1 - p})`);
      g.addColorStop(0.5, `rgba(255,210,120,${(1 - p) * 0.6})`);
      g.addColorStop(1, 'rgba(255,100,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,240,180,${(1 - p) * 0.9})`;
      ctx.lineWidth = 3 * (1 - p);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.stroke();
    } else if (im.kind === 'barrel') {
      const r = 15 + p * 30;
      ctx.fillStyle = `rgba(180,120,60,${(1 - p) * 0.7})`;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    } else if (im.kind === 'player') {
      const r = 20 + p * 40;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(161,27,27,${(1 - p) * 0.8})`;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

function drawDamages(ctx: CanvasRenderingContext2D, st: AnimState) {
  for (let i = st.damages.length - 1; i >= 0; i--) {
    const d = st.damages[i];
    const age = st.t - d.t;
    const life = 1.0;
    if (age > life) { st.damages.splice(i, 1); continue; }
    const p = age / life;
    ctx.save();
    ctx.globalAlpha = 1 - p * p;
    ctx.font = 'bold 36px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = d.color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    const y = d.y - p * 50;
    ctx.strokeText(d.text, d.x, y);
    ctx.fillText(d.text, d.x, y);
    ctx.restore();
  }
}

function drawDust(ctx: CanvasRenderingContext2D, st: AnimState) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,230,180,0.35)';
  for (const m of st.ambient) {
    ctx.globalAlpha = m.a;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHUD(ctx: CanvasRenderingContext2D, gs: GameState, st: AnimState) {
  const barH = 100;
  const grad = ctx.createLinearGradient(0, 0, 0, barH);
  grad.addColorStop(0, 'rgba(0,0,0,0.8)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, barH + 20);

  const sheriffsAlive = gs.players.filter((p) => p.team === 'sheriffs' && p.isAlive).length;
  const outlawsAlive = gs.players.filter((p) => p.team === 'outlaws' && p.isAlive).length;

  drawTeamBadge(ctx, 40, 20, 'SHERIFFS', sheriffsAlive, COL.sheriff, COL.sheriffDark);
  drawTeamBadge(ctx, CANVAS_W - 340, 20, 'OUTLAWS', outlawsAlive, COL.outlaw, COL.outlawDark);

  const cx = CANVAS_W / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(15,8,4,0.92)';
  ctx.strokeStyle = COL.wood;
  ctx.lineWidth = 2;
  roundRect(ctx, cx - 260, 20, 520, 75, 8);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = COL.gold;
  ctx.font = 'bold 14px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(
    gs.phase === 'planning' ? 'PLANNING  ·  LOCK IN YOUR ACTION'
      : gs.phase === 'resolution' ? '▶  SHOOTOUT'
      : gs.phase.toUpperCase(),
    cx - 248, 28,
  );
  ctx.textAlign = 'right';
  ctx.fillStyle = COL.bone;
  ctx.font = 'bold 22px ui-serif, Georgia, serif';
  ctx.fillText(`ROUND ${gs.tick}`, cx + 248, 24);

  const barX = cx - 248;
  const barY = 58;
  const barW = 496;
  const barh = 22;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeStyle = 'rgba(224,176,74,0.4)';
  roundRect(ctx, barX, barY, barW, barh, 4);
  ctx.fill(); ctx.stroke();

  let pct = 0;
  if (gs.phase === 'planning' && gs.config.tickDuration > 0) {
    pct = st.timeLeft / gs.config.tickDuration;
  } else if (gs.phase === 'resolution') {
    pct = 1;
  }
  const barColor = gs.phase === 'resolution' ? '#e03a3a' : pct < 0.3 ? '#e03a3a' : COL.goldBright;
  ctx.fillStyle = barColor;
  const fw = Math.max(0, barW * pct);
  roundRect(ctx, barX + 1, barY + 1, fw, barh - 2, 3);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    const xx = barX + (barW * i) / 8;
    ctx.beginPath();
    ctx.moveTo(xx, barY + 3);
    ctx.lineTo(xx, barY + barh - 3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTeamBadge(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, count: number, main: string, dark: string) {
  ctx.save();
  ctx.fillStyle = 'rgba(15,8,4,0.92)';
  ctx.strokeStyle = main;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, 300, 75, 8);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = dark;
  ctx.fillRect(x, y, 6, 75);

  ctx.save();
  ctx.translate(x + 38, y + 37);
  if (label === 'SHERIFFS') {
    drawStar(ctx, 0, 0, 18, 8, COL.goldBright);
  } else {
    ctx.fillStyle = COL.bone;
    ctx.beginPath();
    ctx.arc(0, -2, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-10, 8, 20, 8);
    ctx.fillStyle = '#1a0e08';
    ctx.beginPath(); ctx.arc(-5, -2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(5, -2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-1, 3, 2, 4);
    ctx.fillRect(-8, 10, 2, 3);
    ctx.fillRect(-3, 10, 2, 3);
    ctx.fillRect(2, 10, 2, 3);
    ctx.fillRect(7, 10, 2, 3);
  }
  ctx.restore();

  ctx.fillStyle = main;
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x + 70, y + 14);

  ctx.fillStyle = 'rgba(244,233,214,0.5)';
  ctx.font = 'bold 9px ui-monospace';
  ctx.fillText('STANDING', x + 70, y + 32);

  ctx.fillStyle = COL.bone;
  ctx.font = 'bold 42px ui-serif, Georgia, serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(count), x + 284, y + 42);

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
