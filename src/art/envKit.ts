// Helpers for the environment / boss / title art: tileable Voronoi cells, height-field slope
// lighting, cluster cleanup (despeckle), wrapped stamping, and a tiny "sculpt" renderer that
// rasterises shaded 3D-ish primitives (ellipsoids, tapered capsules, bevelled polygons) into a
// z-buffer, lights them from the top-left, posterises into hand-tuned ramps and applies
// selective outlines. Extra helpers live here so the shared px.ts stays untouched.

import { Px, type Color, rgba, rOf, gOf, bOf, aOf, mix, toHsl, fromHsl, hash2, hex } from './px';

const HEXM = new Map<string, Color>();
/** memoised hex() for use inside loops */
export function hx(s: string, a?: number): Color {
  const k = a === undefined ? s : s + '/' + a;
  let c = HEXM.get(k);
  if (c === undefined) { c = hex(s, a); HEXM.set(k, c); }
  return c;
}

/**
 * Allocation-free tileable fBm (same role as px.ts fbm): lattice values are precomputed per
 * octave, so sampling is a few table reads + smoothstep blends.
 */
export function fbmT(seed: number, size: number, cell: number, octaves = 4): (x: number, y: number) => number {
  const tabs: Float32Array[] = [], pers: number[] = [], cells: number[] = [];
  for (let o = 0; o < octaves; o++) {
    const c = cell / 2 ** o;
    const per = Math.max(1, Math.round(size / c));
    const t = new Float32Array(per * per);
    for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) t[j * per + i] = hash2(i, j, seed + o * 101);
    tabs.push(t); pers.push(per); cells.push(c);
  }
  let norm = 0;
  for (let o = 0, a = 1; o < octaves; o++, a *= 0.5) norm += a;
  return (x: number, y: number) => {
    let sum = 0, amp = 1;
    for (let o = 0; o < octaves; o++) {
      const per = pers[o], t = tabs[o];
      const fx = x / cells[o], fy = y / cells[o];
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const ax = fx - x0, ay = fy - y0;
      const i0 = ((x0 % per) + per) % per, j0 = ((y0 % per) + per) % per;
      const i1 = i0 + 1 === per ? 0 : i0 + 1, j1 = j0 + 1 === per ? 0 : j0 + 1;
      const sx = ax * ax * (3 - 2 * ax), sy = ay * ay * (3 - 2 * ay);
      const a = t[j0 * per + i0], b = t[j0 * per + i1], c = t[j1 * per + i0], d = t[j1 * per + i1];
      sum += ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy) * amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

const SIN_N = 1024;
const SIN_T = new Float32Array(SIN_N);
for (let i = 0; i < SIN_N; i++) SIN_T[i] = Math.sin((i / SIN_N) * Math.PI * 2);
/** table sine (≈3e-3 accuracy) for per-pixel texture patterns */
export function fsin(x: number): number {
  return SIN_T[(Math.round(x * (SIN_N / (Math.PI * 2))) % SIN_N + SIN_N) % SIN_N];
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function smooth(e0: number, e1: number, x: number) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
export const wrapi = (v: number, n: number) => ((v % n) + n) % n;

/** Ramp lookup by t∈[0,1] (no dither): clean posterised bands. */
export function pick(ramp: Color[], t: number): Color {
  const n = ramp.length;
  return ramp[Math.max(0, Math.min(n - 1, Math.floor(clamp01(t) * n * 0.9999)))];
}
export function at(ramp: Color[], i: number): Color {
  return ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(i)))];
}

/** HSL adjust */
export function adj(c: Color, dl: number, ds = 0, dh = 0): Color {
  const [h, s, l] = toHsl(c);
  return fromHsl(h + dh, s + ds, l + dl, aOf(c));
}
export function mul(c: Color, f: number): Color {
  return rgba(Math.min(255, rOf(c) * f), Math.min(255, gOf(c) * f), Math.min(255, bOf(c) * f), aOf(c));
}
export function addc(c: Color, d: Color, t = 1): Color {
  return rgba(
    Math.min(255, rOf(c) + rOf(d) * t),
    Math.min(255, gOf(c) + gOf(d) * t),
    Math.min(255, bOf(c) + bOf(d) * t),
    aOf(c),
  );
}
export function lum(c: Color) {
  return (rOf(c) * 0.299 + gOf(c) * 0.587 + bOf(c) * 0.114) / 255;
}

