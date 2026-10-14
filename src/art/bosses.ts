// Boss sprites — see docs/ART_SPEC.md "Bosses". Each boss is sculpted from shaded primitives
// (ellipsoids, tapered capsules, bevelled polygons) in a z-buffer, lit from the top-left,
// posterised into hand-tuned ramps with occlusion lines and selective outlines, then finished
// with hand-placed detail: eyes, teeth, runes, cracks, flames and glows. All face right.

import { Px, type Color, mix, mulberry32, aOf } from './px';
import type { Anim, SpriteLib } from './types';
import { BOSS } from './envPalette';
import { Sculpt, type PartStyle, flash, glow, adj, clamp01, hx as hex, toCv } from './envKit';
import { RUNES3, RUNES5, glyphPixels } from './runes';

const TAU = Math.PI * 2;

function anim(frames: Px[], ax: number, ay: number): Anim {
  return { frames: frames.map((f) => toCv(f)), ax, ay };
}

/** rotate (x,y) around (px,py) by a */
function rot(x: number, y: number, px: number, py: number, a: number): [number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  const dx = x - px, dy = y - py;
  return [px + dx * c - dy * s, py + dx * s + dy * c];
}

/** draw a glyph */
function rune(p: Px, g: string[], x: number, y: number, c: Color, shadow?: Color) {
  if (shadow) glyphPixels(g, (gx, gy) => { if (aOf(p.get(x + gx + 1, y + gy + 1))) p.set(x + gx + 1, y + gy + 1, shadow); });
  glyphPixels(g, (gx, gy) => p.set(x + gx, y + gy, c));
}

/** set only where already opaque */
function paint(p: Px, x: number, y: number, c: Color) {
  if (aOf(p.get(x, y))) p.set(x, y, c);
}

/** flame tongue rising from (x,y), height h, half-width w, leaning (px per full height) */
function tongue(p: Px, x: number, y: number, h: number, w: number, lean: number, ramp: Color[], hot = 1) {
  const n = ramp.length;
  for (let r = 0; r < h; r++) {
    const t = r / h; // 0 base → 1 tip
    const hw = w * Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)), 0.7) * (1 - t * 0.6);
    const cx = x + lean * t * t;
    for (let xx = Math.round(cx - hw); xx <= Math.round(cx + hw); xx++) {
      const u = Math.abs(xx - cx) / (hw + 0.5);
      const heat = (1 - t) * 0.85 * hot + (1 - u) * 0.35;
      p.set(xx, Math.round(y - r), ramp[Math.max(0, Math.min(n - 1, Math.floor(heat * n)))]);
    }
  }
}

// ======================================================================= THE GNAWING WYRM

const W_SC = 0, W_BELLY = 1, W_BONE = 2, W_MOUTH = 3, W_HORN2 = 4;
const wyrmStyles: PartStyle[] = [
  { ramp: BOSS.wyrmScale, amb: 0.14, dif: 0.95, outline: hex('#12081a') },
  { ramp: BOSS.wyrmBelly, amb: 0.12, dif: 0.95, outline: hex('#2a1a16') },
  { ramp: BOSS.bone, amb: 0.2, dif: 0.9, outline: hex('#2a1e1c') },
  { ramp: BOSS.mouth, amb: 0.3, dif: 0.4, outline: hex('#12040a') },
  { ramp: BOSS.bone.map((c) => adj(c, -0.12, -0.05)), amb: 0.1, dif: 0.8, outline: hex('#1e1614') },
];
function scaleMod(x: number, y: number, part: number, idx: number) {
  if (part !== W_SC) return 0;
  // scalloped scales: 5×4 cells, alternate rows offset; dark U-shaped lower rim, lit top-left
  const row = Math.floor(y / 4);
  const lx = ((x + (row & 1) * 2) % 5 + 5) % 5, ly = y - row * 4;
  if (ly === 3 && lx > 0 && lx < 4) return idx > 2 ? -2 : -1;
  if (ly === 2 && (lx === 0 || lx === 4)) return -1;
  if (ly === 0 && (lx === 1 || lx === 2) && idx >= 3) return 1;
  return 0;
}

