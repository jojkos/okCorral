import type { WalkingWomanState } from '../../../shared/types';
import { clamp01, rand, type Layout } from './layout';
import { GATLING_ENTRY_Y, GATLING_STOP_Y, GATLING_EXIT_Y } from '../../../shared/gatlingGeometry';
import { civilianLaneFeet } from '../../../shared/civilianGeometry';

type Canvas = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function shape(ctx: Canvas, d: string, fill: string | CanvasGradient, stroke?: string, width = 1.5) {
  const path = new Path2D(d);
  ctx.fillStyle = fill; ctx.fill(path);
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(path); }
}

function line(ctx: Canvas, d: string, color: string, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(new Path2D(d));
}

function oval(ctx: Canvas, x: number, y: number, rx: number, ry: number, color: string, angle = 0) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, TAU); ctx.fill();
}

/** Matte, broken edges without the black outline used on characters. */
function stain(ctx: Canvas, x: number, y: number, rx: number, ry: number, seed: number, color: string) {
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * TAU;
    const r = 0.73 + rand(seed + i * 47) * 0.31;
    const px = x + Math.cos(a) * rx * r, py = y + Math.sin(a) * ry * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}

function bloodPool(ctx: Canvas, x: number, y: number, seed: number, size = 1, wet = false) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
  stain(ctx, 3, 3, 33, 15, seed, 'rgba(80,37,27,0.23)');
  stain(ctx, 1, 1, 28, 11, seed + 11, 'rgba(78,22,19,0.57)');
  stain(ctx, 0, 0, 23, 9, seed + 23, 'rgba(65,12,15,0.85)');
  stain(ctx, -3, -1, 16, 6, seed + 37, wet ? '#4b0c12' : 'rgba(73,17,19,0.64)');
  stain(ctx, 9, 2, 11, 4, seed + 49, 'rgba(123,24,23,0.44)');
  for (let i = 0; i < 24; i++) {
    const a = rand(seed + i * 67) * TAU;
    const d = 0.8 + rand(seed + i * 73) * 0.65;
    const r = 0.35 + rand(seed + i * 79) * 1.2;
    oval(ctx, Math.cos(a) * 25 * d, Math.sin(a) * 10 * d, r * 1.6, r * 0.7, 'rgba(92,28,22,0.42)', a);
  }
  if (wet) {
    line(ctx, 'M-11 -3 Q-6 -5 -2 -4 M8 2 L12 2', 'rgba(185,93,68,0.32)', 0.8);
  }
  ctx.restore();
}

