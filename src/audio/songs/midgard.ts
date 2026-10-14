// MIDGARD — "Hearthfields". D Dorian, 112 bpm, light swing. Warm, bouncy folk.
// A: the Thread in diminution as a catchy one-bar cell (8 8 4 8 8 8 8), answered and then
// sequenced a third higher. B: tagelharpa sings a descending sequence over F–C–Dm–Am with flute
// fills in the gaps (call and response), turning on A major. A2: tune returns with a stepwise
// tagelharpa counter-line. C: a G-Mixolydian dance break of flute figuration over lyre chops.

import type { SongDef } from '../notation';
import { E, G, R } from './util';

const tune =
  'D5:8 A5:8 B5:4 A5:8 G5:8 E5:8 G5:8 | D5:4 B4:8 G4:8 A4:2 | D5:8 A5:8 B5:4 A5:8 G5:8 E5:8 C5:8 | F5:8 E5:8 F5:8 G5:8 A5:4 B5:4 | ' +
  'F5:8 C6:8 D6:4 C6:8 B5:8 A5:8 G5:8 | D5:8 E5:8 G5:8 B5:8 A5:2 | Bb5:8 A5:8 G5:8 F5:8 E5:8 F5:8 G5:8 E5:8 | D5:2 r:2';

const chordsA = 'Dm:2 C:2 | G:2 Dm:2 | Dm:2 C:2 | F:2 G:2 | Dm:2 C:2 | G:2 Dm:2 | Bb:2 C:2 | Dm:1';
const lyreBounce = 'mp 0:8 3 2 3 1 3 2 3';
const bassBounce = 'mf 0:4. 2:8 0:4. 2:8';
const groove = { fd: 'X.....x.x.....o.', ft: '....x..o....x.o.', sh: 'o.x.o.x.o.x.o.x.' };

export const midgard: SongDef = {
  bpm: 112,
  meter: 4,
  gain: 2.0,
  swing: 0.1,
  delayBeats: 0.75,
  delayFb: 0.22,
  tracks: {
    flute: { inst: 'flute', vol: 0.58, pan: 0.12, rev: 0.3, dly: 0.14 },
    lyre: { inst: 'lyre', chord: 'spread', lo: 'D3', vol: 0.45, pan: -0.28, rev: 0.25 },
    tagel: { inst: 'tagel', vol: 0.5, pan: 0.28, rev: 0.3, gate: 0.97 },
    bass: { inst: 'pbass', chord: 'root', lo: 'A1', vol: 0.5, rev: 0.1 },
    pad: { inst: 'strings', chord: 'close', lo: 'A3', vol: 0.22, rev: 0.45 },
    drums: { drums: true, vol: 0.42, rev: 0.15 },
  },
  sections: {
    intro: {
      bars: 4,
      chords: 'Dm:2 C:2 | Dm:2 C:2 | Dm:2 C:2 | G:2 A:2',
      lyre: lyreBounce,
      bass: `${R(2)} | ${bassBounce} | 0:4. 2:8 0:4. 2:8`,
      drums: { step: 16, fd: groove.fd, ft: E(2, 16) + G(2, groove.ft), sh: E(2, 16) + G(2, groove.sh) },
    },
    A: {
      bars: 8,
      chords: chordsA,
      flute: 'mf ' + tune,
      lyre: lyreBounce,
      bass: bassBounce,
      drums: { step: 16, ...groove },
    },
    B: {
      bars: 8,
      chords: 'F:1 | C:1 | Dm:1 | Am:1 | Bb:1 | F/A:1 | G:1 | A:1',
      tagel: 'f A4:4. G4:8 F4:4 C4:4 | E4:2. r:4 | F4:4. E4:8 D4:4 A3:4 | C4:2. r:4 | ' +
        'D4:4. E4:8 F4:4 Bb4:4 | A4:4. G4:8 F4:4 C5:4 | B4:4. A4:8 G4:4 D4:4 | C#4:2 E4:2',
      flute: 'r:1 | r:2 mp C6:8 B5:8 G5:8 E5:8 | r:1 | r:2 E5:8 G5:8 A5:8 C6:8 | r:1 | r:2 C6:8 A5:8 F5:8 A5:8 | r:1 | r:2 E5:8 C#5:8 E5:8 A5:8',
      lyre: lyreBounce,
      bass: 'mp 0:4. 2:8 0:4 2:4',
      pad: 'pp x:1',
      drums: { step: 16, fd: 'X.......o.......', ft: '........x.......', sh: groove.sh },
    },
    A2: {
      bars: 8,
      chords: chordsA,
      flute: 'mf ' + tune,
      tagel: 'mp F4:2 E4:2 | D4:2 F4:2 | F4:2 G4:2 | A4:2 B4:2 | A4:2 G4:2 | G4:2 F4:2 | F4:2 E4:2 | D4:1',
      lyre: lyreBounce,
      bass: bassBounce,
      drums: {
        step: 16, ...groove,
        ti: G(7, '..x.......x...x.') + '................',
        tl: E(7, 16) + '....x.x.X.x.X.XX',
      },
    },
    C: {
      bars: 8,
      chords: 'G:2 F:2 | C:2 G:2 | G:2 F:2 | C:1 | Em:2 F:2 | G:2 Am:2 | F:2 G:2 | Asus4:2 A:2',
      flute: 'f G5:8 B5:8 D6:8 B5:8 C6:8 A5:8 F5:8 A5:8 | G5:8 E5:8 C5:8 E5:8 D5:4 B4:4 | ' +
        'G5:8 B5:8 D6:8 B5:8 C6:8 A5:8 F5:8 A5:8 | G5:8 A5:8 G5:8 E5:8 C5:2 | ' +
        'E5:8 G5:8 B5:8 G5:8 A5:8 C6:8 F5:8 A5:8 | B5:8 D6:8 G5:8 B5:8 C6:8 E6:8 A5:8 C6:8 | ' +
        'A5:8 C6:8 F6:8 C6:8 B5:8 D6:8 G6:8 D6:8 | A5:8 D6:8 E6:8 D6:8 C#6:8 E6:8 A6:4',
      lyre: `mp r:4 [1 2 3]:8' [1 2 3]:8' r:4 [1 2 3]:4'`,
      tagel: 'mp D4:2 C4:2 | E4:2 D4:2 | D4:2 C4:2 | E4:1 | E4:2 F4:2 | G4:2 A4:2 | A4:2 B4:2 | A4:1',
      bass: bassBounce,
      pad: 'p x:1',
      drums: {
        step: 16, fd: groove.fd, ft: groove.ft, sh: 'oxoxoxoxoxoxoxox',
        tl: E(7, 16) + 'X.x.x.X.x.X.XxXx',
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'C'],
  loop: 1,
};