// ---------------------------------------------------------------- Voronoi cells (tileable)

export interface Cells {
  w: number;
  h: number;
  /** nearest feature id */
  id: Int32Array;
  /** second-nearest feature id */
  id2: Int32Array;
  /** distance to the cell border in px */
  edge: Float32Array;
  /** distance to the feature point */
  f1: Float32Array;
  /** direction from own feature toward the neighbour across the nearest border (unit) */
  bx: Float32Array;
  by: Float32Array;
  /** per-feature random in [0,1) */
  rnd: Float32Array;
  /** feature positions */
  px: Float32Array;
  py: Float32Array;
}

/**
 * Tileable Voronoi over a w×h texture with gx×gy jittered features. sx/sy scale distances
 * (sy > 1 makes cells wider than tall).
 */
export function cells(w: number, h: number, gx: number, gy: number, seed: number, jitter = 0.8, sx = 1, sy = 1): Cells {
  const n = gx * gy;
  const fpx = new Float32Array(n), fpy = new Float32Array(n), rnd = new Float32Array(n);
  const cw = w / gx, ch = h / gy;
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    const k = j * gx + i;
    fpx[k] = (i + 0.5 + (hash2(i, j, seed) - 0.5) * jitter) * cw;
    fpy[k] = (j + 0.5 + (hash2(i, j, seed + 7) - 0.5) * jitter) * ch;
    rnd[k] = hash2(i, j, seed + 13);
  }
  const id = new Int32Array(w * h), id2 = new Int32Array(w * h);
  const edge = new Float32Array(w * h), f1a = new Float32Array(w * h);
  const bx = new Float32Array(w * h), by = new Float32Array(w * h);
  const R = jitter > 1 ? 2 : 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = x + 0.5, cy = y + 0.5;
    const gi = Math.floor(cx / cw), gj = Math.floor(cy / ch);
    let d1 = 1e9, d2 = 1e9, k1 = 0, k2 = 0, p1x = 0, p1y = 0, p2x = 0, p2y = 0;
    for (let oj = -R; oj <= R; oj++) {
      const cj = gj + oj;
      const wj = cj < 0 ? cj + gy : cj >= gy ? cj - gy : cj;
      const offY = (cj - wj) * ch;
      for (let oi = -R; oi <= R; oi++) {
        const ci = gi + oi;
        const wi = ci < 0 ? ci + gx : ci >= gx ? ci - gx : ci;
        const k = wj * gx + wi;
        const qx = fpx[k] + (ci - wi) * cw, qy = fpy[k] + offY;
        const dx = (cx - qx) * sx, dy = (cy - qy) * sy;
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; k2 = k1; p2x = p1x; p2y = p1y; d1 = d; k1 = k; p1x = qx; p1y = qy; }
        else if (d < d2) { d2 = d; k2 = k; p2x = qx; p2y = qy; }
      }
    }
    const i = y * w + x;
    id[i] = k1; id2[i] = k2;
    const ddx = (p2x - p1x) * sx, ddy = (p2y - p1y) * sy;
    const dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    edge[i] = (d2 - d1) / (2 * dl);
    f1a[i] = Math.sqrt(d1);
    bx[i] = ddx / dl; by[i] = ddy / dl;
  }
  return { w, h, id, id2, edge, f1: f1a, bx, by, rnd, px: fpx, py: fpy };
}

// ---------------------------------------------------------------- height fields

const LX = -0.62, LY = -0.62, LZ = 0.48; // top-left light, normalised below
const LN = Math.hypot(LX, LY, LZ);

/** n·L − L.z for a height field (positive = facing the top-left light). */
export function slope(hf: Float32Array, w: number, h: number, x: number, y: number, k = 1, wrap = true): number {
  let xm = x - 1, xp = x + 1, ym = y - 1, yp = y + 1;
  if (wrap) {
    if (xm < 0) xm += w; if (xp >= w) xp -= w; if (ym < 0) ym += h; if (yp >= h) yp -= h;
  } else {
    if (xm < 0) xm = 0; if (xp >= w) xp = w - 1; if (ym < 0) ym = 0; if (yp >= h) yp = h - 1;
  }
  const gx = (hf[y * w + xp] - hf[y * w + xm]) * 0.5 * k;
  const gy = (hf[yp * w + x] - hf[ym * w + x]) * 0.5 * k;
  const nl = Math.sqrt(gx * gx + gy * gy + 1);
  const ndl = (gx * -LX + gy * -LY + LZ) / (nl * LN); // n = (-gx,-gy,1)/nl
  return ndl - LZ / LN;
}

