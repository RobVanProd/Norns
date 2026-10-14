// Material atlas (1024×128) — see docs/ART_SPEC.md "Material atlas" and "Renderer terrain
// shading". Column m (x = m*64) holds material m: body tile, top/bottom caps, surface and hanging
// decorations, and a params row. Textures are built from shaded Voronoi clusters and hand-placed
// details (pebbles, plates, rivets, runes, strands) rather than raw noise, then despeckled so
// every texture reads as clusters.

import { Px, type Color, mulberry32, hash2, mix } from './px';
import { MAT_ATLAS_W, MAT_ATLAS_H, MAT_TILE, type RealmId } from './types';
import { ENV, type RealmPal, type MatPal } from './envPalette';
import { cells, slope, despeckle, pebble, smooth, pick, at, wrapi, noise1, clamp01, fbmT, toCv, tubeBuf, tube } from './envKit';
import { RUNES7, RUNES5, glyphPixels } from './runes';

const S = MAT_TILE;
const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const TAU = Math.PI * 2;

interface Tiles {
  body: Px;
  top: Px;
  bot: Px;
  deco: Px;
  hang: Px;
  pal: MatPal;
}

function tiles(pal: MatPal): Tiles {
  return { body: new Px(S, S), top: new Px(S, 8), bot: new Px(S, 8), deco: new Px(S, 16), hang: new Px(S, 16), pal };
}

/** set with x wrapped (tileable horizontally), y clipped */
function setx(p: Px, x: number, y: number, c: Color) {
  y = Math.round(y);
  if (y >= 0 && y < p.h) p.data[y * p.w + wrapi(Math.round(x), p.w)] = c;
}
function getx(p: Px, x: number, y: number): Color {
  if (y < 0 || y >= p.h) return 0;
  return p.data[y * p.w + wrapi(Math.round(x), p.w)];
}

const REALM_SEED: Record<RealmId, number> = { midgard: 1100, niflheim: 2200, muspelheim: 3300 };

// ------------------------------------------------------------------ shared decoration helpers

/** Tapered downward spike (stalactite / icicle) hanging from row 0. */
function spikeDown(p: Px, cx: number, len: number, w: number, rmp: Color[], tip?: Color) {
  const n = rmp.length;
  for (let r = 0; r < len; r++) {
    const hw = (w / 2) * Math.pow(1 - r / len, 0.85);
    const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw - 0.01);
    for (let x = x0; x <= Math.max(x0, x1); x++) {
      const u = x1 > x0 ? (x - x0) / (x1 - x0) : 0.5;
      let idx = u < 0.25 ? n - 2 : u < 0.6 ? n - 3 : u < 0.85 ? 2 : 1;
      if (x1 === x0) idx = n - 3;
      if (r === 0) idx = Math.max(1, idx - 1);
      setx(p, x, r, rmp[Math.max(0, Math.min(n - 1, idx))]);
    }
  }
  if (tip) setx(p, Math.round(cx - 0.01), len - 1, tip);
}

/** Upward crystal / spike standing on row 15. */
function spikeUp(p: Px, cx: number, len: number, w: number, rmp: Color[], lean = 0) {
  const n = rmp.length;
  for (let r = 0; r < len; r++) {
    const hw = (w / 2) * (1 - r / len);
    const off = lean * (r / len) * 1.5;
    const x0 = Math.round(cx - hw + off), x1 = Math.round(cx + hw - 0.01 + off);
    for (let x = x0; x <= Math.max(x0, x1); x++) {
      const u = x1 > x0 ? (x - x0) / (x1 - x0) : 0.3;
      const idx = u < 0.4 ? n - 1 : u < 0.7 ? n - 2 : n - 4;
      setx(p, x, 15 - r, rmp[Math.max(0, Math.min(n - 1, idx))]);
    }
  }
}

/** Grass tufts along the deco strip. */
function grass(p: Px, rng: () => number, L: Color[], density: number, hMin: number, hMax: number, idxBase = 2) {
  let x = Math.floor(rng() * 3);
  while (x < 64) {
    if (rng() < density) {
      const n = 2 + Math.floor(rng() * 3);
      const tuftH = hMin + Math.floor(rng() * (hMax - hMin + 1));
      for (let b = 0; b < n; b++) {
        const h = Math.max(2, tuftH - Math.abs(b - (n - 1) / 2) * 1.5 - Math.floor(rng() * 2));
        const lean = b < n / 2 ? -1 : 1;
        for (let k = 0; k < h; k++) {
          const xx = x + b + (k >= h - 2 && h > 3 ? lean : 0);
          const idx = k === h - 1 ? idxBase + 3 : k >= h - 3 ? idxBase + 2 : k === 0 ? idxBase : idxBase + 1;
          setx(p, xx, 15 - k, at(L, idx));
        }
      }
      x += n + 1 + Math.floor(rng() * 3);
    } else x += 2;
  }
}

/** Thin hanging root / tendril from row 0. */
function tendril(p: Px, rng: () => number, x0: number, len: number, rmp: Color[], thick = 2) {
  let x = x0;
  const sway = rng() * TAU;
  for (let r = 0; r < len; r++) {
    const xx = x0 + Math.round(Math.sin(sway + r * 0.45) * 1.1);
    const w = r < 2 ? thick : 1;
    for (let k = 0; k < w; k++) setx(p, xx + k, r, rmp[k === 0 ? 3 : 1]);
    if (w === 1) setx(p, xx, r, r === len - 1 ? rmp[4] : r % 3 === 0 ? rmp[2] : rmp[3]);
    x = xx;
  }
  // a little fork
  if (len > 6 && rng() < 0.5) {
    const fr = 2 + Math.floor(rng() * (len - 4));
    const dir = rng() < 0.5 ? -1 : 1;
    for (let k = 1; k <= 3; k++) setx(p, x0 + dir * k + Math.round(Math.sin(sway + fr * 0.45)), fr + k, rmp[2]);
  }
  void x;
}

/** Random-walk vein (1px line with a companion shade underneath). */
function vein(p: Px, rng: () => number, len: number, c: Color, under?: Color) {
  let x = rng() * 64, y = rng() * 64;
  let dy = rng() < 0.5 ? -0.3 : 0.3;
  for (let k = 0; k < len; k++) {
    p.setWrap(Math.round(x), Math.round(y), c);
    if (under) p.setWrap(Math.round(x), Math.round(y) + 1, under);
    x += 1;
    if (rng() < 0.35) dy = -dy;
    y += dy;
  }
}

