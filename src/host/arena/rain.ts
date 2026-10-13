import type { GameState } from '../../../shared/types';
import { swallowPosition, SWALLOW_FALL_MS } from '../../../shared/swallows';
import { CANVAS_W, CANVAS_H, clamp01, rand } from './layout';
import { departingSwallowPose, type WeatherPresentation } from './weatherPresentation';

/** Ink-blue back, ivory belly, russet throat and long forked tail. */
function swallow(ctx: CanvasRenderingContext2D, flap: number, dead = false) {
  ctx.lineJoin = 'round'; ctx.strokeStyle = '#202d34'; ctx.lineWidth = 1.3;
  const wing = dead ? 9 : 20 + flap * 7;
  ctx.fillStyle = '#263b49';
  ctx.beginPath(); ctx.moveTo(5, 0); ctx.quadraticCurveTo(-1, -wing * 0.65, -16, -wing);
  ctx.lineTo(-8, -3); ctx.lineTo(-14, 0); ctx.lineTo(-8, 3);
  ctx.lineTo(-16, wing); ctx.quadraticCurveTo(-1, wing * 0.65, 5, 0); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#314c60'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(-25, -8); ctx.lineTo(-17, 0); ctx.lineTo(-25, 8); ctx.lineTo(-8, 3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e7d8b7'; ctx.beginPath(); ctx.ellipse(0, 2, 7, 2.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a45e42'; ctx.beginPath(); ctx.arc(7, 1, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a252c'; ctx.beginPath(); ctx.arc(10, -1, 3.7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(12, -2); ctx.lineTo(17, 0); ctx.lineTo(12, 1); ctx.fill();
  if (!dead) { ctx.fillStyle = '#f6e6c9'; ctx.fillRect(10, -2, 1.4, 1.4); }
}

