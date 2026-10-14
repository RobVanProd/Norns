// Level entities: gates, plates, switches, Seiðr stones, hazards, collectibles, decor and the
// Foresight / telegraph markers. All face right or are symmetric. Deterministic (hash2 only).

import { Px, hash2, mix, aOf, ditherPick, hex, type Color } from './px';
import type { Anim, SpriteLib } from './types';
import {
  STONE, IRON, WOOD, ROOT, RUNE, FIRE, ICE, LEAF, GOLD, TEAL, VIOLET, BONE, MUSHROOM_RED, CLOTH_RED,
  selout, shadeMask, stamp, glow, sparkle, clamp,
} from './palette';

const ON = 0xffffffff >>> 0;
const TAU = Math.PI * 2;

const one = (p: Px, ax: number, ay: number): Anim => ({ frames: [p.toCanvas()], ax, ay });
const many = (ps: Px[], ax: number, ay: number): Anim => ({ frames: ps.map((p) => p.toCanvas()), ax, ay });
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const withA = (c: Color, a: number) => (((c & 0x00ffffff) | ((a & 255) << 24)) >>> 0);

/** Fill a mask with `fn` and shade it with a ramp (edge lighting). */
function shaded(p: Px, ramp: Color[], base: number, fn: (m: Px) => void) {
  const m = new Px(p.w, p.h);
  fn(m);
  shadeMask(m, ramp, p, base);
  return m;
}

/** Sphere-lit fill: light from the top-left, optional texture offset (−1…1 ramp steps). */
function sphere(p: Px, cx: number, cy: number, r: number, ramp: Color[], tex?: (x: number, y: number) => number, rFn?: (a: number) => number) {
  const L = [-0.55, -0.65, 0.52];
  for (let y = Math.floor(cy - r - 2); y <= Math.ceil(cy + r + 2); y++) {
    for (let x = Math.floor(cx - r - 2); x <= Math.ceil(cx + r + 2); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const rr = rFn ? r * rFn(Math.atan2(dy, dx)) : r;
      const d = Math.hypot(dx, dy) / rr;
      if (d > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - d * d));
      const nx = dx / rr, ny = dy / rr;
      let l = nx * L[0] + ny * L[1] + nz * L[2];
      l = l * 0.5 + 0.5;
      const t = clamp(l + (tex ? tex(x, y) * 0.12 : 0), 0, 0.999);
      p.set(x, y, ramp[Math.floor(t * ramp.length)]);
    }
  }
}

/** Bevelled block: light top/left edges, dark bottom/right, flat face with optional noise. */
function block(p: Px, x0: number, y0: number, w: number, h: number, ramp: Color[], base = 2, seed = 0) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    let i = base;
    if (y === y0) i = base + 2;
    else if (x === x0) i = base + 1;
    else if (y === y0 + h - 1) i = base - 2;
    else if (x === x0 + w - 1) i = base - 1;
    else if (seed && hash2(x, y, seed) > 0.85) i = base - 1;
    else if (seed && hash2(x, y, seed + 1) > 0.9) i = base + 1;
    p.set(x, y, ramp[clamp(i, 0, ramp.length - 1)]);
  }
}

function rivet(p: Px, x: number, y: number) {
  p.set(x, y, IRON[5]);
  p.set(x + 1, y + 1, IRON[1]);
}

/** small rune glyphs (3×5) */
const GLYPHS: Record<string, string[]> = {
  algiz: ['#.#.#', '.###.', '..#..', '..#..', '..#..'],
  sowilo: ['..##', '.#..', '..#.', '...#', '##..'],
  gebo: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  tiwaz: ['..#..', '.###.', '#.#.#', '..#..', '..#..'],
  othala: ['..#..', '.#.#.', '..#..', '.#.#.', '#...#'],
  dagaz: ['#...#', '##.##', '#.#.#', '##.##', '#...#'],
};
function glyph(p: Px, name: string, x0: number, y0: number, col: Color, shadow?: Color) {
  const g = GLYPHS[name];
  g.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '#') return;
    if (shadow !== undefined && aOf(p.get(x0 + x + 1, y0 + y + 1)) && g[y + 1]?.[x + 1] !== '#') p.set(x0 + x + 1, y0 + y + 1, shadow);
    p.set(x0 + x, y0 + y, col);
  }));
}

// --- Spindle Gate (entrance) ------------------------------------------------------------------

