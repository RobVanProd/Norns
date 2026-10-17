// Named, hand-tuned colour ramps for characters, entities and UI, plus the small sprite helpers
// shared by characters.ts / entities.ts / icons.ts (keyed pixel maps, selective outlines, mask
// shading). Ramps run dark → light and are hue-shifted: shadows drift to blue/purple, highlights
// to warm yellow. Outline colours are dark saturated versions of the fill (never pure black),
// with a lighter "lit" variant used on top/left-facing edges.

import { Px, hex, toHsl, fromHsl, aOf, mix, type Color } from './px';

const c = (...xs: string[]): Color[] => xs.map((x) => hex(x));

// --- Wyrdling ---------------------------------------------------------------------------------

/** teal-cyan hood: 0 deep shadow (blue) … 3 base #3fd0c9 … 5 warm mint highlight */
export const HOOD = c('#12406a', '#1a6e8e', '#25a2ab', '#3fd0c9', '#8eefd4', '#e4ffe2');
/** pale round face: 0 deep (rose-violet) … 4 highlight */
export const FACE = c('#8c4f6c', '#d4999a', '#f2cdb4', '#fde9d4', '#fffaf0');
/** deep indigo cloak */
export const CLOAK = c('#1c1546', '#2b2678', '#3c3ca6', '#5458cc', '#8a8deb');
export const BOOT = c('#3a2232', '#5c3a40', '#8c6458');
/** golden thread #f2c14e */
export const GOLD = c('#6e340c', '#a95f16', '#dc9a2a', '#f2c14e', '#ffe590', '#fffbe4');
export const EYE = hex('#1e1038');
export const EYE_HI = hex('#4b3d86');
export const GLINT = hex('#ffffff');
export const BLUSH = hex('#f39890');
export const CAVITY = hex('#16305a');

// --- Materials / props ------------------------------------------------------------------------

export const LEAF = c('#173b30', '#22663c', '#3c9440', '#74c048', '#b6e46a', '#effcae');
export const WOOD = c('#2e1812', '#4f2b1a', '#77421f', '#9f622e', '#c98c48', '#ebbc72');
export const ROOT = c('#21140f', '#3b2416', '#5a371e', '#7f532e', '#a77546', '#d0a06c');
export const STONE = c('#211d2a', '#3a3442', '#58505e', '#7a717e', '#a39aa2', '#d0c9c6');
export const IRON = c('#161a2a', '#2a3248', '#46516e', '#6b7a99', '#9fadc6', '#dce6f2');
export const RUNE = c('#3a0716', '#7c1222', '#c4262a', '#f2502e', '#ff9c4c', '#ffe3a6');
export const FIRE = c('#4c0e08', '#9c2408', '#e2520e', '#ff8e1c', '#ffcc3c', '#fff6b8');
export const ICE = c('#1a2f62', '#2e5f9c', '#5a9cd2', '#94d2ee', '#cbf2fb', '#f6ffff');
export const WATER = c('#0e2252', '#1a478a', '#2e76c2', '#62aae6', '#aadff8');
export const BONE = c('#3e2a2c', '#7a625a', '#b8a690', '#e6dcc6', '#fffaf0');
export const EARTH = c('#2a1812', '#4a2c1c', '#70462a', '#97683e', '#bf9058');
export const ASH = c('#120c10', '#2a2026', '#463a3e', '#6a5c5a', '#958680');
export const TEAL = c('#0c3446', '#167488', '#3fd0c9', '#9ff8ec', '#f0fffb');
export const VIOLET = c('#1d1438', '#382862', '#5a4692', '#8670c2', '#c2ace8');
export const MUSHROOM_RED = c('#4a0f1e', '#8e1e2a', '#cc3a34', '#f0704c', '#ffb48a');
export const CLOTH_RED = c('#2c0a1a', '#5a1428', '#8e2236', '#c43a44', '#e8706a');

// --- UI ---------------------------------------------------------------------------------------

