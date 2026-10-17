// The Wyrdling: a small hooded spirit trailing a golden thread of fate. 16×16 cells, anchor (8,15),
// facing right. Built from a small rig: a hand-pixelled head/face map, a procedural hood tip
// (secondary motion), a shaded bell-shaped cloak, 1-px sleeves with pale paws, tiny boots and a
// swaying golden thread. Props (staff, pickaxe, leaf-cloak, runes) are drawn per animation.
// Everything is deterministic (no Math.random).

import { Px, hash2, mix, aOf, type Color } from './px';
import type { Anim, SpriteLib } from './types';
import {
  HOOD, FACE, CLOAK, BOOT, GOLD, EYE, EYE_HI, GLINT, BLUSH, CAVITY, LEAF, WOOD, IRON, RUNE, FIRE, ICE, WATER,
  EARTH, ASH, selout, stamp, shadeMask, tintPx, sparkle, glow, pixelPerfect, clamp, type Key,
} from './palette';

const S = 16;
const ON = 0xffffffff >>> 0;
const D2R = Math.PI / 180;

type Eyes = 'open' | 'blink' | 'wide' | 'down' | 'squint' | 'happy' | 'shut' | 'up' | 'none';

interface Arm { sx: number; sy: number; hx: number; hy: number; fist?: boolean }
interface ThreadOpt {
  ax?: number; ay?: number; ang?: number; len?: number; phase?: number; amp?: number; grav?: number;
  glow?: boolean; spark?: number;
}
interface BodyP { cx: number; top: number; bot: number; wt: number; wb: number; lean: number; hem: number }

interface Pose {
  o?: [number, number];
  head?: [number, number] | null;
  eyes?: Eyes;
  tip?: [number, number];
  tipS?: Tip;
  tipLen?: number;
  body?: Partial<BodyP> | null;
  bb?: Arm | null;
  bf?: Arm | null;
  fb?: [number, number] | null;
  ff?: [number, number] | null;
  thread?: ThreadOpt | null;
  pre?: (r: Rig) => void;
  mid?: (r: Rig) => void;
  post?: (r: Rig) => void;
  fx?: (r: Rig) => void;
}

const BODY: BodyP = { cx: 8.5, top: 11, bot: 14, wt: 7, wb: 8, lean: 0, hem: 0 };
const HEAD_AT: [number, number] = [3, 5];

// --- Head ------------------------------------------------------------------------------------
// Hand-pixelled hood + face, fill only (the outline is added by selout). 13×11 maps whose (0,0)
// sits at cell (hx-3, hy-5) for a head position (hx,hy); the default (3,5) puts the face at
// x 7–11, rows 8–10. Digits index HOOD (0 = internal crease line); k = cavity under the brim;
// a/b/c = face light/mid/shadow; p = blush. One map per hood-tip state, so the floppy point can
// lag behind the body (secondary motion). Eyes are overlaid: far eye x=8, near eye x=10.
type Tip = 'high' | 'mid' | 'low' | 'up' | 'up2' | 'down';
const FACE_ROWS = [
  '.....234kkk3.',
  '.....2kabbba.',
  '.....2kabbba.',
  '.....12kbbcp.',
];
const HEADS: Record<Tip, string[]> = {
  high: [
    '.............',
    '.............',
    '.............',
    '..34.........',
    '..2344555....',
    '....334555...',
    '.....344444..',
    ...FACE_ROWS,
  ],
  mid: [
    '.............',
    '.............',
    '.............',
    '.............',
    '.....34554...',
    '..234345555..',
    '.12..344444..',
    ...FACE_ROWS,
  ],
  low: [
    '.............',
    '.............',
    '.............',
    '.............',
    '.....34554...',
    '...2334555...',
    '.2340344444..',
    '.2...234kkk3.',
    '.1...2kabbba.',
    '.....2kabbba.',
    '.....12kbbcp.',
  ],
  up: [
    '.............',
    '...4.........',
    '...34........',
    '...234.......',
    '...2334554...',
    '....334555...',
    '.....344444..',
    ...FACE_ROWS,
  ],
  up2: [
    '.............',
    '..4..........',
    '..34.........',
    '...34........',
    '...2344554...',
    '....334555...',
    '.....344444..',
    ...FACE_ROWS,
  ],
  down: [
    '.............',
    '.............',
    '.............',
    '.............',
    '.....34554...',
    '...2334555...',
    '..23.344444..',
    '..2..234kkk3.',
    '..2..2kabbba.',
    '..1..2kabbba.',
    '.....12kbbcp.',
  ],
};
const HEAD_KEY: Key = {
  '0': HOOD[0], '1': HOOD[1], '2': HOOD[2], '3': HOOD[3], '4': HOOD[4], '5': HOOD[5],
  k: CAVITY, a: FACE[3], b: FACE[2], c: FACE[1], p: BLUSH,
};
/** legacy angle → tip state (angles: 90 up, 180 straight back, 270 down) */
function tipState(ang: number): Tip {
  if (ang < 95) return 'up';
  if (ang < 125) return 'up2';
  if (ang < 160) return 'high';
  if (ang < 180) return 'mid';
  if (ang < 216) return 'low';
  return 'down';
}

// --- Rig -------------------------------------------------------------------------------------

class Rig {
  under = new Px(S, S);
  p = new Px(S, S);
  fx = new Px(S, S);
  ox = 0;
  oy = 0;

  set(x: number, y: number, c: Color) { this.p.set(x + this.ox, y + this.oy, c); }
  get(x: number, y: number) { return this.p.get(x + this.ox, y + this.oy); }
  fset(x: number, y: number, c: Color) { this.fx.set(x + this.ox, y + this.oy, c); }
  line(x0: number, y0: number, x1: number, y1: number, c: Color) { this.p.line(x0 + this.ox, y0 + this.oy, x1 + this.ox, y1 + this.oy, c); }

