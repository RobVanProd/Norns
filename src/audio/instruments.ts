// Instrument sample synthesis. Each instrument is a set of pitched sample "zones" synthesised
// offline (lazily, per bank) plus a playback envelope. Sustained instruments get crossfaded loops.

import {
  SR, Biquad, Rot, Saw, Wavetable, additive, crossfadeLoop, dcBlock, fadeEdges, ksPluck,
  makeAudioBuffer, mtof, mulberry32, noise, normalize, samples, softClip, withRate, type Zone,
} from './dsp';

export type DrumId = 'fd' | 'ft' | 'sh' | 'tk' | 'tl' | 'th' | 'an' | 'ti' | 'ic' | 'ka' | 'cy' | 'sw';
export type InstId =
  | 'harp' | 'lyre' | 'celesta' | 'bell' | 'chime' | 'flute' | 'strings' | 'stacc' | 'tagel'
  | 'choir' | 'vox' | 'air' | 'brass' | 'horn' | 'bass' | 'pbass' | DrumId;

export const DRUM_IDS: readonly DrumId[] = ['fd', 'ft', 'sh', 'tk', 'tl', 'th', 'an', 'ti', 'ic', 'ka', 'cy', 'sw'];

export interface Env { a: number; d?: number; s?: number; r: number }

export interface Instrument {
  id: InstId;
  bank: BankId;
  env: Env;
  gain: number;
  /** plays the whole sample regardless of note length (drums, bells) */
  oneShot?: boolean;
  /** seconds of sample before the "hit" (reverse swells): scheduled early so the peak lands on the beat */
  pre?: number;
}

type BankId = Exclude<InstId, 'stacc' | 'vox'>;

export const INSTRUMENTS: Record<InstId, Instrument> = {
  harp: { id: 'harp', bank: 'harp', env: { a: 0.002, r: 1.4 }, gain: 0.55 },
  lyre: { id: 'lyre', bank: 'lyre', env: { a: 0.002, r: 0.45 }, gain: 0.8 },
  celesta: { id: 'celesta', bank: 'celesta', env: { a: 0.001, r: 1.6 }, gain: 0.45 },
  bell: { id: 'bell', bank: 'bell', env: { a: 0.001, r: 3 }, gain: 0.45, oneShot: true },
  chime: { id: 'chime', bank: 'chime', env: { a: 0.001, r: 1.5 }, gain: 0.4, oneShot: true },
  flute: { id: 'flute', bank: 'flute', env: { a: 0.045, d: 0.25, s: 0.85, r: 0.16 }, gain: 0.5 },
  strings: { id: 'strings', bank: 'strings', env: { a: 0.1, r: 0.45 }, gain: 0.42 },
  stacc: { id: 'stacc', bank: 'strings', env: { a: 0.006, d: 0.12, s: 0.6, r: 0.07 }, gain: 0.5 },
  tagel: { id: 'tagel', bank: 'tagel', env: { a: 0.07, r: 0.3 }, gain: 0.55 },
  choir: { id: 'choir', bank: 'choir', env: { a: 0.32, r: 0.9 }, gain: 0.36 },
  vox: { id: 'vox', bank: 'choir', env: { a: 0.02, d: 0.25, s: 0.5, r: 0.3 }, gain: 0.5 },
  air: { id: 'air', bank: 'air', env: { a: 0.7, r: 1.4 }, gain: 0.3 },
  brass: { id: 'brass', bank: 'brass', env: { a: 0.012, r: 0.14 }, gain: 0.5 },
  horn: { id: 'horn', bank: 'horn', env: { a: 0.09, r: 0.4 }, gain: 0.48 },
  bass: { id: 'bass', bank: 'bass', env: { a: 0.035, r: 0.18 }, gain: 0.45 },
  pbass: { id: 'pbass', bank: 'pbass', env: { a: 0.002, r: 0.22 }, gain: 0.5 },
  fd: { id: 'fd', bank: 'fd', env: { a: 0, r: 0 }, gain: 0.5, oneShot: true },
  ft: { id: 'ft', bank: 'ft', env: { a: 0, r: 0 }, gain: 0.45, oneShot: true },
  sh: { id: 'sh', bank: 'sh', env: { a: 0, r: 0 }, gain: 0.22, oneShot: true },
  tk: { id: 'tk', bank: 'tk', env: { a: 0, r: 0 }, gain: 0.42, oneShot: true },
  tl: { id: 'tl', bank: 'tl', env: { a: 0, r: 0 }, gain: 0.38, oneShot: true },
  th: { id: 'th', bank: 'th', env: { a: 0, r: 0 }, gain: 0.34, oneShot: true },
  an: { id: 'an', bank: 'an', env: { a: 0, r: 0 }, gain: 0.2, oneShot: true },
  ti: { id: 'ti', bank: 'ti', env: { a: 0, r: 0 }, gain: 0.3, oneShot: true },
  ic: { id: 'ic', bank: 'ic', env: { a: 0, r: 0 }, gain: 0.24, oneShot: true },
  ka: { id: 'ka', bank: 'ka', env: { a: 0, r: 0 }, gain: 0.34, oneShot: true },
  cy: { id: 'cy', bank: 'cy', env: { a: 0, r: 0 }, gain: 0.2, oneShot: true },
  sw: { id: 'sw', bank: 'sw', env: { a: 0, r: 0 }, gain: 0.3, oneShot: true, pre: 1.2 },
};