function spindleGate(doorAng: number, swirl: number): Px {
  const p = new Px(32, 24);
  // ceiling beam with iron caps
  block(p, 3, 0, 26, 3, WOOD, 2, 11);
  for (const x of [3, 4, 27, 28]) for (let y = 0; y < 3; y++) p.set(x, y, IRON[y === 0 ? 4 : 2]);
  rivet(p, 3, 1); rivet(p, 27, 1);
  // housing, slightly tapered, plank texture
  shaded(p, WOOD, 2, (m) => m.poly([[6, 3], [26, 3], [24, 17], [8, 17]], ON));
  for (let y = 4; y < 16; y++) for (const x of [10, 14, 18, 22]) {
    const xx = x - Math.round((y - 3) * 0.12 * Math.sign(x - 16));
    if (aOf(p.get(xx, y))) p.set(xx, y, WOOD[1]);
  }
  // carved frame + iron straps
  for (let y = 3; y < 17; y++) { p.set(8 - Math.round((3 - y) * -0.14) , y, IRON[2]); p.set(23 + Math.round((3 - y) * -0.14) - 0, y, IRON[1]); }
  rivet(p, 8, 5); rivet(p, 8, 12); rivet(p, 23, 5); rivet(p, 23, 12);
  // golden spindle emblem: long shaft, diamond cop of wound thread, flat whorl, tips
  for (let y = 3; y <= 15; y++) { p.set(15, y, GOLD[3]); p.set(16, y, GOLD[1]); }
  const copW = [0, 1, 2, 2, 3, 3, 2, 2, 1];
  copW.forEach((hw, i) => {
    const y = 4 + i;
    for (let x = 16 - hw - 1; x <= 15 + hw; x++) {
      const lit = x < 15;
      p.set(x, y, (x + y) % 3 === 0 ? GOLD[2] : lit ? GOLD[4] : GOLD[3]);
    }
  });
  p.set(13, 8, GOLD[5]); p.set(14, 6, GOLD[5]);
  for (let x = 12; x <= 19; x++) { p.set(x, 13, x < 15 ? GOLD[4] : GOLD[3]); p.set(x, 14, GOLD[1]); }
  p.set(15, 2, GOLD[5]);
  // hatch opening x10..21 at row 16–17; doors hinge at the outer edges and swing down
  const a = (doorAng * Math.PI) / 180;
  if (doorAng > 0) {
    // dark interior with golden light
    for (let y = 15; y <= 17; y++) for (let x = 10; x <= 21; x++) p.set(x, y, y === 15 ? WOOD[0] : hex('#2a1408'));
    for (let x = 11; x <= 20; x++) p.set(x, 17, mix(GOLD[2], hex('#2a1408'), Math.abs(x - 15.5) / 6));
  }
  const door = (hx: number, dir: number) => {
    // a 2-px-thick plank rotating about its outer hinge; thickness faces into the opening when hanging
    const dx = Math.cos(a) * dir, dy = Math.sin(a);
    const nx = Math.sin(a) * dir, ny = Math.cos(a);
    const L = 5, T = 2;
    const m = new Px(32, 24);
    m.poly([[hx, 16], [hx + dx * L, 16 + dy * L], [hx + dx * L + nx * T, 16 + dy * L + ny * T], [hx + nx * T, 16 + ny * T]], ON);
    shadeMask(m, WOOD, p, 3);
    // iron strap across the middle of the plank
    const sx = Math.round(hx + dx * 3.2 + nx * 0.5), sy = Math.round(16 + dy * 3.2 + ny * 0.5);
    p.set(sx, sy, IRON[4]);
    p.set(Math.round(hx + nx * 0.5), Math.round(16 + ny * 0.5), IRON[3]);
  };
  if (doorAng === 0) {
    block(p, 10, 16, 12, 2, WOOD, 3);
    p.set(15, 16, WOOD[1]); p.set(16, 16, WOOD[1]); p.set(15, 17, WOOD[0]); p.set(16, 17, WOOD[0]);
    rivet(p, 10, 16); rivet(p, 20, 16);
  } else {
    door(10.5, 1);
    door(21.5, -1);
  }
  selout(p);
  if (swirl >= 0) {
    // golden light swirling in the open hatch and spilling down
    for (let i = 0; i < 6; i++) {
      const ang = swirl * (TAU / 4) + (i * TAU) / 6;
      const x = Math.round(15.5 + Math.cos(ang) * 4.5), y = Math.round(16 + Math.sin(ang) * 1.2);
      p.set(x, y, i % 2 ? GOLD[5] : GOLD[4]);
    }
    for (let i = 0; i < 4; i++) {
      const y = 18 + ((i * 2 + swirl) % 6);
      const x = 13 + ((i * 5 + swirl * 3) % 6);
      p.blend(x, y, withA(GOLD[4], 200 - (y - 18) * 30));
    }
    glow(p, 15.5, 17, 6, GOLD[3], 0.35);
  }
  return p;
}

// --- Root Gate (exit) ---------------------------------------------------------------------------

function rootArch(p: Px) {
  const m = new Px(32, 32);
  // twisted root strands following an arch; each strand is a thick wavy curve
  const strands = [
    { off: -1.6, ph: 0, w: 1.7 }, { off: 0.4, ph: 2.1, w: 1.9 }, { off: 2.0, ph: 4.0, w: 1.4 },
  ];
  for (const s of strands) {
    for (let t = 0; t <= 1; t += 0.004) {
      const ang = Math.PI * (1 - t); // left base → top → right base
      const r = 12.5 + s.off + Math.sin(t * 18 + s.ph) * 0.9;
      const cx = 15.5 + Math.cos(ang) * (r - 1.5);
      const cy = 17 - Math.sin(ang) * (r + 2);
      const base = Math.max(0, (Math.abs(t - 0.5) - 0.3) * 6);
      const ww = s.w + base * 0.8;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= ww * ww) m.set(Math.round(cx + dx), Math.round(cy + dy), ON);
    }
  }
  // feet: verticals to the ground and buttress roots spreading out
  for (let y = 17; y < 32; y++) for (const [x0, x1] of [[1, 6], [25, 30]]) for (let x = x0; x <= x1; x++) m.set(x, y, ON);
  m.poly([[0, 32], [0, 28], [4, 26], [9, 32]], ON);
  m.poly([[31, 32], [31, 28], [27, 26], [22, 32]], ON);
  m.poly([[7, 32], [7, 29], [9, 31], [10, 32]], ON);
  m.poly([[24, 32], [24, 29], [22, 31], [21, 32]], ON);
  shadeMask(m, ROOT, p, 3);
  // bark: streaks and knots
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!aOf(m.get(x, y))) continue;
    const h = hash2(x, y, 41);
    const streak = Math.sin(x * 1.3 + y * 0.6) > 0.82;
    if (streak && aOf(m.get(x + 1, y)) && aOf(m.get(x - 1, y))) p.set(x, y, ROOT[1]);
    else if (h > 0.93) p.set(x, y, ROOT[4]);
  }
  for (const [kx, ky] of [[4, 21], [27, 13], [9, 5], [21, 4], [26, 24]]) {
    p.set(kx, ky, ROOT[0]); p.set(kx + 1, ky, ROOT[1]); p.set(kx, ky - 1, ROOT[4]);
  }
  // moss on top of the arch
  for (let x = 6; x < 26; x++) {
    let y = 0;
    while (y < 31 && !aOf(m.get(x, y))) y++;
    if (y < 31 && hash2(x, 3, 7) > 0.35) { p.set(x, y, LEAF[hash2(x, 4, 7) > 0.5 ? 4 : 3]); if (hash2(x, 5, 7) > 0.6) p.set(x, y + 1, LEAF[2]); }
  }
  return m;
}

