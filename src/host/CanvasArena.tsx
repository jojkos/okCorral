import { useEffect, useRef } from 'react';
import type { Bullet, GameState, Player, Team, Emote } from '../../shared/types';
import { playerShotCurve, type ShotFlight } from '../../shared/ballistics';
import { resolvedBulletFlight } from '../../shared/bulletFlight';
import { socket, serverNow } from '../socket';
import { VOLLEY } from '../lib/presentation';
import { roundHeadline } from '../lib/recap';
import { reducedMotion } from '../components/GamePreferences';
import * as sound from '../sound';
import { BADGE_MIN_Y, CANVAS_H, CANVAS_W, Layout, TEAM_COL, barrelHeight, barrelX, bulletLaneFeet, clamp01, facingOf, rand, slotLayout, teamX } from './arena/layout';
import { drawBackground, drawBarrel, drawStrongWindWeather, drawVignette, drawWalkingWoman } from './arena/scene';
import { drawGatlingMan, gatlingTravel, gatlingWomanFrame } from './arena/gatling';
import { drawRain, drawRainGround, drawSwallows } from './arena/rain';
import { ActorAnim, ActorFrame, actorFrame, drawActionBadge, drawActor, drawIntentMarker, drawPlate, headY } from './arena/actors';
import { Banner, BulletAnim, EmoteFx, Floater, FlyingHat, Impact, Muzzle, ParticleSystem, drawBanners, drawBullets, drawEmotes, drawFloaters, drawHats, drawImpacts, drawMuzzles, stepHats } from './arena/fx';
import { drawCountdown, drawHUD, drawLegend } from './arena/hud';

// Sound is upgraded independently; call optional cues defensively.
const sfx = sound as unknown as Record<string, ((...args: unknown[]) => void) | undefined>;
const cue = (name: string, ...args: unknown[]) => { try { sfx[name]?.(...args); } catch { /* audio is best-effort */ } };
const pan = (team: Team) => (team === 'sheriffs' ? -0.65 : 0.65);

interface CanvasArenaProps { gameState: GameState }

interface AnimState {
  particles: ParticleSystem;
  bullets: BulletAnim[];
  muzzles: Muzzle[];
  impacts: Impact[];
  floaters: Floater[];
  banners: Banner[];
  hats: FlyingHat[];
  emotes: EmoteFx[];
  shake: { x: number; y: number; mag: number; until: number };
  flash: number;
  /** Animation clock (seconds), slowed by hit-stop / slow-mo. */
  t: number;
  slowUntil: number;
  slowScale: number;
  /** Short camera punch on each gatling round; decays between shots. */
  gatlingKick: number;
  cam: { zoom: number; x: number; y: number; tz: number; tx: number; ty: number };
  anims: Record<string, ActorAnim>;
  frames: Record<string, ActorFrame>;
  timeLeft: number;
  lastCountdown: number;
  finalAt: number | null;
}

