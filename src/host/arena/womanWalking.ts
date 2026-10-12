type Canvas = CanvasRenderingContext2D;

function shape(ctx: Canvas, d: string, fill: string | CanvasGradient, stroke?: string, width = 1.4) {
  const path = new Path2D(d);
  ctx.fillStyle = fill; ctx.fill(path);
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(path); }
}

function line(ctx: Canvas, d: string, color: string, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(new Path2D(d));
}

/** The same teal dress, cream apron and russet shawl as the fallen character. */
export function drawAliveWoman(ctx: Canvas, s: number, stride: number) {
  ctx.save(); ctx.scale(s, s);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // Separate feet lift and swing beneath the hem while the upper body settles.
  for (const side of [-1, 1]) {
    const step = stride * side;
    ctx.save(); ctx.translate(side * 10 + step * 3, -Math.max(0, step) * 5);
    shape(ctx, 'M-4 -33 L4 -33 L5 -8 L-4 -7 Z', '#ac9778', '#51483b', 1.2);
    shape(ctx, 'M-5 -12 L5 -12 L7 -5 Q12 -3 10 1 L-7 1 L-7 -4 Z', '#34302c', '#172025', 1.6);
    line(ctx, 'M-4 -9 L3 -9 M-5 -1 L7 -1', '#7c6953', 1);
    ctx.restore();
  }

  ctx.translate(stride * 0.75, -Math.abs(stride) * 1.5);

  // Gathered skirt: the hem and folds sway as one piece of fabric.
  ctx.save(); ctx.translate(0, -88); ctx.rotate(stride * 0.025); ctx.translate(0, 88);
  const dress = ctx.createLinearGradient(-30, -70, 30, -42);
  dress.addColorStop(0, '#1e434e'); dress.addColorStop(0.36, '#477b83'); dress.addColorStop(0.68, '#315f6b'); dress.addColorStop(1, '#183841');
  shape(ctx, 'M-15 -95 Q-22 -80 -24 -66 Q-28 -44 -34 -21 Q-28 -16 -20 -19 Q-9 -13 0 -17 Q10 -12 18 -18 Q27 -15 34 -21 Q26 -49 24 -66 Q22 -84 14 -95 Z', dress, '#142b34', 2);
  shape(ctx, 'M-12 -88 Q-13 -53 -22 -19 L-15 -17 Q-5 -49 -5 -88 Z', '#285462');
  shape(ctx, 'M10 -89 Q13 -47 18 -18 L25 -18 Q19 -48 18 -84 Z', '#1c424e');
  line(ctx, 'M-17 -81 Q-22 -42 -29 -23 M-7 -86 Q-7 -43 -11 -22 M7 -85 Q6 -42 10 -22 M-30 -20 Q-21 -16 -17 -20 M15 -19 L22 -20', '#71999c', 1.2);
  line(ctx, 'M-19 -61 L-25 -30 M19 -60 L26 -25 M-1 -55 L-2 -21', '#163842', 1.2);
  const apron = ctx.createLinearGradient(-15, -76, 16, -25);
  apron.addColorStop(0, '#e6d5b2'); apron.addColorStop(0.6, '#cdbb98'); apron.addColorStop(1, '#a79577');
  shape(ctx, 'M-13 -89 L13 -89 Q13 -60 20 -32 Q9 -26 1 -29 Q-10 -24 -21 -31 Q-14 -64 -13 -89 Z', apron, '#776e56', 1.2);
  line(ctx, 'M-9 -80 Q-9 -53 -14 -34 M1 -83 Q-2 -52 0 -33 M11 -63 L15 -34', '#f1e4c5', 1.3);
  line(ctx, 'M-16 -32 Q-8 -28 -2 -31 M4 -31 L14 -32 M5 -67 Q9 -65 13 -67 L14 -53 Q9 -50 5 -53 Z', '#a79271', 1);
  ctx.restore();

  // Fitted blouse, modest collar and cloth belt give the torso a clear shape.
  const blouse = ctx.createLinearGradient(-17, -120, 19, -91);
  blouse.addColorStop(0, '#e6d4b0'); blouse.addColorStop(0.48, '#d2bd99'); blouse.addColorStop(1, '#a49377');
  shape(ctx, 'M-10 -123 Q-19 -121 -21 -114 L-17 -102 L-14 -91 Q0 -87 15 -92 L17 -104 L21 -113 Q18 -121 10 -123 Z', blouse, '#514c40', 1.7);
  line(ctx, 'M-10 -109 L-7 -96 M11 -109 L8 -97 M-2 -106 L-1 -94', '#a39273', 1);
  shape(ctx, 'M-15 -94 Q0 -90 15 -94 L16 -87 Q0 -83 -16 -88 Z', '#244a55', '#16363f', 1.2);
  line(ctx, 'M-12 -90 Q0 -87 12 -90', '#638991', 1);

  // Sleeves and arms move around the shoulders, including the carried basket.
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 17, -113); ctx.rotate(-stride * side * 0.065); ctx.scale(side, 1);
    shape(ctx, 'M-3 -4 Q5 -6 8 2 L12 18 L6 23 L0 19 L-3 8 Z', blouse, '#625747', 1.5);
    shape(ctx, 'M5 18 L12 17 L13 23 L6 25 Z', '#e6d7b9', '#77664e', 1);
    shape(ctx, 'M7 24 L12 23 L14 35 L11 42 L6 41 L5 37 L9 34 Z', '#cda782', '#614c38', 1.1);
    line(ctx, 'M8 36 L8 39 M10 37 L10 40', '#977354', 0.65);
    if (side === 1) {
      line(ctx, 'M3 45 Q2 28 12 30 Q23 29 23 46', '#47352a', 3);
      line(ctx, 'M4 43 Q4 31 12 32 Q21 31 22 44', '#b0824b', 1.2);
      const wicker = ctx.createLinearGradient(0, 40, 23, 60);
      wicker.addColorStop(0, '#b48a54'); wicker.addColorStop(1, '#684b31');
      shape(ctx, 'M0 42 Q12 46 26 41 L23 58 Q13 63 3 58 Z', wicker, '#46372a', 1.5);
      line(ctx, 'M2 48 Q12 52 24 47 M3 53 Q12 57 23 52 M7 46 L8 58 M13 46 L14 59 M20 45 L19 57', '#c3a06a', 0.8);
      line(ctx, 'M0 42 Q12 46 26 41', '#d0ab74', 1.8);
    }
    ctx.restore();
  }

  shape(ctx, 'M-6 -129 L7 -129 L9 -120 L1 -114 L-8 -120 Z', '#c49b77', '#73543f', 1);
  shape(ctx, 'M-11 -124 L-20 -118 L-13 -105 L-2 -109 L3 -100 L14 -111 L20 -119 L10 -123 L0 -115 Z', '#914a40', '#583831', 1.3);
  shape(ctx, 'M-16 -118 L-11 -109 L-3 -112 L0 -115 Z', '#b87157');
  line(ctx, 'M5 -112 L12 -117 M-12 -105 L-9 -102 M-9 -106 L-6 -103 M4 -103 L5 -99', '#ce9273', 0.8);

  // Bare head with a pinned bun, loose wisps and a shaded three-quarter face.
  shape(ctx, 'M-15 -150 Q-28 -153 -25 -139 Q-24 -131 -15 -132 L-11 -141 Z', '#463029', '#292525', 1.3);
  line(ctx, 'M-21 -147 Q-26 -137 -18 -135 M-17 -146 Q-23 -141 -17 -137', '#806047', 0.9);
  shape(ctx, 'M-16 -145 Q-16 -161 -1 -163 Q17 -163 19 -148 L15 -132 L-4 -126 L-16 -132 Z', '#3c2c27', '#282628', 1.6);
  const skin = ctx.createLinearGradient(-12, -148, 14, -129);
  skin.addColorStop(0, '#e4bd93'); skin.addColorStop(0.58, '#d3a87e'); skin.addColorStop(1, '#b48464');
  shape(ctx, 'M-10 -149 Q-2 -157 10 -149 L13 -140 L16 -135 L12 -133 Q11 -126 3 -125 Q-7 -126 -11 -134 L-14 -140 Z', skin, '#76543f', 1.2);
  shape(ctx, 'M-16 -143 Q-19 -158 -5 -163 Q10 -168 18 -154 L16 -145 Q11 -146 7 -154 Q0 -147 -9 -147 L-10 -137 L-15 -136 Z', '#483129', '#302727', 1.1);
  line(ctx, 'M-12 -151 Q-4 -162 7 -160 M-9 -154 Q-2 -159 3 -158 M10 -157 L14 -151', '#927052', 1);
  shape(ctx, 'M-12 -139 Q-17 -144 -17 -138 Q-17 -133 -12 -133 Z', '#c59a73', '#78553d', 0.8);
  line(ctx, 'M-15 -139 L-13 -136 M-7 -144 Q-4 -146 -1 -144 M6 -145 L10 -144', '#61432f', 0.85);
  shape(ctx, 'M-6 -141 Q-3 -143 0 -140 Q-3 -138 -6 -141 Z', '#e7d6b9', '#594231', 0.6);
  shape(ctx, 'M6 -141 Q8 -143 11 -140 Q8 -138 6 -141 Z', '#e7d6b9', '#594231', 0.6);
  line(ctx, 'M-2 -141 L-2 -140 M9 -141 L9 -140', '#332b26', 1.6);
  line(ctx, 'M5 -139 L4 -135 L7 -135', '#a17352', 0.8);
  line(ctx, 'M1 -131 Q5 -130 8 -132', '#905846', 0.9);
  line(ctx, 'M-11 -139 Q-10 -132 -12 -129 M15 -148 Q20 -144 17 -138', '#75513d', 0.85);
  ctx.restore();
}