function portalMask(x: number, y: number) {
  const nx = (x + 0.5 - 15.5) / 8.2, ny = (y + 0.5 - 19.5) / 12.6;
  return nx * nx + ny * ny;
}

function rootGate(frame: number, locked: boolean): Px {
  const p = new Px(32, 32);
  const PORTAL = [hex('#0c1a3a'), hex('#123e5e'), TEAL[1], TEAL[2], hex('#7fe8c8'), GOLD[4], GOLD[5]];
  const DARK = [hex('#0a0816'), hex('#120e26'), hex('#1c1638'), hex('#28204a')];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = portalMask(x, y);
    if (d > 1 || y > 31) continue;
    const ang = Math.atan2(y + 0.5 - 19.5, (x + 0.5 - 15.5) * 1.4);
    const r = Math.sqrt(d);
    const sw = Math.sin(ang * 3 + r * 9 - (frame * TAU) / 6) * 0.5 + 0.5;
    if (locked) {
      const t = 0.25 + (1 - r) * 0.35 + sw * 0.15;
      p.set(x, y, ditherPick(DARK, t, x, y));
    } else {
      const t = clamp((1 - r) * 0.75 + sw * 0.32 - 0.05, 0, 1);
      p.set(x, y, ditherPick(PORTAL, t, x, y));
    }
  }
  if (!locked) {
    // motes spiralling inward
    for (let i = 0; i < 7; i++) {
      const ph = ((frame / 6) + i / 7) % 1;
      const ang = i * 2.4 + ph * 4;
      const r = 1 - ph;
      const x = Math.round(15.5 + Math.cos(ang) * 7 * r), y = Math.round(19.5 + Math.sin(ang) * 11 * r);
      if (portalMask(x, y) < 0.9) p.set(x, y, i % 2 ? GOLD[5] : hex('#ffffff'));
    }
  }
  rootArch(p);
  if (locked) {
    // rune-iron bars, a band and a sealing plate with a red rune
    for (const bx of [10, 13, 18, 21]) for (let y = 6; y < 31; y++) {
      if (portalMask(bx, y) > 1.02 && y < 20) continue;
      p.set(bx, y, IRON[3]); p.set(bx + 1, y, IRON[1]);
      if (y === 7 || y === 29) p.set(bx, y, IRON[5]);
    }
    for (let x = 8; x <= 23; x++) { p.set(x, 17, IRON[4]); p.set(x, 18, IRON[2]); p.set(x, 19, IRON[1]); }
    block(p, 12, 14, 8, 9, IRON, 2);
    rivet(p, 12, 15); rivet(p, 18, 15); rivet(p, 12, 20); rivet(p, 18, 20);
    glyph(p, 'algiz', 14, 16, RUNE[4], RUNE[1]);
    p.set(16, 16, RUNE[5]);
  }
  selout(p);
  if (locked) glow(p, 16, 18, 5, RUNE[3], 0.3);
  else glow(p, 15.5, 20, 9, TEAL[3], 0.12);
  return p;
}

// --- Rune charge ------------------------------------------------------------------------------

function runeCharge(f: number): Px {
  const p = new Px(8, 8);
  const lvl = [0, 1, 2, 3, 2, 1][f];
  shaded(p, STONE, 2, (m) => { m.rect(1, 2, 6, 6, ON); m.rect(2, 1, 4, 1, ON); });
  // carved sowilo-like bolt, glowing
  const c = [RUNE[2], RUNE[3], RUNE[4], RUNE[5]][lvl];
  const pts: [number, number][] = [[4, 2], [3, 3], [4, 4], [3, 5], [4, 6]];
  for (const [x, y] of pts) p.set(x, y, c);
  p.set(2, 3, c); p.set(5, 5, c);
  selout(p);
  glow(p, 3.5, 4, 3 + lvl * 0.6, RUNE[4], 0.16 + lvl * 0.1);
  if (lvl === 3) { p.set(1, 0, RUNE[5]); p.set(6, 1, RUNE[4]); }
  return p;
}

// --- Plates, switches, Seiðr stones --------------------------------------------------------------