/** Wyrm head. jaw: radians the lower jaw drops; tilt: head raise; breathe: 0/1 */
function wyrmHead(jaw: number, tilt: number, breathe: number, glowAmt: number, eyeShut = false): Px {
  const S = new Sculpt(48, 40);
  const pv: [number, number] = [6, 28]; // neck pivot
  const T = (x: number, y: number) => rot(x, y, pv[0], pv[1], tilt);
  const hinge = T(14, 27);
  const J = (x: number, y: number) => { const [a, b] = T(x, y); return rot(a, b, hinge[0], hinge[1], jaw); };
  const by = breathe;
  // neck stub with dorsal spines
  S.ell(4, 29 + by * 0.5, 8, 10, 0, 8, W_SC);
  for (let k = 0; k < 2; k++) {
    const [x0, y0] = T(3 + k * 6, 20 - k * 1.5);
    S.poly([[x0 - 3, y0 + 3], [x0 + 3, y0 + 2], [x0 - 4, y0 - 4]], 6 + k, W_HORN2, 1);
  }
  // mouth interior (visible when the jaw drops)
  if (jaw > 0.05) {
    const [mx, my] = T(27, 28);
    S.ell(mx, my + jaw * 8, 13, 2 + jaw * 9, 2, 3, W_MOUTH, tilt + jaw * 0.5);
  }
  // lower jaw: scaled, with a thin pale belly strip beneath
  {
    const [a, b] = J(15, 28), [c, d] = J(40, 29.5);
    S.cap(a, b, 4.5, c, d, 2.5, 6, 6, W_SC);

  }
  // skull, snout, brow, cheek
  {
    const [cx, cy] = T(19, 21 - by * 0.5);
    S.ell(cx, cy, 11, 8, 4, 9, W_SC, tilt - 0.08);
    const [a, b] = T(23, 22.5 - by * 0.3), [c, d] = T(44, 24.5);
    S.cap(a, b, 6.5, c, d, 3.5, 7, 6, W_SC);
    const [bx, bY] = T(27, 16);
    S.ell(bx, bY, 6, 3, 13, 4, W_SC, tilt - 0.22);
    const [nx, ny] = T(40, 21.5);
    S.ell(nx, ny, 2.5, 1.8, 11, 2, W_SC, tilt);
    const [cx2, cy2] = T(13, 24);
    S.ell(cx2, cy2, 4.5, 3.5, 11, 3, W_SC, tilt);
  }
  // horns sweeping back (far horn first, darker)
  const horn = (pts: [number, number][], r0: number, z: number, part: number) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, b] = T(pts[i][0], pts[i][1]), [c, d] = T(pts[i + 1][0], pts[i + 1][1]);
      const ra = r0 * (1 - i / (pts.length - 1)) + 0.5, rb = r0 * (1 - (i + 1) / (pts.length - 1)) + 0.5;
      S.cap(a, b, ra, c, d, rb, z, z + 1, part);
    }
  };
  horn([[17, 15], [12, 12], [6, 11], [2, 13]], 2, 6, W_HORN2);
  horn([[21, 14], [15, 9], [8, 7], [3, 7], [1, 9]], 2.6, 16, W_BONE);
  // back-of-skull spikes
  {
    const [x0, y0] = T(9, 19);
    S.poly([[x0 + 2, y0 - 2], [x0 + 2, y0 + 2], [x0 - 7, y0 - 3]], 12, W_SC, 1.5);
    const [x1, y1] = T(9, 25);
    S.poly([[x1 + 2, y1 - 2], [x1 + 2, y1 + 2], [x1 - 7, y1 + 2]], 12, W_SC, 1.5);
  }

  const p = S.render(wyrmStyles, { mod: scaleMod });
  const V = BOSS.venom, B = BOSS.bone;
  // teeth along the upper jaw
  for (let k = 0; k < 7; k++) {
    const [tx, ty] = T(25 + k * 2.6, 27 + k * 0.25);
    const big = k === 5;
    const len = big ? 4 : 2 + (k & 1);
    for (let r = 0; r < len; r++) {
      p.set(Math.round(tx), Math.round(ty + r), r === len - 1 ? B[3] : B[5]);
      if (big && r < len - 2) p.set(Math.round(tx) + 1, Math.round(ty + r), B[3]);
    }
  }
  // pale belly plates along the underside of the lower jaw
  for (let k = 0; k < 18; k++) {
    const [lx, ly] = J(18 + k, 32 - k * 0.05);
    for (let yy = Math.round(ly); yy < Math.round(ly) + 4; yy++) {
      if (aOf(p.get(Math.round(lx), yy)) && !aOf(p.get(Math.round(lx), yy + 1))) {
        p.set(Math.round(lx), yy - 1, k % 3 === 0 ? BOSS.wyrmBelly[2] : BOSS.wyrmBelly[3]);
        break;
      }
    }
  }
  // lower fangs when open
  if (jaw > 0.05) {
    for (let k = 0; k < 5; k++) {
      const [tx, ty] = J(25 + k * 3, 26.5);
      for (let r = 0; r < 2 + (k === 3 ? 1 : 0); r++) p.set(Math.round(tx), Math.round(ty - r), B[r === 0 ? 4 : 5]);
    }
    // venom pooled in the jaw and dripping from the fangs
    const [vx, vy] = J(29, 27.5);
    for (let k = -6; k <= 6; k++) paint(p, Math.round(vx + k), Math.round(vy), V[Math.abs(k) < 3 ? 5 : 4]);
    for (let k = -4; k <= 4; k++) paint(p, Math.round(vx + k), Math.round(vy + 1), V[3]);
    const [fx, fy] = T(38, 31);
    for (let r = 0; r < 2 + glowAmt * 3; r++) p.set(Math.round(fx), Math.round(fy + r), V[r === 0 ? 4 : 5]);
    if (glowAmt > 0.5) { p.set(Math.round(fx) - 1, Math.round(fy) + 5, V[4]); p.set(Math.round(fx), Math.round(fy) + 6, V[5]); }
  }
  // eye: venom glow with a slit pupil
  {
    const [ex, ey] = T(30, 19);
    const x = Math.round(ex), y = Math.round(ey);
    const sock = hex('#12081a');
    if (eyeShut) {
      for (let k = -2; k <= 2; k++) p.set(x + k, y + (Math.abs(k) === 2 ? 0 : 1), sock);
    } else {
      for (let k = -2; k <= 2; k++) { p.set(x + k, y - 2 + (Math.abs(k) > 1 ? 1 : 0), sock); p.set(x + k, y + 2 - (Math.abs(k) > 1 ? 1 : 0), sock); }
      p.set(x - 3, y, sock); p.set(x + 3, y, sock);
      for (let k = -2; k <= 2; k++) for (let j = -1; j <= 1; j++) if (!(Math.abs(k) === 2 && j !== 0)) p.set(x + k, y + j, V[j < 0 ? 6 : 5 - (k > 0 ? 1 : 0)]);
      p.set(x, y - 1, hex('#1a0a10')); p.set(x, y, hex('#1a0a10')); p.set(x, y + 1, hex('#1a0a10'));
      p.set(x - 1, y - 1, hex('#ffffff'));
    }
  }
  // nostril
  {
    const [nx, ny] = T(42, 22);
    p.set(Math.round(nx), Math.round(ny), hex('#12081a'));
    p.set(Math.round(nx) + 1, Math.round(ny), hex('#2a1832'));
  }
  // glowing rune scar on the skull
  {
    const [rx, ry] = T(16, 17);
    rune(p, RUNES3[0], Math.round(rx), Math.round(ry), V[4], BOSS.wyrmScale[1]);
  }
  if (glowAmt > 0) {
    const [gx, gy] = J(29, 28);
    glow(p, gx, gy, 9 + glowAmt * 4, V[4], 0.6 + glowAmt * 0.6, true);
    const [ex, ey] = T(30, 19);
    glow(p, ex, ey, 5, V[5], 0.5, true);
  }
  return p;
}

