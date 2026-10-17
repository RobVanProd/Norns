// BOSS — "Wyrd-Breaker". D minor (Aeolian + harmonic V), 140 bpm.
// Intensity layers (switched on bar lines):
//   0: staccato string ostinato, pulsing bowed bass, low string pad, taiko/tom/rim groove
//   1: + the brass lead (the Thread made heroic: Bb as the dark 6th, C# leading tone)
//   2: + choir pad, horn stabs (3+3+2) and double-time drums with crashes
// Form: A (i–bVI–bVII–V) · A2 (lead climbs to F6) · B (Gm–Dm syncopated call) ·
//       C (long-note climax, Neapolitan Eb → A) · D (menacing Dm–Eb alternation).

import type { SongDef } from '../notation';
import { G } from './util';

const ost = `0:8'! 0' 2' 0'! 1' 0' 2'! 0'`;
const bass = '0:8! 0 0 0! 0 0 0! 0';
const horn = 'x:8! r:4 x:8! r:4 x:8 r:8';
// 8-bar lines: groove for 7 bars, then a fill into the next section
const drums0 = {
  step: 16,
  tk: G(7, 'X.......X.....x.') + 'X.......X.......',
  tl: G(7, '....x.......x...') + '....x...x.x.xxxx',
  ka: G(7, '..x...x...x...x.') + '..x...x.........',
};
const drums2 = {
  step: 16,
  tk: G(7, 'X...x...X...x...') + 'X...x...X.X.XXXX',
  tl: G(7, '..x...x...x..xx.') + '..x...x.xxxxxxxx',
  fd: 'x.x.x.x.x.x.x.x.',
  ka: '.x.x.x.x.x.x.x.x',
  cy: 'X' + '.'.repeat(127),
  sw: 'x' + '.'.repeat(127),
};

const base = { ost, bass, low: 'pp x:1', horn, choir: 'mp x:1', drums: drums0, drums2 };

export const boss: SongDef = {
  bpm: 140,
  meter: 4,
  gain: 1.6,
  delayBeats: 0.75,
  delayFb: 0.2,
  tracks: {
    ost: { inst: 'stacc', chord: 'close', lo: 'A3', vol: 0.56, pan: -0.2, rev: 0.2 },
    bass: { inst: 'bass', chord: 'root', lo: 'A1', vol: 0.5, rev: 0.08, gate: 0.8 },
    low: { inst: 'strings', chord: 'close', lo: 'A2', vol: 0.36, rev: 0.4 },
    lead: { inst: 'brass', vol: 0.62, pan: 0.12, rev: 0.28, dly: 0.12, layers: [1, 2] },
    horn: { inst: 'horn', chord: 'root', lo: 'D3', vol: 0.36, pan: 0.15, rev: 0.3, layers: [2, 2] },
    choir: { inst: 'choir', chord: 'close', lo: 'A3', vol: 0.36, rev: 0.5, layers: [2, 2] },
    drums: { drums: true, vol: 0.4, rev: 0.15, layers: [0, 1] },
    drums2: { drums: true, vol: 0.36, rev: 0.15, layers: [2, 2] },
  },
  sections: {
    A: {
      bars: 8,
      chords: 'Dm:1 | Dm:1 | Bb:1 | C:1 | Dm:1 | Dm:1 | Bb:1 | A:1',
      lead: 'f D5:8 A5:8 Bb5:2 A5:8 G5:8 | E5:4. F5:8 D5:2 | D5:8 F5:8 Bb5:4. A5:8 G5:8 F5:8 | G5:4. E5:8 C5:2 | ' +
        'D5:8 A5:8 Bb5:2 A5:8 G5:8 | A5:4. Bb5:8 C6:2 | D6:4. C6:8 Bb5:4 F5:4 | E5:2 C#5:2',
      ...base,
    },
    A2: {
      bars: 8,
      chords: 'Dm:1 | Dm:1 | Bb:1 | C:1 | Dm:1 | Dm:1 | Bb:1 | A:1',
      lead: 'f D5:8 A5:8 Bb5:2 A5:8 G5:8 | E5:4. F5:8 D5:2 | F5:8 Bb5:8 D6:2 C6:8 Bb5:8 | C6:4. Bb5:8 G5:2 | ' +
        'A5:8 D6:8 F6:2 E6:8 D6:8 | C6:4. D6:8 A5:2 | Bb5:4 A5:4 G5:4 F5:4 | E5:2. r:4',
      ...base,
    },
    B: {
      bars: 8,
      chords: 'Gm:1 | Gm:1 | Dm:1 | Dm:1 | Bb:1 | C:1 | A:1 | A:1',
      lead: 'f G5:4 D5:8 G5:8 r:8 A5:8 Bb5:4 | A5:4. G5:8 F5:4 D5:4 | F5:4 D5:8 F5:8 r:8 G5:8 A5:4 | G5:4. F5:8 E5:4 D5:4 | ' +
        'D6:4 Bb5:8 D6:8 r:8 C6:8 Bb5:4 | C6:4. Bb5:8 A5:4 G5:4 | A5:2 E5:4 G5:4 | C#6:2 E6:2',
      ...base,
    },
    C: {
      bars: 8,
      chords: 'Bb:1 | C:1 | Dm:1 | Dm:1 | Bb:1 | C:1 | Eb:1 | A:1',
      lead: 'ff D5:2 F5:2 | G5:2. E5:4 | F5:2 A5:2 | D6:1 | D6:2 F6:2 | E6:2. C6:4 | Bb5:2 G5:2 | A5:2 C#6:2',
      ...base,
      choir: 'mf x:1',
    },
    D: {
      bars: 8,
      chords: 'Dm:1 | Eb:1 | Dm:1 | Eb:1 | Dm:1 | Eb:1 | C:1 | A:1',
      lead: `f A5:4' F5:8 D5:8 A4:4' r:4 | Bb5:4' G5:8 Eb5:8 Bb4:4' r:4 | A5:4' F5:8 D5:8 A4:4' D5:8 E5:8 | F5:4 G5:4 Bb5:4 G5:4 | ` +
        `A5:4' F5:8 D5:8 A4:4' r:4 | Bb5:4' G5:8 Eb5:8 Bb4:4' r:4 | C6:4. Bb5:8 G5:4 E5:4 | C#6:4. A5:8 E5:4 A5:4`,
      ...base,
    },
  },
  form: ['A', 'A2', 'B', 'C', 'D'],
  loop: 0,
};