  body(b: BodyP, ramp: Color[] = CLOAK) {
    const m = new Px(S, S);
    for (let y = b.top; y <= b.bot; y++) {
      const t = b.bot === b.top ? 1 : (y - b.top) / (b.bot - b.top);
      const cx = b.cx + b.lean * (1 - t) + (y === b.bot ? b.hem : 0);
      const hw = (b.wt + (b.wb - b.wt) * t) / 2;
      const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw) - 1;
      for (let x = x0; x <= x1; x++) m.set(x + this.ox, y + this.oy, ON);
    }
    shadeMask(m, ramp, this.p, 2);
    // shoulders catch the light: brighten the collar row's left half
    const x0 = Math.round(b.cx + b.lean - b.wt / 2);
    for (let i = 1; i <= 2; i++) if (aOf(m.get(x0 + i + this.ox, b.top + this.oy))) this.set(x0 + i, b.top, ramp[4]);
    // a fold in the hem
    if (b.bot - b.top >= 3) {
      const hx = Math.round(b.cx + b.hem);
      this.set(hx, b.bot - 1, ramp[1]);
      this.set(hx, b.bot, ramp[0]);
    }
  }

  head(hx: number, hy: number, eyes: Eyes, tip: Tip = 'mid') {
    stamp(this.p, HEADS[tip], HEAD_KEY, hx - 3 + this.ox, hy - 5 + this.oy);
    this.eyes(hx, hy, eyes);
  }

  /** eye overlay; (hx,hy) = head position, far eye at (hx+5, hy+3), near eye at (hx+7, hy+3) */
  eyes(hx: number, hy: number, e: Eyes) {
    const s = (x: number, y: number, c: Color) => this.set(hx + x, hy + y, c);
    const F = 5, N = 7, T = 3;
    switch (e) {
      case 'open':
        s(F, T, EYE_HI); s(F, T + 1, EYE); s(N, T, EYE_HI); s(N, T + 1, EYE);
        break;
      case 'up':
        s(F, T, EYE); s(F, T + 1, EYE_HI); s(N, T, EYE); s(N, T + 1, EYE_HI);
        break;
      case 'wide':
        s(F, T, GLINT); s(F, T + 1, EYE); s(N, T, GLINT); s(N, T + 1, EYE); s(6, T + 2, EYE);
        break;
      case 'down':
        s(F, T + 1, EYE); s(N, T + 1, EYE); s(F, T, FACE[1]); s(N, T, FACE[1]);
        break;
      case 'blink': case 'shut':
        s(F - 1, T + 1, FACE[0]); s(F, T + 1, EYE); s(N, T + 1, EYE); s(N + 1, T + 1, FACE[0]);
        break;
      case 'squint':
        s(F, T + 1, EYE); s(F - 1, T, FACE[0]); s(N, T + 1, EYE); s(N + 1, T, FACE[0]);
        break;
      case 'happy':
        s(F, T, EYE); s(N, T, EYE); s(F - 1, T + 1, FACE[1]); s(N + 1, T + 1, FACE[1]);
        break;
      case 'none':
        break;
    }
  }

  arm(a: Arm, front: boolean) {
    const sl = front ? CLOAK[3] : CLOAK[1];
    const sh = front ? CLOAK[4] : CLOAK[2];
    const pts: [number, number][] = [];
    bres(a.sx, a.sy, a.hx, a.hy, pts);
    pts.forEach(([x, y], i) => { if (i < pts.length - 1) this.set(x, y, i === 0 ? sh : sl); });
    this.paw(a.hx, a.hy, front, a.fist);
  }

  paw(x: number, y: number, front: boolean, fist?: boolean) {
    if (fist) {
      this.set(x, y, GOLD[4]); this.set(x + 1, y, GOLD[3]); this.set(x, y + 1, GOLD[3]); this.set(x + 1, y + 1, GOLD[2]);
    } else this.set(x, y, front ? FACE[2] : FACE[1]);
  }

  boot(x: number, y: number, front: boolean) {
    this.set(x, y, front ? BOOT[1] : BOOT[0]);
    this.set(x + 1, y, front ? BOOT[2] : BOOT[1]);
  }

  thread(o: ThreadOpt, layer: Px = this.under) {
    const ax = (o.ax ?? 5) + this.ox, ay = (o.ay ?? 12) + this.oy;
    const len = o.len ?? 6, ang = (o.ang ?? 188) * D2R, amp = o.amp ?? 0.8, ph = o.phase ?? 0, grav = o.grav ?? 1;
    const dx = Math.cos(ang), dy = -Math.sin(ang);
    const nx = -dy, ny = dx;
    const raw: [number, number][] = [];
    for (let i = 0; i <= len * 4; i++) {
      const s = i / 4, t = s / len;
      const w = amp * Math.sin(ph - s * 1.05) * t;
      raw.push([Math.round(ax + dx * s + nx * w), Math.round(ay + dy * s + ny * w + grav * t * t)]);
    }
    const pts = pixelPerfect(raw);
    const n = pts.length;
    const sp = o.spark ?? 0;
    for (let i = 1; i < n; i++) {
      const [x, y] = pts[i];
      const t = i / (n - 1);
      // twisted cord: bright strand with darker twists, a travelling glint, frayed dim end
      let col = (i + sp) % 3 === 0 ? GOLD[2] : GOLD[3];
      if ((i + sp * 2) % 7 === 0) col = GOLD[5];
      if (t > 0.85) col = GOLD[1];
      if (o.glow) col = (i + sp) % 3 === 0 ? GOLD[5] : GOLD[4];
      layer.set(x, y, col);
    }
    if (o.glow) for (const [x, y] of pts) glow(this.fx, x, y, 2, GOLD[4], 0.18);
  }

  finish(fx?: (r: Rig) => void): Px {
    selout(this.p);
    fx?.(this);
    const out = new Px(S, S);
    out.blit(this.under, 0, 0);
    out.blit(this.p, 0, 0);
    out.blit(this.fx, 0, 0, false, true);
    return out;
  }
}

function bres(x0: number, y0: number, x1: number, y1: number, out: [number, number][]) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

const DEF_BF: Arm = { sx: 11, sy: 12, hx: 12, hy: 13 };

function pose(P: Pose): Px {
  const r = new Rig();
  [r.ox, r.oy] = P.o ?? [0, 0];
  const head = P.head === null ? null : (P.head ?? HEAD_AT);
  if (P.thread !== null) r.thread({ ...(P.thread ?? {}) });
  P.pre?.(r);
  if (P.bb) r.arm(P.bb, false);
  if (P.fb !== null) { const [x, y] = P.fb ?? [5, 15]; r.boot(x, y, false); }
  if (P.body !== null) r.body({ ...BODY, ...(P.body ?? {}) });
  if (P.ff !== null) { const [x, y] = P.ff ?? [9, 15]; r.boot(x, y, true); }
  P.mid?.(r);
  if (head) r.head(head[0], head[1], P.eyes ?? 'open', P.tipS ?? tipState(P.tip?.[0] ?? 170));
  if (P.bf !== null) r.arm(P.bf ?? DEF_BF, true);
  P.post?.(r);
  return r.finish(P.fx);
}

const anim = (frames: Px[], ax = 8, ay = 15): Anim => ({ frames: frames.map((f) => f.toCanvas()), ax, ay });
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

// --- Props -----------------------------------------------------------------------------------

/** pickaxe gripped at (hx,hy), handle pointing `ang` degrees (0 = right, 90 = up) */
function pickaxe(r: Rig, hx: number, hy: number, ang: number) {
  const a = ang * D2R, dx = Math.cos(a), dy = -Math.sin(a);
  const pts: [number, number][] = [];
  bres(hx - dx, hy - dy, hx + dx * 4.6, hy + dy * 4.6, pts);
  pts.forEach(([x, y], i) => r.set(x, y, i % 2 ? WOOD[2] : WOOD[3]));
  const hx2 = hx + dx * 5.2, hy2 = hy + dy * 5.2;
  const nx = -dy, ny = dx;
  // blade: curved crescent perpendicular to the handle, tips swept back toward the grip
  const head: [number, number, Color][] = [];
  for (let s = -3; s <= 3; s += 0.5) {
    const back = 0.22 * s * s;
    const x = Math.round(hx2 + nx * s - dx * back), y = Math.round(hy2 + ny * s - dy * back);
    const col = Math.abs(s) >= 2.5 ? IRON[4] : s < 0 ? IRON[3] : IRON[2];
    head.push([x, y, col]);
  }
  for (const [x, y, col] of head) r.set(x, y, col);
  r.set(Math.round(hx2), Math.round(hy2), IRON[1]);
}

function glowRuneStaff(r: Rig, y: number, lvl: number) {
  for (let x = 2; x <= 13; x++) {
    r.set(x, y, x % 2 ? WOOD[4] : WOOD[3]);
    r.set(x, y + 1, WOOD[1]);
  }
  // glowing rune-crystal caps at both ends
  const core = [GOLD[4], GOLD[5], GOLD[5]][lvl], edge = [GOLD[2], GOLD[3], GOLD[4]][lvl];
  for (const cx of [1, 14]) {
    r.set(cx, y - 1, edge); r.set(cx, y, core); r.set(cx, y + 1, edge);
    r.set(cx + (cx < 8 ? -1 : 1), y, edge);
  }
}

function plank(r: Rig, x: number, y: number, len: number, bright: boolean) {
  for (let i = 0; i < len; i++) {
    r.set(x + i, y, (i % 2 ? GOLD[4] : GOLD[3]));
    r.set(x + i, y + 1, (i % 2 ? GOLD[2] : GOLD[3]));
  }
  if (bright) for (let i = 0; i < len; i += 2) r.set(x + i, y, GOLD[5]);
}

function runeStone(r: Rig, x: number, y: number, lit: number) {
  r.set(x, y, RUNE[2]); r.set(x + 1, y, RUNE[3]); r.set(x - 1, y, RUNE[1]);
  r.set(x, y - 1, RUNE[3]); r.set(x, y + 1, RUNE[1]);
  r.set(x, y, lit > 0 ? RUNE[5] : RUNE[4]);
}

/** big leaf held overhead as a canopy: arched blade, light top edge, veined underside, pointed tip */
function leafCanopy(r: Rig, cx: number, half: number, arch: number, tilt: number, top: number) {
  const m = new Px(S, S);
  const x0 = Math.ceil(cx - half), x1 = Math.floor(cx + half);
  const yTop = (x: number) => { const t = (x - cx) / half; return top + Math.round(arch * t * t + tilt * t); };
  const thick = (x: number) => { const t = Math.abs((x - cx) / half); return t < 0.35 ? 3 : t < 0.75 ? 2 : 1; };
  for (let x = x0; x <= x1; x++) for (let k = 0; k < thick(x); k++) m.set(x + r.ox, yTop(x) + k + r.oy, ON);
  // pointed tip curling down at the front, stalk stub at the back
  m.set(x1 + 1 + r.ox, yTop(x1) + 1 + r.oy, ON);
  shadeMask(m, LEAF, r.p, 3);
  for (let x = x0; x <= x1; x++) {
    const y = yTop(x), th = thick(x);
    r.set(x, y, (x + 1) % 3 === 0 ? LEAF[5] : LEAF[4]); // serrated light edge
    if (th >= 2) r.set(x, y + th - 1, LEAF[1]);           // shaded underside
    if (th === 3) r.set(x, y + 1, x % 2 ? LEAF[3] : LEAF[2]);
  }
  // veins fanning from the midrib on the underside
  for (const vx of [Math.round(cx) - 4, Math.round(cx) - 1, Math.round(cx) + 2, Math.round(cx) + 5]) {
    if (vx > x0 && vx < x1) r.set(vx, yTop(vx) + thick(vx) - 1, LEAF[0]);
  }
  r.set(x0 - 1, yTop(x0) + 1, WOOD[3]);
}

