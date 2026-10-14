// Parallax backgrounds — see docs/ART_SPEC.md "Backgrounds". Every layer is 512 px wide and
// horizontally tileable (all noise is periodic in 512 and shapes are drawn at x−512, x, x+512).
// Atmospheric perspective: far layers are lighter, desaturated and pulled toward the horizon
// colour; posterised, Bayer-dithered fog bands sit at the base of each layer.

import { Px, type Color, hex as hexRaw, mix, mulberry32, aOf, rgba, rOf, gOf, bOf } from './px';
import type { BackgroundSet, BgLayer, RealmId } from './types';
import { ENV } from './envPalette';
import { fbm1, noise1, smooth, clamp01, bayer4, Sculpt, cells, slope, despeckle, pick, tubeBuf, tube, gnarl, fbmT, toCv, fsin } from './envKit';

const LW = 512;
const M = 511; // LW - 1, for cheap wrapping of integer x with `& M`
const TAU = Math.PI * 2;

const HEXC = new Map<string, Color>();
/** memoised hex() */
function hex(s: string, a?: number): Color {
  const k = a === undefined ? s : s + a;
  let c = HEXC.get(k);
  if (c === undefined) { c = hexRaw(s, a); HEXC.set(k, c); }
  return c;
}
const H = (...s: string[]) => s.map((v) => hex(v));

const MIN_LAYER_H = 160;
/** wrap a layer buffer as a BgLayer; short layers are padded with transparent rows on top so
 *  every canvas is 160–300 px tall as the spec requires (bottom-anchored, so nothing moves) */
function mkLayer(p: Px, parallax: number, bottomOffset: number): BgLayer {
  if (p.h >= MIN_LAYER_H) return { canvas: toCv(p), parallax, bottomOffset };
  const cv = document.createElement('canvas');
  cv.width = p.w;
  cv.height = MIN_LAYER_H;
  const img = new ImageData(new Uint8ClampedArray(p.data.buffer as ArrayBuffer, p.data.byteOffset, p.w * p.h * 4), p.w, p.h);
  cv.getContext('2d', { willReadFrequently: true })!.putImageData(img, 0, MIN_LAYER_H - p.h);
  return { canvas: cv, parallax, bottomOffset };
}

/** sample a periodic 1D function into a 512 array */
function col1(fn: (x: number) => number): Float32Array {
  const a = new Float32Array(LW);
  for (let x = 0; x < LW; x++) a[x] = fn(x);
  return a;
}

/** posterised + dithered mix toward `to` */
function dmix(c: Color, to: Color, f: number, x: number, y: number, steps = 6): Color {
  const q = Math.floor(clamp01(f) * steps + bayer4(x, y)) / steps;
  if (q <= 0) return c;
  const m = mix(c, to, Math.min(1, q));
  return rgba(rOf(m), gOf(m), bOf(m), aOf(c));
}

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** apply haze (uniform) + posterised, dithered bottom fog to every opaque pixel */
function atmos(p: Px, haze: Color, hazeAmt: number, fog: Color, fogTop: number, fogBottom: number, fogMax = 1) {
  const hr = rOf(haze), hg = gOf(haze), hb = bOf(haze);
  const fr = rOf(fog), fg = gOf(fog), fb = bOf(fog);
  const steps = 6;
  const d = p.data, w = p.w;
  for (let y = 0; y < p.h; y++) {
    const f = smooth(fogTop, fogBottom, y) * fogMax;
    const row = (y & 3) * 4;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = d[i];
      const a = c >>> 24;
      if (a === 0) continue;
      let r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
      if (hazeAmt > 0) { r += (hr - r) * hazeAmt; g += (hg - g) * hazeAmt; b += (hb - b) * hazeAmt; }
      if (f > 0) {
        const q = Math.min(steps, Math.floor(f * steps + B4[row + (x & 3)])) / steps;
        if (q > 0) { r += (fr - r) * q; g += (fg - g) * q; b += (fb - b) * q; }
      }
      d[i] = ((a << 24) | ((b + 0.5) << 16) | ((g + 0.5) << 8) | (r + 0.5)) >>> 0;
    }
  }
}

/** a stylised pine with a tiered, sawtooth silhouette; lit on the left */
function pine(p: Px, cx: number, baseY: number, h: number, w: number, lit: Color, mid: Color, dark: Color, rim?: Color) {
  const tiers = Math.max(3, Math.round(h / 6));
  for (let off = -LW; off <= LW; off += LW) {
    const x0 = cx + off;
    if (x0 < -w || x0 > LW + w) continue;
    for (let r = 0; r < h; r++) {
      const t = r / h;
      const tierT = (t * tiers) % 1;
      const hw = Math.max(0.5, (w / 2) * Math.pow(t, 0.9) * (0.62 + 0.38 * tierT));
      const xa = Math.round(x0 - hw), xb = Math.round(x0 + hw);
      const y = Math.round(baseY - h + r);
      for (let x = xa; x <= xb; x++) {
        let c = mid;
        if (x <= xa + (hw > 3 ? 1 : 0)) c = rim && tierT > 0.4 ? rim : lit;
        else if (x > x0 + hw * 0.25) c = dark;
        if (tierT > 0.85 && x > x0) c = dark;
        p.set(x, y, c);
      }
    }
    p.set(Math.round(x0), Math.round(baseY - h - 1), lit);
  }
}

/** draw at x−512, x and x+512 so shapes wrap seamlessly */
function wrapDraw(fn: (off: number) => void) {
  fn(-LW); fn(0); fn(LW);
}

// ---------------------------------------------------------------- back walls

