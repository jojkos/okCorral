/*
 * Procedural western sound design. Everything synthesized via Web Audio —
 * no audio assets needed. Organized around:
 *   - playX() — one-shot SFX tied to game events
 *   - startAmbient() / stopAmbient() — looping saloon drone + wind
 *   - setMuted() / setVolume() — global controls
 * AudioContext is created lazily and resumed on the first user gesture.
 */

type Ctor = typeof AudioContext;
const getCtor = (): Ctor | null => {
  const w = globalThis as typeof globalThis & { webkitAudioContext?: Ctor };
  return globalThis.AudioContext || w.webkitAudioContext || null;
};

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;
let userVolume = 0.7;

// Ambient bed
let ambientNodes: { stop: () => void } | null = null;

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  const C = getCtor();
  if (!C) return null;
  ctx = new C();
  masterGain = ctx.createGain();
  masterGain.gain.value = muted ? 0 : userVolume;
  masterGain.connect(ctx.destination);
  return ctx;
}

function now(): number {
  return ctx ? ctx.currentTime : 0;
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
  const kick = () => {
    ensureCtx();
    resumeIfNeeded();
  };
  const events = ['pointerdown', 'keydown', 'touchstart'];
  events.forEach((e) => globalThis.addEventListener(e, kick, { once: true, passive: true }));
}
hookFirstGesture();

export function setMuted(next: boolean): void {
  muted = next;
  if (masterGain) masterGain.gain.value = muted ? 0 : userVolume;
}
export function isMuted(): boolean { return muted; }
export function setVolume(v: number): void {
  userVolume = Math.max(0, Math.min(1, v));
  if (masterGain && !muted) masterGain.gain.value = userVolume;
}

// ---- Building blocks ----------------------------------------------------

function noiseBuffer(durationSec: number, color: 'white' | 'brown' = 'white'): AudioBuffer | null {
  const c = ensureCtx();
  if (!c) return null;
  const len = Math.floor(c.sampleRate * durationSec);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  if (color === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const wn = Math.random() * 2 - 1;
      last = (last + 0.02 * wn) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

function playBuffer(
  buf: AudioBuffer,
  opts: { gain?: number; rate?: number; filter?: { type: BiquadFilterType; freq: number; q?: number }; attack?: number; release?: number; when?: number } = {},
): void {
  const c = ensureCtx();
  if (!c || !masterGain) return;
  resumeIfNeeded();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = opts.rate ?? 1;
  const g = c.createGain();
  const t = (opts.when ?? now());
  const attack = opts.attack ?? 0.005;
  const release = opts.release ?? buf.duration;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(opts.gain ?? 0.5, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(attack + 0.01, release));
  if (opts.filter) {
    const f = c.createBiquadFilter();
    f.type = opts.filter.type;
    f.frequency.value = opts.filter.freq;
    if (opts.filter.q != null) f.Q.value = opts.filter.q;
    src.connect(f).connect(g).connect(masterGain);
  } else {
    src.connect(g).connect(masterGain);
  }
  src.start(t);
  src.stop(t + release + 0.1);
}

function tone(opts: {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  dur: number;
  gain?: number;
  attack?: number;
  release?: number;
  when?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number };
  detune?: number;
}): void {
  const c = ensureCtx();
  if (!c || !masterGain) return;
  resumeIfNeeded();
  const t = opts.when ?? now();
  const osc = c.createOscillator();
  osc.type = opts.type ?? 'sine';
  if (opts.detune) osc.detune.value = opts.detune;
  osc.frequency.setValueAtTime(opts.freq, t);
  if (opts.freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t + opts.dur);
  }
  const g = c.createGain();
  const attack = opts.attack ?? 0.005;
  const release = opts.release ?? opts.dur;
  const peak = opts.gain ?? 0.25;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0005, t + Math.max(attack + 0.02, release));
  let tail: AudioNode = g;
  let head: AudioNode = osc;
  if (opts.filter) {
    const f = c.createBiquadFilter();
    f.type = opts.filter.type;
    f.frequency.value = opts.filter.freq;
    if (opts.filter.q != null) f.Q.value = opts.filter.q;
    osc.connect(f);
    head = f;
  }
  head.connect(g);
  tail.connect(masterGain);
  osc.start(t);
  osc.stop(t + release + 0.1);
}

