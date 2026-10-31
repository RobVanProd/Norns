// Muspelheim — realm of fire: rune blasts, boulders that become stepping stones, cracked floors, flames that
// burn in turn and hot air that lifts gliders. Every scripted click has at least 6 ticks of slack either side
// (tests/helpers.ts).
import type { LevelDef } from '../sim/level';
import { padLevel } from './pad';

export const U1: LevelDef = {
  id: 'u1', name: 'Ember Road', realm: 'muspelheim', music: 'muspelheim',
  intro: 'Basalt walls and a river of fire, and a boulder in the way. Runes can send it rolling where you need it.',
  idea: 'A Rune Blast flings a boulder',
  hints: [
    'RUNE BLAST: the Wyrdling plants a rune and walks on. Three heartbeats later — boom.',
    'Blasts fling boulders away from the rune. A boulder rolled into lava cools into a stepping stone.',
    'Stand clear: blasts fling Wyrdlings too. And the western wall sounds hollow…',
  ],
  width: 600, height: 300, seed: 71,
  wyrdlings: 10, quota: 7, target: 9, rate: 50,
  skills: { blast: 3, basher: 1 },
  ambient: [0.78, 0.6, 0.55],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 230, w: 300, h: 70, rough: 2 },
    // a gentle slope up to the western wall (a Basher bites anywhere on it); a chamber behind the wall
    { op: 'ground', mat: 'Earth', pts: [[90, 213], [152, 228]], rough: 1, bottom: 240 },
    { op: 'rect', mat: 'Earth', x: 150, y: 228, w: 150, h: 6, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 0, y: 30, w: 90, h: 270, rough: 2 },
    { op: 'rect', mat: 'Air', x: 40, y: 198, w: 40, h: 26, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 326, y: 230, w: 274, h: 70, rough: 2 },
    { op: 'rect', mat: 'Earth', x: 326, y: 228, w: 274, h: 6, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 300, y: 262, w: 26, h: 38 },
    { op: 'ceiling', mat: 'Rock', pts: [[0, 40], [140, 30], [300, 52], [450, 36], [600, 46]], rough: 6, grain: 16 },
  ],
  entities: [
    { type: 'entrance', x: 200, y: 168 },
    { type: 'exit', x: 556, y: 228 },
    { type: 'lava', x: 300, y: 230, w: 26, h: 32 },
    { type: 'boulder', x: 276, y: 215, r: 13 },
    { type: 'spindle', x: 50, y: 223 },
    { type: 'decor', sprite: 'brazier', x: 170, y: 227 },
    { type: 'decor', sprite: 'brazier', x: 420, y: 227 },
    { type: 'decor', sprite: 'runestone', x: 500, y: 227 },
  ],
  solution: [
    // anywhere in the last 30 px before the boulder
    { nth: 0, x: 254, dir: 1, skill: 'blast', purpose: ['quota', 'target'] },
    { nth: 0, x: 120, dir: -1, skill: 'basher', purpose: ['spindle'] },
  ],
};

export const U2: LevelDef = {
  id: 'u2', name: 'The Cracked Floor', realm: 'muspelheim', music: 'muspelheim',
  intro: 'The floor of the hollow is cracked, and fire runs in the dark below it. Too thin to trust, too thick to leave whole.',
  idea: 'Weight breaks a cracked floor',
  hints: [
    'Cracked floors give way under weight, a boulder\'s soonest. What falls through lands in the fire below.',
    'A blast beside a boulder pushes it away from the rune.',
    'A bridge can climb as well as cross. Something glitters on the floating stone…',
  ],
  width: 620, height: 300, seed: 72,
  wyrdlings: 12, quota: 8, target: 11, rate: 50,
  skills: { blast: 3, weaver: 2 },
  ambient: [0.75, 0.58, 0.52],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 172, w: 620, h: 128, rough: 2 },
    { op: 'rect', mat: 'Earth', x: 12, y: 170, w: 350, h: 6, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 0, y: 30, w: 12, h: 150, rough: 1 },
    // the walk dips under a floating stone (the spindle's), far from where runes go off
    { op: 'poly', mat: 'Air', pts: [[72, 170], [97, 195], [117, 195], [142, 170]] },
    { op: 'rect', mat: 'Rock', x: 87, y: 160, w: 40, h: 7, rough: 1, noBack: true },
    // the cracked hollow: wide enough at the bottom for the boulder to rest on the crack
    { op: 'poly', mat: 'Air', pts: [[278, 170], [292, 190], [328, 190], [342, 170]] },
    // below the cracked floor: a shaft into the fire, and the low road to the gate
    { op: 'rect', mat: 'Air', x: 294, y: 194, w: 32, h: 10 },
    { op: 'rect', mat: 'Air', x: 294, y: 202, w: 306, h: 38, rough: 1.5 },
    { op: 'rect', mat: 'Air', x: 296, y: 238, w: 28, h: 24 },
    { op: 'rect', mat: 'Rock', x: 360, y: 30, w: 260, h: 142, rough: 3, grain: 14 },
    { op: 'ceiling', mat: 'Rock', pts: [[0, 44], [200, 30], [400, 50], [620, 36]], rough: 6, grain: 16 },
  ],
  entities: [
    { type: 'entrance', x: 30, y: 110 },
    { type: 'exit', x: 570, y: 239 },
    { type: 'boulder', x: 256, y: 158, r: 12 },
    { type: 'brittle', x: 292, y: 190, w: 36, h: 4 },
    { type: 'lava', x: 296, y: 240, w: 28, h: 22 },
    { type: 'spindle', x: 119, y: 159 },
    { type: 'decor', sprite: 'brazier', x: 200, y: 169 },
    { type: 'decor', sprite: 'brazier', x: 380, y: 239 },
    { type: 'decor', sprite: 'runestone', x: 470, y: 239 },
    { type: 'decor', sprite: 'brazier', x: 540, y: 239 },
  ],
  solution: [
    // anywhere in the last 30 px before the boulder: it rolls into the hollow, breaks through and cools in the fire
    { nth: 0, x: 228, dir: 1, skill: 'blast', purpose: ['quota', 'target'] },
    { nth: 3, x: 60, dir: 1, skill: 'weaver', purpose: ['spindle'] },
  ],
};

