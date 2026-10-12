import type { Team } from '../../shared/types';
import type { CowboyPose } from './cowboyDraw';

type Point = readonly [number, number];
type Rig = { origin: Point; armJoint: Point; hips: [Point, Point]; arm: Point[]; legs: [Point[], Point[]]; hat: Point[]; bounds: Point[] };
// Source-space joints keep the approved illustration intact. Only presentation
// transforms move; all combat positions, choices and reveal times remain shared.
const rigs: Record<Team, Rig> = {
  sheriffs: {
    origin: [340, 523], armJoint: [481, 360], hips: [[301, 595], [392, 595]],
    bounds: [[0,0],[825,0],[825,450],[750,460],[750,1024],[0,1024]],
    arm: [[460,305],[541,307],[590,339],[619,338],[640,294],[825,280],[825,410],[710,437],[660,475],[611,478],[515,451],[462,407]],
    legs: [ [[275,590],[360,588],[377,653],[325,858],[307,982],[177,990],[189,893],[223,749]], [[364,591],[438,571],[584,882],[699,966],[695,991],[448,995],[463,894],[346,668]] ],
    hat: [[174,133],[267,133],[282,86],[435,44],[457,83],[473,146],[550,137],[567,157],[529,202],[440,206],[269,220],[187,202],[175,178]],
  },
  outlaws: {
    origin: [1049,523], armJoint: [1166,359], hips: [[1009,594],[1096,594]],
    bounds: [[825,0],[1536,0],[1536,1024],[750,1024],[750,460],[825,450]],
    arm: [[1134,306],[1196,307],[1252,349],[1304,347],[1326,305],[1517,281],[1536,408],[1405,435],[1366,474],[1300,485],[1204,449],[1145,417]],
    legs: [ [[993,595],[1077,578],[1113,648],[1025,884],[1017,984],[853,991],[865,890],[918,694]], [[1072,592],[1138,578],[1277,888],[1404,963],[1399,990],[1201,996],[1196,904],[1054,667]] ],
    hat: [[879,151],[941,117],[945,76],[1088,20],[1124,43],[1153,96],[1216,88],[1223,110],[1168,142],[1047,174],[951,191],[895,182],[877,165]],
  },
};
const path = (ctx: CanvasRenderingContext2D, points: Point[]) => { ctx.moveTo(...points[0]); for (const p of points.slice(1)) ctx.lineTo(...p); ctx.closePath(); };
let source: HTMLImageElement | undefined;
let ready = false;
if (typeof Image !== 'undefined') {
  source = new Image();
  source.onload = () => { ready = true; };
  source.src = '/characters/gunslingers.webp';
}
const SCALE = 128 / 930;
function piece(ctx: CanvasRenderingContext2D, region: Point[], joint?: Point, rotation = 0, scaleX = 1) {
  ctx.save();
  if (joint) { ctx.translate(...joint); ctx.rotate(rotation); ctx.scale(scaleX, 1); ctx.translate(-joint[0], -joint[1]); }
  ctx.beginPath(); path(ctx, region); ctx.clip(); ctx.drawImage(source!, 0, 0, 1536, 1024); ctx.restore();
}
export function drawSpriteCowboy(ctx: CanvasRenderingContext2D, team: Team, facing: 1 | -1, time: number, seed: number, pose: CowboyPose): boolean {
  if (!ready || !source) return false;
  const r = rigs[team], walk = pose.walk || 0, recoil = pose.recoil || 0, suicide = pose.suicide || 0;
  ctx.save();
  ctx.scale(facing, 1);
  ctx.translate(-recoil * 4, Math.sin(time * 2 + seed) * .65 - Math.abs(walk) * 1.4);
  ctx.scale(SCALE, SCALE);
  ctx.translate(-r.origin[0], -r.origin[1]);
  piece(ctx, r.legs[0], r.hips[0], walk * .11);
  piece(ctx, r.legs[1], r.hips[1], -walk * .11);
  ctx.save();
  ctx.beginPath(); path(ctx, r.bounds); path(ctx, r.arm); path(ctx, r.legs[0]); path(ctx, r.legs[1]);
  if (pose.hat === false) path(ctx, r.hat);
  ctx.clip('evenodd'); ctx.drawImage(source, 0, 0, 1536, 1024); ctx.restore();
  // A small shoulder turn gives recoil and reload their original event-driven motion.
  piece(ctx, r.arm, r.armJoint, -recoil * .13 - (pose.reload || 0) * .65 - suicide * 1.75, 1 - suicide * .48);
  ctx.restore();
  return true;
}
export function drawSpriteHat(ctx: CanvasRenderingContext2D, team: Team): boolean {
  if (!ready || !source) return false;
  const r = rigs[team];
  ctx.save(); ctx.scale(SCALE, SCALE);
  ctx.translate(-r.origin[0], -(team === 'sheriffs' ? 181 : 135));
  piece(ctx, r.hat); ctx.restore(); return true;
}