function plate(down: boolean): Px {
  const p = new Px(16, 5);
  // base frame (iron-bound stone)
  block(p, 0, 3, 16, 2, IRON, 2);
  const top = down ? 2 : 0;
  block(p, 1, top, 14, 3 - top + (down ? 0 : 0), STONE, 3, 5);
  if (!down) block(p, 1, 0, 14, 3, STONE, 3, 5);
  // rune slit
  const y = down ? 2 : 1;
  const c = down ? GOLD[5] : STONE[1];
  for (const x of [6, 7, 8, 9]) p.set(x, y, x === 7 || x === 8 ? c : down ? GOLD[3] : STONE[1]);
  if (!down) p.set(7, 2, STONE[1]);
  selout(p);
  if (down) glow(p, 7.5, 2, 4, GOLD[4], 0.4);
  return p;
}

function runeSwitch(on: boolean): Px {
  const p = new Px(8, 16);
  // carved post on a base
  block(p, 1, 14, 6, 2, STONE, 2, 3);
  block(p, 2, 7, 4, 7, STONE, 2, 9);
  // lever from the pivot to a crystal knob
  const tip: [number, number] = on ? [6, 3] : [1, 3];
  p.line(4, 7, tip[0], tip[1] + 1, WOOD[3]);
  p.set(4, 7, IRON[4]);
  const cr = on ? TEAL : VIOLET;
  p.set(tip[0], tip[1], cr[on ? 4 : 2]); p.set(tip[0], tip[1] - 1, cr[on ? 3 : 1]);
  p.set(tip[0] + (on ? -1 : 1), tip[1], cr[on ? 3 : 1]);
  // rune on the post
  const rc = on ? TEAL[3] : STONE[1];
  p.set(3, 9, rc); p.set(4, 10, rc); p.set(3, 11, rc); p.set(4, 12, rc);
  selout(p);
  if (on) { glow(p, tip[0], tip[1], 4, TEAL[3], 0.5); glow(p, 3.5, 10.5, 3, TEAL[3], 0.25); p.set(tip[0], tip[1], TEAL[4]); }
  return p;
}

function seidr(on: boolean, f: number): Px {
  const p = new Px(20, 10);
  const MAGIC = [VIOLET[1], VIOLET[2], VIOLET[3], hex('#d8a8ff'), hex('#f8e8ff')];
  const lvl = on ? [2, 3, 4, 3][f] : 0;
  // side of the slab: layered stone, rounded lower corners
  for (let y = 5; y <= 9; y++) for (let x = 1; x <= 18; x++) {
    if (y === 9 && (x < 3 || x > 16)) continue;
    if (y === 8 && (x < 2 || x > 17)) continue;
    p.set(x, y, y === 9 ? STONE[0] : x <= 2 ? STONE[2] : x >= 17 ? STONE[0] : y === 7 && hash2(x, 7, 5) > 0.45 ? STONE[0] : STONE[1]);
  }
  // flat top face: an ellipse, lit rim at the back, darker lip at the front
  for (let y = 1; y <= 7; y++) for (let x = 0; x < 20; x++) {
    const nx = (x + 0.5 - 10) / 9.3, ny = (y + 0.5 - 4.5) / 2.9;
    const d = nx * nx + ny * ny;
    if (d > 1) continue;
    const back = y + 0.5 < 4.5;
    p.set(x, y, d > 0.72 ? (back ? STONE[4] : STONE[2]) : STONE[3]);
  }
  // carved rune ring + centre mark
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 17; x++) {
    const nx = (x + 0.5 - 10) / 6.4, ny = (y + 0.5 - 4.5) / 1.8;
    const d = Math.sqrt(nx * nx + ny * ny);
    if (Math.abs(d - 1) < 0.2) p.set(x, y, on ? MAGIC[clamp(lvl - ((x + f) % 4 === 0 ? 1 : 0), 0, 4)] : STONE[1]);
  }
  const cc = on ? MAGIC[clamp(lvl + 1, 0, 4)] : STONE[1];
  p.set(9, 4, cc); p.set(10, 4, cc); p.set(8, 4, on ? MAGIC[lvl] : STONE[2]); p.set(11, 4, on ? MAGIC[lvl] : STONE[2]); p.set(9, 3, cc); p.set(10, 5, cc);
  selout(p);
  if (on) {
    glow(p, 9.5, 4, 8, VIOLET[3], [0.22, 0.32, 0.42, 0.32][f]);
    for (let i = 0; i < 4; i++) {
      const x = 4 + ((i * 4 + 3) % 12), y = 2 - ((f + i * 2) % 3);
      if (y >= 0) p.set(x, y, i % 2 ? MAGIC[4] : MAGIC[3]);
    }
  }
  return p;
}

// --- Hazards ----------------------------------------------------------------------------------

function vent(f: number): Px {
  const p = new Px(16, 6);
  block(p, 0, 1, 16, 5, IRON, 2);
  // fan chamber seen through the grate
  for (let y = 2; y <= 3; y++) for (let x = 2; x <= 13; x++) p.set(x, y, IRON[0]);
  for (let i = 0; i < 3; i++) {
    const bx = 2 + ((i * 4 + f) % 12);
    p.set(bx, 2, IRON[3]); p.set(bx + 1, 3, IRON[3]); p.set(bx + 1, 2, IRON[2]);
  }
  // slats
  for (let x = 1; x <= 14; x += 3) { p.set(x, 2, IRON[4]); p.set(x, 3, IRON[3]); }
  for (let x = 1; x < 15; x++) p.set(x, 1, x % 2 ? IRON[4] : IRON[3]);
  rivet(p, 1, 4); rivet(p, 13, 4);
  selout(p);
  // a whisper of rising air
  for (let i = 0; i < 2; i++) p.blend(4 + i * 7 + (f % 2), 0, withA(hex('#dff4ff'), 120));
  return p;
}

