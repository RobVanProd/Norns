// Offline DSP toolkit: everything here runs in plain JS on Float32Arrays at SR, before any
// AudioContext exists. Instrument samples, drum hits and SFX are all built from these parts.

/**
 * Internal sample rate for synthesised samples (32-bit-era SPU flavour; also keeps synthesis fast).
 * Dark/pad banks are rendered at lower rates via withRate(); everything reads SR live.
 */
export let SR = 32000;
export const BASE_SR = 32000;

/** Run a synthesis function at a different internal sample rate. */
export function withRate<T>(rate: number, fn: () => T): T {
  const prev = SR;
  SR = rate;
  try { return fn(); } finally { SR = prev; }
}
const TWO_PI = Math.PI * 2;

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

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const samples = (sec: number) => Math.max(1, Math.round(sec * SR));
export const dbToGain = (db: number) => Math.pow(10, db / 20);

export type FilterType = 'lp' | 'hp' | 'bp' | 'peak' | 'notch';

/** RBJ-cookbook biquad, transposed direct form II. */
export class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private z1 = 0; private z2 = 0;
  constructor(type?: FilterType, f?: number, q = 0.707, gainDb = 0) {
    if (type && f) this.set(type, f, q, gainDb);
  }
  set(type: FilterType, f: number, q = 0.707, gainDb = 0): this {
    const fc = Math.min(Math.max(f, 10), SR * 0.47);
    const w = (TWO_PI * fc) / SR;
    const cs = Math.cos(w);
    const sn = Math.sin(w);
    const alpha = sn / (2 * Math.max(q, 0.05));
    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    switch (type) {
      case 'lp': b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'hp': b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'bp': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'notch': b0 = 1; b1 = -2 * cs; b2 = 1; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'peak': {
        const A = Math.pow(10, gainDb / 40);
        b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A;
        break;
      }
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  run(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  reset() { this.z1 = this.z2 = 0; }
}

/** One-pole lowpass with cutoff in Hz. */
export class OnePole {
  private y = 0;
  private k = 1;
  constructor(f = 1000) { this.setF(f); }
  setF(f: number) { this.k = 1 - Math.exp((-TWO_PI * Math.min(f, SR * 0.49)) / SR); return this; }
  run(x: number) { this.y += (x - this.y) * this.k; return this.y; }
  hp(x: number) { this.y += (x - this.y) * this.k; return x - this.y; }
}

/** PolyBLEP residual for band-limited saw/pulse. t = phase 0..1, dt = phase increment. */
export function blep(t: number, dt: number): number {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/** Band-limited sawtooth oscillator with optional per-sample frequency. */
export class Saw {
  phase: number;
  constructor(phase = 0) { this.phase = phase; }
  next(freq: number): number {
    const dt = freq / SR;
    const p = this.phase;
    const v = 2 * p - 1 - blep(p, dt);
    this.phase = p + dt;
    if (this.phase >= 1) this.phase -= 1;
    return v;
  }
}

/** Single-cycle wavetable oscillator (for harmonic-rich but alias-free timbres with vibrato). */
export class Wavetable {
  readonly table: Float32Array;
  readonly size: number;
  phase = 0;
  constructor(harmonics: number[], size = 2048, phase = 0) {
    this.size = size;
    this.table = new Float32Array(size + 1);
    let peak = 0;
    for (let i = 0; i < size; i++) {
      let v = 0;
      for (let h = 0; h < harmonics.length; h++) v += harmonics[h] * Math.sin((TWO_PI * (h + 1) * i) / size);
      this.table[i] = v;
      peak = Math.max(peak, Math.abs(v));
    }
    for (let i = 0; i < size; i++) this.table[i] /= peak || 1;
    this.table[size] = this.table[0];
    this.phase = phase;
  }
  next(freq: number): number {
    const p = this.phase * this.size;
    const i = p | 0;
    const f = p - i;
    const v = this.table[i] + (this.table[i + 1] - this.table[i]) * f;
    this.phase += freq / SR;
    if (this.phase >= 1) this.phase -= Math.floor(this.phase);
    return v;
  }
}

/** Cheap recursive sine (rotation) oscillator for fixed-frequency partials. */
export class Rot {
  private c: number; private s: number; private x: number; private y: number;
  constructor(freq: number, phase = 0) {
    const w = (TWO_PI * freq) / SR;
    this.c = Math.cos(w); this.s = Math.sin(w);
    this.x = Math.cos(phase); this.y = Math.sin(phase);
  }
  next(): number {
    const nx = this.x * this.c - this.y * this.s;
    this.y = this.x * this.s + this.y * this.c;
    this.x = nx;
    return this.y;
  }
}

export function normalize(buf: Float32Array, peak = 0.9): Float32Array {
  let m = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; }
  if (m > 0) { const k = peak / m; for (let i = 0; i < buf.length; i++) buf[i] *= k; }
  return buf;
}

export function peakOf(...bufs: Float32Array[]): number {
  let m = 0;
  for (const b of bufs) for (let i = 0; i < b.length; i++) { const a = Math.abs(b[i]); if (a > m) m = a; }
  return m;
}

export function scale(buf: Float32Array, k: number): Float32Array {
  for (let i = 0; i < buf.length; i++) buf[i] *= k;
  return buf;
}

/** Short fades at both ends to prevent clicks. */
export function fadeEdges(buf: Float32Array, inSec = 0.002, outSec = 0.01): Float32Array {
  const ni = Math.min(buf.length, samples(inSec));
  const no = Math.min(buf.length, samples(outSec));
  for (let i = 0; i < ni; i++) buf[i] *= i / ni;
  for (let i = 0; i < no; i++) buf[buf.length - 1 - i] *= i / no;
  return buf;
}

/**
 * Prepare a seamless sustain loop [ls, le) by crossfading the region just before `le` with the
 * region just before `ls` (equal power). Requires ls >= xf. Samples are indices.
 */
export function crossfadeLoop(data: Float32Array, ls: number, le: number, xf: number) {
  xf = Math.min(xf, ls, le - ls);
  for (let i = 0; i < xf; i++) {
    const t = (i + 0.5) / xf;
    const a = Math.cos((t * Math.PI) / 2);
    const b = Math.sin((t * Math.PI) / 2);
    const di = le - xf + i;
    const si = ls - xf + i;
    data[di] = data[di] * a + data[si] * b;
  }
}

/** Remove DC with a gentle one-pole highpass. */
export function dcBlock(buf: Float32Array, f = 20): Float32Array {
  const hp = new OnePole(f);
  for (let i = 0; i < buf.length; i++) buf[i] = hp.hp(buf[i]);
  return buf;
}

export function softClip(buf: Float32Array, drive = 1): Float32Array {
  const n = Math.tanh(drive);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * drive) / n;
  return buf;
}

export function reverseBuf(buf: Float32Array): Float32Array {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[buf.length - 1 - i];
  return out;
}

/**
 * Extended Karplus–Strong plucked string.
 * decay: seconds for the fundamental to fall 60 dB. bright: 0..1 (excitation + loop damping).
 */
export function ksPluck(freq: number, dur: number, o: { decay: number; bright: number; seed: number; pick?: number; soft?: number }): Float32Array {
  const n = samples(dur);
  const out = new Float32Array(n);
  const P = SR / freq;
  // loop damping: S=0.5 is the classic average (darkest); lower S keeps more highs.
  const S = 0.5 - 0.32 * o.bright;
  let N = Math.floor(P - S - 0.15);
  if (N < 2) N = 2;
  const frac = P - S - N;
  const C = (1 - frac) / (1 + frac);
  const g = Math.pow(10, -3 / (o.decay * freq));
  const line = new Float32Array(N);
  const rand = mulberry32(o.seed);
  // excitation: filtered noise blended with a triangle (soft finger pluck)
  const lp = new OnePole(400 + 9000 * o.bright * o.bright);
  const soft = o.soft ?? 0.3;
  let mean = 0;
  for (let i = 0; i < N; i++) {
    const tri = 1 - Math.abs((2 * i) / N - 1) * 2;
    const v = lp.run(rand() * 2 - 1) * (1 - soft) + tri * soft;
    line[i] = v;
    mean += v;
  }
  mean /= N;
  for (let i = 0; i < N; i++) line[i] -= mean;
  // pick position: comb out harmonics (pluck nearer the bridge = brighter)
  if (o.pick) {
    const off = Math.max(1, Math.round(N * o.pick));
    const tmp = line.slice();
    for (let i = 0; i < N; i++) line[i] = tmp[i] - 0.8 * tmp[(i + off) % N];
  }
  let idx = 0, prev = 0, apX = 0, apY = 0;
  for (let i = 0; i < n; i++) {
    const y = line[idx];
    const d = (1 - S) * y + S * prev;
    prev = y;
    const ap = C * d + apX - C * apY;
    apX = d; apY = ap;
    line[idx] = ap * g;
    out[i] = y;
    if (++idx >= N) idx = 0;
  }
  return out;
}

export interface Partial { r: number; a: number; d: number; ph?: number }

/** Additive synthesis of exponentially decaying (optionally detuned) partials. d = decay time constant (s). */
export function additive(freq: number, dur: number, partials: Partial[], attack = 0.002): Float32Array {
  const n = samples(dur);
  const out = new Float32Array(n);
  for (const p of partials) {
    const f = freq * p.r;
    if (f >= SR * 0.45) continue;
    const osc = new Rot(f, p.ph ?? 0);
    const k = Math.exp(-1 / (p.d * SR));
    let e = p.a;
    for (let i = 0; i < n; i++) {
      out[i] += osc.next() * e;
      e *= k;
      if (e < 1e-5) break;
    }
  }
  const na = samples(attack);
  for (let i = 0; i < na && i < n; i++) out[i] *= i / na;
  return out;
}

/** White noise buffer. */
export function noise(n: number, seed: number): Float32Array {
  const r = mulberry32(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

/** Mix src into dst at a sample offset with gain. */
export function mixInto(dst: Float32Array, src: Float32Array, offset = 0, gain = 1) {
  const end = Math.min(dst.length, offset + src.length);
  for (let i = Math.max(0, offset); i < end; i++) dst[i] += src[i - offset] * gain;
}

export interface Zone { buf: AudioBuffer; root: number; loop?: [number, number] }

export function makeAudioBuffer(chans: Float32Array[], sr = SR): AudioBuffer {
  const len = chans[0].length;
  const buf = new AudioBuffer({ length: len, numberOfChannels: chans.length, sampleRate: sr });
  for (let c = 0; c < chans.length; c++) buf.getChannelData(c).set(chans[c]);
  return buf;
}