function backWall(realm: RealmId): HTMLCanvasElement {
  const P = ENV[realm];
  const rmp = P.wall;
  const p = new Px(64, 64);
  const seed = realm === 'midgard' ? 71 : realm === 'niflheim' ? 72 : 73;
  const cl = cells(64, 64, 3, 4, seed, 0.9, 1, 1.3);
  const nz = fbmT(seed + 3, 64, 16, 3);
  const hf = new Float32Array(64 * 64);
  for (let i = 0; i < 4096; i++) hf[i] = smooth(0, 3, cl.edge[i]) + cl.rnd[cl.id[i]] * 0.4;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = y * 64 + x;
    let v = 0.55 + (cl.rnd[cl.id[i]] - 0.5) * 0.18 + (nz(x, y) - 0.5) * 0.3 + slope(hf, 64, 64, x, y, 1.2) * 0.8;
    if (cl.edge[i] < 0.7) v -= 0.3;
    p.set(x, y, pick(rmp, v));
  }
  despeckle(p, true, 1, 2);
  const rng = mulberry32(seed + 9);
  // tool marks: short diagonal scrapes so it reads as a dug recess
  for (let k = 0; k < 6; k++) {
    const x = Math.floor(rng() * 64), y = Math.floor(rng() * 64);
    for (let s = 0; s < 4; s++) { p.setWrap(x + s, y + s, rmp[0]); p.setWrap(x + s + 1, y + s, rmp[3]); }
  }
  if (realm === 'midgard') for (let k = 0; k < 3; k++) {
    let x = rng() * 64, y = rng() * 64;
    for (let s = 0; s < 12; s++) { p.setWrap(Math.round(x), Math.round(y), rmp[4]); x += 1; y += Math.sin(s * 0.7 + k) * 0.6; }
  }
  if (realm === 'niflheim') for (let k = 0; k < 8; k++) p.setWrap(rng() * 64, rng() * 64, rmp[5]);
  if (realm === 'muspelheim') for (let k = 0; k < 5; k++) { const x = rng() * 64, y = rng() * 64; p.setWrap(x, y, hex('#7a2a18')); p.setWrap(x + 1, y, hex('#5a2018')); }
  return toCv(p);
}

// ---------------------------------------------------------------- shared mountain range

interface Peak { x: number; top: number; sl: number; sr: number; lean: number }

function range(
  p: Px, peaks: Peak[], seed: number,
  col: { lit: Color; litD: Color; sh: Color; shD: Color; snowL?: Color; snowS?: Color },
  snowDepth: number, jagAmt = 7,
) {
  const jag = col1(fbm1(seed, LW, 24, 4));
  const gul = col1(noise1(seed + 5, LW, 5));
  const sn = col1(noise1(seed + 9, LW, 9));
  const top = new Float32Array(LW), own = new Int16Array(LW), odx = new Float32Array(LW);
  for (let x = 0; x < LW; x++) {
    let best = 1e9, bi = 0, bdx = 0;
    for (let k = 0; k < peaks.length; k++) {
      const pk = peaks[k];
      for (let off = -LW; off <= LW; off += LW) {
        const dx = x - (pk.x + off);
        const y = pk.top + (dx < 0 ? -dx * pk.sl : dx * pk.sr) + (jag[x] - 0.5) * jagAmt * 2;
        if (y < best) { best = y; bi = k; bdx = dx; }
      }
    }
    top[x] = best; own[x] = bi; odx[x] = bdx;
  }
  // ridge line x-offset per peak and row, precomputed
  const ridgeX = new Float32Array(peaks.length * p.h);
  for (let k = 0; k < peaks.length; k++) for (let y = 0; y < p.h; y++) {
    const dy = y - peaks[k].top;
    ridgeX[k * p.h + y] = dy * peaks[k].lean + Math.sin(dy * 0.15 + peaks[k].x) * 2;
  }
  for (let x = 0; x < LW; x++) {
    const pk = peaks[own[x]];
    const ro = own[x] * p.h;
    const dx = odx[x];
    const ty = Math.max(0, Math.floor(top[x]));
    for (let y = ty; y < p.h; y++) {
      const dy = y - pk.top;
      const rx = ridgeX[ro + y];
      const lit = dx < rx;
      const along = lit ? dx + dy * 0.7 : dx - dy * 0.7;
      const g = gul[Math.round(along * 1.3 + pk.x * 3) & M] > 0.62;
      let c = lit ? (g ? col.litD : col.lit) : (g ? col.shD : col.sh);
      if (Math.abs(dx - rx) < 0.8 && dy > 2) c = lit ? col.litD : col.sh;
      if (col.snowL && col.snowS) {
        const line = pk.top + snowDepth * (0.6 + sn[x] * 0.8) - (g ? -4 : 3) + (y - top[x] < 2 ? 3 : 0);
        if (y < line) c = lit ? col.snowL : col.snowS;
        if (y === ty && lit) c = col.snowL;
      }
      p.data[y * LW + x] = c;
    }
  }
  return top;
}

// ---------------------------------------------------------------- gnarled tubes (roots)

interface RootStyle { ramp: Color[]; rim: Color; moss?: Color[]; haze: Color; hazeAmt: number }

