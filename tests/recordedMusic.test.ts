import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { loadWesternMusic, makeMusicLoop, recordedMusicRate, startRecordedMusic, WESTERN_TRACK, type MusicPlaybackStatus } from '../src/recordedMusic';

function buffer(channels = 2, length = 1000, sampleRate = 100) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { length, sampleRate, numberOfChannels: channels, duration: length / sampleRate,
    getChannelData: (ch: number) => data[ch] } as AudioBuffer;
}
const bufferContext = { createBuffer: buffer } as unknown as BaseAudioContext;
function wave() {
  const result = buffer();
  for (let ch = 0; ch < result.numberOfChannels; ch++) {
    const data = result.getChannelData(ch);
    for (let i = 100; i < 900; i++) data[i] = Math.sin(i * 0.03 + ch) * 0.3;
  }
  return result;
}
function fakeContext() {
  const param = () => ({
    value: 1,
    events: [] as [string, ...number[]][],
    setValueAtTime(...values: number[]) { this.events.push(['set', ...values]); },
    setTargetAtTime(...values: number[]) { this.events.push(['target', ...values]); },
    linearRampToValueAtTime(...values: number[]) { this.events.push(['ramp', ...values]); },
    cancelAndHoldAtTime(...values: number[]) { this.events.push(['hold', ...values]); },
  });
  const node = () => ({ connect() {}, disconnects: 0, disconnect() { this.disconnects++; } });
  const bus = { ...node(), gain: param() };
  const sources: ReturnType<typeof makeSource>[] = [];
  function makeSource() {
    return { ...node(), buffer: null as AudioBuffer | null, loop: false, playbackRate: param(),
      onended: null as (() => void) | null, starts: [] as number[][], stops: [] as number[][],
      start(...times: number[]) { this.starts.push(times); },
      stop(...times: number[]) { this.stops.push(times); },
    };
  }
  const ctx = { currentTime: 10, state: 'running', createGain: () => bus, createBuffer: buffer,
    decodeAudioData: async () => wave(),
    createBufferSource() { const source = makeSource(); sources.push(source); return source; },
  } as unknown as AudioContext;
  return { ctx, bus, sources, dest: node() as unknown as AudioNode };
}

test('the selected soundtrack is a bundled, real MP3, not the old ambient score', () => {
  assert.equal(WESTERN_TRACK.title, 'Dusty Silence');
  const asset = new URL(WESTERN_TRACK.url);
  assert.ok(asset.pathname.endsWith('/src/assets/music/dusty-silence.mp3'));
  assert.ok(statSync(asset).size > 1_000_000);
  const bytes = readFileSync(asset);
  assert.ok(bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
});

test('all round settings keep Dusty Silence at its original tempo and pitch', () => {
  for (let seconds = 1; seconds <= 10; seconds += 0.5) assert.equal(recordedMusicRate(seconds), 1);
  for (const seconds of [0, -1, NaN, Infinity]) assert.equal(recordedMusicRate(seconds), 1);
  for (const seconds of [1.1, 2.42, 3.99, 9.81]) {
    assert.equal(recordedMusicRate(seconds), 1);
  }
});

test('the loop trims silence, crossfades the boundary and leaves effects headroom', () => {
  const input = wave(), original = input.getChannelData(0).slice();
  const result = makeMusicLoop(bufferContext, input);
  assert.equal(result.numberOfChannels, input.numberOfChannels);
  assert.ok(result.duration > 5 && result.duration < input.duration);
  let energy = 0, peak = 0;
  for (let ch = 0; ch < result.numberOfChannels; ch++) {
    const data = result.getChannelData(ch);
    for (const value of data) { assert.ok(Number.isFinite(value)); energy += value * value; peak = Math.max(peak, Math.abs(value)); }
    assert.ok(Math.abs(data[0] - data[data.length - 1]) < 0.02, 'loop seam follows adjacent original samples');
  }
  assert.ok(peak <= 0.700001);
  assert.ok(Math.sqrt(energy / (result.length * result.numberOfChannels)) <= 0.160001);
  assert.deepEqual(input.getChannelData(0), original, 'never alters the source recording');
});

test('silent, malformed and tiny recordings fail explicitly', () => {
  assert.throws(() => makeMusicLoop(bufferContext, buffer()), /silent/);
  const malformed = wave(); malformed.getChannelData(0)[150] = NaN;
  assert.throws(() => makeMusicLoop(bufferContext, malformed), /Invalid/);
  const short = buffer(1, 7); short.getChannelData(0).fill(0.1);
  assert.throws(() => makeMusicLoop(bufferContext, short), /short/);
});

test('many rounds share one continuously looping source without restart accents', async () => {
  const { ctx, dest, bus, sources } = fakeContext();
  const statuses: MusicPlaybackStatus[] = [];
  const handle = startRecordedMusic({ ctx, dest, durationSec: 4, load: async () => wave(), onStatus: s => statuses.push(s) });
  await handle.ready;
  for (let round = 0; round < 150; round++) handle.syncRound(round % 2 ? 4 : 8);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].starts.length, 1);
  assert.equal(sources[0].loop, true);
  assert.equal(sources[0].playbackRate.value, 1);
  assert.equal(sources[0].playbackRate.events.length, 0);
  assert.deepEqual(statuses, ['loading', 'playing']);
  handle.syncRound(3.9);
  assert.equal(sources[0].playbackRate.events.length, 0, 'custom rounds never change the recording tempo');
  handle.stop(); handle.stop();
  assert.equal(sources[0].stops.length, 1);
  assert.ok(bus.gain.events.some(e => e[0] === 'hold'), 'fade holds the current gain instead of jumping');
  sources[0].onended?.();
  assert.equal(bus.disconnects, 1);
});