// ---------------------------------------------------------------------------------------------
// Bank synthesis

function mono(buf: Float32Array, root: number, loop?: [number, number]): Zone {
  return { buf: makeAudioBuffer([buf]), root, loop };
}

/** Finish a looped sustain sample: crossfade loop, normalise, wrap as a zone. */
function looped(chans: Float32Array[], root: number, ls: number, le: number, xf: number, peak = 0.8): Zone {
  const a = samples(ls), b = samples(le), x = samples(xf);
  let m = 0;
  for (const c of chans) {
    crossfadeLoop(c, a, b, x);
    for (let i = 0; i < b; i++) m = Math.max(m, Math.abs(c[i]));
    const na = samples(0.003);
    for (let i = 0; i < na; i++) c[i] *= i / na;
  }
  const k = m > 0 ? peak / m : 1;
  const trimmed = chans.map((c) => { const t = c.slice(0, b + 64); for (let i = 0; i < t.length; i++) t[i] *= k; return t; });
  return { buf: makeAudioBuffer(trimmed), root, loop: [ls, le] };
}

function harpZone(m: number, seed: number): Zone {
  const f = mtof(m);
  const dur = m < 54 ? 3.4 : m < 66 ? 2.8 : m < 78 ? 2.2 : 1.6;
  const s = ksPluck(f, dur, { decay: dur * 1.1, bright: 0.42, seed, pick: 0.13, soft: 0.5 });
  const body = additive(f, dur, [{ r: 1, a: 0.22, d: dur * 0.3 }, { r: 2, a: 0.06, d: dur * 0.15 }]);
  for (let i = 0; i < s.length; i++) s[i] += body[i];
  return mono(fadeEdges(normalize(dcBlock(s), 0.8), 0.001, 0.05), m);
}

function lyreZone(m: number, seed: number): Zone {
  const f = mtof(m);
  const dur = m < 54 ? 2.2 : m < 66 ? 1.8 : 1.4;
  const s = ksPluck(f, dur, { decay: dur * 0.9, bright: 0.7, seed, pick: 0.22, soft: 0.2 });
  const p1 = new Biquad('peak', 260, 1.3, 5), p2 = new Biquad('peak', 1500, 1.5, 4), hp = new Biquad('hp', 90, 0.7);
  for (let i = 0; i < s.length; i++) s[i] = hp.run(p2.run(p1.run(s[i])));
  return mono(fadeEdges(normalize(s, 0.8), 0.001, 0.05), m);
}

