export const WESTERN_TRACK = {
  title: 'Last Hand at High Noon',
  url: '/audio/last-hand-at-high-noon-4805ad80.mp3',
  bpm: 120,
} as const;

export type MusicPlaybackStatus = 'idle' | 'loading' | 'playing' | 'error';
export interface RecordedMusicHandle {
  stop: () => void;
  syncRound: (durationSec: number) => void;
  ready: Promise<void>;
}

/** The requested 120-BPM groove fits normal half-second round settings.
 * For custom lengths, allow only a tiny tempo correction, never a fast remix. */
export function recordedMusicRate(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 1;
  const eighth = 60 / WESTERN_TRACK.bpm / 2;
  const beats = Math.max(1, Math.round(durationSec / eighth));
  return Math.max(0.97, Math.min(1.03, beats * eighth / durationSec));
}

/** Build one continuous PCM loop. The native audio engine handles repetition,
 * so background-tab timer throttling cannot create gaps or duplicate players. */
export function makeMusicLoop(ctx: BaseAudioContext, input: AudioBuffer): AudioBuffer {
  const sr = input.sampleRate;
  // Trim actual silence, not the quiet parts of the arrangement. Keep a short
  // margin so the first harmonica/guitar transient is never clipped.
  let start = input.length, end = 0;
  for (let ch = 0; ch < input.numberOfChannels; ch++) {
    const channel = input.getChannelData(ch);
    let lo = 0, hi = channel.length - 1;
    while (lo < channel.length && Math.abs(channel[lo]) < 0.0003) lo++;
    while (hi > lo && Math.abs(channel[hi]) < 0.0003) hi--;
    start = Math.min(start, lo); end = Math.max(end, hi + 1);
  }
  if (end <= start) throw new Error('The music recording is silent.');
  start = Math.max(0, start - Math.round(sr * 0.04));
  end = Math.min(input.length, end + Math.round(sr * 0.04));
  const length = end - start;
  const overlap = Math.max(2, Math.min(Math.round(sr * 2), Math.floor(length / 4)));
  if (length < 8) throw new Error('The music recording is too short.');
  const loop = ctx.createBuffer(input.numberOfChannels, length - overlap, sr);
  let energy = 0, peak = 0;
  for (let ch = 0; ch < input.numberOfChannels; ch++) {
    const source = input.getChannelData(ch), out = loop.getChannelData(ch);
    for (let i = 0; i < out.length; i++) {
      if (i < overlap) {
        const phase = i / (overlap - 1) * Math.PI / 2;
        out[i] = source[end - overlap + i] * Math.cos(phase) + source[start + i] * Math.sin(phase);
      } else out[i] = source[start + i];
      if (!Number.isFinite(out[i])) throw new Error('Invalid music sample.');
      energy += out[i] * out[i]; peak = Math.max(peak, Math.abs(out[i]));
    }
  }
  const rms = Math.sqrt(energy / (loop.length * loop.numberOfChannels));
  // Leave ample headroom for volleys. The user's music slider and the existing
  // effects-driven ducking still control the final mix independently.
  const gain = Math.min(4, 0.16 / Math.max(rms, 0.0001), 0.7 / Math.max(peak, 0.0001));
  for (let ch = 0; ch < loop.numberOfChannels; ch++) {
    const out = loop.getChannelData(ch);
    for (let i = 0; i < out.length; i++) out[i] *= gain;
  }
  return loop;
}

const cache = new WeakMap<BaseAudioContext, Promise<AudioBuffer>>();
export function loadWesternMusic(ctx: BaseAudioContext): Promise<AudioBuffer> {
  const loaded = cache.get(ctx);
  if (loaded) return loaded;
  const task = (async () => {
    const response = await fetch(WESTERN_TRACK.url);
    if (!response.ok) throw new Error(`Music download failed (${response.status}).`);
    const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
    return makeMusicLoop(ctx, decoded);
  })();
  cache.set(ctx, task);
  // A failed load is retryable; never silently substitute the old synth score.
  void task.catch(() => { if (cache.get(ctx) === task) cache.delete(ctx); });
  return task;
}

export function startRecordedMusic(env: {
  ctx: AudioContext;
  dest: AudioNode;
  durationSec: number;
  onStatus?: (status: MusicPlaybackStatus) => void;
  load?: (ctx: BaseAudioContext) => Promise<AudioBuffer>;
}): RecordedMusicHandle {
  const c = env.ctx, bus = c.createGain();
  bus.gain.setValueAtTime(0, c.currentTime); bus.connect(env.dest);
  let stopped = false, source: AudioBufferSourceNode | null = null;
  let rate = recordedMusicRate(env.durationSec);
  const disconnect = () => { source?.disconnect(); bus.disconnect(); };
  env.onStatus?.('loading');
  const ready = Promise.resolve().then(() => (env.load ?? loadWesternMusic)(c)).then(buffer => {
    if (stopped) return;
    source = c.createBufferSource(); source.buffer = buffer; source.loop = true;
    source.playbackRate.value = rate;
    source.connect(bus); source.onended = disconnect;
    const when = c.currentTime + 0.035;
    // The loop starts in its crossfaded seam; skip that seam on the very first
    // play so the new recording's recognizable opening is heard immediately.
    source.start(when, Math.min(2, buffer.duration * 0.05));
    bus.gain.linearRampToValueAtTime(1, when + 1.4);
    env.onStatus?.('playing');
  }).catch(error => {
    if (stopped) return;
    disconnect(); env.onStatus?.('error');
    throw error;
  });
  return {
    ready,
    syncRound(durationSec) {
      const next = recordedMusicRate(durationSec);
      if (next === rate || stopped) return;
      rate = next;
      source?.playbackRate.setTargetAtTime(rate, c.currentTime, 2);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (source) {
        bus.gain.cancelAndHoldAtTime(c.currentTime);
        bus.gain.setTargetAtTime(0, c.currentTime, 0.1);
        source.stop(c.currentTime + 0.7);
      } else disconnect();
    },
  };
}
