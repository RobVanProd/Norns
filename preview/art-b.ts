// Dev preview for the environment / boss / title art. Includes a CPU emulation of the renderer's
// terrain shading (docs/ART_SPEC.md "Renderer terrain shading") on mock 480×270 scenes.

import { buildMaterialAtlas } from '../src/art/materials';
import { buildBackground } from '../src/art/backgrounds';
import { buildBossSprites } from '../src/art/bosses';
import { buildLogo, buildYggdrasil } from '../src/art/title';
import { REALMS, type RealmId, type BackgroundSet, type SpriteLib } from '../src/art/types';
import { Px, hex, mix, rgba, rOf, gOf, bOf, aOf, bayer, type Color } from '../src/art/px';

const params = new URLSearchParams(location.search);
const only = params.get('section');
const LIT = params.get('lit') !== '0';
const ZOOM = Number(params.get('zoom') ?? '2') || 2;
const root = document.getElementById('root')!;
if (only) document.body.classList.add('focused');

// ---------------------------------------------------------------- build everything (timed)

const timings: [string, number][] = [];
function timed<T>(label: string, fn: () => T): T {
  const t0 = performance.now();
  const r = fn();
  timings.push([label, performance.now() - t0]);
  return r;
}
const atlases = {} as Record<RealmId, HTMLCanvasElement>;
const bgs = {} as Record<RealmId, BackgroundSet>;
for (const r of REALMS) atlases[r] = timed(`atlas ${r}`, () => buildMaterialAtlas(r));
for (const r of REALMS) bgs[r] = timed(`background ${r}`, () => buildBackground(r));
const bosses: SpriteLib = timed('bosses', () => buildBossSprites());
const logo = timed('logo', () => buildLogo());
const ygg = timed('yggdrasil', () => buildYggdrasil());
const total = timings.reduce((a, [, t]) => a + t, 0);

// ---------------------------------------------------------------- DOM helpers

function section(id: string, title: string): HTMLElement | null {
  if (only && !id.startsWith(only)) return null;
  const s = document.createElement('section');
  s.id = id;
  const h = document.createElement('h2');
  h.textContent = title;
  s.appendChild(h);
  root.appendChild(s);
  return s;
}
function row(parent: HTMLElement) {
  const d = document.createElement('div');
  d.className = 'row';
  parent.appendChild(d);
  return d;
}
function show(parent: HTMLElement, src: HTMLCanvasElement | Px, scale: number, caption?: string, checker = false) {
  const fig = document.createElement('figure');
  const c = document.createElement('canvas');
  const srcCanvas = src instanceof Px ? src.toCanvas() : src;
  c.width = srcCanvas.width;
  c.height = srcCanvas.height;
  c.getContext('2d')!.drawImage(srcCanvas, 0, 0);
  c.style.width = `${srcCanvas.width * scale}px`;
  c.style.height = `${srcCanvas.height * scale}px`;
  if (checker) c.className = 'checker';
  fig.appendChild(c);
  if (caption) {
    const fc = document.createElement('figcaption');
    fc.textContent = caption;
    fig.appendChild(fc);
  }
  parent.appendChild(fig);
}
const pxCache = new WeakMap<HTMLCanvasElement, Px>();
function pxOf(cv: HTMLCanvasElement): Px {
  let p = pxCache.get(cv);
  if (!p) {
    p = new Px(cv.width, cv.height);
    const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height);
    p.data.set(new Uint32Array(d.data.buffer));
    pxCache.set(cv, p);
  }
  return p.clone();
}

// ---------------------------------------------------------------- terrain shading emulation

const AIR = 0, EARTH = 1, ROCK = 2, IRON = 3, SAND = 4, ICE = 5, THREAD = 6, BRITTLE = 7, GATE = 8, ROOT = 9;
const MAT_NAMES = ['air', 'EARTH', 'ROCK', 'IRON', 'SAND', 'ICE', 'THREAD', 'BRITTLE', 'GATE', 'ROOT'];

interface Terrain { w: number; h: number; mat: Uint8Array; wall: Uint8Array }

function scale(c: Color, f: number): Color {
  return rgba(rOf(c) * f, gOf(c) * f, bOf(c) * f, aOf(c));
}
function over(dst: Color, src: Color): Color {
  const a = aOf(src) / 255;
  if (a >= 1) return src;
  if (a <= 0) return dst;
  const da = aOf(dst) / 255;
  const oa = a + da * (1 - a);
  const m = (s: number, d: number) => (s * a + d * da * (1 - a)) / oa;
  return rgba(m(rOf(src), rOf(dst)), m(gOf(src), gOf(dst)), m(bOf(src), bOf(dst)), oa * 255);
}