export function drawSwallows(ctx: CanvasRenderingContext2D, gs: GameState, now: number, progress: number, elapsed: number, motion: boolean, layer: 'ground' | 'air', weather?: WeatherPresentation) {
  for (const bird of gs.rain?.swallows ?? []) {
    const body = bird.remains;
    const age = body ? (body.hitTick === gs.tick ? elapsed - body.hitAt : Infinity) : -Infinity;
    const fallen = !!body && age >= (motion ? SWALLOW_FALL_MS : 0);
    if (fallen !== (layer === 'ground')) continue;
    ctx.save();
    if (fallen && body) {
      const y = body.hitTick === gs.tick ? body.y : body.fromY + (body.y - body.fromY) * progress;
      ctx.translate(body.x, y);
      ctx.fillStyle = 'rgba(30,28,24,.22)'; ctx.beginPath(); ctx.ellipse(-3, 3, 21, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(-0.28 + rand(bird.seed) * 0.56); ctx.scale(0.85, 0.48); swallow(ctx, 0, true);
    } else if (body && age >= 0) {
      const p = clamp01(age / SWALLOW_FALL_MS), drop = p * p;
      ctx.translate(body.hitX + Math.sin(p * Math.PI) * 10, body.hitY + (body.y - body.hitY) * drop);
      const landingAngle = -0.28 + rand(bird.seed) * 0.56;
      ctx.rotate(body.hitAngle * (1 - p) + landingAngle * p + p * Math.PI * 2);
      ctx.scale(0.85, 0.85 - 0.37 * clamp01((p - 0.65) / 0.35)); swallow(ctx, 0, true);
      // Brief loose feathers, no explosion or distracting kill label.
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.globalAlpha = 1 - p; ctx.rotate(i * 1.4);
        ctx.fillStyle = i % 2 ? '#d6cbb2' : '#364651'; ctx.beginPath();
        ctx.ellipse(15 + p * (15 + i * 5), 0, 5, 1.5, 0.4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    } else {
      const pose = swallowPosition(bird, now);
      ctx.fillStyle = 'rgba(34,30,24,.13)'; ctx.beginPath(); ctx.ellipse(pose.x, pose.groundY, 17, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(pose.x, pose.y); ctx.rotate(pose.angle); ctx.scale(0.85, 0.85); swallow(ctx, motion ? pose.flap : 0);
    }
    ctx.restore();
  }
  if (layer !== 'air' || !weather) return;
  for (const flight of weather.departingBirds) {
    const pose = departingSwallowPose(flight, now);
    if (pose.progress >= 1) continue;
    const position = motion ? pose : { ...pose, ...flight.start };
    ctx.save();
    // Respect reduced motion without cutting the last visible frame off.
    if (!motion) ctx.globalAlpha *= 1 - pose.progress;
    ctx.fillStyle = 'rgba(34,30,24,.13)'; ctx.beginPath();
    ctx.ellipse(position.x, Math.min(876, position.y + 64), 17, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(position.x, position.y);
    ctx.rotate(motion ? pose.angle : departingSwallowPose(flight, flight.startedAt).angle);
    ctx.scale(.85, .85);
    swallow(ctx, motion ? pose.flap : 0);
    ctx.restore();
  }
}

export function drawRainGround(ctx: CanvasRenderingContext2D, gs: GameState, t: number, motion: boolean, weather?: WeatherPresentation) {
  const wetness = weather?.wetness ?? (gs.rain?.phase === 'active' ? 1 : 0);
  const rainfall = weather?.rainfall ?? (gs.rain?.phase === 'active' ? 1 : 0);
  if (wetness <= 0) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(480, 140, 640, 760); ctx.clip();
  ctx.globalAlpha *= wetness;
  for (let i = 0; i < 24; i++) {
    const x = 510 + rand(i * 71) * 580, y = 180 + rand(i * 97) * 710;
    const width = 12 + rand(i * 31) * 55;
    ctx.fillStyle = 'rgba(131,159,163,.17)'; ctx.beginPath(); ctx.ellipse(x, y, width, width * 0.14, -0.05, 0, Math.PI * 2); ctx.fill();
    const p = motion ? (t * 1.7 + rand(i * 113)) % 1 : 0.6;
    ctx.strokeStyle = `rgba(201,217,208,${(1-p)*0.26*rainfall})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y, 2 + p * 17, 1 + p * 4, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

export function drawRain(ctx: CanvasRenderingContext2D, gs: GameState, t: number, motion: boolean, weather?: WeatherPresentation) {
  const intensity = weather?.rainfall ?? (gs.rain?.phase === 'active' ? 1 : 0);
  const cloud = weather?.cloud ?? (gs.rain?.phase === 'active' ? 1 : 0);
  if (intensity <= 0 && cloud <= 0) return;
  ctx.save();
  // Called after world actors and before nameplates/HUD: cloud cover changes
  // the whole scene's light consistently without dimming gameplay information.
  ctx.fillStyle = `rgba(35,51,66,${cloud * .3})`; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  if (weather?.clearing) {
    ctx.fillStyle = `rgba(255,215,147,${Math.sin(cloud * Math.PI) * .09})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  ctx.globalAlpha *= intensity;
  ctx.lineCap = 'round';
  const slant = gs.strongWind.phase === 'active' ? (gs.strongWind.direction === 'up' ? -15 : 15) : -6;
  for (let i = 0; i < (motion ? 170 : 65); i++) {
    const speed = 440 + rand(i * 67) * 320;
    const y = (rand(i * 19) * 1020 + (motion ? t * speed : 0)) % 1020 - 60;
    const x = rand(i * 43) * CANVAS_W;
    const len = 12 + rand(i * 101) * 17;
    ctx.strokeStyle = `rgba(196,217,220,${0.18+rand(i*7)*0.22})`; ctx.lineWidth = 0.9 + rand(i * 29) * 0.9;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + slant, y + len); ctx.stroke();
  }
  ctx.restore();
}
