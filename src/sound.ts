/*
 * Dusty Silence recording plus procedural gameplay effects. Organized around:
 *   - playX() — one-shot SFX tied to game events (most take an optional
 *     stereo `pan`: -1 = left / sheriffs, +1 = right / outlaws)
 *   - startAmbient() / stopAmbient() — the locally bundled Dusty Silence recording
 *   - setMuted() / setVolume() — global controls
 *
 * Graph: effects + short echo/reverb → effects volume + warmth ─┐
 *        recorded score → music volume → duck ────────────────┼→ compressor
 *        → limiter → soft peak ceiling → master → output.
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
  tone,
  type BurstOpts,
  type PluckKind,
  type ToneOpts,
} from './soundMusic';
import { startRecordedMusic, WESTERN_TRACK, type MusicPlaybackStatus, type RecordedMusicHandle } from './recordedMusic';
export { WESTERN_TRACK } from './recordedMusic';

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

export interface AudioPreferences {
  musicEnabled: boolean;
  effectsEnabled: boolean;
  musicVolume: number;
  effectsVolume: number;
}
const AUDIO_KEY = 'okCorral-audio';
const defaults: AudioPreferences = { musicEnabled: true, effectsEnabled: true, musicVolume: 0.5, effectsVolume: 0.7 };
function readAudioPreferences(): AudioPreferences {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(AUDIO_KEY) || '{}');
    return {
      musicEnabled: typeof value.musicEnabled === 'boolean' ? value.musicEnabled : true,
      effectsEnabled: typeof value.effectsEnabled === 'boolean' ? value.effectsEnabled : true,
      musicVolume: Number.isFinite(value.musicVolume) ? Math.max(0, Math.min(1, value.musicVolume)) : defaults.musicVolume,
      effectsVolume: Number.isFinite(value.effectsVolume) ? Math.max(0, Math.min(1, value.effectsVolume)) : defaults.effectsVolume,
    };
  } catch { return { ...defaults }; }
}
let audioPreferences = readAudioPreferences();
export function getAudioPreferences(): AudioPreferences { return { ...audioPreferences }; }
export function setAudioPreferences(next: Partial<AudioPreferences>): void {
  audioPreferences = {
    musicEnabled: typeof next.musicEnabled === 'boolean' ? next.musicEnabled : audioPreferences.musicEnabled,
    effectsEnabled: typeof next.effectsEnabled === 'boolean' ? next.effectsEnabled : audioPreferences.effectsEnabled,
    musicVolume: Number.isFinite(next.musicVolume) ? Math.max(0, Math.min(1, next.musicVolume!)) : audioPreferences.musicVolume,
    effectsVolume: Number.isFinite(next.effectsVolume) ? Math.max(0, Math.min(1, next.effectsVolume!)) : audioPreferences.effectsVolume,
  };
  try { globalThis.localStorage?.setItem(AUDIO_KEY, JSON.stringify(audioPreferences)); } catch { /* storage unavailable */ }
  if (ctx && graph) {
    graph.sfx.gain.setTargetAtTime(audioPreferences.effectsEnabled ? audioPreferences.effectsVolume * 0.8 : 0, ctx.currentTime, 0.03);
    graph.music.gain.setTargetAtTime(audioPreferences.musicEnabled ? audioPreferences.musicVolume * 0.45 : 0, ctx.currentTime, 0.05);
  }
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
let music: RecordedMusicHandle | null = null;
let musicRoundDuration = 4;
let musicStatus: MusicPlaybackStatus = 'idle';
const musicListeners = new Set<() => void>();
export function getMusicStatus(): MusicPlaybackStatus { return musicStatus; }
export function subscribeMusicStatus(listener: () => void) { musicListeners.add(listener); return () => { musicListeners.delete(listener); }; }
function setMusicStatus(status: MusicPlaybackStatus) { musicStatus = status; musicListeners.forEach(listener => listener()); }