function celestaZone(m: number, seed: number): Zone {
  const f = mtof(m);
  const s = additive(f, 2.4, [
    { r: 1, a: 1, d: 1.0 }, { r: 2, a: 0.07, d: 0.3 }, { r: 2.76, a: 0.05, d: 0.18 },
    { r: 4, a: 0.2, d: 0.1 }, { r: 5.4, a: 0.05, d: 0.06 }, { r: 8.9, a: 0.03, d: 0.03 },
  ], 0.0015);
  const n = noise(samples(0.006), seed);
  const hp = new Biquad('hp', 3000, 0.7);
  for (let i = 0; i < n.length; i++) s[i] += hp.run(n[i]) * 0.15 * (1 - i / n.length);
  return mono(fadeEdges(normalize(s, 0.8), 0.0005, 0.05), m);
}

function bellZone(m: number): Zone {
  const f = mtof(m);
  const k = m < 54 ? 1.4 : m < 66 ? 1 : 0.7;
  const s = additive(f, m < 54 ? 3.4 : m < 66 ? 2.8 : 2.2, [
    { r: 0.5, a: 0.35, d: 2.2 * k }, { r: 1, a: 1, d: 1.6 * k }, { r: 1.19, a: 0.42, d: 1.1 * k, ph: 1 },
    { r: 1.5, a: 0.25, d: 0.9 * k }, { r: 2, a: 0.5, d: 0.8 * k, ph: 2 }, { r: 2.51, a: 0.18, d: 0.45 * k },
    { r: 3.01, a: 0.12, d: 0.35 * k }, { r: 4.07, a: 0.08, d: 0.2 * k }, { r: 1.003, a: 0.3, d: 1.5 * k, ph: 0.5 },
  ], 0.001);
  return mono(fadeEdges(normalize(s, 0.8), 0.0005, 0.6), m);
}

function chimeZone(m: number): Zone {
  const f = mtof(m);
  const s = additive(f, 2.2, [
    { r: 1, a: 1, d: 0.9 }, { r: 2.0, a: 0.3, d: 0.5 }, { r: 3.0, a: 0.15, d: 0.3 },
    { r: 4.2, a: 0.14, d: 0.2 }, { r: 5.43, a: 0.08, d: 0.12 }, { r: 1.002, a: 0.3, d: 0.8, ph: 1.3 },
  ], 0.001);
  return mono(fadeEdges(normalize(s, 0.8), 0.0005, 0.05), m);
}

function fluteZone(m: number, seed: number): Zone {
  const f = mtof(m);
  const len = 2.0;
  const n = samples(len);
  const out = new Float32Array(n);
  const wt = new Wavetable([1, 0.28, 0.09, 0.035, 0.015]);
  const rand = mulberry32(seed);
  const breath = new Biquad('bp', f, 3);
  const breath2 = new Biquad('bp', f * 2, 4);
  const air = new Biquad('hp', 2500, 0.7);
  const chiff = new Biquad('bp', Math.min(f * 3, 9000), 2);
  const vibRate = 5; // loop length is a whole number of vibrato cycles
  const vib = new Rot(vibRate), trem = new Rot(vibRate, 0.6);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vibAmt = Math.min(1, Math.max(0, (t - 0.25) / 0.35)) * 0.0038;
    const glide = t < 0.04 ? -0.01 * (1 - t / 0.04) : 0;
    const fr = f * (1 + glide + vibAmt * vib.next());
    const amp = Math.min(1, t / 0.03) * (1 + 0.04 * trem.next());
    const w = rand() * 2 - 1;
    let v = wt.next(fr) * amp;
    v += (breath.run(w) * 0.5 + breath2.run(w) * 0.25) * 0.55 * amp;
    v += air.run(w) * 0.03 * amp;
    if (t < 0.06) v += chiff.run(w) * 0.5 * (1 - t / 0.06);
    out[i] = v;
  }
  return looped([out], m, 0.6, 1.8, 0.2, 0.8);
}