// ---------------------------------------------------------------- cleanup

/**
 * Remove isolated pixels (fewer than `minSame` equal 4-neighbours) by replacing them with the
 * most common neighbour colour. Turns noisy speckle into clusters.
 */
function gsrc(src: Uint32Array, w: number, h: number, x: number, y: number) {
  return x < 0 || y < 0 || x >= w || y >= h ? 0 : src[y * w + x];
}

export function despeckle(p: Px, wrap = true, minSame = 1, passes = 1) {
  const { w, h } = p;
  const nb = new Uint32Array(8);
  for (let pass = 0; pass < passes; pass++) {
    const src = p.data.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = src[y * w + x];
      if (aOf(c) === 0) continue;
      let xm = x - 1, xp = x + 1, ym = y - 1, yp = y + 1;
      if (wrap) { if (xm < 0) xm += w; if (xp >= w) xp -= w; if (ym < 0) ym += h; if (yp >= h) yp -= h; }
      nb[0] = gsrc(src, w, h, xm, y); nb[1] = gsrc(src, w, h, xp, y); nb[2] = gsrc(src, w, h, x, ym); nb[3] = gsrc(src, w, h, x, yp);
      let same = 0;
      for (let k = 0; k < 4; k++) if (nb[k] === c) same++;
      if (same >= minSame) continue;
      nb[4] = gsrc(src, w, h, xm, ym); nb[5] = gsrc(src, w, h, xp, ym); nb[6] = gsrc(src, w, h, xm, yp); nb[7] = gsrc(src, w, h, xp, yp);
      let best = c, bestN = 0;
      for (let a = 0; a < 8; a++) {
        const v = nb[a];
        if (aOf(v) === 0) continue;
        let k = 0;
        for (let b = 0; b < 8; b++) if (nb[b] === v) k++;
        if (k > bestN) { bestN = k; best = v; }
      }
      p.data[y * w + x] = best;
    }
  }
}

/** Stamp a shape with a per-pixel function in normalised ellipse coordinates. */
export function stamp(
  p: Px, cx: number, cy: number, rx: number, ry: number,
  fn: (u: number, v: number, x: number, y: number) => Color | 0,
  wrap = true,
) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const u = (x - cx) / (rx + 0.5), v = (y - cy) / (ry + 0.5);
      if (u * u + v * v > 1) continue;
      const c = fn(u, v, x, y);
      if (!c) continue;
      if (wrap) p.setWrap(x, y, c); else p.set(x, y, c);
    }
  }
}

/** Small shaded pebble/stone: top-left lit, bottom-right rim dark. */
export function pebble(p: Px, cx: number, cy: number, rx: number, ry: number, rmp: Color[], wrap = true, rimDark?: Color) {
  const n = rmp.length;
  stamp(p, cx, cy, rx, ry, (u, v) => {
    const r2 = u * u + v * v;
    if (r2 > 0.62 && u + v > 0.35) return rimDark ?? rmp[0];
    const l = 0.55 - (u + v) * 0.42 + (1 - r2) * 0.18;
    return rmp[Math.max(1, Math.min(n - 1, Math.floor(l * (n - 1) + 0.5)))];
  }, wrap);
}

/** wrapped thick line by stamping discs */
export function thickLine(p: Px, x0: number, y0: number, x1: number, y1: number, r: number, c: Color, wrap = true) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = lerp(x0, x1, t), y = lerp(y0, y1, t);
    if (r <= 0.5) { if (wrap) p.setWrap(Math.round(x), Math.round(y), c); else p.set(Math.round(x), Math.round(y), c); }
    else stamp(p, Math.round(x), Math.round(y), r - 0.5, r - 0.5, () => c, wrap);
  }
}