function spikes(): Px {
  // two iron spikes per tile; the bases meet so the strip tiles seamlessly
  const p = new Px(8, 6);
  const unit = ['.a..', '.ab.', '.ab.', 'aabc', 'aabc', 'dedd'];
  const key = { a: IRON[4], b: IRON[2], c: IRON[1], d: IRON[1], e: IRON[3] };
  stamp(p, unit, key, 0, 0);
  stamp(p, unit, key, 4, 0);
  p.set(1, 0, IRON[5]); p.set(5, 0, IRON[5]);
  selout(p);
  return p;
}

function crusherHead(): Px {
  const p = new Px(24, 16);
  block(p, 1, 0, 22, 11, STONE, 3, 17);
  for (let x = 1; x < 23; x++) { p.set(x, 0, IRON[4]); p.set(x, 1, IRON[2]); p.set(x, 9, IRON[3]); p.set(x, 10, IRON[1]); }
  for (const x of [3, 11, 19]) { rivet(p, x, 0); rivet(p, x, 9); }
  // carved warning rune
  glyph(p, 'dagaz', 9, 3, RUNE[3], STONE[1]);
  // teeth
  for (let t = 0; t < 4; t++) {
    const x0 = 1 + t * 5.5;
    for (let y = 11; y < 16; y++) {
      const hw = (16 - y) * 0.55;
      for (let x = Math.round(x0 + 2.75 - hw); x <= Math.round(x0 + 2.75 + hw) - 1; x++) {
        p.set(x, y, x < x0 + 2.5 ? IRON[3] : IRON[1]);
      }
    }
    p.set(Math.round(x0 + 2), 15, IRON[4]);
  }
  selout(p);
  return p;
}

function crusherShaft(): Px {
  const p = new Px(8, 8);
  // chain: a face-on link (y1..5) and an edge-on link joining through the tile seam
  for (let y = 0; y < 8; y++) {
    if (y <= 1 || y >= 6) { p.set(3, y, IRON[3]); p.set(4, y, IRON[1]); }
  }
  for (let y = 1; y <= 6; y++) {
    const edge = y === 1 || y === 6;
    p.set(2, y, edge ? IRON[3] : IRON[4]);
    p.set(5, y, IRON[1]);
    if (edge) { p.set(3, y, IRON[3]); p.set(4, y, IRON[2]); }
  }
  p.set(1, 3, IRON[2]); p.set(1, 4, IRON[2]); p.set(6, 3, IRON[0]); p.set(6, 4, IRON[0]);
  return p;
}

function firejetBase(): Px {
  const p = new Px(12, 6);
  shaded(p, IRON, 2, (m) => m.poly([[1, 6], [3, 1], [9, 1], [11, 6]], ON));
  for (let x = 2; x < 10; x++) p.set(x, 3, IRON[1]);
  p.set(4, 1, FIRE[3]); p.set(5, 1, FIRE[4]); p.set(6, 1, FIRE[4]); p.set(7, 1, FIRE[3]);
  rivet(p, 3, 4); rivet(p, 8, 4);
  selout(p);
  p.set(5, 0, FIRE[3]); p.set(6, 0, FIRE[2]);
  return p;
}

function firejetFlame(f: number): Px {
  const p = new Px(12, 32);
  for (let y = 31; y >= 0; y--) {
    const h = (31 - y) / 31; // 0 bottom … 1 top
    const sway = Math.sin(y * 0.33 + f * 1.6) * (0.4 + h * 1.3);
    const w = (3.2 + Math.sin(h * Math.PI) * 1.6) * (1 - Math.pow(h, 2.4)) + 0.3;
    const cx = 5.5 + sway;
    for (let x = 0; x < 12; x++) {
      const d = Math.abs(x + 0.5 - cx - 0.5) / w;
      const n = hash2(x, y + f * 7, 33) * 0.35;
      if (d + n * (0.4 + h) > 1.05) continue;
      const t = 1 - d * 0.9 - h * 0.45 + n * 0.3;
      p.set(x, y, FIRE[clamp(Math.round(1 + t * 4.4), 1, 5)]);
    }
  }
  // detached tongues near the top
  for (let i = 0; i < 3; i++) {
    const y = 2 + ((i * 5 + f * 3) % 9), x = 4 + ((i * 3 + f) % 4);
    p.set(x, y, FIRE[3]); p.set(x, y + 1, FIRE[2]);
  }
  return p;
}

// --- Collectible & decor ----------------------------------------------------------------------

function spindleItem(f: number): Px {
  const p = new Px(12, 14);
  // shaft with a hook at the top and a point below the whorl
  for (let y = 1; y <= 13; y++) { p.set(5, y, GOLD[4]); p.set(6, y, GOLD[2]); }
  p.set(6, 0, GOLD[4]); p.set(7, 1, GOLD[3]);
  // diamond cop of wound golden thread; windings scroll as it spins
  const hw = [1, 2, 3, 3, 3, 2, 1];
  hw.forEach((w, i) => {
    const y = 2 + i;
    for (let x = 6 - w; x <= 5 + w; x++) {
      const k = (x + y * 2 + f) % 4;
      const lit = x <= 5;
      p.set(x, y, k === 0 ? GOLD[2] : k === 2 ? (lit ? GOLD[5] : GOLD[4]) : lit ? GOLD[4] : GOLD[3]);
    }
  });
  // whorl disc with a travelling highlight
  for (let x = 1; x <= 10; x++) { p.set(x, 10, GOLD[3]); p.set(x, 11, GOLD[1]); }
  const hx = 1 + ((f * 5) % 10);
  p.set(hx, 10, GOLD[5]);
  p.set(1, 10, GOLD[4]);
  // a loose end of thread trailing from the cop
  const sway = [0, 1, 1, 0, 0, -1, -1, 0][f];
  p.set(9, 5, GOLD[3]); p.set(10, 6 + (sway > 0 ? 1 : 0), GOLD[3]); p.set(11, 7 + sway, GOLD[2]);
  selout(p);
  if (f === 0 || f === 4) sparkle(p, 3, 3, hex('#ffffff'), GOLD[4]);
  if (f === 1 || f === 5) p.set(3, 3, GOLD[5]);
  glow(p, 5.5, 6, 6, GOLD[4], 0.12);
  return p;
}

