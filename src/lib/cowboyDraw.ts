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
export function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  color: string,
) {
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
type Canvas = CanvasRenderingContext2D;
// Filled contours and fine accents share rounded joins at every rendering size.
const curve = (c: Canvas, draw: (ctx: Canvas) => void, fill?: string | null, stroke?: string, width = 0.8) => {
  c.beginPath();
  draw(c);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.stroke();
  }
};
export function drawRevolver(c: Canvas, x: number, y: number) {
  c.save();
  c.translate(x, y);
  curve(
    c,
    (p) => {
      p.moveTo(-2, -4);
      p.lineTo(16, -4);
      p.lineTo(16, -3);
      p.lineTo(24, -3);
      p.lineTo(24, 2);
      p.lineTo(12, 2);
      p.lineTo(10, 5);
      p.lineTo(-2, 5);
      p.closePath();
    },
    '#343d3f',
    '#131b1e',
    0.8,
  );
  c.fillStyle = '#86908d';
  c.fillRect(10, -3.6, 12, 0.9);
  c.fillStyle = '#141e22';
  c.fillRect(22, -2.5, 1.3, 4);
  curve(
    c,
    (p) => {
      p.moveTo(0, -3);
      p.lineTo(0, -6);
      p.lineTo(3, -6);
      p.lineTo(4, -3);
    },
    '#4c5756',
  );
  c.fillStyle = '#566263';
  roundRect(c, 1, -3, 9, 7, 2);
  c.fill();
  c.fillStyle = '#1c272c';
  for (let x = 3; x < 10; x += 3) {
    c.beginPath();
    c.ellipse(x, -0.5, 0.7, 1.4, 0, 0, Math.PI * 2);
    c.fill();
  }
  curve(
    c,
    (p) => {
      p.moveTo(-2, 3);
      p.lineTo(5, 5);
      p.lineTo(3, 13);
      p.quadraticCurveTo(-1, 14, -4, 11);
      p.closePath();
    },
    '#815235',
    '#463327',
    0.7,
  );
  c.strokeStyle = '#b18351';
  c.lineWidth = 0.6;
  c.beginPath();
  c.moveTo(-1, 5);
  c.lineTo(-2, 10);
  c.stroke();
  c.fillStyle = '#b5aa88';
  c.beginPath();
  c.arc(0, 9, 0.8, 0, Math.PI * 2);
  c.fill();
  curve(
    c,
    (p) => {
      p.moveTo(5, 4);
      p.quadraticCurveTo(13, 5, 10, 8);
      p.quadraticCurveTo(7, 9, 5, 6);
    },
    null,
    '#687573',
    0.8,
  );
  c.restore();
}
function drawFace(c: Canvas, law: boolean, skin: string) {
  // The ear sits behind the face. No detached discs, wedges or rectangular shade.
  curve(
    c,
    (p) => {
      p.moveTo(-10, -32);
      p.bezierCurveTo(-15, -34, -15, -26, -11, -26);
      p.closePath();
    },
    skin,
  );
  curve(
    c,
    (p) => {
      p.moveTo(-12, -30.7);
      p.quadraticCurveTo(-13.6, -29, -11.5, -28);
    },
    null,
    'rgba(92,54,35,.42)',
    0.65,
  );
  const shape = (p: Canvas) => {
    p.moveTo(-9, -40);
    p.quadraticCurveTo(-4, -44, 7, -40);
    p.quadraticCurveTo(11, -38, 11, -32);
    p.quadraticCurveTo(11, -30, 13, -28.7);
    p.quadraticCurveTo(15, -27, 11.3, -26);
    p.lineTo(11, -21);
    p.quadraticCurveTo(10, -17, 5, -16);
    p.lineTo(-3, -16.5);
    p.quadraticCurveTo(-10, -18, -10.8, -24);
    p.lineTo(-11, -34);
    p.quadraticCurveTo(-11, -38, -9, -40);
    p.closePath();
  };
  c.save();
  c.beginPath();
  shape(c);
  c.clip();
  const flesh = c.createLinearGradient(-12, -35, 15, -23);
  flesh.addColorStop(0, '#af7854');
  flesh.addColorStop(0.35, skin);
  flesh.addColorStop(1, skin);
  c.fillStyle = flesh;
  c.fillRect(-16, -46, 34, 36);
  const shade = c.createLinearGradient(0, -40, 0, -31);
  shade.addColorStop(0, 'rgba(64,44,31,.27)');
  shade.addColorStop(1, 'rgba(64,44,31,0)');
  c.fillStyle = shade;
  c.fillRect(-15, -43, 33, 13);
  // Hair and sideburn follow the cheek; the facial silhouette remains visible.
  curve(
    c,
    (p) => {
      p.moveTo(-11, -38);
      p.lineTo(-5, -39);
      p.quadraticCurveTo(-8, -35, -7.5, -28);
      p.lineTo(-10, -26);
      p.closePath();
    },
    law ? '#71472f' : '#3d3431',
  );
  if (!law)
    curve(
      c,
      (p) => {
        p.moveTo(-8, -25);
        p.quadraticCurveTo(-5, -23, -2, -23.5);
        p.quadraticCurveTo(3, -21, 10.5, -24);
        p.lineTo(10, -20);
        p.quadraticCurveTo(9, -16, 4, -15.8);
        p.quadraticCurveTo(-5, -15.8, -8, -20);
        p.closePath();
      },
      '#3b3431',
    );
  c.restore();
  // Eyelids, brows and irises read as a gaze, without an eye bar.
  curve(
    c,
    (p) => {
      p.moveTo(2, -34.3);
      p.quadraticCurveTo(5, -35.3, 8, -34.1);
    },
    null,
    law ? '#755039' : '#554036',
    0.9,
  );
  curve(
    c,
    (p) => {
      p.moveTo(-4, -34.4);
      p.quadraticCurveTo(-2.7, -35, -1.2, -34.3);
    },
    null,
    '#755039',
    0.75,
  );
  curve(
    c,
    (p) => {
      p.moveTo(2.4, -31.8);
      p.quadraticCurveTo(5, -33, 7.5, -31.5);
      p.quadraticCurveTo(5, -30.2, 2.4, -31.8);
    },
    '#eed5b5',
  );
  c.fillStyle = '#3a3430';
  c.beginPath();
  c.ellipse(5.6, -31.6, 0.9, 1.05, 0, 0, Math.PI * 2);
  c.fill();
  curve(
    c,
    (p) => {
      p.moveTo(2.4, -31.8);
      p.quadraticCurveTo(5, -33, 7.5, -31.5);
    },
    null,
    '#694630',
    0.7,
  );
  curve(
    c,
    (p) => {
      p.moveTo(-3.5, -31.8);
      p.quadraticCurveTo(-2, -32.5, -0.6, -31.6);
    },
    null,
    '#4b392e',
    0.75,
  );
  curve(
    c,
    (p) => {
      p.moveTo(9.4, -31);
      p.quadraticCurveTo(9, -28, 11.9, -27.2);
    },
    null,
    'rgba(150,97,63,.45)',
    0.6,
  );
  // Two restrained tapered lobes leave the cheek and mouth readable.
  const hair = law ? '#6b472f' : '#3b3431';
  curve(
    c,
    (p) => {
      p.moveTo(3.7, -24.5);
      p.quadraticCurveTo(1, -25.2, -2.8, -22.5);
      p.quadraticCurveTo(0.4, -21.8, 3.7, -23.4);
      p.quadraticCurveTo(6.5, -21.6, 9.8, -22.5);
      p.quadraticCurveTo(7, -25, 3.7, -24.5);
      p.closePath();
    },
    hair,
  );
  curve(
    c,
    (p) => {
      p.moveTo(0.4, -23.4);
      p.lineTo(2.5, -23.9);
    },
    null,
    law ? '#98704c' : '#6b5745',
    0.45,
  );
  curve(
    c,
    (p) => {
      p.moveTo(2.5, -20.2);
      p.quadraticCurveTo(5, -19.4, 7, -20.3);
    },
    null,
    law ? '#925a3d' : '#c79575',
    0.65,
  );
  if (law)
    curve(
      c,
      (p) => {
        p.moveTo(3, -17.8);
        p.quadraticCurveTo(5, -17.5, 6.6, -18);
      },
      null,
      'rgba(255,229,195,.42)',
      0.6,
    );
}
function drawHatShape(c: Canvas, law: boolean) {
  const felt = law ? '#bb9460' : '#45444b',
    shadow = law ? '#896840' : '#2b3339';
  curve(
    c,
    (p) => {
      p.moveTo(-27, -42.5);
      p.bezierCurveTo(-15, -39, 17, -37, 29, -43);
      p.bezierCurveTo(32, -46, 13, -48, -7, -47);
      p.bezierCurveTo(-24, -47, -32, -46, -27, -42.5);
      p.closePath();
    },
    felt,
  );
  curve(
    c,
    (p) => {
      p.moveTo(-16, -44);
      p.lineTo(-14, -57);
      p.quadraticCurveTo(-14, -61, -9, -62);
      p.quadraticCurveTo(-5, -64, 0, -59);
      p.quadraticCurveTo(5, -57, 10, -61);
      p.quadraticCurveTo(14, -63, 15, -57);
      p.lineTo(18, -43);
      p.closePath();
    },
    felt,
  );
  curve(
    c,
    (p) => {
      p.moveTo(-14, -57);
      p.quadraticCurveTo(-10, -63, -5, -62);
      p.lineTo(-3, -47);
      p.lineTo(-16, -45);
      p.closePath();
    },
    shadow,
  );
  curve(
    c,
    (p) => {
      p.moveTo(-5, -62);
      p.quadraticCurveTo(2, -57, 8, -60);
    },
    null,
    law ? '#d2af7c' : '#646068',
    0.7,
  );
  curve(
    c,
    (p) => {
      p.moveTo(-16, -47);
      p.quadraticCurveTo(1, -46, 16, -47);
      p.lineTo(17, -42);
      p.quadraticCurveTo(0, -40, -16, -43);
      p.closePath();
    },
    law ? '#6c4f36' : '#a9674c',
  );
  curve(
    c,
    (p) => {
      p.moveTo(-26, -42);
      p.quadraticCurveTo(0, -34, 29, -43);
    },
    null,
    law ? '#ead1a2' : '#bda892',
    1.15,
  );
  c.fillStyle = law ? '#bd9867' : '#d19570';
  roundRect(c, 10, -45.5, 4, 3, 1);
  c.fill();
  c.fillStyle = shadow;
  c.fillRect(11.1, -44.8, 1.8, 1.6);
}
// Articulated vector character. Poses are presentation-only.
export interface CowboyPose {
  walk?: number;
  recoil?: number;
  reload?: number;
  cover?: number;
  hat?: boolean;
}
export function drawCowboy(c: Canvas, team: Team, facing: 1 | -1, time: number, seed = 0, pose: CowboyPose = {}) {
  const law = team === 'sheriffs',
    coat = law ? COL.sheriff : COL.outlaw,
    dark = law ? COL.sheriffDark : COL.outlawDark,
    light = law ? COL.sheriffLight : COL.outlawLight;
  const skin = ['#d9a87c', '#bc865e', '#e5b78e'][Math.abs(seed) % 3],
    walk = pose.walk || 0,
    recoil = pose.recoil || 0,
    reload = pose.reload || 0;
  const breath = Math.sin(time * 2 + seed) * 0.8;
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.scale(facing * 0.95, 0.95);
  c.translate(-recoil * 6, breath - Math.abs(walk) * 3);
  for (const [x, step, back] of [
    [-13, walk, true],
    [13, -walk, false],
  ] as const) {
    c.save();
    c.translate(x, 24);
    c.rotate(step * 0.26);
    curve(
      c,
      (p) => {
        p.moveTo(-5, 0);
        p.lineTo(6, 0);
        p.lineTo(5, 31);
        p.lineTo(-5, 31);
        p.closePath();
      },
      back ? '#29353b' : '#34424a',
    );
    curve(
      c,
      (p) => {
        p.moveTo(-3, 4);
        p.lineTo(-3.5, 24);
      },
      null,
      back ? '#3b4b53' : '#52636b',
      0.9,
    );
    curve(
      c,
      (p) => {
        p.moveTo(-6, 26);
        p.quadraticCurveTo(0, 28, 6, 26);
        p.lineTo(6, 34);
        p.quadraticCurveTo(7, 38, 12, 39);
        p.quadraticCurveTo(15, 40, 14, 42);
        p.lineTo(2, 43);
        p.lineTo(-7, 42);
        p.closePath();
      },
      back ? '#253139' : '#35424a',
      '#19282f',
      0.65,
    );
    curve(
      c,
      (p) => {
        p.moveTo(-5, 29);
        p.lineTo(-5, 37);
        p.quadraticCurveTo(-2, 38, 1, 37);
      },
      null,
      '#6b7067',
      0.7,
    );
    curve(
      c,
      (p) => {
        p.moveTo(6, 38);
        p.quadraticCurveTo(10, 38.8, 13, 40);
      },
      null,
      '#6f7b7d',
      0.8,
    );
    c.fillStyle = '#ac8459';
    roundRect(c, -7, 42, 21, 1.8, 0.5);
    c.fill();
    c.fillStyle = '#17272e';
    c.fillRect(-6.5, 43.5, 5, 1.4);
    c.restore();
  }
  // Continuous coat silhouette with layered lapels, seam lines and pockets.
  curve(
    c,
    (p) => {
      p.moveTo(-20, -12);
      p.quadraticCurveTo(-24, -9, -23, 7);
      p.lineTo(-28 - walk * 2, 38);
      p.quadraticCurveTo(-18, 42, -12, 41);
      p.lineTo(0, 25);
      p.lineTo(9, 39);
      p.quadraticCurveTo(20, 43, 26 + walk * 2, 39);
      p.lineTo(20, -10);
      p.closePath();
    },
    dark,
  );
  curve(
    c,
    (p) => {
      p.moveTo(-20, -11);
      p.quadraticCurveTo(-14, -14, -9, -13);
      p.lineTo(10, -13);
      p.quadraticCurveTo(18, -12, 20, -8);
      p.lineTo(20, 23);
      p.quadraticCurveTo(-1, 25, -21, 23);
      p.closePath();
    },
    coat,
  );
  curve(
    c,
    (p) => {
      p.moveTo(-8, -13);
      p.lineTo(8, -13);
      p.lineTo(10, 23);
      p.lineTo(-8, 23);
      p.closePath();
    },
    '#e5d2ae',
  );
  curve(
    c,
    (p) => {
      p.moveTo(-20, -12);
      p.lineTo(-8, -15);
      p.lineTo(-4, 2);
      p.lineTo(-12, -1);
      p.lineTo(-16, 7);
      p.closePath();
    },
    light,
  );
  curve(
    c,
    (p) => {
      p.moveTo(9, -14);
      p.lineTo(20, -9);
      p.lineTo(13, 6);
      p.lineTo(7, 1);
      p.closePath();
    },
    dark,
  );
  curve(
    c,
    (p) => {
      p.moveTo(-18, 7);
      p.lineTo(-18, 19);
      p.moveTo(17, 8);
      p.lineTo(17, 19);
      p.moveTo(-21, 29);
      p.lineTo(-24, 37);
      p.moveTo(18, 29);
      p.lineTo(21, 37);
    },
    null,
    law ? '#729e9c' : '#bc8369',
    0.7,
  );
  c.fillStyle = dark;
  roundRect(c, -18, 9, 9, 2, 0.6);
  c.fill();
  curve(
    c,
    (p) => {
      p.moveTo(-17.5, 11.4);
      p.lineTo(-10, 11.4);
    },
    null,
    light,
    0.55,
  );
  for (let i = 0; i < 3; i++) {
    c.fillStyle = '#8a6a47';
    c.beginPath();
    c.arc(1.7, 3 + i * 6.8, 1.1, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#d8bd86';
    c.beginPath();
    c.arc(1.4, 2.65 + i * 6.8, 0.35, 0, Math.PI * 2);
    c.fill();
  }
  curve(
    c,
    (p) => {
      p.moveTo(-22, 21);
      p.quadraticCurveTo(0, 24, 21, 21);
      p.lineTo(21, 27);
      p.quadraticCurveTo(0, 29, -22, 27);
      p.closePath();
    },
    '#44342b',
  );
  curve(
    c,
    (p) => {
      p.moveTo(-20, 22.5);
      p.quadraticCurveTo(-5, 24, 18, 22.5);
    },
    null,
    '#8c6e4d',
    0.6,
  );
  c.fillStyle = '#cfaf64';
  roundRect(c, -3.8, 22, 8.5, 6.5, 1.2);
  c.fill();
  c.fillStyle = '#6c5236';
  roundRect(c, -2, 23.4, 5, 3.7, 0.7);
  c.fill();
  curve(
    c,
    (p) => {
      p.moveTo(1.8, 25);
      p.lineTo(4, 25);
    },
    null,
    '#ddc184',
    0.8,
  );
  curve(
    c,
    (p) => {
      p.moveTo(14, 27);
      p.lineTo(23, 26);
      p.lineTo(22, 38);
      p.quadraticCurveTo(20, 42, 14, 42);
      p.closePath();
    },
    '#74523a',
    '#483b2e',
    0.6,
  );
  curve(
    c,
    (p) => {
      p.moveTo(16, 29);
      p.lineTo(20.5, 29);
      p.lineTo(20, 37);
      p.quadraticCurveTo(18.5, 39, 16, 38);
    },
    null,
    '#b18b5e',
    0.6,
  );
  c.save();
  c.translate(-20, -6);
  c.rotate(-0.15 + Math.sin(time * 2 + seed) * 0.025);
  curve(
    c,
    (p) => {
      p.moveTo(-7, 0);
      p.quadraticCurveTo(-3, -3, 4, 0);
      p.lineTo(3, 22);
      p.lineTo(-7, 23);
      p.closePath();
    },
    dark,
  );
  c.fillStyle = coat;
  roundRect(c, -7, 20, 10, 4, 1);
  c.fill();
  curve(
    c,
    (p) => {
      p.moveTo(-6, 24);
      p.quadraticCurveTo(-2, 23, 2, 25);
      p.lineTo(2, 30);
      p.quadraticCurveTo(-4, 33, -6, 29);
      p.closePath();
    },
    skin,
  );
  curve(
    c,
    (p) => {
      p.moveTo(-3, 27);
      p.lineTo(-3, 29);
      p.moveTo(-0.5, 27);
      p.lineTo(-0.5, 29);
    },
    null,
    '#a06e4d',
    0.5,
  );
  c.restore();
  c.save();
  c.translate(14, -5);
  c.rotate(-recoil * 0.3 + reload * 0.95);
  curve(
    c,
    (p) => {
      p.moveTo(0, -5);
      p.quadraticCurveTo(9, -7, 17, -4);
      p.lineTo(24, -4);
      p.lineTo(24, 6);
      p.lineTo(9, 7);
      p.quadraticCurveTo(2, 7, 0, 3);
      p.closePath();
    },
    coat,
  );
  curve(
    c,
    (p) => {
      p.moveTo(3, -4);
      p.quadraticCurveTo(10, -5, 19, -3.2);
    },
    null,
    light,
    0.9,
  );
  c.fillStyle = dark;
  c.fillRect(21, -4, 3, 10);
  // Revolver sits behind a curved gripping hand, with one clear thumb.
  drawRevolver(c, 30, 0);
  curve(
    c,
    (p) => {
      p.moveTo(24, -3);
      p.quadraticCurveTo(28, -5, 31, -2);
      p.lineTo(32, 3);
      p.quadraticCurveTo(29, 6, 25, 4);
      p.closePath();
    },
    skin,
  );
  curve(
    c,
    (p) => {
      p.moveTo(27, -1);
      p.quadraticCurveTo(30, -1, 30, 1);
    },
    null,
    '#a57755',
    0.7,
  );
  curve(
    c,
    (p) => {
      p.moveTo(27, 2.5);
      p.lineTo(29.5, 2.5);
    },
    null,
    '#9f704f',
    0.45,
  );
  c.restore();
  c.fillStyle = skin;
  roundRect(c, -5, -22, 10, 11, 2);
  c.fill();
  drawFace(c, law, skin);
  curve(
    c,
    (p) => {
      p.moveTo(-8, -15);
      p.lineTo(1, -12);
      p.lineTo(8, -15);
      p.lineTo(5, -9);
      p.lineTo(-7, -10);
      p.closePath();
    },
    light,
  );
  curve(
    c,
    (p) => {
      p.moveTo(-6, -10);
      p.lineTo(-11, -6);
      p.lineTo(-8, 2);
      p.lineTo(-3, -7);
      p.closePath();
    },
    coat,
  );
  curve(
    c,
    (p) => {
      p.moveTo(-6, -11);
      p.lineTo(-7, -7);
    },
    null,
    dark,
    0.7,
  );
  if (pose.hat !== false) drawHatShape(c, law);
  if (law) {
    drawStar(c, -12, 0, 5.5, 2.7, COL.goldBright);
    c.fillStyle = '#927044';
    c.beginPath();
    c.arc(-12, 0, 1.1, 0, Math.PI * 2);
    c.fill();
  } else {
    curve(
      c,
      (p) => {
        p.moveTo(-14, -1);
        p.lineTo(-8, 4);
        p.moveTo(-8, -1);
        p.lineTo(-14, 4);
      },
      null,
      '#f2d3a8',
      1.4,
    );
  }
  c.restore();
}
// A loose hat, centred on its brim, uses the same silhouette as the worn hat.
export function drawHat(ctx: Canvas, team: Team) {
  ctx.save();
  ctx.translate(0, 42);
  drawHatShape(ctx, team === 'sheriffs');
  ctx.restore();
}
