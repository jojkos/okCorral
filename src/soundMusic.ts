/*
 * Synth primitives + the generated spaghetti-western score.
 *
 * Everything here is a pure function of an AudioContext handed in by
 * sound.ts — no module-level audio state, so importing this file can never
 * throw (SSR / tests) and sound.ts stays the single owner of the graph.
 *
 * Envelope rule used throughout: gains start at FLOOR (never 0) and use
 * exponential ramps, so there are no clicks and no invalid exp-ramps.
 */

export const FLOOR = 0.0001;

export const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function safeDisconnect(n: AudioNode): void {
  try { n.disconnect(); } catch { /* already disconnected */ }
}

// ---- Primitives ---------------------------------------------------------

export interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  /** Exponential sweep target. */
  freqEnd?: number;
  /** Sweep time in seconds (defaults to the sound's duration). */
  sweep?: number;
  q?: number;
  gain?: number;
}

function filterNode(c: BaseAudioContext, s: FilterSpec, t: number, dur: number): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = s.type;
  f.frequency.setValueAtTime(s.freq, t);
  if (s.freqEnd != null) {
    f.frequency.exponentialRampToValueAtTime(Math.max(20, s.freqEnd), t + Math.max(0.005, s.sweep ?? dur));
  }
  if (s.q != null) f.Q.value = s.q;
  if (s.gain != null) f.gain.value = s.gain;
  return f;
}

/** Attack → optional hold/sustain → exponential decay to FLOOR at `end`. */
function shape(p: AudioParam, t: number, attack: number, peak: number, end: number, hold?: number, sustain?: number): void {
  const pk = Math.max(FLOOR * 2, peak);
  p.setValueAtTime(FLOOR, t);
  p.exponentialRampToValueAtTime(pk, t + attack);
  if (hold && hold > 0) {
    const he = Math.min(t + attack + hold, end - 0.01);
    if (he > t + attack) p.exponentialRampToValueAtTime(Math.max(FLOOR * 2, pk * (sustain ?? 0.8)), he);
  }
  p.exponentialRampToValueAtTime(FLOOR, end);
}

export interface ToneOpts {
  dest: AudioNode;
  when: number;
  freq: number;
  freqEnd?: number;
  /** Time of the pitch sweep (defaults to dur). */
  glide?: number;
  /** Total time until the envelope reaches silence. */
  dur: number;
  gain: number;
  attack?: number;
  hold?: number;
  sustain?: number;
  type?: OscillatorType;
  detune?: number;
  filter?: FilterSpec;
  vibrato?: { rate: number; cents: number; delay?: number; ramp?: number };
}

export function tone(c: BaseAudioContext, o: ToneOpts): number {
  const t = o.when;
  const a = Math.max(0.001, o.attack ?? 0.005);
  const end = t + Math.max(o.dur, a + 0.01);
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, o.freqEnd),
      t + Math.max(0.005, Math.min(o.glide ?? o.dur, o.dur)),
    );
  }
  if (o.detune) osc.detune.value = o.detune;
  const g = c.createGain();
  shape(g.gain, t, a, o.gain, end, o.hold, o.sustain);
  const nodes: AudioNode[] = [osc, g];
  let head: AudioNode = osc;
  if (o.filter) {
    const f = filterNode(c, o.filter, t, o.dur);
    head.connect(f);
    head = f;
    nodes.push(f);
  }
  head.connect(g);
  g.connect(o.dest);
  if (o.vibrato) {
    const lfo = c.createOscillator();
    lfo.frequency.value = o.vibrato.rate;
    const lg = c.createGain();
    const d = t + (o.vibrato.delay ?? 0);
    lg.gain.setValueAtTime(0, t);
    lg.gain.setValueAtTime(0, d);
    lg.gain.linearRampToValueAtTime(o.vibrato.cents, d + (o.vibrato.ramp ?? 0.2));
    lfo.connect(lg);
    lg.connect(osc.detune);
    nodes.push(lfo, lg);
    lfo.start(t);
    lfo.stop(end + 0.05);
  }
  osc.onended = () => nodes.forEach(safeDisconnect);
  osc.start(t);
  osc.stop(end + 0.05);
  return end;
}

export interface BurstOpts {
  dest: AudioNode;
  when: number;
  buffer: AudioBuffer;
  dur: number;
  gain: number;
  attack?: number;
  hold?: number;
  sustain?: number;
  rate?: number;
  filter?: FilterSpec;
  filter2?: FilterSpec;
}

