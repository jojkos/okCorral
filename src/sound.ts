/*
 * Procedural spaghetti-western sound design. Everything is synthesized via
 * Web Audio — no audio assets. Organized around:
 *   - playX() — one-shot SFX tied to game events (most take an optional
 *     stereo `pan`: -1 = left / sheriffs, +1 = right / outlaws)
 *   - startAmbient() / stopAmbient() / setMusicIntensity() — generated score
 *     (see soundMusic.ts)
 *   - setMuted() / setVolume() — global controls
 *
 * Graph:  sfx bus ──┐
 *         echo (canyon ping-pong delay) ──┤
 *         reverb (generated impulse) ─────┼─▶ compressor ─▶ limiter ─▶ master ─▶ out
 *         music bus (0.25) ─▶ duck ───────┘
 *
 * AudioContext is created lazily and resumed on the first user gesture. When
 * Web Audio is unavailable (SSR, tests) every export is a silent no-op.
 */

import {
  burst,
  makeNoise,
  makePanner,
  midiToFreq,
  pluck,
  startMusic,
  tone,
  type BurstOpts,
  type MusicHandle,
  type PluckKind,
  type ToneOpts,
} from './soundMusic';

type Ctor = typeof AudioContext;
const getCtor = (): Ctor | null => {
  try {
    const w = globalThis as typeof globalThis & { webkitAudioContext?: Ctor };
    return globalThis.AudioContext || w.webkitAudioContext || null;
  } catch {
    return null;
  }
};

const MUTE_KEY = 'okCorral-muted';
function readMuted(): boolean {
  try { return globalThis.localStorage?.getItem(MUTE_KEY) === 'true'; } catch { return false; }
}
function writeMuted(v: boolean): void {
  try { globalThis.localStorage?.setItem(MUTE_KEY, String(v)); } catch { /* storage unavailable */ }
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
const wall = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
function safeDisconnect(n: AudioNode): void {
  try { n.disconnect(); } catch { /* already disconnected */ }
}

interface Graph {
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  duck: GainNode;
  echo: AudioNode;
  reverb: AudioNode;
  white: AudioBuffer;
  brown: AudioBuffer;
}

let ctx: AudioContext | null = null;
let graph: Graph | null = null;
let ctxFailed = false;
let muted = readMuted();
let userVolume = 0.7;
let music: MusicHandle | null = null;
let musicIntensity = 0;

function makeImpulse(c: BaseAudioContext, dur: number): AudioBuffer {
  // Stereo decaying noise that darkens as it decays — a big open-air space.
  const sr = c.sampleRate;
  const len = Math.floor(sr * dur);
  const buf = c.createBuffer(2, len, sr);
  const onset = sr * 0.004;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const a = 0.9 - 0.8 * x;
      lp += a * ((Math.random() * 2 - 1) - lp);
      const env = Math.pow(1 - x, 2.2) * (i < onset ? i / onset : 1);
      d[i] = (lp * env) / Math.sqrt(a / (2 - a));
    }
  }
  return buf;
}

function buildGraph(c: AudioContext): Graph {
  const master = c.createGain();
  master.gain.value = muted ? 0 : userVolume;
  master.connect(c.destination);

  // Brick-wall-ish safety limiter, then a glue compressor in front of it so a
  // 10-shot volley doesn't clip.
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  limiter.connect(master);

  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(limiter);

  const sfx = c.createGain();
  sfx.gain.value = 0.9;
  sfx.connect(comp);

  const duck = c.createGain();
  duck.connect(comp);
  const musicBus = c.createGain();
  musicBus.gain.value = 0.25;
  musicBus.connect(duck);

  // Canyon echo: two cross-fed delays ping-ponging L/R, darker each pass.
  // Repeats at ~0.21s, 0.47s, 0.73s (1, 0.45, 0.19) — 2-3 audible, then gone.
  const echoIn = c.createGain();
  const echoHp = c.createBiquadFilter();
  echoHp.type = 'highpass';
  echoHp.frequency.value = 220;
  const dA = c.createDelay(1);
  dA.delayTime.value = 0.21;
  const dB = c.createDelay(1);
  dB.delayTime.value = 0.26;
  const lpA = c.createBiquadFilter();
  lpA.type = 'lowpass';
  lpA.frequency.value = 2400;
  const lpB = c.createBiquadFilter();
  lpB.type = 'lowpass';
  lpB.frequency.value = 1700;
  const fbA = c.createGain();
  fbA.gain.value = 0.45;
  const fbB = c.createGain();
  fbB.gain.value = 0.42;
  echoIn.connect(echoHp).connect(dA).connect(lpA).connect(fbA).connect(dB).connect(lpB).connect(fbB).connect(dA);
  const echoOut = c.createGain();
  echoOut.gain.value = 0.55;
  const panA = makePanner(c, -0.55);
  const panB = makePanner(c, 0.55);
  lpA.connect(panA.node).connect(echoOut);
  lpB.connect(panB.node).connect(echoOut);
  echoOut.connect(comp);

  // Reverb
  const reverbIn = c.createGain();
  const conv = c.createConvolver();
  conv.buffer = makeImpulse(c, 2.8);
  const revOut = c.createGain();
  revOut.gain.value = 0.5;
  reverbIn.connect(conv).connect(revOut).connect(comp);

  return {
    master,
    sfx,
    music: musicBus,
    duck,
    echo: echoIn,
    reverb: reverbIn,
    white: makeNoise(c, 3, 'white'),
    brown: makeNoise(c, 6, 'brown'),
  };
}

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  if (ctxFailed) return null;
  const C = getCtor();
  if (!C) return null;
  try {
    const c = new C();
    graph = buildGraph(c);
    ctx = c;
  } catch {
    ctxFailed = true;
    ctx = null;
    graph = null;
  }
  return ctx;
}

