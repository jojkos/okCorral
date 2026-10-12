import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startMusic } from '../src/recordedMusic';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function audioContext() {
  const sources: Array<{ loop: boolean; buffer: unknown; started: boolean; stopped: boolean }> = [];
  const recording = { duration: 153.312 };
  const ctx = {
    currentTime: 5,
    state: 'running',
    createGain: () => ({
      gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} },
      connect() {}, disconnect() {},
    }),
    decodeAudioData: async () => recording,
    createBufferSource: () => {
      const source = {
        loop: false, buffer: null as unknown, started: false, stopped: false,
        connect() {}, disconnect() {},
        start() { this.started = true; }, stop() { this.stopped = true; },
      };
      sources.push(source);
      return source;
    },
  } as unknown as AudioContext;
  return { ctx, sources, recording, dest: {} as AudioNode };
}
const response = () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }) as Response;

test('leaving gameplay before music finishes loading never starts late playback', async t => {
  let complete!: (response: Response) => void;
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { complete = resolve; }));
  const audio = audioContext();
  const handle = startMusic(audio);
  handle.stop();
  complete(response());
  await flush();
  assert.equal(audio.sources.length, 0);
});

test('rapid replay shares the recording load and only starts the active loop', async t => {
  let complete!: (response: Response) => void;
  const fetch = t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { complete = resolve; }));
  const audio = audioContext();
  const old = startMusic(audio);
  old.stop();
  const current = startMusic(audio);
  complete(response());
  await flush();
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(audio.sources.length, 1);
  assert.equal(audio.sources[0].buffer, audio.recording);
  assert.equal(audio.sources[0].loop, true);
  assert.equal(audio.sources[0].started, true);
  current.stop();
  current.stop();
  assert.equal(audio.sources[0].stopped, true);
});

test('failed downloads can retry on the next game instead of caching failure', async t => {
  let attempts = 0, failures = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    if (++attempts === 1) return { ok: false, status: 503 } as Response;
    return response();
  });
  t.mock.method(console, 'warn', () => {});
  const audio = audioContext();
  startMusic({ ...audio, onError: () => failures++ });
  await flush();
  assert.equal(failures, 1);
  const retry = startMusic(audio);
  await flush();
  assert.equal(attempts, 2);
  assert.equal(audio.sources.length, 1);
  retry.stop();
});