/** Enveloped slice of a (cached) noise buffer, read from a random offset. */
export function burst(c: BaseAudioContext, o: BurstOpts): void {
  const t = o.when;
  const a = Math.max(0.0005, o.attack ?? 0.001);
  const end = t + Math.max(o.dur, a + 0.005);
  const rate = o.rate ?? 1;
  const src = c.createBufferSource();
  src.buffer = o.buffer;
  src.playbackRate.value = rate;
  const need = (end - t + 0.06) * rate;
  const offset = Math.random() * Math.max(0, o.buffer.duration - need);
  const g = c.createGain();
  shape(g.gain, t, a, o.gain, end, o.hold, o.sustain);
  const nodes: AudioNode[] = [src, g];
  let head: AudioNode = src;
  for (const spec of [o.filter, o.filter2]) {
    if (!spec) continue;
    const f = filterNode(c, spec, t, o.dur);
    head.connect(f);
    head = f;
    nodes.push(f);
  }
  head.connect(g);
  g.connect(o.dest);
  src.onended = () => nodes.forEach(safeDisconnect);
  src.start(t, offset);
  src.stop(end + 0.03);
}

export function makePanner(c: BaseAudioContext, pan: number): { node: AudioNode; pan: AudioParam | null } {
  if (typeof c.createStereoPanner === 'function') {
    const p = c.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    return { node: p, pan: p.pan };
  }
  return { node: c.createGain(), pan: null };
}

