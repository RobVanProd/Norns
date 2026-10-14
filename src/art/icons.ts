// 16×16 UI icons, meant for 3–4× display with image-rendering: pixelated on dark panels.
// Skill icons are distinct by silhouette and colour family: earth-moving warm (digger copper,
// basher ember-orange, miner amber, weaver honey), movement cool (climber blue, glider green,
// leaper cyan), Warden gold, Blast red. Controls are parchment-white. Selective outlines throughout.

import { Px, hex, aOf, type Color } from './px';
import {
  HOOD, FACE, CLOAK, GOLD, WOOD, IRON, RUNE, FIRE, LEAF, ROOT, TEAL, BONE, EYE, EYE_HI, BLUSH, CAVITY, STONE,
  UI_GREY, UI_BLUE, UI_CYAN, UI_GREEN, UI_AMBER, UI_ORANGE, selout, shadeMask, stamp, glow, sparkle, registerOutline, type Key,
} from './palette';

const ON = 0xffffffff >>> 0;
const N = 16;

/** shaded mask shape */
function shape(p: Px, ramp: Color[], base: number, fn: (m: Px) => void): Px {
  const m = new Px(N, N);
  fn(m);
  shadeMask(m, ramp, p, base);
  return m;
}

/** thick line as a mask stroke */
function stroke(m: Px, x0: number, y0: number, x1: number, y1: number, w: number) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len * 3));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    for (let yy = Math.floor(y - w); yy <= Math.ceil(y + w); yy++) for (let xx = Math.floor(x - w); xx <= Math.ceil(x + w); xx++) {
      if ((xx + 0.5 - x - 0.5) ** 2 + (yy + 0.5 - y - 0.5) ** 2 <= w * w + 0.1) m.set(xx, yy, ON);
    }
  }
}

function icon(fn: (p: Px) => void, post?: (p: Px) => void): HTMLCanvasElement {
  const p = new Px(N, N);
  fn(p);
  selout(p);
  post?.(p);
  return p.toCanvas();
}

const COPPER = [hex('#3a1a0c'), hex('#6e3416'), hex('#a8561e'), hex('#d8823a'), hex('#f4b46a'), hex('#ffe2b0')];
const HONEY = [hex('#3e2008'), hex('#7a4210'), hex('#b8701c'), hex('#e6a032'), hex('#ffd060'), hex('#fff0b0')];
registerOutline(COPPER, '#4a200c', '#2a0e06');
registerOutline(HONEY, '#5a2c0a', '#2e1406');
registerOutline(UI_GREY, '#2a2c40', '#0e0f1a');
registerOutline(UI_BLUE, '#14285a', '#08122e');
registerOutline(UI_CYAN, '#0e4050', '#06202a');
registerOutline(UI_GREEN, '#123a22', '#081c10');
registerOutline(UI_AMBER, '#4a1e08', '#260e04');
registerOutline(UI_ORANGE, '#4a1408', '#260804');

// --- Skills ------------------------------------------------------------------------------------

function digger(p: Px) {
  // a spade cutting straight down through the ground line, clods flying up either side
  const EARTHI = [hex('#2a140c'), hex('#4e2a16'), hex('#7a4824'), hex('#a8703a'), hex('#d09a5a'), hex('#f0c890')];
  registerOutline(EARTHI, '#3a1c0c', '#1c0c06');
  shape(p, EARTHI, 3, (m) => { m.rect(1, 12, 4, 2, ON); m.rect(11, 12, 4, 2, ON); });
  shape(p, WOOD, 3, (m) => { m.rect(6, 0, 4, 1, ON); m.rect(7, 1, 2, 6, ON); });
  shape(p, COPPER, 3, (m) => { m.rect(5, 6, 6, 1, ON); m.poly([[4.5, 7], [11.5, 7], [11.5, 10], [8, 14.5], [4.5, 10]], ON); });
  p.set(5, 8, COPPER[5]); p.set(5, 9, COPPER[4]); p.set(6, 8, COPPER[4]); p.set(8, 8, COPPER[2]); p.set(8, 9, COPPER[2]); p.set(8, 10, COPPER[2]);
  for (const [x, y] of [[2, 9], [1, 5], [3, 3], [13, 9], [14, 5], [12, 3]]) { p.set(x, y, EARTHI[4]); p.set(x, y + 1, EARTHI[2]); }
}

