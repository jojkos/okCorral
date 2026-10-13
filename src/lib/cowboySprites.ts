import type { Team } from '../../shared/types';
import type { CowboyPose } from './cowboyDraw';
import { COWBOY_SPRITE_SCALE, cowboyCoverPose } from './cowboyPose';
import { getCharacterDesign } from '../../shared/characterDesigns';

type Point = readonly [number, number];
type Rig = { origin: Point; armJoint: Point; hips: [Point, Point]; knees: [Point, Point]; arm: Point[]; legs: [Point[], Point[]]; tails: [Point[], Point[]]; restingHand: Point[]; bounds: Point[] };
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
  },
  outlaws: {
    origin: [1049,523], armJoint: [1166,359], hips: [[1009,594],[1096,594]],
    knees: [[955,780],[1185,777]],
    tails: [ [[851,567],[941,574],[980,596],[935,690],[895,788],[863,825],[840,793]], [[1130,549],[1180,573],[1220,629],[1273,681],[1354,735],[1347,780],[1317,766],[1304,794],[1250,771],[1200,692]] ],
    restingHand: [[796,544],[899,543],[915,599],[887,629],[887,680],[863,707],[828,696],[805,670],[790,611]],
    bounds: [[825,0],[1536,0],[1536,1024],[750,1024],[750,460],[825,450]],
    arm: [[1134,306],[1196,307],[1252,349],[1304,347],[1326,305],[1517,281],[1536,408],[1405,435],[1366,474],[1300,485],[1204,449],[1145,417]],
    legs: [ [[993,595],[1077,578],[1113,648],[1025,884],[1017,984],[853,991],[865,890],[918,694]], [[1072,592],[1138,578],[1277,888],[1404,963],[1399,990],[1201,996],[1196,904],[1054,667]] ],
  },
};
type HatArtwork = { outline: Point[]; left: Point; right: Point; top: number; hair: string; shine: string };
function hatArtwork(contour: Point[], left: Point, right: Point, top: number, hair: string, shine: string): HatArtwork {
  const minX = Math.min(...contour.map(p => p[0])), maxX = Math.max(...contour.map(p => p[0]));
  const tip = contour.findIndex(p => p[0] === maxX);
  // Remove the whole space above the brim instead of following a tightly
  // traced crown: the source's antialiased ink extends beyond that contour.
  // Only the outer ends get a small gutter; the forehead/face line is exact.
  const lower = contour.slice(tip + 1).map(([x, y]): Point =>
    [x, y + (x < left[0] - 6 || x > right[0] + 6 ? 6 : 0)]);
  const outline: Point[] = [
    [minX - 24, -4], [maxX + 24, -4], [maxX + 24, contour[tip][1] + 10],
    ...lower, [minX - 24, contour[0][1] + 10],
  ];
  return { outline, left, right, top, hair, shine };
}
// Each atlas has a different brim. In particular the bowler and Rose's low
// brim sit well above the original mask: sharing that mask cuts away the eyes.
// These contours follow the visible hat/forehead boundary, not a bounding box.
// The same contour removes the worn hat and crops the flying one, so they can
// never leave a second brim behind or carry part of the face into the air.
const hats: Record<Team, HatArtwork[]> = {
  sheriffs: [
    hatArtwork([[173,167],[182,150],[206,139],[237,134],[272,136],[280,87],[308,73],[361,58],[415,55],[433,60],[440,77],[465,145],[507,139],[543,139],[558,146],[560,154],[551,168],[526,184],[489,197],[443,204],[441,179],[405,177],[367,174],[328,174],[298,179],[274,188],[276,216],[239,213],[208,205],[184,191]], [274,199], [440,182], 125, '#563b29', '#795237'),
    hatArtwork([[173,167],[183,148],[210,136],[242,133],[272,136],[281,86],[321,72],[375,56],[413,54],[432,60],[441,81],[465,145],[511,139],[546,139],[560,145],[563,152],[554,169],[527,185],[489,198],[441,205],[439,180],[398,176],[366,173],[328,173],[301,178],[280,184],[264,194],[267,217],[233,213],[207,204],[183,190]], [270,198], [440,182], 124, '#303035', '#626064'),
    hatArtwork([[167,153],[173,138],[191,124],[215,117],[247,114],[273,116],[282,73],[288,65],[324,54],[369,43],[410,38],[429,42],[436,57],[465,136],[516,124],[550,124],[564,129],[565,137],[558,147],[541,158],[514,170],[482,180],[465,186],[460,169],[442,166],[411,162],[377,158],[348,157],[319,159],[287,164],[267,171],[261,202],[232,198],[205,191],[182,178],[170,165]], [264,184], [449,170], 111, '#9d421c', '#cf6a2c'),
    hatArtwork([[169,172],[179,151],[204,138],[234,133],[271,135],[279,85],[315,70],[366,55],[408,49],[430,54],[439,68],[463,147],[506,136],[541,129],[555,132],[562,139],[558,151],[548,163],[527,173],[487,183],[443,186],[440,180],[398,176],[360,175],[329,176],[299,179],[276,185],[264,198],[263,214],[231,210],[204,203],[181,190]], [265,198], [441,182], 126, '#49382b', '#71503c'),
    hatArtwork([[216,182],[221,166],[238,153],[258,140],[258,110],[265,89],[281,72],[306,58],[340,49],[373,46],[404,51],[425,62],[439,81],[445,107],[449,134],[479,129],[489,134],[493,142],[486,155],[470,166],[445,175],[443,159],[410,158],[374,156],[337,158],[308,165],[285,174],[268,184],[260,207],[242,207],[224,198]], [262,190], [443,162], 113, '#d9d5ce', '#fff5e7'),
    hatArtwork([[169,177],[177,157],[198,143],[226,135],[273,135],[278,91],[289,82],[333,69],[382,57],[415,54],[429,59],[440,84],[465,145],[509,135],[542,131],[556,137],[558,145],[550,159],[530,173],[500,185],[470,196],[447,197],[440,181],[402,176],[350,174],[319,178],[290,186],[270,196],[256,208],[252,223],[224,219],[201,211],[182,198],[172,186]], [260,205], [440,184], 128, '#25262a', '#494548'),
    hatArtwork([[174,166],[182,146],[202,132],[228,126],[271,126],[276,79],[287,72],[334,53],[380,37],[413,33],[430,37],[439,60],[465,135],[510,121],[545,117],[562,121],[571,129],[569,140],[558,151],[538,164],[505,178],[470,191],[445,196],[442,170],[400,164],[362,161],[334,162],[302,166],[276,177],[273,207],[242,205],[216,198],[195,187],[178,175]], [274,191], [440,173], 111, '#575e63', '#91969a'),
    hatArtwork([[172,168],[180,150],[202,137],[232,129],[273,131],[280,88],[289,80],[333,66],[377,56],[415,54],[431,59],[441,84],[467,145],[510,137],[546,137],[559,143],[562,151],[554,165],[529,182],[490,198],[442,206],[440,179],[402,176],[365,173],[328,173],[299,178],[275,187],[275,216],[240,213],[209,204],[184,190]], [274,199], [440,182], 123, '#503626', '#79543a'),
  ],
  outlaws: [
    hatArtwork([[873,174],[878,157],[891,143],[913,130],[945,120],[945,78],[955,70],[998,49],[1045,28],[1073,22],[1088,29],[1119,103],[1162,91],[1194,87],[1210,91],[1214,98],[1207,109],[1188,123],[1160,137],[1131,146],[1112,151],[1104,134],[1060,137],[1018,142],[991,153],[970,166],[953,179],[945,194],[920,199],[894,194],[879,186]], [951,188], [1110,147], 93, '#292628', '#4c4543'),
    hatArtwork([[872,174],[879,155],[895,141],[919,128],[947,119],[945,78],[955,71],[1001,49],[1048,29],[1077,23],[1090,31],[1120,105],[1166,92],[1199,88],[1211,94],[1214,101],[1206,112],[1186,126],[1157,140],[1130,147],[1114,151],[1103,137],[1061,140],[1020,144],[994,155],[972,166],[951,184],[945,197],[918,200],[893,195],[878,185]], [948,189], [1110,146], 94, '#282729', '#464247'),
    hatArtwork([[867,177],[873,158],[889,142],[913,128],[944,119],[941,81],[950,71],[997,47],[1045,26],[1075,23],[1090,29],[1123,106],[1163,90],[1197,85],[1213,89],[1218,98],[1211,110],[1192,124],[1164,137],[1137,147],[1128,148],[1126,137],[1109,133],[1073,136],[1040,138],[1011,143],[987,157],[965,170],[948,181],[946,198],[919,200],[893,197],[875,189]], [950,185], [1114,146], 93, '#232326', '#444047'),
    hatArtwork([[860,175],[868,158],[891,140],[920,125],[946,119],[946,78],[955,70],[1001,49],[1049,29],[1070,19],[1084,24],[1094,45],[1119,103],[1159,91],[1195,85],[1211,89],[1215,98],[1207,111],[1187,125],[1158,137],[1126,146],[1110,150],[1103,138],[1064,141],[1018,146],[993,158],[970,171],[950,187],[945,199],[917,199],[891,193],[869,185]], [951,189], [1110,149], 97, '#78767a', '#aaa4a0'),
    hatArtwork([[914,169],[921,151],[937,136],[964,122],[965,94],[973,76],[990,61],[1015,46],[1047,37],[1079,36],[1108,42],[1125,53],[1137,73],[1143,100],[1148,120],[1173,113],[1190,114],[1196,121],[1192,134],[1180,145],[1164,153],[1143,156],[1130,144],[1097,144],[1069,141],[1042,143],[1015,151],[992,160],[974,175],[966,189],[947,192],[930,186],[918,179]], [966,181], [1135,149], 100, '#292628', '#4c4241'),
    hatArtwork([[864,177],[871,158],[887,141],[911,127],[947,116],[945,78],[955,70],[1000,48],[1048,28],[1074,22],[1090,28],[1122,105],[1165,85],[1198,80],[1209,84],[1214,93],[1210,105],[1190,120],[1168,133],[1142,145],[1127,148],[1125,136],[1107,133],[1075,137],[1041,139],[1013,145],[989,158],[968,172],[950,184],[935,201],[913,201],[891,197],[872,188]], [944,190], [1113,147], 94, '#a84110', '#d66b24'),
    hatArtwork([[864,176],[871,157],[885,142],[910,129],[941,124],[960,124],[962,82],[972,73],[1016,56],[1060,42],[1094,38],[1111,42],[1120,59],[1146,134],[1185,120],[1216,119],[1237,124],[1243,132],[1237,144],[1218,157],[1190,167],[1159,174],[1135,174],[1103,168],[1064,161],[1036,160],[1007,164],[982,173],[961,184],[947,198],[944,211],[918,208],[894,201],[874,189]], [949,194], [1132,175], 118, '#252529', '#464147'),
    hatArtwork([[865,173],[872,155],[888,139],[912,127],[947,119],[940,81],[951,71],[996,49],[1046,28],[1074,23],[1089,29],[1122,105],[1163,91],[1196,85],[1210,89],[1215,97],[1208,110],[1189,124],[1163,137],[1138,146],[1127,147],[1125,136],[1105,135],[1069,139],[1037,142],[1013,147],[988,158],[970,170],[950,184],[944,197],[918,198],[893,193],[874,184]], [949,187], [1110,149], 95, '#292528', '#4e423d'),
  ],
};
function hatFor(team: Team, appearance = 0) { return hats[team][getCharacterDesign(team, appearance).id]; }
const path = (ctx: CanvasRenderingContext2D, points: Point[]) => { ctx.moveTo(...points[0]); for (const p of points.slice(1)) ctx.lineTo(...p); ctx.closePath(); };
let source: HTMLImageElement | undefined;
const sprites = new Map<number, { image: HTMLImageElement; ready: boolean; loaded: Promise<void> }>();
const listeners = new Set<() => void>();
export function subscribeCowboySprites(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function sprite(appearance = 0) {
  const design = getCharacterDesign('sheriffs', appearance);
  if (!sprites.has(design.id) && typeof Image !== 'undefined') {
    const item = { image: new Image(), ready: false, loaded: Promise.resolve() };
    sprites.set(design.id, item);
    item.loaded = new Promise((resolve, reject) => {
      item.image.onload = () => { item.ready = true; listeners.forEach(listener => listener()); resolve(); };
      item.image.onerror = () => reject(new Error(`Could not load character design ${design.id}`));
    });
    // The vector rig remains a safe fallback on a failed network request.
    void item.loaded.catch(() => {});
    item.image.src = design.sprite;
  }
  const item = sprites.get(design.id);
  return item?.ready ? item.image : undefined;
}
/** Used by visual QA and galleries: exercise the actual sprite rig, not the
 * temporary vector fallback that renders while images are downloading. */
export async function preloadCowboySprites() {
  await Promise.all(Array.from({ length: 8 }, (_, id) => { sprite(id); return sprites.get(id)?.loaded; }));
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
function uncoveredCrown(ctx: CanvasRenderingContext2D, art: HatArtwork) {
  const [left, ly] = art.left, [right, ry] = art.right;
  const width = right - left, top = art.top;
  // The atlas cannot contain the skull that was hidden under its hat. A small
  // ink-edged crown sits BEHIND the preserved face/hair pixels; it never paints
  // over brows, spectacles or eyes and follows each character's hair colour.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left, ly + 12);
  ctx.bezierCurveTo(left - 7, top + 24, left + width * .16, top + 2, left + width * .46, top);
  ctx.bezierCurveTo(left + width * .74, top - 4, right + 4, top + 18, right, ry + 12);
  ctx.lineTo(left, ly + 12);
  ctx.closePath();
  const hair = ctx.createLinearGradient(left, top, right, Math.max(ly, ry));
  hair.addColorStop(0, art.shine); hair.addColorStop(.38, art.hair); hair.addColorStop(1, art.hair);
  ctx.fillStyle = hair; ctx.fill();
  ctx.strokeStyle = '#171419'; ctx.lineWidth = 4.5; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.restore();
}
function torso(ctx: CanvasRenderingContext2D, r: Rig, art: HatArtwork, hat = true) {
  if (!hat) uncoveredCrown(ctx, art);
  ctx.save();
  ctx.beginPath(); path(ctx, r.bounds); ctx.clip();
  // Subtract a union: overlapping cutouts must not leave floating trouser bits.
  for (const region of [r.arm, ...r.legs, ...(!hat ? [art.outline] : [])]) {
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
  source = sprite(pose.appearance);
  if (!source) return false;
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
  torso(ctx, r, hatFor(team, pose.appearance), pose.hat !== false); ctx.restore();
  if (kneel.cover > 0) piece(ctx, r.restingHand);
  // A small shoulder turn gives recoil and reload their original event-driven motion.
  piece(ctx, r.arm, r.armJoint, -recoil * .13 - (pose.reload || 0) * .65 - suicide * 1.75, 1 - suicide * .48);
  ctx.restore();
  return true;
}
export function drawSpriteHat(ctx: CanvasRenderingContext2D, team: Team, appearance = 0): boolean {
  source = sprite(appearance);
  if (!source) return false;
  const r = rigs[team], art = hatFor(team, appearance);
  ctx.save(); ctx.scale(SCALE, SCALE);
  ctx.translate(-r.origin[0], -(art.left[1] + art.right[1]) / 2);
  piece(ctx, art.outline); ctx.restore(); return true;
}