// ---- SFX ---------------------------------------------------------------

export function playGunshot(): void {
  const c = ensureCtx();
  if (!c) return;
  const buf = noiseBuffer(0.18);
  if (!buf) return;
  // Crack — bright bandpass noise
  playBuffer(buf, { gain: 0.55, filter: { type: 'bandpass', freq: 1800, q: 0.8 }, attack: 0.001, release: 0.12 });
  // Body — lower noise
  playBuffer(buf, { gain: 0.45, filter: { type: 'lowpass', freq: 600, q: 0.7 }, attack: 0.001, release: 0.18 });
  // Thud — low sine sweep
  tone({ type: 'sine', freq: 110, freqEnd: 28, dur: 0.15, gain: 0.45, attack: 0.002, release: 0.18 });
}

export function playFleshHit(): void {
  const c = ensureCtx();
  if (!c) return;
  const buf = noiseBuffer(0.15);
  if (!buf) return;
  playBuffer(buf, { gain: 0.35, filter: { type: 'lowpass', freq: 500, q: 1 }, attack: 0.001, release: 0.14 });
  tone({ type: 'sine', freq: 160, freqEnd: 55, dur: 0.14, gain: 0.5, attack: 0.001, release: 0.15 });
}

export function playWoodHit(): void {
  const c = ensureCtx();
  if (!c) return;
  const buf = noiseBuffer(0.12);
  if (!buf) return;
  // Crack sound with sharp attack, woody band
  playBuffer(buf, { gain: 0.4, filter: { type: 'bandpass', freq: 1400, q: 3 }, attack: 0.001, release: 0.08 });
  tone({ type: 'square', freq: 420, freqEnd: 180, dur: 0.08, gain: 0.25, attack: 0.001, release: 0.09, filter: { type: 'lowpass', freq: 2400 } });
  tone({ type: 'triangle', freq: 240, freqEnd: 120, dur: 0.12, gain: 0.25, attack: 0.001, release: 0.14 });
}

export function playSpark(): void {
  // Metallic clang when bullets collide mid-air
  const c = ensureCtx();
  if (!c) return;
  const t = now();
  // FM ping
  tone({ type: 'square', freq: 3200, freqEnd: 2400, dur: 0.22, gain: 0.22, attack: 0.001, release: 0.25, filter: { type: 'bandpass', freq: 2600, q: 8 }, when: t });
  tone({ type: 'triangle', freq: 1600, freqEnd: 900, dur: 0.18, gain: 0.18, attack: 0.002, release: 0.22, when: t + 0.01 });
  // short noise for transient
  const buf = noiseBuffer(0.08);
  if (buf) playBuffer(buf, { gain: 0.35, filter: { type: 'highpass', freq: 2000 }, attack: 0.001, release: 0.06, when: t });
}

export function playMiss(): void {
  // Quick whoosh for a bullet that misses entirely
  const buf = noiseBuffer(0.18);
  if (!buf) return;
  playBuffer(buf, { gain: 0.18, filter: { type: 'bandpass', freq: 1200, q: 1.5 }, attack: 0.01, release: 0.18 });
}

export function playDeath(): void {
  const c = ensureCtx();
  if (!c) return;
  const t = now();
  // Body-drop thud + descending whistle
  tone({ type: 'sine', freq: 90, freqEnd: 35, dur: 0.3, gain: 0.5, attack: 0.002, release: 0.35, when: t });
  tone({ type: 'sawtooth', freq: 420, freqEnd: 90, dur: 0.55, gain: 0.18, attack: 0.005, release: 0.6, filter: { type: 'lowpass', freq: 1200 }, when: t });
}

