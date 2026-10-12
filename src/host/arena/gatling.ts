import type { GatlingManState, GatlingTarget, WalkingWomanState } from '../../../shared/types';
import { GATLING_STOP_Y, gatlingPosition, gatlingCrushAge, gatlingCrushTrail, presentGatlingWoman } from '../../../shared/gatlingGeometry';
import { bulletLaneFeet, clamp01, type Layout } from './layout';
export { gatlingMuzzlePoint } from '../../../shared/gatlingGeometry';

type V3 = [number, number, number];
type Point = { x: number; y: number; depth: number };
type Face = { points: Point[]; fill: string; outline: boolean; depth: number };
const TAU = Math.PI * 2;
const FLOOR = 0.46;
const HEIGHT = 0.89;
const MOUNT = 103;
const MUZZLE = 137;

const project = ([x, y, z]: V3): Point => ({ x, y: z * FLOOR - y * HEIGHT, depth: z * HEIGHT + y * FLOOR });
const cartPoint = (x: number, y: number, z: number): V3 => {
  const a = 0.36;
  return [x * Math.cos(a) + z * Math.sin(a), y, z * Math.cos(a) - x * Math.sin(a)];
};

let gunner: HTMLImageElement | undefined;
if (typeof Image !== 'undefined') {
  gunner = new Image();
  gunner.src = '/characters/gatling-gunner.png';
}

/** Departure completes before the next planning round (2600 ms), including
 * late-joining hosts. Travel follows the server clock, not the slowed FX clock. */
export function gatlingTravel(roundProgress: number, resolutionElapsed = -1, motion = true) {
  const { arrival, departure, scale, y, p } = gatlingPosition(roundProgress, resolutionElapsed);
  return { p: motion ? p : 1, scale: motion ? scale : 0.9,
    y: motion ? y : GATLING_STOP_Y,
    // With motion on the entire cart has crossed the bottom edge before hiding.
    alpha: motion ? Number(departure < 1) : 1 - clamp01((departure - 0.75) / 0.25),
    rolling: motion && (arrival < 1 || (departure > 0 && departure < 1)) };
}

/** The server reserves the crushed body's destination. Visually flatten/push it
 * only when the wheels reach it, including bodies in the lower half on departure. */
export function gatlingWomanFrame(L: Layout, woman: WalkingWomanState, gatling: GatlingManState, roundProgress: number, elapsed: number, motion: boolean, roundMs = 4000) {
  const hit = woman.gatlingCrush;
  const age = hit ? gatlingCrushAge(hit, roundProgress, elapsed, roundMs) : -Infinity;
  if (gatling.phase !== 'active' || !hit || age < 0) {
    return { woman: presentGatlingWoman(woman, roundProgress, elapsed, roundMs), progress: roundProgress, crush: undefined };
  }
  // A presented snapshot can still carry the pre-contact pose for a few ms.
  // Derive the resolved position from the event, never from that transient pose.
  const resolved: WalkingWomanState = { ...woman, phase: 'dead', crushedByGatling: true,
    fromSlot: hit.slot, slot: hit.slot + 1, direction: 'down',
    bloodTrail: gatlingCrushTrail(hit),
  };
  const cart = gatlingPosition(roundProgress, elapsed);
  const push = clamp01((cart.contactY - bulletLaneFeet(L, hit.slot)) / L.slotHeight);
  return { woman: resolved, progress: motion ? push : 1, crush: {
    fall: hit.before.phase === 'walking' ? (motion ? clamp01(age / 190) : 1) : 1,
    compression: motion ? clamp01(age / 220) : 1,
    dust: motion ? 1 - clamp01(age / 400) : 0,
    bump: motion && age < 220 ? Math.sin(clamp01(age / 220) * Math.PI) : 0,
  } };
}

/** One projection is used for both the drawn muzzle and spawned bullets. */
function pose(L: Layout, target: GatlingTarget, progress: number, elapsed = -1, motion = true) {
  const travel = gatlingTravel(progress, elapsed, motion);
  const { scale, y } = travel;
  const x = L.midX;
  const pivotY = y - MOUNT * HEIGHT * scale;
  const dx = (target.team === 'sheriffs' ? L.sheriffX : L.outlawX) - x;
  const dy = bulletLaneFeet(L, target.slot) - 72 * L.s - pivotY;
  const yaw = Math.atan2(dx, dy / FLOOR);
  const point = (length: number, height: number, side: number): V3 => [
    Math.sin(yaw) * length + Math.cos(yaw) * side,
    MOUNT + height,
    Math.cos(yaw) * length - Math.sin(yaw) * side,
  ];
  return { ...travel, x, point };
}