function boulder(): Px {
  const p = new Px(24, 24);
  const tex = (x: number, y: number) => (hash2(x >> 1, y >> 1, 61) - 0.5) * 2 + (hash2(x, y, 62) - 0.5);
  const lump = (a: number) => 1 + Math.sin(a * 5 + 1) * 0.035 + Math.sin(a * 3 + 2) * 0.03;
  sphere(p, 12, 12, 10.6, STONE.slice(0, 6), tex, lump);
  // carved rune (Othala) with a lit lower edge so rotation reads
  const g = GLYPHS.othala;
  g.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '#') return;
    p.set(10 + x, 10 + y, STONE[0]);
    if (g[y + 1]?.[x] !== '#') p.set(10 + x, 11 + y, STONE[4]);
  }));
  // moss cap on the top-left
  for (let y = 2; y < 12; y++) for (let x = 2; x < 14; x++) {
    if (!aOf(p.get(x, y))) continue;
    const d = Math.hypot(x - 6, y - 4);
    if (d + hash2(x, y, 63) * 3 < 5.2) p.set(x, y, LEAF[d < 2.5 ? 3 : hash2(x, y, 64) > 0.5 ? 2 : 1]);
  }
  // cracks
  p.set(17, 15, STONE[0]); p.set(18, 16, STONE[0]); p.set(18, 17, STONE[1]); p.set(5, 15, STONE[1]); p.set(6, 16, STONE[0]);
  selout(p);
  return p;
}

function flame(p: Px, cx: number, base: number, h: number, w: number, f: number, seed: number) {
  for (let y = base; y > base - h; y--) {
    const t = (base - y) / h;
    const sway = Math.sin(t * 3 + f * 1.7 + seed) * t * 1.2;
    const hw = w * (1 - t * t) * (0.9 + 0.2 * Math.sin(f * 2 + y));
    for (let x = Math.floor(cx - hw - 1); x <= Math.ceil(cx + hw + 1); x++) {
      const d = Math.abs(x + 0.5 - (cx + sway)) / Math.max(0.6, hw);
      const n = hash2(x, y + f * 5, seed) * 0.4;
      if (d + n * t > 1.1) continue;
      const v = 1 - d * 0.8 - t * 0.5 + n * 0.25;
      p.set(x, y, FIRE[clamp(Math.round(1.5 + v * 4), 1, 5)]);
    }
  }
}

function torch(f: number): Px {
  const p = new Px(8, 16);
  // wall plate and bracket
  block(p, 3, 11, 2, 5, IRON, 2);
  p.set(2, 10, IRON[3]); p.set(5, 10, IRON[2]); p.set(2, 9, IRON[4]); p.set(5, 9, IRON[1]);
  // torch head (wrapped), handle
  for (let y = 7; y <= 10; y++) { p.set(3, y, WOOD[3]); p.set(4, y, WOOD[1]); }
  p.set(3, 6, WOOD[4]); p.set(4, 6, WOOD[2]); p.set(2, 6, WOOD[2]); p.set(5, 6, WOOD[1]);
  selout(p);
  flame(p, 3.5, 5, 6 + (f % 2), 2.1, f, 3);
  glow(p, 3.5, 3, 4.5, FIRE[4], 0.18 + (f % 2) * 0.05);
  return p;
}

function brazier(f: number): Px {
  const p = new Px(12, 12);
  // tripod legs
  p.line(3, 8, 1, 11, IRON[2]); p.line(8, 8, 10, 11, IRON[1]); p.line(5, 8, 5, 11, IRON[3]); p.set(6, 11, IRON[1]);
  // bowl
  shaded(p, IRON, 2, (m) => { m.rect(1, 5, 10, 2, ON); m.rect(2, 7, 8, 1, ON); });
  for (let x = 2; x <= 9; x++) p.set(x, 5, x % 3 === 0 ? FIRE[3] : FIRE[2]);
  rivet(p, 2, 6); rivet(p, 8, 6);
  selout(p);
  flame(p, 5.5, 4, 5, 3, f, 7);
  glow(p, 5.5, 3, 5, FIRE[4], 0.2);
  return p;
}

