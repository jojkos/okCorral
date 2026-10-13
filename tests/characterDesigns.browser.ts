import { CHARACTER_DESIGNS } from '../shared/characterDesigns';
import { drawCowboy, drawHat } from '../src/lib/cowboyDraw';
import type { AnimationCase } from './animationCases';

export const characterDesignCases: AnimationCase[] = (['sheriffs', 'outlaws'] as const).flatMap(team =>
  (['idle', 'kneel', 'reload', 'recoil', 'hatless', 'loose hats'] as const).map(pose => ({
    name: `Wardrobe ${team} ${pose}`,
    draw(ctx, p) {
      for (const design of CHARACTER_DESIGNS[team]) {
        const x = 200 + (design.id % 4) * 400, y = 205 + Math.floor(design.id / 4) * 430;
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = team === 'sheriffs' ? '#153646' : '#4d2425';
        ctx.fillRect(-180, -180, 360, 390);
        ctx.fillStyle = '#f0dfbd'; ctx.textAlign = 'center'; ctx.font = '24px sans-serif';
        ctx.fillText(design.name, 0, 194);
        ctx.scale(2.25, 2.25);
        if (pose === 'loose hats') { ctx.rotate(p * 3); drawHat(ctx, team, design.id); }
        else drawCowboy(ctx, team, team === 'sheriffs' ? 1 : -1, p * 3, design.id, {
          appearance: design.id, cover: pose === 'kneel' ? p : 0,
          hat: pose !== 'hatless',
          reload: pose === 'reload' ? p : 0, recoil: pose === 'recoil' ? p : 0,
        });
        ctx.restore();
      }
    },
  })));
