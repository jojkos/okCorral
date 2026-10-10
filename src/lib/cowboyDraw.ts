import type { Team } from '../../shared/types';

export const COL = {
  sheriff: '#549d9d',
  sheriffDark: '#285462',
  sheriffLight: '#a6ddd2',
  outlaw: '#b86248',
  outlawDark: '#663931',
  outlawLight: '#f0b398',
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

// Articulated vector character. Poses are presentation-only.
export interface CowboyPose { walk?: number; recoil?: number; reload?: number; cover?: number }
export function drawCowboy(ctx: CanvasRenderingContext2D, team: Team, facing: 1 | -1, time: number, seed = 0, pose: CowboyPose = {}) {
  const law = team === 'sheriffs';
  const coat = law ? COL.sheriff : COL.outlaw;
  const dark = law ? COL.sheriffDark : COL.outlawDark;
  const light = law ? COL.sheriffLight : COL.outlawLight;
  const skin = ['#d9a87c', '#bc865e', '#e5b78e'][Math.abs(seed) % 3];
  const walk = pose.walk || 0, recoil = pose.recoil || 0, reload = pose.reload || 0;
  const breath = Math.sin(time * 2 + seed) * .8;
  const path = (points: number[][], fill: string) => {
    ctx.fillStyle = fill; ctx.beginPath(); points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.fill();
  };
  ctx.save(); ctx.scale(facing * .95, .95); ctx.translate(-recoil * 6, breath - Math.abs(walk) * 3);
  // Back leg and front leg take alternating steps; boots have a heel and toe.
  for (const [x, step] of [[-11,walk],[8,-walk]]) {
    ctx.save(); ctx.translate(x, 24); ctx.rotate(step * .26);
    roundRect(ctx,-6,0,13,30,4); ctx.fillStyle='#2b3033'; ctx.fill();
    ctx.fillStyle='#475052'; ctx.fillRect(-5,3,3,23);
    path([[-7,26],[7,26],[8,37],[15,40],[15,45],[-8,45]],'#1a252b');
    ctx.fillStyle='#c58a52'; ctx.fillRect(-8,43,23,2); ctx.restore();
  }
  // Long coat tails, swinging with the step.
  path([[-22,-12],[18,-12],[27+walk*3,43],[8,39],[0,24],[-12,42],[-29-walk*3,39]],dark);
  path([[-21,-10],[19,-10],[20,24],[-21,25]],coat);
  path([[-9,-12],[9,-12],[9,24],[-8,24]],'#ecd8b1');
  path([[-21,-13],[-8,-15],[-3,6],[-15,-1]],light);
  path([[9,-14],[20,-10],[13,7],[4,1]],dark);
  for(let i=0;i<3;i++){ctx.fillStyle='#7f6346';ctx.beginPath();ctx.arc(2,3+i*7,1.5,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#332b28';ctx.fillRect(-22,21,44,7);ctx.fillStyle=COL.gold;ctx.fillRect(-4,21,9,7);ctx.fillStyle='#755239';ctx.fillRect(-2,23,5,3);
  path([[13,27],[23,26],[22,40],[14,43]],'#624636');
  // Back arm at the belt.
  ctx.save();ctx.translate(-20,-6);ctx.rotate(-.15+Math.sin(time*2+seed)*.025);
  roundRect(ctx,-8,0,12,27,5);ctx.fillStyle=dark;ctx.fill();ctx.fillStyle=skin;roundRect(ctx,-7,22,10,9,3);ctx.fill();ctx.restore();
  // Gun arm: recoil pivots at shoulder; reloading lowers the revolver.
  ctx.save();ctx.translate(14,-5);ctx.rotate(-recoil*.3+reload*.95);
  roundRect(ctx,0,-5,25,12,5);ctx.fillStyle=coat;ctx.fill();ctx.fillStyle=light;ctx.fillRect(3,-5,19,2);
  roundRect(ctx,23,-4,10,10,3);ctx.fillStyle=skin;ctx.fill();drawRevolver(ctx,30,0);ctx.restore();
  // Neck, scarf, angular face, ear and hat shadow.
  ctx.fillStyle=skin;ctx.fillRect(-6,-23,12,12);
  roundRect(ctx,-12,-43,25,27,8);ctx.fillStyle=skin;ctx.fill();
  path([[-12,-34],[-5,-32],[-5,-20],[7,-16],[-6,-16],[-13,-22]],'#916348');
  ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(13,-29,4,5,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#2c2926';ctx.fillRect(-9,-35,23,7);ctx.fillStyle='#f6e4c4';ctx.fillRect(4,-29,5,2);
  if(law){path([[-5,-22],[10,-23],[7,-19],[-4,-19]],'#714735');}
  else {path([[-11,-25],[11,-24],[10,-15],[-9,-15]],'#332a2b');ctx.fillStyle='#d19576';ctx.fillRect(4,-25,5,2);}
  path([[-10,-16],[10,-15],[3,-8],[-9,-10]],light);
  path([[-8,-12],[-13,-7],[-9,6],[-4,-7]],coat);
  // Broad curved brim, shaped crown, leather band, warm rim light.
  ctx.fillStyle=law?'#ad8253':'#313338';ctx.beginPath();ctx.ellipse(0,-42,29,6,-.08,0,Math.PI*2);ctx.fill();
  path([[-17,-43],[-14,-61],[-5,-65],[2,-60],[10,-64],[17,-44]],law?'#c29964':'#464449');
  path([[-14,-60],[-5,-64],[-3,-45],[-17,-44]],law?'#967044':'#252e34');
  ctx.fillStyle=law?'#654a36':'#af674a';ctx.fillRect(-16,-47,33,5);
  ctx.strokeStyle=law?'#ecd09a':'#b6a08c';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,-42,29,6,-.08,0,Math.PI);ctx.stroke();
  if(law)drawStar(ctx,-12,0,6,2.8,COL.goldBright);
  else {ctx.strokeStyle='#f2d3a8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-15,-2);ctx.lineTo(-7,5);ctx.moveTo(-7,-2);ctx.lineTo(-15,5);ctx.stroke();}
  ctx.restore();
}
