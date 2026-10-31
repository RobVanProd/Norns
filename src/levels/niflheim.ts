// Niflheim — realm of ice and mist: leaps, mining, snow that slides, plates and gates. Every scripted click
// has at least 6 ticks of slack either side (tests/helpers.ts).
import type { LevelDef } from '../sim/level';
import { padLevel } from './pad';

export const N1: LevelDef = {
  id: 'n1', name: 'Frozen Steps', realm: 'niflheim', music: 'niflheim',
  intro: 'A rune-iron gate seals the pass. Its lever lies on a shelf of ice no Wyrdling can climb, but one could leap.',
  idea: 'A Leaper jumps up and forward',
  hints: [
    'A LEAPER makes one big jump forward. Take off a stride or two before the shelf; watch the arc in Foresight.',
    'Levers stay thrown once touched.',
    'Something hangs in the air past the gate, out of a walker\'s reach…',
  ],
  width: 560, height: 300, seed: 61,
  wyrdlings: 10, quota: 8, target: 10, rate: 50,
  skills: { leaper: 3 },
  terrain: [
    // flat under the shelf, so nobody steps up into it
    { op: 'ground', mat: 'Earth', pts: [[0, 220], [560, 220]] },
    { op: 'rect', mat: 'Rock', x: 0, y: 236, w: 560, h: 64, rough: 3 },
    // the shelf floats just above head height: walkers pass beneath, a leap from 10-30 px back lands on it
    { op: 'rect', mat: 'Ice', x: 150, y: 205, w: 80, h: 4 },
    { op: 'rect', mat: 'Iron', x: 302, y: 162, w: 24, h: 10 },
    { op: 'rect', mat: 'Rock', x: 326, y: 120, w: 234, h: 52, rough: 4, grain: 12 },
    { op: 'ceiling', mat: 'Ice', pts: [[0, 30], [100, 22], [220, 40], [300, 26], [560, 30]], rough: 5, grain: 14 },
    { op: 'rect', mat: 'Rock', x: 548, y: 0, w: 12, h: 300 },
  ],
  entities: [
    { type: 'entrance', x: 60, y: 160 },
    { type: 'exit', x: 510, y: 219 },
    { type: 'gate', id: 'g', x: 306, y: 172, w: 16, h: 48, links: ['lv'] },
    { type: 'lever', id: 'lv', x: 214, y: 205 },
    // 20 px up: walkers pass under it, any leap that takes off within about 40 px before it catches it
    { type: 'spindle', x: 420, y: 200 },
    { type: 'decor', sprite: 'crystal', x: 40, y: 219 },
    { type: 'decor', sprite: 'crystal', x: 380, y: 219 },
    { type: 'decor', sprite: 'brazier', x: 470, y: 219 },
    { type: 'decor', sprite: 'runestone', x: 280, y: 219 },
  ],
  solution: [
    { nth: 0, x: 131, dir: 1, skill: 'leaper', purpose: ['quota', 'target'] },
    { nth: 0, x: 400, dir: 1, skill: 'leaper', purpose: ['spindle'] },
  ],
};