/** Exactly per "Renderer terrain shading" (before lighting). Returns RGBA (transparent = nothing). */
function shadeTerrain(t: Terrain, atlas: Px, backWall: Px): Px {
  const { w, h, mat, wall } = t;
  const out = new Px(w, h);
  const A = (x: number, y: number) => atlas.data[y * atlas.w + x];
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mat[y * w + x] !== AIR;
  // distance to air in each axis direction (1..9, 9 = none within 8); outside the map counts as solid
  const dist = (x: number, y: number, dx: number, dy: number, max: number) => {
    for (let d = 1; d <= max; d++) {
      const xx = x + dx * d, yy = y + dy * d;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) return max + 1;
      if (mat[yy * w + xx] === AIR) return d;
    }
    return max + 1;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const m = mat[i];
    const u = ((x % 64) + 64) % 64;
    if (m !== AIR) {
      const col = m * 64 + u;
      const du = dist(x, y, 0, -1, 8), dd = dist(x, y, 0, 1, 8);
      const dl = dist(x, y, -1, 0, 8), dr = dist(x, y, 1, 0, 8);
      let base: Color;
      let topCap = false;
      const botCapHere = dd <= 8 && aOf(A(col, 72 + dd - 1)) > 0;
      if (du <= 8 && aOf(A(col, 64 + du - 1)) > 0) { base = A(col, 64 + du - 1); topCap = true; }
      else if (botCapHere) base = A(col, 72 + dd - 1);
      else base = A(col, y % 64);
      const ol = A(m * 64, 112), hi = A(m * 64 + 1, 112), sh = A(m * 64 + 2, 112);
      const edge = du === 1 || dd === 1 || dl === 1 || dr === 1;
      if (du === 1 && !topCap) base = hi;
      if (dl === 1) base = mix(base, hi, 0.5);
      if ((dd === 1 || dr === 1) && !botCapHere) base = ol;
      if (!edge) {
        if (du === 2 || dl === 2) base = mix(base, hi, 0.2);
        else if (dd === 2 || dr === 2) base = mix(base, sh, 0.3);
      }
      const k = Math.min(du, dd, dl, dr, 8);
      base = scale(base, 1 - 0.02 * k);
      out.data[i] = (base | 0xff000000) >>> 0;
    } else {
      let c: Color = 0;
      if (wall[i]) c = (scale(backWall.data[(y % 64) * 64 + u], 0.55) | 0xff000000) >>> 0;
      for (let d = 1; d <= 16; d++) {
        if (y + d >= h) break;
        const mb = mat[(y + d) * w + x];
        if (mb !== AIR) {
          const dc = A(mb * 64 + u, 96 - d);
          if (aOf(dc) > 0) c = over(c, dc);
          break;
        }
      }
      for (let d = 1; d <= 16; d++) {
        if (y - d < 0) break;
        const mt = mat[(y - d) * w + x];
        if (mt !== AIR) {
          const hc = A(mt * 64 + u, 95 + d);
          if (aOf(hc) > 0) c = over(c, hc);
          break;
        }
      }
      out.data[i] = c;
    }
    void solid;
  }
  return out;
}

// ---------------------------------------------------------------- mock terrain

function fillPoly(t: Terrain, pts: [number, number][], m: number, flagWall = false) {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(t.h - 1, Math.ceil(maxY)); y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(t.w, Math.round(xs[k + 1])); x++) {
        t.mat[y * t.w + x] = m;
        if (flagWall) t.wall[y * t.w + x] = 1;
      }
    }
  }
}
function fillRect(t: Terrain, x: number, y: number, w: number, h: number, m: number, flagWall = false) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    if (i < 0 || j < 0 || i >= t.w || j >= t.h) continue;
    t.mat[j * t.w + i] = m;
    if (flagWall) t.wall[j * t.w + i] = 1;
  }
}
function fillDisc(t: Terrain, cx: number, cy: number, r: number, m: number, flagWall = false, onlyMat = -1) {
  for (let j = Math.floor(cy - r); j <= cy + r; j++) for (let i = Math.floor(cx - r); i <= cx + r; i++) {
    if (i < 0 || j < 0 || i >= t.w || j >= t.h) continue;
    if ((i - cx) ** 2 + (j - cy) ** 2 > r * r) continue;
    if (onlyMat >= 0 && t.mat[j * t.w + i] !== onlyMat) continue;
    t.mat[j * t.w + i] = m;
    if (flagWall) t.wall[j * t.w + i] = 1;
  }
}