function resumeIfNeeded(): void {
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => undefined);
  }
}

// Register a listener for the first interaction so autoplay-gated audio can start
let gestureHooked = false;
function hookFirstGesture(): void {
  if (gestureHooked) return;
  gestureHooked = true;
  if (typeof globalThis.addEventListener !== 'function') return;
  const kick = () => {
    ensureCtx();
    resumeIfNeeded();
  };
  const events = ['pointerdown', 'keydown', 'touchstart'];
  events.forEach((e) => globalThis.addEventListener(e, kick, { once: true, passive: true }));
}
hookFirstGesture();

function applyMasterGain(): void {
  if (!ctx || !graph) return;
  const p = graph.master.gain;
  const t = ctx.currentTime;
  p.cancelScheduledValues(t);
  p.setTargetAtTime(muted ? 0 : userVolume, t, 0.03);
}

export function setMuted(next: boolean): void {
  muted = next;
  writeMuted(next);
  applyMasterGain();
}
export function isMuted(): boolean { return muted; }
export function setVolume(v: number): void {
  userVolume = clamp(v, 0, 1);
  applyMasterGain();
}

// ---- Voice plumbing ----------------------------------------------------

interface Voice {
  c: AudioContext;
  g: Graph;
  in: GainNode;
  pan: AudioParam | null;
  t: number;
}

/**
 * One output strip per sound: gain → panner → sfx bus, with optional echo
 * and reverb sends. Torn down after `life` seconds (echo/reverb tails live
 * on in the shared buses).
 */
function voice(pan = 0, o: { echo?: number; reverb?: number; life?: number; gain?: number } = {}): Voice | null {
  if (muted) return null;
  const c = ensureCtx();
  if (!c || !graph) return null;
  resumeIfNeeded();
  try {
    const input = c.createGain();
    input.gain.value = o.gain ?? 1;
    const p = makePanner(c, pan);
    input.connect(p.node);
    p.node.connect(graph.sfx);
    const nodes: AudioNode[] = [input, p.node];
    if (o.echo) {
      const s = c.createGain();
      s.gain.value = o.echo;
      p.node.connect(s);
      s.connect(graph.echo);
      nodes.push(s);
    }
    if (o.reverb) {
      const s = c.createGain();
      s.gain.value = o.reverb;
      p.node.connect(s);
      s.connect(graph.reverb);
      nodes.push(s);
    }
    setTimeout(() => nodes.forEach(safeDisconnect), ((o.life ?? 1) + 0.4) * 1000);
    return { c, g: graph, in: input, pan: p.pan, t: c.currentTime + 0.005 };
  } catch {
    return null;
  }
}

type TOpts = Omit<ToneOpts, 'dest' | 'when'> & { at?: number };
function T(v: Voice, o: TOpts): void {
  const { at = 0, ...rest } = o;
  tone(v.c, { ...rest, dest: v.in, when: v.t + at });
}

type NOpts = Omit<BurstOpts, 'dest' | 'when' | 'buffer'> & { at?: number; brown?: boolean };
function N(v: Voice, o: NOpts): void {
  const { at = 0, brown = false, ...rest } = o;
  burst(v.c, { ...rest, buffer: brown ? v.g.brown : v.g.white, dest: v.in, when: v.t + at });
}