function basher(p: Px) {
  // glowing fist punching right with speed lines
  const EMBER = [hex('#3a0c06'), hex('#7c2008'), hex('#c84612'), hex('#f27a22'), hex('#ffb44a'), hex('#fff0a0')];
  registerOutline(EMBER, '#4a1006', '#280604');
  shape(p, EMBER, 3, (m) => { m.rect(5, 4, 7, 7, ON); m.rect(12, 5, 1, 5, ON); m.rect(4, 6, 1, 4, ON); m.rect(6, 11, 4, 2, ON); });
  // finger creases & knuckle highlights
  for (const y of [6, 8]) for (let x = 7; x <= 11; x++) p.set(x, y, EMBER[2]);
  for (const y of [5, 7, 9]) p.set(12, y, EMBER[5]);
  p.set(6, 5, EMBER[5]); p.set(8, 10, EMBER[1]); p.set(9, 10, EMBER[1]);
  // thumb
  p.set(6, 9, EMBER[4]); p.set(7, 9, EMBER[4]); p.set(8, 9, EMBER[3]);
  // speed lines
  for (const [x0, y] of [[0, 5], [1, 8], [0, 11]]) for (let x = x0; x < x0 + 3; x++) p.set(x, y, x === x0 ? EMBER[2] : EMBER[3]);
}

function miner(p: Px) {
  // pickaxe swung diagonally down-forward
  shape(p, WOOD, 3, (m) => stroke(m, 3, 13, 9.5, 5.5, 0.75));
  shape(p, UI_AMBER, 3, (m) => {
    stroke(m, 4, 3, 9, 4.5, 0.8); stroke(m, 9, 4.5, 12.5, 8, 0.8); stroke(m, 12.5, 8, 13.5, 12.5, 0.6);
    stroke(m, 4, 3, 2.5, 4.5, 0.5);
  });
  p.set(13, 12, UI_AMBER[5]); p.set(13, 13, UI_AMBER[4]); p.set(5, 2, UI_AMBER[5]); p.set(9, 5, IRON[2]);
}

function weaver(p: Px) {
  // three woven planks rising as stairs, a golden thread looping down to them
  const planks: [number, number][] = [[1, 12], [5, 9], [9, 6]];
  for (const [x, y] of planks) {
    shape(p, HONEY, 3, (m) => m.rect(x, y, 6, 2, ON));
    for (let i = 0; i < 6; i += 2) p.set(x + i, y, HONEY[5]);
  }
  const pts: [number, number][] = [[14, 1], [13, 2], [13, 3], [14, 4], [14, 5], [13, 5]];
  for (const [x, y] of pts) p.set(x, y, GOLD[4]);
  p.set(12, 2, GOLD[3]); p.set(15, 1, GOLD[2]);
}

function warden(p: Px) {
  // a golden Wyrdling guardian, legs apart, rune-staff held across: a T that says "stop"
  const key: Key = { '1': GOLD[1], '2': GOLD[2], '3': GOLD[3], '4': GOLD[4], '5': GOLD[5], k: CAVITY, e: EYE, a: FACE[3] };
  stamp(p, [
    '.34.............',
    '.2344555........',
    '...3345555......',
    '....3444444.....',
    '....234kkk43....',
    '....2kaeaea.....',
    '....12kaaa1.....',
    '...12333332.....',
    '...........',
    '...12333332.....',
    '..1233333322....',
    '..123333332.....',
    '..12.....22.....',
  ], key, 1, 1);
  for (let x = 1; x <= 14; x++) { p.set(x, 9, x % 2 ? WOOD[4] : WOOD[3]); p.set(x, 10, WOOD[1]); }
  for (const x of [1, 14]) { p.set(x, 8, GOLD[5]); p.set(x, 9, GOLD[5]); p.set(x, 10, GOLD[4]); p.set(x, 11, GOLD[3]); }
  p.set(4, 9, FACE[2]); p.set(11, 9, FACE[2]);
}

function climber(p: Px) {
  // a clawed glove gripping a stone wall, up arrow
  shape(p, STONE, 2, (m) => m.rect(11, 1, 4, 14, ON));
  for (const y of [4, 9]) for (let x = 11; x <= 14; x++) p.set(x, y, STONE[1]);
  p.set(13, 6, STONE[1]); p.set(12, 12, STONE[1]);
  shape(p, UI_BLUE, 3, (m) => { m.rect(5, 6, 5, 5, ON); m.rect(6, 11, 3, 2, ON); m.rect(9, 5, 1, 1, ON); m.rect(4, 7, 1, 3, ON); });
  for (const y of [6, 8, 10]) { p.set(10, y, IRON[5]); p.set(10, y + 1, IRON[3]); }
  p.set(6, 7, UI_BLUE[5]);
  shape(p, UI_CYAN, 3, (m) => { m.rect(2, 4, 1, 6, ON); m.poly([[0, 5], [5, 5], [2.5, 1.5]], ON); });
}