const W = 480, H = 270;
function groundY(x: number) {
  return 214 + 9 * Math.sin(x * 0.021 + 0.5) + 5 * Math.sin(x * 0.057 + 1.3) - 36 * Math.exp(-(((x - 345) / 48) ** 2));
}

function mockTerrain(): Terrain {
  const t: Terrain = { w: W, h: H, mat: new Uint8Array(W * H), wall: new Uint8Array(W * H) };
  // ground hills
  for (let x = 0; x < W; x++) for (let y = Math.floor(groundY(x)); y < H; y++) t.mat[y * W + x] = EARTH;
  // cave interior on the far left (back wall), its left wall and the overhang roof
  fillPoly(t, [[0, 96], [60, 98], [120, 100], [150, 104], [150, 240], [0, 240]], AIR, true);
  for (let x = 0; x < W; x++) for (let y = Math.floor(groundY(x)); y < H; y++) { t.mat[y * W + x] = EARTH; t.wall[y * W + x] = 0; }
  // clear wall flag outside the cave mouth (only x<46 keeps the back wall)
  for (let y = 0; y < H; y++) for (let x = 46; x < W; x++) t.wall[y * W + x] = 0;
  fillRect(t, 0, 60, 10, 160, EARTH);
  fillPoly(t, [[0, 58], [60, 56], [110, 62], [150, 70], [178, 82], [172, 92], [148, 96], [120, 94], [96, 101], [70, 98], [44, 104], [20, 100], [0, 106]], EARTH);
  fillPoly(t, [[20, 64], [70, 62], [120, 72], [150, 80], [140, 86], [100, 84], [60, 88], [24, 84]], ROCK);
  // rock outcrop
  fillPoly(t, [[46, 232], [52, 196], [62, 176], [76, 162], [92, 158], [104, 166], [112, 182], [118, 206], [122, 232]], ROCK);
  // thread staircase (12 planks)
  for (let i = 0; i < 12; i++) fillRect(t, 126 + i * 4, Math.floor(groundY(126)) - 2 - i * 2, 6, 2, THREAD);
  // floating ice ledge
  fillPoly(t, [[186, 128], [252, 127], [250, 133], [238, 136], [214, 135], [196, 136], [188, 133]], ICE);
  // pit with brittle slab
  fillRect(t, 197, Math.floor(groundY(212)) - 1, 30, 26, AIR);
  fillRect(t, 194, Math.floor(groundY(212)) - 1, 36, 5, BRITTLE);
  // iron block
  fillRect(t, 236, Math.floor(groundY(252)) - 30, 32, 36, IRON);
  // tunnel through the big hill (basher), miner diagonal, digger shaft — dug out, back wall shows
  const ty = 196;
  fillRect(t, 296, ty, 96, 12, AIR, true);
  for (let k = 0; k < 26; k++) fillRect(t, 336 + k, ty + 4 + k, 10, 9, AIR, true);
  fillRect(t, 382, ty + 4, 9, 40, AIR, true);
  // right rock ceiling with root tangle, gate bars below it
  fillPoly(t, [[396, 120], [430, 116], [480, 112], [480, 140], [452, 142], [424, 140], [402, 136]], ROCK);
  fillPoly(t, [[420, 118], [436, 100], [452, 96], [470, 92], [480, 96], [480, 114], [430, 120]], ROOT);
  fillDisc(t, 432, 128, 6, ROOT);
  fillRect(t, 409, 136, 7, Math.ceil(groundY(412)) - 136 + 2, GATE);
  // sand pile
  for (let x = 424; x < W; x++) {
    const top = groundY(x) - Math.max(0, 26 - Math.abs(x - 456) * 0.95);
    for (let y = Math.floor(top); y < groundY(x) + 2; y++) t.mat[y * W + x] = SAND;
  }
  return t;
}

