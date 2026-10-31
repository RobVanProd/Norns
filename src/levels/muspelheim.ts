// Muspelheim — realm of fire: rune blasts, boulders that become stepping stones, forges and flame.
import type { LevelDef } from '../sim/level';
import { padLevel } from './pad';

export const U1: LevelDef = {
  id: 'u1', name: 'Ember Road', realm: 'muspelheim', music: 'muspelheim',
  intro: 'Basalt walls and a river of fire. Runes can break stone — and send a boulder rolling where you need it.',
  hints: [
    'RUNE BLAST: the Wyrdling plants a rune and walks on. Three heartbeats later — boom.',
    'Blasts fling boulders. A boulder rolled into lava cools into a stepping stone.',
    'Stand clear: blasts fling Wyrdlings too.',
  ],
  width: 600, height: 300, seed: 71,
  wyrdlings: 10, quota: 7, target: 9, rate: 50,
  skills: { blast: 4 },
  ambient: [0.78, 0.6, 0.55],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 230, w: 300, h: 70, rough: 2 },
    { op: 'rect', mat: 'Earth', x: 0, y: 228, w: 300, h: 6, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 326, y: 230, w: 274, h: 70, rough: 2 },
    { op: 'rect', mat: 'Earth', x: 326, y: 228, w: 274, h: 6, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 300, y: 262, w: 26, h: 38 },
    { op: 'rect', mat: 'Rock', x: 160, y: 150, w: 12, h: 82, rough: 1 },
    { op: 'ceiling', mat: 'Rock', pts: [[0, 40], [140, 30], [300, 52], [450, 36], [600, 46]], rough: 6, grain: 16 },
    { op: 'rect', mat: 'Rock', x: 150, y: 40, w: 30, h: 112, rough: 3 },
  ],
  entities: [
    { type: 'entrance', x: 60, y: 168 },
    { type: 'exit', x: 556, y: 228 },
    { type: 'lava', x: 300, y: 230, w: 26, h: 32 },
    { type: 'boulder', x: 276, y: 215, r: 13 },
    { type: 'decor', sprite: 'brazier', x: 110, y: 227 },
    { type: 'decor', sprite: 'brazier', x: 420, y: 227 },
    { type: 'decor', sprite: 'runestone', x: 500, y: 227 },
  ],
  solution: [
    { nth: 0, x: 156, dir: 1, skill: 'blast', purpose: ['quota', 'target'] },
    { nth: 0, x: 254, dir: 1, skill: 'blast', purpose: ['quota', 'target'] },
  ],
};

export const U2: LevelDef = {
  id: 'u2', name: 'Stepping Stones', realm: 'muspelheim', music: 'muspelheim',
  intro: 'Two pools of fire, two boulders. Push the first one in — then send the second over the edge.',
  hints: [
    'A blast beside a boulder pushes it away from the rune.',
    'Watch where a falling boulder will land: Foresight traces it too.',
  ],
  width: 620, height: 300, seed: 72,
  wyrdlings: 12, quota: 8, target: 11, rate: 50,
  skills: { blast: 4 },
  ambient: [0.75, 0.58, 0.52],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 180, w: 214, h: 120, rough: 2 },
    { op: 'rect', mat: 'Earth', x: 0, y: 178, w: 214, h: 6, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 214, y: 210, w: 26, h: 90 },
    { op: 'rect', mat: 'Rock', x: 240, y: 180, w: 90, h: 120, rough: 1.5 },
    { op: 'rect', mat: 'Earth', x: 240, y: 178, w: 90, h: 6, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 330, y: 230, w: 22, h: 70, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 352, y: 262, w: 28, h: 38 },
    { op: 'rect', mat: 'Rock', x: 380, y: 230, w: 240, h: 70, rough: 2 },
    { op: 'rect', mat: 'Earth', x: 330, y: 228, w: 22, h: 6, rough: 1 },
    { op: 'rect', mat: 'Earth', x: 380, y: 228, w: 240, h: 6, rough: 1 },
    { op: 'ceiling', mat: 'Rock', pts: [[0, 44], [200, 30], [400, 50], [620, 36]], rough: 6, grain: 16 },
  ],
  entities: [
    { type: 'entrance', x: 60, y: 118 },
    { type: 'exit', x: 584, y: 228 },
    { type: 'lava', x: 214, y: 180, w: 26, h: 30 },
    { type: 'lava', x: 352, y: 230, w: 28, h: 32 },
    { type: 'boulder', x: 200, y: 165, r: 13 },
    { type: 'boulder', x: 316, y: 166, r: 12 },
    { type: 'decor', sprite: 'brazier', x: 120, y: 177 },
    { type: 'decor', sprite: 'brazier', x: 270, y: 177 },
    { type: 'decor', sprite: 'runestone', x: 470, y: 227 },
    { type: 'decor', sprite: 'brazier', x: 540, y: 227 },
  ],
  solution: [
    { nth: 0, x: 178, dir: 1, skill: 'blast', purpose: ['quota', 'target'] },
    { nth: 0, x: 296, dir: 1, skill: 'blast', purpose: ['quota', 'target'] },
  ],
};