/** Mix every opaque pixel toward a pale flash colour (boss hurt frames). */
export function flash(p: Px, tint: Color, t = 0.62): Px {
  const q = p.clone();
  q.map((c) => {
    const l = lum(c);
    const m = mix(c, tint, t * (0.55 + l * 0.6));
    return withA(m, aOf(c));
  });
  return q;
}
function withA(c: Color, a: number): Color { return rgba(rOf(c), gOf(c), bOf(c), a); }

/** Soft glow: additive radial falloff with ordered dithering into transparent pixels. */
export function glow(p: Px, cx: number, cy: number, r: number, c: Color, strength = 1, onlyEmpty = false) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    if (!p.inside(x, y)) continue;
    const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / r;
    if (d >= 1) continue;
    const a = (1 - d) * (1 - d) * strength;
    const cur = p.get(x, y);
    if (onlyEmpty && aOf(cur) > 0) continue;
    if (aOf(cur) === 0) {
      // banded alpha for a posterised glow
      const band = Math.floor(a * 4 + bayer4(x, y) * 0.999) / 4;
      if (band <= 0) continue;
      p.set(x, y, withA(c, Math.min(255, Math.round(band * 200))));
    } else {
      p.set(x, y, addc(cur, c, a * 0.6));
    }
  }
}
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer4(x: number, y: number) { return (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }

// ---------------------------------------------------------------- sculpt renderer

export interface PartStyle {
  ramp: Color[];
  /** ambient term (default 0.16) */
  amb?: number;
  /** diffuse strength (default 0.95) */
  dif?: number;
  /** unlit: always this ramp position t∈[0,1] */
  flat?: number;
  /** outline colour; default = darkened ramp[0] */
  outline?: Color;
  /** suppress the outer outline next to this part */
  noOutline?: boolean;
  /** additional light from below (0..1), for lava / glow rims */
  under?: number;
  /** strength of the occlusion line this part receives (ramp steps, default 2) */
  occ?: number;
}

export interface SculptRenderOpts {
  light?: [number, number, number];
  /** z gap that counts as an occluding edge (default 3) */
  occGap?: number;
  outline?: boolean;
  /** per-pixel ramp index offset (texture: scales, fur strands …) */
  mod?: (x: number, y: number, part: number, idx: number, nx: number, ny: number, nz: number) => number;
}

export class Sculpt {
  readonly w: number;
  readonly h: number;
  readonly z: Float32Array;
  readonly nx: Float32Array;
  readonly ny: Float32Array;
  readonly nz: Float32Array;
  readonly part: Int16Array;

  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.z = new Float32Array(w * h).fill(-1e9);
    this.nx = new Float32Array(w * h);
    this.ny = new Float32Array(w * h);
    this.nz = new Float32Array(w * h);
    this.part = new Int16Array(w * h).fill(-1);
  }

  private put(x: number, y: number, z: number, nx: number, ny: number, nz: number, part: number, force = false) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (!force && z <= this.z[i]) return;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    this.z[i] = z; this.nx[i] = nx / l; this.ny[i] = ny / l; this.nz[i] = nz / l; this.part[i] = part;
  }

  /** ellipsoid; d = depth of the bulge, rot in radians */
  ell(cx: number, cy: number, rx: number, ry: number, z: number, d: number, part: number, rot = 0, force = false) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const R = Math.max(rx, ry) + 1;
    const ex = rx + 0.5, ey = ry + 0.5;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const px = x - cx, py = y - cy;
      const lx = px * c + py * s, ly = -px * s + py * c;
      const u = lx / ex, v = ly / ey;
      const r2 = u * u + v * v;
      if (r2 > 1) continue;
      const hz = Math.sqrt(1 - r2);
      const gnx = u / ex, gny = v / ey, gnz = hz / Math.max(0.5, d);
      this.put(x, y, z + d * hz, gnx * c - gny * s, gnx * s + gny * c, gnz, part, force);
    }
  }

  /** tapered capsule from (x0,y0,r0) to (x1,y1,r1) */
  cap(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, z0: number, z1: number, part: number, flat = 1) {
    const vx = x1 - x0, vy = y1 - y0;
    const L2 = vx * vx + vy * vy || 1;
    const R = Math.max(r0, r1) + 1;
    for (let y = Math.floor(Math.min(y0, y1) - R); y <= Math.ceil(Math.max(y0, y1) + R); y++) {
      for (let x = Math.floor(Math.min(x0, x1) - R); x <= Math.ceil(Math.max(x0, x1) + R); x++) {
        const t = clamp01(((x - x0) * vx + (y - y0) * vy) / L2);
        const ax = x0 + vx * t, ay = y0 + vy * t;
        const r = r0 + (r1 - r0) * t + 0.5;
        const dx = x - ax, dy = y - ay;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) continue;
        const q = d / r;
        const hz = Math.sqrt(1 - q * q);
        this.put(x, y, lerp(z0, z1, t) + r * hz * flat, dx / r, dy / r, hz * (2 - flat), part);
      }
    }
  }

  /** polygon with bevelled edges (bevel px), slight dome */
  poly(pts: [number, number][], z: number, part: number, bevel = 2, dome = 0, force = false) {
    const n = pts.length;
    const X = new Float64Array(n), Y = new Float64Array(n);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let k = 0; k < n; k++) {
      X[k] = pts[k][0]; Y[k] = pts[k][1];
      minX = Math.min(minX, X[k]); maxX = Math.max(maxX, X[k]); minY = Math.min(minY, Y[k]); maxY = Math.max(maxY, Y[k]);
    }
    const cxp = (minX + maxX) / 2, cyp = (minY + maxY) / 2, rr = Math.max(1, (maxX - minX) / 2, (maxY - minY) / 2);
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const px = x + 0.5, py = y + 0.5;
      let inside = false, best = 1e9, bnx = 0, bny = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = X[i], yi = Y[i], xj = X[j], yj = Y[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        const ex = xi - xj, ey = yi - yj;
        const el2 = ex * ex + ey * ey || 1;
        let t = ((px - xj) * ex + (py - yj) * ey) / el2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = xj + ex * t - px, qy = yj + ey * t - py;
        const d = qx * qx + qy * qy;
        if (d < best) { best = d; bnx = qx; bny = qy; }
      }
      if (!inside) continue;
      best = Math.sqrt(best);
      const bl = best || 1;
      const tilt = bevel > 0 ? clamp01(1 - best / bevel) : 0;
      const dx = (px - cxp) / rr, dy = (py - cyp) / rr;
      const nx = (bnx / bl) * tilt * 1.2 + dx * dome;
      const ny = (bny / bl) * tilt * 1.2 + dy * dome;
      this.put(x, y, z + Math.min(best, bevel) - dome * (dx * dx + dy * dy) * rr * 0.3, nx, ny, 1 - tilt * 0.4, part, force);
    }
  }

  /** remove pixels matching a predicate */
  carve(fn: (x: number, y: number) => boolean) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (fn(x, y)) {
      const i = y * this.w + x;
      this.part[i] = -1; this.z[i] = -1e9;
    }
  }

  render(styles: PartStyle[], opts: SculptRenderOpts = {}): Px {
    const { w, h } = this;
    const L = opts.light ?? [-0.6, -0.72, 0.62];
    const ll = Math.hypot(L[0], L[1], L[2]);
    const lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;
    const occGap = opts.occGap ?? 3;
    const out = new Px(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const pt = this.part[i];
      if (pt < 0) continue;
      const st = styles[pt];
      const n = st.ramp.length;
      let t: number;
      if (st.flat !== undefined) t = st.flat;
      else {
        const nd = this.nx[i] * lx + this.ny[i] * ly + this.nz[i] * lz;
        t = (st.amb ?? 0.16) + (st.dif ?? 0.95) * Math.max(0, nd);
        if (st.under) t += st.under * Math.max(0, this.ny[i]) * 0.6;
      }
      let idx = Math.floor(clamp01(t) * n * 0.9999);
      // occlusion: a neighbour much closer to the viewer casts a dark line on this pixel
      if (st.flat === undefined) {
        const zz = this.z[i] + occGap;
        const P = this.part;
        if ((x > 0 && P[i - 1] >= 0 && P[i - 1] !== pt && this.z[i - 1] > zz) ||
            (x < w - 1 && P[i + 1] >= 0 && P[i + 1] !== pt && this.z[i + 1] > zz) ||
            (y > 0 && P[i - w] >= 0 && P[i - w] !== pt && this.z[i - w] > zz) ||
            (y < h - 1 && P[i + w] >= 0 && P[i + w] !== pt && this.z[i + w] > zz)) idx -= st.occ ?? 2;
      }
      if (opts.mod) idx += opts.mod(x, y, pt, idx, this.nx[i], this.ny[i], this.nz[i]);
      idx = Math.max(0, Math.min(n - 1, idx));
      out.data[i] = st.ramp[idx];
    }
    if (opts.outline !== false) {
      const P = this.part;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (P[i] >= 0) continue;
        // pick an opaque neighbour; prefer the one the outline belongs to
        let nbI = -1, lit = false;
        if (x < w - 1 && P[i + 1] >= 0) { nbI = i + 1; lit = true; }
        else if (y < h - 1 && P[i + w] >= 0) { nbI = i + w; lit = true; }
        else if (x > 0 && P[i - 1] >= 0) nbI = i - 1;
        else if (y > 0 && P[i - w] >= 0) nbI = i - w;
        if (nbI < 0) continue;
        const st = styles[P[nbI]];
        if (!st || st.noOutline) continue;
        const base = st.outline ?? darkSat(st.ramp[0]);
        out.data[i] = lit ? mix(base, st.ramp[Math.min(1, st.ramp.length - 1)], 0.45) : base;
      }
    }
    return out;
  }
}