// --- Animations -----------------------------------------------------------------------------

function walk(): Px[] {
  const bob = [1, 1, 0, 0, 1, 1, 0, 0];
  const ff: [number, number][] = [[11, 15], [10, 15], [9, 15], [7, 15], [5, 15], [6, 14], [8, 14], [10, 14]];
  const fb: [number, number][] = [[4, 15], [5, 14], [7, 14], [9, 14], [10, 15], [9, 15], [7, 15], [5, 15]];
  // arms swing opposite to the legs; paws stay at the cloak's edge so they never read as buttons
  const pf: [number, number][] = [[12, 13], [12, 13], [12, 13], [13, 13], [13, 12], [13, 12], [13, 13], [12, 13]];
  const pb: [number, number][] = [[5, 13], [5, 13], [4, 13], [4, 13], [3, 12], [3, 12], [4, 13], [4, 13]];
  const tips: Tip[] = ['high', 'high', 'mid', 'mid', 'high', 'high', 'mid', 'mid'];
  return range(8).map((f) => {
    const b = bob[f];
    return pose({
      head: [3, 5 + b],
      body: { top: 11 + b, hem: f % 4 < 2 ? 0 : -1 },
      ff: ff[f], fb: fb[f],
      bf: { sx: 11, sy: 11 + b, hx: pf[f][0], hy: pf[f][1] + (pf[f][1] === 12 ? b : 0) },
      bb: { sx: 6, sy: 11 + b, hx: pb[f][0], hy: pb[f][1] + (pb[f][1] === 12 ? b : 0) },
      tipS: tips[f],
      thread: { phase: (f * Math.PI) / 4, amp: 1, ay: 12 + b, spark: f },
    });
  });
}

function fall(): Px[] {
  return range(4).map((f) => pose({
    eyes: 'wide',
    tip: [[78, 96, 72, 100][f], [-0.15, 0.12, -0.08, 0.16][f]],
    bf: { sx: 10, sy: 11, hx: [13, 12, 13, 12][f], hy: [8, 7, 7, 8][f] },
    bb: { sx: 6, sy: 11, hx: [2, 3, 2, 3][f], hy: [7, 8, 8, 7][f] },
    body: { wb: 8, hem: [0, -1, 0, 1][f] },
    ff: [10, f % 2 ? 14 : 15], fb: [4, f % 2 ? 15 : 14],
    thread: { ang: 130, grav: -1.2, phase: (f * Math.PI) / 2, amp: 1.2, spark: f },
  }));
}

/** curled ball, rotated 90° clockwise per frame, re-lit from the top-left after rotation */
function tumble(): Px[] {
  // part ids: 1 hood, 2 face, 3 cloak, 4 boot, 5 paw, 6 eye
  const base = new Uint8Array(S * S);
  const put = (x: number, y: number, id: number) => { if (x >= 0 && y >= 0 && x < S && y < S) base[y * S + x] = id; };
  const ell = (cx: number, cy: number, rx: number, ry: number, id: number) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) put(x, y, id);
    }
  };
  ell(8.6, 11.2, 4.2, 3.6, 3);
  ell(7.4, 8.8, 4.4, 4.0, 1);
  put(3, 6, 1); put(2, 5, 1); put(2, 6, 1); put(1, 4, 1);
  ell(10, 9.8, 2.2, 1.9, 2);
  put(9, 9, 6); put(11, 9, 6);
  put(11, 12, 5); put(12, 11, 5);
  put(10, 14, 4); put(11, 14, 4); put(12, 13, 4);
  const frames: Px[] = [];
  let ids = base;
  for (let k = 0; k < 4; k++) {
    const r = new Rig();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const id = ids[y * S + x];
      if (!id) continue;
      const nx = (x + 0.5 - 8) / 5, ny = (y + 0.5 - 10) / 5;
      const l = -(nx * 0.72 + ny * 0.7);
      const pick = (ramp: Color[], b: number, k2 = 1.7) => ramp[clamp(Math.round(b + l * k2), 0, ramp.length - 1)];
      const col = id === 1 ? pick(HOOD, 3, 2) : id === 2 ? pick(FACE, 2, 1) : id === 3 ? pick(CLOAK, 2) : id === 4 ? pick(BOOT, 1.4) : id === 5 ? FACE[2] : EYE;
      r.p.set(x, y, col);
    }
    // short thread whipping behind the spin
    const ang = [200, 110, 20, 290][k];
    r.thread({ ax: 8 + Math.round(Math.cos(ang * D2R) * 4), ay: 10 - Math.round(Math.sin(ang * D2R) * 4), ang: ang + 30, len: 5, amp: 0.6, grav: 0.5, phase: k }, r.under);
    frames.push(r.finish());
    // rotate ids 90° clockwise around (8,10): (x,y) → (17-y, x+2)
    const nxt = new Uint8Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const id = ids[y * S + x];
      if (!id) continue;
      const X = 17 - y, Y = x + 2;
      if (X >= 0 && Y >= 0 && X < S && Y < S) nxt[Y * S + X] = id;
    }
    ids = nxt;
  }
  return frames;
}

function land(): Px[] {
  return [
    pose({
      head: [3, 7], eyes: 'blink', tip: [205, 0.5],
      body: { top: 12, wt: 7, wb: 10, cx: 8 },
      ff: [10, 15], fb: [4, 15],
      bf: { sx: 10, sy: 12, hx: 12, hy: 14 }, bb: { sx: 6, sy: 12, hx: 3, hy: 14 },
      thread: { ay: 13, grav: 1.8, amp: 0.4 },
    }),
    pose({
      head: [3, 6], eyes: 'open', tip: [185, 0.4],
      body: { top: 12, wt: 6, wb: 8 },
      ff: [10, 15], fb: [5, 15],
      bf: { sx: 10, sy: 12, hx: 11, hy: 13 },
      thread: { ay: 12, grav: 1.4, amp: 0.6, phase: 1 },
    }),
  ];
}

function warden(): Px[] {
  return range(4).map((f) => {
    const lvl = [0, 1, 2, 1][f];
    const sy = [11, 11, 12, 12][f];
    return pose({
      head: [3, f >= 2 ? 6 : 5],
      eyes: 'open',
      tipS: f === 2 ? 'high' : 'mid',
      body: { wb: 10, wt: 7, top: f >= 2 ? 12 : 11 },
      fb: [3, 15], ff: [12, 15],
      bb: { sx: 6, sy: sy, hx: 4, hy: sy }, bf: { sx: 11, sy: sy, hx: 12, hy: sy },
      thread: { phase: (f * Math.PI) / 2, amp: 0.7, spark: f },
      post: (r) => {
        glowRuneStaff(r, sy, lvl);
        r.paw(4, sy, false); r.paw(12, sy, true);
      },
      fx: (r) => {
        const g = [0.3, 0.45, 0.6, 0.45][f];
        glow(r.fx, 1, sy, 3, GOLD[3], g);
        glow(r.fx, 14, sy, 3, GOLD[3], g);
        if (lvl === 2) { r.fset(1, sy - 3, GOLD[5]); r.fset(14, sy - 3, GOLD[5]); }
        if (lvl === 1) { r.fset(0, sy - 2, GOLD[4]); r.fset(15, sy - 2, GOLD[4]); }
      },
    });
  });
}

