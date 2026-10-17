// Title / map art — see docs/ART_SPEC.md "Title / map art": the carved gold-and-stone NORNS
// wordmark with a golden thread weaving over and under its letters, and the Yggdrasil world-map
// scene with three realm "fruits" on its branches.

import { Px, type Color, mix, mulberry32, aOf } from './px';
import type { RealmId } from './types';
import { TITLE, ENV } from './envPalette';
import { clamp01, smooth, Sculpt, tubeBuf, tube, gnarl, noise1, glow, fbmT, hx as hex, toCv, fsin, type TubeBuf } from './envKit';

const TAU = Math.PI * 2;

// ======================================================================= logo

type Ring = [number, number][];
/** even-odd fill of several rings into a mask */
function fillRings(m: Uint8Array, w: number, h: number, rings: Ring[], ox: number, oy: number) {
  for (let y = 0; y < h; y++) {
    const yc = y + 0.5 - oy;
    const xs: number[] = [];
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0) + ox);
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(w, Math.round(xs[k + 1])); x++) m[y * w + x] = 1;
  }
}

// angular, rune-cut capitals on a 34×40 grid
const LETTERS: Record<string, Ring[]> = {
  N: [[[0, 3], [3, 0], [10, 0], [25, 25], [25, 3], [28, 0], [34, 0], [34, 37], [31, 40], [24, 40], [9, 15], [9, 37], [6, 40], [0, 40]]],
  O: [
    [[9, 0], [25, 0], [34, 9], [34, 31], [25, 40], [9, 40], [0, 31], [0, 9]],
    [[12, 8], [22, 8], [26, 12], [26, 28], [22, 32], [12, 32], [8, 28], [8, 12]],
  ],
  R: [
    [[0, 3], [3, 0], [26, 0], [33, 7], [33, 16], [27, 22], [34, 37], [34, 40], [25, 40], [18, 24], [9, 24], [9, 37], [6, 40], [0, 40]],
    [[9, 8], [22, 8], [25, 11], [25, 13], [22, 16], [9, 16]],
  ],
  S: [[[5, 0], [31, 0], [34, 3], [34, 8], [10, 8], [10, 16], [28, 16], [34, 22], [34, 35], [29, 40], [3, 40], [0, 37], [0, 32], [25, 32], [25, 24], [6, 24], [0, 18], [0, 5]]],
};

const FONT5x7: Record<string, string[]> = {
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
};

/** chamfer distance from each set pixel to the nearest unset pixel (outside counts as unset) */
function distIn(m: Uint8Array, w: number, h: number, max = 8): Float32Array {
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = m[i] ? max : 0;
  const D = 1.4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!m[i]) continue;
    let v = d[i];
    v = Math.min(v, x > 0 ? d[i - 1] + 1 : 1);
    v = Math.min(v, y > 0 ? d[i - w] + 1 : 1);
    v = Math.min(v, x > 0 && y > 0 ? d[i - w - 1] + D : D);
    v = Math.min(v, x < w - 1 && y > 0 ? d[i - w + 1] + D : D);
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!m[i]) continue;
    let v = d[i];
    v = Math.min(v, x < w - 1 ? d[i + 1] + 1 : 1);
    v = Math.min(v, y < h - 1 ? d[i + w] + 1 : 1);
    v = Math.min(v, x < w - 1 && y < h - 1 ? d[i + w + 1] + D : D);
    v = Math.min(v, x > 0 && y < h - 1 ? d[i + w - 1] + D : D);
    d[i] = v;
  }
  return d;
}

