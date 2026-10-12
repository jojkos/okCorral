// The score has its own continuous musical clock. Rounds supply tempo only:
// neither a new round nor reconnecting restarts a phrase or adds an accent.
export interface MusicNote {
  instrument: 'banjo' | 'guitar' | 'whistle' | 'bass' | 'harmonica' | 'pad';
  midi: number;
  gain: number;
  duration: number;
  delay?: number;
}
const CHORDS = [
  { root: 45, notes: [52, 57, 60, 64], melody: [69, 64, 67] }, // Am
  { root: 43, notes: [50, 55, 59, 62], melody: [67, 62, 64] }, // G
  { root: 41, notes: [53, 57, 60, 65], melody: [65, 60, 64] }, // F
  { root: 40, notes: [52, 56, 59, 64], melody: [64, 59, 56] }, // E → Am
];
const PROGRESSION = [0, 0, 1, 1, 2, 2, 3, 3];
const PICKS = [[-1, -1, -1, 2, -1, -1, 1, -1], [-1, 1, -1, -1, -1, -1, 2, -1]];

/** Original spaghetti-western cue: descending minor harmony, low twang guitar
 * calls, answering reeds and a distant whistle. Space and sustain, not drums. */
export function musicNotes(step: number, eighth: number): MusicNote[] {
  const bar = Math.floor(step / 8), slot = step % 8;
  const chord = CHORDS[PROGRESSION[bar % PROGRESSION.length]];
  const notes: MusicNote[] = [];
  const pick = PICKS[bar % 2][slot];
  if (pick >= 0) notes.push({instrument: 'banjo', midi: chord.notes[pick], gain: 0.13 + 0.01 * Math.sin(step * 1.7), duration: 1.3});
  if (slot === 1) notes.push({instrument: 'guitar', midi: chord.root + 12, gain: 0.19, duration: eighth * 3.2});
  if (slot === 4 && bar % 2 === 0) notes.push({instrument: 'guitar', midi: chord.notes[0] + 12, gain: 0.13, duration: eighth * 2.6});
  if (slot === 7 && bar % 2 === 1) notes.push({instrument: 'guitar', midi: chord.root + 12, gain: 0.11, duration: eighth * 3.8});
  // Neither bass nor plucks mark the beginning of the musical bar.
  if (slot === 2) notes.push({instrument: 'bass', midi: chord.root, gain: 0.09, duration: 2});
  if (bar % 2 === 0 && slot === 0) {
    for (const midi of [chord.root, chord.notes[0]]) {
      notes.push({instrument: 'pad', midi, gain: 0.01, duration: eighth * 18});
    }
  }
  if (bar % 2 === 0 && slot === 5) notes.push({instrument: 'harmonica', midi: chord.melody[0], gain: 0.047, duration: eighth * 5.6});
  if (bar % 2 === 1 && slot === 3) notes.push({instrument: 'harmonica', midi: chord.melody[1], gain: 0.035, duration: eighth * 3.8});
  if (bar % 4 === 3 && slot === 7) notes.push({instrument: 'harmonica', midi: chord.melody[2], gain: 0.029, duration: eighth * 4.2});
  // A sparse, breathy answer every four musical bars; never a round signal.
  if (bar % 4 === 1 && slot === 5) notes.push({instrument: 'whistle', midi: chord.melody[0] + 12, gain: 0.014, duration: eighth * 2.7});
  if (bar % 4 === 1 && slot === 7) notes.push({instrument: 'whistle', midi: chord.melody[1] + 12, gain: 0.011, duration: eighth * 4.2});
  return notes;
}

export function musicStepDuration(roundDuration: number): number {
  const duration = Math.max(1, Math.min(10, Number.isFinite(roundDuration) ? roundDuration : 4));
  // Short rounds use fewer notes, instead of turning ambient music into a jig.
  return duration / (duration < 1.5 ? 2 : duration < 3 ? 4 : 8);
}

export function createMusicTransport(now: number, duration = 4) {
  let step = 0, nextTime = now + 0.12, eighth = musicStepDuration(duration);
  return {
    setRoundDuration(seconds: number) { eighth = musicStepDuration(seconds); },
    due(now: number, lookahead: number) {
      const events: {step: number; when: number; eighth: number}[] = [];
      // Skip missed notes after a suspended tab; never dump a catch-up burst.
      if (nextTime < now - 0.05) {
        const missed = Math.ceil((now + 0.03 - nextTime) / eighth);
        step += missed; nextTime += missed * eighth;
      }
      while (nextTime < now + lookahead) {
        events.push({step, when: nextTime, eighth});
        step++; nextTime += eighth;
      }
      return events;
    },
  };
}