export function playVictory(): void {
  const c = ensureCtx();
  if (!c) return;
  const base = now() + 0.05;
  // C major arpeggio: C5 E5 G5 C6
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    tone({
      type: 'triangle',
      freq,
      dur: 0.4,
      gain: 0.3,
      attack: 0.01,
      release: 0.55,
      when: base + i * 0.12,
      filter: { type: 'lowpass', freq: 3500 },
    });
  });
  // Sustain root
  tone({ type: 'sine', freq: 130.81, dur: 1.2, gain: 0.2, attack: 0.02, release: 1.3, when: base });
}

export function playDefeat(): void {
  const base = now() + 0.05;
  const notes = [392, 370, 349.23, 329.63]; // descending
  notes.forEach((freq, i) => {
    tone({
      type: 'sawtooth',
      freq,
      dur: 0.35,
      gain: 0.18,
      attack: 0.005,
      release: 0.55,
      when: base + i * 0.18,
      filter: { type: 'lowpass', freq: 1400 },
    });
  });
  tone({ type: 'sine', freq: 65, dur: 1.6, gain: 0.25, attack: 0.03, release: 1.8, when: base });
}

export function playTickStart(): void {
  // "Planning" chime — harmonica-like two-note fifth
  const c = ensureCtx();
  if (!c) return;
  const t = now();
  tone({ type: 'triangle', freq: 523.25, dur: 0.18, gain: 0.22, attack: 0.008, release: 0.22, when: t, filter: { type: 'lowpass', freq: 3000 } });
  tone({ type: 'triangle', freq: 783.99, dur: 0.25, gain: 0.18, attack: 0.008, release: 0.3, when: t + 0.06, filter: { type: 'lowpass', freq: 3200 } });
  tone({ type: 'sine', freq: 261.63, dur: 0.35, gain: 0.15, attack: 0.02, release: 0.4, when: t });
}

export function playTickResolve(): void {
  // "Shootout!" low bell hit
  const c = ensureCtx();
  if (!c) return;
  const t = now();
  tone({ type: 'sine', freq: 180, freqEnd: 90, dur: 0.4, gain: 0.45, attack: 0.002, release: 0.55, when: t });
  tone({ type: 'triangle', freq: 360, freqEnd: 180, dur: 0.35, gain: 0.25, attack: 0.003, release: 0.5, when: t, filter: { type: 'lowpass', freq: 1800 } });
  // a little reverberant noise to give it space
  const buf = noiseBuffer(0.25);
  if (buf) playBuffer(buf, { gain: 0.15, filter: { type: 'bandpass', freq: 400, q: 0.6 }, attack: 0.005, release: 0.35, when: t });
}

export function playLockAction(): void {
  // Dry click
  tone({ type: 'square', freq: 1600, freqEnd: 900, dur: 0.04, gain: 0.15, attack: 0.001, release: 0.06, filter: { type: 'bandpass', freq: 1400, q: 2 } });
}

export function playDenied(): void {
  tone({ type: 'sawtooth', freq: 220, freqEnd: 140, dur: 0.18, gain: 0.18, attack: 0.002, release: 0.2, filter: { type: 'lowpass', freq: 900 } });
}

export function playJoin(): void {
  const t = now() + 0.02;
  tone({ type: 'triangle', freq: 392, dur: 0.15, gain: 0.2, attack: 0.004, release: 0.2, when: t });
  tone({ type: 'triangle', freq: 587.33, dur: 0.2, gain: 0.2, attack: 0.004, release: 0.25, when: t + 0.07 });
}

// ---- Ambient saloon drone ---------------------------------------------
// Layered: brown-noise wind (very low) + filtered drone + occasional piano plink