export const U3: LevelDef = {
  id: 'u3', name: 'The Forge', realm: 'muspelheim', music: 'muspelheim',
  intro: "Surtr's forge still pounds. Hammers fall in rhythm and gas-flames roar — but every machine has a weakness.",
  hints: [
    'Hammers fall on a beat — watch them shake before they drop. A rune blast wrecks a hammer for good.',
    'The lever on the pillar cuts the gas to the flames.',
  ],
  width: 640, height: 300, seed: 73,
  wyrdlings: 12, quota: 8, target: 11, rate: 45,
  skills: { blast: 4, climber: 2, warden: 1 },
  ambient: [0.7, 0.55, 0.5],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 230, w: 640, h: 70, rough: 2 },
    { op: 'rect', mat: 'Iron', x: 0, y: 228, w: 640, h: 3 },
    { op: 'rect', mat: 'Rock', x: 330, y: 206, w: 12, h: 24 },
    { op: 'rect', mat: 'Rock', x: 0, y: 0, w: 640, h: 150, rough: 5, grain: 18 },
    { op: 'rect', mat: 'Air', x: 0, y: 150, w: 640, h: 78, back: true },
    { op: 'rect', mat: 'Iron', x: 150, y: 150, w: 280, h: 6 },
  ],
  entities: [
    { type: 'entrance', x: 60, y: 160 },
    { type: 'exit', x: 600, y: 227 },
    { type: 'crusher', x: 170, y: 200, drop: 27, period: 100, phase: 40 },
    { type: 'crusher', x: 250, y: 200, drop: 27, period: 100, phase: 90 },
    { type: 'lever', id: 'gas', x: 336, y: 205 },
    { type: 'firejet', x: 400, y: 227, h: 34, on: 1000, off: 0, links: ['gas'] },
    { type: 'firejet', x: 430, y: 227, h: 34, on: 1000, off: 0, links: ['gas'] },
    { type: 'firejet', x: 460, y: 227, h: 34, on: 1000, off: 0, links: ['gas'] },
    { type: 'decor', sprite: 'brazier', x: 100, y: 227 },
    { type: 'decor', sprite: 'banner', x: 210, y: 156 },
    { type: 'decor', sprite: 'banner', x: 520, y: 152 },
    { type: 'decor', sprite: 'brazier', x: 560, y: 227 },
    { type: 'light', x: 430, y: 200, r: 90, color: '#ff7a30', flicker: 0.3 },
  ],
  solution: [
    { nth: 0, x: 150, dir: 1, skill: 'blast', purpose: ['quota', 'target'] },
    { nth: 1, x: 236, dir: 1, skill: 'blast', purpose: ['quota', 'target'] },
    { nth: 1, skill: 'climber', purpose: ['quota', 'target'] },
    { nth: 3, x: 326, dir: 1, skill: 'blast', purpose: ['quota', 'target'] },
  ],
};