/** light term from a height field (n·L − L.z), non-wrapping */
function hlight(hf: Float32Array, w: number, h: number, x: number, y: number, k: number) {
  const xm = x > 0 ? x - 1 : 0, xp = x < w - 1 ? x + 1 : w - 1, ym = y > 0 ? y - 1 : 0, yp = y < h - 1 ? y + 1 : h - 1;
  const gx = (hf[y * w + xp] - hf[y * w + xm]) * 0.5 * k, gy = (hf[yp * w + x] - hf[ym * w + x]) * 0.5 * k;
  const nl = Math.sqrt(gx * gx + gy * gy + 1);
  return (-gx * LGX - gy * LGY + LGZ) / (nl * LGL) - LGZ / LGL;
}
const LGX = -0.6, LGY = -0.65, LGZ = 0.46, LGL = Math.sqrt(LGX * LGX + LGY * LGY + LGZ * LGZ);

/** "NORNS" wordmark (224×72): gold letters in a carved stone rim, a thread weaving through, subtitle. */
export function buildLogo(): HTMLCanvasElement {
  const W = 224, H = 72;
  const p = new Px(W, H);
  const word = 'NORNS';
  const lw = 34, gap = 8;
  const x0 = Math.round((W - (word.length * lw + (word.length - 1) * gap)) / 2), y0 = 5;
  const face = new Uint8Array(W * H);
  const letterOf = new Int8Array(W * H).fill(-1);
  [...word].forEach((ch, k) => {
    const m = new Uint8Array(W * H);
    fillRings(m, W, H, LETTERS[ch], x0 + k * (lw + gap), y0);
    for (let i = 0; i < W * H; i++) if (m[i]) { face[i] = 1; letterOf[i] = k; }
  });
  // stone rim: everything within ~3px of a letter face (chamfer distance on the inverted mask)
  const inv = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) inv[i] = face[i] ? 0 : 1;
  const dOut = distIn(inv, W, H, 8);
  const rim = new Uint8Array(W * H);
  const rimOf = new Int8Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (face[i] || dOut[i] > 3.3) continue;
    rim[i] = 1;
    // owner letter: nearest face pixel along the row (good enough for the weave test)
    for (let d = 1; d <= 4; d++) {
      if (x - d >= 0 && face[i - d]) { rimOf[i] = letterOf[i - d]; break; }
      if (x + d < W && face[i + d]) { rimOf[i] = letterOf[i + d]; break; }
      if (y - d >= 0 && face[i - d * W]) { rimOf[i] = letterOf[i - d * W]; break; }
      if (y + d < H && face[i + d * W]) { rimOf[i] = letterOf[i + d * W]; break; }
    }
  }
  const solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) solid[i] = face[i] | rim[i];
  // height field: rim slopes up toward the letter, the gold face is a bevelled plateau
  const dSolid = distIn(solid, W, H, 6), dFace = distIn(face, W, H, 6);
  const hf = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) hf[i] = face[i] ? 3 + Math.min(dFace[i], 2.2) : rim[i] ? Math.min(dSolid[i], 3) * 0.9 : 0;
  const G = TITLE.gold, ST = TITLE.stone;
  const grain = fbmT(5, 64, 8, 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!solid[i]) continue;
    const l = hlight(hf, W, H, x, y, 1.3);
    if (face[i]) {
      const inner = dFace[i] > 2.1;
      // vertical gold gradient (lighter at the top), dithered between bands
      const yy = (y - y0) / 40;
      let v = inner ? 0.78 - yy * 0.42 : 0.55 + l * 1.6;
      const bandV = v * (G.length - 1);
      let idx = Math.floor(bandV + (inner && ((x + y) & 1) ? 0.25 : 0) + 0.5);
      // specular streak across the upper-left of each letter
      if (inner && Math.abs((x - x0 - letterOf[i] * (lw + gap)) + (y - y0) * 0.9 - 18) < 1.2) idx += 2;
      idx = Math.max(1, Math.min(G.length - 1, idx));
      p.data[i] = G[idx];
    } else {
      let v = 0.42 + l * 1.4 + (grain(x & 63, y & 63) - 0.5) * 0.25;
      if (dSolid[i] <= 1) v -= 0.12;
      p.data[i] = ST[Math.max(0, Math.min(ST.length - 1, Math.floor(clamp01(v) * ST.length)))];
    }
  }
  // inlay groove: darker line along each stroke's centre
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!face[i] || dFace[i] < 3.6) continue;
    p.data[i] = mix(p.data[i], G[2], 0.55);
  }
  // chisel notches in the stone rim (small rune ticks)
  const rng = mulberry32(17);
  for (let k = 0; k < 40; k++) {
    const x = Math.floor(rng() * W), y = Math.floor(rng() * H);
    const i = y * W + x;
    if (rim[i] && dSolid[i] >= 2) { p.data[i] = ST[1]; if (rim[i + W + 1]) p.data[i + W + 1] = ST[5]; }
  }
  // the thread: weaves over/under alternate letters, glowing
  const TH = TITLE.thread;
  const thY = (x: number) => y0 + 20 + 15 * Math.sin((x - x0) * (TAU / 140) + 1.2) + 2 * Math.sin(x * 0.07);
  const over = (k: number) => k % 2 === 1;
  const thr = new Px(W, H);
  for (let xs = 2; xs < W - 2; xs += 0.25) {
    const y = thY(xs);
    const x = Math.round(xs), yi = Math.round(y);
    for (let dy = -1; dy <= 1; dy++) {
      const i = (yi + dy) * W + x;
      if (yi + dy < 0 || yi + dy >= H) continue;
      const k = letterOf[i] >= 0 ? letterOf[i] : rimOf[i];
      if (k >= 0 && !over(k)) {
        // passing beneath: cast a thin shadow groove on the stone/gold just above
        if (dy === -1 && aOf(p.data[i])) p.data[i] = mix(p.data[i], hex('#1a0c08'), 0.45);
        continue;
      }
      thr.set(x, yi + dy, dy < 0 ? TH[4] : dy === 0 ? (((x >> 1) & 3) === 0 ? TH[2] : TH[3]) : TH[1]);
    }
  }
  thr.outline(TH[0], false);
  // drop the outline where the thread dives under a letter so it reads as passing beneath
  p.blit(thr, 0, 0);
  // a little spindle at the thread's right end and a loose curl at the left
  const ex = W - 5, ey = Math.round(thY(W - 5));
  for (let k = -3; k <= 3; k++) { p.set(ex, ey + k, k === -3 || k === 3 ? G[2] : G[6 - Math.abs(k)]); }
  p.set(ex - 1, ey, G[5]); p.set(ex + 1, ey, G[3]); p.set(ex - 1, ey - 1, G[4]); p.set(ex + 1, ey + 1, G[2]);
  // overall dark outline
  const src = p.data.slice();
  const OL = hex('#0c0812');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (aOf(src[i])) continue;
    if ((x > 0 && aOf(src[i - 1])) || (x < W - 1 && aOf(src[i + 1])) || (y > 0 && aOf(src[i - W])) || (y < H - 1 && aOf(src[i + W]))) p.data[i] = OL;
  }
  // subtitle
  const sub = 'THREADS OF FATE';
  const cw = 6, sw = 4;
  const tw = [...sub].reduce((a, c) => a + (c === ' ' ? sw : cw), 0) - 1;
  let sx = Math.round((W - tw) / 2);
  const sy = 58;
  const subC = G[6], subS = hex('#0c0812');
  for (const ch of sub) {
    if (ch === ' ') { sx += sw; continue; }
    const g = FONT5x7[ch];
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (g[y][x] === '#') {
      p.set(sx + x + 1, sy + y + 1, subS);
      p.set(sx + x, sy + y, y < 3 ? G[7] : subC);
    }
    sx += cw;
  }
  // flanking ornaments: lines ending in diamonds
  const lx0 = Math.round((W - tw) / 2) - 6, lx1 = Math.round((W + tw) / 2) + 5;
  for (const [a, b, dir] of [[lx0 - 30, lx0, -1], [lx1, lx1 + 30, 1]] as [number, number, number][]) {
    for (let x = a; x <= b; x++) { p.set(x, sy + 3, G[4]); p.set(x, sy + 4, subS); }
    const dx = dir < 0 ? a - 2 : b + 2;
    for (const [ox, oy, c] of [[0, -2, G[6]], [-1, -1, G[6]], [0, -1, G[7]], [1, -1, G[5]], [-2, 0, G[6]], [-1, 0, G[5]], [0, 0, G[4]], [1, 0, G[3]], [2, 0, G[3]], [-1, 1, G[4]], [0, 1, G[3]], [1, 1, G[2]], [0, 2, G[2]]] as [number, number, Color][]) p.set(dx + ox, sy + 3 + oy, c);
  }
  return toCv(p);
}