function glider(p: Px) {
  // leaf canopy with a small figure drifting beneath
  shape(p, LEAF, 3, (m) => {
    for (let x = 1; x <= 14; x++) {
      const t = (x - 7.5) / 6.5, y = 2 + Math.round(3 * t * t);
      const th = Math.abs(t) < 0.5 ? 3 : Math.abs(t) < 0.85 ? 2 : 1;
      for (let k = 0; k < th; k++) m.set(x, y + k, ON);
    }
  });
  for (let x = 2; x <= 13; x++) { const t = (x - 7.5) / 6.5; const y = 2 + Math.round(3 * t * t); if (x % 3 === 0) p.set(x, y, LEAF[5]); }
  p.set(4, 5, LEAF[1]); p.set(8, 4, LEAF[1]); p.set(11, 5, LEAF[1]);
  // hang lines + tiny hooded figure
  p.set(4, 7, LEAF[2]); p.set(5, 8, LEAF[2]); p.set(11, 7, LEAF[2]); p.set(10, 8, LEAF[2]);
  shape(p, HOOD, 3, (m) => { m.ellipse(7.5, 10, 2, 1.6, ON); m.set(5, 9, ON); });
  p.set(8, 10, FACE[2]); p.set(9, 10, FACE[3]);
  shape(p, CLOAK, 2, (m) => m.rect(6, 12, 4, 2, ON));
  for (const [x, y] of [[2, 11], [2, 13], [13, 12], [13, 14]]) p.set(x, y, UI_GREEN[3]);
}

function leaper(p: Px) {
  // a jump arc over a gap between two ledges, arrowhead landing on the far side
  shape(p, UI_CYAN, 2, (m) => { m.rect(0, 13, 5, 3, ON); m.rect(11, 13, 5, 3, ON); });
  shape(p, UI_CYAN, 4, (m) => {
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = 2.5 + t * 8.5, y = 11 - Math.sin(t * Math.PI * 0.92) * 8.5;
      if (t < 0.8) { m.set(Math.round(x), Math.round(y), ON); m.set(Math.round(x), Math.round(y) + 1, ON); }
    }
    m.poly([[9, 7.5], [14.5, 8], [12.5, 13]], ON);
  });
  p.set(3, 10, UI_CYAN[5]); p.set(4, 7, UI_CYAN[5]);
}

function blast(p: Px) {
  // red starburst around a glowing rune
  const pts: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 7.2 : 3.6;
    pts.push([7.5 + Math.cos(a) * r + 0.5, 7.5 + Math.sin(a) * r + 0.5]);
  }
  shape(p, RUNE, 3, (m) => m.poly(pts, ON));
  shape(p, FIRE, 4, (m) => m.ellipse(7.5, 7.5, 3, 3, ON));
  // rune glyph (sowilo)
  for (const [x, y] of [[8, 5], [7, 6], [8, 7], [7, 8], [8, 9], [7, 10]]) p.set(x, y, RUNE[0]);
  p.set(6, 6, hex('#ffffff'));
}

// --- Controls ------------------------------------------------------------------------------------

const INK = UI_GREY;

function tri(m: Px, x: number, y0: number, y1: number, w: number, dir = 1) {
  const cy = (y0 + y1) / 2;
  if (dir > 0) m.poly([[x, y0], [x + w, cy], [x, y1]], ON);
  else m.poly([[x + w, y0], [x, cy], [x + w, y1]], ON);
}