function makeImpulse(c: BaseAudioContext, dur: number): AudioBuffer {
  // Short, dark room response; kept behind the direct material sound.
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
  // The compressor can overshoot on coincident volleys. This final, normally
  // transparent soft knee also bounds peaks when every volume is at maximum.
  const ceiling = c.createWaveShaper();
  const curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) {
    const x = i / (curve.length - 1) * 2 - 1, magnitude = Math.abs(x);
    curve[i] = Math.sign(x) * (magnitude <= 0.7 ? magnitude : 0.7 + 0.2 * (1 - Math.exp(-(magnitude - 0.7) / 0.2)));
  }
  ceiling.curve = curve;
  limiter.connect(ceiling).connect(master);

  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(limiter);

  const sfx = c.createGain();
  sfx.gain.value = audioPreferences.effectsEnabled ? audioPreferences.effectsVolume * 0.8 : 0;
  const sfxWarmth = c.createBiquadFilter();
  sfxWarmth.type = 'lowpass'; sfxWarmth.frequency.value = 4200; sfxWarmth.Q.value = 0.5;
  sfx.connect(sfxWarmth).connect(comp);

  const duck = c.createGain();
  duck.connect(comp);
  const musicBus = c.createGain();
  musicBus.gain.value = audioPreferences.musicEnabled ? audioPreferences.musicVolume * 0.45 : 0;
  musicBus.connect(duck);

  // Quiet stereo reflection with little feedback; avoids repeated sharp attacks.
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
  fbA.gain.value = 0.16;
  const fbB = c.createGain();
  fbB.gain.value = 0.12;
  echoIn.connect(echoHp).connect(dA).connect(lpA).connect(fbA).connect(dB).connect(lpB).connect(fbB).connect(dA);
  const echoOut = c.createGain();
  echoOut.gain.value = 0.2;
  const panA = makePanner(c, -0.55);
  const panB = makePanner(c, 0.55);
  lpA.connect(panA.node).connect(echoOut);
  lpB.connect(panB.node).connect(echoOut);
  echoOut.connect(sfx);

  // Reverb
  const reverbIn = c.createGain();
  const conv = c.createConvolver();
  conv.buffer = makeImpulse(c, 0.65);
  const revOut = c.createGain();
  revOut.gain.value = 0.18;
  reverbIn.connect(conv).connect(revOut).connect(sfx);

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
let removeGestureHooks = () => {};
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
  removeGestureHooks = () => events.forEach(e => globalThis.removeEventListener(e, kick));
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
  userVolume = clamp(Number.isFinite(v) ? v : userVolume, 0, 1);
  applyMasterGain();
}

/** Quiet continuous rain on the effects bus; no musical beat or round cue. */
export function startRainSound(): (() => void) | undefined {
  const c = ensureCtx();
  if (!c || !graph) return;
  resumeIfNeeded();
  const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
  source.buffer = graph.white; source.loop = true;
  filter.type = 'bandpass'; filter.frequency.value = 1650; filter.Q.value = 0.45;
  gain.gain.setValueAtTime(0, c.currentTime); gain.gain.linearRampToValueAtTime(0.13, c.currentTime + 0.6);
  source.connect(filter).connect(gain).connect(graph.sfx); source.start();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    gain.gain.cancelScheduledValues(c.currentTime); gain.gain.setTargetAtTime(0, c.currentTime, 0.08);
    source.stop(c.currentTime + 0.4);
    source.onended = () => [source, filter, gain].forEach(safeDisconnect);
  };
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
  if (muted || !audioPreferences.effectsEnabled || audioPreferences.effectsVolume === 0) return null;
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
const volleyScale = (kind: string): number => Math.max(0.16, 1 / density(kind, 0.12));

function repeated(kind: string, seconds: number): boolean {
  return density(kind, seconds) > 1;
}

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

