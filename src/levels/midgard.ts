// Midgard — the tutorial realm. Each level teaches one calling, then the boss combines them.
import type { LevelDef } from '../sim/level';
import { padLevel } from './pad';

export const M1: LevelDef = {
  id: 'm1', name: 'First Threads', realm: 'midgard', music: 'midgard',
  intro: 'The Wyrdlings wander blind. Grant one the calling of the Digger and open a way below.',
  hints: [
    'Pick DIGGER from the bar, then tap a Wyrdling on the grassy ledge.',
    'Dotted threads show each fate. A red skull means doom — change it.',
    'Hold REWIND (or R) to unspool time. Mistakes cost seconds, not restarts.',
  ],
  width: 480, height: 270, seed: 11,
  wyrdlings: 10, quota: 6, target: 10, rate: 45,
  skills: { digger: 3 },
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 136, w: 304, h: 134, rough: 3, grain: 14 },
    { op: 'rect', mat: 'Air', x: 12, y: 142, w: 278, h: 28, rough: 3, grain: 9 },
    { op: 'rect', mat: 'Earth', x: 0, y: 170, w: 292, h: 100, rough: 1.5 },
    { op: 'rect', mat: 'Earth', x: 0, y: 110, w: 300, h: 30, rough: 2, grain: 12 },
    { op: 'ellipse', mat: 'Root', x: 70, y: 128, rx: 20, ry: 5, rough: 2, only: ['Earth'] },
    { op: 'ellipse', mat: 'Root', x: 248, y: 124, rx: 16, ry: 4, rough: 2, only: ['Earth'] },
    { op: 'ground', mat: 'Rock', pts: [[300, 236], [360, 228], [420, 238], [480, 230]], rough: 5, noBack: true },
    { op: 'ellipse', mat: 'Earth', x: 452, y: 150, rx: 40, ry: 12, rough: 4, noBack: true },
    { op: 'rect', mat: 'Earth', x: 0, y: 0, w: 14, h: 112, rough: 2 },
  ],
  entities: [
    { type: 'entrance', x: 40, y: 64 },
    { type: 'exit', x: 262, y: 169 },
    { type: 'water', x: 300, y: 222, w: 180, h: 48 },
    { type: 'spindle', x: 196, y: 132 },
    { type: 'decor', sprite: 'mushroom', x: 120, y: 109 },
    { type: 'decor', sprite: 'runestone', x: 286, y: 109 },
    { type: 'decor', sprite: 'mushroom', x: 60, y: 169 },
    { type: 'decor', sprite: 'torch', x: 240, y: 160 },
    { type: 'decor', sprite: 'torch', x: 40, y: 160 },
  ],
  solution: [
    { nth: 0, x: 196, skill: 'digger' },
  ],
};

export const M2: LevelDef = {
  id: 'm2', name: "The Weaver's Bridge", realm: 'midgard', music: 'midgard',
  intro: 'A gorge splits the meadow, and beyond it a rock step is too tall to walk up. Weave a golden bridge across the gorge, then a second to climb the step. Wyrdlings never walk past a busy Weaver.',
  hints: [
    'WEAVERS lay 12 rising planks. Start the gorge bridge at its very edge.',
    'The rock step needs a second bridge, begun a few steps back from the wall. Too close or too far and it fails.',
    'Watch the gold branch thread before you commit: it shows the new fate.',
  ],
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
    { type: 'decor', sprite: 'mushroom', x: 140, y: 150 },
    { type: 'decor', sprite: 'runestone', x: 330, y: 150 },
    { type: 'decor', sprite: 'banner', x: 470, y: 60 },
  ],
  solution: [
    { nth: 0, x: 196, skill: 'weaver' },
    { nth: 0, x: 270, dir: 1, skill: 'weaver' },
    { nth: 0, x: 352, dir: 1, skill: 'weaver' },
  ],
};

export const M3: LevelDef = {
  id: 'm3', name: 'Hold the Line', realm: 'midgard', music: 'midgard',
  intro: 'Rock bars the way and a cliff waits behind. One must stand firm while another breaks through.',
  hints: [
    'A WARDEN stands still and turns everyone back. It stays forever — choose the spot well.',
    'A BASHER tunnels straight ahead until the rock runs out.',
  ],
  width: 500, height: 270, seed: 33,
  wyrdlings: 12, quota: 9, target: 11, rate: 40,
  skills: { warden: 2, basher: 2 },
  ambient: [0.7, 0.68, 0.75],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 0, w: 500, h: 60, rough: 6, grain: 16 },
    { op: 'ground', mat: 'Earth', pts: [[62, 182], [150, 180], [240, 183], [300, 181]], rough: 2 },
    { op: 'rect', mat: 'Rock', x: 62, y: 205, w: 300, h: 65, rough: 4 },
    { op: 'rect', mat: 'Rock', x: 296, y: 40, w: 46, h: 150, rough: 3, grain: 10 },
    { op: 'rect', mat: 'Earth', x: 300, y: 181, w: 200, h: 89, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 488, y: 0, w: 12, h: 270 },
    { op: 'rect', mat: 'Air', x: 342, y: 60, w: 146, h: 121, back: true },
    { op: 'rect', mat: 'Air', x: 62, y: 60, w: 234, h: 121, back: true },
    { op: 'rect', mat: 'Rock', x: 0, y: 228, w: 62, h: 42, rough: 3, noBack: true },
  ],
  entities: [
    { type: 'entrance', x: 200, y: 100, dir: -1 },
    { type: 'exit', x: 440, y: 180 },
    { type: 'water', x: 0, y: 214, w: 62, h: 56 },
    { type: 'spindle', x: 70, y: 180 },
    { type: 'decor', sprite: 'torch', x: 280, y: 150 },
    { type: 'decor', sprite: 'torch', x: 120, y: 150 },
    { type: 'decor', sprite: 'torch', x: 420, y: 150 },
    { type: 'decor', sprite: 'banner', x: 380, y: 60 },
  ],
  solution: [
    { nth: 0, x: 66, dir: -1, skill: 'warden' },
    { nth: 1, x: 294, dir: 1, skill: 'basher' },
  ],
};