function crystal(): Px {
  const p = new Px(10, 16);
  const shard = (pts: [number, number][], ramp: Color[], hiX: number) => {
    const m = new Px(10, 16);
    m.poly(pts, ON);
    shadeMask(m, ramp, p, 3);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 10; x++) if (aOf(m.get(x, y)) && x >= hiX) p.set(x, y, ramp[2]);
  };
  shard([[0, 16], [0, 9], [2, 7], [4, 10], [4, 16]], ICE, 3);
  shard([[6, 16], [6, 8], [8, 5], [10, 8], [10, 16]], ICE, 9);
  shard([[2, 16], [2, 4], [4.5, 0], [7, 4], [7, 16]], ICE, 5);
  // facet highlights
  for (let y = 4; y < 14; y++) p.set(3, y, ICE[5]);
  p.set(4, 1, ICE[5]); p.set(4, 2, ICE[5]); p.set(1, 9, ICE[5]); p.set(7, 7, ICE[5]);
  selout(p);
  glow(p, 4.5, 8, 6, ICE[4], 0.22);
  sparkle(p, 5, 3, hex('#ffffff'), ICE[4]);
  return p;
}

function mushroom(v: number): Px {
  const p = new Px(8, 8);
  if (v === 0) {
    for (let y = 5; y < 8; y++) { p.set(3, y, BONE[3]); p.set(4, y, BONE[2]); }
    shaded(p, MUSHROOM_RED, 2, (m) => { m.ellipse(3.5, 3, 3.2, 2, ON); m.rect(0, 3, 8, 2, ON); });
    for (let x = 0; x < 8; x++) p.set(x, 4, MUSHROOM_RED[1]);
    p.set(2, 2, BONE[4]); p.set(5, 1, BONE[4]); p.set(6, 3, BONE[3]); p.set(1, 3, BONE[3]);
    p.set(2, 5, BONE[1]);
  } else {
    const TAN = [hex('#3a2418'), hex('#6a4428'), hex('#a0703c'), hex('#d0a060'), hex('#f0d090')];
    for (let y = 4; y < 8; y++) { p.set(2, y, BONE[3]); }
    for (let y = 6; y < 8; y++) { p.set(5, y, BONE[2]); }
    shaded(p, TAN, 2, (m) => { m.ellipse(2.5, 3, 2.2, 1.4, ON); m.ellipse(5.5, 5, 1.6, 1, ON); });
    p.set(1, 2, TAN[4]); p.set(5, 4, TAN[4]);
  }
  selout(p);
  return p;
}

function banner(f: number): Px {
  const p = new Px(10, 20);
  const m = new Px(10, 20);
  const off = (y: number) => Math.round(Math.sin(y * 0.38 - f * (TAU / 4)) * (y / 19) * 1.3);
  for (let y = 2; y < 20; y++) {
    const o = off(y);
    for (let x = 1; x <= 8; x++) {
      if (y >= 17 && x >= 4 && x <= 5 && y - 17 >= 0) continue; // swallowtail notch
      if (y === 19 && (x === 3 || x === 6)) continue;
      m.set(x + o, y, ON);
    }
  }
  shadeMask(m, CLOTH_RED, p, 2);
  // wave shading: crests lighter
  for (let y = 2; y < 20; y++) {
    const s = Math.cos(y * 0.38 - f * (TAU / 4));
    for (let x = 0; x < 10; x++) if (aOf(m.get(x, y)) && Math.abs(s) > 0.75) p.set(x, y, mix(p.get(x, y), s > 0 ? CLOTH_RED[4] : CLOTH_RED[0], 0.45));
  }
  // gold border trim
  for (let y = 2; y < 19; y++) { const o = off(y); p.set(1 + o, y, GOLD[2]); p.set(8 + o, y, GOLD[1]); }
  // knot rune (interlaced triangle knot)
  const K = ['..#..', '.#.#.', '#####', '.#.#.', '#.#.#', '##.##'];
  K.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '#') { const yy = 7 + y; p.set(3 + x + off(yy) - 1 + 1, yy, GOLD[4]); }
  }));
  // rod with finials
  for (let x = 0; x < 10; x++) { p.set(x, 0, WOOD[3]); p.set(x, 1, WOOD[1]); }
  p.set(0, 0, GOLD[4]); p.set(9, 0, GOLD[4]); p.set(0, 1, GOLD[2]); p.set(9, 1, GOLD[2]);
  selout(p);
  return p;
}

function runestone(): Px {
  const p = new Px(12, 18);
  const m = shaded(p, STONE, 2, (mm) => { mm.ellipse(5.5, 4.5, 4.8, 4.2, ON); mm.poly([[1, 5], [10.5, 5], [11, 18], [0.5, 18]], ON); });
  for (let y = 0; y < 18; y++) for (let x = 0; x < 12; x++) {
    if (!aOf(m.get(x, y))) continue;
    const h = hash2(x, y, 71);
    if (h > 0.92) p.set(x, y, STONE[1]); else if (h < 0.05) p.set(x, y, STONE[4]);
  }
  // carved border and two runes: dark grooves, lit lower edges, a faint teal glow inside
  for (let y = 4; y < 16; y++) { p.set(2, y, STONE[1]); p.set(9, y, STONE[1]); }
  for (let x = 3; x <= 8; x++) p.set(x, 3, STONE[1]);
  glyph(p, 'tiwaz', 4, 5, TEAL[2], STONE[4]);
  glyph(p, 'algiz', 4, 11, TEAL[1], STONE[4]);
  // lichen
  for (const [x, y] of [[1, 15], [2, 16], [9, 14], [8, 16], [6, 1]]) p.set(x, y, LEAF[2]);
  selout(p);
  return p;
}

// --- Markers ----------------------------------------------------------------------------------