export function playGunshot(pan = 0): void {
  const v = voice(pan, { echo: 0.12, reverb: 0.04, life: 0.5, gain: volleyScale('shot') });
  if (!v) return;
  const r = rand(0.91, 1.09); // per-shot pitch so volleys don't sound cloned
  const bite = rand(0.85, 1.15); // per-shot crack brightness
  // Crack — the supersonic snap
  N(v, { dur: 0.045, gain: 0.28, attack: 0.002, filter: { type: 'highpass', freq: 1500 * r }, filter2: { type: 'bandpass', freq: 2300 * r * bite, q: 0.7 } });
  // Body — muzzle blast, lowpass closing fast
  N(v, { dur: 0.2, gain: 0.38, attack: 0.001, filter: { type: 'lowpass', freq: 1100 * r, freqEnd: 280, sweep: 0.12, q: 0.8 } });
  // Thump — chest punch
  T(v, { type: 'sine', freq: 150 * r, freqEnd: 42, glide: 0.09, dur: 0.17, gain: 0.38, attack: 0.004 });
  // Tail — rumble that feeds the canyon echo
  N(v, { at: 0.01, dur: 0.38, gain: 0.1, attack: 0.012, filter: { type: 'bandpass', freq: 650 * r, q: 0.6 } });
}

/** Wooden wheels, axle strain and distant iron announce the slow approach. */
export function playGatlingApproach(durationSec = 4): void {
  if (repeated('gatling-approach', 1)) return;
  const span = clamp(durationSec * 0.72, 1.5, 3.4);
  const v = voice(0, { echo: 0.035, reverb: 0.06, life: span + 0.4, gain: 0.72 });
  if (!v) return;
  duckMusic(0.78, span * 0.55, 0.55);
  N(v, { brown: true, dur: span, gain: 0.3, attack: 0.18, hold: span * 0.72, sustain: 0.58, filter: { type: 'lowpass', freq: 260, freqEnd: 150, sweep: span } });
  const knocks = Math.max(5, Math.round(span / 0.34));
  for (let i = 0; i < knocks; i++) {
    const at = 0.12 + i * (span - 0.3) / Math.max(1, knocks - 1);
    // Alternating wheel loads: felt as a restrained ground thump rather than
    // another musical beat. It grows as the cart gets closer.
    const near = 0.55 + i / Math.max(1, knocks - 1) * 0.45;
    T(v, { at, type: 'sine', freq: i % 2 ? 43 : 36, freqEnd: 27, glide: 0.13, dur: 0.24, gain: 0.16 * near, attack: 0.012 });
    N(v, { at, dur: 0.055, gain: i % 2 ? 0.1 : 0.15, attack: 0.004, filter: { type: 'bandpass', freq: i % 2 ? 620 : 430, q: 2.2 } });
    T(v, { at, type: 'triangle', freq: i % 2 ? 155 : 118, freqEnd: 82, dur: 0.15, gain: 0.09, attack: 0.006 });
  }
  for (const at of [span * 0.28, span * 0.68]) {
    T(v, { at, type: 'sawtooth', freq: 285, freqEnd: 126, glide: 0.36, dur: 0.48, gain: 0.025, attack: 0.05, filter: { type: 'bandpass', freq: 720, q: 2.4 } });
  }
}

/** Final axle groan as the cart becomes visible, kept shorter than the warning. */
export function playGatlingArrival(): void {
  if (repeated('gatling-arrival', 0.8)) return;
  const v = voice(0, { echo: 0.04, reverb: 0.04, life: 1.25, gain: 0.64 });
  if (!v) return;
  N(v, { brown: true, dur: 0.85, gain: 0.18, attack: 0.04, filter: { type: 'lowpass', freq: 190, freqEnd: 95, sweep: 0.7 } });
  for (let i = 0; i < 4; i++) {
    const at = 0.08 + i * 0.19;
    T(v, { at, type: 'sine', freq: i % 2 ? 48 : 39, freqEnd: 28, glide: 0.1, dur: 0.2, gain: 0.13, attack: 0.008 });
    N(v, { at, dur: 0.045, gain: 0.09, attack: 0.003, filter: { type: 'bandpass', freq: 390 + i * 70, q: 2.1 } });
  }
}

/** Heavy wheel impact and dry cloth/earth scrape when the cart catches a corpse. */
export function playGatlingCrush(): void {
  if (repeated('gatling-crush', 0.8)) return;
  const v = voice(0, { echo: 0.025, life: 0.85, gain: 0.62 });
  if (!v) return;
  T(v, { at: 0.34, type: 'sine', freq: 76, freqEnd: 31, glide: 0.13, dur: 0.28, gain: 0.28, attack: 0.004 });
  N(v, { at: 0.34, brown: true, dur: 0.34, gain: 0.24, attack: 0.003, filter: { type: 'lowpass', freq: 520, freqEnd: 170, sweep: 0.22 } });
  N(v, { at: 0.38, dur: 0.2, gain: 0.12, attack: 0.002, filter: { type: 'bandpass', freq: 980, q: 1.1 } });
}

