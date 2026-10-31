// Niflheim — realm of ice and mist: leaps, mining, snow that slides, boulders and gates.
import type { LevelDef } from '../sim/level';
import { padLevel } from './pad';

export const N1: LevelDef = {
  id: 'n1', name: 'Frozen Steps', realm: 'niflheim', music: 'niflheim',
  intro: 'A rune-iron gate seals the pass. Its lever sits on an ice shelf no Wyrdling can climb — but one could leap.',
  hints: [
    'A LEAPER makes one big jump forward. Watch the arc in Foresight before you commit.',
    'Levers stay thrown once touched.',
  ],
  width: 560, height: 300, seed: 61,
  wyrdlings: 10, quota: 8, target: 10, rate: 50,
  skills: { leaper: 3 },
  terrain: [
    { op: 'ground', mat: 'Earth', pts: [[0, 222], [120, 220], [330, 221]], rough: 1.5 },
    { op: 'rect', mat: 'Rock', x: 0, y: 236, w: 330, h: 64, rough: 3 },
    { op: 'rect', mat: 'Ice', x: 150, y: 200, w: 56, h: 9, rough: 1 },
    { op: 'rect', mat: 'Ice', x: 228, y: 186, w: 30, h: 8, rough: 1 },
    { op: 'rect', mat: 'Iron', x: 302, y: 162, w: 24, h: 10 },
    { op: 'rect', mat: 'Rock', x: 326, y: 120, w: 234, h: 52, rough: 4, grain: 12 },
    { op: 'ground', mat: 'Earth', pts: [[326, 221], [440, 219], [560, 222]], rough: 1.5 },
    { op: 'rect', mat: 'Rock', x: 326, y: 236, w: 234, h: 64, rough: 3 },
    { op: 'ceiling', mat: 'Ice', pts: [[0, 30], [100, 22], [220, 40], [300, 26], [560, 30]], rough: 5, grain: 14 },
    { op: 'rect', mat: 'Rock', x: 548, y: 0, w: 12, h: 300 },
  ],
  entities: [
    { type: 'entrance', x: 60, y: 160 },
    { type: 'exit', x: 510, y: 220 },
    { type: 'gate', id: 'g', x: 306, y: 172, w: 16, h: 50, links: ['lv'] },
    { type: 'lever', id: 'lv', x: 186, y: 199 },
    { type: 'spindle', x: 246, y: 185 },
    { type: 'decor', sprite: 'crystal', x: 40, y: 220 },
    { type: 'decor', sprite: 'crystal', x: 420, y: 219 },
    { type: 'decor', sprite: 'brazier', x: 470, y: 219 },
    { type: 'decor', sprite: 'runestone', x: 280, y: 220 },
  ],
  solution: [
    { nth: 0, x: 130, dir: 1, skill: 'leaper', purpose: ['quota', 'target', 'spindle'] },
    { nth: 0, x: 200, dir: 1, minY: 190, maxY: 200, skill: 'leaper', purpose: ['spindle'] },
  ],
};



