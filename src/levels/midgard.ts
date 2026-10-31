// Midgard — the tutorial realm. Each level teaches one calling (its spindle asks for a second use of it, or
// of one learned earlier), Roots and Wings combines two, then the boss combines them all. Every scripted
// click has at least 10 ticks of slack either side (tests/helpers.ts).
import type { LevelDef } from '../sim/level';
import { padLevel } from './pad';

export const M1: LevelDef = {
  id: 'm1', name: 'First Threads', realm: 'midgard', music: 'midgard',
  intro: 'The Wyrdlings wander blind. Grant one the calling of the Digger and open a way below.',
  idea: 'Dig down through soft earth',
  hints: [
    // Foresight's skulls and Rewind are taught when they first matter (see Lesson in play.ts)
    'Pick DIGGER from the bar, then tap a Wyrdling on the grassy ledge. Anywhere above the cave will do.',
    'Something glitters beneath the cave floor…',
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
    // the grotto under the cave floor, open at its right end into the exit hall
    { op: 'rect', mat: 'Air', x: 40, y: 192, w: 196, h: 22, rough: 1.5, grain: 9 },
    // the exit hall: the cave floor ends in a safe drop
    { op: 'rect', mat: 'Air', x: 234, y: 146, w: 54, h: 68, rough: 1.5, grain: 9 },
    { op: 'ground', mat: 'Rock', pts: [[300, 236], [360, 228], [420, 238], [480, 230]], rough: 5, noBack: true },
    { op: 'ellipse', mat: 'Earth', x: 452, y: 150, rx: 40, ry: 12, rough: 4, noBack: true },
    { op: 'rect', mat: 'Earth', x: 0, y: 0, w: 14, h: 112, rough: 2 },
  ],
  entities: [
    { type: 'entrance', x: 40, y: 64 },
    { type: 'exit', x: 272, y: 213 },
    { type: 'water', x: 300, y: 222, w: 180, h: 48 },
    // off the way home: only a Digger in the cave reaches the grotto
    { type: 'spindle', x: 214, y: 212 },
    { type: 'decor', sprite: 'mushroom', x: 120, y: 109 },
    { type: 'decor', sprite: 'runestone', x: 286, y: 109 },
    { type: 'decor', sprite: 'mushroom', x: 60, y: 169 },
    { type: 'decor', sprite: 'torch', x: 200, y: 160 },
    { type: 'decor', sprite: 'torch', x: 40, y: 160 },
    { type: 'decor', sprite: 'torch', x: 252, y: 200 },
  ],
  solution: [
    // anywhere over the cave drops everyone in safely
    { nth: 0, x: 120, skill: 'digger', purpose: ['quota', 'target'] },
    // anywhere in the cave short of the spindle drops into the grotto, which leads on to the exit
    { nth: 0, x: 160, dir: 1, minY: 160, skill: 'digger', purpose: ['spindle'] },
  ],
};