// ======================================================================= Yggdrasil

const YW = 480, YH = 300;
const B4T = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** foliage clumps: scalloped 6×5 leaf clusters with lit tops and shadowed undersides */
function leafMod(x: number, y: number, _pt: number, idx: number) {
  const row = Math.floor(y / 5);
  const off = (row & 1) * 3 + ((row * 7) % 2);
  const cx = Math.floor((x + off) / 6);
  const lx = x + off - cx * 6, ly = y - row * 5;
  const r = ((cx * 374761393 + row * 668265263) >>> 0) % 7;
  if (ly === 4 && lx > 0 && lx < 5) return -2;
  if (ly === 3 && (lx === 0 || lx === 5)) return -1;
  if (ly === 0 && lx >= 1 && lx <= 3 && idx >= 3) return r < 3 ? 2 : 1;
  if (r === 0) return -1;
  return 0;
}

/** tree layer: bark tubes shaded with longitudinal grooves, rim-lit tops and a dark outline,
 *  composited straight into `p` (one pass, using the tube id buffer for occupancy) */
function shadeBark(b: TubeBuf, p: Px, ramp: Color[], seed: number) {
  const n = ramp.length;
  const gn = noise1(seed, 4096, 14);
  const lx = -0.55, ly = -0.7, lz = 0.45, ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
  const W = b.w, ids = b.id;
  const ol = hex('#0a0608'), rim = ramp[n - 1];
  for (let y = 1; y < b.h - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const id = ids[i];
    if (id < 0) {
      if (ids[i - 1] >= 0 || ids[i + 1] >= 0 || ids[i - W] >= 0 || ids[i + W] >= 0) p.data[i] = ol;
      continue;
    }
    const nx = b.nx[i], ny = b.ny[i];
    if (ids[i - W] < 0 && ny < -0.3) { p.data[i] = rim; continue; }
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const t = 0.1 + 0.9 * Math.max(0, (nx * lx + ny * ly + nz * lz) / ll);
    let idx = Math.floor(clamp01(t) * n * 0.999);
    const gv = fsin(b.ac[i] * 9 + gn(b.al[i] * 1.6 + id * 300) * 5);
    if (gv > 0.62) idx -= 2; else if (gv > 0.3) idx -= 1; else if (gv < -0.85 && t > 0.4) idx += 1;
    const zz = b.z[i] + 2;
    if ((ids[i - 1] >= 0 && ids[i - 1] !== id && b.z[i - 1] > zz) || (ids[i - W] >= 0 && ids[i - W] !== id && b.z[i - W] > zz) ||
        (ids[i + 1] >= 0 && ids[i + 1] !== id && b.z[i + 1] > zz) || (ids[i + W] >= 0 && ids[i + W] !== id && b.z[i + W] > zz)) idx = 0;
    p.data[i] = ramp[idx < 0 ? 0 : idx >= n ? n - 1 : idx];
  }
}