export const N2: LevelDef = {
  id: 'n2', name: 'Glacier Depths', realm: 'niflheim', music: 'niflheim',
  intro: 'The Root Gate glows far below the glacier. A straight shaft means a fatal fall. Tunnel down gently.',
  hints: [
    'A MINER tunnels diagonally down — followers can walk the slope.',
    'Rune-iron stops every tool. Where the tunnel breaks through matters: look before you dig.',
  ],
  width: 600, height: 300, seed: 62,
  wyrdlings: 12, quota: 9, target: 12, rate: 40,
  skills: { miner: 2, digger: 2 },
  ambient: [0.62, 0.7, 0.85],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 120, w: 600, h: 52, rough: 2, grain: 12 },
    { op: 'rect', mat: 'Ice', x: 0, y: 118, w: 600, h: 8, rough: 1.5 },
    { op: 'rect', mat: 'Iron', x: 0, y: 148, w: 186, h: 8 },
    { op: 'rect', mat: 'Iron', x: 420, y: 140, w: 180, h: 8 },
    { op: 'rect', mat: 'Rock', x: 0, y: 222, w: 600, h: 78, rough: 3 },
    { op: 'rect', mat: 'Earth', x: 0, y: 222, w: 600, h: 8, rough: 1.5 },
    { op: 'rect', mat: 'Air', x: 0, y: 172, w: 600, h: 50, back: true },
    { op: 'ceiling', mat: 'Ice', pts: [[0, 20], [150, 30], [300, 16], [450, 34], [600, 22]], rough: 5, grain: 14 },
  ],
  entities: [
    { type: 'entrance', x: 60, y: 60 },
    { type: 'exit', x: 540, y: 221 },
    { type: 'spikes', x: 248, y: 221, w: 48 },
    { type: 'spindle', x: 290, y: 160 },
    { type: 'decor', sprite: 'crystal', x: 120, y: 117 },
    { type: 'decor', sprite: 'crystal', x: 480, y: 221 },
    { type: 'decor', sprite: 'brazier', x: 570, y: 221 },
    { type: 'light', x: 300, y: 200, r: 90, color: '#6fb8ff', flicker: 0.1 },
  ],
  solution: [
    { nth: 0, x: 208, dir: 1, skill: 'miner', purpose: ['quota', 'target', 'spindle'] },
  ],
};
export const N3: LevelDef = {
  id: 'n3', name: 'Avalanche Pass', realm: 'niflheim', music: 'niflheim',
  intro: 'A chasm bars the pass, and above it hangs a hopper of snow. The plate beneath your feet opens it.',
  hints: [
    'Snow flows like sand: it falls, slides and piles up. Wyrdlings climb out as it rises.',
    'A plate only holds while something stands on it.',
  ],
  width: 560, height: 300, seed: 63,
  wyrdlings: 12, quota: 8, target: 11, rate: 45,
  skills: { warden: 2, leaper: 2 },
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 230, w: 250, h: 70, rough: 2 },
    { op: 'rect', mat: 'Rock', x: 290, y: 230, w: 270, h: 70, rough: 2 },
    { op: 'rect', mat: 'Rock', x: 250, y: 292, w: 40, h: 8 },
    { op: 'rect', mat: 'Earth', x: 0, y: 228, w: 250, h: 6, rough: 1 },
    { op: 'rect', mat: 'Earth', x: 290, y: 228, w: 270, h: 6, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 238, y: 96, w: 12, h: 80 },
    { op: 'rect', mat: 'Rock', x: 290, y: 96, w: 12, h: 80 },
    { op: 'rect', mat: 'Sand', x: 250, y: 104, w: 40, h: 66 },
    { op: 'ceiling', mat: 'Ice', pts: [[0, 26], [120, 34], [238, 20], [302, 20], [420, 36], [560, 24]], rough: 5, grain: 14 },
    { op: 'rect', mat: 'Ice', x: 236, y: 0, w: 68, h: 98, rough: 2 },
  ],
  entities: [
    { type: 'entrance', x: 212, y: 166, dir: -1 },
    { type: 'exit', x: 520, y: 228 },
    { type: 'plate', id: 'p', x: 94, y: 227 },
    { type: 'gate', id: 'hop', x: 250, y: 170, w: 40, h: 6, orient: 'h', links: ['p'], speed: 1 },
    { type: 'spindle', x: 270, y: 206 },
    { type: 'decor', sprite: 'crystal', x: 30, y: 227 },
    { type: 'decor', sprite: 'brazier', x: 470, y: 227 },
    { type: 'decor', sprite: 'crystal', x: 400, y: 227 },
  ],
  solution: [
    { nth: 0, x: 101, dir: -1, skill: 'warden', purpose: ['quota', 'target', 'spindle'] },
    { nth: 1, x: 246, dir: 1, skill: 'leaper', purpose: ['spindle'] },
  ],
};