function P(v: Voice, midi: number, at: number, gain: number, kind: PluckKind = 'nylon'): void {
  pluck(v.c, v.in, midiToFreq(midi), v.t + at, gain, kind);
}

/** Count events of a kind in a short window → used to keep volleys from stacking up. */
const recent: Record<string, number[]> = {};
function density(kind: string, win = 0.08): number {
  const t = wall();
  const arr = (recent[kind] ?? []).filter((x) => t - x < win);
  arr.push(t);
  recent[kind] = arr;
  return arr.length;
}
const volleyScale = (kind: string): number => Math.max(0.3, 1 / Math.sqrt(density(kind)));

/** Temporarily pull the music down under a big moment. */
function duckMusic(depth: number, hold: number, release: number): void {
  if (!ctx || !graph) return;
  const p = graph.duck.gain;
  const t = ctx.currentTime;
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(depth, t + 0.06);
  p.setValueAtTime(depth, t + 0.06 + hold);
  p.linearRampToValueAtTime(1, t + 0.06 + hold + release);
}

/** Two detuned saws through an enveloped lowpass — trumpet / trombone. */
function brass(
  v: Voice,
  freq: number,
  at: number,
  dur: number,
  gain: number,
  o: { bright?: number; vib?: number; wah?: boolean; wobble?: boolean } = {},
): void {
  const { c } = v;
  const t = v.t + at;
  const end = t + dur;
  const bright = o.bright ?? 5;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = o.wah ? 4 : 1.2;
  if (o.wah) {
    lp.frequency.setValueAtTime(Math.max(200, freq * 1.1), t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(freq * bright, 5000), t + dur * 0.35);
    lp.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.4, 280), end);
  } else {
    lp.frequency.setValueAtTime(freq * 1.5, t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(freq * bright, 6000), t + 0.045);
    lp.frequency.exponentialRampToValueAtTime(Math.min(freq * 2.6, 4000), end);
  }
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
  g.gain.exponentialRampToValueAtTime(gain * 0.7, t + Math.max(0.05, dur * 0.75));
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.09);
  const nodes: AudioNode[] = [lp, g];
  const oscs = [-7, 6].map((det) => {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq * 0.97, t); // lip "blip" into the note
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.04);
    osc.detune.value = det;
    osc.connect(lp);
    nodes.push(osc);
    return osc;
  });
  if (o.vib) {
    const lfo = c.createOscillator();
    lfo.frequency.value = o.wobble ? 5.6 : 5.2;
    const lg = c.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.setValueAtTime(0, t + 0.12);
    lg.gain.linearRampToValueAtTime(o.vib, t + 0.12 + Math.min(0.35, dur * 0.4));
    lfo.connect(lg);
    oscs.forEach((osc) => lg.connect(osc.detune));
    lfo.start(t);
    lfo.stop(end + 0.15);
    nodes.push(lfo, lg);
  }
  if (o.wobble) {
    // Mute "wah-wah-wah" on the filter
    const lfo = c.createOscillator();
    lfo.frequency.value = 3.2;
    const lg = c.createGain();
    lg.gain.value = 380;
    lp.frequency.cancelScheduledValues(t);
    lp.frequency.setValueAtTime(700, t);
    lfo.connect(lg).connect(lp.frequency);
    lfo.start(t);
    lfo.stop(end + 0.15);
    nodes.push(lfo, lg);
  }
  lp.connect(g).connect(v.in);
  oscs[0].onended = () => nodes.forEach(safeDisconnect);
  oscs.forEach((osc) => { osc.start(t); osc.stop(end + 0.15); });
}

// ---- Guns ----------------------------------------------------------------

export function playGunshot(pan = 0): void {
  const v = voice(pan, { echo: 0.32, reverb: 0.08, life: 0.5, gain: volleyScale('shot') });
  if (!v) return;
  const r = rand(0.91, 1.09); // per-shot pitch so volleys don't sound cloned
  const bite = rand(0.85, 1.15); // per-shot crack brightness
  // Crack — the supersonic snap
  N(v, { dur: 0.045, gain: 0.5, attack: 0.0008, filter: { type: 'highpass', freq: 1500 * r }, filter2: { type: 'bandpass', freq: 3200 * r * bite, q: 0.7 } });
  // Body — muzzle blast, lowpass closing fast
  N(v, { dur: 0.2, gain: 0.38, attack: 0.001, filter: { type: 'lowpass', freq: 1100 * r, freqEnd: 280, sweep: 0.12, q: 0.8 } });
  // Thump — chest punch
  T(v, { type: 'sine', freq: 150 * r, freqEnd: 42, glide: 0.09, dur: 0.17, gain: 0.55, attack: 0.001 });
  // Tail — rumble that feeds the canyon echo
  N(v, { at: 0.01, dur: 0.38, gain: 0.1, attack: 0.012, filter: { type: 'bandpass', freq: 650 * r, q: 0.6 } });
}

