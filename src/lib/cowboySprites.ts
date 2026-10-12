import type { Team } from '../../shared/types';
import type { CowboyPose } from './cowboyDraw';
import { COWBOY_SPRITE_SCALE, cowboyCoverPose } from './cowboyPose';

type Point = readonly [number, number];
type Rig = { origin: Point; armJoint: Point; hips: [Point, Point]; knees: [Point, Point]; arm: Point[]; legs: [Point[], Point[]]; tails: [Point[], Point[]]; restingHand: Point[]; hat: Point[]; bounds: Point[] };
// Source-space joints keep the approved illustration intact. Only presentation
// transforms move; all combat positions, choices and reveal times remain shared.
const rigs: Record<Team, Rig> = {
  sheriffs: {
    origin: [340, 523], armJoint: [481, 360], hips: [[301, 595], [392, 595]],
    knees: [[262, 780], [483, 777]],
    tails: [ [[156,597],[243,590],[263,617],[228,735],[184,835],[145,821],[133,790]], [[421,562],[476,584],[515,644],[570,690],[638,751],[623,800],[582,814],[555,747],[492,662]] ],
    restingHand: [[78,531],[184,529],[198,599],[172,638],[180,686],[148,712],[110,698],[83,665],[72,603]],
    bounds: [[0,0],[825,0],[825,450],[750,460],[750,1024],[0,1024]],
    arm: [[460,305],[541,307],[590,339],[619,338],[640,294],[825,280],[825,410],[710,437],[660,475],[611,478],[515,451],[462,407]],
    legs: [ [[275,590],[360,588],[377,653],[325,858],[307,982],[177,990],[189,893],[223,749]], [[364,591],[438,571],[584,882],[699,966],[695,991],[448,995],[463,894],[346,668]] ],
    hat: [[174,133],[267,133],[282,86],[435,44],[457,83],[473,146],[550,137],[567,157],[529,202],[440,206],[269,220],[187,202],[175,178]],
  },
  outlaws: {
    origin: [1049,523], armJoint: [1166,359], hips: [[1009,594],[1096,594]],
    knees: [[955,780],[1185,777]],
    tails: [ [[851,567],[941,574],[980,596],[935,690],[895,788],[863,825],[840,793]], [[1130,549],[1180,573],[1220,629],[1273,681],[1354,735],[1347,780],[1317,766],[1304,794],[1250,771],[1200,692]] ],
    restingHand: [[796,544],[899,543],[915,599],[887,629],[887,680],[863,707],[828,696],[805,670],[790,611]],
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
const SCALE = COWBOY_SPRITE_SCALE;
function piece(ctx: CanvasRenderingContext2D, region: Point[], joint?: Point, rotation = 0, scaleX = 1) {
  ctx.save();
  if (joint) { ctx.translate(...joint); ctx.rotate(rotation); ctx.scale(scaleX, 1); ctx.translate(-joint[0], -joint[1]); }
  ctx.beginPath(); path(ctx, region); ctx.clip(); ctx.drawImage(source!, 0, 0, 1536, 1024); ctx.restore();
}
function bentLeg(ctx: CanvasRenderingContext2D, r: Rig, leg: 0 | 1, thigh: number, shin: number) {
  const hip = r.hips[leg], knee = r.knees[leg];
  ctx.save();
  ctx.translate(...hip); ctx.rotate(thigh); ctx.translate(-hip[0], -hip[1]);
  // Overlap the two rigid pieces around the knee so flexion never opens a seam.
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1536, knee[1] + 9); ctx.clip();
  piece(ctx, r.legs[leg]); ctx.restore();
  ctx.translate(...knee); ctx.rotate(shin - thigh); ctx.translate(-knee[0], -knee[1]);
  ctx.beginPath(); ctx.rect(0, knee[1] - 9, 1536, 1024); ctx.clip();
  piece(ctx, r.legs[leg]);
  ctx.restore();
}
function torso(ctx: CanvasRenderingContext2D, r: Rig, hat = true) {
  ctx.save();
  ctx.beginPath(); path(ctx, r.bounds); ctx.clip();
  // Subtract a union: overlapping cutouts must not leave floating trouser bits.
  for (const region of [r.arm, ...r.legs, ...(!hat ? [r.hat] : [])]) {
    ctx.beginPath(); ctx.rect(0, 0, 1536, 1024); path(ctx, region); ctx.clip('evenodd');
  }
  ctx.drawImage(source!, 0, 0, 1536, 1024); ctx.restore();
}
function coatTails(ctx: CanvasRenderingContext2D, r: Rig, cover: number) {
  for (const leg of [0, 1] as const) {
    ctx.save();
    const hip = r.hips[leg];
    ctx.translate(...hip); ctx.rotate((leg ? -0.7 : 0.28) * cover); ctx.translate(-hip[0], -hip[1]);
    piece(ctx, r.tails[leg]); ctx.restore();
  }
}
export function drawSpriteCowboy(ctx: CanvasRenderingContext2D, team: Team, facing: 1 | -1, time: number, seed: number, pose: CowboyPose): boolean {
  if (!ready || !source) return false;
  const r = rigs[team], walk = pose.walk || 0, recoil = pose.recoil || 0, suicide = pose.suicide || 0;
  const kneel = cowboyCoverPose(pose.cover);
  ctx.save();
  ctx.scale(facing, 1);
  ctx.translate(-recoil * 4, Math.sin(time * 2 + seed) * .65 - Math.abs(walk) * 1.4);
  ctx.scale(SCALE, SCALE);
  ctx.translate(-r.origin[0], -r.origin[1] + kneel.drop);
  if (kneel.cover > 0) coatTails(ctx, r, kneel.cover);
  bentLeg(ctx, r, 0, kneel.rearThigh + walk * .11 * (1 - kneel.cover), kneel.rearShin + walk * .11 * (1 - kneel.cover));
  bentLeg(ctx, r, 1, kneel.frontThigh - walk * .11 * (1 - kneel.cover), kneel.frontShin - walk * .11 * (1 - kneel.cover));
  ctx.save();
  // In cover the long coat folds with the thighs instead of passing through
  // the knees/floor. Head, chest, hands and belt retain their original size.
  ctx.beginPath(); ctx.rect(0, 0, 1536, kneel.cover > 0 ? 615 : 1024); ctx.clip();
  torso(ctx, r, pose.hat !== false); ctx.restore();
  if (kneel.cover > 0) piece(ctx, r.restingHand);
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