/** Detuned band-limited saw stack (bowed strings / tagelharpa / bass), optionally stereo. */
function sawStack(f: number, len: number, voices: number, detuneCents: number, seed: number, vibDepth = 0.002): Float32Array {
  const n = samples(len);
  const out = new Float32Array(n);
  const rand = mulberry32(seed);
  for (let v = 0; v < voices; v++) {
    const det = voices === 1 ? 0 : (v / (voices - 1) - 0.5) * 2 * detuneCents;
    const fv = f * Math.pow(2, det / 1200);
    const osc = new Saw(rand());
    const lfo = new Rot(4.6 + rand() * 1.4, rand() * 6.28);
    const vd = fv * vibDepth;
    for (let i = 0; i < n; i++) out[i] += osc.next(fv + vd * lfo.next());
  }
  return out;
}

function stringsZone(m: number, seed: number): Zone {
  const f = mtof(m);
  const len = 1.5;
  const chans: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const s = sawStack(f, len, 3, 9, seed + c * 101, 0.0022);
    const lp1 = new Biquad('lp', Math.min(6500, 1300 + 5 * f), 0.6);
    const lp2 = new Biquad('lp', Math.min(8000, 2000 + 6 * f), 0.5);
    const pk = new Biquad('peak', 1100, 1, 2.5);
    const hp = new Biquad('hp', f * 0.6, 0.7);
    const nz = noise(s.length, seed + 7 + c);
    const bow = new Biquad('bp', 3000, 0.8);
    for (let i = 0; i < s.length; i++) s[i] = hp.run(pk.run(lp2.run(lp1.run(s[i] * 0.33)))) + bow.run(nz[i]) * 0.012;
    chans.push(s);
  }
  return looped(chans, m, 0.3, 1.4, 0.25);
}

function tagelZone(m: number, seed: number): Zone {
  const f = mtof(m);
  const len = 1.5;
  const s = sawStack(f, len, 3, 5, seed, 0.0015);
  const f1 = new Biquad('bp', 650, 1.4), f2 = new Biquad('bp', 1500, 2.2), f3 = new Biquad('bp', 2700, 3);
  const lp = new Biquad('lp', Math.min(5000, 900 + 6 * f), 0.7);
  const nz = noise(s.length, seed + 3);
  const rasp = new Biquad('bp', 2400, 1.2);
  const ph = new Saw(0);
  for (let i = 0; i < s.length; i++) {
    const x = s[i] * 0.33;
    const pulse = 0.5 + 0.5 * ph.next(f);
    const r = rasp.run(nz[i]) * pulse * 0.12;
    s[i] = f1.run(x) * 1.0 + f2.run(x) * 0.7 + f3.run(x) * 0.25 + lp.run(x) * 0.45 + r;
  }
  return looped([s], m, 0.3, 1.4, 0.22);
}

function choirZone(m: number, seed: number): Zone {
  const f = mtof(m);
  const len = 1.6;
  const n = samples(len);
  // 'aah' formants, blended from male to female with register
  const t = Math.min(1, Math.max(0, (m - 48) / 24));
  const F = [700 + 150 * t, 1150 + 60 * t, 2600 + 200 * t];
  const B = [0.9, 0.45, 0.22];
  const chans: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const src = new Float32Array(n);
    const rand = mulberry32(seed + c * 31);
    for (let v = 0; v < 2; v++) {
      const det = (v ? 6 : -6) + (c ? 3 : -3);
      const fv = f * Math.pow(2, det / 1200);
      const osc = new Saw(rand());
      const vib = new Rot(4.8 + rand() * 1.0, rand() * 6.28);
      const drift = new Rot(0.55 + rand() * 0.3, rand() * 6.28);
      const a = fv * 0.004, b = fv * 0.002;
      for (let i = 0; i < n; i++) src[i] += osc.next(fv + a * vib.next() + b * drift.next());
    }
    const nz = noise(n, seed + 99 + c);
    const fs = F.map((fr, k) => new Biquad('bp', fr, fr / (80 + 40 * k)));
    const lp = new Biquad('lp', 4200, 0.6);
    const hp = new Biquad('hp', f * 0.7, 0.7);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = src[i] * 0.4 + nz[i] * 0.05;
      let y = 0;
      for (let k = 0; k < 3; k++) y += fs[k].run(x) * B[k];
      out[i] = hp.run(lp.run(y));
    }
    chans.push(out);
  }
  return looped(chans, m, 0.3, 1.5, 0.28);
}