export function playFleshHit(pan = 0): void {
  const v = voice(pan, { echo: 0.1, life: 0.4, gain: volleyScale('impact') });
  if (!v) return;
  const r = rand(0.92, 1.08);
  // Meaty thud + slap
  N(v, { dur: 0.14, gain: 0.45, filter: { type: 'lowpass', freq: 380 } });
  N(v, { dur: 0.03, gain: 0.2, filter: { type: 'bandpass', freq: 1200, q: 1.2 } });
  T(v, { type: 'sine', freq: 130 * r, freqEnd: 48, glide: 0.12, dur: 0.18, gain: 0.55, attack: 0.001 });
  // Grunt: a short buzzy glottal sweep through two vowel formants ("uh")
  const grunt = { type: 'sawtooth' as OscillatorType, freq: 125 * r, freqEnd: 85 * r, dur: 0.17, attack: 0.015, at: 0.03 };
  T(v, { ...grunt, gain: 0.32, filter: { type: 'bandpass', freq: 640, q: 5 } });
  T(v, { ...grunt, gain: 0.16, filter: { type: 'bandpass', freq: 1150, q: 6 } });
}

export function playWoodHit(pan = 0): void {
  const v = voice(pan, { echo: 0.12, life: 0.45, gain: volleyScale('impact') });
  if (!v) return;
  // Crunch
  N(v, { dur: 0.09, gain: 0.42, filter: { type: 'bandpass', freq: rand(1300, 1700), q: 2.5 } });
  // Hollow barrel knock + body resonance
  T(v, { type: 'triangle', freq: 260, freqEnd: 150, dur: 0.12, gain: 0.28, attack: 0.001 });
  T(v, { type: 'sine', freq: 182, freqEnd: 160, dur: 0.22, gain: 0.16, attack: 0.002 });
  // Splinter crackle — a scatter of tiny bright grains
  let at = 0.008;
  for (let i = 0; i < 6; i++) {
    at += rand(0.006, 0.022);
    N(v, { at, dur: rand(0.01, 0.028), gain: 0.22 * (1 - i / 7), filter: { type: 'highpass', freq: 2500 }, filter2: { type: 'bandpass', freq: rand(3200, 6500), q: 3 } });
  }
}

export function playSpark(pan = 0): void {
  // Bullet-on-bullet: bright metallic CLANG with inharmonic ringing partials
  const v = voice(pan, { echo: 0.25, reverb: 0.1, life: 0.9, gain: volleyScale('impact') });
  if (!v) return;
  const base = 1150 * rand(0.95, 1.05);
  const partials: Array<[number, number, number]> = [
    [1, 0.2, 0.7], [2.32, 0.14, 0.5], [3.86, 0.1, 0.4], [5.41, 0.07, 0.28], [7.03, 0.05, 0.2],
  ];
  for (const [ratio, gain, dur] of partials) {
    T(v, { type: 'sine', freq: base * ratio, dur, gain, attack: 0.001 });
  }
  T(v, { type: 'sine', freq: base + 5, dur: 0.6, gain: 0.08, attack: 0.001 }); // beating shimmer
  N(v, { dur: 0.04, gain: 0.38, filter: { type: 'highpass', freq: 3000 } });
}

export function playMiss(pan = 0): void {
  // Ricochet: "pyeeeww" — fast sliding whine with a tumbling wobble that
  // drifts outward and darkens into the distance.
  const v = voice(pan, { echo: 0.35, life: 0.9, gain: volleyScale('ricochet') });
  if (!v) return;
  N(v, { dur: 0.07, gain: 0.16, filter: { type: 'bandpass', freq: 900, q: 0.8 } }); // dirt puff
  const start = rand(2500, 3500);
  const len = rand(0.45, 0.65);
  T(v, {
    at: 0.02, type: 'triangle', freq: start, freqEnd: start * rand(0.32, 0.45), dur: len, gain: 0.14, attack: 0.008,
    filter: { type: 'lowpass', freq: 6500, freqEnd: 1400 },
    vibrato: { rate: rand(20, 32), cents: 55, ramp: 0.05 },
  });
  if (v.pan) {
    const dir = pan === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(pan);
    v.pan.setValueAtTime(clamp(pan, -1, 1), v.t);
    v.pan.linearRampToValueAtTime(clamp(pan + dir * 0.6, -1, 1), v.t + len);
  }
}