export const U3: LevelDef = {
  id: 'u3', name: 'The Forge', realm: 'muspelheim', music: 'muspelheim',
  intro: "Surtr's forge still burns. Three gas-flames roar in turn, each lit as the last dies down, and the Root Gate lies under the anvil floor.",
  idea: 'Flames that burn in rhythm',
  hints: [
    'The flames take turns: no walker gets past all three. The lever on the forge wall cuts their gas.',
    'The floor past the flames is a thin slab. Runes carve rock.',
    'The forge wall sounds hollow at its foot…',
  ],
  width: 640, height: 300, seed: 73,
  wyrdlings: 12, quota: 8, target: 11, rate: 45,
  skills: { blast: 2, climber: 1, basher: 1 },
  ambient: [0.7, 0.55, 0.5],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 230, w: 640, h: 70, rough: 2 },
    { op: 'rect', mat: 'Iron', x: 142, y: 228, w: 360, h: 3 },
    { op: 'rect', mat: 'Rock', x: 502, y: 228, w: 138, h: 4 },
    // the gate's hall under the slab: a rune anywhere on the slab opens a way down
    { op: 'rect', mat: 'Air', x: 500, y: 232, w: 128, h: 38, rough: 1 },
    { op: 'rect', mat: 'Rock', x: 628, y: 110, w: 12, h: 190 },
    { op: 'rect', mat: 'Rock', x: 0, y: 0, w: 640, h: 150, rough: 5, grain: 18 },
    { op: 'rect', mat: 'Air', x: 0, y: 150, w: 640, h: 78, back: true },
    { op: 'rect', mat: 'Air', x: 0, y: 110, w: 200, h: 50 },
    { op: 'ceiling', mat: 'Rock', pts: [[0, 112], [120, 118], [190, 150], [640, 150]], rough: 4, grain: 14 },
    { op: 'rect', mat: 'Iron', x: 200, y: 150, w: 280, h: 6 },
    // the forge wall: a slope up to a 53 px face (climbable, and a Basher bites anywhere on the slope), its
    // top a safe drop, a hollow at its foot
    { op: 'rect', mat: 'Rock', x: 0, y: 160, w: 80, h: 70, rough: 1.5 },
    { op: 'ground', mat: 'Earth', pts: [[80, 213], [142, 228]], rough: 1, bottom: 240 },
    { op: 'rect', mat: 'Air', x: 30, y: 198, w: 40, h: 26, rough: 1 },
  ],
  entities: [
    { type: 'entrance', x: 230, y: 160, dir: -1 },
    { type: 'exit', x: 600, y: 269 },
    { type: 'lever', id: 'gas', x: 40, y: 159 },
    { type: 'firejet', x: 420, y: 227, h: 34, on: 40, off: 50, links: ['gas'] },
    { type: 'firejet', x: 450, y: 227, h: 34, on: 40, off: 50, phase: 60, links: ['gas'] },
    { type: 'firejet', x: 480, y: 227, h: 34, on: 40, off: 50, phase: 30, links: ['gas'] },
    { type: 'spindle', x: 40, y: 223 },
    { type: 'decor', sprite: 'brazier', x: 170, y: 227 },
    { type: 'decor', sprite: 'banner', x: 250, y: 156 },
    { type: 'decor', sprite: 'banner', x: 520, y: 152 },
    { type: 'decor', sprite: 'brazier', x: 560, y: 227 },
    { type: 'light', x: 450, y: 200, r: 90, color: '#ff7a30', flicker: 0.3 },
  ],
  solution: [
    { nth: 0, skill: 'climber', purpose: ['quota', 'target'] },
    { nth: 1, x: 112, dir: -1, skill: 'basher', purpose: ['spindle'] },
    { nth: 0, x: 530, dir: 1, skill: 'blast', purpose: ['quota', 'target'] },
  ],
};