/** dark, saturated outline version of a colour */
export function darkSat(c: Color, dl = -0.08, ds = 0.15): Color {
  return adj(c, dl, ds, 8);
}

/** Px → canvas without the extra ImageData copy that Px.toCanvas makes. */
export function toCv(p: Px): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = p.w;
  cv.height = p.h;
  const img = new ImageData(new Uint8ClampedArray(p.data.buffer as ArrayBuffer, p.data.byteOffset, p.w * p.h * 4), p.w, p.h);
  // static art: a CPU-backed context makes later readbacks (e.g. atlas params) and texture uploads cheap
  cv.getContext('2d', { willReadFrequently: true })!.putImageData(img, 0, 0);
  return cv;
}

/** Periodic 1D value noise with period `period` px and lattice `cell` px; smooth. */
export function noise1(seed: number, period: number, cell: number) {
  const n = Math.max(1, Math.round(period / cell));
  const c = period / n;
  return (x: number) => {
    const fx = x / c;
    const i = Math.floor(fx), f = fx - i;
    const a = hash2(wrapi(i, n), 0, seed), b = hash2(wrapi(i + 1, n), 0, seed);
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}
/** fBm of noise1 */
export function fbm1(seed: number, period: number, cell: number, oct = 4) {
  const fs = Array.from({ length: oct }, (_, i) => noise1(seed + i * 31, period, Math.max(1, cell / 2 ** i)));
  return (x: number) => {
    let s = 0, a = 1, nrm = 0;
    for (let i = 0; i < oct; i++) { s += fs[i](x) * a; nrm += a; a *= 0.5; }
    return s / nrm;
  };
}

// ---------------------------------------------------------------- gnarled tubes (roots, trunks)

export interface TubeBuf { w: number; h: number; z: Float32Array; ac: Float32Array; al: Float32Array; nx: Float32Array; ny: Float32Array; id: Int16Array }
export function tubeBuf(w: number, h: number): TubeBuf {
  return { w, h, z: new Float32Array(w * h).fill(-1e9), ac: new Float32Array(w * h), al: new Float32Array(w * h), nx: new Float32Array(w * h), ny: new Float32Array(w * h), id: new Int16Array(w * h).fill(-1) };
}
/** rasterise a polyline tube with per-vertex radius; stores across/along coordinates for bark */
export function tube(b: TubeBuf, pts: [number, number][], rad: number[], z0: number, id: number, wrap = true) {
  let along = 0;
  const offs = wrap ? [-b.w, 0, b.w] : [0];
  for (let s = 0; s + 1 < pts.length; s++) {
    const ax = pts[s][0], ay = pts[s][1], bx = pts[s + 1][0], by = pts[s + 1][1];
    const vx = bx - ax, vy = by - ay;
    const L2 = vx * vx + vy * vy || 1, L = Math.sqrt(L2);
    const px = -vy / L, py = vx / L;
    const ra = rad[s], rb = rad[s + 1];
    const R = Math.max(ra, rb) + 0.5;
    const R2 = R * R;
    const yA = Math.max(0, Math.floor(Math.min(ay, by) - R)), yB = Math.min(b.h - 1, Math.ceil(Math.max(ay, by) + R));
    if (yA > yB) { along += L; continue; }
    for (let y = yA; y <= yB; y++) {
      // x-span of the capsule hull on this scanline: end circles + the swept band
      let xl = Infinity, xr = -Infinity;
      let dy = y - ay;
      // the start disc is only needed on the first segment: every joint is covered by the previous segment's end disc
      if (s === 0 && dy * dy <= R2) { const h = Math.sqrt(R2 - dy * dy); xl = Math.min(xl, ax - h); xr = Math.max(xr, ax + h); }
      dy = y - by;
      if (dy * dy <= R2) { const h = Math.sqrt(R2 - dy * dy); xl = Math.min(xl, bx - h); xr = Math.max(xr, bx + h); }
      // band corners: A±R·n, B±R·n — intersect the scanline with the quad's edges
      const cx0 = ax + px * R, cy0 = ay + py * R, cx1 = bx + px * R, cy1 = by + py * R;
      const cx2 = bx - px * R, cy2 = by - py * R, cx3 = ax - px * R, cy3 = ay - py * R;
      const edge = (x0: number, y0: number, x1: number, y1: number) => {
        if ((y0 <= y && y1 >= y) || (y1 <= y && y0 >= y)) {
          const xx = y1 === y0 ? Math.min(x0, x1) : x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
          const xx2 = y1 === y0 ? Math.max(x0, x1) : xx;
          if (xx < xl) xl = xx;
          if (xx2 > xr) xr = xx2;
        }
      };
      edge(cx0, cy0, cx1, cy1); edge(cx1, cy1, cx2, cy2); edge(cx2, cy2, cx3, cy3); edge(cx3, cy3, cx0, cy0);
      if (xl > xr) continue;
      for (const off of offs) {
        const x0 = Math.max(0, Math.floor(xl) + off), x1 = Math.min(b.w - 1, Math.ceil(xr) + off);
        for (let x = x0; x <= x1; x++) {
          const qx = x - off - ax, qy = y - ay;
          let t = (qx * vx + qy * vy) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ddx = qx - vx * t, ddy = qy - vy * t;
          const r = ra + (rb - ra) * t + 0.5;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 > r * r) continue;
          const q2 = d2 / (r * r);
          const zz = z0 + Math.sqrt(1 - q2) * r;
          const i = y * b.w + x;
          if (zz <= b.z[i]) continue;
          b.z[i] = zz; b.id[i] = id;
          b.ac[i] = (ddx * px + ddy * py) / r;
          b.al[i] = along + t * L;
          b.nx[i] = ddx / r; b.ny[i] = ddy / r;
        }
      }
    }
    along += L;
  }
}