function weave(): Px[] {
  const frames: Px[] = [];
  /** glowing strand from the thread's root (behind the body) to (x1,y1) */
  const strand = (r: Rig, x1: number, y1: number, arc: number, front = false) => {
    const pts: [number, number][] = [];
    const x0 = 4, y0 = 12;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      pts.push([Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t - arc * Math.sin(Math.PI * t))]);
    }
    const layer = front ? r.fx : r.under;
    pixelPerfect(pts).forEach(([x, y], i) => layer.set(x, y, i % 3 === 0 ? GOLD[5] : GOLD[4]));
    for (const [x, y] of pts) glow(r.fx, x, y, 1.8, GOLD[3], 0.1);
  };
  // 0–2: the back paw reaches behind for the thread
  frames.push(pose({ bb: { sx: 6, sy: 11, hx: 4, hy: 13 }, tipS: 'mid', thread: { phase: 0 } }));
  frames.push(pose({ bb: { sx: 6, sy: 11, hx: 3, hy: 12 }, head: [2, 5], body: { lean: -1 }, tipS: 'high', thread: { phase: 0.6 } }));
  frames.push(pose({ bb: { sx: 6, sy: 11, hx: 2, hy: 12 }, head: [2, 5], body: { lean: -1 }, eyes: 'squint', tipS: 'high', thread: { phase: 1.2, glow: true } }));
  // 3: grabbed — the thread blazes
  frames.push(pose({ bb: { sx: 6, sy: 11, hx: 2, hy: 11 }, head: [2, 5], body: { lean: -1 }, eyes: 'squint', tipS: 'high', thread: { glow: true, len: 5, amp: 0.3, ang: 200 } }));
  // 4–5: pulled up behind the back and over, passed to both paws in front
  frames.push(pose({ bb: { sx: 6, sy: 11, hx: 4, hy: 7 }, head: [3, 5], tipS: 'mid', thread: null, fx: (r) => strand(r, 4, 7, 1) }));
  frames.push(pose({ bb: { sx: 7, sy: 11, hx: 12, hy: 12 }, bf: { sx: 11, sy: 11, hx: 14, hy: 12 }, head: [3, 5], tipS: 'low', thread: null,
    fx: (r) => { strand(r, 12, 12, 5); r.fset(13, 12, GOLD[5]); r.fset(14, 11, GOLD[4]); } }));
  // 6: stretched taut between the paws — the plank forms
  frames.push(pose({ bb: { sx: 7, sy: 12, hx: 9, hy: 12 }, bf: { sx: 11, sy: 12, hx: 14, hy: 12 }, head: [4, 6], body: { top: 12, lean: 1 }, tipS: 'low', thread: { len: 3 },
    post: (r) => { plank(r, 10, 11, 4, true); r.paw(9, 12, false); r.paw(14, 12, true); },
    fx: (r) => { glow(r.fx, 12, 12, 4, GOLD[4], 0.3); r.fset(15, 10, GOLD[5]); } }));
  // 7: kneel, plank lowered
  frames.push(pose({
    head: [4, 7], eyes: 'down', body: { top: 12, wt: 7, wb: 8, cx: 7.5 }, fb: [3, 15], ff: [7, 15],
    bb: { sx: 7, sy: 12, hx: 9, hy: 13 }, bf: { sx: 10, sy: 12, hx: 14, hy: 13 }, tipS: 'low',
    thread: { ay: 13, len: 4 },
    post: (r) => { plank(r, 9, 13, 6, false); r.paw(9, 13, false); r.paw(14, 13, true); },
    fx: (r) => glow(r.fx, 12, 13.5, 4, GOLD[4], 0.25),
  }));
  // 8: plank laid in front, matching the terrain the sim writes (x+1…x+6, rows y-1…y)
  frames.push(pose({
    head: [4, 8], eyes: 'down', body: { top: 13, wt: 8, wb: 9, cx: 7 }, fb: [2, 15], ff: [7, 15],
    bb: { sx: 7, sy: 13, hx: 9, hy: 13 }, bf: { sx: 10, sy: 13, hx: 14, hy: 13 }, tipS: 'down',
    thread: { ay: 14, len: 4, grav: 0.5 },
    post: (r) => { plank(r, 9, 14, 6, true); r.paw(10, 13, false); r.paw(13, 13, true); },
    fx: (r) => { glow(r.fx, 12, 14.5, 5, GOLD[4], 0.35); sparkle(r.fx, 15, 12, GOLD[5], GOLD[3]); },
  }));
  // 9: release — a few motes where the plank now is
  frames.push(pose({
    head: [4, 7], eyes: 'happy', body: { top: 12, wt: 7, wb: 8, cx: 7.5 }, fb: [3, 15], ff: [7, 15],
    bf: { sx: 10, sy: 12, hx: 12, hy: 12 }, tipS: 'low', thread: { ay: 13, len: 5 },
    fx: (r) => { r.fset(11, 12, GOLD[4]); r.fset(14, 11, GOLD[5]); },
  }));
  // 10–15: rise and step up onto the plank (the sim walks at 10, 12, 14)
  frames.push(pose({ head: [3, 6], body: { top: 12 }, ff: [10, 14], fb: [5, 15], tipS: 'low', thread: { phase: 2 }, fx: (r) => r.fset(14, 10, GOLD[3]) }));
  frames.push(pose({ head: [3, 5], ff: [11, 15], fb: [5, 15], tipS: 'mid', thread: { phase: 2.6 } }));
  frames.push(pose({ head: [3, 6], body: { top: 12 }, ff: [10, 15], fb: [6, 14], tipS: 'high', thread: { phase: 3.2 } }));
  frames.push(pose({ head: [3, 5], ff: [10, 15], fb: [6, 15], tipS: 'mid', thread: { phase: 3.8 } }));
  frames.push(pose({ head: [3, 6], body: { top: 12 }, ff: [11, 15], fb: [6, 14], tipS: 'high', thread: { phase: 4.4 } }));
  frames.push(pose({ head: [3, 5], ff: [10, 15], fb: [5, 15], bb: { sx: 6, sy: 11, hx: 5, hy: 13 }, tipS: 'mid', thread: { phase: 5 } }));
  return frames;
}

function shrug(): Px[] {
  const P: Pose[] = [
    { bf: { sx: 10, sy: 11, hx: 11, hy: 13 }, bb: { sx: 6, sy: 11, hx: 4, hy: 13 } },
    { head: [3, 6], bf: { sx: 10, sy: 11, hx: 12, hy: 12 }, bb: { sx: 6, sy: 11, hx: 3, hy: 12 }, tip: [178, 0.35] },
    { head: [3, 6], eyes: 'blink', bf: { sx: 10, sy: 11, hx: 13, hy: 10 }, bb: { sx: 6, sy: 11, hx: 2, hy: 10 }, tip: [198, 0.45] },
    { head: [2, 6], eyes: 'happy', bf: { sx: 10, sy: 11, hx: 13, hy: 10 }, bb: { sx: 6, sy: 11, hx: 2, hy: 10 }, tip: [205, 0.45] },
    { head: [2, 6], eyes: 'blink', bf: { sx: 10, sy: 11, hx: 13, hy: 10 }, bb: { sx: 6, sy: 11, hx: 2, hy: 10 }, tip: [200, 0.45] },
    { head: [3, 5], bf: { sx: 10, sy: 11, hx: 12, hy: 12 }, bb: { sx: 6, sy: 11, hx: 3, hy: 12 }, tip: [185, 0.4] },
    { head: [3, 5], bf: { sx: 10, sy: 11, hx: 11, hy: 13 }, tip: [172, 0.32] },
    { head: [3, 5], body: { lean: 1 }, ff: [10, 15], bf: { sx: 10, sy: 11, hx: 10, hy: 13 }, tip: [168, 0.3] },
  ];
  return P.map((p, f) => pose({ ...p, thread: { phase: f * 0.6, amp: 0.6 } }));
}

function bash(): Px[] {
  // front fist F, back fist B per frame; strikes at 3 and 11
  const F: [number, number][] = [[11, 11], [8, 11], [7, 11], [14, 11], [13, 11], [12, 11], [11, 11], [11, 11],
    [11, 11], [12, 11], [12, 11], [9, 11], [10, 11], [10, 11], [11, 11], [11, 11]];
  const B: [number, number][] = [[9, 12], [10, 12], [10, 12], [8, 12], [8, 12], [9, 12], [9, 12], [10, 12],
    [10, 12], [6, 12], [5, 12], [14, 12], [13, 12], [12, 12], [10, 12], [9, 12]];
  const lean = [0, -1, -1, 1, 1, 0, 0, 0, 0, -1, -1, 1, 1, 0, 0, 0];
  return range(16).map((f) => {
    const strike = f === 3 || f === 11;
    const after = f === 4 || f === 12;
    const l = lean[f];
    return pose({
      head: [3 + l, 5 + (strike ? 1 : 0)],
      eyes: f === 2 || f === 10 ? 'squint' : strike ? 'squint' : 'open',
      body: { lean: l, wb: 8, top: strike ? 12 : 11 },
      fb: [4, 15], ff: [10, 15],
      tip: [168 + (l < 0 ? 12 : l > 0 ? -14 : 0) + (after ? 18 : 0), 0.32],
      bb: { sx: 7, sy: 12, hx: B[f][0], hy: B[f][1], fist: true },
      bf: { sx: 10 + (l > 0 ? 1 : 0), sy: 11 + (strike ? 1 : 0), hx: F[f][0], hy: F[f][1], fist: true },
      thread: { phase: f * 0.5, amp: strike ? 1.4 : 0.8, spark: f },
      fx: (r) => {
        const fx = f < 8 ? F[f] : B[f];
        const g = strike ? 0.65 : after ? 0.4 : 0.18;
        glow(r.fx, fx[0] + 1, fx[1] + 0.5, strike ? 3.5 : 2.5, GOLD[4], g);
        if (strike) {
          sparkle(r.fx, 15, fx[1], GOLD[5], GOLD[4]);
          r.fset(fx[0] - 2, fx[1], GOLD[4]); r.fset(fx[0] - 3, fx[1], GOLD[3]);
          r.fset(fx[0] - 2, fx[1] + 1, GOLD[3]);
        }
        if (after) { r.fset(15, fx[1] - 2, GOLD[4]); r.fset(15, fx[1] + 3, GOLD[3]); }
      },
    });
  });
}