export const M2: LevelDef = {
  id: 'm2', name: "The Weaver's Bridge", realm: 'midgard', music: 'midgard',
  intro: 'A gorge splits the meadow. Weave a golden bridge across it. Wyrdlings never walk past a busy Weaver.',
  idea: 'Weave a bridge across a gap',
  hints: [
    'WEAVERS lay 12 rising planks. Begin the bridge anywhere in the last few strides before the gorge.',
    'A bridge can climb as well as cross. Something glitters on the floating stone…',
  ],
  width: 480, height: 270, seed: 22,
  wyrdlings: 12, quota: 9, target: 12, rate: 40,
  skills: { weaver: 3 },
  terrain: [
    // the meadow dips into a hollow under the floating stone
    { op: 'ground', mat: 'Earth', pts: [[0, 150], [132, 150], [157, 175], [177, 175], [202, 150], [300, 150]], rough: 1.5 },
    { op: 'rect', mat: 'Rock', x: 0, y: 186, w: 300, h: 84, rough: 3, grain: 14 },
    { op: 'ground', mat: 'Earth', pts: [[310, 150], [480, 150]], rough: 1.5 },
    { op: 'rect', mat: 'Rock', x: 310, y: 186, w: 170, h: 84, rough: 3, grain: 14 },
    // a narrow, deep gorge: one bridge spans it from anywhere in a 30 px run-up
    { op: 'rect', mat: 'Air', x: 300, y: 140, w: 10, h: 130 },
    { op: 'rect', mat: 'Rock', x: 147, y: 140, w: 40, h: 7, rough: 1, noBack: true },
    { op: 'rect', mat: 'Earth', x: 0, y: 0, w: 12, h: 152, rough: 2 },
    { op: 'rect', mat: 'Earth', x: 468, y: 0, w: 12, h: 152, rough: 2 },
  ],
  entities: [
    { type: 'entrance', x: 40, y: 96 },
    { type: 'exit', x: 440, y: 149 },
    { type: 'water', x: 300, y: 236, w: 10, h: 34 },
    // on the floating stone: a bridge from the meadow climbs over its edge, the crowd walks under it
    { type: 'spindle', x: 179, y: 139 },
    { type: 'decor', sprite: 'mushroom', x: 90, y: 150 },
    { type: 'decor', sprite: 'runestone', x: 340, y: 150 },
    { type: 'decor', sprite: 'banner', x: 400, y: 60 },
  ],
  solution: [
    { nth: 0, x: 286, dir: 1, skill: 'weaver', purpose: ['quota', 'target'] },
    { nth: 3, x: 120, dir: 1, skill: 'weaver', purpose: ['spindle'] },
  ],
};

export const M3: LevelDef = {
  id: 'm3', name: 'Hold the Line', realm: 'midgard', music: 'midgard',
  intro: 'The Wyrdlings march towards a drop into black water, and the Root Gate lies behind them. One must stand firm and turn the others home.',
  idea: 'A Warden turns the crowd around',
  hints: [
    'A WARDEN stands still and turns everyone back. It stays forever, so it never reaches the gate.',
    'Anywhere short of the drop will do. But a Warden is heavy enough to hold a plate down…',
  ],
  width: 500, height: 270, seed: 33,
  wyrdlings: 12, quota: 9, target: 11, rate: 40,
  skills: { warden: 2 },
  ambient: [0.7, 0.68, 0.75],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 0, w: 500, h: 60, rough: 6, grain: 16 },
    { op: 'ground', mat: 'Earth', pts: [[62, 181], [500, 181]], rough: 1 },
    { op: 'rect', mat: 'Rock', x: 62, y: 210, w: 438, h: 60, rough: 4 },
    { op: 'rect', mat: 'Rock', x: 488, y: 0, w: 12, h: 270 },
    { op: 'rect', mat: 'Air', x: 62, y: 60, w: 426, h: 121, back: true },
    // the hollow under the trapdoor: walkers walk down into it and up the far side
    { op: 'poly', mat: 'Air', pts: [[300, 186], [310, 196], [330, 196], [340, 186], [340, 181], [300, 181]] },
    { op: 'rect', mat: 'Rock', x: 0, y: 228, w: 62, h: 42, rough: 3, noBack: true },
  ],
  entities: [
    { type: 'entrance', x: 230, y: 100, dir: -1 },
    { type: 'exit', x: 440, y: 180 },
    { type: 'water', x: 0, y: 214, w: 62, h: 56 },
    // a wide plate: a Warden anywhere on it holds the trapdoor open
    { type: 'plate', id: 'p', x: 78, y: 180, w: 30 },
    { type: 'gate', id: 'trap', x: 300, y: 181, w: 40, h: 5, orient: 'h', links: ['p'], speed: 1 },
    // in the hollow under the trapdoor: walkers pass over it unless the plate is held
    { type: 'spindle', x: 320, y: 195 },
    { type: 'decor', sprite: 'torch', x: 280, y: 150 },
    { type: 'decor', sprite: 'torch', x: 120, y: 150 },
    { type: 'decor', sprite: 'torch', x: 420, y: 150 },
    { type: 'decor', sprite: 'banner', x: 380, y: 60 },
  ],
  solution: [
    // a Warden anywhere between the drop and the entrance meets the quota and the target; on the plate it
    // also opens the trapdoor
    { nth: 0, x: 93, dir: -1, skill: 'warden', purpose: ['quota', 'target', 'spindle'] },
  ],
};

