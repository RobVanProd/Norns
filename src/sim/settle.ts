// Settlement and stalemate: read-only questions about a running Sim. settled() says the run is over in
// all but name; LoopDetector proves that, without new input, the run repeats forever (everyone pacing,
// a gate cycling on its own), so the UI can say "nothing more will happen unless you act".
import type { Sim } from './sim';
import type { SimData, Wyrd, WyrdState } from './state';
import type { Terrain } from './terrain';

// ------------------------------------------------------------------ settlement

/** Wyrdlings whose story is told: saved (exit), dead (unravel/burn/drown), gone, or standing as a Warden. */
const SETTLED: ReadonlySet<WyrdState> = new Set<WyrdState>(['gone', 'exit', 'unravel', 'burn', 'drown', 'warden']);

/**
 * The level has finished, or nothing is left to play out: every Wyrdling is saved, dead, gone or a
 * Warden, nobody is left to spawn and no rune is burning. This is the condition the simulation itself
 * counts down before it finishes (Sim.checkEnd), plus the exit and death animations, whose outcome is
 * already counted.
 */
export function settled(sim: Sim): boolean {
  const d = sim.d;
  if (d.finished) return true;
  if (d.spawned < sim.total || d.charges.length > 0) return false;
  for (const w of d.wyrds) if (!SETTLED.has(w.st)) return false;
  return true;
}

// ------------------------------------------------------------------ canonical state
// Two moments of a run with the same canonical state and compatible tick phases have the same future.
// The canonical state is all of SimData except the tick, walked generically (a new field is covered
// without touching this file), plus the terrain's contents. One field is normalised: a Wyrdling's state
// timer `t` keeps counting in states that never read it, so it is ignored there.

/** Wyrdling states whose timer `t` the simulation never reads (every state change resets it). */
export const UNTIMED: ReadonlySet<WyrdState> = new Set<WyrdState>(['walk', 'wait', 'warden', 'fall', 'glide', 'tumble', 'frozen', 'gone']);

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/** One murmur3 round: mixes a 32-bit word into the hash. */
function mix(h: number, k: number): number {
  k = Math.imul(k, 0xcc9e2d51);
  k = (k << 15) | (k >>> 17);
  k = Math.imul(k, 0x1b873593);
  h ^= k;
  h = (h << 13) | (h >>> 19);
  return (Math.imul(h, 5) + 0xe6546b64) | 0;
}

const strHashes = new Map<string, number>();
function strHash(s: string): number {
  let h = strHashes.get(s);
  if (h !== undefined) return h;
  h = mix(0x51ed270b, s.length);
  for (let i = 0; i < s.length; i++) h = mix(h, s.charCodeAt(i));
  if (strHashes.size < 4096) strHashes.set(s, h);
  return h;
}

function hashValue(h: number, v: unknown): number {
  switch (typeof v) {
    case 'number':
      // exact bits, so 0 and -0 differ
      f64[0] = v;
      return mix(mix(mix(h, 1), u32[0]), u32[1]);
    case 'boolean': return mix(h, v ? 3 : 2);
    case 'string': return mix(mix(h, 4), strHash(v));
    case 'undefined': return mix(h, 5);
    case 'object': {
      if (v === null) return mix(h, 6);
      if (Array.isArray(v)) {
        h = mix(mix(h, 7), v.length);
        for (let i = 0; i < v.length; i++) h = i in v ? hashValue(h, v[i]) : mix(h, 10); // a hole is not undefined
        return h;
      }
      const o = v as Record<string, unknown>;
      h = mix(h, 8);
      for (const k in o) h = hashValue(mix(h, strHash(k)), o[k]);
      return mix(h, 9);
    }
  }
  throw new Error(`settle: cannot hash a ${typeof v}`);
}

function hashWyrd(h: number, w: Wyrd): number {
  const untimed = UNTIMED.has(w.st);
  const o = w as unknown as Record<string, unknown>;
  h = mix(h, 8);
  for (const k in o) h = hashValue(mix(h, strHash(k)), k === 't' && untimed ? 0 : o[k]);
  return mix(h, 9);
}

/** Hash of the canonical SimData (no tick, no timers nobody reads). */
export function hashData(d: SimData): number {
  const o = d as unknown as Record<string, unknown>;
  let h = 0x2f6b9d31;
  for (const k in o) {
    if (k === 'tick') continue;
    h = mix(h, strHash(k));
    if (k === 'wyrds') {
      h = mix(h, d.wyrds.length);
      for (const w of d.wyrds) h = hashWyrd(h, w);
    } else h = hashValue(h, o[k]);
  }
  return h;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return Object.is(a, b);
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (i in a !== i in b || !sameValue(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  return sameObject(a as Record<string, unknown>, b as Record<string, unknown>, null);
}

/** Exact comparison; `skip` names a key compared as equal (the tick, or an unread timer). */
function sameObject(a: Record<string, unknown>, b: Record<string, unknown>, skip: string | null): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (k !== skip && !sameValue(a[k], b[k])) return false;
  }
  return true;
}