// Convenience helper for per-bullet sound given the Bullet.hit type
export function playBulletImpact(hit: 'player' | 'barrel' | 'bullet' | 'miss', pan = 0): void {
  switch (hit) {
    case 'player': playFleshHit(pan); break;
    case 'barrel': playWoodHit(pan); break;
    case 'bullet': playSpark(pan); break;
    case 'miss': playMiss(pan); break;
  }
}

export function playFinalShot(): void {
  // Slow-motion match-ender: pitched-down, enormous, ~2.5s of canyon.
  const v = voice(0, { echo: 0.4, reverb: 0.6, life: 2.8 });
  if (!v) return;
  duckMusic(0.15, 1.8, 1.5);
  N(v, { dur: 0.18, gain: 0.5, attack: 0.001, rate: 0.5, filter: { type: 'highpass', freq: 600 }, filter2: { type: 'bandpass', freq: 1400, q: 0.6 } });
  N(v, { dur: 1.4, gain: 0.6, attack: 0.002, rate: 0.4, filter: { type: 'lowpass', freq: 700, freqEnd: 120, sweep: 1.1 } });
  T(v, { type: 'sine', freq: 90, freqEnd: 24, glide: 0.9, dur: 1.3, gain: 0.75, attack: 0.002 });
  T(v, { type: 'triangle', freq: 55, freqEnd: 35, dur: 1.8, gain: 0.22, attack: 0.01, filter: { type: 'lowpass', freq: 300 } });
  N(v, { brown: true, dur: 2.5, gain: 0.8, attack: 0.05, rate: 0.6, filter: { type: 'lowpass', freq: 160 } });
}

// ---- Movement & handling ------------------------------------------------

export function playSpurs(pan = 0): void {
  const v = voice(pan, { life: 0.45, gain: volleyScale('spurs') });
  if (!v) return;
  const tink = (at: number, r: number, g: number) => {
    T(v, { at, type: 'sine', freq: 4100 * r, dur: 0.12, gain: 0.07 * g, attack: 0.001 });
    T(v, { at, type: 'sine', freq: 5650 * r, dur: 0.09, gain: 0.05 * g, attack: 0.001 });
    T(v, { at, type: 'sine', freq: 7900 * r, dur: 0.06, gain: 0.035 * g, attack: 0.001 });
    N(v, { at, dur: 0.01, gain: 0.05 * g, filter: { type: 'highpass', freq: 5000 } });
  };
  tink(0, rand(0.97, 1.03), 1);
  const second = rand(0.09, 0.12);
  tink(second, rand(0.94, 1.0), 0.85);
  // rowel rattle
  for (let i = 1; i <= 3; i++) tink(second + i * 0.016, rand(1.02, 1.1), 0.3 / i);
}

export function playReloadSpin(pan = 0): void {
  const v = voice(pan, { life: 0.7 });
  if (!v) return;
  let at = 0;
  for (let i = 0; i < 6; i++) {
    N(v, { at, dur: 0.012, gain: 0.2, filter: { type: 'bandpass', freq: rand(3500, 4200), q: 3 } });
    T(v, { at, type: 'triangle', freq: 2200, freqEnd: 1800, dur: 0.02, gain: 0.06, attack: 0.001 });
    T(v, { at, type: 'sine', freq: 900, dur: 0.015, gain: 0.05, attack: 0.001 });
    at += 0.048 + rand(-0.005, 0.005);
  }
  // Cylinder snaps home
  at += 0.04;
  N(v, { at, dur: 0.05, gain: 0.38, filter: { type: 'bandpass', freq: 1800, q: 1.5 } });
  T(v, { at, type: 'triangle', freq: 420, freqEnd: 200, dur: 0.08, gain: 0.26, attack: 0.001 });
  T(v, { at, type: 'sine', freq: 180, freqEnd: 110, dur: 0.1, gain: 0.22, attack: 0.001 });
  T(v, { at, type: 'sine', freq: 3100, dur: 0.15, gain: 0.04, attack: 0.001 });
}