/** a realm orb: glass sphere with a tiny diorama inside */
function realmOrb(p: Px, cx: number, cy: number, r: number, realm: RealmId) {
  const P = ENV[realm];
  const sky = realm === 'midgard' ? [hex('#3a3270'), hex('#c87a7a'), hex('#f6c890')] : realm === 'niflheim' ? [hex('#060c22'), hex('#123050'), hex('#2a5a6c')] : [hex('#1a0606'), hex('#6a1a0e'), hex('#d0581a')];
  const rim = realm === 'midgard' ? hex('#c6e07a') : realm === 'niflheim' ? hex('#a8e8ff') : hex('#ffb050');
  glow(p, cx, cy, r + 14, rim, 1.1, false);
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const u = (x - cx) / (r + 0.5), v = (y - cy) / (r + 0.5);
    const d2 = u * u + v * v;
    if (d2 > 1) continue;
    const t = (v + 1) / 2;
    let c = t < 0.5 ? mix(sky[0], sky[1], t * 2) : mix(sky[1], sky[2], (t - 0.5) * 2);
    // diorama
    const gx = u * r, gy = v * r;
    if (realm === 'midgard') {
      const hill = r * 0.25 + Math.sin(gx * 0.35) * 2.5;
      if (gy > hill) c = gy > hill + 2 ? P.earth.body[3] : P.earthTop[4];
      const mtn = r * 0.05 - (6 - Math.abs(gx + 4) * 0.8);
      if (gy > mtn && gy <= hill && Math.abs(gx + 4) < 7) c = gy < mtn + 2 ? hex('#f6dce0') : hex('#9a86b0');
      if (Math.abs(gx - 5) < 1 && gy > hill - 5 && gy <= hill) c = P.root.body[2];
      if ((gx - 5) ** 2 + (gy - hill + 6) ** 2 < 7) c = P.leaf[(gx - 5) + (gy - hill + 6) < 0 ? 4 : 2];
    } else if (realm === 'niflheim') {
      if (Math.abs(gy + r * 0.35 + Math.sin(gx * 0.4) * 2) < 1.5) c = mix(c, hex('#62f2a6'), 0.6);
      const sp = [[-6, 9], [0, 13], [6, 8]];
      for (const [sxp, h] of sp) if (gy > r * 0.45 - h + Math.abs(gx - sxp) * 2.2 && gy < r) c = gx < sxp ? P.ice.body[5] : P.ice.body[3];
      if (gy > r * 0.45) c = P.sand.body[gy > r * 0.55 ? 3 : 5];
    } else {
      const vol = r * 0.1 + Math.abs(gx) * 1.1;
      if (gy > vol) c = Math.abs(gx) < 2 && gy < vol + 3 ? hex('#ffd060') : P.rock.body[gx < 0 ? 4 : 2];
      if (gy > r * 0.55) c = (Math.floor(gx + gy) & 3) === 0 ? hex('#ffd060') : hex('#ff6a1a');
      if (gy < vol - 2 && Math.abs(gx - gy * -0.2) < 2 + (-gy) * 0.15 && gy > -r) c = mix(c, hex('#3a1a1a'), 0.6);
    }
    // glass shading: darker rim, bright top-left highlight
    if (d2 > 0.78) c = mix(c, hex('#0c0814'), 0.35);
    if ((u + 0.42) ** 2 + (v + 0.45) ** 2 < 0.05) c = mix(c, hex('#ffffff'), 0.75);
    else if ((u + 0.3) ** 2 + (v + 0.55) ** 2 < 0.13 && d2 > 0.55) c = mix(c, hex('#ffffff'), 0.35);
    p.set(x, y, c);
  }
  // rim ring
  for (let a = 0; a < TAU; a += 0.02) {
    const x = Math.round(cx + Math.cos(a) * (r + 1)), y = Math.round(cy + Math.sin(a) * (r + 1));
    const lit = Math.cos(a - 3.9) > 0.3;
    p.set(x, y, lit ? rim : mix(rim, hex('#140c18'), 0.6));
  }
}