/** Exact equality of two canonical SimData: what hashData hashes, compared without hashing. */
export function sameData(a: SimData, b: SimData): boolean {
  const oa = a as unknown as Record<string, unknown>, ob = b as unknown as Record<string, unknown>;
  const ka = Object.keys(oa);
  if (ka.length !== Object.keys(ob).length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(ob, k)) return false;
    if (k === 'tick') continue;
    if (k !== 'wyrds') {
      if (!sameValue(oa[k], ob[k])) return false;
      continue;
    }
    if (a.wyrds.length !== b.wyrds.length) return false;
    for (let i = 0; i < a.wyrds.length; i++) {
      const wa = a.wyrds[i], wb = b.wyrds[i];
      const skip = wa.st === wb.st && UNTIMED.has(wa.st) ? 't' : null;
      if (!sameObject(wa as unknown as Record<string, unknown>, wb as unknown as Record<string, unknown>, skip)) return false;
    }
  }
  return true;
}

function chunkHash(c: Uint8Array): number {
  let h = 0x3c6ef372;
  if ((c.byteOffset & 3) === 0 && (c.length & 3) === 0) {
    const w = new Uint32Array(c.buffer, c.byteOffset, c.length >> 2);
    for (let i = 0; i < w.length; i++) h = mix(h, w[i]);
  } else {
    for (let i = 0; i < c.length; i++) h = mix(h, c[i]);
  }
  return h;
}

/** Order-dependent cell of the terrain hash: the terrain hash is the XOR of these, updated per changed chunk. */
function chunkCell(ci: number, h: number): number {
  return mix(mix(0x6a09e667, ci), h);
}

/** Hash of the canonical state of a Sim: SimData without the tick, plus the terrain's contents. */
export function stateHash(sim: Sim): number {
  let th = 0;
  const t = sim.terrain;
  for (let ci = 0; ci < t.chunks.length; ci++) th ^= chunkCell(ci, chunkHash(t.chunks[ci]));
  return mix(hashData(sim.d), th) >>> 0;
}

// ------------------------------------------------------------------ loop detection

/**
 * Tick periods the step reads besides the state (every `d.tick` in src/sim): gates open one slice
 * every `speed` ticks, crushers and fire jets run on `(tick + phase) % period`. Spawning is also tick
 * driven; the detector never runs while spawns are pending. Sand alternates its scan direction with
 * the tick's parity, which only matters on a tick when a grain moves, and every moving grain writes the
 * terrain: so parity counts only if the terrain changed during the cycle.
 */
function tickPeriods(sim: Sim): number[] {
  const L = sim.L;
  const ps = [...L.gates.map((g) => g.speed), ...L.crushers.map((c) => c.period), ...L.firejets.map((f) => f.on + f.off)];
  return [...new Set(ps)].filter((p) => p > 1);
}

interface Anchor {
  tick: number;
  hash: number;
  d: SimData;
  /** chunk contents and versions when the anchor was taken (copies shared between anchors) */
  chunks: Uint8Array[];
  vers: Uint32Array;
}

export interface LoopProof {
  /** an earlier tick whose state the run returned to */
  from: number;
  /** ticks between the two equal states: the run repeats with this period from `from` on */
  period: number;
  /** tick the loop was proven */
  at: number;
}

/**
 * Proves stalemates: call observe(sim) after every sim.step(). Every `stride` ticks it keeps an exact
 * copy of the state (an anchor), for `window` ticks; every tick it hashes the current state and, when
 * the hash matches an anchor's, compares the two exactly. Equal states whose tick difference is a
 * multiple of every tick period the step reads mean the step will map them to equal states again, tick
 * after tick: the future repeats forever, with no save, death or lasting change (the counters and the
 * terrain are part of the state), unless the player acts. A hash collision can never cause a verdict.
 *
 * Comparing every tick against sparse anchors finds a loop one period plus at most one stride after it
 * begins, whatever its period; comparing only every `stride` ticks would need a common multiple of the
 * two. A Sim swapped for another (rewind, restart), a skipped tick or a new calling resets it.
 */
export class LoopDetector {
  private readonly stride: number;
  private readonly window: number;
  private sim: Sim | null = null;
  private terrain: Terrain | null = null;
  private lastTick = -1;
  private used = -1;
  private periods: number[] = [];
  private anchors: Anchor[] = [];
  /** last terrain versions seen, per-chunk content hashes, and the XOR-combined terrain hash */
  private vers = new Uint32Array(0);
  private chunkH = new Int32Array(0);
  private terrainH = 0;
  /** tick whose observation first saw the latest terrain write (the write happened in the step before) */
  private terrainChanged = 0;
  /** chunk copies for anchors, and the version each copy was taken at */
  private copies: Uint8Array[] = [];
  private copyVers = new Uint32Array(0);
  private proof: LoopProof | null = null;
  private lastHash: number | null = null;