test('leaving a game while downloading never starts late music', async () => {
  const { ctx, dest, bus, sources } = fakeContext();
  let finish!: (value: AudioBuffer) => void;
  const pending = new Promise<AudioBuffer>(resolve => { finish = resolve; });
  const statuses: MusicPlaybackStatus[] = [];
  const handle = startRecordedMusic({ ctx, dest, durationSec: 4, load: () => pending, onStatus: s => statuses.push(s) });
  handle.stop(); finish(wave()); await handle.ready;
  assert.equal(sources.length, 0);
  assert.equal(bus.disconnects, 1);
  assert.deepEqual(statuses, ['loading']);
});

test('rapid replay shares the Dusty Silence download and only starts the current game', async t => {
  let complete!: (response: Response) => void;
  const request = t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { complete = resolve; }));
  const { ctx, dest, sources } = fakeContext();
  const previous = startRecordedMusic({ ctx, dest, durationSec: 4 });
  previous.stop();
  const current = startRecordedMusic({ ctx, dest, durationSec: 3.9 });
  await Promise.resolve();
  complete({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response);
  await Promise.all([previous.ready, current.ready]);
  assert.equal(request.mock.callCount(), 1);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].loop, true);
  assert.equal(sources[0].starts.length, 1);
  assert.equal(sources[0].playbackRate.value, 1);
  current.stop(); current.stop();
  assert.equal(sources[0].stops.length, 1);
});

test('a closed audio context never starts a late recording', async () => {
  const { ctx, dest, sources } = fakeContext();
  Object.defineProperty(ctx, 'state', { value: 'closed' });
  const handle = startRecordedMusic({ ctx, dest, durationSec: 4, load: async () => wave() });
  await handle.ready;
  assert.equal(sources.length, 0);
  handle.stop();
});

test('a failed or synchronously throwing loader reports an error, never a synth fallback', async () => {
  for (const load of [async () => { throw new Error('offline'); }, () => { throw new Error('offline'); }]) {
    const { ctx, dest, bus, sources } = fakeContext();
    const statuses: MusicPlaybackStatus[] = [];
    const handle = startRecordedMusic({ ctx, dest, durationSec: 4, load, onStatus: s => statuses.push(s) });
    await assert.rejects(handle.ready, /offline/);
    assert.deepEqual(statuses, ['loading', 'error']);
    assert.equal(sources.length, 0);
    assert.equal(bus.disconnects, 1);
  }
});

test('decoded music is shared by games in one context; a failed fetch can be retried', async () => {
  const original = globalThis.fetch;
  let requests = 0, fail = true;
  const ctx = { createBuffer: buffer, decodeAudioData: async () => wave() } as unknown as BaseAudioContext;
  globalThis.fetch = (async (url: string) => {
    assert.equal(url, WESTERN_TRACK.url); requests++;
    return { ok: !fail, status: fail ? 503 : 200, arrayBuffer: async () => new ArrayBuffer(1) };
  }) as typeof fetch;
  try {
    await assert.rejects(loadWesternMusic(ctx), /503/);
    fail = false;
    const a = loadWesternMusic(ctx), b = loadWesternMusic(ctx);
    assert.equal(a, b);
    assert.equal(await a, await b);
    assert.equal(requests, 2);
  } finally { globalThis.fetch = original; }
});