export const UI = {
  panel: hex('#1b1d2b'),
  panelHi: hex('#2c3046'),
  ink: hex('#f4ecd8'),
  dim: hex('#7c7f9a'),
  good: hex('#7fe08a'),
  bad: hex('#ff5a4a'),
};
export const UI_GREY = c('#1c1e2e', '#33364c', '#55596f', '#8a8ea6', '#c4c8da', '#f4f4fa');
export const UI_BLUE = c('#10204a', '#1c3e82', '#2e6cc0', '#55a2ea', '#9ad4fa', '#e4f6ff');
export const UI_CYAN = c('#0a3040', '#13687a', '#25a8b4', '#5ad8d6', '#a6f4e8', '#eafff8');
export const UI_GREEN = c('#0f2e22', '#1c5a34', '#2f8c42', '#5cbe50', '#a2e47a', '#e8fcc0');
export const UI_AMBER = c('#3a1606', '#74300c', '#b85a14', '#e88a22', '#ffbe4a', '#fff0a8');
export const UI_ORANGE = c('#3a0e08', '#7a2410', '#c04818', '#f07a2a', '#ffb05a', '#ffe6b0');

// --- Outline registry -------------------------------------------------------------------------

const outlineMap = new Map<Color, [Color, Color]>();

/** Register explicit [lit, dark] outline colours for a set of fill colours. */
export function registerOutline(fills: Color[], lit: string | Color, dark: string | Color) {
  const l = typeof lit === 'string' ? hex(lit) : lit;
  const d = typeof dark === 'string' ? hex(dark) : dark;
  for (const f of fills) outlineMap.set(f, [l, d]);
}

/** Outline colours for a fill: dark, saturated, hue nudged toward blue. Cached. */
export function outlineFor(col: Color): [Color, Color] {
  const o = outlineMap.get(col);
  if (o) return o;
  const [h, s, l] = toHsl(col);
  const toward = (deg: number) => {
    const d = ((250 - h + 540) % 360) - 180;
    return h + Math.sign(d) * Math.min(Math.abs(d), deg);
  };
  const lit = fromHsl(toward(10), Math.min(1, s * 0.85 + 0.2), Math.max(0.1, l * 0.42));
  const dark = fromHsl(toward(22), Math.min(1, s * 0.9 + 0.25), Math.max(0.05, l * 0.22));
  const r: [Color, Color] = [lit, dark];
  outlineMap.set(col, r);
  return r;
}

registerOutline(HOOD, '#1b5f86', '#0b2244');
registerOutline(FACE, '#8a4466', '#4a1a3e');
registerOutline([EYE, EYE_HI, GLINT, BLUSH, CAVITY], '#4a1a3e', '#2a0e2a');
registerOutline(CLOAK, '#2c2468', '#100b2a');
registerOutline(BOOT, '#2a1428', '#130814');
registerOutline(GOLD, '#7a3a0e', '#40180a');
registerOutline(LEAF, '#1c4a2a', '#0c2418');
registerOutline(WOOD, '#3a1c12', '#1e0c0a');
registerOutline(IRON, '#262c44', '#0e1020');
registerOutline(STONE, '#2e2836', '#141018');
registerOutline(RUNE, '#5a0c1c', '#2a0410');
registerOutline(ICE, '#2a4c86', '#122450');
registerOutline(ROOT, '#2a180e', '#140a06');
registerOutline(EARTH, '#3a2012', '#1a0c08');
registerOutline(BONE, '#5a3e3a', '#2a1618');

// --- Helpers ----------------------------------------------------------------------------------

export type Key = Record<string, Color>;

/** Stamp a keyed pixel map ('.' / ' ' transparent; unknown keys skipped). */
export function stamp(p: Px, rows: string[], key: Key, ox: number, oy: number, flipX = false) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    const w = row.length;
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = key[ch];
      if (col === undefined) continue;
      p.set(flipX ? ox + (w - 1 - x) : ox + x, oy + y, col);
    }
  }
}