function airZone(m: number, seed: number): Zone {
  const f = mtof(m);
  const len = 1.7;
  const n = samples(len);
  const chans: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const out = new Float32Array(n);
    const wobble = new Rot(0.5, c * 2);
    const o1 = new Rot(f * (c ? 1.0007 : 0.9993), c), o2 = new Rot(f * 2 * (c ? 0.9989 : 1.0011)), o3 = new Rot(f * 3.002);
    const nz = noise(n, seed + c * 17);
    const b1 = new Biquad('bp', f, 30), b2 = new Biquad('bp', f * 2, 24), b3 = new Biquad('hp', 3500, 0.7);
    for (let i = 0; i < n; i++) {
      const wob = 1 + 0.12 * wobble.next();
      out[i] = (o1.next() * 0.5 + o2.next() * 0.16 + o3.next() * 0.04) * wob + b1.run(nz[i]) * 1.6 + b2.run(nz[i]) * 0.9 + b3.run(nz[i]) * 0.012;
    }
    chans.push(out);
  }
  return looped(chans, m, 0.35, 1.6, 0.3);
}

function brassZone(m: number, seed: number, dark: boolean): Zone {
  const f = mtof(m);
  const len = 1.4;
  const n = samples(len);
  const s = sawStack(f, len, 3, dark ? 6 : 8, seed, 0.0016);
  const out = new Float32Array(n);
  const lp = new Biquad();
  const lp2 = new Biquad();
  const atk = dark ? 0.08 : 0.025;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((i & 31) === 0 && t < 0.5) {
      const e = t < atk ? t / atk : 0.55 + 0.45 * Math.exp(-(t - atk) / 0.16);
      const fc = Math.min(7000, f * (dark ? 1.1 + 2.6 * e : 1.3 + 6.5 * e));
      lp.set('lp', fc, dark ? 0.9 : 1.6);
      lp2.set('lp', fc * 1.6, 0.6);
    }
    out[i] = lp2.run(lp.run(s[i] * 0.33));
  }
  if (!dark) softClip(out, 1.5);
  return looped([out], m, 0.5, 1.3, 0.22);
}

function bassZone(m: number, seed: number): Zone {
  const f = mtof(m);
  const len = 1.4;
  const s = sawStack(f, len, 3, 5, seed, 0.0012);
  const lp = new Biquad('lp', f * 7, 0.8), lp2 = new Biquad('lp', f * 10, 0.6);
  const sub = new Rot(f);
  for (let i = 0; i < s.length; i++) s[i] = lp2.run(lp.run(s[i] * 0.33)) + sub.next() * 0.35;
  return looped([s], m, 0.25, 1.3, 0.2);
}

function pbassZone(m: number, seed: number): Zone {
  const f = mtof(m);
  const dur = 2.2;
  const s = ksPluck(f, dur, { decay: 2.4, bright: 0.2, seed, soft: 0.6 });
  const sub = additive(f, dur, [{ r: 1, a: 0.5, d: 0.7 }]);
  const lp = new Biquad('lp', 1400, 0.7);
  for (let i = 0; i < s.length; i++) s[i] = lp.run(s[i] + sub[i]);
  return mono(fadeEdges(normalize(dcBlock(s), 0.8), 0.001, 0.05), m);
}

// ---- drums ----------------------------------------------------------------------------------

interface Mode { r: number; a: number; d: number }