export const N2: LevelDef = {
  id: 'n2', name: 'Glacier Depths', realm: 'niflheim', music: 'niflheim',
  intro: 'The Root Gate glows far below the glacier. A straight shaft means a fatal fall. Tunnel down gently.',
  idea: 'A Miner tunnels down a slope',
  hints: [
    'A MINER tunnels diagonally down — followers can walk the slope.',
    'Rune-iron stops every tool. Where the tunnel breaks through matters: look before you dig.',
    'The cave floor near the gate sounds hollow…',
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
    // the gate stands in a hollow below the cave floor; a grotto under the floor opens into it
    { op: 'rect', mat: 'Air', x: 500, y: 222, w: 100, h: 30, rough: 1 },
    { op: 'rect', mat: 'Air', x: 380, y: 237, w: 122, h: 15, rough: 1 },
    { op: 'ceiling', mat: 'Ice', pts: [[0, 20], [150, 30], [300, 16], [450, 34], [600, 22]], rough: 5, grain: 14 },
  ],
  entities: [
    { type: 'entrance', x: 60, y: 60 },
    { type: 'exit', x: 560, y: 251 },
    { type: 'spikes', x: 248, y: 221, w: 48 },
    // in the grotto, by its mouth: only a Digger on the cave floor gets there
    { type: 'spindle', x: 490, y: 251 },
    { type: 'decor', sprite: 'crystal', x: 120, y: 117 },
    { type: 'decor', sprite: 'crystal', x: 440, y: 221 },
    { type: 'decor', sprite: 'brazier', x: 585, y: 251 },
    { type: 'light', x: 300, y: 200, r: 90, color: '#6fb8ff', flicker: 0.1 },
  ],
  solution: [
    { nth: 0, x: 208, dir: 1, skill: 'miner', purpose: ['quota', 'target'] },
    { nth: 0, x: 430, dir: 1, minY: 200, skill: 'digger', purpose: ['spindle'] },
  ],
};
export const N3: LevelDef = {
  id: 'n3', name: 'Avalanche Pass', realm: 'niflheim', music: 'niflheim',
  intro: 'A chasm bars the pass, and above it hangs a hopper of snow. The plate beneath your feet opens it.',
  idea: 'A Warden on a plate holds it down',
  hints: [
    'Snow flows like sand: it falls, slides and piles up. Wyrdlings climb out as it rises.',
    'A plate only holds while something stands on it.',
    'The ice before the gate sounds hollow. A Miner could tunnel down to it…',
  ],
  width: 560, height: 300, seed: 63,
  wyrdlings: 12, quota: 8, target: 11, rate: 45,
  skills: { warden: 2, miner: 2 },
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 230, w: 250, h: 70, rough: 2 },
    { op: 'rect', mat: 'Rock', x: 290, y: 230, w: 270, h: 70, rough: 2 },
    { op: 'rect', mat: 'Rock', x: 250, y: 292, w: 40, h: 8 },
    { op: 'rect', mat: 'Earth', x: 0, y: 228, w: 250, h: 6, rough: 1 },
    { op: 'rect', mat: 'Earth', x: 290, y: 228, w: 270, h: 6, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 238, y: 96, w: 12, h: 80 },
    { op: 'rect', mat: 'Rock', x: 290, y: 96, w: 12, h: 80 },
    { op: 'rect', mat: 'Sand', x: 250, y: 104, w: 40, h: 66 },
    // the gate stands in a hollow below the far bank; a pocket under the bank opens into it
    { op: 'rect', mat: 'Air', x: 470, y: 228, w: 90, h: 30, rough: 1 },
    { op: 'rect', mat: 'Air', x: 388, y: 242, w: 84, h: 16, rough: 1 },
    { op: 'ceiling', mat: 'Ice', pts: [[0, 26], [120, 34], [238, 20], [302, 20], [420, 36], [560, 24]], rough: 5, grain: 14 },
    { op: 'rect', mat: 'Ice', x: 236, y: 0, w: 68, h: 98, rough: 2 },
  ],
  entities: [
    { type: 'entrance', x: 212, y: 166, dir: -1 },
    { type: 'exit', x: 524, y: 257 },
    // a Warden anywhere on it holds the hopper open; walkers only cross it, too briefly to empty the hopper
    { type: 'plate', id: 'p', x: 92, y: 227, w: 18 },
    { type: 'gate', id: 'hop', x: 250, y: 170, w: 40, h: 6, orient: 'h', links: ['p'], speed: 1 },
    // in the pocket, by its mouth: a Miner's tunnel from anywhere on the bank before it breaks in upstream
    { type: 'spindle', x: 462, y: 257 },
    { type: 'decor', sprite: 'crystal', x: 30, y: 227 },
    { type: 'decor', sprite: 'brazier', x: 548, y: 257 },
    { type: 'decor', sprite: 'crystal', x: 340, y: 227 },
  ],
  solution: [
    { nth: 0, x: 101, dir: -1, skill: 'warden', purpose: ['quota', 'target'] },
    { nth: 1, x: 380, dir: 1, skill: 'miner', purpose: ['spindle'] },
  ],
};