/**
 * Selective outline: every transparent pixel 4-adjacent to an opaque pixel becomes the dark,
 * saturated outline colour of that neighbour — the lighter variant on top/left-facing edges
 * (light comes from the top-left). `skip` excludes fills (e.g. glow colours) from spawning outline.
 */
export function selout(p: Px, skip?: (c: Color) => boolean) {
  const w = p.w, h = p.h;
  const src = p.data.slice();
  const solid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const v = src[y * w + x];
    return aOf(v) > 100 && !(skip && skip(v));
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (aOf(src[y * w + x]) > 0) continue;
      const L = solid(x - 1, y), R = solid(x + 1, y), U = solid(x, y - 1), D = solid(x, y + 1);
      if (!(L || R || U || D)) continue;
      const lit = (R || D) && !(L || U);
      // neighbour whose colour decides the outline: prefer the one below (top edges), then sides
      const nx = D ? x : R ? x + 1 : L ? x - 1 : x;
      const ny = D ? y + 1 : R ? y : L ? y : y - 1;
      const [cl, cd] = outlineFor(src[ny * w + nx]);
      p.data[y * w + x] = lit ? cl : cd;
    }
  }
}

/**
 * Shade a mask (any opaque pixel of `mask` counts) with a ramp: top and left edges brighter,
 * bottom and right edges darker (top-left light). Writes into `out` at (ox,oy).
 * `base` is the ramp index of interior pixels; `rim` adds a second, softer band.
 */
export function shadeMask(mask: Px, ramp: Color[], out: Px, base: number, ox = 0, oy = 0, rim = true) {
  const w = mask.w, h = mask.h;
  const m = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && aOf(mask.data[y * w + x]) > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!m(x, y)) continue;
      let v = base;
      if (!m(x, y - 1)) v += 1;
      else if (rim && !m(x, y - 2)) v += 0.4;
      if (!m(x - 1, y)) v += 0.75;
      if (!m(x + 1, y)) v -= 0.9;
      if (!m(x, y + 1)) v -= 1;
      else if (rim && !m(x, y + 2)) v -= 0.35;
      const i = Math.max(0, Math.min(ramp.length - 1, Math.round(v)));
      out.set(ox + x, oy + y, ramp[i]);
    }
  }
}

/** Mix every opaque pixel toward `col` by t (alpha preserved). */
export function tintPx(p: Px, col: Color, t: number) {
  p.map((v) => {
    const m = mix(v, col, t);
    return ((m & 0x00ffffff) | (v & 0xff000000)) >>> 0;
  });
}

/** Plus-shaped sparkle with a bright core. */
export function sparkle(p: Px, x: number, y: number, core: Color, arm: Color, size = 1) {
  p.set(x, y, core);
  for (let i = 1; i <= size; i++) {
    p.set(x - i, y, arm); p.set(x + i, y, arm); p.set(x, y - i, arm); p.set(x, y + i, arm);
  }
}

/** Soft round glow (alpha falloff) blended over p. */
export function glow(p: Px, cx: number, cy: number, r: number, col: Color, strength = 0.6) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      const a = Math.round(255 * strength * (1 - d) * (1 - d));
      if (a > 6) p.blend(x, y, ((col & 0x00ffffff) | ((a & 255) << 24)) >>> 0);
    }
  }
}

/** Remove "L-corner" pixels from a pixel path so 1-px lines stay crisp (pixel-perfect lines). */
export function pixelPerfect(pts: [number, number][]): [number, number][] {
  const dedup: [number, number][] = [];
  for (const q of pts) {
    const last = dedup[dedup.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) dedup.push(q);
  }
  const out: [number, number][] = [];
  for (let i = 0; i < dedup.length; i++) {
    const a = out[out.length - 1], b = dedup[i], cc = dedup[i + 1];
    if (a && cc && (a[0] === b[0] || a[1] === b[1]) && (cc[0] === b[0] || cc[1] === b[1]) && a[0] !== cc[0] && a[1] !== cc[1]) continue;
    out.push(b);
  }
  return out;
}

export function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