export function playCoverThud(pan = 0): void {
  const v = voice(pan, { life: 0.4 });
  if (!v) return;
  // Cloth rustle, then shoulder against the barrel
  N(v, { dur: 0.12, gain: 0.06, attack: 0.02, filter: { type: 'bandpass', freq: 2500, q: 0.7 } });
  N(v, { at: 0.04, brown: true, dur: 0.22, gain: 0.8, attack: 0.004, filter: { type: 'lowpass', freq: 350 } });
  T(v, { at: 0.04, type: 'sine', freq: 95, freqEnd: 48, dur: 0.2, gain: 0.4, attack: 0.003 });
  T(v, { at: 0.04, type: 'triangle', freq: 210, freqEnd: 170, dur: 0.1, gain: 0.1, attack: 0.002, filter: { type: 'lowpass', freq: 900 } });
}

export function playLockAction(): void {
  // Revolver-hammer cock: soft tick leads a clicky pitched "chunk".
  const v = voice(0, { life: 0.3 });
  if (!v) return;
  N(v, { dur: 0.03, gain: 0.18, filter: { type: 'highpass', freq: 3000 } });
  T(v, { at: 0.04, type: 'triangle', freq: 520, freqEnd: 280, dur: 0.12, glide: 0.08, gain: 0.22, attack: 0.002, filter: { type: 'bandpass', freq: 700, q: 2.5 } });
  T(v, { at: 0.04, type: 'sine', freq: 220, freqEnd: 140, dur: 0.12, glide: 0.08, gain: 0.22, attack: 0.002 });
  N(v, { at: 0.04, dur: 0.05, gain: 0.2, filter: { type: 'bandpass', freq: 1600, q: 1.8 } });
}

// ---- Death & stingers -----------------------------------------------------

export function playDeath(pan = 0): void {
  const v = voice(pan, { echo: 0.15, life: 0.8 });
  if (!v) return;
  // Body-drop thud + descending whistle
  T(v, { type: 'sine', freq: 90, freqEnd: 35, glide: 0.3, dur: 0.35, gain: 0.5, attack: 0.002 });
  N(v, { at: 0.02, brown: true, dur: 0.25, gain: 0.5, attack: 0.004, filter: { type: 'lowpass', freq: 300 } });
  T(v, { type: 'sawtooth', freq: 420, freqEnd: 90, glide: 0.55, dur: 0.6, gain: 0.16, attack: 0.005, filter: { type: 'lowpass', freq: 1200 } });
}

export function playKillSting(): void {
  // "dah-DAHHH": Bb grace falling onto an A-minor brass stab (Phrygian sigh),
  // doubled by a twangy baritone guitar and a timpani hit.
  const v = voice(0, { echo: 0.12, reverb: 0.35, life: 2.4 });
  if (!v) return;
  duckMusic(0.5, 0.9, 0.8);
  brass(v, midiToFreq(46), 0, 0.1, 0.12, { bright: 4 });
  brass(v, midiToFreq(58), 0, 0.1, 0.07, { bright: 4 });
  for (const n of [45, 52, 57, 60]) {
    brass(v, midiToFreq(n), 0.12, 0.85, n < 50 ? 0.12 : 0.08, { bright: 5, vib: 10 });
  }
  P(v, 45, 0.12, 0.45, 'twang');
  P(v, 52, 0.13, 0.3, 'twang');
  T(v, { at: 0.12, type: 'sine', freq: 87, freqEnd: 62, glide: 0.3, dur: 0.8, gain: 0.42, attack: 0.003 });
  N(v, { at: 0.12, dur: 0.15, gain: 0.28, filter: { type: 'lowpass', freq: 250 } });
}

// ---- Round flow -----------------------------------------------------------

export function playCountdownTick(urgency: number): void {
  const u = clamp(Number.isFinite(urgency) ? urgency : 0, 0, 1);
  const v = voice(0, { life: 0.25 });
  if (!v) return;
  N(v, { dur: 0.018, gain: 0.18 + 0.22 * u, filter: { type: 'bandpass', freq: 3000 + 2500 * u, q: 4 } });
  const f = 1000 + 800 * u;
  T(v, { type: 'sine', freq: f, freqEnd: f * 0.85, dur: 0.05, gain: 0.12 + 0.15 * u, attack: 0.001 });
  if (u > 0.5) T(v, { type: 'sine', freq: 160, freqEnd: 120, dur: 0.08, gain: 0.15 * u, attack: 0.002 });
}