function wyrmBody(): Px {
  const S = new Sculpt(28, 28);
  S.poly([[5, 8], [12, 7], [3, 1]], 4, W_HORN2, 1.5);
  S.poly([[13, 7], [20, 7], [12, 0]], 6, W_BONE, 1.5);
  S.ell(14, 14.5, 11, 9.5, 2, 10, W_SC);
  S.cap(7, 22.5, 1.3, 21, 22.5, 1.3, 9, 9, W_BELLY);
  const p = S.render(wyrmStyles, { mod: scaleMod });
  const B = BOSS.wyrmBelly;
  for (let x = 8; x < 21; x += 3) paint(p, x, 23, B[1]);
  rune(p, RUNES3[2], 12, 12, BOSS.venom[3], BOSS.wyrmScale[1]);
  return p;
}

function wyrmTail(): Px {
  const S = new Sculpt(20, 20);
  S.poly([[0, 10], [7, 5], [5, 10], [7, 15]], 8, W_BONE, 1.2);
  S.cap(19, 10, 6.5, 6, 10, 2, 2, 4, W_SC);
  S.poly([[11, 7], [16, 6], [12, 1]], 6, W_HORN2, 1);
  S.cap(18, 13.5, 3.5, 8, 11.5, 1.2, 6, 6, W_BELLY);
  return S.render(wyrmStyles, { mod: scaleMod });
}

function wyrmVenom(f: number): Px {
  const p = new Px(10, 10);
  const V = BOSS.venom;
  const sq = [0, 0.6, 0, -0.6][f];
  const rx = 3.2 + sq * 0.5, ry = 3.2 - sq * 0.5;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const u = (x - 4.5) / rx, v = (y - 4.5) / ry;
    const r2 = u * u + v * v;
    if (r2 > 1.45) continue;
    if (r2 > 1) { if ((x + y + f) % 2 === 0) p.set(x, y, hex('#7ad21e', 110)); continue; }
    const l = clamp01(0.7 - (u + v) * 0.35 + (1 - r2) * 0.3);
    p.set(x, y, r2 > 0.7 && u + v > 0.3 ? V[1] : V[Math.min(6, 2 + Math.floor(l * 5))]);
  }
  const hx = [3, 4, 5, 4][f], hy = [3, 2, 3, 4][f];
  p.set(hx, hy, V[6]); p.set(hx + 1, hy, V[5]);
  p.set([6, 2, 7, 3][f], [6, 7, 2, 6][f], V[5]);
  return p;
}

// ======================================================================= HRÍMGRÍMNIR, THE FROST JÖTUNN

const J_SKIN = 0, J_ICE = 1, J_FUR = 2, J_RIME = 3, J_FAR = 4, J_FARICE = 5, J_MOUTH = 6;
const jotStyles: PartStyle[] = [
  { ramp: BOSS.frostSkin, amb: 0.08, dif: 1.0, outline: hex('#10142c') },
  { ramp: BOSS.glacier, amb: 0.2, dif: 0.9, outline: hex('#0c1a44') },
  { ramp: BOSS.fur, amb: 0.14, dif: 0.95, outline: hex('#100c10') },
  { ramp: BOSS.rime, amb: 0.28, dif: 0.85, outline: hex('#1e2a4a') },
  { ramp: BOSS.frostSkin, amb: 0.06, dif: 0.72, outline: hex('#0c1026') },
  { ramp: BOSS.glacier, amb: 0.08, dif: 0.7, outline: hex('#0a1438') },
  { ramp: [hex('#060a1a'), hex('#0e1a3a'), hex('#1e3a6a')], flat: 0.2, outline: hex('#060a1a') },
];
function jotMod(x: number, y: number, part: number, idx: number, _nx: number, _ny: number, nz: number) {
  if (part === J_ICE || part === J_FARICE) {
    const f = ((x - y * 0.6) / 5) | 0;
    if ((f & 3) === 0 && idx > 1) return -1;
    if ((f & 3) === 2 && nz > 0.6) return 1;
  }
  if (part === J_FUR) {
    if ((x * 2 + (y >> 2)) % 5 === 0) return -1;
    if ((x * 2 + (y >> 2)) % 5 === 2 && idx >= 3) return 1;
  }
  if (part === J_RIME && (x + (y >> 1)) % 4 === 0) return -1;
  return 0;
}

type JPose = 'idle0' | 'idle1' | 'inhale' | 'slam' | 'hurt';