function mine(): Px[] {
  // grip, handle angle, drawn behind the head?  impact at frame 10
  const G: [number, number, number, boolean][] = [
    [12, 12, 35, false], [12, 12, 40, false], [10, 11, 85, true], [7, 11, 120, true], [6, 11, 140, true], [6, 11, 145, true], [6, 11, 150, true], [6, 11, 155, true],
    [8, 10, 95, true], [12, 10, 30, false], [12, 12, -45, false], [12, 12, -45, false], [12, 12, -32, false], [12, 12, -5, false], [12, 12, 18, false], [12, 12, 30, false],
  ];
  const lean = [0, 0, -1, -1, -1, -1, -1, -1, 0, 1, 1, 1, 1, 0, 0, 0];
  return range(16).map((f) => {
    const [hx, hy, ang, behind] = G[f];
    const l = lean[f];
    const impact = f === 10 || f === 11;
    const raised = f >= 3 && f <= 8;
    return pose({
      head: [3 + l, 5 + (impact ? 1 : 0)],
      eyes: raised ? 'up' : impact ? 'squint' : 'open',
      body: { lean: l, top: impact ? 12 : 11 },
      fb: [4, 15], ff: [11, 15],
      tipS: f === 9 ? 'high' : impact ? 'low' : raised ? 'high' : 'mid',
      bb: { sx: 6, sy: 11 + (impact ? 1 : 0), hx: raised ? hx : hx - 1, hy: raised ? hy - 1 : hy },
      bf: raised ? null : { sx: 11, sy: 11 + (impact ? 1 : 0), hx, hy },
      thread: { phase: f * 0.45, amp: 0.9, spark: f },
      pre: (r) => { if (behind) pickaxe(r, hx, hy - (raised ? 1 : 0), ang); },
      post: (r) => { if (!behind) { pickaxe(r, hx, hy, ang); r.paw(hx, hy, true); } },
      fx: (r) => {
        if (f === 9) { r.fset(15, 7, GOLD[3]); r.fset(15, 8, GOLD[4]); r.fset(14, 6, GOLD[2]); r.fset(13, 5, GOLD[2]); }
        if (f === 10) { sparkle(r.fx, 15, 14, GOLD[5], GOLD[4]); r.fset(14, 11, EARTH[4]); r.fset(13, 12, EARTH[3]); }
        if (f === 11) { r.fset(13, 10, EARTH[3]); r.fset(15, 11, EARTH[4]); r.fset(11, 11, EARTH[2]); }
      },
    });
  });
}

function dig(): Px[] {
  // digging straight down at its own feet; strikes at 0 and 4 (the sim digs a row on c % 4 === 0)
  const F: [number, number][] = [[11, 15], [12, 13], [12, 12], [12, 12], [12, 13], [12, 12], [11, 13], [11, 14]];
  const B: [number, number][] = [[6, 12], [5, 12], [5, 13], [5, 14], [6, 15], [4, 13], [4, 12], [5, 12]];
  const hy = [8, 7, 7, 7, 8, 7, 7, 7];
  const dirt = (r: Rig, f: number) => {
    const s = f < 4 ? 0 : 4, t = f - s;
    const side = f < 4 ? 1 : -1; // front strike throws forward-up, back strike throws backward-up
    const ox = f < 4 ? 11 : 5;
    const clod = (x: number, y: number, big: boolean) => {
      if (x < 0 || x > 15 || y < 0 || y > 15) return;
      r.fset(x, y, EARTH[4]);
      if (big) { r.fset(x + 1, y, EARTH[3]); r.fset(x, y + 1, EARTH[2]); r.fset(x + 1, y + 1, EARTH[1]); }
      else r.fset(x, y + 1, EARTH[1]);
    };
    if (t === 0) { clod(ox - 1, 14, false); clod(ox + 1, 14, false); return; }
    const seeds: [number, number, boolean][] = [[0.8, -3.4, true], [1.8, -2.4, false], [0.1, -4.2, false]];
    seeds.forEach(([vx, vy, big]) => {
      clod(Math.round(ox + side * vx * t), Math.round(14 + vy * t + 0.95 * t * t), big);
    });
  };
  return range(8).map((f) => pose({
    head: [3, hy[f]], eyes: 'down',
    body: { top: 12, wt: 8, wb: 9 },
    fb: [4, 15], ff: [10, 15],
    tipS: f === 0 || f === 4 ? 'high' : 'mid',
    bb: { sx: 6, sy: 12, hx: B[f][0], hy: B[f][1] },
    bf: { sx: 11, sy: 12, hx: F[f][0], hy: F[f][1] },
    thread: { ay: 13, phase: f * 0.8, amp: 0.8, spark: f },
    fx: (r) => dirt(r, f),
  }));
}

function climb(): Px[] {
  // wall on the right at x = 12; body pressed against it, hand over hand
  const F: [number, number][] = [[11, 5], [11, 6], [11, 7], [11, 8], [10, 8], [10, 6], [11, 4], [11, 5]];
  const B: [number, number][] = [[10, 8], [10, 6], [11, 4], [11, 5], [11, 5], [11, 6], [11, 7], [11, 8]];
  const fF: [number, number][] = [[10, 15], [10, 15], [10, 14], [10, 13], [10, 13], [10, 14], [10, 15], [10, 15]];
  const fB: [number, number][] = [[9, 13], [9, 14], [9, 15], [9, 15], [9, 15], [9, 14], [9, 13], [9, 13]];
  const oy = [0, 0, -1, -1, 0, 0, -1, -1];
  return range(8).map((f) => pose({
    o: [0, 0],
    head: [2, 5 + oy[f] + 1], eyes: 'up',
    body: { cx: 8.5, top: 11 + oy[f] + 1, bot: 14, wt: 5, wb: 5 },
    fb: [fB[f][0], fB[f][1]], ff: [fF[f][0], fF[f][1]],
    tip: [[222, 226, 230, 226, 222, 226, 230, 226][f], 0.12],
    bb: { sx: 9, sy: 11 + oy[f] + 1, hx: B[f][0], hy: B[f][1] },
    bf: { sx: 10, sy: 11 + oy[f] + 1, hx: F[f][0], hy: F[f][1] },
    thread: { ax: 6, ay: 13, ang: 255, len: 5, grav: 0.6, phase: f * 0.8, amp: 0.8, spark: f },
  }));
}