/** Membrane/bar hit: swept modes + filtered noise transient. */
function hit(o: { f0: number; f1: number; sweep: number; modes: Mode[]; dur: number; noise?: { type: 'lp' | 'bp' | 'hp'; f: number; q?: number; a: number; d: number }; seed: number; drive?: number }): Float32Array {
  const n = samples(o.dur);
  const out = new Float32Array(n);
  // per-sample phase increment of the fundamental (exponential sweep f0 -> f1)
  const inc = new Float32Array(n);
  const sweepN = o.sweep > 0 ? Math.max(1, Math.round(o.sweep * SR)) : 0;
  const ks = sweepN ? Math.pow(o.f1 / o.f0, 1 / sweepN) : 1;
  let fr = o.f0;
  for (let i = 0; i < n; i++) { inc[i] = fr / SR; if (i < sweepN) fr *= ks; }
  for (const md of o.modes) {
    let ph = 0;
    const k = Math.exp(-1 / (md.d * SR));
    let e = md.a;
    const r = md.r * 2 * Math.PI;
    for (let i = 0; i < n; i++) {
      ph += inc[i];
      out[i] += Math.sin(r * ph) * e;
      e *= k;
      if (e < 1e-5) break;
    }
  }
  if (o.noise) {
    const nz = noise(n, o.seed);
    const flt = new Biquad(o.noise.type, o.noise.f, o.noise.q ?? 0.7);
    const k = Math.exp(-1 / (o.noise.d * SR));
    let e = o.noise.a;
    for (let i = 0; i < n; i++) { out[i] += flt.run(nz[i]) * e; e *= k; if (e < 1e-5) break; }
  }
  if (o.drive) softClip(out, o.drive);
  const na = samples(0.0008);
  for (let i = 0; i < na; i++) out[i] *= i / na;
  return fadeEdges(normalize(out, 0.85), 0.0005, 0.02);
}

const MEMB = [1, 1.59, 2.14, 2.65];

