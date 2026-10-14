// FINALE — "The Thread Rises". D major, 88 bpm. The leitmotif in full glory.
// The Dorian F becomes F#: the Thread is finally major, harmonised with a rising bass
// (D–B–C#–D) and, unlike the title, its last phrase resolves *upward* to D6. B turns to the
// relative minor and the heart-tugging IV–iv (G–Gm), then pivots through B major to lift the
// whole theme a step to E major (A2, everyone in). C walks home to D via A (IV of E = V of D),
// echoing the G–Gm sigh, and hands back to A on an Asus4–A.

import type { SongDef } from '../notation';
import { transpose } from '../notation';
import { E, G } from './util';

const melA = 'D5:8 A5:8 B5:2 A5:8 G5:8 | E5:4. F#5:8 D5:2 | F#5:8 C#6:8 D6:2 C#6:8 B5:8 | G5:4. F#5:8 E5:2 | ' +
  'D5:8 A5:8 B5:2 A5:8 G5:8 | A5:4. B5:8 C#6:4 D6:4 | E6:4. D6:8 C#6:4 B5:4 | A5:8 B5:8 D6:2.';
const hornA = 'F#4:2 G4:2 | E4:2 F#4:2 | A4:2 F#4:2 | G4:2 E4:2 | F#4:2 D4:2 | E4:2 F#4:2 | G4:2 E4:2 | F#4:1';
const chordsA = 'D:2 G/B:2 | A/C#:2 D:2 | F#m:2 Bm:2 | G:2 A:2 | D:2 G/B:2 | A:2 D/F#:2 | Em:2 A:2 | D:1';

export const finale: SongDef = {
  bpm: 88,
  meter: 4,
  gain: 2.0,
  delayBeats: 0.75,
  delayFb: 0.25,
  tracks: {
    strings: { inst: 'strings', vol: 0.6, pan: 0.05, rev: 0.45, gate: 0.97 },
    flute: { inst: 'flute', vol: 0.5, pan: 0.2, rev: 0.45, dly: 0.12, gate: 0.96 },
    horn: { inst: 'horn', vol: 0.45, pan: -0.15, rev: 0.4, gate: 0.98 },
    choir: { inst: 'choir', chord: 'close', lo: 'A3', vol: 0.36, rev: 0.55 },
    harp: { inst: 'harp', chord: 'spread', lo: 'D3', vol: 0.42, pan: -0.3, rev: 0.45 },
    bass: { inst: 'bass', chord: 'root', lo: 'A1', vol: 0.48, rev: 0.25, gate: 0.97 },
    bell: { inst: 'bell', vol: 0.28, pan: 0.25, rev: 0.6 },
    drums: { drums: true, vol: 0.3, rev: 0.3 },
  },
  sections: {
    intro: {
      bars: 4,
      chords: 'D:1 | G/D:1 | D:1 | Asus4:2 A:2',
      harp: 'mp 0:16 1 2 3 4 5 6 7 6 5 4 3 2 1 2 3',
      choir: 'pp x:1 | p x:1 | mp x:1 | mf x:1',
      bell: 'mf D4:1 | r:1 | A4:1 | r:1',
      bass: 'p 0:1',
      horn: 'r:1 | r:1 | mp A3:1 | A3:2 C#4:2',
      drums: { step: 16, tk: E(3, 16) + 'x...x...x.x.xxxx' },
    },
    A: {
      bars: 8,
      chords: chordsA,
      strings: 'mf ' + melA,
      horn: 'mp ' + hornA,
      choir: 'mp x:1',
      harp: 'mp 0:8 1 2 3 4 3 2 1',
      bass: 'mf 0:2',
      bell: 'mf D5:1 | r:1 | r:1 | r:1 | D5:1 | r:1 | r:1 | r:1',
      drums: { step: 16, tk: 'X.......x.......', fd: '....o.......o...', cy: 'X' + '.'.repeat(127), sw: 'x' + '.'.repeat(127) },
    },
    B: {
      bars: 8,
      chords: 'Bm:2 G:2 | D:2 A:2 | Bm:2 G:2 | Em:2 A:2 | G:2 A:2 | F#m:2 Bm:2 | G:2 Gm:2 | A:2 B:2',
      strings: 'mf F#5:4. E5:8 D5:4 B4:4 | A4:4. B4:8 C#5:4 E5:4 | F#5:4. E5:8 D5:4 G5:4 | G5:4. F#5:8 E5:2 | ' +
        'B5:4. A5:8 G5:4 C#6:4 | C#6:4. B5:8 A5:4 D6:4 | D6:4. B5:8 Bb5:2 | A5:2 F#5:2',
      flute: 'r:1 | r:1 | r:1 | r:1 | mp D6:4. C#6:8 B5:4 E6:4 | E6:4. D6:8 C#6:4 F#6:4 | F#6:4. D6:8 D6:2 | C#6:2 D#6:2',
      horn: 'mp D4:2 D4:2 | D4:2 C#4:2 | D4:2 D4:2 | E4:2 C#4:2 | D4:2 E4:2 | C#4:2 D4:2 | D4:2 D4:2 | C#4:2 D#4:2',
      choir: 'mf x:1',
      harp: 'mf 0:8 1 2 3 4 5 4 3',
      bass: 'mf 0:2',
      drums: { step: 16, tk: G(7, 'X.......x.......') + 'x...x...x.x.xxxx', fd: G(7, 'x...o...x...o.o.') + '................' },
    },
    A2: {
      bars: 8,
      chords: 'E:2 A/C#:2 | B/D#:2 E:2 | G#m:2 C#m:2 | A:2 B:2 | E:2 A/C#:2 | B:2 E/G#:2 | F#m:2 B:2 | E:1',
      strings: 'f ' + transpose(melA, 2),
      flute: 'mf ' + transpose(melA, 2),
      horn: 'mf ' + transpose(hornA, 2),
      choir: 'f x:1',
      harp: 'f 0:8 1 2 3 4 5 4 3',
      bass: 'f 0:2',
      bell: 'f E5:1 | r:1 | r:1 | r:1 | E5:1 | r:1 | r:1 | r:1',
      drums: { step: 16, tk: 'X...x...X...x...', fd: 'x.o.x.o.x.o.x.o.', cy: 'X' + '.'.repeat(63) + 'X' + '.'.repeat(63), sw: 'x' + '.'.repeat(127) },
    },
    C: {
      bars: 8,
      chords: 'E:2 C#m:2 | A:2 F#m:2 | Bm:2 G:2 | Em:2 A:2 | D:2 Bm:2 | G:2 A:2 | G:2 Gm:2 | Asus4:2 A:2',
      flute: 'mf E5:8 B5:8 C#6:2 B5:8 G#5:8 | A5:4. B5:8 C#6:2 | D6:4. C#6:8 B5:2 | G5:4. F#5:8 E5:2 | ' +
        'F#5:8 A5:8 D6:2 C#6:8 B5:8 | B5:4. A5:8 A5:4 C#6:4 | D6:4. B5:8 Bb5:2 | A5:2 r:4 A4:4',
      strings: 'mp G#4:2 G#4:2 | A4:2 A4:2 | F#4:2 G4:2 | G4:2 E4:2 | F#4:2 F#4:2 | G4:2 E4:2 | D4:2 D4:2 | D4:2 C#4:2',
      choir: 'mp x:1',
      harp: 'mp 0:8 1 2 3 4 3 2 1',
      bass: 'mp 0:2',
      drums: { step: 16, fd: G(6, 'o.......o.......') + E(2, 16) },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'C'],
  loop: 1,
};