function hoist(): Px[] {
  // starts like the top of a climb, leans over the ledge, knee up, ends standing
  const P: Pose[] = [
    { head: [2, 6], eyes: 'up', body: { cx: 8.5, top: 12, wt: 5, wb: 5 }, bf: { sx: 10, sy: 12, hx: 11, hy: 7 }, bb: { sx: 9, sy: 12, hx: 11, hy: 9 }, ff: [10, 15], fb: [9, 14], tip: [224, 0.12], thread: { ax: 6, ay: 13, ang: 255, len: 5, grav: 0.6 } },
    { head: [3, 6], eyes: 'squint', body: { cx: 8.5, top: 12, wt: 5, wb: 5, lean: 1 }, bf: { sx: 10, sy: 12, hx: 12, hy: 12 }, bb: { sx: 9, sy: 12, hx: 13, hy: 12 }, ff: [10, 14], fb: [9, 15], tip: [210, 0.2], thread: { ax: 6, ay: 13, ang: 240, len: 5, grav: 0.8 } },
    { head: [4, 7], eyes: 'squint', body: { cx: 9, top: 12, wt: 5, wb: 6, lean: 1 }, bf: { sx: 11, sy: 12, hx: 13, hy: 14 }, bb: { sx: 10, sy: 12, hx: 14, hy: 14 }, ff: [10, 13], fb: [8, 15], tip: [196, 0.3], thread: { ax: 6, ay: 13, ang: 220, len: 5, grav: 1 } },
    { head: [4, 7], eyes: 'squint', body: { cx: 9, top: 12, wt: 6, wb: 6, lean: 1 }, bf: { sx: 11, sy: 12, hx: 13, hy: 14 }, bb: { sx: 10, sy: 12, hx: 14, hy: 14 }, ff: [11, 12], fb: [8, 15], tip: [190, 0.35], thread: { ax: 6, ay: 13, ang: 205, len: 5, grav: 1 } },
    { head: [5, 7], eyes: 'open', body: { cx: 9.5, top: 12, wt: 6, wb: 7, lean: 1 }, bf: { sx: 12, sy: 12, hx: 13, hy: 14 }, ff: [11, 15], fb: [7, 15], tip: [185, 0.35], thread: { ax: 7, ay: 13, ang: 195, len: 5 } },
    { head: [5, 7], eyes: 'open', body: { cx: 9.5, top: 12, wt: 6, wb: 8 }, bf: { sx: 12, sy: 12, hx: 13, hy: 14 }, ff: [11, 15], fb: [7, 15], tip: [182, 0.35], thread: { ax: 7, ay: 13, ang: 192, len: 5 } },
    { head: [4, 6], eyes: 'open', body: { cx: 9, top: 12, wt: 5, wb: 7 }, bf: { sx: 11, sy: 12, hx: 12, hy: 13 }, ff: [10, 15], fb: [6, 15], tip: [176, 0.32], thread: { ax: 6, ay: 12, phase: 1 } },
    { head: [4, 5], eyes: 'happy', body: { cx: 9 }, bf: { sx: 11, sy: 11, hx: 12, hy: 13 }, ff: [10, 15], fb: [6, 15], tip: [168, 0.3], thread: { ax: 6, ay: 12, phase: 2 } },
  ];
  return P.map((p) => pose(p));
}

function gliderPose(f: number, open: number): Pose {
  // open: 0 furled, 0.5 unfurling, 1.2 overshoot, 1 canopy; f drives the sway
  const full = open >= 1;
  const tilt = full && open === 1 ? [-1, 0, 1, 0][f % 4] : 0;
  const pawY = (side: number) => (open < 0.5 ? 4 : 5 + Math.round(side * tilt * 0.5 + (open > 1 ? -1 : 0)));
  return {
    head: [3, 6], eyes: full ? (f % 4 === 2 ? 'blink' : 'happy') : 'wide',
    body: { top: 12, hem: full ? [0, 1, 0, -1][f % 4] : 0 },
    ff: [10, full ? [15, 14, 15, 14][f % 4] : 15], fb: [5, full ? [14, 15, 14, 15][f % 4] : 14],
    tipS: full ? (['low', 'mid', 'low', 'mid'] as Tip[])[f % 4] : open > 0 ? 'mid' : 'up2',
    bb: { sx: 6, sy: 12, hx: open < 0.5 ? 6 : 4, hy: pawY(-1) },
    bf: { sx: 11, sy: 12, hx: open < 0.5 ? 9 : 12, hy: pawY(1) },
    thread: { ay: 13, ang: full ? 160 : 140, grav: full ? -0.4 : -1, phase: f * 1.2, amp: 0.9, spark: f },
    pre: (r) => {
      if (open <= 0) {
        // furled leaf: a rolled green bundle with its stalk
        const m = new Px(S, S);
        m.ellipse(7.5, 2.5, 2.6, 1.3, ON); m.set(11, 3, ON);
        shadeMask(m, LEAF, r.p, 3);
        r.set(6, 3, LEAF[1]); r.set(8, 2, LEAF[1]); r.set(4, 3, WOOD[3]);
      } else if (open < 1) leafCanopy(r, 7.5, 4.5, 2, 0, 1);
      else if (open > 1) leafCanopy(r, 7.5, 7.5, 2, 0, 1);
      else leafCanopy(r, 7.5, 7, 3, tilt, 1);
    },
  };
}

function glideOpen(): Px[] {
  return [pose(gliderPose(0, 0)), pose(gliderPose(1, 0.5)), pose(gliderPose(2, 1.2)), pose(gliderPose(0, 1))];
}
function glide(): Px[] {
  return range(4).map((f) => pose(gliderPose(f, 1)));
}

function plant(): Px[] {
  const P: Pose[] = [
    { bf: { sx: 10, sy: 11, hx: 11, hy: 11 }, post: (r) => runeStone(r, 12, 11, 0) },
    { head: [3, 7], eyes: 'down', body: { top: 12, wt: 6, wb: 8 }, fb: [4, 15], ff: [8, 15], bf: { sx: 10, sy: 12, hx: 12, hy: 13 }, post: (r) => runeStone(r, 13, 13, 0), tip: [182, 0.4] },
    { head: [4, 8], eyes: 'down', body: { top: 13, wt: 7, wb: 8 }, fb: [3, 15], ff: [8, 15], bf: { sx: 10, sy: 13, hx: 12, hy: 14 }, post: (r) => runeStone(r, 12, 14, 1), tip: [196, 0.45] },
    { head: [4, 8], eyes: 'squint', body: { top: 13, wt: 7, wb: 8 }, fb: [3, 15], ff: [8, 15], bf: { sx: 10, sy: 13, hx: 11, hy: 14 }, post: (r) => runeStone(r, 12, 14, 1), tip: [204, 0.5], fx: (r) => glow(r.fx, 12, 14, 3.5, RUNE[4], 0.5) },
    { head: [4, 8], eyes: 'blink', body: { top: 13, wt: 7, wb: 8 }, fb: [3, 15], ff: [8, 15], bf: { sx: 10, sy: 13, hx: 11, hy: 13 }, tip: [198, 0.45], fx: (r) => { glow(r.fx, 11.5, 14.5, 5, RUNE[4], 0.45); sparkle(r.fx, 11, 14, RUNE[5], RUNE[4]); } },
    { head: [3, 7], eyes: 'open', body: { top: 12, wt: 6, wb: 8 }, fb: [4, 15], ff: [8, 15], bf: { sx: 10, sy: 12, hx: 11, hy: 13 }, tip: [186, 0.4], fx: (r) => { r.fset(12, 12, RUNE[4]); r.fset(10, 11, RUNE[3]); } },
    { head: [3, 6], body: { top: 12 }, bf: { sx: 10, sy: 12, hx: 11, hy: 13 }, tip: [174, 0.35] },
    { head: [3, 5], eyes: 'happy', tip: [166, 0.3] },
  ];
  return P.map((p, f) => pose({ thread: { phase: f * 0.7, ay: (p.body?.top ?? 11) + 1, amp: 0.7 }, ...p }));
}

function leap(): Px[] {
  const P: Pose[] = [
    { head: [3, 7], eyes: 'squint', body: { top: 12, wt: 6, wb: 8 }, ff: [10, 15], fb: [4, 15], bf: { sx: 10, sy: 12, hx: 8, hy: 14 }, bb: { sx: 6, sy: 12, hx: 4, hy: 13 }, tip: [178, 0.35], thread: { ay: 13 } },
    { head: [3, 8], eyes: 'squint', body: { top: 13, wt: 7, wb: 9 }, ff: [10, 15], fb: [4, 15], bf: { sx: 10, sy: 13, hx: 7, hy: 14 }, bb: { sx: 6, sy: 13, hx: 3, hy: 13 }, tip: [190, 0.4], thread: { ay: 14, grav: 0.6 } },
    { head: [4, 3], eyes: 'wide', body: { top: 9, bot: 13, wt: 4, wb: 5, cx: 8.5, lean: 1 }, ff: [8, 14], fb: [6, 15], bf: { sx: 10, sy: 9, hx: 13, hy: 5 }, bb: { sx: 7, sy: 9, hx: 11, hy: 4 }, tip: [215, 0.15], tipLen: 6, thread: { ay: 11, ang: 225, grav: 1.6, len: 6 } },
    { head: [4, 5], eyes: 'happy', body: { top: 11, bot: 13, wt: 6, wb: 6 }, ff: [9, 13], fb: [6, 13], bf: { sx: 10, sy: 11, hx: 12, hy: 10 }, bb: { sx: 7, sy: 11, hx: 11, hy: 9 }, tip: [160, 0.25], thread: { ay: 12, ang: 200, grav: 1.2 } },
    { head: [4, 6], eyes: 'open', body: { top: 12, bot: 14, wt: 6, wb: 7 }, ff: [10, 14], fb: [6, 15], bf: { sx: 10, sy: 12, hx: 13, hy: 10 }, bb: { sx: 6, sy: 12, hx: 3, hy: 10 }, tip: [150, 0.3], thread: { ay: 13, ang: 175, grav: 0.5 } },
    { head: [3, 7], eyes: 'blink', body: { top: 12, wt: 7, wb: 10 }, ff: [10, 15], fb: [4, 15], bf: { sx: 10, sy: 12, hx: 12, hy: 14 }, bb: { sx: 6, sy: 12, hx: 3, hy: 14 }, tip: [205, 0.5], thread: { ay: 13, grav: 1.8, amp: 0.4 } },
  ];
  return P.map((p) => pose(p));
}