/** giant gnarled roots arching over the scene (tileable) */
function rootsArch(h: number, seed: number, st: RootStyle): Px {
  const b = tubeBuf(LW, h);
  const rng = mulberry32(seed);
  const arches = [
    { p: [[30, h + 20], [20, 40], [250, -60], [310, h + 20]], r0: 18, r1: 8, z: 20 },
    { p: [[290, h + 20], [330, 70], [480, 20], [548, h + 20]], r0: 15, r1: 7, z: 10 },
    { p: [[-60, -20], [60, 70], [140, 40], [200, -20]], r0: 10, r1: 6, z: 30 },
    { p: [[380, -30], [420, 60], [500, 90], [560, -20]], r0: 9, r1: 6, z: 28 },
    { p: [[150, h + 20], [175, 190], [215, 190], [240, h + 20]], r0: 8, r1: 4, z: 40 },
  ];
  arches.forEach((a, k) => {
    const g = gnarl(a.p, 30, a.r0, a.r1, seed + k * 17, 3 + a.r0 * 0.15);
    tube(b, g.pts, g.rad, a.z, k);
    // offshoot rootlets
    for (let j = 0; j < 2; j++) {
      const i0 = 3 + Math.floor(rng() * 24);
      const [sx, sy] = g.pts[i0];
      const dir = rng() < 0.5 ? -1 : 1;
      const len = 30 + rng() * 50;
      const sub = gnarl([[sx, sy], [sx + dir * len * 0.4, sy + len * 0.2], [sx + dir * len * 0.8, sy + len * 0.6], [sx + dir * len, sy + len]], 12, g.rad[i0] * 0.45, 1.5, seed + k * 31 + j, 2);
      sub.rad = sub.rad.map((_r, i) => Math.max(1.2, g.rad[i0] * 0.45 * (1 - i / 12) + 1));
      tube(b, sub.pts, sub.rad, a.z - 2, k);
    }
  });
  const grooveN = col1(noise1(seed + 3, LW, 14));
  const ramp = st.ramp, n = ramp.length;
  const lx = -0.5, ly = -0.75, lz = 0.45, ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
  const p = new Px(LW, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < LW; x++) {
    const i = y * LW + x;
    if (b.id[i] < 0) continue;
    const nx = b.nx[i], ny = b.ny[i];
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    let t = 0.1 + 0.9 * Math.max(0, (nx * lx + ny * ly + nz * lz) / ll);
    // bark: longitudinal grooves that wander along the root
    const ac = b.ac[i], al = b.al[i];
    const gv = fsin(ac * 8.5 + grooveN[Math.floor(al * 1.7) & M] * 5 + b.id[i]);
    let idx = Math.floor(clamp01(t) * n * 0.999);
    if (gv > 0.62) idx -= 2;
    else if (gv > 0.35) idx -= 1;
    else if (gv < -0.8 && t > 0.45) idx += 1;
    // knots
    const kp = (al + b.id[i] * 37) % 70;
    if (kp < 6 && Math.abs(ac + 0.2) < 0.35) idx += (kp < 2 || kp > 4) ? -2 : 1;
    // occlusion against a nearer tube
    const zz = b.z[i] + 2;
    if ((x > 0 && b.id[i - 1] >= 0 && b.id[i - 1] !== b.id[i] && b.z[i - 1] > zz) || (y > 0 && b.id[i - LW] >= 0 && b.id[i - LW] !== b.id[i] && b.z[i - LW] > zz) ||
        (x < LW - 1 && b.id[i + 1] >= 0 && b.id[i + 1] !== b.id[i] && b.z[i + 1] > zz) || (y < h - 1 && b.id[i + LW] >= 0 && b.id[i + LW] !== b.id[i] && b.z[i + LW] > zz)) idx = 0;
    p.data[i] = ramp[Math.max(0, Math.min(n - 1, idx))];
  }
  // outline + rim light on the upper-left silhouette, moss on top surfaces (occupancy from b.id)
  const mossN = col1(noise1(seed + 9, LW, 9));
  const ids = b.id;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < LW - 1; x++) {
    const i = y * LW + x;
    if (ids[i] < 0) {
      if (ids[i + 1] >= 0 || ids[i - 1] >= 0 || ids[i + LW] >= 0 || ids[i - LW] >= 0) p.data[i] = ramp[0];
      continue;
    }
    if (ids[i - LW] < 0 && b.ny[i] < -0.2) {
      const mossy = st.moss && mossN[x] > 0.55;
      p.data[i] = mossy && st.moss ? st.moss[2] : st.rim;
      if (mossy && st.moss && ids[i + LW] >= 0) p.data[i + LW] = st.moss[1];
    } else if (ids[i - 1] < 0 && b.nx[i] < -0.4) p.data[i] = mix(p.data[i], st.rim, 0.5);
  }
  // hanging moss / vines from undersides
  if (st.moss) {
    const vr = mulberry32(seed + 7);
    for (let x = 0; x < LW; x++) {
      if (vr() > 0.2) continue;
      for (let y = 0; y < h - 1; y++) {
        const i = y * LW + x;
        if (b.id[i] >= 0 && b.id[i + LW] < 0 && b.ny[i] > 0.4) {
          const len = 3 + Math.floor(vr() * 20);
          for (let k = 1; k <= len; k++) {
            const xx = x + Math.round(Math.sin(k * 0.5 + x) * 0.8);
            if (aOf(p.get(xx, y + k)) === 0) p.set(xx, y + k, st.moss[k === len || k % 5 === 0 ? 2 : 1]);
          }
          break;
        }
      }
    }
  }
  atmos(p, st.haze, st.hazeAmt, st.haze, h - 50, h, 0.5);
  return p;
}

// ---------------------------------------------------------------- Midgard