/** Ratchet, crank and barrel whine immediately before the burst. */
export function playGatlingSpinUp(): void {
  if (repeated('gatling-spin', 0.5)) return;
  const v = voice(0, { echo: 0.025, life: 0.75, gain: 0.72 });
  if (!v) return;
  let at = 0;
  for (let i = 0; i < 9; i++) {
    N(v, { at, dur: 0.018, gain: 0.13 + i * 0.008, attack: 0.002, filter: { type: 'bandpass', freq: 1050 + i * 95, q: 2.6 } });
    T(v, { at, type: 'triangle', freq: 340 + i * 42, dur: 0.04, gain: 0.035, attack: 0.002 });
    at += 0.075 - i * 0.0045;
  }
  T(v, { type: 'sawtooth', freq: 62, freqEnd: 150, glide: 0.55, dur: 0.62, gain: 0.035, attack: 0.06, filter: { type: 'bandpass', freq: 430, q: 1.3 } });
}

/** A compact mechanical crack, intentionally shorter than the revolvers. */
export function playGatlingShot(pan = 0): void {
  const v = voice(pan, { echo: 0.035, reverb: 0.025, life: 0.25, gain: volleyScale('gatling') * 0.78 });
  if (!v) return;
  const r = rand(0.94, 1.06);
  N(v, { dur: 0.027, gain: 0.34, attack: 0.001, filter: { type: 'highpass', freq: 1800 * r }, filter2: { type: 'bandpass', freq: 2850 * r, q: 0.9 } });
  N(v, { dur: 0.11, gain: 0.36, attack: 0.001, filter: { type: 'lowpass', freq: 950 * r, freqEnd: 260, sweep: 0.075, q: 0.8 } });
  T(v, { type: 'sine', freq: 118 * r, freqEnd: 48, glide: 0.065, dur: 0.12, gain: 0.31, attack: 0.002 });
  T(v, { at: 0.018, type: 'triangle', freq: 610 * r, freqEnd: 330, glide: 0.05, dur: 0.08, gain: 0.07, attack: 0.001 });
}

export function playFleshHit(pan = 0): void {
  const v = voice(pan, { life: 0.3, gain: volleyScale('impact') }); if (!v) return;
  N(v, { dur: 0.1, gain: 0.24, attack: 0.004, filter: { type: 'lowpass', freq: 650 } });
  T(v, { freq: 110, freqEnd: 55, dur: 0.15, gain: 0.28, attack: 0.005 });
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
  for (let i = 0; i < 4; i++) {
    at += rand(0.006, 0.022);
    N(v, { at, dur: rand(0.01, 0.028), gain: 0.10 * (1 - i / 7), filter: { type: 'highpass', freq: 2500 }, filter2: { type: 'bandpass', freq: rand(1500, 2600), q: 1 } });
  }
}

export function playSpark(pan = 0): void {
  const v = voice(pan, { life: 0.3, gain: volleyScale('impact') }); if (!v) return;
  // A short, damped metal tap rather than a sustained high clang.
  T(v, { freq: 740, dur: 0.16, gain: 0.12, attack: 0.003 });
  T(v, { freq: 1190, dur: 0.09, gain: 0.045, attack: 0.003 });
  N(v, { dur: 0.024, gain: 0.1, attack: 0.003, filter: { type: 'bandpass', freq: 1700, q: 0.7 } });
}