/** Shaded Voronoi-cluster texture: the workhorse for earth/rock/brittle bodies. */
function clusterBody(
  body: Px, rmp: Color[], seed: number,
  o: { gx: number; gy: number; jitter?: number; sy?: number; bevel: number; tint: number; light: number; noise: number; crack: number; crackW: number; base?: number; strata?: number },
) {
  const cl = cells(S, S, o.gx, o.gy, seed, o.jitter ?? 0.9, 1, o.sy ?? 1);
  const nz = fbmT(seed + 3, S, 32, 3);
  const fine = fbmT(seed + 9, S, 8, 2);
  const hf = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const r = cl.rnd[cl.id[i]];
    hf[i] = smooth(0, o.bevel, cl.edge[i]) * (0.75 + r * 0.5) + fine(x, y) * 0.6;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const r = cl.rnd[cl.id[i]];
    const strata = o.strata ? Math.sin((y + 3 * Math.sin((x * TAU) / 64 + seed)) * (TAU / 32)) * o.strata : 0;
    let v = (o.base ?? 0.5) + (r - 0.5) * o.tint + strata + (nz(x, y) - 0.5) * o.noise + slope(hf, S, S, x, y, 1.4) * o.light;
    if (cl.edge[i] < o.crackW) v -= o.crack;
    body.set(x, y, pick(rmp, v));
  }
  return cl;
}


/** Calm soil: blotchy two/three-tone base, faint strata, sparse lit clods. */
function soilBody(body: Px, rmp: Color[], seed: number) {
  const n = rmp.length;
  const idx = new Uint8Array(S * S);
  const big = fbmT(seed + 3, S, 32, 3), mid = fbmT(seed + 4, S, 16, 2);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const st = Math.sin((y + 4 * Math.sin((x * TAU) / 64 + seed) + 2 * Math.sin((x * TAU * 2) / 64)) * (TAU / (64 / 3)));
    const m = mid(x, y);
    const v = 0.5 + (big(x, y) - 0.5) * 0.5 + (m - 0.5) * 0.25 + (st > 0.8 && m > 0.45 ? -0.13 : st < -0.9 && m < 0.5 ? 0.08 : 0);
    idx[y * S + x] = Math.max(1, Math.min(n - 2, Math.floor(clamp01(v) * n)));
  }
  const rng = mulberry32(seed + 41);
  for (let k = 0; k < 18; k++) {
    const cx = rng() * 64, cy = rng() * 64, rx = 1.4 + rng() * 2.2, ry = 1 + rng() * 1.3;
    const base = Math.min(n - 2, 3 + (rng() < 0.3 ? 1 : 0));
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const u = (x - cx) / (rx + 0.5), v = (y - cy) / (ry + 0.5);
      const r2 = u * u + v * v;
      if (r2 > 1) continue;
      let k2 = base;
      if (r2 > 0.45 && u + v > 0.25) k2 = base - 2;
      else if (u + v < -0.5) k2 = base + 1;
      idx[wrapi(y, S) * S + wrapi(x, S)] = Math.max(0, Math.min(n - 1, k2));
    }
  }
  for (let i = 0; i < S * S; i++) body.data[i] = rmp[idx[i]];
  despeckle(body, true, 1, 2);
}

/** Natural rock: big angular facets (planar tilt per cell), sparse cracks, clustered flecks. */
function facetBody(body: Px, rmp: Color[], seed: number, gx: number, gy: number) {
  const cl = cells(S, S, gx, gy, seed, 0.95, 1, 1.15);
  const nc = gx * gy;
  const tx = new Float32Array(nc), ty = new Float32Array(nc);
  for (let k = 0; k < nc; k++) { tx[k] = (hash2(k, 1, seed) - 0.5) * 0.7; ty[k] = (hash2(k, 2, seed) - 0.5) * 0.6 - 0.1; }
  const hf = new Float32Array(S * S);
  const fine = fbmT(seed + 5, S, 8, 2);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, k = cl.id[i];
    let dx = x + 0.5 - cl.px[k], dy = y + 0.5 - cl.py[k];
    if (dx > 32) dx -= 64; else if (dx < -32) dx += 64;
    if (dy > 32) dy -= 64; else if (dy < -32) dy += 64;
    hf[i] = dx * tx[k] + dy * ty[k] + smooth(0, 2.4, cl.edge[i]) * 2.4 + fine(x, y) * 0.9;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, k = cl.id[i];
    let v = 0.55 + (cl.rnd[k] - 0.5) * 0.12 + slope(hf, S, S, x, y, 1.2) * 0.8;
    const a = Math.min(k, cl.id2[i]), b = Math.max(k, cl.id2[i]);
    const crack = hash2(a, b, seed + 3) > 0.5;
    if (cl.edge[i] < 0.6 && crack) v = 0.1;
    body.data[i] = pick(rmp, v);
  }
  return cl;
}

// ------------------------------------------------------------------ 1 EARTH

