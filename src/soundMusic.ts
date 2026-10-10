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
  nylon: { decay: 1.7, bright: 0.5 },
  bass: { decay: 1.5, bright: 0.28 },
  twang: { decay: 2.3, bright: 0.85 },
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
//
// 8 bars of 4/4, eighth-note grid, Andalusian-ish Am | Am | G | G | F | F | E | E.
// Nylon guitar ostinato + bass on 1 and 3, whistle melody on every other
// pass, wind underneath. Intensity adds tempo, shaker/kick/brush and finally
// a tremolo string pad.

interface Chord { root: number; fifth: number; g: [number, number, number, number] }
const CHORDS: Chord[] = [
  { root: 45, fifth: 40, g: [52, 57, 60, 64] }, // Am
  { root: 43, fifth: 38, g: [50, 55, 59, 62] }, // G
  { root: 41, fifth: 36, g: [53, 57, 60, 65] }, // F
  { root: 40, fifth: 35, g: [52, 56, 59, 64] }, // E (major — harmonic minor V)
];
const PROG = [0, 0, 1, 1, 2, 2, 3, 3];
const PATTERN = [0, 2, 3, 2, 1, 2, 3, 2];
const STEPS_PER_BAR = 8;
const STEPS_PER_LOOP = STEPS_PER_BAR * PROG.length;

// [beat (quarter notes from loop start), midi, length in beats]
const WHISTLE: Array<[number, number, number]> = [
  [0, 76, 1.5], [1.5, 81, 2.5],
  [4.5, 79, 0.5], [5, 76, 3],
  [8, 74, 1.5], [9.5, 79, 2.5],
  [12.5, 77, 0.5], [13, 74, 3],
  [16, 72, 1], [17, 77, 1], [18, 81, 2],
  [20.5, 79, 0.5], [21, 77, 1], [22, 76, 2],
  [24, 71, 1], [25, 76, 1], [26, 80, 2],
  [28, 76, 3.5],
];

