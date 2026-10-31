// Sound effects: each is a small offline DSP recipe rendered to a mono buffer on first use.
// Distinct timbres + pitch ranges per family so simultaneous sounds stay legible:
//   UI = clean sines/chimes up high, skills = wood/earth/threads mid, hazards = noise/low,
//   boss = heavy/distorted low, magic = chimes/FM shimmer.

import {
  SR, Biquad, OnePole, Rot, additive, blep, fadeEdges, ksPluck, makeAudioBuffer, mulberry32, normalize, samples, softClip,
  type FilterType,
} from './dsp';
import type { SfxId } from './types';

type B = Float32Array;
type Fn = (t: number) => number;
type Wave = 'sine' | 'tri' | 'saw' | 'square';

const fnOf = (v: number | Fn): Fn => (typeof v === 'number' ? () => v : v);

// ---- envelopes & curves ---------------------------------------------------------------------
const ad = (a: number, tau: number): Fn => (t) => (t < a ? t / a : Math.exp(-(t - a) / tau));
const ar = (a: number, hold: number, r: number): Fn => (t) => (t < a ? t / a : t < a + hold ? 1 : Math.max(0, 1 - (t - a - hold) / r));
const swell = (dur: number, peak: number): Fn => (t) => (t < peak ? (t / peak) ** 2 : Math.max(0, 1 - (t - peak) / (dur - peak)) ** 1.5);
const sweep = (f0: number, f1: number, d: number): Fn => (t) => f0 * Math.pow(f1 / f0, Math.min(1, t / d));
const mul = (a: Fn, b: Fn): Fn => (t) => a(t) * b(t);
const am = (rate: number, depth: number, phase = 0): Fn => (t) => 1 - depth + depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * rate * t + phase));

// ---- generators -----------------------------------------------------------------------------
function tone(dur: number, f: number | Fn, type: Wave, env: Fn, vib?: [number, number]): B {
  const n = samples(dur);
  const out = new Float32Array(n);
  const ff = fnOf(f);
  const lfo = vib ? new Rot(vib[0]) : null;
  const vd = vib ? vib[1] : 0;
  let ph = 0;
  // frequency and envelope are evaluated at control rate (every 8 samples) and interpolated
  let fr = 0, e = 0, dfr = 0, de = 0, fr1 = ff(0), e1 = env(0);
  for (let i = 0; i < n; i++) {
    if ((i & 7) === 0) {
      const t1 = (i + 8) / SR;
      fr = fr1; e = e1; fr1 = ff(t1); e1 = env(t1);
      dfr = (fr1 - fr) / 8; de = (e1 - e) / 8;
    }
    const fx = lfo ? fr * (1 + vd * lfo.next()) : fr;
    const dt = fx / SR;
    let v: number;
    if (type === 'sine') v = Math.sin(2 * Math.PI * ph);
    else if (type === 'tri') v = 1 - 4 * Math.abs(((ph + 0.25) % 1) - 0.5);
    else if (type === 'saw') v = 2 * ph - 1 - blep(ph, dt);
    else {
      let p2 = ph + 0.5; if (p2 >= 1) p2 -= 1;
      v = 0.5 * ((2 * ph - 1 - blep(ph, dt)) - (2 * p2 - 1 - blep(p2, dt)));
    }
    out[i] = v * e;
    fr += dfr; e += de;
    ph += dt; if (ph >= 1) ph -= 1;
  }
  return out;
}

interface NzOpts { type?: FilterType; f?: number | Fn; q?: number; env: Fn; seed?: number; brown?: boolean; grains?: number }
function nz(dur: number, o: NzOpts): B {
  const n = samples(dur);
  const out = new Float32Array(n);
  const r = mulberry32(o.seed ?? 1);
  const ff = o.f !== undefined ? fnOf(o.f) : null;
  const flt = new Biquad();
  let br = 0;
  const gp = o.grains ? o.grains / SR : 0;
  const gAmp = o.grains ? 0.2 / Math.sqrt(gp) : 0;
  let e = 0, de = 0, e1 = o.env(0);
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      const t1 = (i + 16) / SR;
      if (ff) flt.set(o.type ?? 'lp', ff(i / SR), o.q ?? 0.7);
      e = e1; e1 = o.env(t1); de = (e1 - e) / 16;
    }
    let w = r() * 2 - 1;
    if (o.brown) { br = (br + w * 0.12) * 0.985; w = br * 3; }
    if (gp) w *= r() < gp ? gAmp : 0.15;
    out[i] = (ff ? flt.run(w) : w) * e;
    e += de;
  }
  return out;
}

function fm(dur: number, fc: number | Fn, ratio: number, index: number | Fn, env: Fn): B {
  const n = samples(dur);
  const out = new Float32Array(n);
  const fcf = fnOf(fc), ix = fnOf(index);
  let pc = 0, pm = 0, f = 0, x = 0, e = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 7) === 0) { const t = i / SR; f = fcf(t); x = ix(t); e = env(t); }
    out[i] = Math.sin(2 * Math.PI * pc + x * Math.sin(2 * Math.PI * pm)) * e;
    pc += f / SR; pm += (f * ratio) / SR;
    if (pc > 1) pc -= 1;
    if (pm > 1) pm -= 1;
  }
  return out;
}

const chime = (f: number, dur: number, decay = 0.5, bright = 1): B => additive(f, dur, [
  { r: 1, a: 1, d: decay }, { r: 2, a: 0.32 * bright, d: decay * 0.5 }, { r: 3, a: 0.16 * bright, d: decay * 0.33 },
  { r: 4.2, a: 0.12 * bright, d: decay * 0.2 }, { r: 5.4, a: 0.06 * bright, d: decay * 0.12 },
], 0.001);

const pluck = (f: number, dur: number, decay = 0.5, bright = 0.6, seed = 5): B => ksPluck(f, dur, { decay, bright, seed, soft: 0.3 });