function drumZone(id: DrumId): Zone {
  let s: Float32Array;
  switch (id) {
    case 'fd':
      s = hit({ f0: 128, f1: 92, sweep: 0.05, dur: 0.7, seed: 11, modes: MEMB.map((r, i) => ({ r, a: [1, 0.35, 0.22, 0.12][i], d: [0.32, 0.14, 0.1, 0.07][i] })), noise: { type: 'lp', f: 1300, a: 0.45, d: 0.022 } });
      break;
    case 'ft':
      s = hit({ f0: 360, f1: 330, sweep: 0.02, dur: 0.3, seed: 12, modes: MEMB.slice(0, 3).map((r, i) => ({ r, a: [0.5, 0.35, 0.25][i], d: [0.09, 0.05, 0.04][i] })), noise: { type: 'bp', f: 2300, q: 1.2, a: 1.2, d: 0.016 } });
      break;
    case 'sh': {
      const n = samples(0.16);
      s = new Float32Array(n);
      const nz = noise(n, 13);
      const hp = new Biquad('hp', 5000, 0.8), bp = new Biquad('bp', 8500, 0.9);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const e = t < 0.018 ? (t / 0.018) ** 2 : Math.exp(-(t - 0.018) / 0.032);
        s[i] = bp.run(hp.run(nz[i])) * e;
      }
      s = fadeEdges(normalize(s, 0.8), 0.0005, 0.01);
      break;
    }
    case 'tk':
      s = hit({ f0: 84, f1: 52, sweep: 0.12, dur: 1.7, seed: 14, drive: 1.4, modes: [{ r: 1, a: 1, d: 0.75 }, { r: 1.52, a: 0.45, d: 0.3 }, { r: 1.98, a: 0.3, d: 0.18 }, { r: 2.44, a: 0.18, d: 0.12 }], noise: { type: 'lp', f: 900, a: 0.7, d: 0.04 } });
      break;
    case 'tl':
      s = hit({ f0: 128, f1: 92, sweep: 0.08, dur: 0.9, seed: 15, drive: 1.2, modes: [{ r: 1, a: 1, d: 0.42 }, { r: 1.55, a: 0.4, d: 0.18 }, { r: 2.1, a: 0.25, d: 0.1 }], noise: { type: 'lp', f: 1400, a: 0.5, d: 0.03 } });
      break;
    case 'th':
      s = hit({ f0: 185, f1: 140, sweep: 0.07, dur: 0.7, seed: 16, drive: 1.2, modes: [{ r: 1, a: 1, d: 0.32 }, { r: 1.55, a: 0.4, d: 0.14 }, { r: 2.1, a: 0.25, d: 0.08 }], noise: { type: 'lp', f: 2000, a: 0.5, d: 0.025 } });
      break;
    case 'an':
      s = hit({ f0: 1040, f1: 1040, sweep: 0, dur: 1.3, seed: 17, modes: [{ r: 1, a: 1, d: 0.6 }, { r: 2.32, a: 0.7, d: 0.4 }, { r: 3.16, a: 0.45, d: 0.28 }, { r: 4.48, a: 0.3, d: 0.18 }, { r: 5.95, a: 0.2, d: 0.12 }, { r: 1.007, a: 0.4, d: 0.5 }], noise: { type: 'hp', f: 3000, a: 1.5, d: 0.004 } });
      break;
    case 'ti':
      s = hit({ f0: 1850, f1: 1800, sweep: 0.01, dur: 0.14, seed: 18, modes: [{ r: 1, a: 1, d: 0.04 }, { r: 1.58, a: 0.5, d: 0.025 }], noise: { type: 'bp', f: 3500, q: 1.5, a: 0.8, d: 0.004 } });
      break;
    case 'ic':
      s = hit({ f0: 4200, f1: 4200, sweep: 0, dur: 0.3, seed: 19, modes: [{ r: 1, a: 1, d: 0.07 }, { r: 1.51, a: 0.6, d: 0.05 }, { r: 2.37, a: 0.3, d: 0.03 }], noise: { type: 'hp', f: 6000, a: 0.6, d: 0.003 } });
      break;
    case 'ka':
      s = hit({ f0: 1150, f1: 1100, sweep: 0.01, dur: 0.12, seed: 20, modes: [{ r: 1, a: 1, d: 0.025 }, { r: 2.3, a: 0.5, d: 0.015 }], noise: { type: 'bp', f: 3000, q: 1, a: 1.2, d: 0.006 } });
      break;
    case 'cy': {
      const n = samples(2.6);
      s = new Float32Array(n);
      const nz = noise(n, 21);
      const hp = new Biquad('hp', 3500, 0.7), bp = new Biquad('bp', 7000, 0.6);
      const ring = [3150, 4730, 5870, 7310].map((f, i) => new Rot(f, i));
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const e = Math.min(1, t / 0.003) * (0.75 * Math.exp(-t / 0.55) + 0.25 * Math.exp(-t / 1.5));
        let r = 0;
        for (const o of ring) r += o.next();
        s[i] = (bp.run(hp.run(nz[i])) + r * 0.02) * e;
      }
      s = fadeEdges(normalize(s, 0.8), 0.0005, 0.1);
      break;
    }
    case 'sw': {
      const n = samples(1.2);
      s = new Float32Array(n);
      const nz = noise(n, 22);
      const f = new Biquad();
      const hp = new Biquad('hp', 400, 0.7);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        if ((i & 31) === 0) f.set('lp', 500 + 9000 * t * t, 1.2);
        s[i] = hp.run(f.run(nz[i])) * Math.pow(t, 2.5);
      }
      s = normalize(s, 0.8);
      const no = samples(0.012);
      for (let i = 0; i < no; i++) s[n - 1 - i] *= i / no;
      break;
    }
  }
  return mono(s, 60);
}

// ---------------------------------------------------------------------------------------------
// Lazy bank cache + timing

const ROOTS: Partial<Record<BankId, number[]>> = {
  harp: [43, 55, 67, 79, 91],
  lyre: [50, 62, 74, 86],
  celesta: [72, 84, 96],
  bell: [48, 60, 72],
  chime: [76, 88, 100],
  flute: [62, 74, 86],
  strings: [36, 48, 60, 72, 84],
  tagel: [38, 50, 62],
  choir: [48, 60, 72],
  air: [60, 72, 84],
  brass: [50, 62, 74, 86],
  horn: [43, 55, 67],
  bass: [31, 43, 55],
  pbass: [33, 45],
};