function earth(P: RealmPal, realm: RealmId, seed: number): Tiles {
  const t = tiles(P.earth);
  const rmp = P.earth.body;
  soilBody(t.body, rmp, seed);
  const rng = mulberry32(seed + 77);
  const peb = realm === 'muspelheim' ? P.pebble : P.pebble.slice(0, 5);
  for (let k = 0; k < 6; k++) {
    const rx = 1.2 + rng() * 2, ry = 0.8 + rng() * 1.2;
    pebble(t.body, rng() * 64, rng() * 64, rx, ry, peb.slice(0, 4), true, rmp[1]);
  }
  if (realm === 'midgard') {
    for (let k = 0; k < 3; k++) vein(t.body, rng, 7 + rng() * 9, P.root.body[4], rmp[1]);
  } else if (realm === 'niflheim') {
    // rime crystals frozen into the soil: small clusters, not lines
    for (let k = 0; k < 7; k++) {
      const x = Math.floor(rng() * 64), y = Math.floor(rng() * 64);
      t.body.setWrap(x, y, P.earthTop[2]); t.body.setWrap(x + 1, y, P.earthTop[1]); t.body.setWrap(x, y + 1, P.earthTop[0]);
      if (rng() < 0.5) t.body.setWrap(x - 1, y, P.earthTop[1]);
    }
  } else {
    for (let k = 0; k < 7; k++) {
      const x = Math.floor(rng() * 64), y = Math.floor(rng() * 64);
      t.body.setWrap(x, y, P.accent[0]);
      if (rng() < 0.6) t.body.setWrap(x + 1, y, P.rock.alt[1]);
      t.body.setWrap(x, y + 1, P.rock.alt[0]);
    }
    for (let k = 0; k < 4; k++) vein(t.body, rng, 6 + rng() * 8, rmp[0]);
  }

  // top cap
  const g = P.earthTop;
  const dn = noise1(seed + 1, 64, 8), hn = noise1(seed + 2, 64, 5);
  for (let x = 0; x < S; x++) {
    if (realm === 'midgard') {
      const d = 2 + Math.round(dn(x) * 2.4) + (hash2(x, 0, seed) > 0.55 ? 1 : 0);
      for (let r = 0; r < d; r++) {
        let idx = r === 0 ? 5 : r === 1 ? 4 : r < d - 1 ? 3 : 2;
        if (r === 0 && hn(x) > 0.66) idx = 6;
        if (r === 1 && hn(x) < 0.25) idx = 3;
        setx(t.top, x, r, g[idx]);
      }
      setx(t.top, x, d, rmp[1]);
      if (hash2(x, 3, seed) > 0.7) setx(t.top, x, d + 1, rmp[2]);
    } else if (realm === 'niflheim') {
      const d = 2 + Math.round(dn(x) * 2) + (hash2(x, 0, seed) > 0.7 ? 1 : 0);
      for (let r = 0; r < d; r++) {
        const idx = r === 0 ? 6 : r === 1 ? 5 : r === d - 1 ? 3 : 4;
        setx(t.top, x, r, g[idx]);
      }
      setx(t.top, x, d, rmp[1]);
    } else {
      const d = 2 + (dn(x) > 0.5 ? 1 : 0);
      setx(t.top, x, 0, hn(x) > 0.55 ? P.sand.body[4] : P.sand.body[3]);
      for (let r = 1; r < d; r++) setx(t.top, x, r, g[r === 1 ? 3 : 2]);
      if (hn(x * 1.7) > 0.72) setx(t.top, x, 1, g[5]);
      if (hn(x * 1.7) > 0.84) { setx(t.top, x, 1, g[6]); setx(t.top, x, 2, g[4]); }
    }
  }
  // bottom cap: soft, darker underside with root nubs
  for (let x = 0; x < S; x++) {
    setx(t.bot, x, 0, rmp[0]);
    if (dn(x + 20) > 0.45) setx(t.bot, x, 1, rmp[1]);
    if (dn(x + 20) > 0.75) setx(t.bot, x, 2, rmp[2]);
    if (realm === 'midgard' && hash2(x, 9, seed) > 0.88) setx(t.bot, x, 0, P.root.body[3]);
  }

  // surface decoration
  const dr = mulberry32(seed + 5);
  if (realm === 'midgard') {
    grass(t.deco, dr, P.leaf, 0.55, 3, 6);
    for (let k = 0; k < 2; k++) {
      const x = 6 + Math.floor(dr() * 52), h = 3 + Math.floor(dr() * 3);
      for (let r = 0; r < h; r++) setx(t.deco, x, 15 - r, P.leaf[2 + (r > 1 ? 1 : 0)]);
      setx(t.deco, x - 1, 15 - h + 1, P.leaf[4]);
      const petal = k === 0 ? P.accent[3] : P.accent[0];
      const yy = 15 - h;
      setx(t.deco, x, yy, P.accent[2]);
      setx(t.deco, x - 1, yy, petal); setx(t.deco, x + 1, yy, mix(petal, P.leaf[1], 0.35));
      setx(t.deco, x, yy - 1, petal); setx(t.deco, x, yy + 1, mix(petal, P.leaf[1], 0.5));
    }
  } else if (realm === 'niflheim') {
    grass(t.deco, dr, P.leaf, 0.25, 2, 4, 2);
    for (let k = 0; k < 3; k++) spikeUp(t.deco, 4 + dr() * 56, 2 + Math.floor(dr() * 3), 2, P.ice.body.slice(3), dr() - 0.5);
  } else {
    for (let k = 0; k < 4; k++) {
      const x = Math.floor(dr() * 64), h = 2 + Math.floor(dr() * 4);
      for (let r = 0; r < h; r++) setx(t.deco, x + (r > 2 ? 1 : 0), 15 - r, P.root.body[r === h - 1 ? 3 : 1]);
      if (h > 3) setx(t.deco, x - 1, 13 - Math.floor(h / 2), P.root.body[2]);
    }
    for (let k = 0; k < 5; k++) {
      const x = Math.floor(dr() * 64), y = 15 - Math.floor(dr() * 8);
      setx(t.deco, x, y, dr() < 0.5 ? P.accent[1] : P.accent[2]);
    }
  }

  // hanging decoration
  const hr = mulberry32(seed + 6);
  if (realm === 'midgard') {
    const rr = [P.root.body[1], P.root.body[3], P.root.body[4], P.root.body[5], P.root.body[6]];
    for (let k = 0; k < 6; k++) tendril(t.hang, hr, Math.floor(k * 10.6 + hr() * 6), 3 + Math.floor(hr() * 11), rr);
    for (let k = 0; k < 5; k++) {
      const x = Math.floor(hr() * 64), w = 2 + Math.floor(hr() * 3);
      for (let i = 0; i < w; i++) {
        const d = 1 + Math.floor(hr() * 3);
        for (let r = 0; r < d; r++) if (!getx(t.hang, x + i, r)) setx(t.hang, x + i, r, P.leaf[r === d - 1 ? 3 : 2]);
      }
    }
  } else if (realm === 'niflheim') {
    for (let k = 0; k < 7; k++) spikeDown(t.hang, 3 + k * 9 + hr() * 4, 3 + Math.floor(hr() * 8), 2 + hr() * 1.5, P.ice.body.slice(2), P.ice.alt[0]);
  } else {
    const rr = [P.root.body[0], P.root.body[1], P.root.body[2], P.root.body[3], P.accent[0]];
    for (let k = 0; k < 5; k++) tendril(t.hang, hr, Math.floor(k * 12.8 + hr() * 6), 3 + Math.floor(hr() * 8), rr);
  }
  return t;
}

