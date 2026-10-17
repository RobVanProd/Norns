// MUSPELHEIM — "The Forge Below". E Phrygian, 126 bpm. Driving, hot, industrious.
// A low bowed riff accented 3+3+2 over taiko and anvil; the Thread on brassy lead becomes
// Phrygian (its falling 2nd is the hot F natural). B climbs C–Dm–Em with a punchy repeated-note
// cell answered by choir stabs, ending on the Phrygian cadence F→E. C is the forge: anvils on
// every beat, toms, tagelharpa singing the Thread in long notes; the riff intro returns as a
// breakdown before the loop.

import type { SongDef } from '../notation';
import { E, G } from './util';

const rE = 'E2:8! E2 B2 E2! E2 F2 E2! D2';
const rF = 'F2:8! F2 C3 F2! F2 G2 F2! E2';
const rC = 'C2:8! C2 G2 C2! C2 D2 C2! B1';
const rD = 'D2:8! D2 A2 D2! D2 E2 D2! C2';
const rG = 'G2:8! G2 D3 G2! G2 A2 G2! F2';
const rGF = 'G2:8! G2 D3 G2! F2! F2 C3 E2';
const ost = `mp 0:8' 2' 1' 2' 0' 2' 1' 2'`;
const forge = { tk: 'X..x..x.x..x..x.', an: '....X.......X...', sh: 'x.o.x.o.x.o.x.o.' };

const melA = 'E4:8 B4:8 C5:2 B4:8 A4:8 | F4:4. G4:8 E4:2 | A4:8 C5:8 D5:2 C5:8 A4:8 | B4:4. A4:8 G4:4 F4:8 E4:8 | ' +
  'E5:8 B4:8 C5:4 B4:8 A4:8 G4:8 A4:8 | B4:4. C5:8 B4:4 G4:4 | D5:4 B4:4 C5:4 A4:4 | B4:4. A4:8 F4:4 E4:4';
const chordsA = 'Em:1 | Em:1 | F:1 | Em:1 | Em:1 | Em:1 | G:2 F:2 | Em:1';
const bassA = `mf ${rE} | ${rE} | ${rF} | ${rE} | ${rE} | ${rE} | ${rGF} | ${rE}`;

export const muspelheim: SongDef = {
  bpm: 126,
  meter: 4,
  gain: 2.0,
  delayBeats: 0.75,
  delayFb: 0.25,
  tracks: {
    brass: { inst: 'brass', vol: 0.62, pan: 0.1, rev: 0.25, dly: 0.12 },
    bass: { inst: 'bass', vol: 0.55, rev: 0.08, gate: 0.85 },
    ost: { inst: 'stacc', chord: 'close', lo: 'E3', vol: 0.46, pan: -0.25, rev: 0.2 },
    tagel: { inst: 'tagel', vol: 0.52, pan: 0.25, rev: 0.3, gate: 0.97 },
    vox: { inst: 'vox', chord: 'close', lo: 'E4', vol: 0.42, rev: 0.35 },
    choir: { inst: 'choir', chord: 'close', lo: 'B3', vol: 0.3, rev: 0.45 },
    drums: { drums: true, vol: 0.4, rev: 0.18 },
  },
  sections: {
    intro: {
      bars: 4,
      chords: 'Em:1 | Em:1 | Em:1 | F:1',
      bass: `mf ${rE} | ${rE} | ${rE} | ${rF}`,
      ost: `r:1 | r:1 | ${ost} | 0:8' 2' 1' 2' 0' 2' 1' 2'`,
      drums: {
        step: 16, tk: forge.tk, an: E(2, 16) + G(2, forge.an), sh: E(2, 16) + G(2, forge.sh),
        tl: E(3, 16) + '........x.x.X.XX',
      },
    },
    A: {
      bars: 8,
      chords: chordsA,
      brass: 'mf ' + melA,
      bass: bassA,
      ost,
      drums: { step: 16, ...forge, cy: 'X' + '.'.repeat(127) },
    },
    B: {
      bars: 8,
      chords: 'C:1 | Dm:1 | Em:1 | Em:1 | C:1 | Dm:1 | F:1 | F:1',
      brass: 'f E5:4 E5:8 D5:8 E5:4 G5:4 | F5:4 F5:8 E5:8 F5:4 A5:4 | G5:4. F5:8 E5:4 B4:4 | E5:2. r:4 | ' +
        'E5:4 E5:8 D5:8 E5:4 G5:4 | A5:4 A5:8 G5:8 A5:4 C6:4 | C6:4. B5:8 A5:4 G5:4 | F5:2 E5:2',
      vox: 'f x:8! r:8 r:2. | x:8! r:8 r:2. | x:8! r:8 r:2. | x:8! r:8 r:4 x:8! x:8 x:4! | ' +
        'x:8! r:8 r:2. | x:8! r:8 r:2. | x:8! r:8 r:2. | x:8! r:8 r:4 x:4! x:4!',
      bass: `mf ${rC} | ${rD} | ${rE} | ${rE} | ${rC} | ${rD} | ${rF} | ${rF}`,
      ost,
      drums: { step: 16, tk: forge.tk, an: forge.an, sh: 'xoxoxoxoxoxoxoxo', tl: '......x.......x.', cy: 'X' + '.'.repeat(127) },
    },
    A2: {
      bars: 8,
      chords: chordsA,
      brass: 'mf ' + melA,
      tagel: 'mp B3:1 | G3:1 | A3:1 | B3:2 G3:2 | E4:1 | D4:2 B3:2 | B3:2 A3:2 | B3:1',
      choir: 'p x:1',
      bass: bassA,
      ost,
      drums: { step: 16, ...forge, tl: '..x.......x.....', th: E(7, 16) + 'x.x.x.x.X.X.XXXX' },
    },
    C: {
      bars: 8,
      chords: 'Em:1 | F:1 | Em:1 | F:1 | Em:1 | F:1 | G:1 | F:1',
      tagel: 'mf E4:2 B4:2 | C5:2. A4:4 | B4:2 G4:2 | F4:1 | E4:2 B4:2 | C5:2 D5:2 | D5:2 B4:2 | C5:2 A4:2',
      choir: 'mp x:1',
      bass: `mf ${rE} | ${rF} | ${rE} | ${rF} | ${rE} | ${rF} | ${rG} | ${rF}`,
      ost: `mf 0:16' 2' 1' 2'`,
      drums: { step: 16, tk: forge.tk, tl: '..x...x...x...x.', th: '.......x.......x', an: 'X...x...x...x...' },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'C', 'intro'],
  loop: 1,
};