function jotunn(pose: JPose): Px {
  const S = new Sculpt(128, 112);
  const br = pose === 'idle1' ? 1 : 0;
  const inh = pose === 'inhale' ? 1 : 0;
  const rc = pose === 'hurt' ? -3 : 0; // recoil
  const up = br + inh * 2;
  // far arm (behind the torso)
  {
    const sx = 42 + rc, sy = 44 - up;
    const ex = 31 + rc - inh * 3, ey = 68 - up;
    const hx = 33 + rc - inh * 2, hy = 92 - up;
    S.cap(sx, sy, 9, ex, ey, 7, 2, 2, J_FAR);
    S.cap(ex, ey, 7, hx, hy - 6, 7.5, 2, 3, J_FAR);
    S.cap(hx + 0.5, hy - 15, 8, hx, hy - 10, 8, 4, 4, J_FARICE);
    S.ell(hx + 1, hy, 9, 8, 3, 6, J_FAR);
  }
  // legs with fur boots
  S.cap(53 + rc, 80, 10, 47 + rc, 95, 8.5, 6, 6, J_FAR);
  S.cap(47 + rc, 95, 9, 45 + rc, 104, 9, 7, 7, J_FUR);
  S.ell(48 + rc, 106, 11, 5, 6, 4, J_FUR);
  S.cap(74 + rc, 80, 10.5, 80 + rc, 95, 9, 14, 14, J_SKIN);
  S.cap(80 + rc, 95, 9.5, 82 + rc, 104, 9.5, 16, 16, J_FUR);
  S.ell(87 + rc, 106, 12, 5, 16, 4, J_FUR);
  // fur kilt + belt
  S.poly([[42 + rc, 70], [88 + rc, 68], [94 + rc, 88], [84 + rc, 92], [76 + rc, 87], [66 + rc, 94], [56 + rc, 87], [46 + rc, 92], [38 + rc, 86]], 18, J_FUR, 3, 0.4);
  // torso
  S.ell(64 + rc, 58 - up, 26, 22 + inh * 2, 12, 16, J_SKIN);
  S.ell(64 + rc, 66 - up * 0.5, 21, 12, 16, 10, J_SKIN);
  S.cap(42 + rc, 72, 3.2, 88 + rc, 70, 3.2, 30, 30, J_FUR);
  S.ell(64 + rc, 71, 4.5, 4.5, 34, 4, J_ICE); // ice-crystal buckle
  // shoulders: glacier pauldrons with crystal spikes
  S.ell(42 + rc, 42 - up, 13, 10, 16, 8, J_FARICE);
  for (let k = 0; k < 3; k++) S.poly([[34 + k * 6 + rc, 38 - up], [40 + k * 6 + rc, 38 - up], [33 + k * 5 + rc, 24 - up + k * 2]], 18, J_FARICE, 1.5);
  // head (small vs. shoulders for scale), hunched forward
  const hx = 77 + rc - inh * 2, hy = 28 - up - inh * 2;
  S.ell(hx, hy, 11, 12, 24, 10, J_SKIN);
  S.ell(hx + 4, hy - 4, 8, 3.5, 33, 4, J_SKIN, -0.15 - inh * 0.15); // brow ridge
  S.ell(hx + 9, hy + 1, 3, 4, 34, 3, J_SKIN); // nose
  S.ell(hx - 7, hy + 1, 3, 4, 30, 3, J_SKIN); // ear
  if (inh) S.ell(hx + 6, hy + 8, 4, 3.5, 40, 1, J_MOUTH);
  // icicle crown
  for (let k = 0; k < 5; k++) {
    const bx = hx - 7 + k * 3.5, byy = hy - 8 + Math.abs(k - 2) * 0.8;
    S.poly([[bx - 1.5, byy + 2], [bx + 1.5, byy + 2], [bx - 1 - (k < 2 ? 1 : 0), byy - 8 - (k === 2 ? 4 : k === 1 || k === 3 ? 2 : 0)]], 30, J_ICE, 1);
  }
  // rime beard flowing over the chest
  {
    const bx = hx, byy = hy + 7;
    const beard: [number, number][] = [[bx - 9, byy - 3], [bx + 12, byy - 3], [bx + 13, byy + 6], [bx + 10, byy + 20], [bx + 7, byy + 13], [bx + 4, byy + 26], [bx + 1, byy + 15], [bx - 3, byy + 23], [bx - 5, byy + 12], [bx - 9, byy + 16], [bx - 10, byy + 4]];
    S.poly(beard, 44, J_RIME, 3, 0.6);
  }
  // near shoulder + arm
  S.ell(89 + rc, 42 - up, 14, 11, 38, 9, J_ICE);
  for (let k = 0; k < 3; k++) S.poly([[83 + k * 6 + rc, 37 - up], [90 + k * 6 + rc, 37 - up], [88 + k * 7 + rc, 22 - up + (k === 1 ? -4 : 0)]], 40, J_ICE, 1.5);
  if (pose === 'slam') {
    S.cap(92 + rc, 42, 10, 112, 32, 8, 40, 42, J_SKIN);
    S.cap(112, 32, 8, 106, 18, 8.5, 42, 44, J_SKIN);
    S.cap(110.5, 27.5, 9, 108.5, 23.5, 9, 46, 46, J_ICE);
    S.ell(104, 13, 10, 8.5, 46, 7, J_SKIN);
    for (let k = 0; k < 3; k++) S.ell(97 + k * 4.5, 7, 2.4, 2.6, 52, 2, J_SKIN);
  } else {
    const ex = 103 + rc + inh * 2, ey = 68 - up;
    const fx = 101 + rc + inh * 3, fy = 95 - up;
    S.cap(92 + rc, 44 - up, 10, ex, ey, 8, 40, 40, J_SKIN);
    S.cap(ex, ey, 8, fx, fy - 6, 8.5, 42, 42, J_SKIN);
    S.cap(fx + 0.5, fy - 16, 9, fx, fy - 10, 9, 46, 46, J_ICE);
    S.ell(fx + 1, fy, 10, 9, 44, 8, J_SKIN);
    for (let k = 0; k < 3; k++) S.ell(fx + 8, fy - 5 + k * 4.5, 2.6, 2.4, 52, 2, J_SKIN);
  }
  const p = S.render(jotStyles, { mod: jotMod, occGap: 4 });
  const G = BOSS.frostGlow, F = BOSS.frostSkin;
  // knuckle lines on the fists
  const fistDetail = (fx: number, fy: number, far: boolean) => {
    const c = far ? F[1] : F[2];
    for (let k = -1; k <= 1; k++) { paint(p, fx + 3, fy - 3 + k * 3, c); paint(p, fx + 4, fy - 3 + k * 3, c); }
  };
  if (pose !== 'slam') fistDetail(102 + rc + inh * 3, 96 - up, false);
  fistDetail(34 + rc - inh * 2, 92 - up, true);
  // pectoral arc, sternum and abdominal contours (dark line + lit lip above)
  const cy0 = 60 - up;
  for (let x = 44; x <= 68; x++) {
    const yy = Math.round(cy0 + Math.pow(Math.abs(x - 56) / 12, 2) * -4 + (x > 56 ? 0 : 0));
    paint(p, x + rc, yy, F[2]); paint(p, x + rc, yy - 1, F[5]);
  }
  for (let y = cy0 + 2; y < 76 - up * 0.5; y++) paint(p, 62 + rc, y, F[2]);
  for (const ay of [66, 71]) for (let x = 54; x <= 70; x++) { if (x === 62) continue; paint(p, x + rc, ay - up, F[2]); paint(p, x + rc, ay - 1 - up, F[4]); }
  for (let y = 46; y < 58; y++) paint(p, 40 + rc + Math.round((y - 46) * 0.25), y - up, F[1]);
  // chest: frost-rune tattoo glowing faintly
  rune(p, RUNES5[3], 48 + rc, 63 - up, inh ? G[2] : G[1], F[2]);
  // face: deep eye sockets under the brow, glowing eyes
  const ex = hx + 6, ey = hy - 1;
  for (let k = -8; k <= 3; k++) paint(p, ex + k, ey - 1, F[1]);
  for (let k = -7; k <= 2; k++) paint(p, ex + k, ey, F[0]);
  if (pose === 'hurt') {
    for (let k = -1; k <= 1; k++) { p.set(ex + k, ey, F[3]); p.set(ex - 6 + k, ey, F[3]); }
  } else {
    p.set(ex - 1, ey, G[2]); p.set(ex, ey, G[4]); p.set(ex + 1, ey, G[3]);
    p.set(ex, ey + 1, G[1]);
    p.set(ex - 6, ey, G[2]); p.set(ex - 5, ey, G[3]);
    glow(p, ex, ey, 6, G[2], 0.8, true);
  }
  // nostril + cheek crease
  paint(p, hx + 10, hy + 4, F[1]);
  for (let k = 0; k < 3; k++) paint(p, hx + 6 - k, hy + 3 + k, F[2]);
  // frost breath glow when inhaling
  if (inh) {
    glow(p, hx + 6, hy + 8, 9, G[2], 1.2, true);
    p.set(hx + 6, hy + 8, G[3]); p.set(hx + 7, hy + 8, G[4]);
    const rng = mulberry32(7);
    for (let k = 0; k < 14; k++) {
      const a = rng() * TAU, d = 6 + rng() * 10;
      p.set(Math.round(hx + 6 + Math.cos(a) * d * 1.3), Math.round(hy + 8 + Math.sin(a) * d * 0.6), G[rng() < 0.5 ? 3 : 2]);
    }
  }
  // breath mist curling from the nose on idle1
  if (pose === 'idle1') for (let k = 0; k < 4; k++) p.set(hx + 13 + k, hy + 4 - (k & 1), hex('#d8e8f8', 150));
  // ice glints
  for (const [gx, gy] of [[86, 34], [40, 36], [108, 66], [30, 64]]) {
    const yy = gy - up;
    if (aOf(p.get(gx + rc, yy))) { p.set(gx + rc, yy, hex('#ffffff')); }
  }
  return p;
}