export function playRoundStart(): void {
  // "Draw!": whip swish → crack, then a mission bell ding.
  const v = voice(0, { echo: 0.22, reverb: 0.25, life: 1.6 });
  if (!v) return;
  N(v, { dur: 0.07, gain: 0.14, attack: 0.045, filter: { type: 'bandpass', freq: 1200, freqEnd: 7000, sweep: 0.05, q: 1.2 } });
  N(v, { at: 0.05, dur: 0.03, gain: 0.5, attack: 0.0008, filter: { type: 'highpass', freq: 2000 } });
  N(v, { at: 0.05, dur: 0.02, gain: 0.25, attack: 0.0008, filter: { type: 'bandpass', freq: 4500, q: 1 } });
  const base = 880;
  const bell: Array<[number, number, number]> = [
    [0.5, 0.06, 1.6], [1, 0.14, 1.2], [1.183, 0.08, 0.9], [1.506, 0.05, 0.8],
    [2, 0.07, 0.7], [2.514, 0.03, 0.5], [2.662, 0.02, 0.4], [3.011, 0.02, 0.35],
  ];
  for (const [ratio, gain, dur] of bell) {
    T(v, { at: 0.07, type: 'sine', freq: base * ratio, dur, gain, attack: 0.002 });
  }
}

/** Kept for existing call sites — now the "Draw!" cue. */
export function playTickStart(): void {
  playRoundStart();
}

export function playReveal(): void {
  // Whoosh / riser as the plans are revealed
  const v = voice(0, { reverb: 0.2, life: 0.8 });
  if (!v) return;
  N(v, { dur: 0.45, gain: 0.32, attack: 0.16, filter: { type: 'bandpass', freq: 500, freqEnd: 4500, sweep: 0.22, q: 1.4 } });
  N(v, { dur: 0.3, gain: 0.07, attack: 0.12, filter: { type: 'highpass', freq: 6000 } });
  T(v, { type: 'sine', freq: 200, freqEnd: 900, glide: 0.2, dur: 0.3, gain: 0.07, attack: 0.15 });
}

/** Resolution start: reveal whoosh + low cinematic brass rumble. */
export function playTickResolve(): void {
  playReveal();
  const v = voice(0, { reverb: 0.2, life: 0.9 });
  if (!v) return;
  T(v, { at: 0.05, type: 'sine', freq: 160, freqEnd: 55, glide: 0.55, dur: 0.7, gain: 0.45, attack: 0.003 });
  T(v, { at: 0.05, type: 'sawtooth', freq: 220, freqEnd: 110, glide: 0.45, dur: 0.6, gain: 0.18, attack: 0.01, filter: { type: 'lowpass', freq: 900, q: 0.8 } });
  T(v, { at: 0.05, type: 'triangle', freq: 330, freqEnd: 165, glide: 0.4, dur: 0.55, gain: 0.12, attack: 0.01, filter: { type: 'lowpass', freq: 1600 } });
  N(v, { at: 0.05, dur: 0.5, gain: 0.15, attack: 0.02, filter: { type: 'bandpass', freq: 380, q: 0.5 } });
}

// ---- UI ---------------------------------------------------------------------

export function playEmotePop(): void {
  const v = voice(0, { life: 0.25 });
  if (!v) return;
  N(v, { dur: 0.008, gain: 0.08, filter: { type: 'highpass', freq: 2000 } });
  T(v, { type: 'sine', freq: 320, freqEnd: 1100, glide: 0.05, dur: 0.09, gain: 0.22, attack: 0.002 });
  T(v, { at: 0.06, type: 'sine', freq: 900, freqEnd: 1600, glide: 0.04, dur: 0.05, gain: 0.07, attack: 0.002 });
}

export function playUiTap(): void {
  const v = voice(0, { life: 0.15 });
  if (!v) return;
  T(v, { type: 'triangle', freq: 1600, freqEnd: 1200, dur: 0.03, gain: 0.07, attack: 0.001 });
  N(v, { dur: 0.006, gain: 0.05, filter: { type: 'bandpass', freq: 4000, q: 1 } });
}

export function playDenied(): void {
  // Two-note descending disappointed minor
  const v = voice(0, { life: 0.4 });
  if (!v) return;
  T(v, { type: 'triangle', freq: 440, dur: 0.14, gain: 0.18, attack: 0.003, filter: { type: 'lowpass', freq: 1600 } });
  T(v, { at: 0.08, type: 'triangle', freq: 349.23, dur: 0.24, gain: 0.18, attack: 0.004, filter: { type: 'lowpass', freq: 1400 } });
}