function midgard(): BackgroundSet {
  const sky = ['#25225a', '#3c3472', '#62467e', '#9c5a80', '#d27c7a', '#eea57a', '#f9d29a'];
  const horizon = hex('#f0b282');
  const layers: BgLayer[] = [];

  // L0: distant mountains catching dawn light
  {
    const p = new Px(LW, 140);
    const rng = mulberry32(31);
    const peaks: Peak[] = [];
    for (let k = 0; k < 6; k++) peaks.push({ x: k * (LW / 6) + rng() * 40, top: 14 + rng() * 46, sl: 0.75 + rng() * 0.5, sr: 0.85 + rng() * 0.6, lean: (rng() - 0.5) * 0.5 });
    range(p, peaks, 33, {
      lit: hex('#b294b2'), litD: hex('#9c82a8'), sh: hex('#7a6c9e'), shD: hex('#6a5e90'),
      snowL: hex('#fadadc'), snowS: hex('#b6aed2'),
    }, 26);
    atmos(p, horizon, 0.18, horizon, 70, 165, 0.85);
    layers.push(mkLayer(p, 0.08, 82));
  }
  // L1: far misty pine forest
  {
    const p = new Px(LW, 110);
    const hill = col1(fbm1(41, LW, 64, 3));
    const lit = hex('#7a7aa0'), mid = hex('#62668e'), dark = hex('#545680');
    for (let x = 0; x < LW; x++) for (let y = Math.floor(58 + (hill[x] - 0.5) * 28); y < p.h; y++) p.data[y * LW + x] = mid;
    const rng = mulberry32(42);
    for (let x = 0; x < LW; x += 4 + Math.floor(rng() * 5)) {
      const by = 62 + (hill[x] - 0.5) * 28;
      const h = 12 + rng() * 22;
      pine(p, x, by + 4, h, h * 0.45, lit, mid, dark);
    }
    atmos(p, horizon, 0.3, hex('#e6a49a'), 40, 104);
    layers.push(mkLayer(p, 0.22, 38));
  }
  // L2: nearer pine forest, darker, dawn rim light
  {
    const p = new Px(LW, 130);
    const hill = col1(fbm1(51, LW, 96, 3));
    const lit = hex('#4a5670'), mid = hex('#323e56'), dark = hex('#28304a'), rim = hex('#9a6a74');
    for (let x = 0; x < LW; x++) for (let y = Math.floor(70 + (hill[x] - 0.5) * 30); y < p.h; y++) p.data[y * LW + x] = mid;
    const rng = mulberry32(52);
    for (let x = 0; x < LW; x += 6 + Math.floor(rng() * 8)) {
      const by = 76 + (hill[x] - 0.5) * 30;
      const h = 22 + rng() * 34;
      pine(p, x, by + 6, h, h * 0.42, lit, mid, dark, rim);
    }
    atmos(p, horizon, 0.1, hex('#b0787e'), 70, 128, 0.9);
    layers.push(mkLayer(p, 0.4, 18));
  }
  // L3: giant Yggdrasil roots arching overhead
  {
    const p = rootsArch(300, 61, {
      ramp: H('#1a1018', '#24161e', '#311e24', '#40282a', '#523430', '#684236', '#86563e'),
      rim: hex('#c07a52'), moss: H('#1c2c24', '#2a3e2c', '#3e5a32'), haze: hex('#6e4a68'), hazeAmt: 0.38,
    });
    layers.push(mkLayer(p, 0.62, 0));
  }
  return { sky, layers, backWall: backWall('midgard'), ambient: [1.0, 0.95, 0.88], atmosphere: 'pollen' };
}

// ---------------------------------------------------------------- Niflheim