// ------------------------------------------------------------------ 2 ROCK

function rock(P: RealmPal, realm: RealmId, seed: number): Tiles {
  const t = tiles(P.rock);
  const rmp = P.rock.body;
  const cl = facetBody(t.body, rmp, seed, 3, 4);
  const glowN = fbmT(seed + 21, S, 16, 2);
  const mossN = fbmT(seed + 23, S, 16, 2);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const e = cl.edge[i];
    // granite flecks: 2px clusters keyed off a coarse hash so they stay clustered
    const fh = hash2(x >> 1, y, seed + 31);
    if (e > 2 && fh > 0.965) t.body.set(x, y, rmp[5]);
    else if (e > 2 && fh < 0.03) t.body.set(x, y, rmp[2]);
    if (realm === 'midgard') {
      if (e < 3 && e > 0.6 && cl.by[i] < -0.5 && mossN(x, y) > 0.56) t.body.set(x, y, P.rock.alt[mossN(x, y) > 0.66 ? 3 : 2]);
    } else if (realm === 'niflheim') {
      if (e < 2 && cl.by[i] < -0.5 && mossN(x, y) > 0.45) t.body.set(x, y, P.rock.alt[e < 0.9 ? 0 : 1]);
    } else {
      if (e < 1.0 && glowN(x, y) > 0.52) t.body.set(x, y, P.rock.alt[e < 0.4 ? 3 : e < 0.75 ? 2 : 1]);
      else if (e < 1.8 && glowN(x, y) > 0.58) t.body.set(x, y, mix(t.body.get(x, y), P.rock.alt[1], 0.3));
    }
  }
  despeckle(t.body, true, 1, 1);

  const dn = noise1(seed + 1, 64, 6), hn = noise1(seed + 2, 64, 9);
  for (let x = 0; x < S; x++) {
    if (realm === 'midgard') {
      if (hn(x) > 0.48) {
        const d = 1 + Math.round(dn(x) * 2);
        for (let r = 0; r < d; r++) setx(t.top, x, r, P.rock.alt[r === 0 ? 4 : r === d - 1 ? 2 : 3]);
      }
    } else if (realm === 'niflheim') {
      const d = 1 + Math.round(dn(x) * 2.2);
      for (let r = 0; r < d; r++) setx(t.top, x, r, P.rock.alt[r === 0 ? 3 : r === 1 ? 2 : 1]);
    } else {
      if (hn(x) > 0.42) {
        setx(t.top, x, 0, P.sand.body[4]);
        if (dn(x) > 0.5) setx(t.top, x, 1, P.sand.body[2]);
      }
    }
  }
  const dr = mulberry32(seed + 5);
  if (realm === 'midgard') {
    grass(t.deco, dr, P.rock.alt, 0.12, 2, 3, 1);
    for (let k = 0; k < 2; k++) pebbleDeco(t.deco, dr() * 64, P.pebble);
  } else if (realm === 'niflheim') {
    for (let k = 0; k < 5; k++) spikeUp(t.deco, dr() * 64, 2 + Math.floor(dr() * 4), 2 + dr() * 2, P.rock.alt, dr() - 0.5);
  } else {
    for (let k = 0; k < 3; k++) pebbleDeco(t.deco, dr() * 64, P.pebble);
    for (let k = 0; k < 4; k++) setx(t.deco, dr() * 64, 15 - Math.floor(dr() * 10), P.accent[dr() < 0.5 ? 0 : 1]);
  }
  const hr = mulberry32(seed + 6);
  const st = realm === 'niflheim' ? P.ice.body.slice(2) : [rmp[1], rmp[2], rmp[3], rmp[4], rmp[5]];
  const nSp = realm === 'niflheim' ? 6 : 4;
  for (let k = 0; k < nSp; k++) {
    const cx = (k + 0.3 + hr() * 0.5) * (64 / nSp);
    const len = 3 + Math.floor(hr() * (realm === 'niflheim' ? 11 : 8));
    const tip = realm === 'muspelheim' ? P.rock.alt[3] : realm === 'niflheim' ? P.ice.alt[0] : undefined;
    spikeDown(t.hang, cx, len, 3 + hr() * 1.6, st, tip);
    if (realm === 'midgard' && hr() < 0.6) { setx(t.hang, cx - 1, 0, P.rock.alt[2]); setx(t.hang, cx, 0, P.rock.alt[3]); }
    if (realm === 'muspelheim' && hr() < 0.7) setx(t.hang, cx, len + 1, P.rock.alt[2]);
  }
  return t;
}

function pebbleDeco(p: Px, x: number, peb: Color[]) {
  const cx = Math.round(x);
  setx(p, cx, 15, peb[2]); setx(p, cx + 1, 15, peb[1]); setx(p, cx - 1, 15, peb[3]);
  setx(p, cx, 14, peb[4]); setx(p, cx + 1, 14, peb[2]);
}

// ------------------------------------------------------------------ 3 IRON (rune-iron, indestructible)

