// Three levels as they shipped before the wave-2 re-authoring (P2-precision-slack), kept as fixtures: the loop
// detector tests in settle.test.ts were built on stalemates these exact layouts produce (a hopper whose pacers
// repeat apart long before the whole run does, a pit of pacers, a misplaced second bridge). Decor, hints and
// spindles' story text are left out; nothing here is shipped.
import type { LevelDef } from '../src/sim/level';

export const LEGACY_M2: LevelDef = {
  id: 'm2', name: "The Weaver's Bridge (wave 1)", realm: 'midgard', intro: '',
  width: 560, height: 280, seed: 22,
  wyrdlings: 12, quota: 9, target: 12, rate: 40,
  skills: { weaver: 3 },
  terrain: [
    { op: 'ground', mat: 'Earth', pts: [[0, 150], [80, 148], [150, 152], [200, 150]], rough: 2 },
    { op: 'rect', mat: 'Rock', x: 0, y: 190, w: 196, h: 90, rough: 4, grain: 14 },
    { op: 'ground', mat: 'Earth', pts: [[234, 152], [300, 150], [382, 150]], rough: 2 },
    { op: 'rect', mat: 'Rock', x: 238, y: 192, w: 322, h: 88, rough: 4, grain: 14 },
    { op: 'rect', mat: 'Rock', x: 380, y: 132, w: 180, h: 70, rough: 2, grain: 8 },
    { op: 'rect', mat: 'Earth', x: 380, y: 132, w: 180, h: 10, rough: 1 },
    { op: 'rect', mat: 'Earth', x: 0, y: 0, w: 12, h: 152, rough: 2 },
    { op: 'rect', mat: 'Earth', x: 548, y: 0, w: 12, h: 134, rough: 2 },
  ],
  entities: [
    { type: 'entrance', x: 50, y: 96 },
    { type: 'exit', x: 520, y: 131 },
    { type: 'water', x: 196, y: 250, w: 42, h: 30 },
    { type: 'spindle', x: 300, y: 126 },
  ],
  solution: [
    { nth: 0, x: 196, skill: 'weaver', purpose: ['quota', 'target', 'spindle'] },
    { nth: 0, x: 270, dir: 1, skill: 'weaver', purpose: ['spindle'] },
    { nth: 0, x: 352, dir: 1, skill: 'weaver', purpose: ['quota', 'target'] },
  ],
};

export const LEGACY_N3: LevelDef = {
  id: 'n3', name: 'Avalanche Pass (wave 1)', realm: 'niflheim', intro: '',
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
  ],
  solution: [
    { nth: 0, x: 101, dir: -1, skill: 'warden', purpose: ['quota', 'target', 'spindle'] },
    { nth: 1, x: 246, dir: 1, skill: 'leaper', purpose: ['spindle'] },
  ],
};

export const LEGACY_N4: LevelDef = {
  id: 'n4', name: 'Rime Gate (wave 1)', realm: 'niflheim', intro: '',
  width: 620, height: 320, seed: 64,
  wyrdlings: 14, quota: 10, target: 13, rate: 40,
  skills: { leaper: 2, warden: 2, miner: 2 },
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
  ],
  solution: [
    { nth: 0, x: 168, dir: 1, skill: 'leaper', purpose: ['quota', 'target', 'spindle'] },
    { nth: 0, x: 204, minY: 203, maxY: 212, skill: 'warden', purpose: ['quota', 'target', 'spindle'] },
    { nth: 1, x: 430, dir: 1, skill: 'miner', purpose: ['quota', 'target', 'spindle'] },
  ],
};