export const M3B: LevelDef = {
  id: 'm3b', name: 'Through the Stone', realm: 'midgard', music: 'midgard',
  intro: 'A hollow between two walls of stone. The Root Gate lies beyond the eastern one. Grant a Wyrdling the calling of the Basher and break through.',
  idea: 'A Basher tunnels straight ahead',
  hints: [
    'A BASHER tunnels straight ahead until the rock runs out. Grant it anywhere on the slope below a wall.',
    'The western wall sounds hollow…',
  ],
  width: 480, height: 270, seed: 36,
  wyrdlings: 10, quota: 7, target: 10, rate: 40,
  skills: { basher: 3 },
  ambient: [0.72, 0.68, 0.74],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 0, w: 480, h: 270, rough: 3, grain: 14 },
    { op: 'rect', mat: 'Earth', x: 60, y: 150, w: 290, h: 120, rough: 3, grain: 12, only: ['Rock'] },
    // the hollow: gentle slopes up to two sheer walls, so a Basher bites wherever it is granted on them
    { op: 'ceiling', mat: 'Air', pts: [[90, 175], [150, 190], [220, 190], [290, 167]], top: 64, rough: 1 },
    { op: 'ceiling', mat: 'Rock', pts: [[86, 96], [140, 74], [210, 90], [294, 76]], rough: 6, grain: 14 },
    // the spindle's chamber behind the western wall, its floor a step below any tunnel's
    { op: 'rect', mat: 'Air', x: 40, y: 160, w: 40, h: 26, rough: 1 },
    // the exit hall behind the eastern wall
    { op: 'rect', mat: 'Air', x: 340, y: 90, w: 128, h: 110, rough: 2 },
  ],
  entities: [
    { type: 'entrance', x: 200, y: 120, dir: -1 },
    { type: 'exit', x: 430, y: 199 },
    { type: 'spindle', x: 50, y: 185 },
    { type: 'decor', sprite: 'torch', x: 200, y: 160 },
    { type: 'decor', sprite: 'torch', x: 400, y: 170 },
    { type: 'decor', sprite: 'mushroom', x: 120, y: 182 },
  ],
  solution: [
    // the same Wyrdling both times, so moving one click moves the other's spot only along a slope
    { nth: 0, x: 120, dir: -1, skill: 'basher', purpose: ['spindle'] },
    { nth: 0, x: 262, dir: 1, skill: 'basher', purpose: ['quota', 'target'] },
  ],
};