const pause = (p: Px) => shape(p, INK, 4, (m) => { m.rect(4, 3, 3, 10, ON); m.rect(9, 3, 3, 10, ON); });
const play = (p: Px) => shape(p, INK, 4, (m) => tri(m, 4, 2, 14, 9));
const fast = (p: Px) => shape(p, INK, 4, (m) => { tri(m, 1, 3, 13, 7); tri(m, 8, 3, 13, 7); });
const faster = (p: Px) => shape(p, INK, 4, (m) => { tri(m, 1, 4, 12, 5); tri(m, 6, 4, 12, 5); tri(m, 11, 4, 12, 4); });
function rewind(p: Px) {
  shape(p, UI_CYAN, 4, (m) => { tri(m, 1, 3, 13, 7, -1); tri(m, 8, 3, 13, 7, -1); });
}
function restart(p: Px) {
  // a clockwise loop with its arrowhead at the top
  shape(p, INK, 4, (m) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 9);
      const a = Math.atan2(y + 0.5 - 9, x + 0.5 - 8);
      if (d > 3.3 && d < 5.9 && !(a > -1.75 && a < -0.55)) m.set(x, y, ON);
    }
    m.poly([[8.5, 0.5], [13.5, 4.2], [8.5, 7.5]], ON);
  });
}

function home(p: Px) {
  shape(p, INK, 4, (m) => { m.poly([[8, 1.5], [15, 8], [1, 8]], ON); m.rect(3, 8, 10, 6, ON); });
  for (let y = 10; y <= 13; y++) { p.set(7, y, CLOAK[1]); p.set(8, y, CLOAK[1]); }
  p.set(7, 10, CLOAK[2]);
  shape(p, ROOT, 3, (m) => m.rect(11, 2, 2, 3, ON));
}
function eye(p: Px, off: boolean) {
  shape(p, INK, 4, (m) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const nx = (x + 0.5 - 8) / 7, ny = (y + 0.5 - 8) / 4.2;
      if (Math.abs(ny) <= (1 - nx * nx) * 1.0 && Math.abs(nx) <= 1) m.set(x, y, ON);
    }
  });
  shape(p, TEAL, 2, (m) => m.ellipse(7.5, 7.5, 2.4, 2.4, ON));
  p.set(7, 7, EYE); p.set(8, 7, EYE); p.set(7, 8, EYE); p.set(8, 8, EYE); p.set(6, 6, hex('#ffffff'));
  if (off) {
    const m = new Px(N, N);
    stroke(m, 2, 2, 13, 13, 0.7);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (aOf(m.get(x, y))) p.set(x, y, RUNE[3]);
  }
}
function music(p: Px) {
  shape(p, INK, 4, (m) => {
    m.ellipse(4, 12, 2.2, 1.6, ON); m.ellipse(11, 10, 2.2, 1.6, ON);
    m.rect(5, 2, 2, 10, ON); m.rect(12, 1, 2, 9, ON); m.poly([[5, 2], [14, 0.5], [14, 3.5], [5, 5]], ON);
  });
}
function speaker(p: Px) {
  shape(p, INK, 4, (m) => { m.rect(1, 6, 3, 5, ON); m.poly([[3, 6], [8, 2], [8, 15], [3, 11]], ON); });
}
function sound(p: Px) {
  speaker(p);
  shape(p, INK, 4, (m) => {
    for (let y = 0; y < N; y++) for (let x = 9; x < N; x++) {
      const d = Math.hypot(x + 0.5 - 7, y + 0.5 - 8.5);
      if ((d > 2.6 && d < 3.8) || (d > 5.2 && d < 6.4)) if (Math.abs(y + 0.5 - 8.5) < d * 0.8) m.set(x, y, ON);
    }
  });
}
function mute(p: Px) {
  speaker(p);
  const m = new Px(N, N);
  stroke(m, 10, 6, 14, 10, 0.6); stroke(m, 10, 10, 14, 6, 0.6);
  shadeMask(m, RUNE, p, 3);
}
function fullscreen(p: Px) {
  shape(p, INK, 4, (m) => {
    for (const [x, y, dx, dy] of [[1, 1, 1, 1], [14, 1, -1, 1], [1, 14, 1, -1], [14, 14, -1, -1]]) {
      for (let i = 0; i < 5; i++) { m.set(x + dx * i, y, ON); m.set(x, y + dy * i, ON); m.set(x + dx * i, y + dy, ON); m.set(x + dx, y + dy * i, ON); }
    }
  });
}
function gear(p: Px) {
  shape(p, INK, 3, (m) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - 8, dy = y + 0.5 - 8;
      const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const tooth = Math.cos(a * 8) > 0.35 ? 7 : 5.3;
      if (d <= tooth && d > 2.2) m.set(x, y, ON);
    }
  });
}

// --- Misc ------------------------------------------------------------------------------------------