  constructor(opts: { stride?: number; window?: number } = {}) {
    this.stride = opts.stride ?? 30;
    this.window = opts.window ?? 30 * 120;
  }

  /** The proven loop, while observe() reports it. */
  get loop(): LoopProof | null {
    return this.proof;
  }

  /** Canonical state hash computed by the last observe() (null when it had no reason to hash). */
  get hash(): number | null {
    return this.lastHash;
  }

  reset(): void {
    this.sim = null;
    this.terrain = null;
    this.anchors.length = 0;
    this.proof = null;
    this.lastTick = -1;
  }

  observe(sim: Sim): 'loop' | null {
    const d = sim.d;
    const same = sim === this.sim && sim.terrain === this.terrain;
    if (same && d.tick === this.lastTick && d.used === this.used) return this.proof ? 'loop' : null;
    if (!same || (d.tick !== this.lastTick && d.tick !== this.lastTick + 1)) this.start(sim);
    else if (d.tick !== this.lastTick) this.trackTerrain();
    this.lastTick = d.tick;
    this.lastHash = null;
    if (d.used !== this.used) {
      // a calling: the old anchors describe a run that no longer happens
      this.used = d.used;
      this.anchors.length = 0;
      this.proof = null;
    }
    if (d.finished || d.spawned < sim.total) {
      this.anchors.length = 0;
      this.proof = null;
      return null;
    }
    if (this.proof) return 'loop';

    const hash = (this.lastHash = mix(hashData(d), this.terrainH) >>> 0);
    for (let i = this.anchors.length - 1; i >= 0; i--) {
      const a = this.anchors[i];
      if (a.hash !== hash || !this.phasesAgree(a.tick, d.tick)) continue;
      if (!sameData(a.d, d) || !this.sameTerrain(a)) continue;
      this.proof = { from: a.tick, period: d.tick - a.tick, at: d.tick };
      return 'loop';
    }
    while (this.anchors.length && this.anchors[0].tick < d.tick - this.window) this.anchors.shift();
    if (d.tick % this.stride === 0) this.anchor(hash);
    return null;
  }

  private start(sim: Sim): void {
    this.sim = sim;
    this.terrain = sim.terrain;
    this.used = sim.d.used;
    this.anchors.length = 0;
    this.proof = null;
    this.periods = tickPeriods(sim);
    const t = sim.terrain, n = t.chunks.length;
    this.vers = t.vers.slice();
    this.chunkH = new Int32Array(n);
    this.terrainH = 0;
    for (let ci = 0; ci < n; ci++) {
      this.chunkH[ci] = chunkHash(t.chunks[ci]);
      this.terrainH ^= chunkCell(ci, this.chunkH[ci]);
    }
    this.terrainChanged = sim.d.tick;
    this.copies = new Array(n);
    this.copyVers = new Uint32Array(n);
  }

  /** Rehash the chunks written since the last tick (a write always bumps the chunk's version). */
  private trackTerrain(): void {
    const t = this.terrain!, vers = t.vers;
    for (let ci = 0; ci < vers.length; ci++) {
      if (vers[ci] === this.vers[ci]) continue;
      this.vers[ci] = vers[ci];
      const h = chunkHash(t.chunks[ci]);
      this.terrainH ^= chunkCell(ci, this.chunkH[ci]) ^ chunkCell(ci, h);
      this.chunkH[ci] = h;
      this.terrainChanged = this.lastTick + 1;
    }
  }

  private phasesAgree(from: number, to: number): boolean {
    const dt = to - from;
    for (const p of this.periods) if (dt % p !== 0) return false;
    return this.terrainChanged <= from || dt % 2 === 0;
  }

  private anchor(hash: number): void {
    const t = this.terrain!;
    for (let ci = 0; ci < t.chunks.length; ci++) {
      if (this.copies[ci] && this.copyVers[ci] === t.vers[ci]) continue;
      this.copies[ci] = t.chunks[ci].slice();
      this.copyVers[ci] = t.vers[ci];
    }
    this.anchors.push({ tick: this.lastTick, hash, d: structuredClone(this.sim!.d), chunks: this.copies.slice(), vers: this.copyVers.slice() });
  }

  private sameTerrain(a: Anchor): boolean {
    const t = this.terrain!;
    for (let ci = 0; ci < t.chunks.length; ci++) {
      if (a.vers[ci] === t.vers[ci]) continue; // not written since the anchor
      const x = a.chunks[ci], y = t.chunks[ci];
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    }
    return true;
  }
}
