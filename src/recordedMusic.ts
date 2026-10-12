const trackUrl = new URL('./assets/music/dusty-silence.mp3', import.meta.url).href;
const recordings = new WeakMap<AudioContext, Promise<AudioBuffer>>();

function loadRecording(ctx: AudioContext): Promise<AudioBuffer> {
  const cached = recordings.get(ctx);
  if (cached) return cached;
  const pending = fetch(trackUrl)
    .then(response => {
      if (!response.ok) throw new Error(`Music request failed: ${response.status}`);
      return response.arrayBuffer();
    })
    .then(data => ctx.decodeAudioData(data));
  recordings.set(ctx, pending);
  pending.catch(() => recordings.delete(ctx));
  return pending;
}

export interface MusicHandle { stop: () => void }
interface MusicEnv {
  ctx: AudioContext;
  dest: AudioNode;
  onError?: () => void;
}

/** Load once, loop at the original tempo, and use the existing game's audio mixer. */
export function startMusic({ ctx, dest, onError }: MusicEnv): MusicHandle {
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0, ctx.currentTime);
  bus.connect(dest);
  let source: AudioBufferSourceNode | null = null;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    source?.stop(ctx.state === 'running' ? ctx.currentTime + 0.45 : 0);
    setTimeout(() => {
      source?.disconnect();
      bus.disconnect();
    }, 500);
  };

  // Playback stays on the gesture-unlocked AudioContext, including on mobile.
  void loadRecording(ctx).then(buffer => {
    if (stopped || ctx.state === 'closed') return;
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(bus);
    const now = ctx.currentTime;
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(1, now + 0.8);
    source.start(now);
  }).catch(error => {
    if (stopped) return;
    stop();
    console.warn('Unable to play Dusty Silence.', error);
    onError?.();
  });

  return { stop };
}