function lit(hex: string, points: V3[]) {
  const [a, b, c] = points;
  const u = b.map((v, i) => v - a[i]);
  const v = c.map((n, i) => n - a[i]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n) || 1;
  const brightness = 0.69 + 0.34 * Math.abs((-0.35 * n[0] + 0.82 * n[1] + 0.45 * n[2]) / len);
  const rgb = [1, 3, 5].map(i => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * brightness)));
  return `rgb(${rgb.join(',')})`;
}

/** Small painter-sorted mesh keeps wheels, barrel bores and feed box on the
 * same ground plane. No screen-space rotation of an upright gun silhouette. */
class Mesh {
  faces: Face[] = [];
  face(points: V3[], color: string, outline = true) {
    const projected = points.map(project);
    this.faces.push({ points: projected, fill: lit(color, points), outline, depth: projected.reduce((sum, p) => sum + p.depth, 0) / points.length });
  }
  box(point: (x: number, y: number, z: number) => V3, lo: V3, hi: V3, color: string) {
    const [x, y, z] = lo, [X, Y, Z] = hi;
    const v = [[x,y,z],[X,y,z],[X,Y,z],[x,Y,z],[x,y,Z],[X,y,Z],[X,Y,Z],[x,Y,Z]].map(p => point(p[0], p[1], p[2]));
    for (const ids of [[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]]) this.face(ids.map(i => v[i]), color);
  }
  cylinder(point: (length: number, y: number, side: number) => V3, from: number, to: number, radius: number, color: string, segments = 16, capped = true) {
    const ring = (l: number) => Array.from({length: segments}, (_, i) => point(l, Math.sin(i * TAU / segments) * radius, Math.cos(i * TAU / segments) * radius));
    const a = ring(from), b = ring(to);
    for (let i = 0; i < segments; i++) this.face([a[i], b[i], b[(i+1)%segments], a[(i+1)%segments]], color, false);
    if (capped) { this.face(a, color); this.face(b, color); }
  }
  draw(ctx: CanvasRenderingContext2D) {
    this.faces.sort((a,b) => a.depth - b.depth);
    for (const f of this.faces) {
      ctx.beginPath(); ctx.moveTo(f.points[0].x, f.points[0].y);
      for (const p of f.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.closePath(); ctx.fillStyle = f.fill; ctx.fill();
      if (f.outline) { ctx.strokeStyle = '#241c17'; ctx.lineWidth = 1.3; ctx.stroke(); }
    }
  }
}

function wheel(mesh: Mesh, x: number, spin: number) {
  const point = (width: number, y: number, z: number) => cartPoint(x + width, 41 + y, z);
  mesh.cylinder(point, -5, 5, 40, '#303534', 24, false);
  // Rings expose the spokes and their thickness instead of a solid disk.
  for (const w of [-5, 5]) {
    for (let i = 0; i < 24; i++) {
      const a = i * TAU / 24, b = (i+1) * TAU / 24;
      mesh.face([point(w,Math.sin(a)*40,Math.cos(a)*40),point(w,Math.sin(b)*40,Math.cos(b)*40),point(w,Math.sin(b)*34,Math.cos(b)*34),point(w,Math.sin(a)*34,Math.cos(a)*34)], '#af7948', false);
    }
    for (let i = 0; i < 12; i++) {
      const a = spin + i * TAU / 12;
      const beam = (r: number, offset: number, thickness: number) => point(w+thickness, Math.sin(a)*r+Math.cos(a)*offset, Math.cos(a)*r-Math.sin(a)*offset);
      mesh.box(beam, [7,-1.6,-1.2], [34,1.6,1.2], '#b6814e');
    }
  }
  mesh.cylinder(point, -8, 8, 8, '#936438', 12);
  mesh.cylinder(point, -10, 10, 3.5, '#b7b5a0', 10);
}

function carriage(mesh: Mesh, spin: number) {
  mesh.box(cartPoint, [-12,18,-98], [12,27,12], '#704728');
  mesh.box(cartPoint, [-68,36,-4], [68,43,4], '#454d4b');
  mesh.box(cartPoint, [-49,33,-36], [49,42,25], '#764c2d');
  for (let i = 0; i < 5; i++) mesh.box(cartPoint, [-48+i*19,42,-36], [-31+i*19,46,25], '#ae7945');
  for (const x of [-36,36]) mesh.box(cartPoint, [x-3,46,-36], [x+3,49,25], '#3f4845');
  // Bronze pedestal and fork supporting the swivel, plus a dark ammunition box.
  mesh.box(cartPoint, [-11,47,-11], [11,79,11], '#7e6743');
  mesh.box(cartPoint, [-22,77,-12], [22,82,12], '#c59a50');
  for (const x of [-22,18]) mesh.box(cartPoint, [x,80,-9], [x+4,104,9], '#cda25a');
  mesh.box(cartPoint, [-42,47,-32], [-16,69,-6], '#5b6148');
  mesh.box(cartPoint, [-44,68,-34], [-14,72,-4], '#c19a56');
  wheel(mesh, -65, spin); wheel(mesh, 65, spin);
}

function barrels(mesh: Mesh, point: ReturnType<typeof pose>['point'], spin: number, recoil: number) {
  const gun = (l: number, y: number, s: number) => point(l - recoil, y, s);
  // Broad brass breech, machined collars, open steel barrels and a gravity hopper.
  mesh.cylinder(gun, -27, 18, 20, '#c1984d', 20);
  mesh.cylinder(gun, -30, -25, 22, '#8e7444', 20);
  mesh.cylinder(gun, 16, 23, 19, '#d7b469', 20);
  mesh.box(gun, [-13,17,-12], [7,39,12], '#b99451');
  mesh.box(gun, [-16,37,-15], [10,43,15], '#e3be75');
  mesh.box(gun, [-13,42,-12], [7,44,12], '#37342c');
  for (let i = 0; i < 6; i++) {
    const a = spin + i * TAU / 6;
    const y = Math.sin(a) * 10, side = Math.cos(a) * 10;
    const tube = (l: number, dy: number, ds: number) => gun(l, y+dy, side+ds);
    mesh.cylinder(tube, 21, MUZZLE, 3.6, '#647572', 10);
    // Recessed bores at the projected front, individually visible in three-quarter view.
    mesh.cylinder(tube, MUZZLE+0.1, MUZZLE+0.4, 2.5, '#151e20', 10);
  }
  mesh.cylinder(gun, 48, 54, 15, '#ba9149', 20);
  mesh.cylinder(gun, 113, 120, 15, '#ceab62', 20);
  // Side-mounted crank remains upright while the barrel assembly swivels.
  const crank = (l: number, y: number, s: number) => gun(-10+l, y, s);
  mesh.box(crank, [-3,-3,18], [3,3,33], '#404944');
  const arm = (r: number, width: number, side: number) => crank(Math.sin(spin)*r+Math.cos(spin)*width, Math.cos(spin)*r-Math.sin(spin)*width, side);
  mesh.box(arm, [0,-2,31], [15,2,35], '#b38b46');
  mesh.box(arm, [12,-3,33], [18,3,47], '#68462e');
}

export function drawGatlingMan(ctx: CanvasRenderingContext2D, L: Layout, state: GatlingManState, t: number, motion: boolean, target: GatlingTarget | null, roundProgress: number, firing: boolean, resolutionElapsed = -1, impactBump = 0) {
  if (state.phase !== 'active') return;
  const g = pose(L, target ?? {team: 'outlaws', slot: Math.floor(L.n/2)}, roundProgress, resolutionElapsed, motion);
  if (g.alpha <= 0) return;
  const kick = firing && motion ? Math.max(0, Math.sin(t * 78)) * 3.6 : 0;
  const bounce = motion ? (g.rolling ? Math.sin(g.p * 60) * 1.8 : 0) + kick * 0.28 - impactBump * 4 : 0;
  ctx.save(); ctx.translate(g.x, g.y + bounce); ctx.scale(g.scale, g.scale);
  ctx.globalAlpha *= g.alpha;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const shadow = ctx.createRadialGradient(0,0,8,0,0,112);
  shadow.addColorStop(0,'rgba(22,16,11,0.48)'); shadow.addColorStop(1,'rgba(22,16,11,0)');
  ctx.save(); ctx.scale(1,0.36); ctx.fillStyle = shadow; ctx.beginPath(); ctx.arc(0,0,112,0,TAU); ctx.fill(); ctx.restore();
  if (g.rolling) {
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const drift = (t * 0.7 + i * 0.137) % 1;
      ctx.globalAlpha = g.alpha * (1-drift) * 0.14;
      ctx.fillStyle = '#c8a570'; ctx.beginPath(); ctx.ellipse((i%2 ? 65 : -65) + Math.sin(i)*drift*24, -drift*35, 7+drift*22, 4+drift*9, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // The operator's coat stays behind the mount; slight recoil travels through him.
  if (gunner?.complete && gunner.naturalWidth) {
    ctx.save(); ctx.translate(-10-kick*0.25,-kick*0.2);
    ctx.drawImage(gunner,-89,-227,142,171); ctx.restore();
  }
  const mesh = new Mesh();
  carriage(mesh, motion ? g.p * TAU * 3 : 0);
  barrels(mesh, g.point, firing && motion ? t * 36 : 0.35, kick);
  mesh.draw(ctx);
  ctx.restore();
}