function niflheim(): BackgroundSet {
  const sky = ['#070b1e', '#0a1228', '#0d1a38', '#122642', '#18344f', '#22465e', '#2c5868'];
  const horizon = hex('#2c5868');
  const layers: BgLayer[] = [];

  // L0: stars, aurora curtains and a distant glacier range
  {
    const H0 = 300;
    const p = new Px(LW, H0);
    const rng = mulberry32(81);
    const starHi = hex('#eaf4ff'), starArm = hex('#7c96c8', 200);
    for (let k = 0; k < 160; k++) {
      const x = Math.floor(rng() * LW), y = Math.floor(rng() * 240);
      const b = rng();
      const fade = 1 - y / 300;
      if (b > 0.975) {
        p.set(x, y, starHi);
        p.set(x + 1, y, starArm); p.set(x - 1, y, starArm); p.set(x, y + 1, starArm); p.set(x, y - 1, starArm);
      } else if (b > 0.82) p.set(x, y, hex('#b8c8ec', Math.round(255 * fade)));
      else p.set(x, y, hex('#6a7cac', Math.round(190 * fade)));
    }
    // aurora: folded curtains with vertical rays; bright sharp lower edge, violet upper fringe
    const ribbons = [
      { base: 110, amp: 22, k: 1, ph: 0.4, len: 64, seed: 3, a: 205 },
      { base: 150, amp: 12, k: 2, ph: 2.1, len: 44, seed: 7, a: 175 },
    ];
    const green = hex('#62f2a6'), teal = hex('#38c0b0'), violet = hex('#8a50c8'), white = hex('#e0fff0');
    for (const rb of ribbons) {
      const rays = col1(noise1(rb.seed, LW, 2)), rays2 = col1(noise1(rb.seed + 1, LW, 7)), gaps = col1(fbm1(rb.seed + 3, LW, 90, 2)), lenN = col1(noise1(rb.seed + 2, LW, 40));
      for (let x = 0; x < LW; x++) {
        const fold = 4 * Math.sin((TAU * 6 * x) / LW + rb.ph * 3);
        const yc = rb.base + rb.amp * Math.sin((TAU * rb.k * x) / LW + rb.ph) + fold + rays2[x] * 2 - 1;
        const dfold = Math.abs(Math.cos((TAU * 6 * x) / LW + rb.ph * 3));
        const len = rb.len * (0.5 + lenN[x] * 0.9);
        const presence = 0.12 + 0.88 * smooth(0.32, 0.62, gaps[x]);
        if (presence <= 0) continue;
        const ray = (0.3 + 0.9 * (rays[x] * 0.55 + rays2[x] * 0.45)) * presence * (0.7 + 0.4 * (1 - dfold));
        for (let y = Math.floor(yc - len); y <= Math.ceil(yc); y++) {
          if (y < 0 || y >= H0) continue;
          const v = (yc - y) / len; // 0 at the lower edge → 1 at the top
          // crisp bright lower rim, then rays fading upward
          const edge = (yc - y) < 2.2;
          const inten = edge ? Math.min(1, 0.5 + ray * 0.6) : Math.min(1, ray * Math.pow(1 - v, 1.2) * 1.45);
          const q = Math.floor(inten * 5 + bayer4(x, y) * 0.95) / 5;
          if (q <= 0) continue;
          let c = edge ? (ray > 0.55 ? white : mix(green, white, 0.4)) : v < 0.4 ? mix(green, teal, v * 1.8) : mix(teal, violet, Math.min(1, (v - 0.4) * 2));
          c = rgba(rOf(c), gOf(c), bOf(c), Math.round(Math.min(1, q) * (edge ? Math.min(255, rb.a + 50) : rb.a)));
          p.blend(x, y, c);
        }
      }
    }
    // distant glacier range
    const rr = mulberry32(83);
    const peaks: Peak[] = [];
    for (let k = 0; k < 7; k++) peaks.push({ x: k * (LW / 7) + rr() * 30, top: 214 + rr() * 34, sl: 0.5 + rr() * 0.4, sr: 0.6 + rr() * 0.5, lean: 0.2 });
    const SUBY = 200;
    for (const pk of peaks) pk.top -= SUBY;
    const sub = new Px(LW, H0 - SUBY);
    range(sub, peaks, 85, { lit: hex('#5a7aa4'), litD: hex('#4e6c98'), sh: hex('#3c5482'), shD: hex('#364c78'), snowL: hex('#a8c6e6'), snowS: hex('#6a8ab8') }, 12, 4);
    atmos(sub, horizon, 0.32, horizon, 240 - SUBY, 300 - SUBY, 0.7);
    p.blit(sub, 0, SUBY);
    layers.push(mkLayer(p, 0.03, 30));
  }
  // L1: glacier cliffs with frozen waterfalls
  {
    const p = new Px(LW, 170);
    const rng = mulberry32(91);
    const top = new Float32Array(LW);
    let x = 0;
    const segs: { x0: number; x1: number; y: number }[] = [];
    while (x < LW) {
      const w = 30 + Math.floor(rng() * 56);
      segs.push({ x0: x, x1: Math.min(LW, x + w), y: 62 + Math.floor(rng() * 80) });
      x += w;
    }
    segs[segs.length - 1].y = segs[0].y;
    const jag = col1(fbm1(93, LW, 8, 2));
    for (const s of segs) for (let xx = s.x0; xx < s.x1; xx++) top[xx] = s.y + (jag[xx] - 0.5) * 8 + (xx - s.x0) * 0.08;
    const t2 = top.slice();
    for (let xx = 0; xx < LW; xx++) {
      let m = t2[xx];
      for (let k = -4; k <= 4; k++) m = Math.min(m, t2[(xx + k) & M] + Math.abs(k) * 2.5);
      top[xx] = m;
    }
    const stri = col1(noise1(95, LW, 3)), stri2 = col1(noise1(96, LW, 13));
    const body = H('#26446e', '#2e507e', '#385c8c', '#44699a', '#5478a8');
    const snowT = hex('#d6e8f8'), snowB = hex('#a6c2e0'), crev = hex('#7896c0');
    for (let xx = 0; xx < LW; xx++) {
      const ty = Math.floor(top[xx]);
      const slopeL = top[(xx + 1) & M] < top[xx] - 0.8;
      const slopeR = top[(xx - 1) & M] < top[xx] - 0.8;
      const sv = (stri[xx] - 0.5) * 2.2 + (stri2[xx] - 0.5) * 1.2 + (slopeL ? 1 : 0) - (slopeR ? 1 : 0);
      const capD = 3 + (stri2[xx] > 0.5 ? 2 : 0);
      for (let y = ty; y < p.h; y++) {
        const d = y - ty;
        const v = 2 + sv - d * 0.012 + (((y >> 3) + (xx >> 4)) % 7 === 0 ? -1 : 0);
        let c = body[Math.max(0, Math.min(4, Math.round(v)))];
        if (d < capD) c = d === 0 ? snowT : snowB;
        else if (d < 6 && stri[xx] > 0.55) c = crev;
        p.data[y * LW + xx] = c;
      }
    }
    // frozen waterfalls
    const fall = H('#6aa8d8', '#8ccaee', '#b8e6fa', '#eafaff');
    for (const fx of [70, 236, 400]) {
      const ty = Math.floor(top[fx]);
      const w = 8 + Math.floor(rng() * 5);
      for (let y = ty; y < p.h; y++) {
        const bulge = Math.round(Math.sin(y * 0.21 + fx) * 1.2 + Math.sin(y * 0.05) * 1.5);
        const spread = y > p.h - 22 ? (y - (p.h - 22)) : 0;
        const ww = w + Math.floor(spread * 0.8);
        for (let k = 0; k < ww; k++) {
          const xx = fx - Math.floor(w / 2) + k + bulge - Math.floor(spread * 0.4);
          const u = k / ww;
          let idx = u < 0.2 ? 2 : u < 0.35 ? 3 : u < 0.7 ? 1 : 0;
          if ((xx + Math.floor(y / 7)) % 5 === 0) idx = Math.min(3, idx + 1);
          p.set(xx, y, fall[idx]);
        }
      }
      for (let k = -w; k < w; k += 2) {
        const len = 3 + Math.floor(rng() * 8);
        for (let r = 0; r < len; r++) p.set(fx + k, ty + 2 + r, fall[r === len - 1 ? 3 : 2]);
      }
    }
    atmos(p, horizon, 0.34, hex('#4a7894'), 100, 170, 0.8);
    layers.push(mkLayer(p, 0.16, 34));
  }
  // L2: ice spires
  {
    const p = new Px(LW, 210);
    const rng = mulberry32(101);
    const lit = H('#5a8ac0', '#76a6d6', '#a6d0f0');
    const dark = H('#1e3462', '#28427a', '#34548e');
    const ridgeC = hex('#cfeeff');
    const spires: { x: number; h: number; w: number; lean: number }[] = [];
    for (let k = 0; k < 9; k++) spires.push({ x: k * (LW / 9) + rng() * 30, h: 60 + rng() * 120, w: 22 + rng() * 22, lean: (rng() - 0.5) * 14 });
    spires.sort((a, b) => a.h - b.h);
    for (const s of spires) wrapDraw((off) => {
      const base = 200, tipX = s.x + s.lean + off, tipY = base - s.h;
      if (tipX + s.w < 0 || tipX - s.w > LW) return;
      for (let y = Math.floor(tipY); y < base + 4; y++) {
        const t = (y - tipY) / s.h;
        const cx = tipX + (s.x + off - tipX) * t;
        const hw = (s.w / 2) * Math.pow(Math.max(0, t), 0.85);
        for (let x = Math.max(0, Math.floor(cx - hw)); x <= Math.min(LW - 1, Math.ceil(cx + hw)); x++) {
          const u = (x - (cx - hw)) / (2 * hw + 0.001);
          const ridge = 0.42 + Math.sin(y * 0.08 + s.x) * 0.05;
          let c: Color;
          if (u < ridge) c = lit[u < 0.1 ? 2 : (Math.floor((x - y * 0.6 + s.x) / 5) & 1) ? 1 : 0];
          else c = dark[Math.abs(u - ridge) < 0.07 ? 2 : (Math.floor((x + y * 0.6) / 6) & 1) ? 1 : 0];
          if (Math.abs(u - ridge) < 0.04 && t > 0.03) c = ridgeC;
          p.data[y * LW + x] = c;
        }
      }
    });
    const hill = col1(fbm1(103, LW, 48, 3));
    const s0 = hex('#c6dcf0'), s1 = hex('#8eaed4'), s2 = hex('#5c7eaa');
    for (let x = 0; x < LW; x++) {
      const ty = Math.floor(186 + (hill[x] - 0.5) * 20);
      for (let y = ty; y < p.h; y++) p.data[y * LW + x] = y === ty ? s0 : y < ty + 3 ? s1 : s2;
    }
    atmos(p, horizon, 0.2, hex('#3a6688'), 150, 210, 0.7);
    layers.push(mkLayer(p, 0.36, 16));
  }
  // L3: near dark crags with snow and dead frozen pines
  {
    const p = new Px(LW, 130);
    const ridge = col1(fbm1(111, LW, 40, 4));
    const top = new Float32Array(LW);
    for (let x = 0; x < LW; x++) top[x] = 70 + (ridge[x] - 0.5) * 70;
    const rng = mulberry32(112);
    const tr0 = hex('#0c1224'), tr1 = hex('#141c32'), br = hex('#10182c'), frost = hex('#5e7aa4');
    for (let k = 0; k < 9; k++) {
      const x = Math.floor(rng() * LW), h = 26 + rng() * 34;
      const base = top[x] + 4;
      for (let y = Math.floor(base - h); y < base; y++) { p.set(x, y, tr0); p.set(x + 1, y, tr1); }
      for (let bI = 0; bI < 6; bI++) {
        const by = base - h + 4 + bI * (h / 7), len = 3 + (6 - bI) * 1.2;
        const dir = bI & 1 ? 1 : -1;
        for (let s = 0; s < len; s++) p.set(x + dir * s + (dir > 0 ? 1 : 0), Math.round(by + s * 0.4), br);
        p.set(x + dir * Math.floor(len / 2), Math.round(by + len * 0.2) - 1, frost);
      }
    }
    const c0 = hex('#121a2e'), cS = hex('#8aa4c8'), cL = hex('#5a78a2'), cE = hex('#26324c'), cT = hex('#18223a');
    for (let x = 0; x < LW; x++) {
      const ty = Math.floor(top[x]);
      const rising = top[(x + 1) & M] < top[x];
      for (let y = ty; y < p.h; y++) {
        const d = y - ty;
        let c = c0;
        if (d < 2) c = cS;
        else if (d < 4 && rising) c = cL;
        else if (d < 5) c = cE;
        else if (((x * 3 + y * 2) >> 4) % 5 === 0) c = cT;
        p.data[y * LW + x] = c;
      }
    }
    atmos(p, horizon, 0.04, hex('#203a52'), 100, 130, 0.6);
    layers.push(mkLayer(p, 0.6, 0));
  }
  return { sky, layers, backWall: backWall('niflheim'), ambient: [0.8, 0.88, 1.0], atmosphere: 'snow' };
}