export function playMiss(pan = 0): void {
  // Ricochet: "pyeeeww" — fast sliding whine with a tumbling wobble that
  // drifts outward and darkens into the distance.
  const v = voice(pan, { echo: 0.08, life: 0.6, gain: volleyScale('ricochet') });
  if (!v) return;
  N(v, { dur: 0.07, gain: 0.16, filter: { type: 'bandpass', freq: 900, q: 0.8 } }); // dirt puff
  const start = rand(1000, 1400);
  const len = rand(0.22, 0.32);
  T(v, {
    at: 0.02, type: 'triangle', freq: start, freqEnd: start * rand(0.32, 0.45), dur: len, gain: 0.06, attack: 0.008,
    filter: { type: 'lowpass', freq: 6500, freqEnd: 1400 },
    vibrato: { rate: rand(20, 32), cents: 12, ramp: 0.05 },
  });
  if (v.pan) {
    const dir = pan === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(pan);
    v.pan.setValueAtTime(clamp(pan, -1, 1), v.t);
    v.pan.linearRampToValueAtTime(clamp(pan + dir * 0.6, -1, 1), v.t + len);
  }
}

// Convenience helper for per-bullet sound given the Bullet.hit type
export function playBulletImpact(hit: 'player' | 'barrel' | 'bullet' | 'woman' | 'miss', pan = 0): void {
  switch (hit) {
    case 'player': playFleshHit(pan); break;
    case 'woman': playFleshHit(pan); break;
    case 'barrel': playWoodHit(pan); break;
    case 'bullet': playSpark(pan); break;
    case 'miss': playMiss(pan); break;
  }
}

export function playFinalShot(): void {
  // A lower, rounded match-ending shot with a restrained room tail.
  const v = voice(0, { echo: 0.12, reverb: 0.1, life: 2.8, gain: 0.5 });
  if (!v) return;
  duckMusic(0.5, 0.8, 0.8);
  N(v, { dur: 0.18, gain: 0.5, attack: 0.001, rate: 0.5, filter: { type: 'highpass', freq: 600 }, filter2: { type: 'bandpass', freq: 1400, q: 0.6 } });
  N(v, { dur: 1.4, gain: 0.6, attack: 0.002, rate: 0.4, filter: { type: 'lowpass', freq: 700, freqEnd: 120, sweep: 1.1 } });
  T(v, { type: 'sine', freq: 90, freqEnd: 24, glide: 0.9, dur: 1.3, gain: 0.75, attack: 0.002 });
  T(v, { type: 'triangle', freq: 55, freqEnd: 35, dur: 1.8, gain: 0.22, attack: 0.01, filter: { type: 'lowpass', freq: 300 } });
  N(v, { brown: true, dur: 2.5, gain: 0.8, attack: 0.05, rate: 0.6, filter: { type: 'lowpass', freq: 160 } });
}

// ---- Movement & handling ------------------------------------------------

export function playSpurs(pan = 0): void {
  const v = voice(pan, { life: 0.25, gain: volleyScale('spurs') }); if (!v) return;
  N(v, { dur: 0.06, gain: 0.09, attack: 0.005, filter: { type: 'bandpass', freq: 750, q: 0.6 } });
  T(v, { at: 0.025, freq: 1250, dur: 0.075, gain: 0.026, attack: 0.003 });
  T(v, { at: 0.10, freq: 970, dur: 0.07, gain: 0.018, attack: 0.003 });
}

export function playReloadSpin(pan = 0): void {
  const v = voice(pan, { life: 0.7 });
  if (!v) return;
  let at = 0;
  for (let i = 0; i < 4; i++) {
    N(v, { at, dur: 0.012, gain: 0.2, filter: { type: 'bandpass', freq: rand(1300, 1800), q: 1 } });
    T(v, { at, type: 'triangle', freq: 1000, freqEnd: 800, dur: 0.02, gain: 0.06, attack: 0.001 });
    T(v, { at, type: 'sine', freq: 900, dur: 0.015, gain: 0.05, attack: 0.001 });
    at += 0.048 + rand(-0.005, 0.005);
  }
  // Cylinder snaps home
  at += 0.04;
  N(v, { at, dur: 0.05, gain: 0.38, filter: { type: 'bandpass', freq: 1800, q: 1.5 } });
  T(v, { at, type: 'triangle', freq: 420, freqEnd: 200, dur: 0.08, gain: 0.26, attack: 0.001 });
  T(v, { at, type: 'sine', freq: 180, freqEnd: 110, dur: 0.1, gain: 0.22, attack: 0.001 });
  T(v, { at, type: 'sine', freq: 1300, dur: 0.09, gain: 0.02, attack: 0.001 });
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
  const v = voice(pan, { life: 0.4, gain: volleyScale('death') }); if (!v) return;
  T(v, { freq: 95, freqEnd: 42, dur: 0.25, gain: 0.3, attack: 0.008 });
  N(v, { at: 0.025, brown: true, dur: 0.2, gain: 0.25, attack: 0.01, filter: { type: 'lowpass', freq: 380 } });
}