function iron(P: RealmPal, realm: RealmId, seed: number): Tiles {
  const t = tiles(P.iron);
  const r = P.iron.body; // 8 shades
  const rune = P.ironRune;
  const ham = cells(S, S, 9, 9, seed + 4, 0.9);
  const PW = 32, PH = 16;
  let plateNo = 0;
  for (let row = 0; row < 4; row++) {
    const y0 = row * PH, off = (row & 1) * 16;
    for (let k = -1; k < 2; k++) {
      const x0 = off + k * PW;
      for (let ly = 0; ly < PH; ly++) for (let lx = 0; lx < PW; lx++) {
        const x = x0 + lx, y = y0 + ly;
        const xi = wrapi(x, S);
        if (xi !== x && (x < 0 || x >= S)) { /* wrapped copy handled by setWrap */ }
        let c: Color;
        if (lx === PW - 1 || ly === PH - 1) c = r[0];
        else if (lx === 0 || ly === 0) c = ly === 0 && lx > 0 ? r[6] : r[5];
        else if (lx === PW - 2 || ly === PH - 2) c = r[1];
        else if (lx === 1 || ly === 1) c = r[5];
        else if (lx === PW - 3 || ly === PH - 3) c = r[2];
        else {
          const hi = ham.rnd[ham.id[wrapi(y, S) * S + wrapi(x, S)]];
          const sheen = ly < 5 ? 1 : 0;
          c = r[hi > 0.72 ? 4 : hi < 0.2 ? 2 : 3 + (sheen && hi > 0.45 ? 1 : 0)];
        }
        t.body.setWrap(x, y, c);
      }
      // rivets
      const riv = (cx: number, cy: number) => {
        t.body.setWrap(cx, cy, r[7]);
        t.body.setWrap(cx - 1, cy, r[5]); t.body.setWrap(cx, cy - 1, r[5]);
        t.body.setWrap(cx + 1, cy, r[2]); t.body.setWrap(cx, cy + 1, r[1]);
        t.body.setWrap(cx + 1, cy + 1, r[0]); t.body.setWrap(cx - 1, cy - 1, r[4]);
      };
      riv(x0 + 4, y0 + 4); riv(x0 + PW - 6, y0 + 4); riv(x0 + 4, y0 + PH - 6); riv(x0 + PW - 6, y0 + PH - 6);
      // carved rune on alternate plates (engraved groove, faint glow, lit lower lip)
      if (k >= 0 && (row + k) % 2 === 0) {
        const g = RUNES7[(plateNo++ + seed) % RUNES7.length];
        const gx = x0 + 14, gy = y0 + 4;
        glyphPixels(g, (px, py) => {
          t.body.setWrap(gx + px + 1, gy + py + 1, r[5]);
        });
        glyphPixels(g, (px, py) => {
          t.body.setWrap(gx + px, gy + py, (px + py) % 3 === 0 ? rune[2] : rune[1]);
        });
      } else if (k >= 0) {
        // plain plates: a horizontal forged ridge
        for (let lx = 9; lx < PW - 10; lx++) { t.body.setWrap(x0 + lx, y0 + 7, r[5]); t.body.setWrap(x0 + lx, y0 + 8, r[2]); }
      }
    }
  }
  // top cap: frost in Niflheim, soot in Muspelheim, none in Midgard (edge highlight shows)
  const dn = noise1(seed + 1, 64, 7);
  for (let x = 0; x < S; x++) {
    if (realm === 'niflheim') {
      const d = 1 + Math.round(dn(x) * 1.6);
      for (let k = 0; k < d; k++) setx(t.top, x, k, P.rock.alt[k === 0 ? 3 : 2]);
    }
  }
  if (realm === 'niflheim') {
    const hr = mulberry32(seed + 6);
    for (let k = 0; k < 5; k++) spikeDown(t.hang, 4 + k * 12.5 + hr() * 4, 2 + Math.floor(hr() * 5), 2, P.ice.body.slice(3), P.ice.alt[0]);
  }
  return t;
}

// ------------------------------------------------------------------ 4 SAND / SNOW / ASH

function sand(P: RealmPal, realm: RealmId, seed: number): Tiles {
  const t = tiles(P.sand);
  const rmp = P.sand.body;
  const grain = fbmT(seed + 3, S, 4, 2);
  const big = fbmT(seed + 8, S, 32, 2);
  const ph1 = hash2(1, 1, seed) * TAU, ph2 = hash2(2, 1, seed) * TAU;
  const amp = realm === 'niflheim' ? 0.06 : 0.1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ph = y + 2.6 * Math.sin((x * TAU) / 64 + ph1) + 1.4 * Math.sin((x * TAU * 3) / 64 + ph2);
    const band = wrapi(ph, 8);
    const rip = band < 1 ? 1 : band < 2 ? 0.5 : band > 6 ? -0.7 : 0;
    const g = grain(x, y);
    let v = 0.52 + rip * amp + (g - 0.5) * (realm === 'niflheim' ? 0.18 : 0.42) + (big(x, y) - 0.5) * 0.2;
    if (realm === 'muspelheim') v += (g > 0.68 ? -0.18 : 0);
    t.body.set(x, y, pick(rmp, v));
  }
  despeckle(t.body, true, 1, 2);
  const rng = mulberry32(seed + 9);
  if (realm === 'midgard') {
    for (let k = 0; k < 16; k++) { const x = rng() * 64, y = rng() * 64; t.body.setWrap(x, y, rmp[1]); t.body.setWrap(x + 1, y, rmp[5]); }
    for (let k = 0; k < 3; k++) pebble(t.body, rng() * 64, rng() * 64, 1.3, 0.9, P.pebble.slice(1, 6), true, rmp[1]);
  } else if (realm === 'niflheim') {
    for (let k = 0; k < 14; k++) t.body.setWrap(rng() * 64, rng() * 64, P.sand.alt[2]);
  } else {
    for (let k = 0; k < 9; k++) { const x = rng() * 64, y = rng() * 64; t.body.setWrap(x, y, P.sand.alt[1]); t.body.setWrap(x + 1, y, rmp[1]); }
    for (let k = 0; k < 10; k++) { const x = rng() * 64, y = rng() * 64; t.body.setWrap(x, y, rmp[0]); t.body.setWrap(x + 1, y, rmp[1]); }
  }
  const dn = noise1(seed + 1, 64, 5);
  for (let x = 0; x < S; x++) {
    setx(t.top, x, 0, realm === 'niflheim' ? P.sand.alt[1] : rmp[6]);
    if (dn(x) > 0.35) setx(t.top, x, 1, rmp[5]);
    if (realm === 'muspelheim' && dn(x * 2) > 0.85) setx(t.top, x, 1, P.sand.alt[2]);
  }
  const dr = mulberry32(seed + 5);
  if (realm === 'midgard') {
    for (let k = 0; k < 2; k++) {
      const x = Math.floor(dr() * 60);
      for (let b = 0; b < 3; b++) {
        const h = 3 + Math.floor(dr() * 4);
        for (let r = 0; r < h; r++) setx(t.deco, x + b * 2 + (r > h - 3 ? (b - 1) : 0), 15 - r, P.leaf[r === h - 1 ? 6 : r > h / 2 ? 5 : 4]);
      }
    }
  } else if (realm === 'muspelheim') {
    for (let k = 0; k < 4; k++) setx(t.deco, dr() * 64, 15 - Math.floor(dr() * 12), P.accent[dr() < 0.5 ? 1 : 2]);
  } else {
    for (let k = 0; k < 4; k++) { const x = dr() * 64; setx(t.deco, x, 15, P.sand.alt[1]); setx(t.deco, x + 1, 15, rmp[5]); }
  }
  return t;
}