function jotFist(): Px {
  const S = new Sculpt(36, 30);
  S.cap(12, 0, 7, 22, 0, 7, 2, 2, J_ICE);
  S.cap(10, 3, 8.5, 25, 3, 8.5, 4, 4, J_ICE);
  S.ell(18, 15, 13, 9, 6, 10, J_SKIN);
  for (let k = 0; k < 4; k++) S.ell(8 + k * 6.5, 23 - (k === 0 || k === 3 ? 1 : 0), 3.6, 3.6, 10, 4, J_SKIN);
  S.cap(28, 10, 3.5, 22, 18, 3, 16, 16, J_SKIN); // thumb
  for (let k = 0; k < 4; k++) S.poly([[8 + k * 5, 4], [13 + k * 5, 4], [9 + k * 6, -6 + (k & 1) * 3]], 10, J_ICE, 1);
  const p = S.render(jotStyles, { mod: jotMod, occGap: 3 });
  const F = BOSS.frostSkin;
  for (let k = 0; k < 3; k++) for (let y = 17; y < 22; y++) paint(p, 11 + k * 6.5, y, F[2]);
  p.set(14, 6, hex('#ffffff')); p.set(15, 6, BOSS.glacier[6]);
  return p;
}

function jotIcicle(): Px {
  const p = new Px(8, 20);
  const G = BOSS.glacier;
  for (let y = 0; y < 20; y++) {
    const hw = 3.6 * Math.pow(1 - y / 20, 0.9);
    const x0 = Math.round(4 - hw), x1 = Math.round(4 + hw - 0.01);
    for (let x = x0; x <= Math.max(x0, x1); x++) {
      const u = x1 > x0 ? (x - x0) / (x1 - x0) : 0.5;
      let c = u < 0.2 ? G[5] : u < 0.45 ? G[6] : u < 0.75 ? G[4] : G[2];
      if (x === x1 && x1 > x0) c = G[1];
      p.set(x, y, c);
    }
  }
  for (let x = 1; x < 7; x++) p.set(x, 0, BOSS.rime[6]);
  for (let x = 1; x < 7; x += 2) p.set(x, 1, BOSS.rime[5]);
  p.set(3, 4, hex('#ffffff')); p.set(3, 8, G[7]); p.set(4, 19, G[7]);
  p.outline((c) => adj(c, -0.3, 0.1), false);
  return p;
}

