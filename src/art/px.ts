// Shared pixel-art drawing toolkit. All procedural art is drawn into Px buffers and converted to
// canvases at the end. Colors are packed 32-bit values in ImageData byte order on little-endian
// machines (0xAABBGGRR), so a Px buffer can be copied straight into an ImageData.

export type Color = number;

export const CLEAR: Color = 0;

export function rgba(r: number, g: number, b: number, a = 255): Color {
  return (((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
}

/** '#rrggbb' or '#rrggbbaa' (or without '#') → Color */
export function hex(s: string, alpha?: number): Color {
  const h = s.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = alpha ?? (h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255);
  return rgba(r, g, b, a);
}

export function rOf(c: Color) { return c & 255; }
export function gOf(c: Color) { return (c >>> 8) & 255; }
export function bOf(c: Color) { return (c >>> 16) & 255; }
export function aOf(c: Color) { return (c >>> 24) & 255; }

export function toHex(c: Color): string {
  const p = (n: number) => n.toString(16).padStart(2, '0');
  return '#' + p(rOf(c)) + p(gOf(c)) + p(bOf(c));
}

export function withAlpha(c: Color, a: number): Color {
  return rgba(rOf(c), gOf(c), bOf(c), a);
}

export function mix(c1: Color, c2: Color, t: number): Color {
  const u = 1 - t;
  return rgba(
    Math.round(rOf(c1) * u + rOf(c2) * t),
    Math.round(gOf(c1) * u + gOf(c2) * t),
    Math.round(bOf(c1) * u + bOf(c2) * t),
    Math.round(aOf(c1) * u + aOf(c2) * t),
  );
}

// --- HSL helpers -----------------------------------------------------------------------------

export function toHsl(c: Color): [number, number, number] {
  const r = rOf(c) / 255, g = gOf(c) / 255, b = bOf(c) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function fromHsl(h: number, s: number, l: number, a = 255): Color {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgba(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255), a);
}

export interface RampOpts {
  /** total lightness span centred on the base color (default 0.5) */
  lightSpan?: number;
  /** degrees the hue rotates from darkest to lightest; positive = shadows cooler, lights warmer (default 40) */
  hueShift?: number;
  /** saturation added at the ends (default -0.1: ends slightly desaturated) */
  satEnds?: number;
}

/**
 * Hue-shifted color ramp, dark → light, with `steps` colors around a base color.
 * Shadows drift toward blue/purple and highlights toward yellow, the classic pixel-art ramp.
 */
export function ramp(base: string | Color, steps: number, opts: RampOpts = {}): Color[] {
  const c = typeof base === 'string' ? hex(base) : base;
  const [h, s, l] = toHsl(c);
  const span = opts.lightSpan ?? 0.5;
  const shift = opts.hueShift ?? 40;
  const satEnds = opts.satEnds ?? -0.1;
  const out: Color[] = [];
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0.5 : i / (steps - 1); // 0 dark → 1 light
    const k = t - 0.5;
    // warm hues move toward 60 (yellow) when lighter; cool shadows toward 240
    const hh = h + rotateToward(h, k < 0 ? 250 : 55, Math.abs(k) * shift);
    const ss = s + satEnds * Math.abs(k) * 2;
    const ll = l + k * span;
    out.push(fromHsl(hh, ss, ll));
  }
  return out;
}

function rotateToward(h: number, target: number, amount: number): number {
  let d = ((target - h + 540) % 360) - 180;
  return Math.sign(d) * Math.min(Math.abs(d), amount);
}

// --- Deterministic randomness and noise -----------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Tileable value noise in [0,1). `period` makes it wrap every `period` cells. */
export function valueNoise(seed: number, period = 0) {
  return (x: number, y: number): number => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const wrap = (v: number) => (period > 0 ? ((v % period) + period) % period : v);
    const v00 = hash2(wrap(x0), wrap(y0), seed);
    const v10 = hash2(wrap(x0 + 1), wrap(y0), seed);
    const v01 = hash2(wrap(x0), wrap(y0 + 1), seed);
    const v11 = hash2(wrap(x0 + 1), wrap(y0 + 1), seed);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy;
  };
}

/** Fractal (fBm) tileable noise over a texture of size `size` px, base cell `cell` px. */
export function fbm(seed: number, size: number, cell: number, octaves = 4) {
  const layers = Array.from({ length: octaves }, (_, i) => valueNoise(seed + i * 101, Math.max(1, Math.round(size / (cell / 2 ** i)))));
  return (x: number, y: number): number => {
    let amp = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const c = cell / 2 ** i;
      sum += layers[i](x / c, y / c) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Ordered-dither threshold in [0,1) for pixel (x,y). */
export function bayer(x: number, y: number): number {
  return (BAYER4[y & 3][x & 3] + 0.5) / 16;
}

/** Pick from a ramp by continuous value t∈[0,1] with ordered dithering between steps. */
export function ditherPick(rampColors: Color[], t: number, x: number, y: number): Color {
  const n = rampColors.length;
  const v = Math.max(0, Math.min(0.9999, t)) * (n - 1);
  const i = Math.floor(v);
  const f = v - i;
  return rampColors[Math.min(n - 1, f > bayer(x, y) ? i + 1 : i)];
}

// --- Pixel buffer ---------------------------------------------------------------------------

export class Px {
  readonly w: number;
  readonly h: number;
  readonly data: Uint32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint32Array(w * h);
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): Color {
    x |= 0; y |= 0;
    return this.inside(x, y) ? this.data[y * this.w + x] : CLEAR;
  }

  /** wrapped read for tileable textures */
  getWrap(x: number, y: number): Color {
    const xx = ((x % this.w) + this.w) % this.w;
    const yy = ((y % this.h) + this.h) % this.h;
    return this.data[yy * this.w + xx];
  }

  set(x: number, y: number, c: Color) {
    x |= 0; y |= 0;
    if (this.inside(x, y)) this.data[y * this.w + x] = c;
  }

  /** alpha-composite c over the existing pixel */
  blend(x: number, y: number, c: Color) {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return;
    const a = aOf(c);
    if (a === 255) { this.data[y * this.w + x] = c; return; }
    if (a === 0) return;
    const d = this.data[y * this.w + x];
    const da = aOf(d) / 255, sa = a / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    const mixc = (s: number, dd: number) => Math.round((s * sa + dd * da * (1 - sa)) / oa);
    this.data[y * this.w + x] = rgba(mixc(rOf(c), rOf(d)), mixc(gOf(c), gOf(d)), mixc(bOf(c), bOf(d)), Math.round(oa * 255));
  }

  setWrap(x: number, y: number, c: Color) {
    const xx = ((x % this.w) + this.w) % this.w;
    const yy = ((y % this.h) + this.h) % this.h;
    this.data[yy * this.w + xx] = c;
  }

  fill(c: Color) { this.data.fill(c); }

  rect(x: number, y: number, w: number, h: number, c: Color) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }

  strokeRect(x: number, y: number, w: number, h: number, c: Color) {
    for (let i = x; i < x + w; i++) { this.set(i, y, c); this.set(i, y + h - 1, c); }
    for (let j = y; j < y + h; j++) { this.set(x, j, c); this.set(x + w - 1, j, c); }
  }

  hline(x0: number, x1: number, y: number, c: Color) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c); }
  vline(x: number, y0: number, y1: number, c: Color) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c); }

  /** Bresenham line */
  line(x0: number, y0: number, x1: number, y1: number, c: Color) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** filled ellipse centred at (cx,cy) with radii rx, ry (pixel centres) */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / (rx + 0.5), ny = (y - cy) / (ry + 0.5);
        if (nx * nx + ny * ny <= 1) this.set(x, y, c);
      }
    }
  }

  circle(cx: number, cy: number, r: number, c: Color) { this.ellipse(cx, cy, r, r, c); }

  /** filled polygon, even-odd scanline */
  poly(pts: [number, number][], c: Color) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c);
      }
    }
  }

  /** Draw other buffer at (dx,dy); transparent pixels skipped. */
  blit(src: Px, dx: number, dy: number, flipX = false, blend = false) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.data[y * src.w + (flipX ? src.w - 1 - x : x)];
        if (aOf(c) === 0) continue;
        if (blend) this.blend(dx + x, dy + y, c); else this.set(dx + x, dy + y, c);
      }
    }
  }

  /** Apply fn to every opaque pixel; fn returns new color. */
  map(fn: (c: Color, x: number, y: number) => Color) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = y * this.w + x;
      if (aOf(this.data[i]) > 0) this.data[i] = fn(this.data[i], x, y);
    }
  }

  /**
   * Add a 1px outline around opaque pixels.
   * outer: draws into transparent pixels adjacent to opaque ones (4-neighbourhood, or 8 if diag).
   */
  outline(c: Color | ((inner: Color) => Color), diag = false) {
    const src = this.data.slice();
    const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < this.w && y < this.h ? src[y * this.w + x] : 0);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (aOf(at(x, y)) > 0) continue;
      let n = 0;
      const nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
      if (diag) nb.push(at(x - 1, y - 1), at(x + 1, y - 1), at(x - 1, y + 1), at(x + 1, y + 1));
      for (const v of nb) if (aOf(v) > 128) { n = v; break; }
      if (n) this.data[y * this.w + x] = typeof c === 'function' ? c(n) : c;
    }
  }

  clone(): Px {
    const p = new Px(this.w, this.h);
    p.data.set(this.data);
    return p;
  }

  flippedX(): Px {
    const p = new Px(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) p.data[y * this.w + x] = this.data[y * this.w + (this.w - 1 - x)];
    return p;
  }

  toImageData(): ImageData {
    const img = new ImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.data);
    return img;
  }

  toCanvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    cv.getContext('2d')!.putImageData(this.toImageData(), 0, 0);
    return cv;
  }
}

/** Convenience: build a canvas by drawing into a fresh Px. */
export function draw(w: number, h: number, fn: (p: Px) => void): HTMLCanvasElement {
  const p = new Px(w, h);
  fn(p);
  return p.toCanvas();
}