export function playKillSting(): void {
  if (repeated('kill-sting', 1.2)) return;
  const v = voice(0, { life: 1.4 }); if (!v) return;
  duckMusic(0.7, 0.2, 0.5);
  P(v, 45, 0, 0.25, 'nylon'); P(v, 52, 0.04, 0.16, 'nylon');
}

export function playCountdownTick(urgency: number): void {
  if (repeated('countdown', 0.35)) return;
  const u = clamp(Number.isFinite(urgency) ? urgency : 0, 0, 1);
  const v = voice(0, { life: 0.16 }); if (!v) return;
  T(v, { type: 'sine', freq: 460 + 60 * u, dur: 0.065, gain: 0.075 + 0.025 * u, attack: 0.004 });
  N(v, { dur: 0.016, gain: 0.035, attack: 0.003, filter: { type: 'bandpass', freq: 900, q: 0.6 } });
}

export function playReveal(): void {
  if (repeated('reveal', 0.3)) return;
  const v = voice(0, { life: 0.3 }); if (!v) return;
  N(v, { brown: true, dur: 0.22, gain: 0.22, attack: 0.045, filter: { type: 'bandpass', freq: 750, q: 0.6 } });
}

export function playTickResolve(): void { playReveal(); }

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
  T(v, { type: 'triangle', freq: 600, freqEnd: 480, dur: 0.04, gain: 0.05, attack: 0.001 });
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
  if (repeated('ending', 1)) return;
  const v = voice(0, { life: 2.5 }); if (!v) return;
  duckMusic(0.65, 1, 0.6);
  [48, 55, 60, 64].forEach((note, i) => P(v, note, i * 0.12, 0.27));
  P(v, 67, 0.65, 0.24);
}

export function playDefeat(): void {
  if (repeated('ending', 1)) return;
  const v = voice(0, { life: 2.5 }); if (!v) return;
  duckMusic(0.65, 1, 0.6);
  [57, 53, 52].forEach((note, i) => P(v, note, i * 0.3, 0.24));
  P(v, 45, 0.7, 0.3, 'bass');
}

export function startAmbient(): void {
  if (music) return;
  if (musicStatus === 'error') return; // Retry explicitly, not on every round.
  const c = ensureCtx();
  if (!c || !graph) return;
  resumeIfNeeded();
  // Reset any duck left over from an ending stinger
  graph.duck.gain.cancelScheduledValues(c.currentTime);
  graph.duck.gain.setValueAtTime(1, c.currentTime);
  try {
    const current = startRecordedMusic({
      ctx: c,
      dest: graph.music,
      durationSec: musicRoundDuration,
      onStatus: setMusicStatus,
    });
    music = current;
    void current.ready.catch(error => {
      if (music === current) music = null;
      console.warn(`Could not load ${WESTERN_TRACK.title}`, error);
    });
  } catch {
    music = null; setMusicStatus('error');
  }
}

export function stopAmbient(): void {
  music?.stop();
  music = null;
  setMusicStatus('idle');
}

/** Retry the actual recording, never fall back to the previous synth track. */
export function retryMusic(): void {
  if (musicStatus !== 'error') return;
  setMusicStatus('idle');
  startAmbient();
}

/** Retain the round API without restarting or changing the recording's tempo. */
export function syncMusicRound(durationMs: number): void {
  musicRoundDuration = clamp(Number.isFinite(durationMs) ? durationMs / 1000 : 4, 1, 10);
  music?.syncRound(musicRoundDuration);
}

// Let soundtrack updates propagate to React so its playback effect restarts
// with the new module. Dispose old audio and gesture hooks before the refresh.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    removeGestureHooks();
    stopAmbient();
    void ctx?.close().catch(() => undefined);
  });
}
