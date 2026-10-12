import { useEffect, useRef } from 'react';
import type { Team } from '../../shared/types';
import { reducedMotion } from '../lib/motionPreferences';
import { drawCowboy } from '../lib/cowboyDraw';

// The cowboy is drawn around origin (0,0) with bounds roughly
// y: -61 (hat top) to y: +66 (boots), x: -30 to +61 (revolver).
// Logical canvas box is a fixed 140×180 centered on origin, then scaled
// to the requested pixel size preserving aspect ratio.
const LOGICAL_W = 140;
const LOGICAL_H = 180;

interface CowboyPortraitProps {
  team: Team;
  size?: number; // height in CSS pixels
  facing?: 1 | -1;
  seed?: number;
  animated?: boolean;
}

export default function CowboyPortrait({
  team,
  size = 140,
  facing = 1,
  seed = 0,
  animated = true,
}: CowboyPortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1) * Math.max(1, size / LOGICAL_H);
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
      // Center origin in the logical box; place cowboy slightly below middle
      // so the hat fits above and the boots fit below.
      ctx.save();
      ctx.translate(LOGICAL_W / 2, LOGICAL_H / 2 + 18);
      // Feathered contact shadow keeps the two boot silhouettes distinct.
      const shadow = ctx.createRadialGradient(0, 0, 2, 0, 0, 31);
      shadow.addColorStop(0, 'rgba(8,17,22,0.34)');
      shadow.addColorStop(0.55, 'rgba(8,17,22,0.20)');
      shadow.addColorStop(1, 'rgba(8,17,22,0)');
      ctx.save();
      ctx.translate(2 * facing, 68);
      ctx.scale(1, 0.2);
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(0, 0, 31, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawCowboy(ctx, team, facing, animated && !reducedMotion() ? t / 1000 : 0, seed);
      ctx.restore();
      if (animated) rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [team, facing, seed, animated, size]);

  const height = size;
  const width = Math.round((LOGICAL_W / LOGICAL_H) * size);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        display: 'block',
        imageRendering: 'auto',
      }}
    />
  );
}