export const U4: LevelDef = {
  id: 'u4', name: "Surtr's Gate", realm: 'muspelheim', music: 'muspelheim',
  intro: "Surtr's Gate: a boulder at the edge of a fire-pool, a pit breathing hot air, and the gate's lever on a ledge that only the wind could reach.",
  idea: 'Clear the road, then ride the heat',
  hints: [
    'A blast beside a boulder pushes it away from the rune. A boulder rolled into lava cools into a stepping stone.',
    'Hot air rises from the pit. GLIDERS ride it; walkers drop in and climb out the far side.',
    'The pit wall sounds hollow just below its lip. A Miner could tunnel down to it…',
  ],
  width: 620, height: 300, seed: 74,
  wyrdlings: 14, quota: 10, target: 13, rate: 45,
  skills: { blast: 2, glider: 1, miner: 1 },
  ambient: [0.72, 0.56, 0.5],
  terrain: [
    { op: 'rect', mat: 'Rock', x: 0, y: 0, w: 620, h: 300, rough: 3, grain: 14 },
    // the cave; the floor is laid separately so the boulder rests still on it
    { op: 'rect', mat: 'Air', x: 12, y: 40, w: 596, h: 190 },
    { op: 'rect', mat: 'Earth', x: 12, y: 228, w: 214, h: 6, rough: 1 },
    { op: 'rect', mat: 'Earth', x: 252, y: 228, w: 68, h: 6, rough: 1 },
    { op: 'rect', mat: 'Air', x: 226, y: 228, w: 26, h: 34 },
    // the pit: a 50 px drop on its west side, a ramp out to the east
    { op: 'poly', mat: 'Air', pts: [[320, 229], [320, 280], [360, 280], [420, 229]] },
    { op: 'rect', mat: 'Earth', x: 420, y: 228, w: 188, h: 6, rough: 1 },
    // a pocket in the pit wall below its lip (the spindle's): a Miner's tunnel from the floor breaks into it
    { op: 'rect', mat: 'Air', x: 296, y: 238, w: 24, h: 14 },
    // the lever's ledge, high over the pit's east side
    { op: 'rect', mat: 'Rock', x: 400, y: 130, w: 120, h: 18, rough: 1, noBack: true },
    { op: 'rect', mat: 'Rock', x: 534, y: 40, w: 20, h: 130, rough: 2 },
    { op: 'ceiling', mat: 'Rock', pts: [[12, 60], [200, 48], [400, 64], [608, 52]], rough: 6, grain: 16 },
  ],
  entities: [
    { type: 'entrance', x: 100, y: 150 },
    { type: 'exit', x: 584, y: 227 },
    { type: 'boulder', x: 200, y: 215, r: 13 },
    { type: 'lava', x: 226, y: 230, w: 26, h: 32 },
    { type: 'vent', x: 320, y: 279, w: 130, h: 160, force: 0.5 },
    { type: 'lever', id: 'lv', x: 470, y: 129 },
    { type: 'gate', id: 'g', x: 538, y: 170, w: 12, h: 58, links: ['lv'] },
    // just inside the pocket's mouth: a Miner breaking in anywhere walks past it on the way out, and walkers
    // dropping over the lip pass 7 px from it
    { type: 'spindle', x: 313, y: 251 },
    { type: 'decor', sprite: 'brazier', x: 60, y: 227 },
    { type: 'decor', sprite: 'banner', x: 300, y: 70 },
    { type: 'decor', sprite: 'brazier', x: 440, y: 227 },
    { type: 'decor', sprite: 'brazier', x: 600, y: 227 },
  ],
  solution: [
    { nth: 0, skill: 'glider', purpose: ['quota', 'target'] },
    // anywhere in the last 30 px before the boulder
    { nth: 0, x: 178, dir: 1, skill: 'blast', purpose: ['quota', 'target'] },
    { nth: 3, x: 288, dir: 1, skill: 'miner', purpose: ['spindle'] },
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
