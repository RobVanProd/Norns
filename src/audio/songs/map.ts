// MAP — "Branches of Yggdrasil". G Dorian, 80 bpm. A lighter variation of the title: the same
// progression a fourth higher, the Thread on low flute with a rocking lyre, a descending-sequence
// B section on lyre, and a lyre/flute duet (melody up the octave, flute counter-line) to close.

import type { SongDef } from '../notation';
import { G } from './util';

const melA =
  'G4:8 D5:8 E5:4. D5:8 C5:8 D5:8 | A4:4 Bb4:8 A4:8 G4:2 | Bb4:8 D5:8 F5:4. E5:8 D5:8 C5:8 | D5:4 C5:8 Bb4:8 A4:2 | ' +
  'G4:8 D5:8 E5:4. D5:8 C5:8 D5:8 | A4:4 Bb4:8 C5:8 D5:2 | F5:4 E5:8 D5:8 C5:4 D5:4 | Bb4:8 A4:8 G4:2.';

const melA2 =
  'G5:8 D6:8 E6:4. D6:8 C6:8 D6:8 | A5:4 Bb5:8 A5:8 G5:2 | Bb5:8 D6:8 F6:4. E6:8 D6:8 C6:8 | D6:4 C6:8 Bb5:8 A5:2 | ' +
  'G5:8 D6:8 E6:4. D6:8 C6:8 D6:8 | A5:4 Bb5:8 C6:8 D6:2 | F6:4 E6:8 D6:8 C6:4 D6:4 | Bb5:4 G5:4 A5:2';

export const map: SongDef = {
  bpm: 80,
  meter: 4,
  gain: 2.3,
  delayBeats: 0.75,
  delayFb: 0.25,
  tracks: {
    flute: { inst: 'flute', vol: 0.6, pan: 0.15, rev: 0.4, dly: 0.15, gate: 0.95 },
    lyre: { inst: 'lyre', chord: 'spread', lo: 'G3', vol: 0.5, pan: -0.25, rev: 0.3 },
    mel: { inst: 'lyre', vol: 0.55, pan: 0.05, rev: 0.35, dly: 0.15 },
    harp: { inst: 'harp', chord: 'spread', lo: 'G2', vol: 0.4, pan: -0.15, rev: 0.45 },
    pad: { inst: 'air', chord: 'close', lo: 'G3', vol: 0.32, rev: 0.5 },
    bass: { inst: 'pbass', chord: 'root', lo: 'G1', vol: 0.4, rev: 0.15 },
    drums: { drums: true, vol: 0.4, rev: 0.25 },
  },
  sections: {
    intro: {
      bars: 2,
      chords: 'Gm:1 | C:1',
      lyre: 'p 0:8 2 1 2 3 2 1 2',
      pad: 'pp x:1',
    },
    A: {
      bars: 8,
      chords: 'Gm:2 C:2 | F:2 Gm:2 | Bb:2 F/A:2 | C:2 Dm:2 | Gm:2 C:2 | F:2 Dm:2 | Bb:2 C:2 | Gm:1',
      flute: 'mp ' + melA,
      lyre: 'mp 0:8 2 1 2 3 2 1 2',
      bass: 'p 0:4 r:8 2:8 0:4 r:8 2:8',
      pad: 'pp x:1',
    },
    B: {
      bars: 8,
      chords: 'Bb:1 | F/A:1 | Gm:1 | C:1 | Bb:1 | F/A:1 | Eb:2 F:2 | Gm:1',
      mel: 'ff D6:4. C6:8 Bb5:4 F5:4 | A5:4. G5:8 F5:4 C5:4 | Bb5:4. A5:8 G5:4 D5:4 | E5:2 G5:2 | ' +
        'D6:4. C6:8 Bb5:4 F5:4 | A5:4. C6:8 F6:4 E6:4 | Eb6:4 D6:4 C6:4 A5:4 | G5:1',
      harp: 'mp 0:4 1 2 3',
      pad: 'pp x:1',
      bass: 'p 0:1',
      drums: { step: 8, fd: 'o.......' },
    },
    A2: {
      bars: 8,
      chords: 'Gm:2 C:2 | F:2 Gm:2 | Bb:2 F/A:2 | C:2 Dm:2 | Gm:2 C:2 | F:2 Dm:2 | Bb:2 C:2 | Eb:2 F:2',
      mel: 'f ' + melA2,
      flute: 'r:2 pp D5:4 E5:4 | F5:2 D5:2 | D5:2 C5:2 | E5:2 F5:2 | G5:2 E5:2 | F5:2 A5:2 | Bb5:4 A5:4 G5:4 E5:4 | Eb5:2 C5:2',
      lyre: 'mp 0:8 2 1 2 3 2 1 2',
      bass: 'p 0:4 r:8 2:8 0:4 r:8 2:8',
      pad: 'pp x:1',
      drums: { step: 8, sh: 'o.x.o.x.', fd: G(7, 'x.......') + 'x...o.o.' },
    },
  },
  form: ['intro', 'A', 'B', 'A2'],
  loop: 1,
};