function starPts(cx: number, cy: number, R: number, r: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? R : r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}
function star(p: Px) {
  shape(p, GOLD, 3, (m) => m.poly(starPts(8, 8.6, 7.6, 3.3), ON));
  p.set(6, 6, GOLD[5]); p.set(7, 5, GOLD[5]); p.set(7, 4, GOLD[5]);
}
function starEmpty(p: Px) {
  const m = new Px(N, N);
  m.poly(starPts(8, 8.6, 7.6, 3.3), ON);
  const inner = new Px(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!aOf(m.get(x, y))) continue;
    const edge = !aOf(m.get(x - 1, y)) || !aOf(m.get(x + 1, y)) || !aOf(m.get(x, y - 1)) || !aOf(m.get(x, y + 1));
    if (edge) inner.set(x, y, ON);
  }
  shadeMask(inner, UI_GREY, p, 3);
}
function thread(p: Px) {
  // a wooden spool wound with golden thread and a loose curling end
  shape(p, WOOD, 3, (m) => { m.rect(3, 2, 9, 2, ON); m.rect(3, 12, 9, 2, ON); });
  shape(p, GOLD, 3, (m) => m.rect(4, 4, 7, 8, ON));
  for (let y = 4; y < 12; y++) for (let x = 4; x <= 10; x++) if ((x + y * 2) % 4 === 0) p.set(x, y, GOLD[2]);
  p.set(5, 5, GOLD[5]); p.set(5, 7, GOLD[5]);
  for (const [x, y] of [[11, 8], [12, 9], [13, 9], [14, 10], [14, 11], [13, 12]]) p.set(x, y, GOLD[4]);
}
function lock(p: Px) {
  shape(p, IRON, 4, (m) => {
    for (let y = 1; y <= 7; y++) for (let x = 3; x <= 12; x++) {
      const d = Math.hypot(x + 0.5 - 8, (y + 0.5 - 7) * 1.0);
      if (d > 2.4 && d < 4.4 && y < 8) m.set(x, y, ON);
    }
  });
  shape(p, GOLD, 3, (m) => m.rect(2, 7, 12, 8, ON));
  p.set(7, 9, CAVITY); p.set(8, 9, CAVITY); p.set(7, 10, CAVITY); p.set(8, 10, CAVITY); p.set(7, 11, CAVITY); p.set(7, 12, CAVITY);
  for (let x = 3; x <= 12; x++) p.set(x, 13, GOLD[1]);
}
function wyrd(p: Px) {
  // the Wyrdling's head, the game's "lives" glyph
  const key: Key = { '1': HOOD[1], '2': HOOD[2], '3': HOOD[3], '4': HOOD[4], '5': HOOD[5], k: CAVITY, a: FACE[3], b: FACE[2], c: FACE[1], e: EYE, h: EYE_HI, p: BLUSH, u: CLOAK[3], v: CLOAK[2] };
  stamp(p, [
    '................',
    '..34............',
    '..2344555.......',
    '....3345555.....',
    '.....3444444....',
    '....234444443...',
    '....234kkkk43...',
    '....2kahbahb2...',
    '....2kaebaeb....',
    '....12kbbbcp....',
    '.....12kbbc.....',
    '....uuuuuuv.....',
    '...uuuuuuuvv....',
    '................',
  ], key, 0, 1);
}
function gate(p: Px) {
  // root arch with a glowing portal
  shape(p, TEAL, 2, (m) => m.ellipse(7.5, 9.5, 3.6, 5, ON));
  for (let y = 6; y < 14; y++) p.set(7 + (y % 3 === 0 ? 1 : 0), y, TEAL[4]);
  p.set(7, 8, GOLD[5]); p.set(8, 11, GOLD[4]);
  shape(p, ROOT, 3, (m) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const nx = (x + 0.5 - 8) / 6.8, ny = (y + 0.5 - 9.5) / 8.4;
      const d = nx * nx + ny * ny;
      if (d < 1 && d > 0.48 && y < 15) m.set(x, y, ON);
    }
    m.rect(1, 13, 3, 2, ON); m.rect(12, 13, 3, 2, ON);
  });
  for (const [x, y] of [[3, 6], [12, 5], [7, 1], [2, 10], [13, 11]]) p.set(x, y, ROOT[1]);
  p.set(5, 2, LEAF[3]); p.set(6, 1, LEAF[4]); p.set(10, 1, LEAF[3]);
}
function skullIcon(p: Px) {
  stamp(p, [
    '................',
    '................',
    '....abbbbbc.....',
    '...abbbbbbbc....',
    '...abbbbbbbc....',
    '...beeebeeec....',
    '...beeebeeec....',
    '...bbebbbebc....',
    '....bbbdbbc.....',
    '.....bbbbc......',
    '.....btbtc......',
    '.....b.b.c......',
    '................',
  ], { a: BONE[4], b: BONE[3], c: BONE[2], d: BONE[1], e: hex('#4a0a16'), t: BONE[1] }, 1, 1);
}
function check(p: Px) {
  shape(p, UI_GREEN, 3, (m) => { stroke(m, 2.5, 8, 6, 11.5, 1.2); stroke(m, 6, 11.5, 13, 3.5, 1.2); });
}
function arrow(p: Px, dir: number) {
  const m = new Px(N, N);
  m.rect(4, 6, 6, 4, ON);
  m.poly([[9, 2], [15, 8], [9, 14]], ON);
  const src = dir > 0 ? m : m.flippedX();
  shadeMask(src, INK, p, 4);
}
function loom(p: Px) {
  // loom frame: posts, beams, warp threads and a golden shuttle mid-weave
  shape(p, WOOD, 3, (m) => { m.rect(1, 1, 2, 14, ON); m.rect(13, 1, 2, 14, ON); m.rect(1, 1, 14, 2, ON); m.rect(1, 11, 14, 2, ON); });
  for (let x = 4; x <= 11; x++) for (let y = 3; y <= 10; y++) if (x % 2 === 0) p.set(x, y, y < 7 ? UI_GREY[4] : UI_GREY[3]);
  for (let x = 3; x <= 12; x++) { p.set(x, 8, GOLD[x % 2 ? 4 : 3]); p.set(x, 9, GOLD[x % 2 ? 2 : 3]); }
  shape(p, GOLD, 3, (m) => { m.rect(6, 6, 5, 1, ON); m.set(5, 6, ON); m.set(11, 6, ON); });
}
function hood(p: Px) {
  // the cosmetic hood: an empty teal hood with its floppy point
  const key: Key = { '0': HOOD[0], '1': HOOD[1], '2': HOOD[2], '3': HOOD[3], '4': HOOD[4], '5': HOOD[5], k: CAVITY, g: GOLD[3] };
  stamp(p, [
    '................',
    '.34.............',
    '.2344555........',
    '...3345555......',
    '....3444444.....',
    '...23444444.....',
    '...2344kkk43....',
    '...23kkkkkk3....',
    '...23kkkkkk3....',
    '...12kkkkk3.....',
    '....12kkk32.....',
    '....1122222.....',
    '.....g.g.g......',
  ], key, 1, 1);
}