// ======================================================================= SURTR'S HERALD

const H_OB = 0, H_FAR = 1, H_CLOTH = 2, H_HORN = 3, H_GEM = 4;
const herStyles: PartStyle[] = [
  { ramp: BOSS.obsidian, amb: 0.14, dif: 0.95, under: 0.5, outline: hex('#050308') },
  { ramp: BOSS.obsidian, amb: 0.06, dif: 0.7, under: 0.35, outline: hex('#040206') },
  { ramp: BOSS.cloth, amb: 0.1, dif: 0.85, under: 0.6, outline: hex('#0e0406') },
  { ramp: [hex('#140c10'), hex('#2a1c1e'), hex('#46302c'), hex('#6a4a3e'), hex('#94705a'), hex('#c4a080')], amb: 0.15, dif: 0.9, outline: hex('#0a0608') },
  { ramp: BOSS.ember, flat: 0.75, outline: hex('#3a0a08') },
];
function herMod(x: number, y: number, part: number, idx: number, _nx: number, ny: number, nz: number) {
  if (part === H_OB || part === H_FAR) {
    if (y % 7 === 0 && nz < 0.9) return -1; // plate seams
    if (nz > 0.86 && ny < -0.2 && idx >= 4) return 1; // glassy sheen
  }
  if (part === H_CLOTH && (x + (y >> 2)) % 6 === 0) return -1;
  return 0;
}

type HPose = 'idle0' | 'idle1' | 'raise' | 'hurt';