const BASE_BPM = 90;

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
  const t0 = c.currentTime;
  const owned: AudioNode[] = [];
  const keep = <T extends AudioNode>(n: T): T => { owned.push(n); return n; };
  const lowpass = (freq: number, q = 0.7): BiquadFilterNode => {
    const f = keep(c.createBiquadFilter());
    f.type = 'lowpass';
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  };
  const gainNode = (v: number): GainNode => {
    const g = keep(c.createGain());
    g.gain.value = v;
    return g;
  };

  // Master fade for the whole score
  const bus = keep(c.createGain());
  bus.gain.setValueAtTime(0, t0);
  bus.gain.linearRampToValueAtTime(1, t0 + 1.5);
  bus.connect(env.dest);

  const revSend = gainNode(1);
  if (env.reverb) revSend.connect(env.reverb);

  // Guitar: body bump + gentle lowpass, slightly left, generous reverb.
  const guitarIn = gainNode(1);
  const gBody = keep(c.createBiquadFilter());
  gBody.type = 'peaking';
  gBody.frequency.value = 240;
  gBody.Q.value = 0.9;
  gBody.gain.value = 4;
  const gPan = makePanner(c, -0.22);
  keep(gPan.node);
  guitarIn.connect(gBody).connect(lowpass(3400)).connect(gPan.node);
  gPan.node.connect(bus);
  gPan.node.connect(gainNode(0.35)).connect(revSend);

  // Bass
  const bassIn = gainNode(1);
  bassIn.connect(lowpass(650)).connect(bus);

  // Whistle: slightly right, drenched in reverb (Morricone)
  const whistleIn = gainNode(1);
  const wPan = makePanner(c, 0.18);
  keep(wPan.node);
  whistleIn.connect(lowpass(4500)).connect(wPan.node);
  wPan.node.connect(bus);
  wPan.node.connect(gainNode(0.55)).connect(revSend);

  // Percussion
  const percIn = gainNode(1);
  percIn.connect(bus);

  // Tremolo string pad (only audible at high intensity)
  const padIn = gainNode(1);
  const padTrem = gainNode(0.55);
  const padLevel = gainNode(0);
  const padLp = lowpass(2200);
  padIn.connect(padTrem).connect(padLevel).connect(padLp).connect(bus);
  padLp.connect(gainNode(0.4)).connect(revSend);
  const tremLfo = keep(c.createOscillator());
  tremLfo.frequency.value = 7.5;
  tremLfo.connect(gainNode(0.45)).connect(padTrem.gain);
  tremLfo.start(t0);

  // Wind bed: looping brown noise through a slowly breathing lowpass
  const windSrc = keep(c.createBufferSource());
  windSrc.buffer = env.brown;
  windSrc.loop = true;
  const windLp = lowpass(300, 0.6);
  const windLfo = keep(c.createOscillator());
  windLfo.frequency.value = 0.07;
  windLfo.connect(gainNode(140)).connect(windLp.frequency);
  windSrc.connect(windLp).connect(gainNode(0.32)).connect(bus);
  windLfo.start(t0);
  windSrc.start(t0);

  // ---- Instruments ----
  const kick = (t: number, g: number): void => {
    tone(c, { dest: percIn, when: t, type: 'sine', freq: 130, freqEnd: 45, glide: 0.08, dur: 0.22, gain: g, attack: 0.002 });
    burst(c, { dest: percIn, when: t, buffer: env.white, dur: 0.012, gain: g * 0.25, filter: { type: 'lowpass', freq: 2000 } });
  };
  const shaker = (t: number, g: number): void => {
    burst(c, { dest: percIn, when: t, buffer: env.white, dur: 0.04, gain: g, attack: 0.004, filter: { type: 'highpass', freq: 5500 } });
  };
  const brush = (t: number, g: number): void => {
    burst(c, { dest: percIn, when: t, buffer: env.white, dur: 0.11, gain: g, attack: 0.002, filter: { type: 'bandpass', freq: 1900, q: 0.8 } });
  };
  const padChord = (chord: Chord, t: number, len: number): void => {
    for (const n of chord.g.slice(1)) {
      const f = midiToFreq(n + 12);
      for (const det of [-8, 8]) {
        tone(c, {
          dest: padIn, when: t, type: 'sawtooth', freq: f, detune: det,
          dur: len + 0.35, gain: 0.05, attack: 0.25, hold: len - 0.25, sustain: 0.9,
        });
      }
    }
  };

  let lastWhistleFreq = 0;
  let lastWhistleEnd = -1;
  const whistle = (freq: number, t: number, dur: number): void => {
    const from = t - lastWhistleEnd < 0.06 && lastWhistleFreq > 0 ? lastWhistleFreq : freq * 0.93;
    const end = t + dur + 0.08;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.07);
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.1 + Math.random() * 0.6;
    const lg = c.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.setValueAtTime(0, t + 0.12);
    lg.gain.linearRampToValueAtTime(16, t + Math.min(dur, 0.6) + 0.12);
    const tri = c.createBiquadFilter(); // tame triangle harmonics → near-sine whistle
    tri.type = 'lowpass';
    tri.frequency.value = freq * 1.6;
    const g = c.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.17, t + Math.max(0.06, dur - 0.03));
    g.gain.exponentialRampToValueAtTime(FLOOR, end);
    lfo.connect(lg).connect(osc.detune);
    osc.connect(tri).connect(g).connect(whistleIn);
    osc.onended = () => [osc, lfo, lg, tri, g].forEach(safeDisconnect);
    osc.start(t); lfo.start(t);
    osc.stop(end + 0.05); lfo.stop(end + 0.05);
    lastWhistleFreq = freq;
    lastWhistleEnd = t + dur;
  };

  // ---- Scheduler ----
  let level = clamp(env.intensity, 0, 1);
  let target = level;
  let step = 0;
  let nextTime = t0 + 0.1;
  let stopped = false;

  const scheduleStep = (s: number, t: number, eighth: number): void => {
    const sib = s % STEPS_PER_BAR;
    const bar = Math.floor(s / STEPS_PER_BAR) % PROG.length;
    const loop = Math.floor(s / STEPS_PER_LOOP);
    const chord = CHORDS[PROG[bar]];
    const whistleLoop = loop % 2 === 1;
    const human = () => Math.random() * 0.008;

    // Guitar ostinato
    const accent = sib === 0 ? 0.5 : sib === 4 ? 0.42 : 0.3 + Math.random() * 0.06;
    pluck(c, guitarIn, midiToFreq(chord.g[PATTERN[sib]]), t + human(), accent * (whistleLoop ? 0.8 : 1), 'nylon');

    // Bass on 1 and 3, gallop pickup at higher intensity
    if (sib === 0) pluck(c, bassIn, midiToFreq(chord.root), t, 0.75, 'bass');
    if (sib === 4) pluck(c, bassIn, midiToFreq(chord.fifth), t, 0.55, 'bass');
    if (sib === 7 && level > 0.55) pluck(c, bassIn, midiToFreq(chord.root), t + eighth * 0.5, 0.35, 'bass');

    // Whistle melody on alternate passes
    if (whistleLoop) {
      const b0 = (bar * STEPS_PER_BAR + sib) / 2;
      for (const [beat, m, len] of WHISTLE) {
        if (beat >= b0 && beat < b0 + 0.5) {
          whistle(midiToFreq(m + 12), t + (beat - b0) * 2 * eighth, len * 2 * eighth);
        }
      }
    }

    // Percussion layers scale in with intensity
    if (level > 0.3 && sib % 2 === 1) {
      shaker(t + human(), 0.14 * ((level - 0.3) / 0.7) * (sib === 3 || sib === 7 ? 1 : 0.7));
    }
    if (level > 0.5 && (sib === 0 || sib === 4)) kick(t, 0.55 * ((level - 0.5) / 0.5));
    if (level > 0.7 && (sib === 2 || sib === 6)) brush(t + human(), 0.12 * ((level - 0.7) / 0.3));

    // Tremolo strings at the top end
    if (sib === 0) {
      const pad = clamp((level - 0.72) / 0.28, 0, 1);
      padLevel.gain.setTargetAtTime(pad, t, 0.4);
      if (pad > 0.02) padChord(chord, t, STEPS_PER_BAR * eighth);
    }
  };

  const tick = (): void => {
    if (stopped) return;
    const nowT = c.currentTime;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const lookahead = hidden ? 1.2 : 0.15; // background tabs throttle timers to ~1s
    if (nextTime < nowT - 0.05) nextTime = nowT + 0.03; // fell behind: resync, no burst
    while (nextTime < nowT + lookahead) {
      level += (target - level) * 0.2;
      const eighth = 60 / (BASE_BPM * (1 + 0.25 * level)) / 2;
      if (!env.isMuted()) {
        try { scheduleStep(step, nextTime, eighth); } catch { /* never kill the loop */ }
      }
      nextTime += eighth;
      step++;
    }
  };
  const timer = setInterval(tick, 25);
  tick();

  return {
    setIntensity: (l: number) => { target = clamp(l, 0, 1); },
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      const t = c.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(0, t + 0.6);
      setTimeout(() => {
        try { windSrc.stop(); } catch { /* already stopped */ }
        try { windLfo.stop(); } catch { /* already stopped */ }
        try { tremLfo.stop(); } catch { /* already stopped */ }
        owned.forEach(safeDisconnect);
      }, 750);
    },
  };
}