// --- Public ----------------------------------------------------------------------------------------

export function buildIcons(): Record<string, HTMLCanvasElement> {
  return {
    digger: icon(digger),
    weaver: icon(weaver, (p) => sparkle(p, 14, 3, GOLD[5], GOLD[3], 0)),
    warden: icon(warden, (p) => { glow(p, 1, 9, 2.5, GOLD[4], 0.4); glow(p, 14, 9, 2.5, GOLD[4], 0.4); }),
    basher: icon(basher, (p) => { p.set(14, 4, FIRE[5]); p.set(15, 7, FIRE[4]); p.set(14, 10, FIRE[5]); }),
    miner: icon(miner, (p) => { p.set(15, 14, UI_AMBER[5]); p.set(14, 15, UI_AMBER[4]); }),
    climber: icon(climber),
    glider: icon(glider),
    leaper: icon(leaper),
    blast: icon(blast, (p) => glow(p, 7.5, 7.5, 4, FIRE[5], 0.3)),
    pause: icon(pause),
    play: icon(play),
    fast: icon(fast),
    faster: icon(faster),
    rewind: icon(rewind),
    restart: icon(restart),
    home: icon(home),
    eye: icon((p) => eye(p, false)),
    eye_off: icon((p) => eye(p, true)),
    music: icon(music),
    sound: icon(sound),
    mute: icon(mute),
    fullscreen: icon(fullscreen),
    gear: icon(gear),
    star: icon(star),
    star_empty: icon(starEmpty),
    thread: icon(thread),
    lock: icon(lock),
    wyrd: icon(wyrd),
    gate: icon(gate, (p) => glow(p, 7.5, 9.5, 4, TEAL[3], 0.2)),
    skull: icon(skullIcon),
    check: icon(check),
    arrow_left: icon((p) => arrow(p, -1)),
    arrow_right: icon((p) => arrow(p, 1)),
    loom: icon(loom),
    hood: icon(hood),
  };
}