// ------------------------------------------------------------------ 5 ICE (obsidian glass in Muspelheim)

function ice(P: RealmPal, realm: RealmId, seed: number): Tiles {
  const t = tiles(P.ice);
  const rmp = P.ice.body; // 8
  const cl = cells(S, S, 3, 3, seed, 0.9);
  const nz = fbmT(seed + 3, S, 32, 2);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const r = cl.rnd[cl.id[i]];
    const d = wrapi(x + y, 64);
    let v = 0.42 + (r - 0.5) * 0.18 + (nz(x, y) - 0.5) * 0.18;
    if (d >= 8 && d < 13) v += 0.22;
    else if (d === 15 || d === 16) v += 0.16;
    else if (d >= 38 && d < 44) v += 0.1;
    if (cl.edge[i] < 0.7) v += (cl.bx[i] + cl.by[i] < 0 ? 0.28 : -0.12);
    t.body.set(x, y, pick(rmp, v));
  }
  despeckle(t.body, true, 1, 1);
  const rng = mulberry32(seed + 9);
  // fracture lines
  for (let k = 0; k < 3; k++) {
    let x = rng() * 64, y = rng() * 64;
    const ang = -0.6 + rng() * 1.2 + (rng() < 0.5 ? 0 : Math.PI / 2);
    const len = 6 + rng() * 10;
    for (let s = 0; s < len; s++) {
      t.body.setWrap(Math.round(x), Math.round(y), rmp[6]);
      t.body.setWrap(Math.round(x), Math.round(y) + 1, rmp[2]);
      x += Math.cos(ang); y += Math.sin(ang);
    }
  }
  // bubbles
  for (let k = 0; k < 5; k++) {
    const x = Math.floor(rng() * 64), y = Math.floor(rng() * 64);
    t.body.setWrap(x, y, rmp[6]);
    if (rng() < 0.5) { t.body.setWrap(x + 1, y, rmp[5]); t.body.setWrap(x, y + 1, rmp[4]); t.body.setWrap(x + 1, y + 1, rmp[2]); }
  }
  for (let x = 0; x < S; x++) {
    setx(t.top, x, 0, P.ice.alt[0]);
    if (hash2(x >> 1, 0, seed) > 0.4) setx(t.top, x, 1, P.ice.alt[1]);
  }
  for (let x = 0; x < S; x++) setx(t.bot, x, 0, rmp[1]);
  for (let x = 0; x < S; x++) if (hash2(x >> 2, 1, seed) > 0.5) setx(t.bot, x, 1, rmp[5]);
  const dr = mulberry32(seed + 5);
  if (realm !== 'muspelheim') {
    for (let k = 0; k < 3; k++) spikeUp(t.deco, dr() * 64, 2 + Math.floor(dr() * 3), 2, rmp.slice(3), dr() - 0.5);
    const hr = mulberry32(seed + 6);
    for (let k = 0; k < 6; k++) spikeDown(t.hang, 3 + k * 10.5 + hr() * 4, 3 + Math.floor(hr() * 10), 2 + hr() * 1.6, rmp.slice(2), P.ice.alt[0]);
  } else {
    const hr = mulberry32(seed + 6);
    for (let k = 0; k < 4; k++) spikeDown(t.hang, 4 + k * 16 + hr() * 6, 2 + Math.floor(hr() * 5), 3, rmp.slice(2), P.ice.alt[2]);
  }
  return t;
}

// ------------------------------------------------------------------ 6 THREAD (Weaver planks)

function thread(P: RealmPal, seed: number): Tiles {
  const t = tiles(P.thread);
  const r = P.thread.body; // 7
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const band = Math.floor(y / 3), ly = y % 3;
    // horizontal weft: twisted fibres (diagonal twist highlight every 4 px)
    let idx = ly === 0 ? 4 : ly === 1 ? 3 : 1;
    if (ly < 2 && wrapi(x + band * 2 - ly, 4) === 0) idx += 1;
    // vertical warp threads every 8px, over/under alternating per band
    const wx = wrapi(x + (band & 1) * 4, 8);
    if (wx < 2) {
      const over = ((band + Math.floor(x / 8)) & 1) === 0;
      if (over) idx = wx === 0 ? 5 : 3;
      else if (ly === 1) idx = 2;
    }
    t.body.set(x, y, r[Math.min(r.length - 1, idx)]);
  }
  for (let x = 0; x < S; x++) {
    setx(t.top, x, 0, wrapi(x, 6) === 0 ? r[6] : r[5]);
    setx(t.top, x, 1, r[4]);
  }
  const dr = mulberry32(seed + 5);
  for (let k = 0; k < 3; k++) { const x = dr() * 64; setx(t.deco, x, 15, r[5]); setx(t.deco, x + 1, 14, r[6]); }
  const hr = mulberry32(seed + 6);
  for (let k = 0; k < 4; k++) {
    const x = Math.floor(hr() * 64), len = 2 + Math.floor(hr() * 4);
    for (let i = 0; i < len; i++) setx(t.hang, x + (i > 1 && k & 1 ? 1 : 0), i, r[i === len - 1 ? 6 : 4]);
  }
  return t;
}

// ------------------------------------------------------------------ 7 BRITTLE