/** cosmic twilight sky: dithered gradient bands + nebula */
function drawSky(p: Px) {
  const stops = [hex('#07061a'), hex('#120e30'), hex('#22164a'), hex('#2e1e56'), hex('#1e2c52'), hex('#18384a')];
  const nebF = fbmT(41, 128, 32, 3);
  const neb = new Float32Array(128 * 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) neb[y * 128 + x] = nebF(x, y);
  const nebC = hex('#6a3a8a');
  const bands = 24;
  const bandCol = (b: number) => {
    const s = (Math.max(0, Math.min(bands, b)) / bands) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(s));
    return mix(stops[i], stops[i + 1], s - i);
  };
  for (let y = 0; y < YH; y++) {

    const t = y / (YH - 1);
    const tb = t * bands;
    const b0 = Math.floor(tb), f = tb - b0;
    const c0 = bandCol(b0), c1 = bandCol(b0 + 1);
    const nebAmt = smooth(0, 0.4, 1 - Math.abs(t - 0.35) * 2);
    const brow = (y & 3) * 4, nrow = (y & 127) * 128;
    for (let x = 0; x < YW; x++) {
      const bz = B4T[brow + (x & 3)];
      let c = f > bz ? c1 : c0;
      if (nebAmt > 0) {
        const q = Math.floor(neb[nrow + (x & 127)] * nebAmt * 6 + bz * 0.8) / 6;
        if (q > 0.55) c = mix(c, nebC, (q - 0.55) * 0.9);
      }
      p.data[y * YW + x] = c;
    }
  }
}