export function playJoin(): void {
  const v = voice(0, { life: 0.4 });
  if (!v) return;
  T(v, { at: 0.02, type: 'triangle', freq: 392, dur: 0.2, gain: 0.2, attack: 0.004 });
  T(v, { at: 0.09, type: 'triangle', freq: 587.33, dur: 0.25, gain: 0.2, attack: 0.004 });
}

// ---- Endings ----------------------------------------------------------------

export function playVictory(): void {
  // Trumpet fanfare: "ta-ta-ta-TAAA, ta-ta-ta-TAAAAA" in C major, with
  // harmony, timpani, cymbal shimmer and a final guitar strum.
  const v = voice(0, { echo: 0.12, reverb: 0.3, life: 3.4 });
  if (!v) return;
  duckMusic(0.3, 2.4, 1.2);
  const m = midiToFreq;
  const lead: Array<[number, number, number]> = [
    [67, 0, 0.12], [67, 0.15, 0.12], [67, 0.3, 0.12], [72, 0.45, 0.48],
    [67, 0.96, 0.13], [72, 1.11, 0.13], [76, 1.26, 0.13], [79, 1.41, 1.3],
  ];
  for (const [n, at, d] of lead) brass(v, m(n), at + 0.04, d, 0.13, { bright: 6, vib: d > 0.4 ? 14 : 0 });
  for (const [n, at, d] of [[64, 0.45, 0.48], [76, 1.41, 1.3], [72, 1.41, 1.3]] as Array<[number, number, number]>) {
    brass(v, m(n), at + 0.04, d, 0.08, { bright: 5, vib: 10 });
  }
  for (const [n, at, d] of [[48, 0.45, 0.5], [43, 0.96, 0.4], [48, 1.41, 1.3]] as Array<[number, number, number]>) {
    brass(v, m(n), at + 0.04, d, 0.1, { bright: 3 });
  }
  T(v, { at: 0.49, type: 'sine', freq: 98, freqEnd: 92, dur: 0.5, gain: 0.38, attack: 0.002 });
  T(v, { at: 1.45, type: 'sine', freq: 65, freqEnd: 62, dur: 1.2, gain: 0.45, attack: 0.002 });
  N(v, { at: 1.45, dur: 0.12, gain: 0.22, filter: { type: 'lowpass', freq: 300 } });
  N(v, { at: 1.45, dur: 1.6, gain: 0.1, attack: 0.005, filter: { type: 'highpass', freq: 5000 } });
  [48, 52, 55, 60, 64].forEach((n, i) => P(v, n, 1.45 + i * 0.018, 0.32));
}

export function playDefeat(): void {
  // Sad muted trombone "wah-wah-wah-waaaah" with a lonely wind gust.
  const v = voice(0, { reverb: 0.25, life: 3.4 });
  if (!v) return;
  duckMusic(0.3, 2.6, 1.2);
  const m = midiToFreq;
  const notes: Array<[number, number, number]> = [[55, 0, 0.42], [54, 0.5, 0.42], [53, 1.0, 0.42], [52, 1.5, 1.6]];
  notes.forEach(([n, at, d], i) => {
    const last = i === notes.length - 1;
    brass(v, m(n), at + 0.05, d, 0.15, { wah: true, bright: 7, vib: last ? 30 : 0, wobble: last });
    brass(v, m(n - 12), at + 0.05, d, 0.06, { wah: true, bright: 6 });
  });
  P(v, 40, 1.55, 0.4, 'bass');
  N(v, { at: 0.3, brown: true, dur: 2.6, gain: 0.6, attack: 0.8, filter: { type: 'bandpass', freq: 400, freqEnd: 900, q: 1.2 } });
}

// ---- Music --------------------------------------------------------------

export function startAmbient(): void {
  if (music) return;
  const c = ensureCtx();
  if (!c || !graph) return;
  resumeIfNeeded();
  // Reset any duck left over from an ending stinger
  graph.duck.gain.cancelScheduledValues(c.currentTime);
  graph.duck.gain.setValueAtTime(1, c.currentTime);
  try {
    music = startMusic({
      ctx: c,
      dest: graph.music,
      reverb: graph.reverb,
      white: graph.white,
      brown: graph.brown,
      isMuted: () => muted,
      intensity: musicIntensity,
    });
  } catch {
    music = null;
  }
}

export function stopAmbient(): void {
  if (!music) return;
  music.stop();
  music = null;
}

/** 0..1 — faster tempo, shaker/kick/brush, then a tremolo string pad at the top. */
export function setMusicIntensity(level: number): void {
  musicIntensity = clamp(Number.isFinite(level) ? level : 0, 0, 1);
  music?.setIntensity(musicIntensity);
}