export const M4: LevelDef = {
  id: 'm4', name: 'Roots and Wings', realm: 'midgard', music: 'midgard',
  intro: 'A sealed gate. A lever atop the old root-pillar. One Wyrdling must climb — and then survive the fall.',
  hints: [
    'CLIMBERS scale walls. GLIDERS drift down safely. Both are permanent — one Wyrdling can be both.',
    'Updrafts lift gliders. Something glitters above the vent...',
  ],
  width: 520, height: 300, seed: 44,
  wyrdlings: 10, quota: 8, target: 10, rate: 50,
  skills: { climber: 2, glider: 2 },
  terrain: [
    { op: 'rect', mat: 'Earth', x: 0, y: 250, w: 520, h: 50, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 0, y: 92, w: 120, h: 160, rough: 2, grain: 9 },
    { op: 'rect', mat: 'Root', x: 30, y: 120, w: 60, h: 110, rough: 6, grain: 12, only: ['Rock'] },
    { op: 'rect', mat: 'Earth', x: 0, y: 86, w: 118, h: 8, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 340, y: 120, w: 180, h: 70, rough: 4, grain: 14 },
    { op: 'rect', mat: 'Iron', x: 324, y: 186, w: 20, h: 8 },
    { op: 'rect', mat: 'Rock', x: 508, y: 0, w: 12, h: 260 },
    { op: 'ceiling', mat: 'Rock', pts: [[0, 34], [60, 30], [130, 26], [170, 14], [200, 0]], rough: 4 },
  ],
  entities: [
    { type: 'entrance', x: 220, y: 196 },
    { type: 'exit', x: 470, y: 249 },
    { type: 'gate', id: 'g1', x: 328, y: 194, w: 12, h: 58, links: ['lever1'] },
    { type: 'lever', id: 'lever1', x: 60, y: 85 },
    { type: 'vent', x: 176, y: 249, w: 32, h: 150 },
    { type: 'spindle', x: 216, y: 116 },
    { type: 'decor', sprite: 'mushroom', x: 30, y: 85 },
    { type: 'decor', sprite: 'runestone', x: 100, y: 85 },
    { type: 'decor', sprite: 'banner', x: 300, y: 120 },
  ],
  solution: [
    { nth: 0, skill: 'climber' },
    { nth: 0, skill: 'glider' },
  ],
};

export const M5: LevelDef = {
  id: 'm5', name: 'The Gnawing Wyrm', realm: 'midgard', music: 'boss',
  intro: 'A wyrm gnaws at the roots of the world. Lead Wyrdlings onto the glowing Seiðr stones — each one wounds it.',
  hints: [
    'Only the GLOWING Seiðr stone strikes. When it fires, another lights up elsewhere.',
    'Red markers show where the Wyrm will strike. Foresight shows who it will hit.',
    'The Root Gate opens when the Wyrm falls.',
  ],
  width: 640, height: 300, seed: 55,
  wyrdlings: 20, quota: 10, target: 12, rate: 30,
  skills: { weaver: 4, warden: 3, digger: 2, climber: 2, glider: 2 },
  ambient: [0.75, 0.7, 0.8],
  terrain: [
    { op: 'rect', mat: 'Earth', x: 0, y: 240, w: 420, h: 60, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 0, y: 264, w: 420, h: 36, rough: 3 },
    { op: 'poly', mat: 'Rock', pts: [[278, 241], [300, 226], [340, 226], [362, 241]] },
    { op: 'rect', mat: 'Earth', x: 300, y: 224, w: 40, h: 4 },
    { op: 'rect', mat: 'Earth', x: 450, y: 216, w: 84, h: 84, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 450, y: 244, w: 84, h: 56, rough: 3 },
    { op: 'rect', mat: 'Iron', x: 520, y: 150, w: 14, h: 92 },
    { op: 'ground', mat: 'Rock', pts: [[534, 236], [580, 228], [640, 232]], rough: 4 },
    { op: 'ceiling', mat: 'Rock', pts: [[0, 40], [120, 30], [260, 46], [400, 34], [520, 60], [640, 40]], rough: 6, grain: 16 },
    { op: 'rect', mat: 'Root', x: 0, y: 30, w: 640, h: 16, rough: 5, only: ['Rock'] },
  ],
  entities: [
    { type: 'entrance', x: 70, y: 168 },
    { type: 'exit', x: 30, y: 239 },
    { type: 'seidr', x: 200, y: 239 },
    { type: 'seidr', x: 320, y: 223 },
    { type: 'seidr', x: 486, y: 215 },
    { type: 'decor', sprite: 'torch', x: 110, y: 230 },
    { type: 'decor', sprite: 'torch', x: 400, y: 230 },
    { type: 'decor', sprite: 'banner', x: 230, y: 50 },
    { type: 'decor', sprite: 'runestone', x: 508, y: 215 },
  ],
  boss: { kind: 'wyrm', x: 572, y: 132, hp: 6, delay: 150, arena: { x0: 12, x1: 512, floorY: 239 } },
  solution: [
    { nth: 0, x: 416, dir: 1, skill: 'weaver' },
  ],
};

// boss arena grown to 640×360 (see pad.ts)
export const MIDGARD: LevelDef[] = [M1, M2, M3, M4, padLevel(M5, 60)];
