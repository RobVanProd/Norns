// Settlement and stalemate: read-only questions about a running Sim. settled() says the run is over in
// all but name; LoopDetector proves that, without new input, the run repeats forever (everyone pacing,
// a gate cycling on its own), so the UI can say "nothing more will happen unless you act".
import type { Sim } from './sim';
import { isAlive, type Body, type SimData, type Wyrd, type WyrdState } from './state';
import { CS_SHIFT, type Terrain } from './terrain';

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
    case 'number': return hashNum(h, v);
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

/** A number into a hash: a small integer as itself, anything else by its exact bits (0 and -0 differ). */
function hashNum(h: number, v: number): number {
  if ((v | 0) === v && (v !== 0 || 1 / v > 0)) return mix(h, v);
  f64[0] = v;
  return mix(mix(mix(h, 1), u32[0]), u32[1]);
}

/** Exact equality of two numbers (0 and -0 differ, NaN equals NaN), as Object.is. */
function sameNum(a: number, b: number): boolean {
  return a === b ? a !== 0 || 1 / a === 1 / b : a !== a && b !== b;
}

/**
 * Hash of one Wyrdling's canonical state. This and sameWyrd run for every Wyrdling every tick, so they
 * name the fields; the coverage test in settle.test.ts fails if a field is added to Wyrd and not here.
 */
function hashWyrd(w: Wyrd): number {
  let h = hashNum(hashNum(hashNum(0x7f4a7c15, w.id), w.x), w.y);
  h = hashNum(hashNum(hashNum(hashNum(h, w.fx), w.fy), w.vx), w.vy);
  h = hashNum(mix(hashNum(h, w.dir), strHash(w.st)), UNTIMED.has(w.st) ? 0 : w.t);
  h = hashNum(mix(mix(hashNum(h, w.fallY), w.climber ? 3 : 2), w.glider ? 3 : 2), w.planks);
  return hashNum(h, w.frozen);
}

/** Hash of the canonical SimData without the Wyrdlings (and without the tick). */
function hashRest(d: SimData): number {
  const o = d as unknown as Record<string, unknown>;
  let h = 0x2f6b9d31;
  for (const k in o) if (k !== 'tick' && k !== 'wyrds') h = hashValue(mix(h, strHash(k)), o[k]);
  return h;
}

/** The whole state's hash, from the rest's and each Wyrdling's. */
function combine(rest: number, wyrds: ArrayLike<number>): number {
  let h = mix(rest, wyrds.length);
  for (let i = 0; i < wyrds.length; i++) h = mix(h, wyrds[i]);
  return h;
}