// --- Effect-driven animations -----------------------------------------------------------------

/** recolour the silhouette's edge pixels (a glowing rim) */
function rim(src: Px, col: Color): Px {
  const out = src.clone();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!aOf(src.get(x, y))) continue;
    if (!aOf(src.get(x - 1, y)) || !aOf(src.get(x, y - 1)) || !aOf(src.get(x + 1, y)) || !aOf(src.get(x, y + 1))) out.set(x, y, col);
  }
  return out;
}

/** gold silhouette of a frame: luminance mapped onto the gold ramp, rim lit */
function goldify(src: Px, rimCol: Color): Px {
  const out = new Px(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = src.get(x, y);
    if (!aOf(c)) continue;
    const l = ((c & 255) * 0.3 + ((c >>> 8) & 255) * 0.55 + ((c >>> 16) & 255) * 0.15) / 255;
    const edge = !aOf(src.get(x - 1, y)) || !aOf(src.get(x, y - 1)) || !aOf(src.get(x + 1, y)) || !aOf(src.get(x, y + 1));
    out.set(x, y, edge ? rimCol : GOLD[clamp(Math.round(2 + l * 3.2), 2, 5)]);
  }
  return out;
}

function exitAnim(): Px[] {
  const frames: Px[] = [];
  frames.push(pose({ ff: [11, 15], fb: [5, 15], head: [3, 6], body: { top: 12 }, thread: { phase: 1 } }));
  frames.push(pose({ eyes: 'up', tipS: 'high', thread: { phase: 2, glow: true } }));
  const base = pose({ eyes: 'happy', tipS: 'up2', head: [3, 4], body: { top: 10 }, bf: { sx: 11, sy: 10, hx: 13, hy: 9 }, bb: { sx: 6, sy: 10, hx: 3, hy: 9 }, thread: { glow: true, ang: 150, grav: -1 } });
  // 2: warming to gold
  const f2 = rim(base, GOLD[4]);
  glow(f2, 8, 9, 7, GOLD[3], 0.25);
  frames.push(f2);
  // 3: a golden silhouette
  const g = goldify(base, GOLD[5]);
  frames.push(g.clone());
  // 4–7: dissolve from the feet up into rising sparkles
  const cuts = [11, 7, -1, -1];
  for (let k = 0; k < 4; k++) {
    const out = new Px(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (y < cuts[k] && aOf(g.get(x, y))) out.set(x, y, g.get(x, y));
    // sparkles: deterministic motes rising from the vanished part
    const n = [7, 8, 6, 3][k];
    for (let i = 0; i < n; i++) {
      const sx = 3 + Math.floor(hash2(i, k, 3) * 10);
      const sy = Math.round(14 - hash2(i, 9, 4) * 6 - k * 3 - (i % 3));
      if (sy < 0 || sy > 15) continue;
      if (k < 3 && i % 3 === 0) sparkle(out, sx, sy, GOLD[5], GOLD[3]);
      else out.set(sx, sy, i % 2 ? GOLD[5] : GOLD[4]);
    }
    frames.push(out);
  }
  return frames;
}

function unravel(): Px[] {
  const frames: Px[] = [];
  const startled = { eyes: 'wide' as Eyes, tipS: 'up' as Tip, bf: { sx: 11, sy: 11, hx: 13, hy: 10 }, bb: { sx: 6, sy: 11, hx: 3, hy: 10 }, thread: { ang: 150, grav: -0.5, glow: true } };
  frames.push(pose(startled));
  const base = pose({ ...startled, eyes: 'shut', tipS: 'up2' });
  // 1: a golden rim flickers around the body
  frames.push(rim(base, GOLD[4]));
  // 2: the rows loosen and slide apart
  const f2 = new Px(S, S);
  for (let y = 0; y < S; y++) {
    const dx = Math.round(Math.sin(y * 1.7) * 1.2);
    for (let x = 0; x < S; x++) { const c = base.get(x, y); if (aOf(c)) f2.set(x + dx, y, mix(c, GOLD[4], 0.15)); }
  }
  frames.push(f2);
  // 3–11: the body has come apart into loose threads (one per band of the body, in its colours)
  // that lengthen, wave, rise and fade
  const bands: [number, Color][] = [[4, HOOD[4]], [6, HOOD[3]], [8, FACE[3]], [10, GOLD[4]], [11, CLOAK[4]], [13, CLOAK[3]], [15, BOOT[2]]];
  for (let f = 3; f < 12; f++) {
    const out = new Px(S, S);
    const t = (f - 3) / 8;
    if (f === 3) {
      // last remnant: every other row of the body, stretched
      for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x++) {
        const c = base.get(x, y);
        if (aOf(c)) out.set(x + (y % 4 ? 1 : -1), y, mix(c, GOLD[4], 0.3));
      }
    }
    bands.forEach(([y0, col], i) => {
      const rise = (f - 2) * (0.55 + 0.05 * (7 - i)) + (f > 7 ? (f - 7) * 0.4 : 0);
      const yc = y0 - rise;
      const half = Math.max(1, 3 + (f - 3) * 0.7 - Math.max(0, f - 8) * 1.6);
      const amp = Math.min(1.6, 0.5 + (f - 3) * 0.25);
      const fade = f < 8 ? 1 : 1 - (f - 7) / 5;
      const c = mix(col, GOLD[5], 0.2 + t * 0.4);
      const cx = 8 + Math.sin(i * 2.1 + f * 0.5) * 1.5;
      const pts: [number, number][] = [];
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
        pts.push([x, Math.round(yc + Math.sin(x * 0.9 + f * 1.1 + i * 1.7) * amp)]);
      }
      for (const [x, y] of pts) {
        if (y < 0 || y > 15) continue;
        const end = x === pts[0][0] || x === pts[pts.length - 1][0];
        const a = Math.round(255 * fade * (end ? 0.55 : 1));
        if (a > 10) out.blend(x, y, ((c & 0x00ffffff) | (a << 24)) >>> 0);
      }
    });
    frames.push(out);
  }
  return frames;
}

/** recolour a frame by luminance onto a ramp, keeping its silhouette */
function lumaMap(src: Px, ramp: Color[], lo = 0, hi = ramp.length - 1): Px {
  const out = new Px(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = src.get(x, y);
    if (!aOf(c)) continue;
    const l = ((c & 255) * 0.3 + ((c >>> 8) & 255) * 0.55 + ((c >>> 16) & 255) * 0.15) / 255;
    out.set(x, y, ramp[clamp(Math.round(lo + l * (hi - lo) * 1.25), lo, hi)]);
  }
  return out;
}