// a 12-px tall hooded placeholder creature (facing right)
const WYRD = [
  '..oo......',
  '.oHHo.....',
  '..oLHoo...',
  '..oLHHHo..',
  '.oHHHHHHo.',
  '.oHHFFFFo.',
  '.oHFFeFeo.',
  '.ooFFFFFo.',
  'toCKCCCCo.',
  't.oKCCCo..',
  '..oBooBo..',
  '..oo..oo..',
];
const WYRD_COL: Record<string, Color> = {
  o: hex('#120e26'), H: hex('#3fd0c9'), L: hex('#9af2e4'), F: hex('#f6e8d2'), e: hex('#1a1430'),
  C: hex('#2e2862'), K: hex('#4a4294'), B: hex('#1c1630'), t: hex('#f2c14e'),
};
function drawWyrd(p: Px, x: number, footY: number, flip = false) {
  for (let j = 0; j < WYRD.length; j++) for (let i = 0; i < WYRD[j].length; i++) {
    const ch = WYRD[j][flip ? WYRD[j].length - 1 - i : i];
    if (ch === '.') continue;
    p.set(x - 5 + i, footY - WYRD.length + 1 + j, WYRD_COL[ch]);
  }
}
function surfaceAt(t: Terrain, x: number, fromY: number) {
  for (let y = fromY; y < t.h; y++) if (t.mat[y * t.w + x] !== AIR) return y - 1;
  return t.h - 1;
}

interface Light { x: number; y: number; r: number; c: [number, number, number] }

function skyPx(sky: string[], w: number, h: number): Px {
  const p = new Px(w, h);
  const stops = sky.map((s) => hex(s));
  const bands = 40;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tt = (y / (h - 1)) * bands;
    const b = Math.min(bands, Math.max(0, Math.floor(tt + bayer(x, y) - 0.5))) / bands;
    const s = b * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(s));
    p.data[y * w + x] = mix(stops[i], stops[i + 1], s - i);
  }
  return p;
}

function drawLayers(p: Px, bg: BackgroundSet, camX: number, levelBottom: number) {
  for (const L of bg.layers) {
    const lp = pxOf(L.canvas);
    const off = Math.round(camX * L.parallax);
    const y0 = levelBottom - L.bottomOffset - lp.h;
    for (let y = 0; y < lp.h; y++) {
      const yy = y0 + y;
      if (yy < 0 || yy >= p.h) continue;
      for (let x = 0; x < p.w; x++) {
        const sx = (((x + off) % lp.w) + lp.w) % lp.w;
        const c = lp.data[y * lp.w + sx];
        if (aOf(c) === 0) continue;
        p.data[yy * p.w + x] = over(p.data[yy * p.w + x], c);
      }
    }
  }
}

function applyLight(c: Color, x: number, y: number, amb: [number, number, number], lights: Light[]): Color {
  let r = rOf(c) * amb[0], g = gOf(c) * amb[1], b = bOf(c) * amb[2];
  for (const L of lights) {
    const d = Math.hypot(x - L.x, y - L.y) / L.r;
    if (d >= 1) continue;
    const band = Math.ceil((1 - d) * 4) / 4; // posterised falloff
    const k = band * band * 0.5;
    r += (rOf(c) * 0.6 + 60) * L.c[0] * k;
    g += (gOf(c) * 0.6 + 60) * L.c[1] * k;
    b += (bOf(c) * 0.6 + 60) * L.c[2] * k;
  }
  return rgba(Math.min(255, r), Math.min(255, g), Math.min(255, b), aOf(c));
}

const LIGHTS: Record<RealmId, Light[]> = {
  midgard: [{ x: 352, y: 204, r: 34, c: [1, 0.7, 0.35] }, { x: 412, y: 160, r: 26, c: [1, 0.35, 0.2] }],
  niflheim: [{ x: 220, y: 118, r: 40, c: [0.4, 0.8, 1] }, { x: 412, y: 160, r: 26, c: [1, 0.35, 0.2] }],
  muspelheim: [{ x: 352, y: 204, r: 40, c: [1, 0.5, 0.2] }, { x: 412, y: 160, r: 26, c: [1, 0.35, 0.2] }],
};

function mockScene(realm: RealmId): Px {
  const bg = bgs[realm];
  const p = skyPx(bg.sky, W, H);
  drawLayers(p, bg, 140, H);
  const terr = mockTerrain();
  const shaded = shadeTerrain(terr, pxOf(atlases[realm]), pxOf(bg.backWall));
  // creatures on the terrain layer so lighting applies
  const spots: [number, number, boolean?][] = [[26, 120], [92, 140], [146, 200], [214, 110], [252, 150], [322, 196], [362, 210, true], [398, 180], [452, 170, true], [168, 40]];
  for (const [x, fromY, flip] of spots) drawWyrd(shaded, x, surfaceAt(terr, x, fromY), !!flip);
  for (let i = 0; i < shaded.data.length; i++) {
    const c = shaded.data[i];
    if (aOf(c) === 0) continue;
    const x = i % W, y = (i / W) | 0;
    const lc = LIT ? applyLight(c, x, y, bg.ambient, LIGHTS[realm]) : c;
    p.data[i] = over(p.data[i], lc);
  }
  return p;
}