function brittle(P: RealmPal, realm: RealmId, seed: number): Tiles {
  const t = tiles(P.brittle);
  const rmp = P.brittle.body;
  const cl = clusterBody(t.body, rmp, seed, { gx: 5, gy: 4, jitter: 0.9, bevel: 2.2, tint: 0.3, light: 1.5, noise: 0.12, crack: 0, crackW: 0, base: 0.58 });
  const alt = P.brittle.alt;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const e = cl.edge[i];
    if (e < 0.75) t.body.set(x, y, realm === 'muspelheim' && e < 0.4 ? alt[2] : alt[realm === 'muspelheim' ? 1 : 0]);
    else if (e < 1.4 && cl.bx[i] + cl.by[i] > 0.3) t.body.set(x, y, realm === 'muspelheim' ? alt[0] : rmp[1]);
    else if (e < 1.4 && cl.bx[i] + cl.by[i] < -0.3) t.body.set(x, y, rmp[Math.min(rmp.length - 1, 5)]);
  }
  // branching micro cracks
  const rng = mulberry32(seed + 9);
  for (let k = 0; k < 10; k++) {
    let x = rng() * 64, y = rng() * 64;
    let ang = rng() * TAU;
    const len = 3 + rng() * 6;
    for (let s = 0; s < len; s++) {
      t.body.setWrap(Math.round(x), Math.round(y), realm === 'muspelheim' ? alt[1] : alt[0]);
      ang += (rng() - 0.5) * 0.9;
      x += Math.cos(ang); y += Math.sin(ang);
    }
  }
  // chipped holes
  for (let k = 0; k < 5; k++) {
    const x = Math.floor(rng() * 64), y = Math.floor(rng() * 64);
    t.body.setWrap(x, y, alt[0]); t.body.setWrap(x + 1, y, alt[0]); t.body.setWrap(x, y + 1, alt[0]);
    t.body.setWrap(x + 1, y + 1, realm === 'muspelheim' ? alt[2] : alt[1]);
    t.body.setWrap(x - 1, y - 1, rmp[6]);
  }
  const dn = noise1(seed + 1, 64, 4);
  for (let x = 0; x < S; x++) {
    setx(t.top, x, 0, realm === 'niflheim' ? alt[2] : rmp[6]);
    if (dn(x) > 0.5) setx(t.top, x, 1, rmp[5]);
    if (dn(x) < 0.18) setx(t.top, x, 0, alt[0]);
  }
  for (let x = 0; x < S; x++) {
    if (dn(x + 30) > 0.35) setx(t.bot, x, 0, alt[realm === 'muspelheim' ? 1 : 0]);
    if (dn(x + 30) > 0.7) setx(t.bot, x, 1, rmp[1]);
  }
  const dr = mulberry32(seed + 5);
  for (let k = 0; k < 5; k++) { const x = dr() * 64; setx(t.deco, x, 15, rmp[3]); if (dr() < 0.5) setx(t.deco, x + 1, 15, rmp[5]); }
  const hr = mulberry32(seed + 6);
  for (let k = 0; k < 6; k++) { const x = hr() * 64; setx(t.hang, x, 1 + Math.floor(hr() * 3), rmp[2]); }
  for (let k = 0; k < 4; k++) { const x = hr() * 64; setx(t.hang, x, 0, rmp[1]); setx(t.hang, x + 1, 0, rmp[2]); }
  return t;
}

// ------------------------------------------------------------------ 8 GATE (iron bars + rune bands)

function gate(P: RealmPal, seed: number): Tiles {
  const t = tiles(P.gate);
  const r = P.gate.body; // 8
  const g = P.gateRune;
  const barShade = [6, 4, 2, 0];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const lx = x & 3;
    let idx = barShade[lx];
    // forging blemishes on the bars
    if (lx < 3 && hash2(x >> 2, y >> 2, seed) > 0.85 && (y & 3) === 1) idx = Math.max(1, idx - 1);
    t.body.set(x, y, r[idx]);
  }
  for (const by of [12, 44]) {
    for (let x = 0; x < S; x++) {
      t.body.set(x, by, r[7]);
      t.body.set(x, by + 1, r[5]);
      for (let k = 2; k < 7; k++) t.body.set(x, by + k, r[3]);
      t.body.set(x, by + 7, r[1]);
      t.body.set(x, by + 8, r[0]);
    }
    // rivets at bar centres
    for (let x = 1; x < S; x += 8) {
      if (((x - 1) >> 3) % 4 === 1) continue;
      t.body.set(x, by + 3, r[7]); t.body.set(x + 1, by + 4, r[1]); t.body.set(x, by + 4, r[5]);
    }
    // glowing runes
    for (const gx of [12, 44]) {
      const glyph = RUNES5[(gx + by + seed) % RUNES5.length];
      glyphPixels(glyph, (px, py) => t.body.set(gx + px + 1, by + 2 + py + 1, r[1]));
      glyphPixels(glyph, (px, py) => t.body.set(gx + px, by + 2 + py, py === 0 || px === 2 ? g[4] : g[3]));
    }
  }
  return t;
}

// ------------------------------------------------------------------ 9 ROOT (gnarled roots)