/** Internal synthesis rate per bank: dark and pad sounds don't need 16 kHz of bandwidth. */
const BANK_RATE: Partial<Record<BankId, number>> = {
  choir: 24000, air: 24000, strings: 24000, bell: 24000, flute: 24000, brass: 24000, horn: 24000, tagel: 24000, harp: 24000,
  bass: 16000, pbass: 16000, tk: 16000, tl: 16000, th: 22050, fd: 22050,
};

function rootsOf(bank: BankId): number[] {
  return (DRUM_IDS as readonly string[]).includes(bank) ? [60] : ROOTS[bank] ?? [60];
}

function buildZone(bank: BankId, idx: number): Zone {
  return withRate(BANK_RATE[bank] ?? 32000, () => {
    if ((DRUM_IDS as readonly string[]).includes(bank)) return drumZone(bank as DrumId);
    const m = rootsOf(bank)[idx];
    const seed = 1000 + m * 7 + idx;
    switch (bank) {
      case 'harp': return harpZone(m, seed);
      case 'lyre': return lyreZone(m, seed);
      case 'celesta': return celestaZone(m, seed);
      case 'bell': return bellZone(m);
      case 'chime': return chimeZone(m);
      case 'flute': return fluteZone(m, seed);
      case 'strings': return stringsZone(m, seed);
      case 'tagel': return tagelZone(m, seed);
      case 'choir': return choirZone(m, seed);
      case 'air': return airZone(m, seed);
      case 'brass': return brassZone(m, seed, false);
      case 'horn': return brassZone(m, seed, true);
      case 'bass': return bassZone(m, seed);
      case 'pbass': return pbassZone(m, seed);
      default: throw new Error('unknown bank ' + bank);
    }
  });
}

// Zones are synthesised lazily one at a time, so a song only pays for the pitch ranges it uses.
const banks = new Map<BankId, (Zone | null)[]>();
export const synthTimings: Record<string, number> = {};

function zoneAt(bank: BankId, idx: number): Zone {
  let arr = banks.get(bank);
  if (!arr) { arr = rootsOf(bank).map(() => null); banks.set(bank, arr); }
  let z = arr[idx];
  if (!z) {
    const t0 = performance.now();
    z = buildZone(bank, idx);
    synthTimings[bank] = (synthTimings[bank] ?? 0) + performance.now() - t0;
    arr[idx] = z;
  }
  return z;
}

/** All zones of an instrument's bank (synthesising any that are missing). */
export function getZones(inst: InstId): Zone[] {
  const bank = INSTRUMENTS[inst].bank;
  return rootsOf(bank).map((_, i) => zoneAt(bank, i));
}

/** Number of zones in an instrument's bank (for incremental warm-up). */
export function zoneCount(inst: InstId): number {
  return rootsOf(INSTRUMENTS[inst].bank).length;
}

/** Synthesise one zone of an instrument by index (warm-up slices). */
export function warmZone(inst: InstId, idx: number): void {
  zoneAt(INSTRUMENTS[inst].bank, idx);
}

/** The zone whose root is nearest to `midi` (synthesised on first use). */
export function zoneFor(inst: InstId, midi: number): Zone {
  const bank = INSTRUMENTS[inst].bank;
  const roots = rootsOf(bank);
  let bi = 0, bd = Infinity;
  for (let i = 0; i < roots.length; i++) {
    const d = Math.abs(roots[i] - midi);
    if (d < bd) { bd = d; bi = i; }
  }
  return zoneAt(bank, bi);
}

/** Tooling: forget every synthesised sample (to measure cold synthesis cost). */
export function clearSampleCache(): void {
  banks.clear();
  for (const k of Object.keys(synthTimings)) delete synthTimings[k];
}