export default function CanvasArena({ gameState }: CanvasArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const gsRef = useRef<GameState>(gameState);
  const stRef = useRef<AnimState>({
    particles: new ParticleSystem(), bullets: [], muzzles: [], impacts: [], floaters: [], banners: [], hats: [], emotes: [],
    shake: { x: 0, y: 0, mag: 0, until: 0 }, flash: 0, t: 0, slowUntil: 0, slowScale: 1, gatlingKick: 0,
    cam: { zoom: 1, x: CANVAS_W / 2, y: CANVAS_H / 2, tz: 1, tx: CANVAS_W / 2, ty: CANVAS_H / 2 },
    anims: {}, frames: {}, timeLeft: 0, lastCountdown: 0, finalAt: null,
  });
  gsRef.current = gameState;

  useEffect(() => {
    if (gameState.rain?.phase === 'active') return sound.startRainSound();
  }, [gameState.rain?.phase]);

  useEffect(() => {
    const img = new Image();
    img.src = '/frontier.svg';
    img.onload = () => { bgRef.current = img; };
  }, []);

  // Flinch / death reactions follow the *presented* state, so they land on impact.
  const prevRef = useRef<Record<string, { hp: number; isAlive: boolean }>>({});
  useEffect(() => {
    const st = stRef.current;
    const prev = prevRef.current;
    const next: typeof prev = {};
    const L = slotLayout(gameState.config.slotsPerSide);
    for (const p of gameState.players) {
      const last = prev[p.id];
      const a = (st.anims[p.id] ||= {});
      if (last && last.hp > p.hp && p.isAlive) a.flinchAt = st.t;
      if (last && last.isAlive && !p.isAlive) {
        a.deathAt = st.t;
        a.deathDur = st.finalAt != null ? 1.4 : 0.75;
        a.flinchAt = st.t;
        const f = st.frames[p.id];
        if (f && !reducedMotion()) {
          a.hatGone = true;
          const dir = -facingOf(p.team);
          st.hats.push({ x: f.x, y: headY(L, f) + 20 * L.s, vx: dir * (50 + Math.random() * 70), vy: -480 - Math.random() * 160, rot: 0, vr: dir * (8 + Math.random() * 6), ground: f.feet - 6, team: p.team, s: L.s, landed: false });
        }
      }
      if (!last || (last.isAlive === false && p.isAlive)) { a.deathAt = undefined; a.hatGone = false; }
      next[p.id] = { hp: p.hp, isAlive: p.isAlive };
    }
    prevRef.current = next;
  }, [gameState.players]);

  // New rounds are announced visually only; environmental sounds stay intact.
  useEffect(() => {
    if (gameState.phase !== 'planning') return;
    const st = stRef.current;
    st.lastCountdown = 4;
    st.finalAt = null;
    // Keep the full vertical lane stack framed. Gatling drama comes from a
    // restrained push-in and per-shot punches, never from cropping lower rows.
    st.cam.tz = gameState.gatlingMan.phase === 'active' ? 1.028 : 1;
    st.cam.tx = CANVAS_W / 2; st.cam.ty = CANVAS_H / 2;
    st.gatlingKick = 0;
    if (gameState.gatlingMan.phase === 'warning') {
      cue('playGatlingApproach', gameState.config.tickDuration / 1000);
    } else if (gameState.gatlingMan.phase === 'active') {
      cue('playGatlingArrival');
      if (gameState.walkingWoman.crushedByGatling && gameState.walkingWoman.fromSlot !== gameState.walkingWoman.slot) cue('playGatlingCrush');
    } else {
      st.banners.push({ text: `ROUND ${gameState.tick}`, sub: gameState.tick === 1 ? 'CHOOSE ONE ACTION ON YOUR PHONE' : undefined, t: st.t, life: 1.25, color: '#ffd875', size: 64, y: 470 });
    }
  }, [gameState.phase, gameState.tick]);

  // The showdown, choreographed on the shared server clock.
  useEffect(() => {
    const gs = gameState;
    if (gs.phase !== 'resolution' || !gs.resolutionStartedAt) return;
    const st = stRef.current;
    const elapsed0 = serverNow() - gs.resolutionStartedAt;
    if (elapsed0 > VOLLEY.settle) return;
    const L = slotLayout(gs.config.slotsPerSide);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => {
      const wait = ms - (serverNow() - gs.resolutionStartedAt!);
      if (wait <= -150) return; // already happened; don't replay stale cues
      timers.push(setTimeout(fn, Math.max(0, wait)));
    };
    const before = new Map((gs.resolutionFrom?.players ?? []).map((p) => [p.id, p]));
    const players = gs.players.filter((p) => p.slot >= 0);
    const bullets = gs.lastTickBullets;
    const deaths = new Set([
      ...bullets.filter((b) => b.lethal && b.targetId).map((b) => b.targetId!),
      ...gs.lastTickSuicides,
    ]);
    const aliveAfter = (team: Team) => players.filter((p) => p.team === team && (before.get(p.id)?.isAlive ?? p.isAlive) && !deaths.has(p.id)).length;
    const final = deaths.size > 0 && (aliveAfter('sheriffs') === 0 || aliveAfter('outlaws') === 0);
    const winner: Team | 'draw' | null = !final ? null : aliveAfter('sheriffs') === 0 && aliveAfter('outlaws') === 0 ? 'draw' : aliveAfter('sheriffs') === 0 ? 'outlaws' : 'sheriffs';

    at(0, () => { if (sfx.playReveal) cue('playReveal'); else cue('playTickResolve'); });
    if (gs.gatlingMan.phase === 'active') at(VOLLEY.reveal, () => {
      cue('playGatlingSpinUp');
      st.cam.tz = 1.04;
      st.cam.tx = CANVAS_W / 2;
      st.cam.ty = CANVAS_H / 2;
    });
    at(VOLLEY.reveal, () => {
      for (const p of players) {
        const was = before.get(p.id);
        if (!was?.isAlive) continue;
        if (p.currentAction.startsWith('MOVE') && was.slot !== p.slot) cue('playSpurs', pan(p.team));
        if (p.currentAction === 'RELOAD') cue('playReloadSpin', pan(p.team));
        if (p.currentAction === 'COVER' && !was.isCovered) cue('playCoverThud', pan(p.team));
      }
    });

    const targetPoint = (b: Bullet): ShotFlight => b.flight ?? resolvedBulletFlight(gs, b);

    let gatlingShot = 0;
    bullets.forEach((b, i) => {
      const stagger = b.firedAt != null ? b.firedAt - VOLLEY.move : b.source === 'gatling' ? gatlingShot++ * 42 : (rand(i * 31 + gs.tick) * 60) | 0;
      let geo: ReturnType<typeof targetPoint> | null = null;
      at(VOLLEY.move + stagger, () => {
        geo = targetPoint(b);
        const dir = b.source === 'gatling' ? (b.targetTeam === 'outlaws' ? 1 : -1) : facingOf(b.fromTeam);
        cue(b.source === 'gatling' ? 'playGatlingShot' : 'playGunshot', b.source === 'gatling' ? (b.targetTeam === 'sheriffs' ? -0.35 : 0.35) : pan(b.fromTeam));
        st.muzzles.push({ x: geo.fromX, y: geo.fromY, t: st.t, life: 0.12, dir });
        if (!reducedMotion()) {
          for (let k = 0; k < 8; k++) st.particles.add({ kind: 'smoke', x: geo.fromX + dir * 20, y: geo.fromY, vx: dir * (40 + Math.random() * 70), vy: -30 - Math.random() * 30, drag: 1.2, size: 6 + Math.random() * 6, life: 1.4 + Math.random() * 0.6, age: 0, color: '#d8ccb4' });
          for (let k = 0; k < 6; k++) st.particles.add({ kind: 'streak', x: geo.fromX + dir * 24, y: geo.fromY, vx: dir * (300 + Math.random() * 300), vy: (Math.random() - 0.5) * 160, drag: 4, size: 2.5, life: 0.18, age: 0, color: '#ffe1a4', fade: true });
        }
        st.bullets.push({ id: b.id, ...geo, bornAt: st.t, dur: Math.max(0.08, (VOLLEY.impact - VOLLEY.move - stagger) / 1000), team: b.fromTeam, hit: b.hit, source: b.source });
        if (b.source === 'gatling') {
          st.gatlingKick = 1;
          st.shake.mag = Math.max(st.shake.mag, 6);
          st.shake.until = st.t + 0.16;
        } else {
          st.shake.mag = Math.max(st.shake.mag, 3);
          st.shake.until = st.t + 0.12;
        }
      });
      at(VOLLEY.impact, () => {
        const g = geo ?? targetPoint(b);
        const p = b.source === 'gatling' ? (b.targetTeam === 'sheriffs' ? -0.45 : 0.45) : b.fromTeam === 'sheriffs' ? 0.65 : -0.65;
        if (final && b.lethal) cue('playFinalShot');
        cue('playBulletImpact', b.hit, p);
        if (b.lethal && !final) cue('playKillSting');
        const motion = !reducedMotion();
        if (b.hit !== 'miss') {
          st.impacts.push({ x: g.toX, y: g.toY, t: st.t, kind: b.hit, lethal: b.lethal });
          if (motion) { st.shake.mag = b.hit === 'player' ? (b.lethal ? 16 : 10) : 6; st.shake.until = st.t + 0.28; }
          if (b.hit === 'player' && motion) { st.slowUntil = performance.now() + (b.lethal ? 160 : 80); st.slowScale = 0.06; }
        }
        const label = b.hit === 'player' ? (b.lethal ? 'KILLED!' : '−1 ♥') : b.hit === 'barrel' ? 'BLOCKED' : b.hit === 'bullet' ? 'CLANG!' : b.hit === 'woman' ? 'BYSTANDER HIT!' : 'MISS';
        const color = b.hit === 'player' || b.hit === 'woman' ? '#ff6a55' : b.hit === 'barrel' ? '#8fe3c4' : b.hit === 'bullet' ? '#ffd875' : '#c8bfb2';
        const enemyX = teamX(L, b.fromTeam === 'sheriffs' ? 'outlaws' : 'sheriffs');
        // Labels pop on the street side of the target so they never cover its action badge.
        const toStreet = -facingOf(b.fromTeam);
        const fx = b.hit === 'miss' ? enemyX - facingOf(b.fromTeam) * 70 : b.hit === 'bullet' ? g.toX : g.toX + toStreet * 95 * L.s;
        const fy = b.hit === 'miss' ? Math.max(210, Math.min(CANVAS_H - 80, bulletLaneFeet(L, b.toSlot) - 130 * L.s)) : b.hit === 'bullet' ? g.toY - 54 : g.toY - 8;
        st.floaters.push({ x: fx, y: fy, text: label, t: st.t, color, size: b.hit === 'player' ? 34 : 24, life: b.lethal ? 1.6 : 1.1 });
        if (motion) {
          const n = b.hit === 'barrel' ? 18 : b.hit === 'bullet' ? 22 : 14;
          for (let k = 0; k < n; k++) {
            const a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 220;
            st.particles.add({
              kind: b.hit === 'barrel' ? 'square' : 'streak', x: g.toX, y: g.toY,
              vx: Math.cos(a) * sp - facingOf(b.fromTeam) * -60, vy: Math.sin(a) * sp - 80, gravity: b.hit === 'barrel' ? 900 : 380, drag: 0.6,
              size: b.hit === 'barrel' ? 4 + Math.random() * 4 : 2 + Math.random() * 2.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20,
              life: 0.6 + Math.random() * 0.4, age: 0, color: b.hit === 'barrel' ? (k % 2 ? '#a06a3d' : '#6b4423') : b.hit === 'player' ? '#ffb48f' : '#ffe9a8', fade: true,
            });
          }
        }
      });
    });

    // A guilty shooter visibly raises the revolver to their temple, then the
    // shot, head impact and fall all land on the shared impact beat.
    for (const id of gs.lastTickSuicides) {
      const victim = players.find((p) => p.id === id);
      if (!victim) continue;
      at(VOLLEY.impact, () => {
        const f = st.frames[id];
        if (!f) return;
        const facing = facingOf(victim.team);
        const x = f.x + facing * 8 * L.s;
        const y = f.feet - 112 * L.s;
        cue('playGunshot', pan(victim.team));
        if (final) cue('playFinalShot'); else cue('playKillSting');
        st.muzzles.push({ x, y, t: st.t, life: 0.12, dir: -facing });
        st.impacts.push({ x: x - facing * 4 * L.s, y: y - 2 * L.s, t: st.t, kind: 'player', lethal: true });
        st.shake.mag = Math.max(st.shake.mag, 15); st.shake.until = st.t + 0.3;
        if (reducedMotion()) return;
        st.slowUntil = performance.now() + 170; st.slowScale = 0.08;
        for (let k = 0; k < 7; k++) {
          st.particles.add({
            kind: 'smoke', x, y, vx: -facing * (18 + Math.random() * 36), vy: -35 - Math.random() * 50,
            drag: 1.25, size: 5 + Math.random() * 6, life: 1.1 + Math.random() * 0.5, age: 0, color: '#d8ccb4', fade: true,
          });
        }
        for (let k = 0; k < 22; k++) {
          const spread = (Math.random() - 0.5) * 220;
          st.particles.add({
            kind: k % 4 === 0 ? 'dot' : 'streak', x: x - facing * 5 * L.s, y: y - 2 * L.s,
            vx: -facing * (100 + Math.random() * 280), vy: -70 - Math.random() * 190 + spread,
            gravity: 430, drag: 0.75, size: 1.8 + Math.random() * 3.4,
            life: 0.5 + Math.random() * 0.45, age: 0, color: k % 3 ? '#8d0a0d' : '#d42b23', fade: true,
          });
        }
      });
    }

    // Round headline + match-ending slow-motion.
    at(VOLLEY.impact + 180, () => {
      if (final) return;
      const h = roundHeadline({ ...gs, players: gs.players.map((p) => ({ ...p, isAlive: (before.get(p.id)?.isAlive ?? p.isAlive) && !deaths.has(p.id) })) });
      if (h) st.banners.push({ text: h, t: st.t, life: 1.15, color: h === 'CLANG!' || h === 'SPLINTERS!' ? '#ffd875' : '#ff8a75', size: 58, y: 470 });
    });
    if (final) {
      at(VOLLEY.impact - 260, () => {
        st.finalAt = st.t;
        if (reducedMotion()) return;
        const victims = [...deaths].map((id) => st.frames[id]).filter(Boolean);
        if (victims.length) {
          const vx = victims.reduce((a, f) => a + f.x, 0) / victims.length;
          const vy = victims.reduce((a, f) => a + f.feet - 60 * L.s, 0) / victims.length;
          st.cam.tz = 1.35; st.cam.tx = vx * 0.7 + CANVAS_W / 2 * 0.3; st.cam.ty = vy * 0.7 + CANVAS_H / 2 * 0.3;
        }
      });
      at(VOLLEY.impact, () => {
        st.flash = 1;
        if (!reducedMotion()) { st.slowUntil = performance.now() + 1700; st.slowScale = 0.3; }
      });
      at(VOLLEY.impact + 900, () => {
        const text = winner === 'draw' ? 'NOBODY WINS' : winner === 'sheriffs' ? 'SHERIFFS WIN!' : 'OUTLAWS WIN!';
        const color = winner === 'draw' ? '#ead3b0' : TEAM_COL[winner as Team].text;
        st.banners.push({ text, sub: winner === 'draw' ? 'everyone bit the dust' : 'the dust settles…', t: st.t, life: 2.6, color, size: 84, y: 450 });
        st.cam.tz = 1.08;
      });
    }
    return () => timers.forEach(clearTimeout);
  }, [gameState.phase, gameState.resolutionStartedAt]);

  // Emotes from phones float above that player's spot.
  useEffect(() => {
    const onEmote = ({ playerId, emoji }: { playerId: string; emoji: Emote }) => {
      const st = stRef.current;
      const gs = gsRef.current;
      const p = gs.players.find((x) => x.id === playerId);
      if (!p || p.slot < 0) return;
      const L = slotLayout(gs.config.slotsPerSide);
      const f = st.frames[p.id];
      const x = f ? f.x : teamX(L, p.team);
      const y = Math.max(BADGE_MIN_Y + 20, f ? headY(L, f) - 30 : L.ys[p.slot]);
      st.emotes.push({ emoji, x: x + facingOf(p.team) * 40, y, t: st.t, name: p.name, team: p.team });
      if (st.emotes.length > 16) st.emotes.shift();
      cue('playEmotePop');
    };
    socket.on('emote', onEmote);
    return () => { socket.off('emote', onEmote); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const real = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stRef.current;
      const gs = gsRef.current;
      const scale = now < st.slowUntil ? st.slowScale : 1;
      const dt = real * scale;
      st.t += dt;

      if (gs.phase === 'planning' && gs.tickStartTime) {
        st.timeLeft = Math.max(0, gs.config.tickDuration - (serverNow() - gs.tickStartTime));
        const sec = Math.ceil(st.timeLeft / 1000);
        if (sec <= 3 && sec >= 1 && sec < st.lastCountdown) { st.lastCountdown = sec; cue('playCountdownTick', (3 - sec) / 2); }
      } else st.timeLeft = 0;

      st.particles.step(dt);
      stepHats(st.hats, dt);
      if (document.hidden) { st.bullets = []; st.muzzles = []; st.impacts = []; st.floaters = []; }

      const motion = !reducedMotion();
      if (motion && st.t < st.shake.until) {
        const decay = Math.max(0, st.shake.until - st.t) / 0.3;
        st.shake.x = (Math.random() - 0.5) * st.shake.mag * decay;
        st.shake.y = (Math.random() - 0.5) * st.shake.mag * decay;
      } else { st.shake.x *= 0.8; st.shake.y *= 0.8; st.shake.mag *= 0.9; }
      const c = st.cam;
      if (!motion) { c.tz = 1; c.tx = CANVAS_W / 2; c.ty = CANVAS_H / 2; }
      const ease = 1 - Math.pow(0.02, real);
      c.zoom += (c.tz - c.zoom) * ease; c.x += (c.tx - c.x) * ease; c.y += (c.ty - c.y) * ease;
      st.gatlingKick *= Math.pow(0.0005, real);
      st.flash = Math.max(0, st.flash - real * 2.2);

      draw(ctx, gs, st, bgRef.current, motion);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Showdown arena. Sheriffs on the left, outlaws on the right."
      role="img"
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}

function draw(ctx: CanvasRenderingContext2D, gs: GameState, st: AnimState, bg: HTMLImageElement | null, motion: boolean) {
  const L = slotLayout(gs.config.slotsPerSide);
  const elapsed = gs.phase === 'resolution' && gs.resolutionStartedAt ? serverNow() - gs.resolutionStartedAt : -1;
  const before = new Map((gs.resolutionFrom?.players ?? []).map((p) => [p.id, p]));
  const seated = gs.players.filter((p) => p.slot >= 0);
  const roundProgress = gs.phase === 'planning' && gs.tickStartTime
    ? clamp01((serverNow() - gs.tickStartTime) / gs.config.tickDuration)
    : 1;

  ctx.save();
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  // Camera: shake + slow-mo zoom (scene only; HUD stays put).
  const gatlingZoom = gs.gatlingMan.phase === 'active' && motion ? st.gatlingKick * 0.012 : 0;
  // 1.052 is the safe 16:9 limit: the lowest lane remains visible even at
  // peak recoil and camera shake.
  const sceneZoom = gs.gatlingMan.phase === 'active' ? Math.min(1.052, st.cam.zoom + gatlingZoom) : st.cam.zoom;
  const warningPulse = gs.gatlingMan.phase === 'warning' && motion
    ? (1.2 + roundProgress * 5.3) * (0.35 + Math.max(0, Math.sin(st.t * 8.5)) * 0.65)
    : 0;
  const earthX = warningPulse ? Math.sin(st.t * 27) * warningPulse * 0.42 : 0;
  const earthY = warningPulse ? Math.sin(st.t * 19 + 0.8) * warningPulse * 0.72 : 0;
  ctx.translate(CANVAS_W / 2 + st.shake.x + earthX, CANVAS_H / 2 + st.shake.y + earthY);
  ctx.scale(sceneZoom, sceneZoom);
  ctx.translate(-st.cam.x, -st.cam.y);

  drawBackground(ctx, bg, st.t);
  drawRainGround(ctx, gs, st.t, motion);
  drawSwallows(ctx, gs, serverNow(), roundProgress, elapsed, motion, 'ground');
  drawStrongWindWeather(ctx, L, gs.strongWind, st.t, motion);
  const gatlingTarget = gs.gatlingMan.phase !== 'active' || !gs.gatlingMan.targets.length ? null
    : gs.gatlingMan.targets[Math.max(0, Math.min(gs.gatlingMan.targets.length - 1,
      elapsed >= VOLLEY.move ? Math.floor((elapsed - VOLLEY.move) / 42) : Math.floor(st.t * 1.5) % gs.gatlingMan.targets.length))];
  const civilian = gatlingWomanFrame(L, gs.walkingWoman, gs.gatlingMan, roundProgress, elapsed, motion, gs.config.tickDuration);
  const drawCart = () => drawGatlingMan(ctx, L, gs.gatlingMan, st.t, motion, gatlingTarget, roundProgress, elapsed >= VOLLEY.reveal && elapsed <= VOLLEY.impact, elapsed, civilian.crush?.bump ?? 0);
  const drawCivilian = () => drawWalkingWoman(ctx, L, civilian.woman, st.t, motion, civilian.progress, civilian.crush);
  const womanFeet = civilian.woman.slot === null ? -Infinity : bulletLaneFeet(L, civilian.woman.fromSlot ?? civilian.woman.slot)
    + (civilian.woman.slot - (civilian.woman.fromSlot ?? civilian.woman.slot)) * L.slotHeight * civilian.progress;
  if (!civilian.crush && gatlingTravel(roundProgress, elapsed, motion).y < womanFeet) { drawCart(); drawCivilian(); }
  else { drawCivilian(); drawCart(); }

  // Compute every actor's frame first (positions are needed for bullets/emotes).
  for (const p of seated) {
    const anim = (st.anims[p.id] ||= {});
    const barrel = gs.barrels.find((b) => b.team === p.team && b.slot === p.slot);
    st.frames[p.id] = actorFrame(L, p, elapsed >= 0 ? before.get(p.id) : undefined, barrel, elapsed, VOLLEY, anim, motion);
  }

  // Back-to-front by lane: corpses, actors, then barrels (so crouchers tuck behind).
  const order = [...seated].sort((a, b) => st.frames[a.id].feet - st.frames[b.id].feet || Number(a.isAlive) - Number(b.isAlive));
  const drawn = new Set<string>();
  for (let lane = 0; lane < L.n; lane++) {
    const inLane = order.filter((p) => !drawn.has(p.id) && st.frames[p.id].feet <= L.feet[lane] + 1);
    for (const p of inLane) {
      drawn.add(p.id);
      const anim = st.anims[p.id];
      const f = st.frames[p.id];
      const a = elapsed / 1000;
      const was = before.get(p.id);
      const moving = elapsed >= VOLLEY.reveal && elapsed < VOLLEY.move && was && was.slot !== p.slot;
      const fired = p.currentAction.startsWith('SHOOT') && gs.lastTickBullets.some((b) => b.shooterId === p.id);
      const recoilT = (elapsed - VOLLEY.move) / 260;
      const suicideT = gs.lastTickSuicides.includes(p.id)
        ? clamp01((elapsed - VOLLEY.reveal) / (VOLLEY.impact - VOLLEY.reveal))
        : 0;
      drawActor(ctx, L, p, f, anim, {
        walk: motion && moving ? Math.sin(a * 32) : 0,
        recoil: motion && fired && recoilT >= 0 && recoilT < 1 ? Math.sin(recoilT * Math.PI) : 0,
        reload: p.currentAction === 'RELOAD' && elapsed >= VOLLEY.reveal && elapsed < VOLLEY.impact ? Math.sin(clamp01((elapsed - VOLLEY.reveal) / (VOLLEY.impact - VOLLEY.reveal)) * Math.PI) : 0,
        suicide: motion ? suicideT * suicideT * (3 - 2 * suicideT) : suicideT >= 0.5 ? 1 : 0,
      }, st.t, motion);
    }
    for (const team of ['sheriffs', 'outlaws'] as Team[]) {
      const barrel = gs.barrels.find((b) => b.team === team && b.slot === lane);
      const hider = seated.find((p) => p.team === team && p.isAlive && p.slot === lane && st.frames[p.id].cover > 0.05);
      const hitRecently = st.impacts.some((im) => im.kind === 'barrel' && Math.abs(im.y - (L.feet[lane] - barrelHeight(L) * 0.55)) < 4 && Math.abs(im.x - barrelX(L, team)) < 60);
      drawBarrel(ctx, L, barrelX(L, team), L.feet[lane], barrel, { cover: hider ? st.frames[hider.id].cover : 0, team, wobble: hitRecently ? 1 : 0, t: st.t });
    }
  }
  drawHats(ctx, st.hats);

  // Aim lines: from reveal until impact, show exactly which lane each gun points at.
  if (elapsed >= 0 && elapsed < VOLLEY.impact + 120) {
    const fade = elapsed > VOLLEY.move ? 1 - clamp01((elapsed - VOLLEY.move) / (VOLLEY.impact - VOLLEY.move)) : clamp01(elapsed / 200);
    for (const b of gs.lastTickBullets) {
      const sf = b.shooterId ? st.frames[b.shooterId] : undefined;
      if (!sf) continue;
      const curve = playerShotCurve(L, b.fromTeam, b.fromSlot, b.aimedSlot, b.toSlot);
      const {fromX: x1, fromY: y1, toX: x2, toY: y2} = curve;
      ctx.save();
      ctx.globalAlpha = 0.85 * fade;
      ctx.strokeStyle = TEAM_COL[b.fromTeam].main; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -st.t * 60;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(curve.controlX, curve.controlY, x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      // Crosshair on the targeted lane
      ctx.lineWidth = 3; ctx.strokeStyle = '#ff6a55';
      ctx.beginPath(); ctx.arc(x2, y2, 22 * L.s, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2 - 32 * L.s, y2); ctx.lineTo(x2 + 32 * L.s, y2); ctx.moveTo(x2, y2 - 32 * L.s); ctx.lineTo(x2, y2 + 32 * L.s); ctx.stroke();
      ctx.restore();
    }
  }

  drawMuzzles(ctx, st.muzzles, st.t);
  drawSwallows(ctx, gs, serverNow(), roundProgress, elapsed, motion, 'air');
  if (motion) st.particles.draw(ctx);
  drawBullets(ctx, st.bullets, st.t);
  drawImpacts(ctx, st.impacts, st.t);
  drawRain(ctx, gs, st.t, motion);

  // Plates, then intent markers / action badges above heads.
  for (const p of seated) {
    const f = st.frames[p.id];
    const laneY = f.feet - (L.feet[0] - L.ys[0]);
    drawPlate(ctx, L, p, laneY, p.actionLocked, gs.phase === 'planning', st.t, f.cover > 0.6 ? (f.covered ? 'safe' : 'exposed') : null);
  }
  for (const p of seated) {
    if (!p.isAlive) continue;
    const f = st.frames[p.id];
    const hy = Math.max(BADGE_MIN_Y, headY(L, f));
    if (gs.phase === 'planning' && p.isAlive) {
      drawIntentMarker(ctx, L, f.x, hy, p.actionLocked, st.t, motion);
    } else if (elapsed >= 0 && elapsed < VOLLEY.settle + 300 && before.get(p.id)?.isAlive) {
      const was = before.get(p.id)!;
      let override: { label: string; color: string } | undefined;
      if (p.currentAction.startsWith('MOVE') && was.slot === p.slot && elapsed > VOLLEY.reveal) override = { label: 'BLOCKED', color: '#ff9b7a' };
      if (p.currentAction === 'COVER' && f.noCover) override = { label: 'NO COVER', color: '#ff6a55' };
      if (p.currentAction.startsWith('SHOOT') && !gs.lastTickBullets.some((b) => b.shooterId === p.id)) override = { label: 'NO TARGET', color: '#c8bfb2' };
      if (gs.lastTickSuicides.includes(p.id)) override = { label: 'GUILT', color: '#ff6a55' };
      ctx.save();
      ctx.globalAlpha = 1 - clamp01((elapsed - VOLLEY.settle) / 300);
      drawActionBadge(ctx, L, f.x, hy, p, elapsed / 1000, override);
      ctx.restore();
    }
  }
  drawFloaters(ctx, st.floaters, st.t);
  drawEmotes(ctx, st.emotes, st.t);
  ctx.restore();

  // Screen-space layers
  const heartbeat = gs.phase === 'planning' && st.timeLeft > 0 && st.timeLeft < 3000 ? (0.5 + 0.5 * Math.sin(st.t * 9)) * (1 - st.timeLeft / 3000) : 0;
  drawVignette(ctx, motion ? heartbeat : 0);
  if (st.finalAt != null) {
    ctx.fillStyle = 'rgba(40,20,10,0.18)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  drawHUD(ctx, gs, st.timeLeft, st.t);
  if (gs.phase === 'planning') drawCountdown(ctx, st.timeLeft, motion);
  drawBanners(ctx, st.banners, st.t);
  if (gs.phase === 'planning') drawLegend(ctx, gs);
  if (st.flash > 0.01) {
    ctx.fillStyle = `rgba(255,244,214,${st.flash * 0.55})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
}

export type { Layout, Player };