function modal(dur: number, f: number, ratios: number[], decays: number[], amps?: number[]): B {
  return additive(f, dur, ratios.map((r, i) => ({ r, a: amps ? amps[i] : 1 / (i + 1), d: decays[i] })), 0.0005);
}

// ---- combinators ----------------------------------------------------------------------------
type Part = [B, number, number?]; // buffer, offset (s), gain
function mix(dur: number, ...parts: Part[]): B {
  const out = new Float32Array(samples(dur));
  for (const [b, off, g = 1] of parts) {
    const o = Math.round(off * SR);
    const end = Math.min(out.length, o + b.length);
    for (let i = Math.max(0, o); i < end; i++) out[i] += b[i - o] * g;
  }
  return out;
}

function filt(b: B, type: FilterType, f: number, q = 0.707): B {
  const fl = new Biquad(type, f, q);
  for (let i = 0; i < b.length; i++) b[i] = fl.run(b[i]);
  return b;
}

const fin = (b: B, peak = 0.9): B => fadeEdges(normalize(b, peak), 0.0008, 0.02);

function cracks(dur: number, count: number, span: number, seed: number, f = 2200): B {
  const r = mulberry32(seed);
  const parts: Part[] = [];
  for (let i = 0; i < count; i++) {
    const at = r() * span;
    parts.push([nz(0.03, { type: 'hp', f: f * (0.7 + r() * 0.8), env: ad(0.0003, 0.004 + r() * 0.006), seed: seed + i }), at, 0.5 + r() * 0.5]);
  }
  return mix(dur, ...parts);
}

function bubbles(dur: number, count: number, span: number, seed: number, f0: number, f1: number): B {
  const r = mulberry32(seed);
  const parts: Part[] = [];
  for (let i = 0; i < count; i++) {
    const f = f0 + r() * (f1 - f0);
    parts.push([tone(0.06, sweep(f, f * 2.2, 0.045), 'sine', ad(0.002, 0.025)), r() * span, 0.5 + r() * 0.5]);
  }
  return mix(dur, ...parts);
}

function boom(dur: number, seed: number, size = 1): B {
  return mix(dur,
    [tone(dur, sweep(78, 32, 0.5 * size), 'sine', ad(0.002, 0.32 * size)), 0, 1],
    [nz(dur, { type: 'lp', f: sweep(3200, 180, 0.6 * size), q: 0.8, env: ad(0.002, 0.22 * size), seed, brown: false }), 0, 0.9],
    [nz(dur, { type: 'hp', f: 1500, env: ad(0.01, 0.35 * size), seed: seed + 1, grains: 220 }), 0.01, 0.35],
  );
}

// ---- voice: formant gibberish ----------------------------------------------------------------
// A small creature's voice: a buzzing glottal source (band-limited saw, softened) mixed with breath
// noise, shaped by three moving formant bandpasses. The vowels only suggest words; nothing is spoken.

/** [F1, F2, F3, A1, A2, A3]: adult formant targets (Hz) and gains, scaled up by TRACT for a tiny throat */
type Vowel = readonly [number, number, number, number, number, number];
const VOWEL = {
  uh: [640, 1190, 2390, 1, 0.6, 0.3],
  o: [500, 850, 2400, 1, 0.55, 0.2],
  u: [320, 700, 2250, 1, 0.35, 0.1],
  i: [290, 2250, 3000, 0.8, 0.6, 0.4],
  e: [480, 1900, 2500, 1, 0.65, 0.3],
  ae: [680, 1700, 2450, 1, 0.65, 0.3],
  m: [260, 1800, 2700, 1, 0.1, 0.04], // a hum through the nose: nearly all F1
} satisfies Record<string, Vowel>;
const TRACT = 1.3;
const FORMANT_BW = [90, 120, 180];

/** piecewise-linear curve through [t, v] points, held flat outside them */
const curve = (pts: [number, number][]): Fn => (t) => {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, v1] = pts[i];
    if (t <= t1) { const [t0, v0] = pts[i - 1]; return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-9, t1 - t0); }
  }
  return pts[pts.length - 1][1];
};

/** a glide through [t, vowel] key points */
const vowels = (pts: [number, Vowel][]): ((t: number) => number[]) => {
  const ch = [0, 1, 2, 3, 4, 5].map((k) => curve(pts.map(([t, v]): [number, number] => [t, v[k]])));
  return (t) => ch.map((c) => c(t));
};

interface VoxOpts { f0: Fn; shape: (t: number) => number[]; amp: Fn; breath?: Fn; vib?: [number, number]; seed?: number }
function vox(dur: number, o: VoxOpts): B {
  const n = samples(dur);
  const out = new Float32Array(n);
  const r = mulberry32(o.seed ?? 7);
  const tilt = new OnePole(2600);
  const fl = [new Biquad(), new Biquad(), new Biquad()];
  const [vr, vd] = o.vib ?? [5.5, 0.015];
  let ph = 0, f0 = 0, amp = 0, br = 0, g = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      const t = i / SR;
      f0 = o.f0(t) * (1 + vd * Math.sin(2 * Math.PI * vr * t));
      amp = o.amp(t);
      br = o.breath ? o.breath(t) : 0.05;
      const s = o.shape(t);
      for (let k = 0; k < 3; k++) fl[k].set('bp', s[k] * TRACT, s[k] / FORMANT_BW[k]);
      g = [s[3], s[4], s[5]];
    }
    const dt = f0 / SR;
    const buzz = tilt.run(2 * ph - 1 - blep(ph, dt));
    ph += dt; if (ph >= 1) ph -= 1;
    const x = buzz * (1 - br) + (r() * 2 - 1) * br * 1.6;
    out[i] = (fl[0].run(x) * g[0] + fl[1].run(x) * g[1] + fl[2].run(x) * g[2]) * amp;
  }
  return filt(out, 'hp', 160);
}

