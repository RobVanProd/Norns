// TITLE — "The Loom at the Roots". D Dorian, 70 bpm.
// The Thread leitmotif (1 5 6 5 4 | 2 3 1) is stated plainly by the flute over Dm–G | C–Dm
// (the Dorian i–IV colour: the B natural on the long note). B lifts into Bb/C (Aeolian
// mixture) with the strings singing the Thread in augmentation; C reprises A with the melody
// in the strings an octave down and a flute descant, cadencing Bb–C back into the loop.

import type { SongDef } from '../notation';
import { E, G, R } from './util';

export const title: SongDef = {
  bpm: 70,
  meter: 4,
  delayBeats: 0.75,
  delayFb: 0.28,
  gain: 2.25,
  tracks: {
    harp: { inst: 'harp', chord: 'spread', lo: 'D3', vol: 0.5, pan: -0.25, rev: 0.45, dly: 0.12 },
    choir: { inst: 'choir', chord: 'close', lo: 'A3', vol: 0.34, pan: 0.05, rev: 0.6 },
    flute: { inst: 'flute', vol: 0.52, pan: 0.18, rev: 0.4, dly: 0.18, gate: 0.96 },
    strings: { inst: 'strings', vol: 0.55, pan: 0.1, rev: 0.45, gate: 0.98 },
    bass: { inst: 'bass', chord: 'root', lo: 'G1', vol: 0.42, rev: 0.3, gate: 0.98 },
    bell: { inst: 'bell', vol: 0.3, pan: -0.1, rev: 0.6 },
    drums: { drums: true, vol: 0.32, rev: 0.3 },
  },
  sections: {
    intro: {
      bars: 4,
      chords: 'Dm:1 | G/D:1 | Dm:1 | C:2 Am:2',
      harp: 'p 0:8 1 2 3 4 3 2 1',
      bass: 'pp 0:1 | 0:1 | 0:1 | 0:2 0:2',
      bell: 'p D4:1 | r:1 | A3:1 | r:1',
      choir: `${R(2)} | pp x:1 | x:1`,
    },
    A: {
      bars: 8,
      chords: 'Dm:2 G:2 | C:2 Dm:2 | F:2 C/E:2 | G:2 Am:2 | Dm:2 G:2 | C:2 Am:2 | F:2 G:2 | Dm:1',
      flute: 'mp D5:8 A5:8 B5:2 A5:8 G5:8 | E5:4. F5:8 D5:2 | F5:8 A5:8 C6:2 B5:8 A5:8 | G5:4. A5:8 E5:2 | ' +
        'D5:8 A5:8 B5:2 A5:8 G5:8 | E5:4. F5:8 G5:4 A5:4 | C6:4. B5:8 A5:4 G5:4 | F5:8 E5:8 D5:2.',
      harp: 'mp 0:8 1 2 3 4 3 2 1',
      choir: 'p x:1',
      bass: 'p 0:2',
      strings: `${R(4)} | p A3:2 B3:2 | C4:1 | C4:2 B3:2 | A3:1`,
      bell: `p D4:1 | ${R(3)} | A3:1 | ${R(3)}`,
    },
    B: {
      bars: 8,
      chords: 'Bb:1 | C:1 | F:2 C/E:2 | Dm:1 | Bb:1 | C:1 | Gm:2 A:2 | Dm:2 C:2',
      strings: 'mf D5:4 A5:4 Bb5:2 | A5:4 G5:4 E5:2 | F5:4. G5:8 A5:4 C6:4 | D6:2. C6:8 A5:8 | ' +
        'Bb5:4. A5:8 F5:4 D5:4 | E5:4. F5:8 G5:4 C6:4 | Bb5:2 A5:4 C#6:4 | D6:2. r:4',
      flute: `${R(3)} | r:2 r:4 mp A5:8 C6:8 | D6:4. C6:8 A5:4 F5:4 | G5:4. A5:8 C6:4 E6:4 | D6:2 C#6:4 E6:4 | F6:2. r:4`,
      harp: 'mf 0:8 1 2 3 4 5 4 3',
      choir: 'p x:1',
      bass: 'mp 0:1',
      bell: `${R(4)} | mp D4:1 | ${R(3)}`,
      drums: { step: 8, fd: 'x...o...', sw: E(4, 8) + 'x' + '.'.repeat(31) },
    },
    C: {
      bars: 8,
      chords: 'Dm:2 G:2 | C:2 Dm:2 | F:2 C/E:2 | G:2 Am:2 | Dm:2 G:2 | C:2 Am:2 | F:2 G:2 | Bb:2 C:2',
      strings: 'mf D4:8 A4:8 B4:2 A4:8 G4:8 | E4:4. F4:8 D4:2 | F4:8 A4:8 C5:2 B4:8 A4:8 | G4:4. A4:8 E4:2 | ' +
        'D4:8 A4:8 B4:2 A4:8 G4:8 | E4:4. F4:8 G4:4 A4:4 | C5:4. B4:8 A4:4 G4:4 | F4:2 E4:2',
      flute: 'r:2 p A5:4 B5:4 | C6:2 A5:2 | A5:2 G5:2 | B5:2 C6:2 | D6:2 B5:2 | C6:2 E6:2 | F6:4 E6:4 D6:4 B5:4 | Bb5:2 G5:2',
      harp: 'mp 0:8 2 1 3 2 4 3 2',
      choir: `${R(4)} | pp x:1 | x:1 | x:1 | x:1`,
      bass: 'p 0:2',
      bell: `p D4:1 | ${R(7)}`,
      drums: { step: 8, fd: G(6, 'o...o...') + E(2, 8) },
    },
  },
  form: ['intro', 'A', 'B', 'C'],
  loop: 1,
};