export function startAmbient(): void {
  if (ambientNodes) return;
  const c = ensureCtx();
  if (!c || !masterGain) return;
  resumeIfNeeded();

  const bus = c.createGain();
  bus.gain.value = 0.25;
  bus.connect(masterGain);

  // Wind: brown-noise loop, lowpassed, gently modulated
  const windBuf = noiseBuffer(5, 'brown');
  let windSrc: AudioBufferSourceNode | null = null;
  let windLfo: OscillatorNode | null = null;
  let windLfoGain: GainNode | null = null;
  let windGain: GainNode | null = null;
  if (windBuf) {
    windSrc = c.createBufferSource();
    windSrc.buffer = windBuf;
    windSrc.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 280;
    f.Q.value = 0.6;
    windGain = c.createGain();
    windGain.gain.value = 0.5;
    // LFO sweeping the lowpass slowly so the wind breathes
    windLfo = c.createOscillator();
    windLfo.frequency.value = 0.08;
    windLfoGain = c.createGain();
    windLfoGain.gain.value = 120;
    windLfo.connect(windLfoGain).connect(f.frequency);
    windSrc.connect(f).connect(windGain).connect(bus);
    windLfo.start();
    windSrc.start();
  }

  // Drone: two detuned sines a fifth apart, ultra-low
  const drone1 = c.createOscillator();
  drone1.type = 'sine';
  drone1.frequency.value = 55;
  const drone2 = c.createOscillator();
  drone2.type = 'sine';
  drone2.frequency.value = 82.5;
  const droneFilter = c.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 400;
  const droneGain = c.createGain();
  droneGain.gain.value = 0.12;
  drone1.connect(droneFilter);
  drone2.connect(droneFilter);
  droneFilter.connect(droneGain).connect(bus);
  drone1.start();
  drone2.start();

  // Occasional lonely piano plink
  const plinkTimer = setInterval(() => {
    if (!ctx || !ambientNodes) return;
    if (Math.random() > 0.35) return;
    const t = now() + Math.random() * 2;
    const notes = [261.63, 293.66, 329.63, 392, 440, 523.25];
    const freq = notes[Math.floor(Math.random() * notes.length)];
    tone({
      type: 'triangle',
      freq,
      dur: 1.4,
      gain: 0.08,
      attack: 0.005,
      release: 1.8,
      filter: { type: 'lowpass', freq: 2200 },
      when: t,
    });
    // quiet octave above for shimmer
    tone({
      type: 'sine',
      freq: freq * 2,
      dur: 0.9,
      gain: 0.03,
      attack: 0.01,
      release: 1.1,
      when: t,
    });
  }, 6000);

  // Fade in the bus
  const tStart = now();
  bus.gain.setValueAtTime(0, tStart);
  bus.gain.linearRampToValueAtTime(0.25, tStart + 1.5);

  ambientNodes = {
    stop: () => {
      const tEnd = now();
      bus.gain.cancelScheduledValues(tEnd);
      bus.gain.setValueAtTime(bus.gain.value, tEnd);
      bus.gain.linearRampToValueAtTime(0, tEnd + 0.6);
      clearInterval(plinkTimer);
      setTimeout(() => {
        try { windSrc?.stop(); } catch { /* already stopped */ }
        try { windLfo?.stop(); } catch { /* already stopped */ }
        try { drone1.stop(); } catch { /* already stopped */ }
        try { drone2.stop(); } catch { /* already stopped */ }
        windSrc?.disconnect();
        windGain?.disconnect();
        windLfoGain?.disconnect();
        drone1.disconnect();
        drone2.disconnect();
        droneFilter.disconnect();
        droneGain.disconnect();
        bus.disconnect();
      }, 700);
    },
  };
}

export function stopAmbient(): void {
  if (!ambientNodes) return;
  ambientNodes.stop();
  ambientNodes = null;
}

// Convenience helper for per-bullet sound given the Bullet.hit type
export function playBulletImpact(hit: 'player' | 'barrel' | 'bullet' | 'miss'): void {
  switch (hit) {
    case 'player': playFleshHit(); break;
    case 'barrel': playWoodHit(); break;
    case 'bullet': playSpark(); break;
    case 'miss': playMiss(); break;
  }
}