// ---------------------------------------------------------------- Muspelheim

function muspelheim(): BackgroundSet {
  const sky = ['#070304', '#140507', '#280a0a', '#44100c', '#6a1a0e', '#963012', '#c4521a'];
  const horizon = hex('#b4481a');
  const layers: BgLayer[] = [];
  const lava = H('#7a1a0a', '#c4380e', '#ff6a1a', '#ffa836', '#ffe07a', '#fff6c8');

  // L0: distant volcanoes with lava rivulets and billowing smoke lit from below
  {
    const H0 = 230;
    const p = new Px(LW, H0);
    const smoke = new Sculpt(LW, 112);
    const vols = [{ x: 120, top: 76, w: 0.9, cw: 10 }, { x: 370, top: 104, w: 1.1, cw: 8 }];
    const rng = mulberry32(121);
    for (const v of vols) {
      let cx = v.x, cy = v.top - 4, r = 6;
      for (let k = 0; k < 20; k++) {
        const puffs = 2 + Math.floor(rng() * 2);
        for (let j = 0; j < puffs; j++) {
          const ox = (rng() - 0.5) * r * 1.4, oy = (rng() - 0.5) * r * 0.8, rr = r * (0.6 + rng() * 0.5);
          wrapDraw((off) => smoke.ell(cx + ox + off, cy + oy, rr, rr * 0.85, rng() * 4, rr * 0.9, 0));
        }
        cy -= r * 0.55; cx += 2 + k * 0.7 + Math.sin(k * 0.8) * 2; r += 0.9;
        if (cy < -20) break;
        void H0;
      }
    }
    const sp = smoke.render([{ ramp: H('#1a0a0e', '#24100f', '#311614', '#441c16', '#5e2618', '#88381c'), amb: 0.05, dif: 0.55, under: 1.6, noOutline: true }], { light: [-0.4, -0.5, 0.6], outline: false, occGap: 1.5 });
    sp.map((c, _x, y) => rgba(rOf(c), gOf(c), bOf(c), y < 40 ? 90 + y * 4 : 255));
    p.blit(sp, 0, 0, false, true);
    const jag = col1(fbm1(123, LW, 16, 3));
    const cL = hex('#4a2024'), cLD = hex('#3a181c'), cS = hex('#2e1416'), cSD = hex('#24100f');
    for (let x = 0; x < LW; x++) {
      let best = 1e9, bv = vols[0], bdx = 0;
      for (const v of vols) for (let off = -LW; off <= LW; off += LW) {
        const dx = x - (v.x + off);
        const a = Math.abs(dx);
        const y = a < v.cw ? v.top + (a > v.cw - 3 ? 0 : 2) : v.top + Math.pow(a - v.cw, 1.18) * 0.62 * v.w + (jag[x] - 0.5) * 6;
        if (y < best) { best = y; bv = v; bdx = dx; }
      }
      for (let y = Math.floor(best); y < H0; y++) {
        const lit = bdx < (y - bv.top) * 0.15;
        const g = (Math.floor((bdx * 0.8 + (lit ? 1 : -1) * (y - bv.top) * 0.6) / 4) & 3) === 0;
        let c = lit ? (g ? cLD : cL) : (g ? cSD : cS);
        if (Math.abs(bdx) < bv.cw && y - best < 3) c = y - best < 1 ? lava[4] : lava[2];
        p.data[y * LW + x] = c;
      }
    }
    // a few lava rivulets: thick near the crater, breaking into crusted dribbles
    for (const v of vols) for (let k = 0; k < 3; k++) {
      let x = v.x + (k - 1) * v.cw * 0.7, y = v.top + 2;
      let dir = k === 1 ? (rng() < 0.5 ? -1 : 1) : k === 0 ? -1 : 1;
      const len = 40 + rng() * 70;
      for (let s = 0; s < len && y < H0; s++) {
        const xx = Math.round(x) & M, yy = Math.round(y);
        const crust = s > 15 && Math.sin(s * 0.5 + k) > 0.7;
        if (aOf(p.get(xx, yy)) > 0) {
          p.set(xx, yy, crust ? lava[0] : s < 12 ? lava[4] : lava[3]);
          if (s < len * 0.6) p.set((xx + dir) & M, yy, crust ? lava[0] : lava[1]);
        }
        y += 1; x += dir * (0.45 + rng() * 0.5);
        if (rng() < 0.06) dir = -dir;
      }
    }
    atmos(p, horizon, 0.14, horizon, 120, 230, 0.85);
    layers.push(mkLayer(p, 0.05, 36));
  }
  // L1: basalt cliffs with lava falls and a glowing lava lake
  {
    const p = new Px(LW, 180);
    const jag = col1(fbm1(131, LW, 64, 4)), fine = col1(fbm1(132, LW, 8, 2));
    const top = new Float32Array(LW);
    for (let x = 0; x < LW; x++) top[x] = 64 + (jag[x] - 0.5) * 110 + (fine[x] - 0.5) * 10 + ((x >> 3) & 1 ? 2 : 0);
    const col = H('#100a0e', '#150c11', '#1b1015', '#28161c');
    const glowC = hex('#7a2410');
    const falls = [60, 205, 330, 455];
    const fallGlow = new Float32Array(LW);
    for (let x = 0; x < LW; x++) {
      let g = 0;
      for (const fx of falls) for (let off = -LW; off <= LW; off += LW) g = Math.max(g, 1 - Math.abs(x - fx - off) / 18);
      fallGlow[x] = g;
    }
    for (let x = 0; x < LW; x++) {
      const ty = Math.floor(top[x]);
      const colId = Math.floor((x + Math.sin(x * 0.05) * 4) / 7);
      for (let y = Math.max(0, ty); y < p.h; y++) {
        let c = col[(colId & 1) + (((x + Math.floor(y / 9) * 3) % 7) === 0 ? 0 : 1)];
        if ((x + colId * 2) % 7 === 0) c = col[0];
        if (y - ty < 2) c = col[3];
        const g = Math.max(fallGlow[x], smooth(p.h - 40, p.h - 4, y));
        if (g > 0) c = dmix(c, glowC, g * 0.8, x, y, 4);
        p.data[y * LW + x] = c;
      }
    }
    for (const fx of falls) {
      const ty = Math.floor(top[fx]);
      const w = 5 + (fx % 3);
      for (let y = ty - 1; y < p.h; y++) {
        const sway = Math.round(Math.sin(y * 0.12 + fx) * 1.2);
        const ww = w + (y > p.h - 16 ? Math.floor((y - p.h + 16) * 0.7) : 0);
        for (let k = 0; k < ww; k++) {
          const u = k / (ww - 1);
          const flow = ((y + k * 3 + fx) % 9) < 2;
          const idx = u < 0.15 || u > 0.85 ? 1 : u < 0.3 || u > 0.7 ? 3 : flow ? 5 : 4;
          p.set(fx - Math.floor(ww / 2) + k + sway, y, lava[idx]);
        }
      }
    }
    for (let x = 0; x < LW; x++) for (let y = p.h - 9; y < p.h; y++) {
      const crust = ((x * 7 + y * 13) % 23 < 4) || (Math.sin(x * 0.3 + y) > 0.85);
      p.data[y * LW + x] = y === p.h - 9 ? lava[4] : crust ? lava[1] : lava[(x + y) % 5 === 0 ? 4 : 3];
    }
    atmos(p, hex('#4a140e'), 0.22, hex('#6a200e'), 110, 170, 0.5);
    layers.push(mkLayer(p, 0.2, 22));
  }
  // L2: obsidian spires with glassy edges and glowing cracks
  {
    const p = new Px(LW, 210);
    const rng = mulberry32(141);
    const ob = H('#0c0812', '#150e1c', '#1e1628', '#2a1e3a');
    const edgeLit = hex('#6a4a8e'), edgeHot = hex('#a8441c');
    const sp: { x: number; h: number; w: number; lean: number; kinks: number }[] = [];
    for (let k = 0; k < 8; k++) sp.push({ x: k * (LW / 8) + rng() * 30, h: 70 + rng() * 120, w: 20 + rng() * 24, lean: (rng() - 0.5) * 20, kinks: rng() });
    sp.sort((a, b) => a.h - b.h);
    for (const s of sp) wrapDraw((off) => {
      const base = 205, tipX = s.x + s.lean + off, tipY = base - s.h;
      if (tipX + s.w < 0 || tipX - s.w > LW) return;
      for (let y = Math.floor(tipY); y < base + 6; y++) {
        const t = clamp01((y - tipY) / s.h);
        const kink = Math.sin(t * 9 + s.kinks * 6) * 2 * t;
        const cx = tipX + (s.x + off - tipX) * t + kink;
        const hw = (s.w / 2) * Math.pow(t, 0.8) + (Math.floor(t * 6) % 2) * 1.5 * t;
        const xa = Math.floor(cx - hw), xb = Math.ceil(cx + hw);
        for (let x = Math.max(0, xa); x <= Math.min(LW - 1, xb); x++) {
          const u = (x - (cx - hw)) / (2 * hw + 0.001);
          const facet = Math.floor(u * 3 + y * 0.03 + s.kinks);
          let c = ob[u < 0.4 ? 3 - (facet & 1) : (facet & 1)];
          if (x === xa) c = edgeLit;
          else if (x === xb && t > 0.5) c = edgeHot;
          p.data[y * LW + x] = c;
        }
      }
      let cx = s.x + off + s.lean * 0.4, cy = base - s.h * 0.55;
      for (let k = 0; k < s.h * 0.4; k++) {
        p.set(Math.round(cx), Math.round(cy), k % 5 === 0 ? lava[4] : lava[2]);
        cy += 1; cx += Math.sin(k * 0.9 + s.x) * 0.8;
      }
    });
    const hill = col1(fbm1(143, LW, 40, 3));
    const g0 = hex('#3a2430');
    for (let x = 0; x < LW; x++) {
      const ty = Math.floor(192 + (hill[x] - 0.5) * 16);
      for (let y = ty; y < p.h; y++) p.data[y * LW + x] = y === ty ? g0 : ((x + y) % 11 === 0 ? lava[1] : ob[1]);
    }
    atmos(p, horizon, 0.12, hex('#5a1a10'), 160, 210, 0.7);
    layers.push(mkLayer(p, 0.4, 10));
  }
  // L3: near basalt crags, embers glowing at their feet
  {
    const p = new Px(LW, 120);
    const ridge = col1(fbm1(151, LW, 30, 4));
    const c0 = hex('#120a0e'), cR = hex('#3a2228'), cE = hex('#24161a'), cT = hex('#180e12'), glow = hex('#6a1e0e');
    for (let x = 0; x < LW; x++) {
      const ty = Math.floor(64 + (ridge[x] - 0.5) * 70);
      const rising = 64 + (ridge[(x + 1) & M] - 0.5) * 70 < ty;
      for (let y = ty; y < p.h; y++) {
        const d = y - ty;
        let c = c0;
        if (d < 2 && rising) c = cR;
        else if (d < 2) c = cE;
        else if ((Math.floor((x + y * 0.5) / 5) % 6) === 0) c = cT;
        if (y > 80) c = dmix(c, glow, smooth(80, 120, y) * 0.9, x, y, 4);
        p.data[y * LW + x] = c;
      }
    }
    const rng = mulberry32(152);
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(rng() * LW), y = 96 + Math.floor(rng() * 24);
      if (aOf(p.get(x, y)) > 0) p.set(x, y, lava[rng() < 0.3 ? 4 : 2]);
    }
    layers.push(mkLayer(p, 0.65, 0));
  }
  return { sky, layers, backWall: backWall('muspelheim'), ambient: [1.0, 0.84, 0.74], atmosphere: 'embers' };
}

/** Build the parallax background set for a realm. */
export function buildBackground(realm: RealmId): BackgroundSet {
  if (realm === 'midgard') return midgard();
  if (realm === 'niflheim') return niflheim();
  return muspelheim();
}