function skull(): Px {
  const p = new Px(7, 7);
  stamp(p, [
    '.abbbc.',
    'abbbbbc',
    'beebeec',
    'beebeec',
    '.bbdbc.',
    '.btbtc.',
    '.......',
  ], { a: BONE[4], b: BONE[3], c: BONE[2], d: BONE[1], e: hex('#4a0a16'), t: BONE[2] }, 0, 0);
  // red outline so it reads as a warning
  const src = p.data.slice();
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    if (aOf(src[y * 7 + x])) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < 7 && yy < 7 && aOf(src[yy * 7 + xx]); });
    if (n) p.set(x, y, RUNE[2]);
  }
  return p;
}

function spark(): Px {
  const p = new Px(7, 7);
  stamp(p, [
    '...a...',
    '...b...',
    '..cbc..',
    'abbwbba',
    '..cbc..',
    '...b...',
    '...a...',
  ], { a: GOLD[2], b: GOLD[4], c: GOLD[3], w: hex('#ffffff') }, 0, 0);
  return p;
}

function cursorRing(f: number): Px {
  const p = new Px(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x + 0.5 - 8, dy = y + 0.5 - 8;
    const d = Math.hypot(dx, dy);
    if (d < 6.3 || d > 7.6) continue;
    const a = (Math.atan2(dy, dx) + Math.PI) / TAU; // 0..1
    const seg = Math.floor((a * 8 + f / 4) * 2) % 2;
    if (seg === 0) p.set(x, y, d < 7 ? GOLD[5] : GOLD[3]);
  }
  selout(p);
  return p;
}

function target(f: number): Px {
  const p = new Px(15, 15);
  const lvl = [0, 1, 2, 1][f];
  const c1 = RUNE[2 + lvl], c2 = RUNE[1 + lvl];
  for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
    const dx = x - 7, dy = y - 7;
    const d = Math.hypot(dx, dy);
    if (d > 6.2 && d < 7.3) p.set(x, y, c1);
    else if (d > 3.6 && d < 4.4) {
      const a = Math.atan2(dy, dx);
      if (Math.floor(((a + Math.PI) / TAU) * 12 + f * 0.5) % 2 === 0) p.set(x, y, c2);
    }
  }
  // crosshair ticks and centre rune
  for (const [x, y] of [[7, 0], [7, 1], [7, 13], [7, 14], [0, 7], [1, 7], [13, 7], [14, 7]]) p.set(x, y, RUNE[5 - (lvl === 2 ? 0 : 1)]);
  p.set(7, 7, RUNE[4 + (lvl === 2 ? 1 : 0)]); p.set(6, 7, c2); p.set(8, 7, c2); p.set(7, 6, c2); p.set(7, 8, c2);
  if (lvl > 0) glow(p, 7, 7, 7.5, RUNE[3], 0.1 * lvl);
  return p;
}

function warn(on: boolean): Px {
  const p = new Px(5, 9);
  const R = on ? [RUNE[2], RUNE[4], RUNE[5]] : [RUNE[1], RUNE[2], RUNE[3]];
  stamp(p, [
    '.abc.',
    '.abc.',
    '.abc.',
    '..bc.',
    '..b..',
    '.....',
    '.....',
    '..bc.',
    '.....',
  ], { a: R[2], b: R[1], c: R[0] }, 0, 0);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 5; x++) {
    if (aOf(p.get(x, y))) continue;
    if (aOf(p.get(x - 1, y)) || aOf(p.get(x + 1, y)) || aOf(p.get(x, y - 1)) || aOf(p.get(x, y + 1))) p.set(x, y, on ? hex('#3a0410') : hex('#26040c'));
  }
  return p;
}

// --- Public ----------------------------------------------------------------------------------

export function buildEntitySprites(): SpriteLib {
  const doorAngles = [0, 25, 52, 78, 100, 90];
  return {
    'gate.entrance.open': many(doorAngles.map((a) => spindleGate(a, -1)), 16, 0),
    'gate.entrance.idle': many(range(4).map((f) => spindleGate(90, f)), 16, 0),
    'gate.exit': many(range(6).map((f) => rootGate(f, false)), 16, 31),
    'gate.exit.locked': one(rootGate(0, true), 16, 31),
    'rune.charge': many(range(6).map(runeCharge), 4, 7),
    'plate.up': one(plate(false), 8, 4),
    'plate.down': one(plate(true), 8, 4),
    'switch.off': one(runeSwitch(false), 4, 15),
    'switch.on': one(runeSwitch(true), 4, 15),
    'seidr.off': one(seidr(false, 0), 10, 9),
    'seidr.on': many(range(4).map((f) => seidr(true, f)), 10, 9),
    vent: many(range(4).map(vent), 8, 5),
    spikes: one(spikes(), 0, 5),
    'crusher.head': one(crusherHead(), 12, 15),
    'crusher.shaft': one(crusherShaft(), 4, 0),
    'firejet.base': one(firejetBase(), 6, 5),
    'firejet.flame': many(range(4).map(firejetFlame), 6, 31),
    spindle: many(range(8).map(spindleItem), 6, 13),
    boulder: one(boulder(), 12, 12),
    torch: many(range(4).map(torch), 4, 15),
    brazier: many(range(4).map(brazier), 6, 11),
    crystal: one(crystal(), 5, 15),
    mushroom: many([mushroom(0), mushroom(1)], 4, 7),
    banner: many(range(4).map(banner), 5, 0),
    runestone: one(runestone(), 6, 17),
    skull: one(skull(), 3, 3),
    spark: one(spark(), 3, 3),
    'cursor.ring': many(range(4).map(cursorRing), 8, 8),
    target: many(range(4).map(target), 7, 7),
    warn: many([warn(true), warn(false)], 2, 8),
  };
}

