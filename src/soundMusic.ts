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

import { createMusicTransport, musicNotes, type MusicNote } from './musicScore';

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

export type PluckKind = 'nylon' | 'bass' | 'twang' | 'banjo';

const KS_PARAMS: Record<PluckKind, { decay: number; bright: number }> = {
  nylon: { decay: 1.9, bright: 0.32 },
  bass: { decay: 1.5, bright: 0.28 },
  twang: { decay: 1.6, bright: 0.48 },
  banjo: { decay: 1.25, bright: 0.68 },
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

// ---- Ambient spaghetti-western score -----------------------------------
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
  syncRound: (durationSec: number) => void;
}

/** Music-only room: never route the score through the effects volume bus. */
export function createMusicVoices(c: BaseAudioContext, dest: AudioNode, white: AudioBuffer) {
  const owned: AudioNode[] = [];
  const running: AudioScheduledSourceNode[] = [];
  const keep = <T extends AudioNode>(n: T): T => { owned.push(n); return n; };
  const room = keep(c.createConvolver());
  const impulse = c.createBuffer(2, Math.ceil(c.sampleRate * 3.1), c.sampleRate);
  // Dark, diffuse decay; a gentle space around strings, not a repeating echo.
  let seed = 7841;
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      low += 0.16 * (((seed >>> 0) / 4294967296) * 2 - 1 - low);
      data[i] = low * Math.pow(1 - i / data.length, 3) * Math.min(1, i / (c.sampleRate * 0.025));
    }
  }
  room.buffer = impulse;
  const wet = keep(c.createGain()); wet.gain.value = 0.28;
  room.connect(wet).connect(dest);
  const instrumentBus = (panValue: number, cutoff: number, roomSend: number) => {
    const filter = keep(c.createBiquadFilter());
    filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = 0.45;
    const pan = keep(makePanner(c, panValue).node);
    const send = keep(c.createGain()); send.gain.value = roomSend;
    filter.connect(pan).connect(dest);
    pan.connect(send).connect(room);
    return filter;
  };
  const banjo = instrumentBus(-0.19, 2600, 0.65);
  const guitarOut = instrumentBus(-0.28, 2300, 1.1);
  const guitar = keep(c.createGain()); guitar.gain.value = 0.94;
  guitar.connect(guitarOut);
  // Soft vintage-amp tremolo and one dark slapback behind the low strings.
  // This free-running shimmer is unrelated to the round boundary.
  const tremolo = keep(c.createOscillator()), tremoloDepth = keep(c.createGain());
  tremolo.frequency.value = 3.7; tremoloDepth.gain.value = 0.055;
  tremolo.connect(tremoloDepth).connect(guitar.gain);
  tremolo.start(c.currentTime); running.push(tremolo);
  const slap = keep(c.createDelay(1)); slap.delayTime.value = 0.19;
  const slapTone = keep(c.createBiquadFilter()); slapTone.type = 'lowpass'; slapTone.frequency.value = 1450;
  const slapGain = keep(c.createGain()); slapGain.gain.value = 0.14;
  guitar.connect(slap).connect(slapTone).connect(slapGain).connect(guitarOut);
  const bass = instrumentBus(0, 420, 0.2);
  const harmonica = instrumentBus(0.17, 1750, 1);
  const whistle = instrumentBus(0.3, 1900, 1.5);
  const pad = instrumentBus(-0.04, 750, 1.2);
  const reedWave = c.createPeriodicWave(
    new Float32Array(7), new Float32Array([0, 1, 0.44, 0.23, 0.1, 0.04, 0.015]),
  );

  const playReed = (note: MusicNote, when: number) => {
    const osc = c.createOscillator(), envelope = c.createGain();
    osc.setPeriodicWave(reedWave);
    const freq = midiToFreq(note.midi), end = when + note.duration;
    // Breath-led attack and a tiny bend; no piercing high-register whistle.
    osc.frequency.setValueAtTime(freq * 0.985, when);
    osc.frequency.exponentialRampToValueAtTime(freq, when + 0.3);
    const attack = Math.min(0.32, note.duration * 0.15);
    shape(envelope.gain, when, attack, note.gain, end, note.duration * 0.5, 0.78);
    osc.connect(envelope).connect(harmonica);
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = 4.6;
    depth.gain.setValueAtTime(0, when);
    depth.gain.linearRampToValueAtTime(9, when + note.duration * 0.65);
    lfo.connect(depth).connect(osc.detune);
    osc.start(when); lfo.start(when);
    osc.stop(end + 0.05); lfo.stop(end + 0.05);
    osc.onended = () => [osc, envelope, lfo, depth].forEach(safeDisconnect);
    burst(c, {dest: harmonica, when, buffer: white, dur: note.duration,
      gain: note.gain * 0.055, attack, hold: note.duration * 0.5, sustain: 0.65,
      filter: {type: 'bandpass', freq: 1450, q: 0.5}});
  };
  return {
    setWarmth(level: number) { harmonica.frequency.setTargetAtTime(1750 + clamp(level, 0, 1) * 120, c.currentTime, 2); },
    play(note: MusicNote, when: number) {
      const freq = midiToFreq(note.midi);
      if (note.instrument === 'banjo') {
        pluck(c, banjo, freq, when, note.gain, 'banjo');
        // Quiet membrane resonances give the pluck a wooden banjo body.
        tone(c, {dest: banjo, when, freq: 560, freqEnd: 540, dur: 0.09, gain: note.gain * 0.055, attack: 0.008});
        tone(c, {dest: banjo, when, freq: 980, dur: 0.06, gain: note.gain * 0.023, attack: 0.007});
      } else if (note.instrument === 'guitar') {
        const string = ksBuffer(c, freq, 'twang');
        const src = c.createBufferSource(), gain = c.createGain();
        src.buffer = string.buffer;
        src.playbackRate.setValueAtTime(string.rate * 0.992, when);
        src.playbackRate.exponentialRampToValueAtTime(string.rate, when + 0.1);
        gain.gain.value = note.gain;
        src.connect(gain).connect(guitar);
        src.onended = () => { safeDisconnect(src); safeDisconnect(gain); };
        src.start(when);
        tone(c, {dest: guitar, when, freq: freq * 2, dur: note.duration, gain: note.gain * 0.045,
          type: 'triangle', attack: 0.012});
      } else if (note.instrument === 'whistle') {
        tone(c, {dest: whistle, when, freq: freq * 0.99, freqEnd: freq, glide: 0.2,
          dur: note.duration, gain: note.gain, attack: 0.18, hold: note.duration * 0.45, sustain: 0.78,
          vibrato: {rate: 4.3, cents: 6, delay: 0.35, ramp: 0.5}});
        burst(c, {dest: whistle, when, buffer: white, dur: note.duration, gain: note.gain * 0.07,
          attack: 0.18, filter: {type: 'bandpass', freq: 1800, q: 0.8}});
      } else if (note.instrument === 'harmonica') {
        playReed(note, when);
      } else if (note.instrument === 'bass') {
        tone(c, {dest: bass, when, freq, dur: note.duration, gain: note.gain, type: 'triangle', attack: 0.14, hold: 0.3, sustain: 0.65});
      } else {
        tone(c, {dest: pad, when, freq, dur: note.duration, gain: note.gain, type: 'sine',
          attack: Math.min(1.8, note.duration * 0.22), hold: note.duration * 0.4, sustain: 0.8,
          vibrato: {rate: 0.17, cents: 3, delay: 0.5, ramp: 1}});
      }
    },
    disconnect() {
      for (const source of running) { try { source.stop(); } catch { /* already stopped */ } }
      owned.forEach(safeDisconnect);
    },
  };
}

