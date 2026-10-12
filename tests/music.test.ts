import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMusicTransport, musicNotes, musicStepDuration } from '../src/musicScore';
import * as sound from '../src/sound';

test('new rounds never reset music, duplicate notes or add a musical downbeat', () => {
  const continuous = createMusicTransport(0), rounds = createMusicTransport(0);
  for (let tick=0; tick<2000; tick++) {
    const now = tick * 0.025;
    if (tick % 264 === 0) rounds.setRoundDuration(4); // planning + resolution
    assert.deepEqual(rounds.due(now, 0.15), continuous.due(now, 0.15));
  }
  assert.equal('playRoundStart' in sound, false);
  assert.equal('playTickStart' in sound, false);
});

test('ambient tempo follows round length, including short rounds without frantic picking', () => {
  for (const duration of [1, 2, 3, 4, 5, 8, 10]) {
    const eighth = musicStepDuration(duration);
    assert.ok(eighth >= 0.375 && eighth <= 1.25);
    assert.equal(duration / eighth, Math.round(duration / eighth));
  }
  const clock = createMusicTransport(0);
  assert.equal(clock.due(0, 0.15)[0].step, 0);
  clock.setRoundDuration(8);
  const changed = clock.due(0.5, 0.15);
  assert.deepEqual(changed.map(e => [e.step, e.when, e.eighth]), [[1, 0.62, 1]], 'already queued time is not restarted');
  const next = clock.due(1.5, 0.15);
  assert.deepEqual(next.map(e => [e.step, e.when]), [[2, 1.62]]);
});

test('background recovery skips stale notes instead of playing a loud catch-up burst', () => {
  const clock = createMusicTransport(0);
  clock.due(0, 0.15);
  const due = clock.due(90, 1.2);
  assert.ok(due.length <= 3);
  assert.ok(due.every(e => e.when >= 90 && e.step > 150));
});

test('western score keeps banjo and harmonica, adds twang and whistle, without percussion or bar-start plucks', () => {
  const heard = new Set<string>();
  for (let step=0; step<64; step++) {
    const notes = musicNotes(step, 0.5);
    for (const note of notes) {
      heard.add(note.instrument);
      assert.ok(note.duration > 0 && Number.isFinite(note.duration));
      assert.ok(note.gain > 0 && note.gain < 0.21);
      if (note.instrument === 'harmonica') assert.ok(note.midi >= 56 && note.midi <= 69);
    }
    if (step % 8 === 0) assert.ok(notes.every(n => n.instrument === 'pad'), 'only a slow fade can begin a bar');
  }
  assert.deepEqual([...heard].sort(), ['banjo', 'bass', 'guitar', 'harmonica', 'pad', 'whistle']);
  assert.ok(musicNotes(5, 0.5).some(n => n.instrument === 'harmonica' && n.duration > 1.5), 'reed tails bridge musical bars');
});

test('western arrangement descends Am–G–F–E and leaves air between melodic phrases', () => {
  const roots = [0, 2, 4, 6].map(bar => musicNotes(bar * 8 + 2, 0.5).find(n => n.instrument === 'bass')!.midi);
  assert.deepEqual(roots, [45, 43, 41, 40]);
  const notes = Array.from({length: 64}, (_, step) => musicNotes(step, 0.5)).flat();
  assert.equal(notes.filter(n => n.instrument === 'whistle').length, 4);
  assert.equal(notes.filter(n => n.instrument === 'banjo').length, 16);
  assert.ok(notes.some(n => n.instrument === 'harmonica' && n.midi === 56), 'G-sharp resolves the dominant back to A minor');
});

test('gameplay sound effects remain available independently of the score', () => {
  for (const name of ['playGunshot', 'playBulletImpact', 'playReloadSpin', 'playCoverThud', 'playGatlingApproach', 'playGatlingShot', 'playLockAction', 'playTickResolve'] as const) {
    assert.equal(typeof sound[name], 'function');
  }
});