/** Deterministic deposits: reveal the travelled portion, never stretch old blood. */
export function drawWomanBloodTrail(ctx: Canvas, L: Layout, woman: WalkingWomanState, s: number, headSide: number, roundProgress: number) {
  const trail = woman.bloodTrail;
  if (!trail.length) return;
  const headX = L.midX + headSide * 65 * s;
  const headY = (slot: number) => civilianLaneFeet(L, slot) - 13 * s;
  ctx.save();
  ctx.beginPath(); ctx.rect(472, L.top - L.slotHeight, 656, L.slotHeight * (L.n + 2)); ctx.clip();
  ctx.lineCap = 'round';

  for (let i = 0; i < trail.length; i++) {
    // The last entry is a destination, not a place already visited.
    const travelling = i === trail.length - 1 && woman.phase === 'dead' && woman.fromSlot !== woman.slot;
    const arrival = travelling ? clamp01((roundProgress - 0.88) / 0.12) : 1;
    if (arrival > 0) {
      ctx.save(); ctx.translate(headX, headY(trail[i])); ctx.scale(s, s); ctx.globalAlpha = arrival;
      const reversal = i > 0 && i < trail.length - 1 && (trail[i] - trail[i - 1]) * (trail[i + 1] - trail[i]) < 0;
      bloodPool(ctx, 0, 3, 311 + i * 191, reversal ? 1.05 : i === 0 ? 0.9 : 0.55);
      ctx.restore();
    }
    if (i === trail.length - 1) continue;
    const y0 = headY(trail[i]), y1 = headY(trail[i + 1]);
    const active = i === trail.length - 2 && woman.phase === 'dead' && woman.fromSlot !== woman.slot;
    const progress = active ? clamp01(roundProgress) : 1;
    const seed = 1501 + i * 307;
    // Opposite passes sweep to opposite sides; ends meet the head's actual path.
    const side = i % 2 ? -1 : 1;
    const bow = side * (13 + rand(seed) * 20) * s;
    const steps = Math.max(1, Math.ceil(Math.abs(y1 - y0) / (3.5 * s)));
    for (let j = 0; j <= steps; j++) {
      const p = j / steps;
      if (p > progress) break;
      const id = seed + j * 83;
      const x = headX + Math.sin(p * Math.PI) * bow;
      const y = y0 + (y1 - y0) * p;
      const taper = 0.4 + 0.6 * Math.sin(p * Math.PI);
      const width = (3 + rand(id) * 10) * taper * s;
      // Overlapping flat dabs and exposed dust break up the drag marks.
      stain(ctx, x, y, width * 1.5, (2 + rand(id + 7) * 3) * s, id, 'rgba(85,30,24,0.18)');
      if (rand(id + 13) > 0.14) stain(ctx, x + (rand(id + 19) - 0.5) * 4 * s, y, width, (1.1 + rand(id + 23) * 2.5) * s, id + 31, 'rgba(77,13,17,0.48)');
      // The head keeps bleeding along its actual line of travel while cloth
      // spreads the broader drag stain to either side.
      stain(ctx, headX, y, (2 + rand(id + 29) * 3) * s, 2.1 * s, id + 33, 'rgba(80,15,18,0.36)');
      if (rand(id + 37) > 0.44) {
        ctx.strokeStyle = 'rgba(120,29,25,0.35)'; ctx.lineWidth = (0.5 + rand(id + 41)) * s;
        ctx.beginPath(); ctx.moveTo(x - width * 0.6, y); ctx.lineTo(x - width * 0.6 + side * s, y + (y1 > y0 ? -1 : 1) * (3 + rand(id + 43) * 5) * s); ctx.stroke();
      }
      if (j % 3 === 0) {
        const dx = (rand(id + 53) - 0.5) * 42 * s;
        oval(ctx, x + dx, y, (0.5 + rand(id + 59) * 1.8) * s, (0.4 + rand(id + 61)) * s, 'rgba(99,24,23,0.55)');
      }
    }
  }
  ctx.restore();
}

/** Short wheel marks start at contact and share the carriage's track width and
 * perspective. They don't grow from the skyline or follow the sliding body forever. */