export const U4: LevelDef = {
  id: 'u4', name: "Surtr's Gate", realm: 'muspelheim', music: 'muspelheim',
  intro: 'A well with no bottom you would survive, a plate far below, a boulder at its lip — and beyond, a moat of fire.',
  hints: [
    'Something heavy on the plate at the bottom of the well raises a bridge across it.',
    'A blast beside a boulder pushes it away from the rune.',
  ],
  width: 600, height: 300, seed: 74,
  wyrdlings: 14, quota: 10, target: 13, rate: 45,
  skills: { blast: 4, warden: 1 },
  ambient: [0.72, 0.56, 0.5],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 178, w: 104, h: 122, rough: 1 },
    { op: 'rect', mat: 'Earth', x: 0, y: 176, w: 104, h: 4 },
    { op: 'rect', mat: 'Rock', x: 104, y: 262, w: 26, h: 38 },
    { op: 'rect', mat: 'Iron', x: 100, y: 184, w: 4, h: 78 },
    { op: 'rect', mat: 'Iron', x: 130, y: 184, w: 4, h: 78 },
    { op: 'ground', mat: 'Rock', pts: [[130, 178], [220, 178], [300, 230], [420, 230]], bottom: 300 },
    { op: 'rect', mat: 'Earth', x: 130, y: 176, w: 90, h: 4 },
    { op: 'rect', mat: 'Earth', x: 300, y: 228, w: 120, h: 4 },
    { op: 'rect', mat: 'Rock', x: 420, y: 262, w: 28, h: 38 },
    { op: 'rect', mat: 'Rock', x: 448, y: 230, w: 152, h: 70, rough: 2 },
    { op: 'rect', mat: 'Earth', x: 448, y: 228, w: 152, h: 4 },
    { op: 'ceiling', mat: 'Rock', pts: [[0, 40], [200, 30], [400, 48], [600, 36]], rough: 6, grain: 16 },
  ],
  entities: [
    { type: 'entrance', x: 34, y: 120 },
    { type: 'exit', x: 560, y: 227 },
    { type: 'plate', id: 'p', x: 110, y: 261 },
    { type: 'gate', id: 'bridge', x: 104, y: 178, w: 26, h: 5, orient: 'h', invert: true, speed: 1, links: ['p'] },
    { type: 'boulder', x: 90, y: 165, r: 11 },
    { type: 'boulder', x: 400, y: 215, r: 13 },
    { type: 'lava', x: 420, y: 230, w: 28, h: 32 },
    { type: 'decor', sprite: 'brazier', x: 40, y: 175 },
    { type: 'decor', sprite: 'banner', x: 117, y: 60 },
    { type: 'decor', sprite: 'brazier', x: 340, y: 227 },
    { type: 'decor', sprite: 'brazier', x: 520, y: 227 },
  ],
  solution: [
    { nth: 0, x: 70, dir: 1, skill: 'blast', purpose: ['quota', 'target'] },
    { nth: 0, x: 378, dir: 1, skill: 'blast', purpose: ['quota', 'target'] },
  ],
};

export const U5: LevelDef = {
  id: 'u5', name: "Surtr's Herald", realm: 'muspelheim', music: 'boss',
  intro: "Surtr's Herald bars the last gate with a sword of flame. High ground burns in the sweep; low ground drowns in magma.",
  hints: [
    'The flaming sword sweeps one side of the arena. Low ground is safe from it…',
    '…but when the magma rises, only the high ground survives. Read the warnings.',
    'Meteors leave craters — and later, boulders.',
  ],
  width: 640, height: 320, seed: 75,
  wyrdlings: 20, quota: 10, target: 13, rate: 30,
  skills: { climber: 3, leaper: 2, weaver: 3, warden: 2, glider: 2, blast: 2 },
  ambient: [0.7, 0.52, 0.48],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 258, w: 520, h: 62, rough: 2 },
    { op: 'rect', mat: 'Earth', x: 0, y: 256, w: 520, h: 4 },
    { op: 'rect', mat: 'Rock', x: 278, y: 238, w: 54, h: 20, rough: 0.5 },
    { op: 'rect', mat: 'Air', x: 396, y: 256, w: 48, h: 20 },
    { op: 'rect', mat: 'Iron', x: 520, y: 0, w: 16, h: 262 },
    { op: 'ground', mat: 'Rock', pts: [[536, 310], [600, 306], [640, 310]], rough: 3 },
    { op: 'ceiling', mat: 'Rock', pts: [[0, 40], [160, 30], [320, 50], [480, 34], [640, 46]], rough: 6, grain: 16 },
  ],
  entities: [
    { type: 'entrance', x: 80, y: 196 },
    { type: 'exit', x: 26, y: 255 },
    { type: 'seidr', x: 150, y: 255 },
    { type: 'seidr', x: 305, y: 237 },
    { type: 'seidr', x: 420, y: 275 },
    { type: 'decor', sprite: 'brazier', x: 60, y: 255 },
    { type: 'decor', sprite: 'brazier', x: 230, y: 255 },
    { type: 'decor', sprite: 'brazier', x: 480, y: 255 },
    { type: 'decor', sprite: 'banner', x: 200, y: 52 },
  ],
  boss: { kind: 'herald', x: 590, y: 310, hp: 5, delay: 160, arena: { x0: 12, x1: 512, floorY: 255 } },
  solution: [
    { nth: 0, skill: 'climber', purpose: ['quota', 'target', 'boss'] },
  ],
};

// boss arena grown to 640×360 (see pad.ts)
export const MUSPELHEIM: LevelDef[] = [U1, U2, U3, U4, padLevel(U5, 40)];