function root(P: RealmPal, realm: RealmId, seed: number): Tiles {
  const t = tiles(P.root);
  const rmp = P.root.body; // 8
  // strands rasterised as wrapped tubes (x wrap inside tube(), y wrap via shifted copies)
  const tb = tubeBuf(S, S);
  const rng = mulberry32(seed + 3);
  const dirs: [number, number][] = [[1, 0], [2, 1], [1, 0], [1, -1], [0, 1], [1, 0], [2, -1], [3, 1], [1, 0], [1, 2]];
  dirs.forEach(([dx, dy], si) => {
    const bx = rng() * 64, by = rng() * 64;
    const A = 4 + rng() * 7, k = 1 + Math.floor(rng() * 3), ph = rng() * TAU;
    const r0 = 2.2 + rng() * 3, rk = 1 + Math.floor(rng() * 3), rph = rng() * TAU;
    const dl = Math.sqrt(dx * dx + dy * dy);
    const px = -dy / dl, py = dx / dl;
    const n = 24 * Math.ceil(dl);
    const pts: [number, number][] = [], rad: number[] = [];
    for (let s2 = 0; s2 <= n; s2++) {
      const u = s2 / n;
      const off = A * Math.sin(TAU * k * u + ph);
      pts.push([bx + dx * 64 * u + px * off, by + dy * 64 * u + py * off]);
      rad.push(Math.max(1.3, r0 + Math.sin(TAU * rk * u + rph) * 1.6 + Math.sin(TAU * (rk + 2) * u) * 0.5));
    }
    // the strand spans dy*64 px vertically: tile copies cover every wrap of the 64-px tile
    const ys: number[] = [];
    for (let oy = -64 * Math.max(0, dy) - 64; oy <= 64 * Math.max(0, -dy) + 64; oy += 64) ys.push(oy);
    for (const oy of ys) tube(tb, pts.map(([x, y]) => [x, y + oy] as [number, number]), rad, si * 3, si);
  });
  const sid = tb.id, zb = tb.z, nxb = tb.nx, nyb = tb.ny;
  const alb = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) if (sid[i] >= 0) alb[i] = Math.sin(tb.ac[i] * 5.5 + sid[i] * 1.7 + Math.sin(tb.al[i] * 0.6 + sid[i]) * 0.6);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    if (sid[i] < 0) {
      t.body.set(x, y, hash2(x >> 1, y >> 1, seed) > 0.8 ? rmp[1] : P.root.alt[0]);
      continue;
    }
    const nx = nxb[i], ny = nyb[i];
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    let v = 0.2 + Math.max(0, -nx * 0.55 - ny * 0.65 + nz * 0.55) * 0.62;
    if (alb[i] > 0.55) v -= 0.12; else if (alb[i] < -0.7) v += 0.06;
    // occlusion where another strand lies on top
    let occ = false;
    for (const [ox, oy] of N4) {
      const j = wrapi(y + oy, S) * S + wrapi(x + ox, S);
      if (sid[j] >= 0 && sid[j] !== sid[i] && zb[j] > zb[i] + 1.5) occ = true;
      if (sid[j] < 0 && (ox > 0 || oy > 0)) v -= 0.1;
    }
    if (occ) v = 0.05;
    t.body.set(x, y, pick(rmp, v));
  }
  despeckle(t.body, true, 1, 1);
  // a few knots
  for (let k = 0; k < 3; k++) {
    const x = Math.floor(rng() * 64), y = Math.floor(rng() * 64);
    if (sid[wrapi(y, S) * S + wrapi(x, S)] < 0) continue;
    t.body.setWrap(x, y, rmp[1]); t.body.setWrap(x + 1, y, rmp[2]); t.body.setWrap(x, y - 1, rmp[5]); t.body.setWrap(x + 1, y + 1, rmp[4]);
  }
  if (realm === 'muspelheim') {
    for (let k = 0; k < 6; k++) {
      const x = Math.floor(rng() * 64), y = Math.floor(rng() * 64);
      if (sid[wrapi(y, S) * S + wrapi(x, S)] < 0) continue;
      t.body.setWrap(x, y, P.root.alt[2]); t.body.setWrap(x + 1, y, P.root.alt[1]);
    }
  }
  const dn = noise1(seed + 1, 64, 6), hn = noise1(seed + 2, 64, 10);
  for (let x = 0; x < S; x++) {
    if (realm === 'midgard' && hn(x) > 0.45) {
      const d = 1 + Math.round(dn(x) * 2);
      for (let r = 0; r < d; r++) setx(t.top, x, r, P.root.alt[r === 0 ? 3 : r === d - 1 ? 1 : 2]);
    } else if (realm === 'niflheim') {
      const d = 1 + Math.round(dn(x) * 1.5);
      for (let r = 0; r < d; r++) setx(t.top, x, r, P.root.alt[r === 0 ? 3 : 2]);
    } else if (realm === 'muspelheim' && hn(x) > 0.6) {
      setx(t.top, x, 0, P.root.alt[2]);
    }
  }
  const dr = mulberry32(seed + 5);
  if (realm === 'midgard') {
    for (let k = 0; k < 4; k++) {
      const x = Math.floor(dr() * 64), h = 2 + Math.floor(dr() * 4);
      for (let r = 0; r < h; r++) setx(t.deco, x, 15 - r, P.root.alt[1]);
      setx(t.deco, x + 1, 15 - h, P.leaf[5]); setx(t.deco, x - 1, 16 - h, P.leaf[4]); setx(t.deco, x + 1, 16 - h, P.leaf[3]);
    }
  } else if (realm === 'niflheim') {
    for (let k = 0; k < 3; k++) spikeUp(t.deco, dr() * 64, 2 + Math.floor(dr() * 3), 2, P.root.alt, dr() - 0.5);
  } else {
    for (let k = 0; k < 5; k++) setx(t.deco, dr() * 64, 15 - Math.floor(dr() * 10), P.accent[dr() < 0.5 ? 0 : 1]);
  }
  const hr = mulberry32(seed + 6);
  const rr = [rmp[1], rmp[2], rmp[3], rmp[4], rmp[6]];
  for (let k = 0; k < 9; k++) tendril(t.hang, hr, Math.floor(k * 7.1 + hr() * 4), 4 + Math.floor(hr() * 11), rr, k % 3 === 0 ? 2 : 1);
  if (realm === 'niflheim') for (let k = 0; k < 4; k++) spikeDown(t.hang, 6 + k * 16 + hr() * 4, 2 + Math.floor(hr() * 4), 2, P.ice.body.slice(3), P.ice.alt[0]);
  if (realm === 'muspelheim') for (let k = 0; k < 3; k++) setx(t.hang, hr() * 64, 5 + Math.floor(hr() * 8), P.accent[1]);
  return t;
}

// ------------------------------------------------------------------ atlas

/** Build the 1024×128 material atlas for a realm. */
export function buildMaterialAtlas(realm: RealmId): HTMLCanvasElement {
  const P = ENV[realm];
  const sd = REALM_SEED[realm];
  const mats: Tiles[] = [
    earth(P, realm, sd + 1),
    rock(P, realm, sd + 2),
    iron(P, realm, sd + 3),
    sand(P, realm, sd + 4),
    ice(P, realm, sd + 5),
    thread(P, sd + 6),
    brittle(P, realm, sd + 7),
    gate(P, sd + 8),
    root(P, realm, sd + 9),
  ];
  const atlas = new Px(MAT_ATLAS_W, MAT_ATLAS_H);
  mats.forEach((t, k) => {
    const x0 = (k + 1) * S;
    atlas.blit(t.body, x0, 0);
    atlas.blit(t.top, x0, 64);
    atlas.blit(t.bot, x0, 72);
    atlas.blit(t.deco, x0, 80);
    atlas.blit(t.hang, x0, 96);
    const pr = [t.pal.outline, t.pal.hi, t.pal.sh, t.pal.debris[0], t.pal.debris[1]];
    pr.forEach((c, i) => atlas.set(x0 + i, 112, c));
  });
  void clamp01;
  return toCv(atlas);
}