export const M3C: LevelDef = {
  id: 'm3c', name: 'Climb, Little Thread', realm: 'midgard', music: 'midgard',
  intro: 'A sealed gate, and its lever up on the old root-pillar. Walls turn the Wyrdlings back. Unless one of them can climb.',
  idea: 'A Climber scales walls',
  hints: [
    'CLIMBERS scale walls, but not smooth gates or rune-iron. The calling is permanent: grant it any time.',
    'The pillar is low enough to drop from safely.',
    'The mound on the pillar is hollow. A Basher could find out what it hides.',
  ],
  width: 520, height: 300, seed: 41,
  wyrdlings: 10, quota: 8, target: 10, rate: 50,
  skills: { climber: 2, basher: 1 },
  terrain: [
    { op: 'rect', mat: 'Earth', x: 0, y: 250, w: 520, h: 50, rough: 1 },
    // the root-pillar: 54 px, a climb, and a safe drop back down
    { op: 'rect', mat: 'Rock', x: 0, y: 198, w: 120, h: 54, rough: 1.5, grain: 9 },
    { op: 'rect', mat: 'Root', x: 70, y: 206, w: 50, h: 40, rough: 5, grain: 10, only: ['Rock'] },
    // a mound on its top, its east side a long gentle slope (a Basher bites anywhere on it), rising to a
    // knoll thick enough that the spindle inside it reads as buried, not lying on the grass
    { op: 'ground', mat: 'Earth', pts: [[24, 198], [40, 182], [54, 168], [66, 166], [76, 174], [84, 184], [118, 196]], rough: 1, bottom: 200 },
    { op: 'rect', mat: 'Earth', x: 0, y: 194, w: 118, h: 6, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 340, y: 120, w: 180, h: 70, rough: 4, grain: 14 },
    { op: 'rect', mat: 'Iron', x: 324, y: 186, w: 20, h: 8 },
    { op: 'rect', mat: 'Rock', x: 508, y: 0, w: 12, h: 260 },
    { op: 'ceiling', mat: 'Rock', pts: [[0, 64], [60, 56], [130, 50], [200, 30], [260, 20], [340, 26], [520, 20]], rough: 4 },
  ],
  entities: [
    { type: 'entrance', x: 220, y: 196 },
    { type: 'exit', x: 470, y: 249 },
    { type: 'gate', id: 'g1', x: 328, y: 194, w: 12, h: 58, links: ['lever1'] },
    { type: 'lever', id: 'lever1', x: 14, y: 193 },
    // buried in the mound: walkers on top pass well above it, a Basher's tunnel runs through it
    { type: 'spindle', x: 63, y: 190 },
    { type: 'decor', sprite: 'mushroom', x: 100, y: 191 },
    { type: 'decor', sprite: 'runestone', x: 260, y: 249 },
    { type: 'decor', sprite: 'banner', x: 300, y: 120 },
  ],
  solution: [
    { nth: 0, skill: 'climber', purpose: ['quota', 'target'] },
    { nth: 0, x: 100, dir: -1, minY: 180, maxY: 200, skill: 'basher', purpose: ['spindle'] },
  ],
};

export const M3D: LevelDef = {
  id: 'm3d', name: 'Fall Like a Leaf', realm: 'midgard', music: 'midgard',
  intro: 'Warm air rises from a hollow in the cave floor. The lever for the Root Gate sits on a shelf high above it, where only the wind could carry a Wyrdling.',
  idea: 'A Glider falls softly and rides updrafts',
  hints: [
    'GLIDERS drift down safely from any height, and updrafts carry them up. The calling is permanent: grant it any time.',
    'Walkers drop into the hollow and climb out eastwards, but never back up its western wall.',
    'The shelf is hollow. A Digger up there could find out what it hides.',
  ],
  width: 480, height: 270, seed: 47,
  wyrdlings: 10, quota: 8, target: 10, rate: 45,
  skills: { glider: 2, digger: 1 },
  ambient: [0.74, 0.7, 0.78],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 0, w: 480, h: 270, rough: 3, grain: 14 },
    // the cave, and the hollow: a 40 px drop on its west side, a ramp out on its east side
    { op: 'ceiling', mat: 'Air', pts: [[12, 220], [250, 220], [250, 260], [290, 260], [340, 220], [468, 220]], top: 40, rough: 1 },
    { op: 'rect', mat: 'Earth', x: 12, y: 220, w: 456, h: 50, rough: 1, only: ['Rock'] },
    { op: 'ceiling', mat: 'Rock', pts: [[12, 70], [120, 52], [240, 64], [360, 48], [468, 60]], rough: 6, grain: 16 },
    // the gate's lintel
    { op: 'rect', mat: 'Rock', x: 380, y: 142, w: 48, h: 18, rough: 1 },
    { op: 'rect', mat: 'Iron', x: 396, y: 152, w: 16, h: 8 },
    // the high shelf, hollow inside, with a hole at the far end of the hollow
    { op: 'rect', mat: 'Rock', x: 330, y: 122, w: 120, h: 20, rough: 1, noBack: true },
    { op: 'rect', mat: 'Earth', x: 330, y: 120, w: 120, h: 4, noBack: true },
    { op: 'rect', mat: 'Air', x: 400, y: 128, w: 44, h: 12 },
    { op: 'rect', mat: 'Air', x: 438, y: 140, w: 6, h: 4 },
  ],
  entities: [
    { type: 'entrance', x: 120, y: 160 },
    { type: 'exit', x: 452, y: 219 },
    { type: 'gate', id: 'g', x: 400, y: 160, w: 8, h: 60, links: ['lv'] },
    { type: 'lever', id: 'lv', x: 396, y: 119 },
    // the updraft: from the bottom of the hollow up past the shelf
    { type: 'vent', x: 250, y: 259, w: 130, h: 149 },
    { type: 'spindle', x: 432, y: 139 },
    { type: 'decor', sprite: 'mushroom', x: 180, y: 219 },
    { type: 'decor', sprite: 'torch', x: 200, y: 190 },
    { type: 'decor', sprite: 'torch', x: 60, y: 190 },
  ],
  solution: [
    { nth: 0, skill: 'glider', purpose: ['quota', 'target'] },
    // anywhere over the hollow: the Digger drops in, walks on past the spindle and out of the hole
    { nth: 0, x: 422, dir: 1, maxY: 125, skill: 'digger', purpose: ['spindle'] },
  ],
};