/** Hash of the canonical SimData (no tick, no timers nobody reads). */
export function hashData(d: SimData): number {
  return combine(hashRest(d), d.wyrds.map(hashWyrd));
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

/** Exact equality of two Wyrdlings' canonical states (see hashWyrd: the coverage test checks it names every field). */
function sameWyrd(a: Wyrd, b: Wyrd): boolean {
  return a.st === b.st && sameNum(a.x, b.x) && sameNum(a.y, b.y) && sameNum(a.fx, b.fx) && sameNum(a.fy, b.fy) &&
    sameNum(a.vx, b.vx) && sameNum(a.vy, b.vy) && a.dir === b.dir && (UNTIMED.has(a.st) || sameNum(a.t, b.t)) &&
    sameNum(a.fallY, b.fallY) && a.climber === b.climber && a.glider === b.glider && sameNum(a.planks, b.planks) &&
    sameNum(a.frozen, b.frozen) && sameNum(a.id, b.id);
}

/**
 * Exact equality of two canonical SimData: what hashData hashes, compared without hashing. `apart`
 * (by index) names Wyrdlings left out of the comparison, which another proof covers.
 */
export function sameData(a: SimData, b: SimData, apart?: Uint8Array): boolean {
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
    for (let i = 0; i < a.wyrds.length; i++) if (!apart?.[i] && !sameWyrd(a.wyrds[i], b.wyrds[i])) return false;
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
  return combine(mix(hashRest(sim.d), th), sim.d.wyrds.map(hashWyrd)) >>> 0;
}


// ------------------------------------------------------------------ loop detection

/**
 * Tick periods the step reads besides the state (every `d.tick` in src/sim): gates open one slice
 * every `speed` ticks, crushers and fire jets run on `(tick + phase) % period`. A jet that never rests
 * (off 0) or never burns (on 0) acts the same on every tick, so it has no period. Spawning is also tick
 * driven; the detector never runs while spawns are pending. Sand alternates its scan direction with the
 * tick's parity, which only matters on a tick when a grain moves, and every moving grain writes the
 * terrain: so parity counts only if the terrain changed during the cycle.
 */
export function tickPeriods(sim: Sim): number[] {
  const L = sim.L;
  const jets = L.firejets.filter((f) => f.on > 0 && f.off > 0);
  const ps = [...L.gates.map((g) => g.speed), ...L.crushers.map((c) => c.period), ...jets.map((f) => f.on + f.off)];
  return [...new Set(ps)].filter((p) => p > 1);
}

// Groups of Wyrdlings pacing apart (a few between a wall and a Warden, more down in a pit) each repeat on
// their own period, and the whole run only after the least common multiple of them, often many minutes.
// So the detector also proves cycles apart. A Wyrdling is apart while it is passive (it writes nothing,
// plants nothing, and no other Wyrdling can see it), keeps out of every zone where the rest of the run
// would notice it, and everything its step reads stays unchanged. Then nothing it does reaches the rest,
// and nothing the rest does reaches it: once its own state recurs it repeats on its own forever, and the
// rest, compared without it, repeats on its own period. Both hold for the future by induction on the
// tick (each tick's step for one side reads only what earlier ticks already showed to repeat).

/** States that only read the world: no terrain written, no rune planted, and unseen by the others. */
const PASSIVE: ReadonlySet<WyrdState> = new Set<WyrdState>(['walk', 'fall', 'land', 'climb', 'hoist']);
/** States other Wyrdlings react to (the step's Warden, Weaver and dynamic-solid lists). */
const SEEN: ReadonlySet<WyrdState> = new Set<WyrdState>(['warden', 'weave', 'shrug', 'frozen']);
/** How far around where it stands a passive Wyrdling's step reads (px): the reads reach 5 across, 15 up and 8 down. */
const READ_X = 8, READ_UP = 20, READ_DOWN = 10;

/** One Wyrdling's stretch apart from the rest of the run. */
interface Apart {
  /** first tick of the stretch (-1: not apart now) */
  since: number;
  /** chunks its reads have reached since then (a flag per chunk) */
  chunks: Uint8Array;
  /** zones it has stood in since then (a flag per zone) */
  zones: Uint8Array;
  /** its states since then, by hash: the last tick each was seen, and the state itself */
  seen: Map<number, { tick: number; w: Wyrd }>;
  /** the last earlier tick of the stretch it was in its current state (-1: none) */
  prev: number;
}

type Zone = 'plate' | 'lever' | 'brittle' | 'gate' | 'jet' | 'crusher';

/** Something other Wyrdlings react to: a Warden, Weaver or frozen Wyrdling, or a boulder. */
interface Seen {
  obj: Wyrd | Body;
  /** the chunks it covers: cx0, cy0, cx1, cy1 */
  box: number[];
}

interface Anchor {
  tick: number;
  hash: number;
  /** hash of everything but the Wyrdlings (terrain included), and each Wyrdling's */
  rest: number;
  wh: Int32Array;
  d: SimData;
  /** chunk contents and versions when the anchor was taken (copies shared between anchors) */
  chunks: Uint8Array[];
  vers: Uint32Array;
}

export interface LoopProof {
  /** the run repeats from this tick on */
  from: number;
  /** ticks after which the whole run repeats (Infinity: too many to count) */
  period: number;
  /** tick the loop was proven */
  at: number;
  /** Wyrdlings proven to repeat apart, each on its own period (empty: the whole state recurred) */
  apart: { id: number; period: number }[];
  /** the period of the rest of the run, without them (`period` when none is apart) */
  rest: number;
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

function lcm(a: number, b: number): number {
  const m = (a / gcd(a, b)) * b;
  return m <= Number.MAX_SAFE_INTEGER ? m : Infinity;
}

/** A deep copy of plain data (what structuredClone does for SimData, holes in arrays included, faster). */
function plainCopy<T>(v: T): T {
  if (typeof v !== 'object' || v === null) return v;
  if (Array.isArray(v)) {
    const a = new Array(v.length);
    for (let i = 0; i < v.length; i++) if (i in v) a[i] = plainCopy(v[i]);
    return a as T;
  }
  const o: Record<string, unknown> = {};
  for (const k in v) o[k] = plainCopy((v as Record<string, unknown>)[k]);
  return o as T;
}

/**
 * Proves stalemates: call observe(sim) after every sim.step(), including each of several steps run in
 * one frame. Every `stride` ticks it keeps an exact copy of the state (an anchor), for `window` ticks;
 * every tick it hashes the current state and, when the hash matches an anchor's, compares the two
 * exactly. Equal states whose tick difference is a multiple of every tick period the step reads mean
 * the step will map them to equal states again, tick after tick: the future repeats forever, with no
 * save, death or lasting change (the counters and the terrain are part of the state), unless the player
 * acts. The same holds for the state without the Wyrdlings apart (see above), each of which recurred on
 * its own. A hash collision can never cause a verdict: every proof ends in an exact comparison.
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
  /** where the rest of the run could notice a passive Wyrdling: [x0, y0, x1, y1] inclusive, flattened;
   *  what each is (see harmless()), and since when it has been harmless (-1: not now) */
  private zones: number[] = [];
  private zoneOf: [Zone, number][] = [];
  private calm = new Int32Array(0);
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
  /** per chunk: the last tick its terrain, or anything seen in it, changed; and the chunks changed this tick */
  private changed = new Int32Array(0);
  private changedNow: number[] = [];
  private zoneAt: number[] = [];
  /** this tick's Wyrdling hashes */
  private wh = new Int32Array(0);
  private apart: (Apart | undefined)[] = [];
  /** what was seen last tick, by Wyrdling index (bodies: -1 - index), and the map reused for this tick */
  private seenBefore = new Map<number, Seen>();
  private seenNow = new Map<number, Seen>();
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
    this.forgetApart();
    this.proof = null;
    this.lastTick = -1;
  }

  /** Every stretch apart and every calm zone is followed tick by tick: a gap in the following ends them. */
  private forgetApart(): void {
    this.apart.length = 0;
    this.calm.fill(-1);
  }

  observe(sim: Sim): 'loop' | null {
    const d = sim.d;
    const same = sim === this.sim && sim.terrain === this.terrain;
    if (same && d.tick === this.lastTick && d.used === this.used) return this.proof ? 'loop' : null;
    this.changedNow.length = 0;
    if (!same || (d.tick !== this.lastTick && d.tick !== this.lastTick + 1)) this.start(sim);
    else if (d.tick !== this.lastTick) this.trackTerrain();
    this.lastTick = d.tick;
    this.lastHash = null;
    if (d.used !== this.used) {
      // a calling: the old anchors describe a run that no longer happens
      this.used = d.used;
      this.anchors.length = 0;
      this.forgetApart();
      this.proof = null;
    }
    if (d.finished || d.spawned < sim.total) {
      this.anchors.length = 0;
      this.forgetApart();
      this.proof = null;
      return null;
    }
    if (this.proof) return 'loop';

    const n = d.wyrds.length;
    if (this.wh.length !== n) this.wh = new Int32Array(n);
    for (let i = 0; i < n; i++) this.wh[i] = hashWyrd(d.wyrds[i]);
    const rest = mix(hashRest(d), this.terrainH);
    const hash = (this.lastHash = combine(rest, this.wh) >>> 0);
    const apart = this.trackApart(sim);
    for (let i = this.anchors.length - 1; i >= 0; i--) {
      const a = this.anchors[i];
      if ((a.hash !== hash && (!apart || a.rest !== rest)) || !this.phasesAgree(a.tick, d.tick)) continue;
      if (a.hash === hash) {
        if (!sameData(a.d, d) || !this.sameTerrain(a)) continue;
        this.proof = { from: a.tick, period: d.tick - a.tick, at: d.tick, apart: [], rest: d.tick - a.tick };
        return 'loop';
      }
      if (this.provenApart(a, d)) return 'loop';
    }
    while (this.anchors.length && this.anchors[0].tick < d.tick - this.window) this.anchors.shift();
    if (d.tick % this.stride === 0) this.anchor(hash, rest);
    return null;
  }

  private start(sim: Sim): void {
    this.sim = sim;
    this.terrain = sim.terrain;
    this.used = sim.d.used;
    this.anchors.length = 0;
    this.apart.length = 0;
    this.seenBefore.clear();
    this.proof = null;
    this.periods = tickPeriods(sim);
    const L = sim.L, z: number[] = [], of: [Zone, number][] = [];
    // plates, levers and brittle floors feel a Wyrdling, a closing gate stops for one, jets and crushers
    // kill on the tick (sliceBlocked, stepTriggers and hazards in sim.ts)
    L.plates.forEach((p, i) => { z.push(p.x - 1, p.y - 2, p.x + p.w, p.y + 1); of.push(['plate', i]); });
    L.levers.forEach((l, i) => { z.push(l.x - 2, l.y - 4, l.x + 2, l.y + 2); of.push(['lever', i]); });
    L.brittles.forEach((b, i) => { z.push(b.x, b.y - 1, b.x + b.w - 1, b.y + b.h - 2); of.push(['brittle', i]); });
    L.gates.forEach((g, i) => { z.push(g.x - 2, g.y, g.x + g.w + 1, g.y + g.h + 9); of.push(['gate', i]); });
    L.firejets.forEach((f, i) => { z.push(f.x - 5, f.y - f.h, f.x + 5, f.y + 10); of.push(['jet', i]); });
    L.crushers.forEach((c, i) => { z.push(c.x - 11, c.y - 16, c.x + 11, c.y + c.drop + 10); of.push(['crusher', i]); });
    this.zones = z;
    this.zoneOf = of;
    this.calm = new Int32Array(of.length).fill(-1);
    const t = sim.terrain, n = t.chunks.length;
    this.vers = t.vers.slice();
    this.chunkH = new Int32Array(n);
    this.terrainH = 0;
    for (let ci = 0; ci < n; ci++) {
      this.chunkH[ci] = chunkHash(t.chunks[ci]);
      this.terrainH ^= chunkCell(ci, this.chunkH[ci]);
    }
    this.terrainChanged = sim.d.tick;
    this.changed = new Int32Array(n).fill(sim.d.tick);
    this.copies = new Array(n);
    this.copyVers = new Uint32Array(n);
  }

  /** Rehash the chunks written since the last tick (a write always bumps the chunk's version). */
  private trackTerrain(): void {
    const t = this.terrain!, vers = t.vers, tick = this.lastTick + 1;
    for (let ci = 0; ci < vers.length; ci++) {
      if (vers[ci] === this.vers[ci]) continue;
      this.vers[ci] = vers[ci];
      const h = chunkHash(t.chunks[ci]);
      this.terrainH ^= chunkCell(ci, this.chunkH[ci]) ^ chunkCell(ci, h);
      this.chunkH[ci] = h;
      this.terrainChanged = tick;
      this.changed[ci] = tick;
      this.changedNow.push(ci);
    }
  }

  private phasesAgree(from: number, to: number): boolean {
    const dt = to - from;
    for (const p of this.periods) if (dt % p !== 0) return false;
    return this.terrainChanged <= from || dt % 2 === 0;
  }

  private anchor(hash: number, rest: number): void {
    const t = this.terrain!;
    for (let ci = 0; ci < t.chunks.length; ci++) {
      if (this.copies[ci] && this.copyVers[ci] === t.vers[ci]) continue;
      this.copies[ci] = t.chunks[ci].slice();
      this.copyVers[ci] = t.vers[ci];
    }
    this.anchors.push({
      tick: this.lastTick, hash, rest, wh: this.wh.slice(), d: plainCopy(this.sim!.d),
      chunks: this.copies.slice(), vers: this.copyVers.slice(),
    });
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

  // ---------------------------------------------------------------- cycles apart

  /** Chunk range [cx0, cy0, cx1, cy1] covering a box of world pixels. */
  private chunkBox(x0: number, y0: number, x1: number, y1: number): number[] {
    const t = this.terrain!;
    const c = (v: number, max: number) => Math.max(0, Math.min(max, Math.floor(v) >> CS_SHIFT));
    return [c(x0, t.cw - 1), c(y0, t.ch - 1), c(x1, t.cw - 1), c(y1, t.ch - 1)];
  }

  /** A plate held down by something that is never apart (a Warden, a Weaver at work, a boulder): one more on it changes nothing. */
  private firm(sim: Sim, i: number): boolean {
    const p = sim.L.plates[i], d = sim.d;
    for (const w of d.wyrds) {
      if (!isAlive(w) || w.st === 'tumble' || w.st === 'leap' || PASSIVE.has(w.st)) continue;
      if (w.x >= p.x - 1 && w.x < p.x + p.w + 1 && w.y >= p.y - 2 && w.y <= p.y + 1) return true;
    }
    for (const b of d.bodies) {
      if (!b.gone && b.x + b.r * 0.5 >= p.x && b.x - b.r * 0.5 <= p.x + p.w && b.y + b.r >= p.y - 2 && b.y + b.r <= p.y + 3) return true;
    }
    return false;
  }

  /**
   * Whether a passive Wyrdling in this zone goes unnoticed on the coming step, judged only by what is
   * never apart: a plate already held firmly, a lever already latched, a brittle floor already broken,
   * a gate not closing, a jet that cannot burn, a broken crusher. Over a proven cycle of the rest of the
   * run it stays so forever.
   */
  private harmless(sim: Sim, kind: Zone, i: number): boolean {
    const d = sim.d, L = sim.L;
    const on = (id: string): boolean => {
      const p = L.plates.findIndex((q) => q.id === id);
      if (p >= 0) return this.firm(sim, p);
      const l = L.levers.findIndex((q) => q.id === id);
      return l >= 0 && d.levers[l];
    };
    switch (kind) {
      case 'plate': return this.firm(sim, i);
      case 'lever': return d.levers[i];
      case 'brittle': return d.brittle[i] <= 0;
      case 'gate': {
        // stepGates: a gate only checks for Wyrdlings under it while it closes
        const g = L.gates[i];
        const vals = g.links.map((k) => (k.kind === 'plate' ? d.plates[k.idx] : d.levers[k.idx]));
        let want = g.mode === 'all' ? vals.every(Boolean) : vals.some(Boolean);
        if (g.invert) want = !want;
        return want || d.gates[i].open === 0;
      }
      case 'jet': {
        const f = L.firejets[i];
        return f.on === 0 || !!f.links?.some(on);
      }
      case 'crusher': return d.broken[i];
    }
  }

  /** The zones a point stands in, by index. */
  private zonesAt(x: number, y: number, out: number[]): number[] {
    const z = this.zones;
    out.length = 0;
    for (let i = 0; i < z.length; i += 4) if (x >= z[i] && y >= z[i + 1] && x <= z[i + 2] && y <= z[i + 3]) out.push(i >> 2);
    return out;
  }

  /** Note the chunks where anything other Wyrdlings react to appeared, moved, changed or went. */
  private trackSeen(d: SimData): void {
    const before = this.seenBefore, now = this.seenNow;
    now.clear();
    for (let i = 0; i < d.wyrds.length; i++) {
      const w = d.wyrds[i];
      if (!SEEN.has(w.st)) continue;
      const old = before.get(i);
      if (old && sameWyrd(old.obj as Wyrd, w)) { now.set(i, old); continue; }
      // a frozen Wyrdling is solid over its body; the others are seen at their feet
      const box = w.st === 'frozen' ? this.chunkBox(w.x - 3, w.y - 10, w.x + 3, w.y) : this.chunkBox(w.x, w.y, w.x, w.y);
      this.seenChanged(old, box);
      now.set(i, { obj: plainCopy(w), box });
    }
    for (let i = 0; i < d.bodies.length; i++) {
      const b = d.bodies[i];
      if (b.gone) continue;
      const old = before.get(-1 - i);
      if (old && sameValue(old.obj, b)) { now.set(-1 - i, old); continue; }
      const box = this.chunkBox(b.x - b.r - 1, b.y - b.r - 1, b.x + b.r + 1, b.y + b.r + 1);
      this.seenChanged(old, box);
      now.set(-1 - i, { obj: plainCopy(b), box });
    }
    for (const [k, old] of before) if (!now.has(k)) this.seenChanged(old, null);
    this.seenBefore = now;
    this.seenNow = before;
  }

  /** Mark the chunks something seen left and entered as changed this tick. */
  private seenChanged(old: Seen | undefined, box: number[] | null): void {
    const cw = this.terrain!.cw, tick = this.lastTick;
    for (const b of [old?.box, box]) {
      if (!b) continue;
      for (let cy = b[1]; cy <= b[3]; cy++) {
        for (let cx = b[0]; cx <= b[2]; cx++) {
          this.changed[cy * cw + cx] = tick;
          this.changedNow.push(cy * cw + cx);
        }
      }
    }
  }

  /** Follow each Wyrdling's stretch apart; returns how many are apart now and have recurred in it. */
  private trackApart(sim: Sim): number {
    const d = sim.d, tick = d.tick;
    // a guardian, its missiles and hazards, and a burning rune reach every Wyrdling: nobody is apart
    if ((d.boss && d.boss.hp > 0) || d.projectiles.length || d.hazards.length || d.charges.length) {
      this.forgetApart();
      return 0;
    }
    this.trackSeen(d);
    for (let z = 0; z < this.zoneOf.length; z++) {
      const [kind, k] = this.zoneOf[z];
      if (!this.harmless(sim, kind, k)) this.calm[z] = -1;
      else if (this.calm[z] < 0) this.calm[z] = tick;
    }
    const t = this.terrain!, cw = t.cw, now = this.changedNow, at = this.zoneAt;
    let ready = 0;
    for (let i = 0; i < d.wyrds.length; i++) {
      const w = d.wyrds[i];
      let a = this.apart[i];
      // a zone must have been harmless on the step that brought it there and on the next (a gate reads
      // where it stands on the next step, a jet the plates of the step before, a lever latches as it arrives)
      let noticed = !PASSIVE.has(w.st);
      if (!noticed) for (const z of this.zonesAt(w.x, w.y, at)) if (this.calm[z] < 0 || this.calm[z] >= tick) noticed = true;
      if (noticed) {
        if (a) a.since = -1;
        continue;
      }
      a ??= this.apart[i] = { since: -1, chunks: new Uint8Array(t.chunks.length), zones: new Uint8Array(this.zoneOf.length), seen: new Map(), prev: -1 };
      // what it reads changed since the stretch began (a chunk it read changed now, or one it reaches
      // now changed after the start): its state then no longer tells its future
      let fresh = a.since < 0;
      for (let k = 0; k < now.length && !fresh; k++) fresh = a.chunks[now[k]] === 1;
      const cx0 = Math.max(0, (w.x - READ_X) >> CS_SHIFT), cx1 = Math.min(cw - 1, (w.x + READ_X) >> CS_SHIFT);
      const cy0 = Math.max(0, (w.y - READ_UP) >> CS_SHIFT), cy1 = Math.min(t.ch - 1, (w.y + READ_DOWN) >> CS_SHIFT);
      for (let cy = cy0; cy <= cy1 && !fresh; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const ci = cy * cw + cx;
          if (a.chunks[ci]) continue;
          if (this.changed[ci] > a.since) { fresh = true; break; }
          a.chunks[ci] = 1;
        }
      }
      if (fresh || a.seen.size >= this.window) {
        a.since = tick;
        a.chunks.fill(0);
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) a.chunks[cy * cw + cx] = 1;
        a.zones.fill(0);
        a.seen.clear();
      }
      for (const z of at) a.zones[z] = 1;
      const e = a.seen.get(this.wh[i]);
      if (e && sameWyrd(e.w, w)) {
        a.prev = e.tick;
        e.tick = tick;
        ready++;
      } else {
        a.prev = -1;
        a.seen.set(this.wh[i], { tick, w: plainCopy(w) });
      }
    }
    return ready;
  }

  /**
   * Against anchor `a`, whose state without the Wyrdlings and terrain hashed like now's: the Wyrdlings
   * whose state differs must have been apart since the anchor and have recurred; the rest must be equal.
   */
  private provenApart(a: Anchor, d: SimData): boolean {
    const n = d.wyrds.length;
    if (a.wh.length !== n) return false;
    const out = new Uint8Array(n), apart: { id: number; period: number }[] = [];
    const rest = d.tick - a.tick;
    let period = rest, from = a.tick;
    for (let i = 0; i < n; i++) {
      if (a.wh[i] === this.wh[i]) continue;
      const s = this.apart[i];
      if (!s || s.since < 0 || s.since > a.tick || s.prev < 0) return false;
      // every zone it stood in has been harmless through the whole cycle of the rest, so it stays so
      for (let z = 0; z < s.zones.length; z++) if (s.zones[z] && (this.calm[z] < 0 || this.calm[z] > a.tick)) return false;
      out[i] = 1;
      apart.push({ id: d.wyrds[i].id, period: d.tick - s.prev });
      period = lcm(period, d.tick - s.prev);
      from = Math.max(from, s.prev);
    }
    if (!apart.length || !sameData(a.d, d, out) || !this.sameTerrain(a)) return false;
    this.proof = { from, period, at: d.tick, apart, rest };
    return true;
  }
}