/** a per-material test swatch through the shader */
function matSwatch(realm: RealmId, m: number): Px {
  const w = 128, h = 80;
  const t: Terrain = { w, h, mat: new Uint8Array(w * h), wall: new Uint8Array(w * h) };
  for (let x = 0; x < w; x++) {
    const top = 46 - 12 * Math.exp(-(((x - 70) / 26) ** 2)) + 3 * Math.sin(x * 0.2);
    for (let y = Math.floor(top); y < h; y++) t.mat[y * w + x] = m;
  }
  fillRect(t, 8, 10, 52, 12, m); // floating slab → hanging deco
  fillRect(t, 70, 54, 40, 10, AIR, true); // tunnel
  const bg = bgs[realm];
  const p = skyPx(bg.sky, w, h);
  const sh = shadeTerrain(t, pxOf(atlases[realm]), pxOf(bg.backWall));
  drawWyrd(sh, 90, 63);
  drawWyrd(sh, 30, surfaceAt(t, 30, 24));
  for (let i = 0; i < sh.data.length; i++) if (aOf(sh.data[i])) p.data[i] = over(p.data[i], LIT ? applyLight(sh.data[i], 0, 0, bg.ambient, []) : sh.data[i]);
  return p;
}

// ---------------------------------------------------------------- page

{
  const s = section('timing', 'Generation time');
  if (s) {
    const pre = document.createElement('div');
    pre.id = 'timing';
    pre.textContent = timings.map(([l, t]) => `${l.padEnd(22)} ${t.toFixed(1)} ms`).join('\n') + `\n${'TOTAL'.padEnd(22)} ${total.toFixed(1)} ms`;
    s.appendChild(pre);
  }
}
console.info(`[art-b] total generation ${total.toFixed(1)} ms`, timings);

for (const r of REALMS) {
  const s = section(`scene-${r}`, `Mock scene — ${r} (480×270 @2×, terrain shaded per spec${LIT ? ', ambient + 2 lights' : ''})`);
  if (s) show(row(s), mockScene(r), 2);
}
/** draw an Anim frame mirrored (facing left) with rotation around its anchor */
function drawSprite(ctx: CanvasRenderingContext2D, key: string, frame: number, x: number, y: number, mirror: boolean, angle = 0) {
  const a = bosses[key];
  if (!a) return;
  const f = a.frames[frame % a.frames.length];
  ctx.save();
  ctx.translate(x, y);
  if (mirror) ctx.scale(-1, 1);
  ctx.rotate(angle);
  ctx.drawImage(f, -a.ax, -a.ay);
  ctx.restore();
}
function arena(realm: RealmId): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mockScene(realm).toCanvas(), 0, 0);
  if (realm === 'midgard') {
    // the wyrm bursts from the ground: spine along a curve, head at the end, facing left
    const pts: [number, number][] = [];
    for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push([458 - t * 76 + Math.sin(t * 3) * 12, 240 - Math.sin(t * Math.PI * 0.85) * 104 + t * 10]); }
    drawSprite(ctx, 'wyrm.tail', 0, pts[0][0] + 6, pts[0][1] + 8, true, -1.2);
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
      drawSprite(ctx, 'wyrm.body', 0, x0, y0, false, Math.atan2(y1 - y0, x1 - x0) + Math.PI);
    }
    const [hx, hy] = pts[pts.length - 1];
    drawSprite(ctx, 'wyrm.head.open', 1, hx - 14, hy - 4, true);
    drawSprite(ctx, 'wyrm.venom', 0, hx - 60, hy + 6, false);
    drawSprite(ctx, 'wyrm.venom', 2, hx - 84, hy + 24, false);
  } else if (realm === 'niflheim') {
    drawSprite(ctx, 'jotunn.body.slam', 0, 410, Math.round(groundY(410)) + 1, true);
    drawSprite(ctx, 'jotunn.icicle', 0, 300, 120, false);
    drawSprite(ctx, 'jotunn.icicle', 0, 270, 92, false);
  } else {
    drawSprite(ctx, 'herald.body.idle', 0, 410, Math.round(groundY(410)) + 1, true);
    drawSprite(ctx, 'herald.sword', 0, 410 - 47, Math.round(groundY(410)) - 57, true, -0.5);
    drawSprite(ctx, 'herald.fireball', 1, 300, 90, false);
  }
  return cv;
}
for (const r of REALMS) {
  const s = section(`arena-${r}`, `Boss in its realm — ${r} (480×270 @2×)`);
  if (s) show(row(s), arena(r), 2);
}