export function drawGatlingWheelMarks(ctx: Canvas, L: Layout, woman: WalkingWomanState, feet: number | null) {
  if (!woman.crushedByGatling || woman.gatlingCrushSlot == null) return;
  const start = civilianLaneFeet(L, woman.gatlingCrushSlot);
  const destination = civilianLaneFeet(L, woman.gatlingCrushSlot + 1);
  const end = woman.gatlingCrushedThisRound && feet !== null ? Math.min(destination, feet) : destination;
  if (end <= start) return;
  ctx.save(); ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const y = start + (end - start) * i / 20;
      const scale = y < GATLING_STOP_Y ? 0.38 + 0.52 * clamp01((y - GATLING_ENTRY_Y) / (GATLING_STOP_Y - GATLING_ENTRY_Y))
        : 0.9 + 0.32 * clamp01((y - GATLING_STOP_Y) / (GATLING_EXIT_Y - GATLING_STOP_Y));
      const x = L.midX + side * 65 * Math.cos(0.36) * scale;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 5 * L.s; ctx.strokeStyle = 'rgba(79,58,39,0.23)'; ctx.stroke();
    ctx.lineWidth = 1.4 * L.s; ctx.strokeStyle = 'rgba(180,140,88,0.3)'; ctx.setLineDash([3, 7]); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

/** Hand-painted side-lying silhouette in the same ink/teal/ochre palette. */
export function drawDeadWoman(ctx: Canvas, x: number, feet: number, s: number, headSide: number, crushed: boolean | number = false) {
  const compression = typeof crushed === 'boolean' ? Number(crushed) : clamp01(crushed);
  ctx.save(); ctx.translate(x, feet - (12 - 5 * compression) * s); ctx.scale(s * headSide, s * (1 - 0.34 * compression));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const shadow = ctx.createRadialGradient(-1, 9, 4, -1, 9, 91);
  shadow.addColorStop(0, 'rgba(10,9,9,0.55)'); shadow.addColorStop(0.75, 'rgba(10,9,9,0.28)'); shadow.addColorStop(1, 'rgba(10,9,9,0)');
  ctx.save(); ctx.scale(1, 0.35); ctx.fillStyle = shadow; ctx.fillRect(-105, -45, 220, 100); ctx.restore();
  bloodPool(ctx, 68, 1, 743, 1, true);
  oval(ctx, -12, 13, 48, 7, 'rgba(11,14,14,0.34)');
  oval(ctx, 39, 6, 23, 5, 'rgba(11,14,14,0.42)');

  // Far leg folds back at the knee; the nearer boot rests on its outer edge.
  shape(ctx, 'M-40 1 Q-54 -9 -66 -5 L-77 10 L-70 16 L-56 6 L-44 14 Z', '#6b5543', '#272626', 2);
  shape(ctx, 'M-76 7 Q-83 7 -84 13 L-94 14 Q-101 18 -96 22 L-76 23 Q-71 21 -70 15 Z', '#302d2b', '#161d20', 1.7);
  line(ctx, 'M-94 19 L-80 19 M-78 11 L-76 17', '#655446', 1.4);
  shape(ctx, 'M-48 12 Q-61 13 -70 22 L-64 29 Q-55 25 -45 23 L-35 15 Z', '#89715a', '#333333', 1.6);
  shape(ctx, 'M-69 21 L-62 27 Q-64 33 -74 34 L-85 30 Q-88 25 -82 24 L-75 25 Z', '#393633', '#182024', 1.8);
  line(ctx, 'M-83 28 Q-75 32 -67 29', '#77614b', 1.2);

  // Weight gathers the skirt into an asymmetric mound over the bent hips.
  const dress = ctx.createLinearGradient(-18, -24, -18, 24);
  dress.addColorStop(0, '#4d7f85'); dress.addColorStop(0.3, '#35656e'); dress.addColorStop(0.72, '#20464f'); dress.addColorStop(1, '#142e38');
  shape(ctx, 'M17 -13 C0 -21 -13 -29 -29 -22 C-42 -20 -46 -9 -59 -6 Q-55 1 -61 9 L-54 15 L-57 21 Q-44 28 -33 23 Q-20 29 -7 20 C3 20 14 14 24 9 Z', dress, '#14292f', 2.2);
  shape(ctx, 'M-23 -19 Q-40 -5 -52 12 L-48 17 Q-30 4 -14 -9 Z', '#244b55');
  shape(ctx, 'M-6 -15 Q-14 2 -33 23 Q-19 24 -8 16 L13 8 Z', '#193d47');
  line(ctx, 'M-30 -19 Q-42 -10 -51 -4 M-18 -20 Q-26 -5 -43 9 M-3 -14 Q-5 0 -19 12 M-51 18 Q-42 22 -36 19', '#699397', 1.3);
  line(ctx, 'M-37 -8 Q-40 1 -49 10 M-12 -8 Q-14 4 -25 14 M-55 13 L-51 15', '#112e39', 1.5);

  // Creased apron follows the volume of the skirt, rather than a flat panel.
  const apron = ctx.createLinearGradient(1, -20, -9, 13);
  apron.addColorStop(0, '#ddcca7'); apron.addColorStop(0.5, '#b8aa89'); apron.addColorStop(1, '#827964');
  shape(ctx, 'M14 -14 Q2 -16 -10 -21 Q-13 -10 -30 5 L-27 12 L-17 9 L-12 13 Q-1 4 18 7 Z', apron, '#595c50', 1.3);
  line(ctx, 'M5 -13 Q-3 -4 -17 6 M-6 -16 Q-12 -4 -25 6', '#ece0bc', 1.2);
  line(ctx, 'M0 -7 L-8 4 M9 -9 L2 0 M-27 9 L-20 7', '#8b8068', 1);

  // Far arm and sleeve touch the dirt beyond the shoulder.
  shape(ctx, 'M32 -14 Q27 -24 15 -27 L7 -24 Q6 -20 12 -19 L25 -17 L29 -9 Z', '#b79b7c', '#4d4540', 1.4);
  shape(ctx, 'M12 -27 L5 -28 L-1 -25 Q-2 -23 1 -22 L7 -23 L4 -20 Q6 -17 10 -20 L15 -23 Z', '#cfaf8b', '#5d4b3c', 1);
  line(ctx, 'M1 -24 L7 -25 M4 -22 L9 -24', '#947255', 0.7);

  const blouse = ctx.createLinearGradient(22, -19, 38, 9);
  blouse.addColorStop(0, '#e2cfab'); blouse.addColorStop(0.5, '#c8b392'); blouse.addColorStop(1, '#91846d');
  shape(ctx, 'M12 -14 Q21 -18 33 -19 Q45 -19 49 -9 L45 4 Q35 13 19 8 L14 2 Z', blouse, '#514d41', 1.8);
  shape(ctx, 'M17 -14 Q29 -19 39 -16 L38 -7 Q28 -6 22 2 L17 -1 Z', '#984d40', '#563632', 1.1);
  shape(ctx, 'M19 -11 L32 -13 L28 -6 L21 -2 Z', '#b66e55');
  line(ctx, 'M34 -3 L28 3 M41 -6 L37 1 M17 3 L23 4', '#827860', 1.1);
  shape(ctx, 'M43 -13 L54 -12 L56 -4 L45 0 L40 -5 Z', '#c6a17e', '#66523f', 1.1);

  // Slack near arm, defined elbow, wrist and relaxed fingers.
  shape(ctx, 'M37 -6 Q43 -8 46 -2 L42 11 L37 16 L30 11 L33 3 Z', blouse, '#5a5245', 1.6);
  shape(ctx, 'M38 11 Q43 16 36 21 L25 24 L20 29 L15 27 L19 20 L31 17 L32 12 Z', '#c6a17b', '#5a4939', 1.3);
  shape(ctx, 'M22 23 L19 28 L14 29 L10 27 Q9 25 12 24 L15 24 L17 21 Z', '#d2b18a', '#5a4939', 1);
  line(ctx, 'M12 25 L16 26 M14 27 L18 27 M25 20 L32 19', '#907251', 0.8);

  // Loosened hair rests on the ground around a turned cheek and temple wound.
  shape(ctx, 'M49 -16 Q57 -26 69 -22 Q81 -19 81 -9 L77 -1 Q72 7 63 6 L53 2 L46 -6 Z', '#332924', '#211f20', 1.5);
  shape(ctx, 'M53 -17 Q64 -20 71 -14 L75 -7 L71 -4 L72 1 L65 5 Q57 5 52 -3 L49 -9 Z', '#cfae88', '#614b3a', 1.1);
  shape(ctx, 'M53 -17 Q63 -22 72 -15 L67 -12 Q58 -14 54 -6 L50 -5 L48 -12 Z', '#48312a');
  shape(ctx, 'M53 -3 Q60 3 67 1 L69 4 L62 6 Q54 3 52 0 Z', '#a48265');
  line(ctx, 'M60 -7 Q63 -5 66 -7', '#4e342c', 1.2);
  line(ctx, 'M66 -2 L69 -1 M62 2 L66 3', '#94624f', 0.8);
  line(ctx, 'M52 -18 Q62 -22 68 -19 M48 -5 Q46 2 53 5 M76 -13 Q82 -9 77 -3', '#79533b', 0.8);
  shape(ctx, 'M72 -14 L78 -15 L81 -11 L77 -8 L80 -5 L75 0 L69 -4 L71 -8 Z', '#480c12');
  shape(ctx, 'M76 -12 L79 -10 L74 -7 L76 -4 L72 -3 L71 -7 Z', '#872222');
  line(ctx, 'M77 -6 Q82 -1 77 4 L70 5', '#67131a', 2.4);
  oval(ctx, 78, 3, 3.6, 1.4, '#571018');

  ctx.restore();
}