function herald(pose: HPose): Px {
  const S = new Sculpt(112, 128);
  const raise = pose === 'raise';
  const fl = pose === 'idle1' ? 1 : 0;
  const rc = pose === 'hurt' ? -3 : 0;
  // cape (behind everything)
  S.poly([[34 + rc, 40], [62 + rc, 38], [58 + rc, 70], [40 + rc, 126], [30 + rc, 118], [22 + rc, 124], [14 + rc, 112], [8 + rc, 118], [6 + rc, 98], [14 + rc, 70]], 0, H_CLOTH, 4, 0.5);
  // far arm
  if (raise) {
    S.cap(40 + rc, 44, 7, 28 + rc, 32, 6, 4, 4, H_FAR);
    S.cap(28 + rc, 32, 6, 36 + rc, 20, 6.5, 4, 5, H_FAR);
    S.ell(37 + rc, 17, 6.5, 6, 6, 5, H_FAR);
  } else {
    S.cap(40 + rc, 46, 7, 30 + rc, 68, 6, 4, 4, H_FAR);
    S.cap(30 + rc, 68, 6.5, 33 + rc, 88, 7, 4, 5, H_FAR);
    S.ell(34 + rc, 92, 6, 6, 6, 5, H_FAR);
  }
  // legs
  S.cap(50 + rc, 84, 8.5, 44 + rc, 103, 7, 6, 6, H_FAR);
  S.cap(44 + rc, 103, 7.5, 42 + rc, 120, 6.5, 6, 6, H_FAR);
  S.ell(46 + rc, 122, 9, 4.5, 6, 4, H_FAR);
  S.ell(44 + rc, 103, 5, 4.5, 10, 3, H_FAR); // knee cop
  S.cap(66 + rc, 84, 9, 72 + rc, 103, 7.5, 16, 16, H_OB);
  S.cap(72 + rc, 103, 8, 74 + rc, 120, 7, 16, 16, H_OB);
  S.ell(80 + rc, 122, 10, 4.5, 16, 4, H_OB);
  S.ell(72 + rc, 103, 5.5, 5, 22, 3, H_OB);
  S.poly([[67 + rc, 99], [77 + rc, 99], [73 + rc, 92]], 26, H_HORN, 1); // knee spike
  // tassets
  S.poly([[42 + rc, 76], [76 + rc, 76], [82 + rc, 92], [70 + rc, 96], [58 + rc, 90], [46 + rc, 96], [38 + rc, 90]], 20, H_OB, 3, 0.3);
  // torso + breastplate
  S.ell(58 + rc, 62, 20, 19, 10, 14, H_OB);
  S.ell(58 + rc, 77, 14, 7, 12, 8, H_OB);
  S.ell(62 + rc, 56, 15, 13, 18, 8, H_OB);
  // far pauldron
  S.ell(38 + rc, 44, 12, 9, 14, 7, H_FAR);
  S.poly([[30 + rc, 40], [38 + rc, 38], [26 + rc, 26]], 16, H_HORN, 1.2);
  // helm + horns
  const hx = 64 + rc + (raise ? -1 : 0), hy = 30 + (raise ? -2 : 0);
  S.ell(hx, hy, 9, 10, 24, 9, H_OB);
  S.ell(hx + 4, hy + 3, 6, 6, 30, 4, H_OB); // face plate
  const horn = (pts: [number, number][], r0: number, z: number) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const ra = r0 * (1 - i / (pts.length - 1)) + 0.7, rb = r0 * (1 - (i + 1) / (pts.length - 1)) + 0.7;
      S.cap(pts[i][0], pts[i][1], ra, pts[i + 1][0], pts[i + 1][1], rb, z, z, H_HORN);
    }
  };
  horn([[hx - 5, hy - 5], [hx - 10, hy - 12], [hx - 9, hy - 20], [hx - 4, hy - 25]], 3, 20);
  horn([[hx + 3, hy - 6], [hx + 2, hy - 14], [hx + 7, hy - 21], [hx + 13, hy - 23]], 3.4, 34);
  // near pauldron with spikes
  S.ell(80 + rc, 44, 13, 10, 36, 8, H_OB);
  for (let k = 0; k < 3; k++) S.poly([[73 + k * 6 + rc, 40], [79 + k * 6 + rc, 40], [78 + k * 8 + rc, 26 + (k === 1 ? -4 : 0)]], 40, H_HORN, 1.2);
  // near arm: extended forward to hold the sword, or raised
  if (raise) {
    S.cap(82 + rc, 48, 7.5, 96 + rc, 34, 6.5, 40, 42, H_OB);
    S.cap(96 + rc, 34, 6.5, 88 + rc, 20, 7, 42, 44, H_OB);
    S.ell(87 + rc, 17, 7, 6.5, 44, 5, H_OB);
  } else {
    S.cap(82 + rc, 48, 7.5, 92 + rc, 66, 6.5, 40, 42, H_OB);
    S.cap(92 + rc, 66, 7, 102 + rc, 70, 7, 42, 44, H_OB);
    S.ell(103 + rc, 70, 6, 6, 46, 5, H_OB);
  }
  S.ell(58 + rc, 60, 4, 4, 30, 2, H_GEM); // molten core
  const p = S.render(herStyles, { mod: herMod, occGap: 4 });
  const E = BOSS.ember, FL = BOSS.flame;
  // lava under-light: downward-facing armour catches a hot orange rim; top-facing gets a glassy glint
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
    const i = y * S.w + x, pt = S.part[i];
    if (pt !== H_OB && pt !== H_FAR && pt !== H_CLOTH) continue;
    const ny = S.ny[i];
    const edge = y + 1 < S.h && S.part[i + S.w] < 0;
    if (ny > 0.72 || (edge && ny > 0.3)) p.data[i] = mix(p.data[i], E[4], pt === H_FAR ? 0.35 : 0.5);
    else if (ny > 0.42) p.data[i] = mix(p.data[i], E[3], pt === H_FAR ? 0.2 : 0.32);
    else if (pt === H_OB && ny < -0.55 && S.nx[i] < -0.25 && S.nz[i] > 0.5) p.data[i] = mix(p.data[i], hex('#c8b4e8'), 0.35);
  }
  // molten seams: cracks radiating from the core
  const rng = mulberry32(pose === 'idle1' ? 11 : 10);
  for (let k = 0; k < 6; k++) {
    let x = 58 + rc, y = 60;
    const a0 = (k / 6) * TAU + 0.3;
    for (let s = 0; s < 9 + (k & 1) * 6; s++) {
      x += Math.cos(a0 + Math.sin(s * 1.3 + k) * 0.5) * 1.2; y += Math.sin(a0 + Math.sin(s * 1.3 + k) * 0.5) * 1.2;
      paint(p, Math.round(x), Math.round(y), s < 4 ? E[5] : E[3]);
    }
  }
  rune(p, RUNES5[0], 56 + rc, 58, E[7], E[3]);
  // glowing seams on greaves and gauntlets
  for (const [sx, sy, len] of [[70, 108, 8], [44, 108, 6], [60, 84, 12]] as [number, number, number][]) {
    for (let k = 0; k < len; k++) paint(p, sx + rc + (k % 3 === 0 ? 1 : 0), sy + k, E[(k & 3) === 0 ? 5 : 3]);
  }
  for (let k = 0; k < 12; k++) paint(p, 44 + k + rc, 82 + ((k * 7) % 3), E[2]);
  // cape hem embers
  for (let k = 0; k < 18; k++) {
    const x = 6 + Math.floor(rng() * 36) + rc, y = 100 + Math.floor(rng() * 27);
    if (aOf(p.get(x, y)) && !aOf(p.get(x, y + 1))) p.set(x, y, E[rng() < 0.5 ? 4 : 3]);
  }
  // eye slit
  if (pose === 'hurt') { for (let k = 0; k < 5; k++) p.set(hx + 2 + k, hy + 1, E[1]); }
  else {
    for (let k = 0; k < 6; k++) p.set(hx + 2 + k, hy + (k > 3 ? 1 : 0), k < 2 ? E[5] : E[7]);
    glow(p, hx + 5, hy, 6, E[5], 0.8, true);
  }
  // burning crown: layered flame tongues streaming up and back
  const hot = raise ? 1.25 : 1;
  const tongues = raise ? 9 : 7;
  for (let layer = 0; layer < 3; layer++) {
    const rmp = layer === 0 ? FL.slice(0, 5) : layer === 1 ? FL.slice(1, 7) : FL.slice(3);
    for (let k = 0; k < tongues; k++) {
      const bx = hx - 7 + k * (14 / (tongues - 1)) + (rng() - 0.5) * 2;
      const by = hy - 6 + Math.abs(k - tongues / 2) * 0.6;
      const h = (raise ? 22 : 15) * (1 - layer * 0.28) * (0.7 + rng() * 0.6) * (1 + (fl ? 0.12 * Math.sin(k * 2.1) : -0.08 * Math.cos(k * 1.7)));
      tongue(p, bx, by, h, 3.4 - layer * 0.9, -8 - rng() * 6 + (raise ? 5 : 0), rmp, hot);
    }
  }
  glow(p, hx - 2, hy - 14, 18, FL[3], 0.5, true);
  // flames in the raised hands
  if (raise) {
    for (const [fx, fy] of [[87 + rc, 13], [37 + rc, 13]]) {
      for (let k = 0; k < 4; k++) tongue(p, fx - 4 + k * 2.7, fy + 2, 10 + (k & 1) * 4, 2.4, -2 + k, FL.slice(2), 1.2);
      glow(p, fx, fy - 3, 12, FL[4], 0.9, true);
    }
  }
  return p;
}