export const N4: LevelDef = {
  id: 'n4', name: 'Rime Gate', realm: 'niflheim', music: 'niflheim',
  intro: 'The Rime Gate answers only when both its plates are pressed at once: one by the black water, one on an ice shelf no walker can reach.',
  idea: 'Two plates held at once',
  hints: [
    'The gate opens only while BOTH plates are held. A Warden standing on a plate holds it down forever.',
    'Wyrdlings pass safely beneath a Warden on a ledge above them.',
    'Something hangs high above the shelf: too high to reach with a leap from the ground…',
  ],
  width: 620, height: 320, seed: 64,
  wyrdlings: 15, quota: 10, target: 13, rate: 45,
  skills: { leaper: 3, warden: 3 },
  ambient: [0.66, 0.72, 0.88],
  terrain: [
    // flat under the shelf, so nobody steps up into it
    { op: 'ground', mat: 'Earth', pts: [[40, 230], [620, 230]] },
    { op: 'rect', mat: 'Rock', x: 0, y: 244, w: 620, h: 76, rough: 2 },
    { op: 'rect', mat: 'Air', x: 0, y: 230, w: 40, h: 90 },
    { op: 'rect', mat: 'Rock', x: 0, y: 290, w: 40, h: 30, rough: 2, noBack: true },
    // the shelf: walkers pass beneath, a leap from 10-30 px back lands on it
    { op: 'rect', mat: 'Ice', x: 280, y: 215, w: 100, h: 4 },
    // the gate's lintel, up to the roof
    { op: 'rect', mat: 'Rock', x: 470, y: 30, w: 28, h: 140, rough: 2 },
    { op: 'rect', mat: 'Iron', x: 476, y: 162, w: 16, h: 8 },
    { op: 'ceiling', mat: 'Ice', pts: [[0, 28], [140, 40], [268, 24], [332, 24], [470, 44], [620, 30]], rough: 5, grain: 14 },
    { op: 'rect', mat: 'Rock', x: 608, y: 0, w: 12, h: 320 },
  ],
  entities: [
    { type: 'entrance', x: 170, y: 168 },
    { type: 'exit', x: 560, y: 229 },
    { type: 'water', x: 0, y: 262, w: 40, h: 28 },
    { type: 'plate', id: 'pa', x: 48, y: 229, w: 22 },
    { type: 'plate', id: 'pb', x: 352, y: 214, w: 20 },
    { type: 'gate', id: 'g', x: 480, y: 170, w: 8, h: 60, links: ['pa', 'pb'], mode: 'all' },
    // 22 px above the shelf: out of reach of walkers there and of leaps from the ground, caught by a leap from
    // the shelf over the Warden's head
    { type: 'spindle', x: 360, y: 192 },
    { type: 'decor', sprite: 'crystal', x: 120, y: 229 },
    { type: 'decor', sprite: 'brazier', x: 590, y: 229 },
    { type: 'decor', sprite: 'crystal', x: 420, y: 229 },
    { type: 'light', x: 540, y: 200, r: 80, color: '#7cc4ff', flicker: 0.1 },
  ],
  solution: [
    { nth: 0, x: 261, dir: 1, skill: 'leaper', purpose: ['quota', 'target'] },
    { nth: 0, x: 362, dir: 1, minY: 210, maxY: 216, skill: 'warden', purpose: ['quota', 'target'] },
    // the next one, back from the closed gate, stops the crowd short of the water
    { nth: 1, x: 59, dir: -1, skill: 'warden', purpose: ['quota', 'target'] },
    // up onto the shelf, then from it over the Warden: the second leap lands past the shelf's end
    { nth: 4, x: 261, dir: 1, skill: 'leaper', purpose: ['spindle'] },
    { nth: 4, x: 346, dir: 1, minY: 210, maxY: 216, skill: 'leaper', purpose: ['spindle'] },
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