/** 480×300 world tree with realm fruits; returns realm centres for map nodes. */
export function buildYggdrasil(): { canvas: HTMLCanvasElement; realms: Record<RealmId, { x: number; y: number }> } {
  const p = new Px(YW, YH);
  const realms: Record<RealmId, { x: number; y: number }> = {
    midgard: { x: 122, y: 200 },
    niflheim: { x: 362, y: 140 },
    muspelheim: { x: 206, y: 58 },
  };
  // --- sky: cosmic twilight with dithered bands, nebula and stars
  drawSky(p);
  const rng = mulberry32(99);
  for (let k = 0; k < 220; k++) {
    const x = Math.floor(rng() * YW), y = Math.floor(rng() * YH * 0.8), b = rng();
    p.set(x, y, b > 0.95 ? hex('#fff6dc') : b > 0.7 ? hex('#b8b4e0') : hex('#6a6aa0'));
    if (b > 0.985) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + dx, y + dy, hex('#8a84c0'));
  }
  // distant mist banks at the base
  const mist = noise1(7, 480, 40);
  for (let x = 0; x < YW; x++) {
    const top = 246 + mist(x) * 24;
    for (let y = Math.floor(top); y < YH; y++) {
      const f = smooth(top, YH, y);
      p.data[y * YW + x] = mix(p.data[y * YW + x], hex('#5a5a8a'), 0.25 + f * 0.35);
    }
  }
  // --- canopy back layer (behind branches)
  const CH = 200;
  const canopy = new Sculpt(YW, CH);
  const leafR = mulberry32(5);
  const puffs: [number, number, number][] = [];
  const clusters: [number, number, number, number][] = [[240, 70, 150, 48], [120, 150, 70, 34], [370, 110, 80, 36], [200, 40, 70, 24], [300, 46, 70, 26]];
  for (const [cx, cy, rx, ry] of clusters) for (let k = 0; k < 26; k++) {
    const a = leafR() * TAU, d = Math.sqrt(leafR());
    puffs.push([cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 9 + leafR() * 10]);
  }
  puffs.sort((a, b) => a[1] - b[1]);
  puffs.forEach(([x, y, r], k) => canopy.ell(x, y, r, r * 0.85, k * 0.3, r * 0.9, 0));
  const lp = canopy.render([{ ramp: TITLE.canopy, amb: 0.06, dif: 1, outline: hex('#060c14') }], { mod: leafMod });
  // one pass: ragged leafy silhouette (nibble/sprout edge pixels), depth dim, composite
  {
    const src = lp.data;
    const dimC = hex('#1a2440'), sprout = mix(TITLE.canopy[6], dimC, 0.15), tuft = mix(TITLE.canopy[5], dimC, 0.15);
    const cache = new Map<number, Color>();
    for (let y = 1; y < CH - 1; y++) for (let x = 1; x < YW - 1; x++) {
      const i = y * YW + x;
      const c = src[i];
      const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      if (c >>> 24) {
        if ((!(src[i - YW] >>> 24) || !(src[i - 1] >>> 24) || !(src[i + 1] >>> 24)) && (h % 5) === 0) continue;
        let o = cache.get(c);
        if (o === undefined) { o = mix(c, dimC, 0.15); cache.set(c, o); }
        p.data[i] = o;
      } else if (src[i + YW] >>> 24) {
        if ((h % 4) === 0) p.data[i] = sprout;
        else if (((x * 5 + y) % 4) === 0 && !(src[i + YW + 1] >>> 24 === 0)) p.data[i] = tuft;
      }
    }
  }

  // --- trunk, roots and branches as gnarled bark tubes
  const b = tubeBuf(YW, YH);
  let id = 0;
  // twisted trunk: three strands spiralling upward
  for (let s = 0; s < 3; s++) {
    const pts: [number, number][] = [], rad: number[] = [];
    for (let k = 0; k <= 28; k++) {
      const t = k / 28;
      const y = 300 - t * 205;
      const w = 18 - t * 8;
      pts.push([240 + Math.sin(t * 5 + s * 2.1) * w * 0.9 + (t > 0.85 ? (s - 1) * (t - 0.85) * 160 : 0), y]);
      rad.push((15 - t * 6) * (1 + 0.3 * Math.max(0, 0.15 - t) * 6));
    }
    tube(b, pts, rad, 30 + s * 2 + 0, id++, false);
  }
  // roots spreading to the bottom edges, into the well
  const roots: number[][][] = [
    [[230, 270], [190, 270], [120, 280], [20, 300]],
    [[250, 270], [300, 268], [380, 284], [470, 300]],
    [[236, 280], [210, 292], [180, 300], [160, 310]],
    [[246, 280], [270, 290], [300, 300], [320, 312]],
    [[226, 262], [160, 250], [90, 262], [40, 280]],
    [[254, 262], [330, 248], [400, 262], [440, 278]],
  ];
  roots.forEach((r, k) => { const g = gnarl(r, 22, 13 - (k > 3 ? 4 : 0), 3, 300 + k, 2.5); g.rad = g.rad.map((_v, i) => Math.max(2, (13 - (k > 3 ? 4 : 0)) * (1 - i / 22) + 2)); tube(b, g.pts, g.rad, 20 - k, id++, false); });
  // branches to the realms (and a few more)
  const branches: [number[][], number, number][] = [
    [[[232, 150], [200, 180], [160, 196], [realms.midgard.x + 14, realms.midgard.y + 12]], 11, 4],
    [[[248, 128], [290, 120], [330, 150], [realms.niflheim.x - 14, realms.niflheim.y + 10]], 10, 4],
    [[[236, 100], [226, 84], [214, 80], [realms.muspelheim.x + 4, realms.muspelheim.y + 16]], 9, 3.5],
    [[[244, 98], [280, 70], [320, 50], [360, 38]], 8, 2.5],
    [[[236, 110], [180, 110], [140, 120], [96, 130]], 8, 2.5],
    [[[250, 140], [300, 180], [350, 196], [400, 200]], 7, 2],
  ];
  branches.forEach(([pts, r0, r1], k) => {
    const g = gnarl(pts, 24, r0, r1, 500 + k, 2);
    g.rad = g.rad.map((_, i) => r1 + (r0 - r1) * Math.pow(1 - i / 24, 1.3));
    tube(b, g.pts, g.rad, 40 + k, id++, false);
    // twigs
    for (let j = 0; j < 3; j++) {
      const i0 = 7 + j * 5;
      const [sx, sy] = g.pts[i0];
      const dir = (k + j) % 2 ? -1 : 1;
      const tw = gnarl([[sx, sy], [sx + 6, sy - 10 * dir], [sx + 14, sy - 14 * dir], [sx + 20, sy - 22 * dir]], 6, 3, 1, 700 + k * 9 + j, 1);
      tw.rad = tw.rad.map((_, i) => 3 - i * 0.36);
      tube(b, tw.pts, tw.rad, 38 + k, id++, false);
    }
  });
  shadeBark(b, p, TITLE.bark, 3);

  // --- the Well of Urðr: a glowing pool among the roots, with three tiny hooded Norns
  for (let y = 284; y < 300; y++) for (let x = 200; x < 282; x++) {
    const u = (x - 241) / 38, v = (y - 292) / 7;
    if (u * u + v * v > 1) continue;
    const ripple = Math.sin(Math.sqrt(u * u * 4 + v * v) * 9) > 0.6;
    p.set(x, y, u * u + v * v > 0.8 ? hex('#3a6a7a') : ripple ? hex('#c8f4ff') : hex('#6ac0d8'));
  }
  glow(p, 241, 290, 40, hex('#6ac0d8'), 0.6, false);
  const norn = (x: number, y: number, c: Color) => {
    const rows = ['..#..', '.###.', '.#o#.', '.###.', '#####', '#####', '.#.#.'];
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') p.set(x + i, y + j, c); else if (ch === 'o') p.set(x + i, y + j, hex('#f6e8d2')); }));
  };
  norn(214, 278, hex('#3a4a8a')); norn(237, 280, hex('#8a3a5a')); norn(260, 278, hex('#3a6a4a'));

  // --- golden threads spiralling up the trunk and out along the branches
  const TH = TITLE.thread;
  for (let s = 0; s < 2; s++) {
    for (let y = 296; y > 96; y -= 0.25) {
      const ph = y * 0.07 + s * Math.PI;
      const front = Math.cos(ph) > 0;
      if (!front) continue;
      const w = 20 - (296 - y) * 0.04;
      const x = 240 + Math.sin(ph) * w;
      p.set(Math.round(x), Math.round(y), (Math.round(y) % 9) === 0 ? TH[4] : TH[3]);
    }
  }
  for (const r of Object.values(realms)) {
    // a thread from the trunk to each realm
    for (let t = 0; t <= 1; t += 0.004) {
      const x = 240 + (r.x - 240) * t, y = 120 + (r.y - 120) * t - Math.sin(t * Math.PI) * 18;
      if ((Math.floor(t * 250) & 3) !== 3) p.set(Math.round(x), Math.round(y), TH[2]);
    }
  }
  // --- foreground leaf clusters framing the realms
  const fr = mulberry32(8);
  for (const [cx, cy, n] of [[92, 132, 9], [400, 202, 8], [356, 40, 8], [150, 108, 6], [290, 52, 7]] as [number, number, number][]) {
    const fg = new Sculpt(56, 40);
    for (let k = 0; k < n; k++) fg.ell(28 + (fr() - 0.5) * 30, 20 + (fr() - 0.5) * 16, 5 + fr() * 6, 4 + fr() * 5, k, 5, 0);
    const fgp = fg.render([{ ramp: TITLE.canopy, amb: 0.1, dif: 1, outline: hex('#060c14') }], { mod: (x, y, pt, idx) => leafMod(x + cx, y + cy, pt, idx) });
    p.blit(fgp, cx - 28, cy - 20);
  }
  // --- the realm fruits
  realmOrb(p, realms.midgard.x, realms.midgard.y, 19, 'midgard');
  realmOrb(p, realms.niflheim.x, realms.niflheim.y, 19, 'niflheim');
  realmOrb(p, realms.muspelheim.x, realms.muspelheim.y, 19, 'muspelheim');
  // fireflies / motes of fate
  for (let k = 0; k < 40; k++) {
    const x = Math.floor(rng() * YW), y = Math.floor(rng() * 250);
    p.set(x, y, k % 3 === 0 ? TH[4] : hex('#fff2b0', 160));
  }
  return { canvas: toCv(p), realms };
}