function heraldSword(): Px {
  const p = new Px(96, 14);
  const O = BOSS.obsidian, E = BOSS.ember, FL = BOSS.flame;
  // flames licking along the upper edge (behind the blade)
  const rng = mulberry32(5);
  for (let x = 20; x < 88; x += 3 + Math.floor(rng() * 3)) tongue(p, x, 4, 3 + rng() * 3.5, 1.5, -3, FL.slice(1, 6), 0.9);
  for (let x = 16; x < 95; x++) {
    const t = (x - 16) / 79;
    const hw = 3.6 * (1 - Math.pow(t, 1.6)) + 0.4;
    const y0 = Math.round(7 - hw), y1 = Math.round(7 + hw);
    for (let y = y0; y <= y1; y++) {
      let c: Color;
      if (y === y0) c = E[6];
      else if (y === y1) c = E[3];
      else if (y === y0 + 1) c = O[6];
      else if (y === 7) c = (x % 9 < 6 && t < 0.85) ? E[4] : O[3];
      else c = y < 7 ? O[4] : O[2];
      p.set(x, y, c);
    }
  }
  p.set(95, 7, E[7]);
  // crossguard
  for (let y = 1; y < 13; y++) for (let x = 12; x < 16; x++) p.set(x, y, x === 12 ? O[6] : x === 15 ? O[1] : y < 7 ? O[4] : O[3]);
  p.set(13, 0, O[5]); p.set(14, 0, O[3]); p.set(13, 13, O[3]); p.set(14, 13, O[1]);
  p.set(13, 6, E[5]); p.set(14, 7, E[7]); p.set(13, 7, E[6]); p.set(14, 6, E[4]);
  // grip
  for (let x = 3; x < 12; x++) for (let y = 5; y < 10; y++) p.set(x, y, (x + y) % 3 === 0 ? BOSS.cloth[1] : y < 7 ? BOSS.cloth[4] : BOSS.cloth[2]);
  // pommel gem
  for (let y = 4; y < 11; y++) for (let x = 0; x < 4; x++) {
    const u = (x - 1.5) / 2.2, v = (y - 7) / 3.2;
    if (u * u + v * v <= 1) p.set(x, y, u + v < -0.3 ? E[7] : u + v < 0.4 ? E[5] : E[3]);
  }
  // runes etched along the fuller
  rune(p, RUNES3[3], 30, 6, E[6]);
  rune(p, RUNES3[1], 46, 6, E[6]);
  p.outline((c) => mix(adj(c, -0.35, 0.1), hex('#0a0408'), 0.4), false);
  return p;
}

function heraldFireball(f: number): Px {
  const p = new Px(14, 14);
  const FL = BOSS.flame;
  const a0 = (f / 4) * (TAU / 5);
  // flame tongues around the core
  for (let k = 0; k < 5; k++) {
    const a = a0 + (k / 5) * TAU;
    for (let r = 3; r < 6.8; r += 0.5) {
      const w = (6.8 - r) * 0.5;
      for (let s = -w; s <= w; s += 0.5) {
        const aa = a + s / r + (r - 3) * 0.18;
        p.set(Math.round(6.5 + Math.cos(aa) * r), Math.round(6.5 + Math.sin(aa) * r), FL[r > 5.5 ? 1 : r > 4.5 ? 2 : 3]);
      }
    }
  }
  for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
    const d = Math.sqrt((x - 6.5) ** 2 + (y - 6.5) ** 2);
    if (d < 2.2) p.set(x, y, FL[7]);
    else if (d < 3.4) p.set(x, y, FL[6]);
    else if (d < 4.4) p.set(x, y, FL[5]);
  }
  p.set(5, 5, hex('#ffffff'));
  p.outline((c) => adj(c, -0.25, 0), false);
  return p;
}

// ======================================================================= library

/** shift a frame horizontally (hurt recoil), keeping its size */
function recoil(p: Px, dx: number): Px {
  const q = new Px(p.w, p.h);
  q.blit(p, dx, 0);
  return q;
}

/** Build all boss sprites (see the Bosses table in docs/ART_SPEC.md). */
export function buildBossSprites(): SpriteLib {
  const pale = hex('#fff4f0');
  const idle0 = wyrmHead(0, 0, 0, 0), idle1 = wyrmHead(0, -0.03, 1, 0);
  const j0 = jotunn('idle0');
  const h0 = herald('idle0');
  return {
    'wyrm.head.idle': anim([idle0, idle1], 24, 20),
    'wyrm.head.open': anim([wyrmHead(0.55, -0.12, 0, 0.6), wyrmHead(0.64, -0.15, 1, 1)], 24, 20),
    'wyrm.head.hurt': anim([flash(wyrmHead(0.15, 0.08, 0, 0, true), pale)], 24, 20),
    'wyrm.body': anim([wyrmBody()], 14, 14),
    'wyrm.tail': anim([wyrmTail()], 10, 10),
    'wyrm.venom': anim([0, 1, 2, 3].map(wyrmVenom), 5, 5),
    'jotunn.body.idle': anim([j0, jotunn('idle1')], 64, 111),
    'jotunn.body.inhale': anim([jotunn('inhale')], 64, 111),
    'jotunn.body.slam': anim([jotunn('slam')], 64, 111),
    'jotunn.body.hurt': anim([recoil(flash(j0, pale), -3)], 64, 111),
    'jotunn.fist': anim([jotFist()], 18, 29),
    'jotunn.icicle': anim([jotIcicle()], 4, 19),
    'herald.body.idle': anim([h0, herald('idle1')], 56, 127),
    'herald.body.raise': anim([herald('raise')], 56, 127),
    'herald.body.hurt': anim([recoil(flash(h0, pale), -3)], 56, 127),
    'herald.sword': anim([heraldSword()], 6, 7),
    'herald.fireball': anim([0, 1, 2, 3].map(heraldFireball), 7, 7),
  };
}