// ---- table ----------------------------------------------------------------------------------
export interface SfxDef {
  make: () => B;
  gain: number;
  gap?: number; // min seconds between triggers
  voices?: number; // max simultaneous voices of this id
  jitter?: number; // random pitch variation (fraction)
  rev?: number; // reverb send
  bus?: 'voice'; // a Wyrdling bark: the Voices volume and the crowd limit (barks.ts) instead of the SFX bus
}

const C6 = 1046.5, E6 = 1318.5, G6 = 1568, C7 = 2093, D6 = 1174.7, A6 = 1760, D7 = 2349.3;

export const SFX: Record<SfxId, SfxDef> = {
  ui_click: { gain: 0.3, gap: 0.03, make: () => fin(mix(0.06,
    [tone(0.05, sweep(2100, 1350, 0.025), 'sine', ad(0.0008, 0.011)), 0],
    [nz(0.01, { type: 'hp', f: 5000, env: ad(0.0003, 0.002) }), 0, 0.25])) },
  ui_hover: { gain: 0.12, gap: 0.04, make: () => fin(tone(0.04, 2640, 'sine', ad(0.002, 0.008))) },
  ui_back: { gain: 0.28, gap: 0.05, make: () => fin(mix(0.15,
    [tone(0.06, 880, 'tri', ad(0.002, 0.02)), 0],
    [tone(0.07, 622, 'tri', ad(0.002, 0.025)), 0.06])) },
  ui_deny: { gain: 0.18, gap: 0.12, make: () => fin(filt(mix(0.24,
    [tone(0.08, 196, 'square', ar(0.003, 0.05, 0.02)), 0],
    [tone(0.08, 185, 'square', ar(0.003, 0.05, 0.02)), 0.11]), 'lp', 1200)) },
  select_skill: { gain: 0.36, gap: 0.04, rev: 0.15, make: () => fin(mix(0.5,
    [pluck(880, 0.5, 0.55, 0.6, 3), 0],
    [pluck(1318.5, 0.45, 0.5, 0.6, 4), 0.035, 0.8],
    [chime(1760, 0.4, 0.2), 0.035, 0.12])) },
  assign: { gain: 0.42, gap: 0.03, rev: 0.25, make: () => fin(mix(0.75,
    [tone(0.06, sweep(260, 760, 0.035), 'sine', ad(0.001, 0.028)), 0],
    [nz(0.012, { type: 'bp', f: 2000, q: 1, env: ad(0.0005, 0.004) }), 0, 0.3],
    [chime(G6, 0.6, 0.28), 0.02, 0.32],
    [chime(C7, 0.55, 0.24), 0.06, 0.24],
    [chime(2637, 0.5, 0.2), 0.1, 0.18])) },
  assign_fail: { gain: 0.36, gap: 0.08, make: () => fin(mix(0.3,
    [filt(tone(0.25, sweep(330, 196, 0.2), 'tri', ad(0.003, 0.08)), 'lp', 900), 0],
    [tone(0.1, 120, 'sine', ad(0.001, 0.04)), 0, 0.6])) },
  spawn: { gain: 0.3, gap: 0.05, rev: 0.3, make: () => fin(mix(0.55,
    [nz(0.35, { type: 'bp', f: sweep(500, 2600, 0.3), q: 3, env: swell(0.35, 0.25) }), 0],
    [tone(0.3, sweep(1200, 1800, 0.3), 'sine', mul(ad(0.1, 0.1), () => 0.6)), 0, 0.25],
    [chime(D7, 0.3, 0.15), 0.26, 0.3])) },
  gate_open: { gain: 0.5, gap: 0.3, voices: 2, rev: 0.35, make: () => fin(mix(1.9,
    [tone(1.8, 73.4, 'sine', ar(0.35, 0.6, 0.8), [3, 0.003]), 0, 0.5],
    [tone(1.8, 110, 'sine', ar(0.35, 0.6, 0.8)), 0, 0.35],
    [tone(1.8, 146.8, 'tri', ar(0.4, 0.5, 0.8)), 0, 0.18],
    [nz(1.6, { type: 'lp', f: 400, env: swell(1.6, 0.5), seed: 3, brown: true }), 0, 0.3],
    [chime(D6, 1.0, 0.5), 0.3, 0.22], [chime(A6, 1.0, 0.5), 0.45, 0.2], [chime(D7, 1.0, 0.5), 0.6, 0.18])) },
  saved: { gain: 0.4, gap: 0.04, voices: 6, rev: 0.25, make: () => fin(mix(0.9,
    [chime(C6, 0.9, 0.45), 0],
    [chime(G6, 0.85, 0.4), 0.05, 0.6],
    [tone(0.3, 3136, 'sine', ad(0.002, 0.08)), 0.08, 0.1])) },
  quota_met: { gain: 0.48, gap: 0.5, voices: 1, rev: 0.3, make: () => fin(mix(1.5,
    [chime(C6, 1.0, 0.55), 0, 0.7], [chime(E6, 1.0, 0.55), 0.08, 0.65],
    [chime(G6, 1.0, 0.55), 0.16, 0.6], [chime(C7, 1.2, 0.7), 0.24, 0.8],
    [nz(1.2, { type: 'hp', f: 6500, env: swell(1.2, 0.3), seed: 9 }), 0.1, 0.05])) },
  death_unravel: { gain: 0.3, gap: 0.04, voices: 4, rev: 0.25, make: () => fin(mix(0.85,
    [tone(0.8, sweep(880, 330, 0.7), 'sine', mul(ar(0.01, 0.3, 0.45), am(22, 0.3))), 0],
    [nz(0.6, { type: 'bp', f: sweep(2400, 800, 0.6), q: 2, env: ad(0.02, 0.2), seed: 4 }), 0, 0.12],
    [pluck(660, 0.3, 0.25, 0.5, 8), 0, 0.3])) },
  death_burn: { gain: 0.32, gap: 0.04, voices: 4, make: () => fin(mix(0.65,
    [nz(0.6, { type: 'bp', f: sweep(3000, 700, 0.4), q: 1, env: ad(0.005, 0.15), seed: 5 }), 0, 0.6],
    [tone(0.2, sweep(170, 60, 0.12), 'sine', ad(0.002, 0.07)), 0, 0.6],
    [nz(0.5, { type: 'hp', f: 2000, env: ad(0.01, 0.15), seed: 6, grains: 120 }), 0.02, 0.3])) },
  death_drown: { gain: 0.34, gap: 0.04, voices: 4, make: () => fin(filt(mix(0.7,
    [bubbles(0.7, 7, 0.5, 21, 280, 620), 0],
    [nz(0.4, { type: 'lp', f: 500, env: ad(0.01, 0.12), seed: 7 }), 0, 0.3]), 'lp', 2200)) },
  splat_warn: { gain: 0.28, gap: 0.2, make: () => fin(mix(0.3,
    [tone(0.1, 1046.5, 'tri', ad(0.004, 0.04)), 0],
    [tone(0.15, 880, 'tri', ad(0.004, 0.06)), 0.11])) },
  dig: { gain: 0.26, gap: 0.06, voices: 4, jitter: 0.08, make: () => fin(mix(0.13,
    [nz(0.1, { type: 'bp', f: 800, q: 1.2, env: ad(0.002, 0.028), seed: 11 }), 0],
    [tone(0.08, sweep(130, 80, 0.05), 'sine', ad(0.001, 0.028)), 0, 0.5],
    [nz(0.03, { type: 'hp', f: 3000, env: ad(0.001, 0.008), seed: 12 }), 0, 0.2])) },
  bash: { gain: 0.28, gap: 0.06, voices: 4, jitter: 0.06, make: () => fin(mix(0.17,
    [tone(0.12, sweep(110, 60, 0.06), 'sine', ad(0.001, 0.045)), 0, 0.8],
    [nz(0.15, { type: 'bp', f: 550, q: 0.9, env: ad(0.002, 0.045), seed: 13 }), 0, 0.7],
    [nz(0.04, { type: 'hp', f: 2500, env: ad(0.001, 0.012), seed: 14 }), 0, 0.25])) },
  mine: { gain: 0.22, gap: 0.06, voices: 4, jitter: 0.05, make: () => fin(mix(0.18,
    [modal(0.15, 2300, [1, 1.47, 2.09], [0.05, 0.035, 0.025]), 0],
    [nz(0.08, { type: 'bp', f: 1200, q: 1, env: ad(0.002, 0.025), seed: 15 }), 0, 0.5])) },
  plank: { gain: 0.28, gap: 0.06, voices: 4, jitter: 0.03, make: () => fin(mix(0.26,
    [modal(0.1, 820, [1, 1.51], [0.025, 0.018], [0.6, 0.3]), 0],
    [pluck(659.3, 0.25, 0.3, 0.5, 16), 0.004, 0.5])) },
  plank_warn: { gain: 0.34, gap: 0.2, make: () => fin(mix(0.4,
    [pluck(659.3, 0.3, 0.3, 0.55, 17), 0],
    [pluck(493.9, 0.3, 0.3, 0.55, 18), 0.11, 0.9],
    [modal(0.06, 2500, [1], [0.012]), 0.22, 0.2])) },
  shrug: { gain: 0.28, gap: 0.2, make: () => {
    const v = mix(0.32,
      [tone(0.13, sweep(220, 252, 0.12), 'saw', ar(0.01, 0.09, 0.03)), 0],
      [tone(0.16, sweep(252, 205, 0.15), 'saw', ar(0.01, 0.11, 0.04)), 0.14]);
    const a = filt(v.slice(), 'bp', 620, 2.5), b = filt(v.slice(), 'bp', 1050, 3);
    for (let i = 0; i < v.length; i++) v[i] = a[i] + b[i] * 0.6;
    return fin(v);
  } },
  climb: { gain: 0.16, gap: 0.08, voices: 3, jitter: 0.1, make: () => fin(mix(0.12,
    [nz(0.02, { type: 'hp', f: 2500, env: ad(0.001, 0.007), seed: 21 }), 0, 0.8],
    [nz(0.02, { type: 'hp', f: 2800, env: ad(0.001, 0.006), seed: 22 }), 0.035, 0.6],
    [nz(0.02, { type: 'hp', f: 2300, env: ad(0.001, 0.007), seed: 23 }), 0.07, 0.7])) },
  glide_open: { gain: 0.28, gap: 0.08, voices: 3, make: () => fin(mix(0.45,
    [nz(0.35, { type: 'bp', f: 1300, q: 0.8, env: mul(ad(0.01, 0.12), am(28, 0.6)), seed: 24 }), 0],
    [nz(0.45, { type: 'bp', f: sweep(400, 1200, 0.3), q: 1.2, env: swell(0.45, 0.15), seed: 25 }), 0, 0.4])) },
  leap: { gain: 0.28, gap: 0.06, voices: 3, make: () => fin(mix(0.3,
    [tone(0.2, sweep(280, 840, 0.12), 'sine', ad(0.003, 0.07)), 0, 0.6],
    [nz(0.2, { type: 'bp', f: sweep(600, 2000, 0.15), q: 1.5, env: ad(0.01, 0.06), seed: 26 }), 0, 0.4])) },
  land: { gain: 0.28, gap: 0.05, voices: 4, jitter: 0.06, make: () => fin(mix(0.14,
    [tone(0.12, sweep(150, 70, 0.05), 'sine', ad(0.001, 0.035)), 0],
    [nz(0.05, { type: 'lp', f: 900, env: ad(0.001, 0.018), seed: 27 }), 0, 0.5])) },
  rune_plant: { gain: 0.34, gap: 0.06, voices: 3, rev: 0.25, make: () => fin(mix(0.6,
    [tone(0.12, sweep(180, 90, 0.06), 'sine', ad(0.001, 0.045)), 0],
    [fm(0.55, 330, 2, (t) => 2 * Math.exp(-t / 0.15) + 0.3, ar(0.02, 0.15, 0.35)), 0.01, 0.4],
    [chime(1318.5, 0.4, 0.2), 0.04, 0.15])) },
  rune_tick: { gain: 0.3, gap: 0.05, voices: 3, make: () => fin(mix(0.09,
    [modal(0.06, 2500, [1, 1.52], [0.012, 0.008], [1, 0.5]), 0],
    [tone(0.06, 1250, 'sine', ad(0.001, 0.025)), 0, 0.3])) },
  blast: { gain: 0.75, gap: 0.04, voices: 3, rev: 0.2, make: () => fin(filt(softClip(boom(1.6, 31), 1.8), 'lp', 6500), 0.95) },
  boulder_roll: { gain: 0.38, gap: 0.12, voices: 2, jitter: 0.05, make: () => fin(mix(0.5,
    [nz(0.5, { type: 'lp', f: 220, env: mul(ar(0.06, 0.3, 0.14), am(9, 0.4)), seed: 32, brown: true }), 0],
    [tone(0.08, 62, 'sine', ad(0.002, 0.03)), 0.12, 0.3], [tone(0.08, 55, 'sine', ad(0.002, 0.03)), 0.31, 0.25])) },
  boulder_impact: { gain: 0.55, gap: 0.05, voices: 3, make: () => fin(softClip(mix(0.6,
    [tone(0.5, sweep(95, 42, 0.15), 'sine', ad(0.001, 0.14)), 0],
    [nz(0.3, { type: 'lp', f: 900, env: ad(0.001, 0.055), seed: 33 }), 0, 0.7],
    [nz(0.03, { type: 'bp', f: 2500, env: ad(0.0005, 0.008), seed: 34 }), 0, 0.3]), 1.3)) },
  stone_harden: { gain: 0.38, gap: 0.1, voices: 2, make: () => fin(mix(0.8,
    [nz(0.75, { type: 'bp', f: sweep(6000, 2500, 0.6), q: 0.9, env: ad(0.01, 0.25), seed: 35 }), 0, 0.5],
    [nz(0.05, { type: 'bp', f: 1800, q: 1.2, env: ad(0.0005, 0.018), seed: 36 }), 0.05, 0.6],
    [tone(0.15, sweep(120, 70, 0.08), 'sine', ad(0.001, 0.05)), 0.05, 0.5])) },
  plate_on: { gain: 0.3, gap: 0.05, make: () => fin(mix(0.12,
    [tone(0.1, sweep(220, 160, 0.04), 'sine', ad(0.001, 0.03)), 0, 0.7],
    [nz(0.02, { type: 'bp', f: 1600, q: 1.2, env: ad(0.0005, 0.006), seed: 37 }), 0, 0.6],
    [tone(0.06, 880, 'sine', ad(0.001, 0.02)), 0, 0.15])) },
  plate_off: { gain: 0.24, gap: 0.05, make: () => fin(mix(0.1,
    [tone(0.08, sweep(330, 260, 0.03), 'sine', ad(0.001, 0.02)), 0, 0.5],
    [nz(0.02, { type: 'bp', f: 2400, q: 1.2, env: ad(0.0005, 0.005), seed: 38 }), 0, 0.4])) },
  gate_move: { gain: 0.42, gap: 0.15, voices: 2, make: () => fin(mix(0.7,
    [nz(0.7, { type: 'bp', f: 260, q: 1.5, env: mul(ar(0.05, 0.45, 0.2), (t) => 0.6 + 0.25 * Math.sin(2 * Math.PI * 13 * t) + 0.15 * Math.sin(2 * Math.PI * 7.3 * t)), seed: 39 }), 0],
    [nz(0.7, { type: 'lp', f: 120, env: ar(0.05, 0.45, 0.2), seed: 40, brown: true }), 0, 0.6],
    [nz(0.7, { type: 'bp', f: 1500, q: 2, env: ar(0.05, 0.45, 0.2), seed: 41, grains: 150 }), 0, 0.2])) },
  sand_pour: { gain: 0.4, gap: 0.15, voices: 2, make: () => fin(mix(0.7,
    [nz(0.7, { type: 'hp', f: 1800, env: swell(0.7, 0.2), seed: 42, grains: 400 }), 0],
    [nz(0.7, { type: 'lp', f: 600, env: swell(0.7, 0.25), seed: 43 }), 0, 0.3])) },
  brittle_crack: { gain: 0.5, gap: 0.05, voices: 3, make: () => fin(mix(0.2,
    [nz(0.02, { type: 'hp', f: 2000, env: ad(0.0003, 0.007), seed: 44 }), 0],
    [modal(0.08, 1700, [1, 1.53], [0.03, 0.02]), 0, 0.3],
    [nz(0.02, { type: 'hp', f: 2600, env: ad(0.0003, 0.005), seed: 45 }), 0.03, 0.5])) },
  brittle_break: { gain: 0.44, gap: 0.1, voices: 2, make: () => fin(mix(0.7,
    [cracks(0.4, 6, 0.25, 46), 0],
    [nz(0.6, { type: 'bp', f: 900, q: 0.8, env: ad(0.01, 0.15), seed: 47 }), 0, 0.5],
    [tone(0.2, sweep(110, 60, 0.1), 'sine', ad(0.001, 0.06)), 0.04, 0.6])) },
  spindle: { gain: 0.44, gap: 0.3, voices: 1, rev: 0.35, make: () => {
    const notes = [D6, E6 * 1.0, 1480, A6, 1975.5, D7, 2637];
    const parts: Part[] = notes.map((f, i) => [chime(f, 0.6, 0.35), i * 0.045, 0.5]);
    parts.push([chime(D7, 1.0, 0.7), notes.length * 0.045, 0.7]);
    parts.push([nz(1.1, { type: 'hp', f: 7000, env: swell(1.1, 0.4), seed: 48 }), 0, 0.05]);
    return fin(mix(1.3, ...parts));
  } },
  vent: { gain: 0.28, gap: 0.2, voices: 2, make: () => fin(mix(0.8,
    [nz(0.8, { type: 'bp', f: sweep(300, 1400, 0.6), q: 1.2, env: swell(0.8, 0.35), seed: 49 }), 0],
    [nz(0.8, { type: 'lp', f: 200, env: swell(0.8, 0.3), seed: 50, brown: true }), 0, 0.3])) },
  boss_roar: { gain: 0.45, gap: 0.5, voices: 2, rev: 0.3, make: () => {
    const src = tone(1.6, sweep(92, 64, 1.3), 'saw', ar(0.12, 0.9, 0.5), [6, 0.05]);
    const a = filt(src.slice(), 'bp', 500, 2), b = filt(src.slice(), 'bp', 900, 3);
    const n = nz(1.6, { type: 'bp', f: 700, q: 1, env: ar(0.1, 0.9, 0.5), seed: 51 });
    const sub = tone(1.6, 46, 'sine', ar(0.15, 0.9, 0.5));
    const out = new Float32Array(src.length);
    for (let i = 0; i < out.length; i++) out[i] = a[i] + b[i] * 0.7 + n[i] * 0.3 + src[i] * 0.1 + sub[i] * 0.4;
    return fin(softClip(out, 2.2));
  } },
  boss_hit: { gain: 0.55, gap: 0.06, voices: 3, rev: 0.2, make: () => fin(softClip(mix(0.8,
    [tone(0.4, sweep(120, 55, 0.1), 'sine', ad(0.001, 0.1)), 0],
    [modal(0.6, 620, [1, 2.4, 3.6], [0.25, 0.15, 0.1]), 0, 0.4],
    [nz(0.15, { type: 'bp', f: 1500, q: 0.8, env: ad(0.001, 0.04), seed: 52 }), 0, 0.6]), 1.4)) },
  boss_telegraph: { gain: 0.3, gap: 0.15, voices: 2, make: () => fin(mix(0.32,
    [filt(tone(0.12, 880, 'square', ar(0.005, 0.09, 0.02)), 'lp', 3000), 0],
    [tone(0.12, 1760, 'sine', ar(0.005, 0.09, 0.02)), 0, 0.2],
    [filt(tone(0.14, 659.3, 'square', ar(0.005, 0.11, 0.02)), 'lp', 3000), 0.15],
    [tone(0.14, 1318.5, 'sine', ar(0.005, 0.11, 0.02)), 0.15, 0.2])) },
  boss_defeat: { gain: 0.6, gap: 1, voices: 1, rev: 0.4, make: () => {
    const src = tone(2.4, sweep(110, 38, 2.0), 'saw', ar(0.05, 1.2, 1.1), [5, 0.04]);
    const a = filt(src.slice(), 'bp', 600, 2);
    const parts: Part[] = [
      [softClip(a, 2), 0, 0.6],
      [nz(2.4, { type: 'lp', f: 600, env: swell(2.4, 0.9), seed: 53, brown: true }), 0, 0.5],
      [cracks(1.5, 10, 1.2, 54, 1500), 0.3, 0.4],
      [chime(D6, 1.2, 0.6), 1.6, 0.3], [chime(A6, 1.1, 0.6), 1.75, 0.28], [chime(D7, 1.0, 0.7), 1.9, 0.3],
    ];
    return fin(mix(3.0, ...parts));
  } },
  seidr_beam: { gain: 0.4, gap: 0.1, voices: 2, rev: 0.3, make: () => fin(mix(0.8,
    [fm(0.75, sweep(300, 1600, 0.25), 1.5, (t) => 6 * Math.exp(-t / 0.2) + 1, ar(0.005, 0.35, 0.4)), 0, 0.6],
    [filt(tone(0.7, 110, 'saw', ar(0.01, 0.3, 0.35)), 'lp', 1200), 0, 0.2],
    [chime(A6, 0.6, 0.3), 0.1, 0.2])) },
  venom_spit: { gain: 0.34, gap: 0.08, voices: 3, make: () => fin(mix(0.3,
    [nz(0.08, { type: 'bp', f: 1500, q: 1.5, env: ad(0.002, 0.03), seed: 55 }), 0, 0.8],
    [tone(0.12, sweep(700, 300, 0.08), 'sine', ad(0.002, 0.05)), 0, 0.4],
    [bubbles(0.25, 3, 0.12, 56, 500, 900), 0.03, 0.3])) },
  venom_hit: { gain: 0.6, gap: 0.06, voices: 3, make: () => fin(mix(0.6,
    [nz(0.6, { type: 'hp', f: 2500, env: ad(0.005, 0.18), seed: 57, grains: 300 }), 0],
    [nz(0.15, { type: 'bp', f: 900, q: 2, env: ad(0.002, 0.05), seed: 58 }), 0, 0.3])) },
  burrow: { gain: 0.48, gap: 0.2, voices: 2, make: () => fin(mix(0.9,
    [nz(0.9, { type: 'lp', f: 150, env: mul(ar(0.1, 0.4, 0.35), am(11, 0.3)), seed: 59, brown: true }), 0],
    [nz(0.9, { type: 'bp', f: 700, q: 1, env: ar(0.1, 0.4, 0.35), seed: 60, grains: 200 }), 0, 0.4])) },
  tail_lash: { gain: 0.44, gap: 0.1, voices: 2, make: () => fin(mix(0.36,
    [nz(0.2, { type: 'bp', f: sweep(400, 3500, 0.15), q: 1.4, env: swell(0.2, 0.14), seed: 61 }), 0],
    [nz(0.03, { type: 'hp', f: 2500, env: ad(0.0003, 0.009), seed: 62 }), 0.15, 0.9],
    [tone(0.15, sweep(140, 70, 0.06), 'sine', ad(0.001, 0.04)), 0.15, 0.4])) },
  icicle_fall: { gain: 0.18, gap: 0.08, voices: 3, make: () => fin(mix(0.6,
    [tone(0.6, sweep(3200, 1600, 0.5), 'sine', ar(0.02, 0.3, 0.25)), 0, 0.5],
    [tone(0.6, sweep(4800, 2400, 0.5), 'sine', ar(0.02, 0.3, 0.25)), 0, 0.2],
    [nz(0.6, { type: 'hp', f: 6000, env: ar(0.02, 0.3, 0.25), seed: 63 }), 0, 0.05])) },
  ice_shatter: { gain: 0.36, gap: 0.06, voices: 3, rev: 0.2, make: () => {
    const r = mulberry32(64);
    const parts: Part[] = [];
    for (let i = 0; i < 12; i++) parts.push([modal(0.25, 2500 + r() * 4500, [1, 1.41], [0.05 + r() * 0.15, 0.04]), r() * 0.12, 0.3 + r() * 0.3]);
    parts.push([nz(0.1, { type: 'hp', f: 4000, env: ad(0.001, 0.05), seed: 65 }), 0, 0.7]);
    return fin(mix(0.7, ...parts));
  } },
  freeze: { gain: 0.34, gap: 0.08, voices: 3, rev: 0.25, make: () => fin(mix(0.8,
    [fm(0.7, 2000, 3.5, (t) => 3 * Math.exp(-t / 0.2) + 0.5, ad(0.002, 0.3)), 0, 0.4],
    [nz(0.7, { type: 'hp', f: 5000, env: swell(0.7, 0.3), seed: 66, grains: 500 }), 0, 0.5],
    [tone(0.5, sweep(1200, 2400, 0.4), 'sine', ar(0.05, 0.2, 0.2)), 0, 0.15])) },
  slam: { gain: 0.6, gap: 0.08, voices: 2, rev: 0.25, make: () => fin(softClip(mix(1.2,
    [tone(1.0, sweep(62, 28, 0.4), 'sine', ad(0.002, 0.35)), 0],
    [nz(0.6, { type: 'lp', f: sweep(1500, 150, 0.3), env: ad(0.002, 0.15), seed: 67 }), 0, 0.9],
    [nz(1.1, { type: 'lp', f: 100, env: ar(0.05, 0.4, 0.6), seed: 68, brown: true }), 0, 0.4]), 1.6), 0.95) },
  fire_whoosh: { gain: 0.38, gap: 0.08, voices: 3, make: () => fin(mix(0.7,
    [nz(0.7, { type: 'bp', f: sweep(350, 1300, 0.5), q: 1, env: swell(0.7, 0.3), seed: 69 }), 0, 0.8],
    [nz(0.7, { type: 'hp', f: 2000, env: swell(0.7, 0.35), seed: 70, grains: 150 }), 0, 0.2])) },
  magma: { gain: 0.44, gap: 0.15, voices: 2, make: () => fin(mix(0.9,
    [filt(bubbles(0.9, 5, 0.6, 71, 70, 140), 'lp', 600), 0],
    [nz(0.9, { type: 'lp', f: 120, env: ar(0.1, 0.5, 0.3), seed: 72, brown: true }), 0, 0.4])) },
  meteor: { gain: 0.6, gap: 0.1, voices: 3, rev: 0.25, make: () => fin(mix(1.6,
    [nz(0.62, { type: 'bp', f: sweep(3000, 500, 0.6), q: 4, env: swell(0.62, 0.58), seed: 73 }), 0, 0.5],
    [softClip(boom(1.0, 74, 0.7), 1.5), 0.6, 0.9]), 0.95) },
  rewind_start: { gain: 0.3, gap: 0.15, voices: 1, make: () => {
    const s = tone(0.4, sweep(900, 120, 0.35), 'saw', ar(0.01, 0.25, 0.1));
    const fl = new Biquad();
    for (let i = 0; i < s.length; i++) { if ((i & 15) === 0) fl.set('lp', 4000 * Math.pow(0.15, Math.min(1, i / SR / 0.35)), 1.5); s[i] = fl.run(s[i]); }
    return fin(mix(0.42, [s, 0], [nz(0.35, { type: 'bp', f: sweep(3000, 400, 0.35), q: 2, env: ar(0.01, 0.2, 0.1), seed: 75 }), 0, 0.2]));
  } },
  rewind_end: { gain: 0.28, gap: 0.15, voices: 1, make: () => fin(mix(0.25,
    [filt(tone(0.2, sweep(150, 800, 0.15), 'saw', ad(0.005, 0.06)), 'lp', 2500), 0],
    [modal(0.04, 2000, [1], [0.008]), 0.15, 0.5])) },
  foresight: { gain: 0.3, gap: 0.2, voices: 1, rev: 0.4, make: () => {
    const sw = swell(0.9, 0.3);
    const parts: Part[] = [A6, 2637, 1975.5].map((f, i): Part => {
      const b = additive(f, 0.9, [{ r: 1, a: 1, d: 0.5 }, { r: 2, a: 0.2, d: 0.2 }]);
      for (let j = 0; j < b.length; j++) b[j] *= sw(j / SR);
      return [b, i * 0.05, 0.35];
    });
    parts.push([nz(0.9, { type: 'hp', f: sweep(3000, 8000, 0.6), env: sw, seed: 76 }), 0, 0.06]);
    parts.push([tone(0.9, sweep(880, 1320, 0.6), 'sine', sw), 0, 0.15]);
    return fin(mix(0.95, ...parts));
  } },
  pause: { gain: 0.28, gap: 0.1, make: () => fin(mix(0.32, [chime(659.3, 0.3, 0.12), 0], [chime(493.9, 0.25, 0.12), 0.08])) },
  unpause: { gain: 0.28, gap: 0.1, make: () => fin(mix(0.32, [chime(493.9, 0.3, 0.12), 0], [chime(659.3, 0.25, 0.12), 0.08])) },
  star: { gain: 0.44, gap: 0.15, voices: 3, rev: 0.3, make: () => fin(mix(1.0,
    [chime(A6, 1.0, 0.55), 0],
    [chime(2637, 0.9, 0.45), 0.06, 0.5],
    [tone(0.3, 3520, 'sine', ad(0.002, 0.08)), 0.1, 0.12],
    [tone(0.3, 4186, 'sine', ad(0.002, 0.06)), 0.16, 0.08])) },
  purchase: { gain: 0.4, gap: 0.1, voices: 2, rev: 0.2, make: () => fin(mix(0.6,
    [chime(987.8, 0.5, 0.3), 0],
    [chime(1318.5, 0.5, 0.35), 0.07, 0.9],
    [nz(0.25, { type: 'hp', f: 6000, env: ad(0.002, 0.05), seed: 77, grains: 300 }), 0.02, 0.15])) },
  level_start: { gain: 0.42, gap: 0.5, voices: 1, rev: 0.35, make: () => fin(mix(1.3,
    [filt(tone(0.4, 293.7, 'tri', ar(0.03, 0.25, 0.1), [5, 0.004]), 'lp', 1800), 0, 0.6],
    [filt(tone(0.9, 440, 'tri', ar(0.04, 0.5, 0.35), [5, 0.005]), 'lp', 2000), 0.32, 0.7],
    [tone(0.5, sweep(120, 80, 0.06), 'sine', ad(0.001, 0.15)), 0, 0.5],
    [pluck(587.3, 0.8, 0.8, 0.5, 78), 0.32, 0.3], [pluck(880, 0.8, 0.8, 0.5, 79), 0.36, 0.25])) },
  // Barks, one per moment worth a word: out of the hatch, a calling taken, a fatal edge, a glide, home.
  bark_hup: { gain: 0.28, gap: 0.05, voices: 2, bus: 'voice', make: () => fin(mix(0.26,
    [vox(0.22, {
      seed: 81, f0: curve([[0, 410], [0.07, 430], [0.13, 475], [0.19, 445]]),
      shape: vowels([[0, VOWEL.uh], [0.15, VOWEL.uh], [0.19, VOWEL.u]]),
      // breath first ('h'), then the voice, cut off by the lips ('p')
      amp: curve([[0, 0], [0.015, 0.3], [0.05, 0.25], [0.07, 1], [0.16, 0.9], [0.185, 0]]),
      breath: curve([[0, 1], [0.05, 0.9], [0.07, 0.08], [0.19, 0.05]]),
    }), 0],
    [filt(nz(0.02, { type: 'lp', f: 1800, env: ad(0.0005, 0.004), seed: 82 }), 'hp', 300), 0.2, 0.35])) },
  bark_mm: { gain: 0.26, gap: 0.05, voices: 2, bus: 'voice', make: () => fin(vox(0.3, {
    // "mm-hm!": a hum, a breath, a higher hum
    seed: 83, f0: curve([[0, 330], [0.1, 320], [0.13, 360], [0.2, 450], [0.3, 425]]),
    shape: vowels([[0, VOWEL.m], [0.3, VOWEL.m]]),
    amp: curve([[0, 0], [0.02, 0.8], [0.09, 0.7], [0.11, 0.12], [0.135, 0.2], [0.155, 1], [0.25, 0.8], [0.3, 0]]),
    breath: curve([[0, 0.04], [0.11, 0.04], [0.125, 0.5], [0.145, 0.04]]),
  })) },
  bark_oh: { gain: 0.3, gap: 0.05, voices: 2, bus: 'voice', make: () => fin(vox(0.44, {
    // "uh-oh": up, a catch in the throat, then down
    seed: 85, f0: curve([[0, 540], [0.1, 585], [0.13, 560], [0.16, 480], [0.42, 345]]),
    shape: vowels([[0, VOWEL.uh], [0.12, VOWEL.uh], [0.16, VOWEL.o], [0.44, VOWEL.u]]),
    amp: curve([[0, 0], [0.015, 1], [0.1, 0.9], [0.125, 0], [0.16, 0], [0.18, 1], [0.3, 0.7], [0.43, 0]]),
    breath: curve([[0, 0.06], [0.3, 0.08], [0.44, 0.25]]),
  })) },
  bark_whee: { gain: 0.24, gap: 0.05, voices: 2, bus: 'voice', make: () => fin(vox(0.6, {
    seed: 87, f0: curve([[0, 430], [0.12, 640], [0.35, 705], [0.6, 610]]), vib: [6, 0.03],
    shape: vowels([[0, VOWEL.u], [0.08, VOWEL.i], [0.6, VOWEL.i]]),
    amp: curve([[0, 0], [0.03, 0.6], [0.1, 1], [0.4, 0.75], [0.6, 0]]),
    breath: curve([[0, 0.08], [0.4, 0.1], [0.6, 0.3]]),
  })) },
  bark_yay: { gain: 0.28, gap: 0.05, voices: 2, bus: 'voice', make: () => fin(vox(0.38, {
    seed: 89, f0: curve([[0, 480], [0.1, 565], [0.22, 665], [0.38, 600]]), vib: [6, 0.02],
    shape: vowels([[0, VOWEL.i], [0.05, VOWEL.i], [0.12, VOWEL.ae], [0.25, VOWEL.e], [0.38, VOWEL.i]]),
    amp: curve([[0, 0], [0.02, 0.7], [0.08, 1], [0.28, 0.85], [0.38, 0]]),
  })) },
};

// ---- cache ----------------------------------------------------------------------------------
const cache = new Map<SfxId, AudioBuffer>();
export let sfxSynthMs = 0;

export function getSfxBuffer(id: SfxId): AudioBuffer {
  let b = cache.get(id);
  if (!b) {
    const t0 = performance.now();
    b = makeAudioBuffer([SFX[id].make()]);
    sfxSynthMs += performance.now() - t0;
    cache.set(id, b);
  }
  return b;
}

export function isSfxReady(id: SfxId): boolean { return cache.has(id); }

/** Tooling: forget rendered SFX buffers (to measure cold synthesis cost). */
export function clearSfxCache(): void {
  cache.clear();
  sfxSynthMs = 0;
}