export function bez(t: number, a: number, b: number, c: number, d: number) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/** sample a cubic Bézier into a gnarled polyline with wobble and radius profile */
export function gnarl(p4: number[][], n: number, r0: number, r1: number, seed: number, wob = 3): { pts: [number, number][]; rad: number[] } {
  const pts: [number, number][] = [], rad: number[] = [];
  const nz = noise1(seed, 1000, 110), nr = noise1(seed + 1, 1000, 60);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let x = bez(t, p4[0][0], p4[1][0], p4[2][0], p4[3][0]);
    let y = bez(t, p4[0][1], p4[1][1], p4[2][1], p4[3][1]);
    const tx = bez(Math.min(1, t + 0.01), p4[0][0], p4[1][0], p4[2][0], p4[3][0]) - x;
    const ty = bez(Math.min(1, t + 0.01), p4[0][1], p4[1][1], p4[2][1], p4[3][1]) - y;
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    const w = (nz(t * 1000) - 0.5) * 2 * wob;
    x += (-ty / tl) * w; y += (tx / tl) * w;
    const base = r1 + (r0 - r1) * Math.pow(Math.abs(t - 0.5) * 2, 1.8);
    pts.push([x, y]);
    rad.push(Math.max(1.5, base * (0.82 + nr(t * 1000) * 0.36)));
  }
  return { pts, rad };
}

