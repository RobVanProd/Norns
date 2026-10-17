// Stingers: one-shot jingles (loop: -1).

import type { SongDef } from '../notation';
import type { StingerId } from '../types';

export const STINGER_DEFS: Record<StingerId, SongDef> = {
  // Bright fanfare: the Thread head in D major, harp sweep, bell + taiko on the final chord.
  victory: {
    bpm: 120, meter: 4, loop: -1, form: ['S'], gain: 1.75,
    tracks: {
      brass: { inst: 'brass', vol: 0.55, pan: 0.1, rev: 0.35 },
      horn: { inst: 'horn', chord: 'root', lo: 'D3', vol: 0.4, rev: 0.4, gate: 1 },
      harp: { inst: 'harp', chord: 'spread', lo: 'D3', vol: 0.5, pan: -0.25, rev: 0.4 },
      strings: { inst: 'strings', chord: 'close', lo: 'A3', vol: 0.42, rev: 0.4, gate: 1 },
      bell: { inst: 'bell', vol: 0.35, rev: 0.5 },
      drums: { drums: true, vol: 0.55, rev: 0.25 },
    },
    sections: {
      S: {
        bars: 2,
        chords: 'D:2 A:2 | D:1',
        brass: 'f D5:8 A5:8 B5:4 A5:8 F#5:8 A5:4 | ff D6:2. r:4',
        harp: 'mf 0:16 1 2 3 4 5 6 7 r:2 | 0:4 r:2.',
        strings: 'mf x:2 x:2 | f x:2. r:4',
        horn: 'mf x:2 x:2 | f x:2. r:4',
        bell: 'r:1 | f D5:1',
        drums: { step: 16, tk: 'X.......x.......X...............', cy: '................X...............' },
      },
    },
  },
  // Gentle, unpunishing: the Thread's falling half sighs down to D over C–A–Dm.
  defeat: {
    bpm: 100, meter: 4, loop: -1, form: ['S'], gain: 2.7,
    tracks: {
      flute: { inst: 'flute', vol: 0.55, rev: 0.5, gate: 0.97 },
      harp: { inst: 'harp', chord: 'spread', lo: 'D3', vol: 0.45, pan: -0.2, rev: 0.5 },
      pad: { inst: 'strings', chord: 'close', lo: 'A3', vol: 0.3, rev: 0.5, gate: 1 },
      bass: { inst: 'bass', chord: 'root', lo: 'A1', vol: 0.35, rev: 0.3, gate: 1 },
    },
    sections: {
      S: {
        bars: 2,
        chords: 'C:2 A:2 | Dm:1',
        flute: 'mp A5:4 G5:4 E5:4. F5:8 | D5:2. r:4',
        harp: 'p 0:8 1 2 3 0 1 2 3 | 0:2 r:2',
        pad: 'pp x:2 x:2 | x:2. r:4',
        bass: 'pp 0:2 0:2 | 0:2. r:4',
      },
    },
  },
  // Sparkling rise: pentatonic celesta + harp run, chimes on top, airy pad.
  unlock: {
    bpm: 120, meter: 4, loop: -1, form: ['S'], gain: 2.3,
    tracks: {
      cel: { inst: 'celesta', vol: 0.55, pan: 0.15, rev: 0.5, dly: 0.3 },
      harp: { inst: 'harp', vol: 0.42, pan: -0.15, rev: 0.5 },
      air: { inst: 'air', chord: 'close', lo: 'A4', vol: 0.4, rev: 0.6, gate: 1 },
      chime: { inst: 'chime', vol: 0.42, rev: 0.6 },
    },
    sections: {
      S: {
        bars: 1,
        chords: 'Dadd9:1',
        cel: 'mf D5:16 E5 F#5 A5 B5 D6 E6 F#6 A6:4 r:4',
        harp: 'mp D4:16 E4 F#4 A4 B4 D5 E5 F#5 A5:4 r:4',
        air: 'pp x:1',
        chime: 'r:2 f A6:4 D7:4',
      },
    },
  },
  // Ominous horn rising to the dark 6th, low choir and bell, taiko hit with a swell into beat 3.
  boss_intro: {
    bpm: 72, meter: 4, loop: -1, form: ['S'], gain: 1.6,
    tracks: {
      horn: { inst: 'horn', vol: 0.62, rev: 0.5, gate: 1 },
      choir: { inst: 'choir', chord: 'close', lo: 'D3', vol: 0.4, rev: 0.5, gate: 1 },
      bass: { inst: 'bass', vol: 0.5, rev: 0.3, gate: 1 },
      bell: { inst: 'bell', vol: 0.35, rev: 0.6 },
      drums: { drums: true, vol: 0.72, rev: 0.3 },
    },
    sections: {
      S: {
        bars: 1,
        chords: 'Dm:1',
        horn: 'f D3:4. A3:8 Bb3:2',
        choir: 'p x:1',
        bass: 'mf D2:1',
        bell: 'mf D3:1',
        drums: { step: 16, tk: 'X...........X...', sw: '............x...', cy: '............X...' },
      },
    },
  },
};