export function makeNoise(c: BaseAudioContext, durationSec: number, color: 'white' | 'brown'): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * durationSec));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  if (color === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

// ---- Karplus-Strong plucked strings (precomputed, cached per pitch) ----

export type PluckKind = 'nylon' | 'bass' | 'twang';

const KS_PARAMS: Record<PluckKind, { decay: number; bright: number }> = {
  nylon: { decay: 1.9, bright: 0.32 },
  bass: { decay: 1.5, bright: 0.28 },
  twang: { decay: 1.6, bright: 0.48 },
};

interface KS { buffer: AudioBuffer; rate: number }
const ksCache = new WeakMap<BaseAudioContext, Map<string, KS>>();

export function ksBuffer(c: BaseAudioContext, freq: number, kind: PluckKind): KS {
  let cache = ksCache.get(c);
  if (!cache) { cache = new Map(); ksCache.set(c, cache); }
  const key = `${kind}:${freq.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const sr = c.sampleRate;
  const { decay, bright } = KS_PARAMS[kind];
  const exact = sr / freq;
  // The 2-tap average adds half a sample of delay; correct the residual
  // tuning error via playbackRate.
  const N = Math.max(4, Math.round(exact - 0.5));
  const rate = (N + 0.5) / exact;
  const len = Math.ceil(sr * (decay + 0.15));
  const buffer = c.createBuffer(1, len, sr);
  const d = buffer.getChannelData(0);

  // Excitation: lowpassed noise burst (lower `bright` = softer, nylon-ish).
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < N && i < len; i++) {
    lp += bright * ((Math.random() * 2 - 1) - lp);
    d[i] = lp;
    mean += lp;
  }
  mean /= N;
  for (let i = 0; i < N && i < len; i++) d[i] -= mean;

  // Loop: -60dB after `decay` seconds (plus the averaging filter's own loss).
  const damp = Math.pow(0.001, 1 / (freq * decay));
  for (let i = N; i < len; i++) {
    const a = d[i - N];
    const b = i - N - 1 >= 0 ? d[i - N - 1] : a;
    d[i] = damp * 0.5 * (a + b);
  }

  // Normalize, soften the pluck onset slightly, fade the tail to zero.
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  const norm = peak > 0 ? 0.9 / peak : 1;
  const fadeIn = 24;
  const fadeOut = Math.floor(sr * 0.08);
  for (let i = 0; i < len; i++) {
    let s = d[i] * norm;
    if (i < fadeIn) s *= i / fadeIn;
    const fromEnd = len - 1 - i;
    if (fromEnd < fadeOut) s *= fromEnd / fadeOut;
    d[i] = s;
  }

  const ks = { buffer, rate };
  cache.set(key, ks);
  return ks;
}

export function pluck(c: BaseAudioContext, dest: AudioNode, freq: number, when: number, gain: number, kind: PluckKind = 'nylon'): void {
  const ks = ksBuffer(c, freq, kind);
  const src = c.createBufferSource();
  src.buffer = ks.buffer;
  src.playbackRate.value = ks.rate;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(dest);
  src.onended = () => { safeDisconnect(src); safeDisconnect(g); };
  src.start(when);
}

// ---- The score -----------------------------------------------------------
// A slow, fingerpicked nylon guitar and a restrained bass. Every bar has rests;
// intensity adds a light wooden brush, never another competing lead voice.
const CHORDS = [
  { root: 45, fifth: 40, notes: [52, 57, 60, 64] },
  { root: 43, fifth: 38, notes: [50, 55, 59, 62] },
  { root: 41, fifth: 36, notes: [53, 57, 60, 65] },
  { root: 40, fifth: 35, notes: [52, 56, 59, 64] },
];
const PROG = [0, 0, 1, 1, 2, 2, 3, 3];
export interface MusicEnv {
  ctx: AudioContext;
  dest: AudioNode;
  reverb: AudioNode | null;
  white: AudioBuffer;
  brown: AudioBuffer;
  isMuted: () => boolean;
  intensity: number;
}
export interface MusicHandle {
  stop: () => void;
  setIntensity: (level: number) => void;
}
export function startMusic(env: MusicEnv): MusicHandle {
  const c = env.ctx;
  const owned: AudioNode[] = [];
  const keep = <T extends AudioNode>(n: T): T => { owned.push(n); return n; };
  const bus = keep(c.createGain());
  bus.gain.setValueAtTime(0, c.currentTime);
  bus.gain.linearRampToValueAtTime(1, c.currentTime + 1.8);
  bus.connect(env.dest);
  const guitar = keep(c.createGain());
  const body = keep(c.createBiquadFilter());
  body.type = 'peaking'; body.frequency.value = 230; body.Q.value = 0.8; body.gain.value = 2;
  const warmth = keep(c.createBiquadFilter());
  warmth.type = 'lowpass'; warmth.frequency.value = 2300; warmth.Q.value = 0.5;
  const pan = makePanner(c, -0.13); keep(pan.node);
  guitar.connect(body).connect(warmth).connect(pan.node).connect(bus);
  const bass = keep(c.createBiquadFilter());
  bass.type = 'lowpass'; bass.frequency.value = 480; bass.Q.value = 0.5; bass.connect(bus);
  let level = clamp(env.intensity, 0, 1), target = level;
  let step = 0, nextTime = c.currentTime + 0.1, stopped = false;
  const tick = () => {
    if (stopped) return;
    const now = c.currentTime;
    const lookahead = typeof document !== 'undefined' && document.hidden ? 1.2 : 0.15;
    if (nextTime < now - 0.05) nextTime = now + 0.03;
    while (nextTime < now + lookahead) {
      level += (target - level) * 0.2;
      const eighth = 60 / (76 + level * 4) / 2;
      const slot = step % 8, bar = Math.floor(step / 8) % 8;
      const chord = CHORDS[PROG[bar]];
      if (!env.isMuted()) {
        // Four fingers, with the last beat left open on alternating bars.
        const pattern = bar % 2 ? [0, -1, 2, -1, 1, -1, -1, -1] : [0, -1, 2, 3, -1, 1, -1, -1];
        const note = pattern[slot];
        if (note >= 0) pluck(c, guitar, midiToFreq(chord.notes[note]), nextTime + Math.random() * 0.006, slot === 0 ? 0.38 : 0.28, 'nylon');
        if (slot === 0) pluck(c, bass, midiToFreq(chord.root), nextTime, 0.48, 'bass');
        if (slot === 4 && bar % 2 === 0) pluck(c, bass, midiToFreq(chord.fifth), nextTime, 0.3, 'bass');
        // A sparse higher guitar answer replaces the high whistle.
        if (bar % 2 === 1 && slot === 5) pluck(c, guitar, midiToFreq(chord.notes[3]), nextTime, 0.2, 'nylon');
        if (level > 0.5 && (slot === 2 || slot === 6)) burst(c, {
          dest: bus, when: nextTime, buffer: env.brown, dur: 0.065,
          gain: 0.1 * (level - 0.5), attack: 0.008,
          filter: { type: 'bandpass', freq: 900, q: 0.6 },
        });
      }
      nextTime += eighth; step++;
    }
  };
  const timer = setInterval(tick, 25); tick();
  return {
    setIntensity: (value) => { target = clamp(value, 0, 1); },
    stop: () => {
      if (stopped) return;
      stopped = true; clearInterval(timer);
      bus.gain.cancelScheduledValues(c.currentTime);
      bus.gain.setTargetAtTime(0, c.currentTime, 0.12);
      setTimeout(() => owned.forEach(safeDisconnect), 700);
    },
  };
}