function burn(): Px[] {
  const frames: Px[] = [];
  const panic = (eyes: Eyes) => pose({ eyes, tipS: 'up', bf: { sx: 11, sy: 11, hx: 13, hy: 8 }, bb: { sx: 6, sy: 11, hx: 3, hy: 8 }, ff: [11, 14], fb: [4, 15], thread: { ang: 120, grav: -1 } });
  const flames = (p: Px, f: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const x = 3 + Math.floor(hash2(i, f, 21) * 11), h = 2 + Math.floor(hash2(i, f, 22) * 3);
      const y0 = 15 - Math.floor(hash2(i, 3, 23) * 6);
      for (let k = 0; k < h; k++) p.set(x, y0 - k, k === 0 ? FIRE[3] : k === h - 1 ? FIRE[5] : FIRE[4]);
    }
  };
  // 0: catches fire; 1: white-hot flash; 2: blazing
  const a = rim(panic('wide'), FIRE[3]); flames(a, 0, 4); frames.push(a);
  const b = lumaMap(panic('shut'), FIRE, 3, 5); selout(b); frames.push(b);
  const c2 = lumaMap(panic('shut'), FIRE, 1, 4); flames(c2, 2, 6); frames.push(c2);
  // 3: charred silhouette with glowing cracks
  const sil = lumaMap(panic('none'), ASH, 0, 3);
  const cracks: [number, number][] = [[6, 6], [7, 7], [7, 8], [9, 9], [10, 10], [8, 12], [9, 13], [6, 12], [11, 12], [12, 7]];
  const f3 = sil.clone();
  for (const [x, y] of cracks) if (aOf(f3.get(x, y))) f3.set(x, y, FIRE[4]);
  frames.push(f3);
  // 4: crumbling — the upper half slumps down, cracks dim
  const f4 = new Px(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = sil.get(x, y);
    if (!aOf(v)) continue;
    const h = hash2(x, y, 9);
    if (y < 10 && h < 0.35) continue;
    const ny = y < 10 ? Math.min(15, y + 4 + Math.round(h * 2)) : y;
    f4.set(x, ny, h > 0.88 ? FIRE[3] : v);
  }
  frames.push(f4);
  // 5–9: an ash pile with embers rising and fading
  for (let f = 5; f < 10; f++) {
    const k = f - 5;
    const out = new Px(S, S);
    const w = 5 - Math.floor(k / 2);
    for (let x = 8 - w; x <= 7 + w; x++) {
      const hh = Math.max(0, 2 - Math.floor(Math.abs(x - 7.5) / 2) - (k >= 3 ? 1 : 0));
      for (let y = 15 - hh; y <= 15; y++) {
        const h = hash2(x, y, 12 + f);
        out.set(x, y, y === 15 - hh ? ASH[3] : h > 0.82 - k * 0.04 ? (k < 3 ? FIRE[3] : FIRE[2]) : h > 0.45 ? ASH[2] : ASH[1]);
      }
    }
    for (let i = 0; i < 6 - k; i++) {
      const ex = 4 + Math.floor(hash2(i, 3, 1) * 9) + Math.round(Math.sin(f + i));
      const ey = 13 - Math.floor((f - 4) * (1.4 + hash2(i, 5, 2))) - i;
      if (ey >= 0) out.set(ex, ey, i % 2 ? FIRE[4] : FIRE[5]);
    }
    frames.push(out);
  }
  return frames;
}

function drown(): Px[] {
  const sink = [0, 1, 2, 3, 4, 5, 6, 8, 10, 13];
  return range(10).map((f) => {
    const flail = f < 6;
    const src = pose({
      eyes: f < 3 ? 'wide' : 'shut',
      tip: [[90, 110, 95, 120, 140, 160, 170, 175, 180, 180][f], 0.1],
      bf: flail ? { sx: 10, sy: 11, hx: [13, 12, 13, 12, 12, 11][f], hy: [7, 6, 8, 7, 9, 10][f] } : { sx: 10, sy: 11, hx: 11, hy: 9 },
      bb: flail ? { sx: 6, sy: 11, hx: [2, 3, 2, 3, 3, 4][f], hy: [6, 8, 7, 8, 9, 10][f] } : { sx: 6, sy: 11, hx: 4, hy: 9 },
      thread: { ang: 100, grav: -0.5, amp: 1.2, phase: f },
    });
    const out = new Px(S, S);
    const dy = sink[f];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = src.get(x, y);
      const ny = y + dy;
      if (!aOf(v) || ny > 15) continue;
      // deeper rows tinted toward the water colour
      const depth = clamp((ny - 9) / 6, 0, 1) * 0.6 + f * 0.03;
      out.set(x, ny, mix(v, WATER[2], Math.min(0.75, depth)));
    }
    // bubbles rising from the head
    for (let i = 0; i < 4; i++) {
      const age = f - i * 2;
      if (age < 1) continue;
      const bx = 9 + Math.round(Math.sin(age * 1.4 + i) * 1.5) - (i % 2), by = 7 + dy - age * 2 - i;
      if (by < 0 || by > 15) continue;
      if (i % 2 === 0) { out.set(bx, by, WATER[4]); out.set(bx + 1, by, ICE[5]); out.set(bx, by + 1, WATER[3]); out.set(bx + 1, by + 1, WATER[4]); }
      else out.set(bx, by, ICE[5]);
    }
    if (f >= 8) { out.set(7, 14 - (f - 8) * 3, WATER[4]); out.set(10, 12 - (f - 8) * 4, ICE[5]); }
    return out;
  });
}

function frozen(): Px[] {
  const inner = pose({ eyes: 'wide', tipS: 'high', bf: { sx: 11, sy: 11, hx: 12, hy: 10 }, bb: { sx: 6, sy: 11, hx: 4, hy: 10 }, thread: null });
  tintPx(inner, ICE[4], 0.18);
  const out = new Px(S, S);
  out.blit(inner, 0, 0);
  // translucent block 12×14 at (2,2)
  const x0 = 2, y0 = 2, x1 = 13, y1 = 15;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const edgeL = x === x0, edgeR = x === x1, edgeT = y === y0, edgeB = y === y1;
    let c: Color;
    if (edgeT || edgeL) c = ((ICE[4] & 0x00ffffff) | (230 << 24)) >>> 0;
    else if (edgeR || edgeB) c = ((ICE[1] & 0x00ffffff) | (235 << 24)) >>> 0;
    else {
      const diag = (x - x0) - (y - y0);
      const a = diag === 3 || diag === 4 ? 96 : 34;
      c = (((diag === 3 || diag === 4 ? ICE[5] : ICE[3]) & 0x00ffffff) | (a << 24)) >>> 0;
    }
    out.blend(x, y, c);
  }
  // inner bevel + facets + cracks
  for (let x = x0 + 1; x < x1; x++) out.blend(x, y0 + 1, ((ICE[5] & 0x00ffffff) | (120 << 24)) >>> 0);
  for (let y = y0 + 1; y < y1; y++) out.blend(x0 + 1, y, ((ICE[5] & 0x00ffffff) | (90 << 24)) >>> 0);
  out.set(x0, y0, ICE[5]); out.set(x0 + 1, y0, ICE[5]); out.set(x0, y0 + 1, ICE[5]);
  out.set(x1, y1, ICE[0]);
  for (const [x, y] of [[11, 4], [12, 5], [11, 6], [10, 13], [9, 14]]) out.set(x, y, ICE[5]);
  for (const [x, y] of [[4, 12], [5, 13], [5, 14]]) out.blend(x, y, ((ICE[1] & 0x00ffffff) | (200 << 24)) >>> 0);
  sparkle(out, 4, 4, ICE[5], ICE[4]);
  return [out];
}

// --- Marks (7×7, anchor (3,6)) ----------------------------------------------------------------

function markClimber(): Px {
  // a little climbing glove with hooked iron claws
  const p = new Px(7, 7);
  stamp(p, [
    '.a.a.a.',
    '.b.b.b.',
    '.ccccd.',
    '.cccccd',
    '.ccccd.',
    '..eee..',
    '.......',
  ], { a: IRON[5], b: IRON[3], c: WOOD[4], d: WOOD[3], e: HOOD[3] }, 0, 0);
  p.set(2, 2, WOOD[5]);
  selout(p);
  return p;
}

function markGlider(): Px {
  // a small leaf with a midrib and stalk
  const p = new Px(7, 7);
  stamp(p, [
    '....ab.',
    '...abbc',
    '..abvc.',
    '.abvcc.',
    '.bvcc..',
    '.d.....',
    '.......',
  ], { a: LEAF[5], b: LEAF[4], c: LEAF[3], v: LEAF[2], d: WOOD[3] }, 0, 0);
  selout(p);
  return p;
}

// --- Public ----------------------------------------------------------------------------------

export function buildCharacterSprites(): SpriteLib {
  return {
    'wyrd.walk': anim(walk()),
    'wyrd.fall': anim(fall()),
    'wyrd.tumble': anim(tumble()),
    'wyrd.land': anim(land()),
    'wyrd.warden': anim(warden()),
    'wyrd.weave': anim(weave()),
    'wyrd.shrug': anim(shrug()),
    'wyrd.bash': anim(bash()),
    'wyrd.mine': anim(mine()),
    'wyrd.dig': anim(dig()),
    'wyrd.climb': anim(climb()),
    'wyrd.hoist': anim(hoist()),
    'wyrd.glide_open': anim(glideOpen()),
    'wyrd.glide': anim(glide()),
    'wyrd.plant': anim(plant()),
    'wyrd.leap': anim(leap()),
    'wyrd.exit': anim(exitAnim()),
    'wyrd.unravel': anim(unravel()),
    'wyrd.burn': anim(burn()),
    'wyrd.drown': anim(drown()),
    'wyrd.frozen': anim(frozen()),
    'mark.climber': { frames: [markClimber().toCanvas()], ax: 3, ay: 6 },
    'mark.glider': { frames: [markGlider().toCanvas()], ax: 3, ay: 6 },
  };
}