export const M4: LevelDef = {
  id: 'm4', name: 'Roots and Wings', realm: 'midgard', music: 'midgard',
  intro: 'A sealed gate. A lever atop the old root-pillar, far too high to drop from. One Wyrdling must climb, and then survive the fall.',
  idea: 'One Wyrdling can be both Climber and Glider',
  hints: [
    'CLIMBERS scale walls. GLIDERS drift down safely. Both are permanent: one Wyrdling can be both.',
    'Warm air rises where the Wyrdlings drop in. A Glider caught in it as it falls rides it up...',
  ],
  width: 520, height: 300, seed: 44,
  wyrdlings: 10, quota: 8, target: 10, rate: 50,
  skills: { climber: 2, glider: 2 },
  terrain: [
    { op: 'rect', mat: 'Earth', x: 0, y: 250, w: 520, h: 50, rough: 1 },
    // the root-pillar: 100 px, a fatal drop for anyone without wings
    { op: 'rect', mat: 'Rock', x: 0, y: 150, w: 120, h: 102, rough: 2, grain: 9 },
    { op: 'rect', mat: 'Root', x: 30, y: 168, w: 60, h: 70, rough: 6, grain: 12, only: ['Rock'] },
    { op: 'rect', mat: 'Earth', x: 0, y: 144, w: 118, h: 8, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 340, y: 120, w: 180, h: 70, rough: 4, grain: 14 },
    { op: 'rect', mat: 'Iron', x: 324, y: 186, w: 20, h: 8 },
    { op: 'rect', mat: 'Rock', x: 508, y: 0, w: 12, h: 260 },
    { op: 'ceiling', mat: 'Rock', pts: [[0, 50], [60, 44], [130, 36], [170, 20], [200, 0]], rough: 4 },
  ],
  entities: [
    { type: 'entrance', x: 240, y: 170 },
    { type: 'exit', x: 470, y: 249 },
    { type: 'gate', id: 'g1', x: 328, y: 194, w: 12, h: 58, links: ['lever1'] },
    { type: 'lever', id: 'lever1', x: 60, y: 143 },
    // under the entrance, past where a Glider off the pillar lands: only a Glider granted as it drops in rides it
    { type: 'vent', x: 220, y: 249, w: 84, h: 150, force: 0.8 },
    { type: 'spindle', x: 292, y: 104 },
    { type: 'decor', sprite: 'mushroom', x: 30, y: 143 },
    { type: 'decor', sprite: 'runestone', x: 100, y: 143 },
    { type: 'decor', sprite: 'banner', x: 300, y: 120 },
  ],
  solution: [
    { nth: 0, skill: 'climber', purpose: ['quota', 'target'] },
    // any time before it walks off the pillar top
    { nth: 0, state: 'climb', skill: 'glider', purpose: ['target'] },
    // as #1 drops in (it appears at tick 91): granted within its first half second of falling, it rides up
    { nth: 1, t: 95, skill: 'glider', purpose: ['spindle'] },
  ],
};

