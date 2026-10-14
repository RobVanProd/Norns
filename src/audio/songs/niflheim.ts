// NIFLHEIM — "Rime and Silence". E Aeolian, 84 bpm, 3/4. Cold, crystalline, sparse.
// The Thread on celesta becomes Aeolian (the 6th is a dark C) and its falling half bends through
// a Lydian F# over Cmaj7. B is the aurora: high strings over C–G/B–Am–Em with celesta echoes,
// turning on B major. C freezes the Thread into one note per bar over a slow bowed drone.

import type { SongDef } from '../notation';
import { E, G, R } from './util';

const melA = 'E5:8 B5:8 C6:2 | B5:8 A5:8 F#5:4. G5:8 | E5:2. | r:4 G5:8 F#5:8 E5:8 D5:8 | ' +
  'E5:8 B5:8 C6:2 | B5:8 A5:8 G5:4. B5:8 | A5:4. F#5:8 D5:4 | F#5:2.';
const chordsA = 'Em:2. | Cmaj7:2. | Am:2. | Em:2. | Em:2. | Cmaj7:2. | D:2. | Bm:2.';
const harpArp = 'p 0:8 1 2 3 2 1';
const ticks = 'X...o...o...';

export const niflheim: SongDef = {
  bpm: 84,
  meter: 3,
  gain: 2.5,
  delayBeats: 1.5,
  delayFb: 0.38,
  tracks: {
    celesta: { inst: 'celesta', vol: 0.6, pan: 0.12, rev: 0.55, dly: 0.25 },
    harp: { inst: 'harp', chord: 'spread', lo: 'E3', vol: 0.36, pan: -0.3, rev: 0.6, dly: 0.2 },
    air: { inst: 'air', chord: 'close', lo: 'E4', vol: 0.42, rev: 0.6 },
    bass: { inst: 'bass', chord: 'root', lo: 'E1', vol: 0.45, rev: 0.3, gate: 1 },
    strings: { inst: 'strings', vol: 0.42, pan: 0.05, rev: 0.6, gate: 0.98 },
    flute: { inst: 'flute', vol: 0.5, pan: -0.1, rev: 0.55, gate: 0.97 },
    choir: { inst: 'choir', chord: 'close', lo: 'G3', vol: 0.3, rev: 0.65 },
    bell: { inst: 'bell', vol: 0.3, rev: 0.7 },
    drums: { drums: true, vol: 0.45, rev: 0.45 },
  },
  sections: {
    intro: {
      bars: 4,
      chords: 'Em:2. | Em:2. | Cmaj7:2. | Bm:2.',
      air: 'pp x:2.',
      bell: `p E4:2. | r:2. | B3:2. | r:2.`,
      bass: 'pp 0:2.',
      harp: `${R(2, 3)} | ${harpArp} | 0:8 1 2 3 2 1`,
      drums: { step: 16, ic: E(2, 12) + G(2, ticks) },
    },
    A: {
      bars: 8,
      chords: chordsA,
      celesta: 'mp ' + melA,
      harp: harpArp,
      air: 'pp x:2.',
      bass: 'p 0:2.',
      drums: { step: 16, ic: ticks, ti: '......o.....' },
    },
    B: {
      bars: 8,
      chords: 'C:2. | G/B:2. | Am:2. | Em:2. | C:2. | D:2. | Bsus4:2. | B:2.',
      strings: 'mf E6:4. D6:8 C6:4 | B5:2 D6:4 | C6:4. B5:8 A5:4 | G5:2. | E5:4 G5:4 C6:4 | D6:4. E6:8 F#6:4 | E6:2. | D#6:2 F#5:4',
      celesta: 'r:2. | r:4 p B5:8 D6:8 G6:4 | r:2. | r:4 B5:8 E6:8 G6:4 | r:2. | r:4 A5:8 D6:8 F#6:4 | r:2. | r:4 B5:8 D#6:8 F#6:4',
      choir: 'pp x:2.',
      harp: harpArp,
      bass: 'p 0:2.',
      drums: { step: 16, fd: 'o...........', ic: ticks },
    },
    A2: {
      bars: 8,
      chords: chordsA,
      celesta: 'mp ' + melA,
      flute: 'pp B4:2. | G4:2. | A4:2 C5:4 | B4:2. | G4:2 B4:4 | E5:2. | D5:2 F#4:4 | F#4:2.',
      harp: harpArp,
      air: 'pp x:2.',
      bass: 'p 0:2.',
      drums: { step: 16, ic: ticks, ti: '......o...o.' },
    },
    C: {
      bars: 8,
      chords: 'Em:2. | Em:2. | Am:2. | Am:2. | D:2. | G:2. | C:2. | B:2.',
      celesta: 'mp E5:2. | B5:2. | C6:2. | B5:4 A5:2 | F#5:2. | G5:2. | E5:2. | D#5:2.',
      strings: 'pp B5:2. | B5:2. | C6:2. | C6:2. | A5:2. | B5:2. | G5:2. | F#5:2.',
      air: 'pp x:2.',
      bass: 'pp 0:2.',
      harp: `${R(4, 3)} | ${harpArp} | 0:8 1 2 3 2 1 | 0:8 1 2 3 2 1 | 0:8 1 2 3 2 1`,
      bell: `p E4:2. | ${R(7, 3)}`,
      drums: { step: 16, ic: G(4, 'o...........') + G(4, ticks), ti: E(4, 12) + G(4, '......o.....') },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'C'],
  loop: 1,
};