export const N4: LevelDef = {
  id: 'n4', name: 'Rime Gate', realm: 'niflheim', music: 'niflheim',
  intro: 'Three tricks of the mist in one pass: a plate out of reach, a hopper of snow, and the deep road to the gate.',
  hints: [
    'A Warden standing on a plate holds it down forever.',
    'Wyrdlings pass safely beneath a Warden on a ledge above them.',
  ],
  width: 620, height: 320, seed: 64,
  wyrdlings: 14, quota: 10, target: 13, rate: 40,
  skills: { leaper: 2, warden: 2, miner: 2 },
  ambient: [0.66, 0.72, 0.88],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 232, w: 280, h: 88, rough: 2 },
    { op: 'rect', mat: 'Earth', x: 0, y: 230, w: 280, h: 6, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 280, y: 292, w: 40, h: 28 },
    { op: 'rect', mat: 'Rock', x: 320, y: 232, w: 300, h: 38, rough: 2 },
    { op: 'rect', mat: 'Earth', x: 320, y: 230, w: 300, h: 6, rough: 1 },
    { op: 'rect', mat: 'Iron', x: 320, y: 246, w: 84, h: 8 },
    { op: 'rect', mat: 'Rock', x: 320, y: 300, w: 300, h: 20, rough: 2 },
    { op: 'rect', mat: 'Rock', x: 320, y: 232, w: 14, h: 70 },
    { op: 'rect', mat: 'Air', x: 320, y: 270, w: 300, h: 30, back: true },
    { op: 'rect', mat: 'Ice', x: 188, y: 212, w: 44, h: 4 },
    { op: 'rect', mat: 'Rock', x: 268, y: 86, w: 12, h: 92 },
    { op: 'rect', mat: 'Rock', x: 320, y: 86, w: 12, h: 92 },
    { op: 'rect', mat: 'Sand', x: 280, y: 94, w: 40, h: 78 },
    { op: 'ceiling', mat: 'Ice', pts: [[0, 28], [140, 40], [268, 24], [332, 24], [470, 44], [620, 30]], rough: 5, grain: 14 },
    { op: 'rect', mat: 'Ice', x: 266, y: 0, w: 68, h: 90, rough: 2 },
  ],
  entities: [
    { type: 'entrance', x: 60, y: 168 },
    { type: 'exit', x: 590, y: 299 },
    { type: 'plate', id: 'p', x: 200, y: 211 },
    { type: 'gate', id: 'hop', x: 280, y: 172, w: 40, h: 6, orient: 'h', links: ['p'], speed: 1 },
    { type: 'spikes', x: 466, y: 299, w: 40 },
    { type: 'spindle', x: 470, y: 252 },
    { type: 'decor', sprite: 'crystal', x: 30, y: 229 },
    { type: 'decor', sprite: 'brazier', x: 560, y: 299 },
    { type: 'decor', sprite: 'crystal', x: 380, y: 229 },
    { type: 'light', x: 540, y: 285, r: 80, color: '#7cc4ff', flicker: 0.1 },
  ],
  solution: [
    { nth: 0, x: 168, dir: 1, skill: 'leaper', purpose: ['quota', 'target', 'spindle'] },
    { nth: 0, x: 204, minY: 203, maxY: 212, skill: 'warden', purpose: ['quota', 'target', 'spindle'] },
    { nth: 1, x: 430, dir: 1, skill: 'miner', purpose: ['quota', 'target', 'spindle'] },
  ],
};

export const N5: LevelDef = {
  id: 'n5', name: 'Hrímgrímnir', realm: 'niflheim', music: 'boss',
  intro: 'The Frost Jötunn guards the mist. His breath freezes, his fists shake the ice, his icicles rain down.',
  hints: [
    'Frozen Wyrdlings thaw in time — until then others bump into them like ice.',
    'Climbers cross the ice pillar every lap — and its stone with it.',
    'When the fist rises, scatter: a slam crushes everyone huddled beneath it.',
  ],
  width: 600, height: 320, seed: 65,
  wyrdlings: 20, quota: 10, target: 15, rate: 30,
  skills: { climber: 4, leaper: 3, warden: 2, glider: 2, miner: 1 },
  ambient: [0.62, 0.7, 0.9],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 260, w: 600, h: 60, rough: 2 },
    { op: 'rect', mat: 'Ice', x: 0, y: 258, w: 520, h: 6, rough: 1 },
    { op: 'rect', mat: 'Ice', x: 200, y: 242, w: 50, h: 18, rough: 1 },
    { op: 'rect', mat: 'Ice', x: 340, y: 214, w: 32, h: 46, rough: 0.5 },
    { op: 'rect', mat: 'Iron', x: 520, y: 0, w: 16, h: 262 },
    { op: 'ceiling', mat: 'Ice', pts: [[0, 50], [160, 40], [320, 58], [460, 44], [600, 60]], rough: 6, grain: 16 },
  ],
  entities: [
    { type: 'entrance', x: 80, y: 190 },
    { type: 'exit', x: 26, y: 257 },
    { type: 'seidr', x: 120, y: 257 },
    { type: 'seidr', x: 225, y: 241 },
    { type: 'seidr', x: 356, y: 213 },
    { type: 'decor', sprite: 'crystal', x: 60, y: 257 },
    { type: 'decor', sprite: 'brazier', x: 300, y: 257 },
    { type: 'decor', sprite: 'crystal', x: 440, y: 257 },
    { type: 'decor', sprite: 'brazier', x: 500, y: 257 },
  ],
  boss: { kind: 'jotunn', x: 566, y: 300, hp: 6, delay: 160, arena: { x0: 12, x1: 512, floorY: 257 } },
  solution: [
    { nth: 0, skill: 'climber', purpose: ['quota', 'target', 'boss'] },
    // a slam shockwave tosses one Wyrdling into the gully behind the ledge: leap it back out, or it
    // wanders there forever and the level never ends by itself
    { nth: 10, t: 1000, x: 268, dir: -1, skill: 'leaper', purpose: ['finish'] },
  ],
};

// boss arena grown to 640×360 (see pad.ts)
export const NIFLHEIM: LevelDef[] = [N1, N2, N3, N4, padLevel(N5, 40, 40)];