export const M5: LevelDef = {
  id: 'm5', name: 'The Gnawing Wyrm', realm: 'midgard', music: 'boss',
  intro: 'A wyrm gnaws at the roots of the world. Lead Wyrdlings onto the glowing Seiðr stones — each one wounds it.',
  idea: 'Weave over the hole the Wyrm gnaws, and climb to the stone on its perch.',
  hints: [
    'The stones light in a fixed order. NEXT marks the one after the glowing stone.',
    'The Wyrm gnaws through the root crust first: weave a bridge over the hole before the crowd gets there.',
    'The stone on the Wyrm’s perch needs a Climber. The Root Gate beside it opens when the Wyrm falls.',
  ],
  width: 640, height: 300, seed: 55,
  wyrdlings: 20, quota: 10, target: 12, rate: 30,
  skills: { weaver: 3, climber: 2, warden: 2, digger: 2 },
  ambient: [0.75, 0.7, 0.8],
  terrain: [
    { op: 'rect', mat: 'Earth', x: 0, y: 240, w: 520, h: 60, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 0, y: 264, w: 520, h: 36, rough: 3 },
    // the Wyrm's shaft under a thin root crust: its burrow breaks it open
    { op: 'rect', mat: 'Air', x: 364, y: 244, w: 24, h: 56 },
    { op: 'rect', mat: 'Root', x: 360, y: 240, w: 32, h: 4 },
    // a rune-iron lip: whoever crosses stays in the pen by the Root Gate
    { op: 'rect', mat: 'Iron', x: 388, y: 226, w: 12, h: 16 },
    // the Wyrm's perch: a stone on top that only a Climber reaches
    { op: 'rect', mat: 'Rock', x: 474, y: 208, w: 48, h: 34, rough: 1 },
    { op: 'rect', mat: 'Iron', x: 520, y: 150, w: 14, h: 92 },
    { op: 'ground', mat: 'Rock', pts: [[534, 236], [580, 228], [640, 232]], rough: 4 },
    { op: 'ceiling', mat: 'Rock', pts: [[0, 40], [120, 30], [260, 46], [400, 34], [520, 60], [640, 40]], rough: 6, grain: 16 },
    { op: 'rect', mat: 'Root', x: 0, y: 30, w: 640, h: 16, rough: 5, only: ['Rock'] },
  ],
  entities: [
    { type: 'entrance', x: 110, y: 168 },
    { type: 'exit', x: 446, y: 239 },
    { type: 'seidr', x: 220, y: 239 },
    { type: 'seidr', x: 420, y: 239 },
    { type: 'seidr', x: 500, y: 207 },
    { type: 'decor', sprite: 'torch', x: 60, y: 230 },
    { type: 'decor', sprite: 'torch', x: 300, y: 230 },
    { type: 'decor', sprite: 'banner', x: 230, y: 50 },
  ],
  boss: {
    kind: 'wyrm', x: 572, y: 132, hp: 5, delay: 150, arena: { x0: 12, x1: 512, floorY: 239 },
    // the floor stone (free once), then the pen stone across the hole and the perch stone, twice
    stones: [0, 1, 2, 1, 2],
    // its first burrow breaks the root crust before anyone gets there; the tail lashes the pen and the bridge
    aim: { burrow: [376, 200], venom: [270, 440], lash: [380] },
  },
  solution: [
    // the leader bridges the hole from its near edge; the crowd waits behind it, then crosses into the pen
    { nth: 0, x: 358, dir: 1, skill: 'weaver', purpose: ['quota', 'target', 'boss'] },
    // whoever follows it into the pen climbs the perch whenever its stone is lit
    { nth: 1, skill: 'climber', purpose: ['boss'] },
  ],
};

// boss arena grown to 640×360 (see pad.ts)
export const MIDGARD: LevelDef[] = [M1, M2, M3, M3B, M3C, M3D, M4, padLevel(M5, 60)];