for (const r of REALMS) {
  const s = section(`mats-${r}`, `Materials through the shader — ${r} (@3×)`);
  if (!s) continue;
  const rw = row(s);
  for (let m = 1; m <= 9; m++) show(rw, matSwatch(r, m), 3, `${m} ${MAT_NAMES[m]}`);
}
for (const r of REALMS) {
  // seam check: every body tile repeated 3×2
  const s = section(`tiles-${r}`, `Body tiles repeated 3×2 (seam check) — ${r}`);
  if (!s) continue;
  const rw = row(s);
  const a = pxOf(atlases[r]);
  for (let m = 1; m <= 9; m++) {
    const t = new Px(192, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 192; x++) t.data[y * 192 + x] = a.data[(y % 64) * a.w + m * 64 + (x % 64)];
    show(rw, t, 1, MAT_NAMES[m]);
  }
}
for (const r of REALMS) {
  const s = section(`atlas-${r}`, `Raw material atlas — ${r} (columns 0–9 @2×)`);
  if (!s) continue;
  const a = atlases[r];
  const crop = document.createElement('canvas');
  crop.width = 640; crop.height = 128;
  crop.getContext('2d')!.drawImage(a, 0, 0);
  show(row(s), crop, 2, 'rows: 0–63 body · 64–71 top cap · 72–79 bottom cap · 80–95 surface deco · 96–111 hanging deco · 112 params', true);
}
for (const r of REALMS) {
  const s = section(`bg-${r}`, `Background — ${r}`);
  if (!s) continue;
  const bg = bgs[r];
  const rw = row(s);
  const sky = skyPx(bg.sky, 512, 300);
  const comp = sky.clone();
  drawLayers(comp, bg, 0, 300);
  show(rw, comp, 1, `composite (sky ${bg.sky.join(' ')}) ambient ${bg.ambient.map((v) => v.toFixed(2)).join(',')} · ${bg.atmosphere}`);
  bg.layers.forEach((L, i) => show(rw, L.canvas, 1, `layer ${i}: ${L.canvas.width}×${L.canvas.height} parallax ${L.parallax} bottomOffset ${L.bottomOffset}`, true));
  show(rw, bg.backWall, 4, 'backWall 64×64 @4×');
  const bw = pxOf(bg.backWall);
  bw.map((c) => scale(c, 0.55));
  show(rw, bw, 4, 'backWall ×0.55 as rendered');
}
{
  const groups: [string, string][] = [['wyrm', 'The Gnawing Wyrm'], ['jotunn', 'Hrímgrímnir, the Frost Jötunn'], ['herald', "Surtr's Herald"]];
  for (const [g, title] of groups) {
    const s = section(`bosses-${g}`, `Boss — ${title} (@${ZOOM}×)`);
    if (!s) continue;
    const rw = row(s);
    for (const key of Object.keys(bosses).filter((k) => k.startsWith(g + '.'))) {
      const a = bosses[key];
      a.frames.forEach((f, i) => show(rw, f, ZOOM, `${key} [${i}] ${f.width}×${f.height} @(${a.ax},${a.ay})`, true));
    }
  }
}
{
  const s = section('title-logo', 'Logo (@3×)');
  if (s) show(row(s), logo, 3, `${logo.width}×${logo.height}`);
  const s2 = section('title-ygg', 'Yggdrasil map scene (@2×)');
  if (s2) {
    const p = pxOf(ygg.canvas);
    // mark the realm centres
    for (const r of REALMS) {
      const { x, y } = ygg.realms[r];
      for (let k = -3; k <= 3; k++) { p.set(x + k, y, hex('#ff00ff')); p.set(x, y + k, hex('#ff00ff')); }
    }
    show(row(s2), p, 2, `realms: ${REALMS.map((r) => `${r} (${ygg.realms[r].x},${ygg.realms[r].y})`).join(' · ')} (magenta crosses added by preview)`);
  }
}