export function startMusic(env: MusicEnv): MusicHandle {
  const c = env.ctx;
  const bus = c.createGain();
  bus.gain.setValueAtTime(0, c.currentTime);
  bus.gain.linearRampToValueAtTime(1, c.currentTime + 2.8);
  bus.connect(env.dest);
  const voices = createMusicVoices(c, bus, env.white);
  const transport = createMusicTransport(c.currentTime);
  voices.setWarmth(env.intensity);
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const lookahead = typeof document !== 'undefined' && document.hidden ? 1.2 : 0.15;
    for (const event of transport.due(c.currentTime, lookahead)) {
      if (env.isMuted()) continue;
      for (const note of musicNotes(event.step, event.eighth)) voices.play(note, event.when + (note.delay ?? 0));
    }
  };
  const timer = setInterval(tick, 25); tick();
  return {
    setIntensity(value) { if (!stopped) voices.setWarmth(Number.isFinite(value) ? value : 0); },
    syncRound(durationSec) { transport.setRoundDuration(durationSec); },
    stop() {
      if (stopped) return;
      stopped = true; clearInterval(timer);
      bus.gain.cancelScheduledValues(c.currentTime);
      bus.gain.setTargetAtTime(0, c.currentTime, 0.14);
      setTimeout(() => { voices.disconnect(); safeDisconnect(bus); }, 900);
    },
  };
}
