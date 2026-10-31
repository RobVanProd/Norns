// The Weave: a replay of one attempt, as the callings the player granted and the tick they were granted
// on. The simulation is deterministic, so a fresh Sim fed the same callings at the same ticks plays the
// same run, bit for bit. A Weave records which simulation and which level geometry it was made with, so a
// changed level or rules change marks old Weaves stale instead of replaying them into nonsense.
import { SKILLS, type SkillId } from './constants';
import type { LevelDef } from './level';
import type { Sim } from './sim';

/** Bump whenever a change to src/sim can make an old Weave play out differently. */
export const SIM_VERSION = 1;

export interface WeaveEntry {
  /** sim.d.tick when the calling was granted (between steps, before the step from this tick) */
  tick: number;
  /** wyrdling id */
  id: number;
  skill: SkillId;
  /** where the wyrdling stood when it was granted: lets a replay notice that it went out of step */
  x: number;
  y: number;
}

export interface Weave {
  v: number;
  level: string;
  hash: number;
  entries: WeaveEntry[];
  /** tick the player cut the threads (sim.finishNow()) */
  cut?: number;
}

// Text, music, lighting and decor never reach the simulation: editing them must not invalidate Weaves.
const PRESENTATION_KEYS = new Set(['id', 'name', 'realm', 'intro', 'hints', 'music', 'ambient', 'solution', 'solutionSaves']);
const PRESENTATION_ENTITIES = new Set(['decor', 'light']);

/** JSON with sorted keys (undefined members dropped, like JSON.stringify), so key order never matters. */
function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined ? 'null' : canonicalJson(x))).join(',') + ']';
  const o = v as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(o).sort()) if (o[k] !== undefined) parts.push(JSON.stringify(k) + ':' + canonicalJson(o[k]));
  return '{' + parts.join(',') + '}';
}

/** FNV-1a (32-bit) over the UTF-16 code units of a string. */
export function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable hash of everything in a level that the simulation reads. */
export function levelHash(def: LevelDef): number {
  const sim: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(def)) if (!PRESENTATION_KEYS.has(k)) sim[k] = v;
  sim.entities = def.entities.filter((e) => !PRESENTATION_ENTITIES.has(e.type));
  return fnv1a(canonicalJson(sim));
}

/** A Weave recorded with another simulation version or another shape of this level would not replay. */
export function isStale(w: Weave, def: LevelDef): boolean {
  return w.v !== SIM_VERSION || w.level !== def.id || w.hash !== levelHash(def);
}

/**
 * Records an attempt as it is played. When Rewind restores a snapshot, call rewind(tick) with its tick:
 * record() refuses to write into the past without it.
 */
export class WeaveRecorder {
  readonly weave: Weave;
  constructor(def: LevelDef) {
    this.weave = { v: SIM_VERSION, level: def.id, hash: levelHash(def), entries: [] };
  }

  /** Call right after sim.assign(id, skill) returned true. */
  record(sim: Sim, id: number, skill: SkillId): WeaveEntry {
    const w = this.weave;
    const tick = sim.d.tick;
    const last = w.entries[w.entries.length - 1];
    if (w.cut !== undefined || (last && tick < last.tick)) throw new Error('weave: record after a cut or back in time (call rewind first)');
    const wy = sim.d.wyrds[id];
    const e: WeaveEntry = { tick, id, skill, x: wy.x, y: wy.y };
    w.entries.push(e);
    return e;
  }

  /** The player cut the threads (call alongside sim.finishNow()). */
  cut(sim: Sim): void {
    this.weave.cut = sim.d.tick;
  }

  /** Rewind restored the snapshot of `tick`: it was taken before any calling granted on that tick. */
  rewind(tick: number): void {
    const w = this.weave;
    while (w.entries.length && w.entries[w.entries.length - 1].tick >= tick) w.entries.pop();
    if (w.cut !== undefined && w.cut >= tick) delete w.cut;
  }
}

export interface Desync {
  tick: number;
  entry: WeaveEntry | null;
  reason: 'moved' | 'refused' | 'missed';
}

/** Plays a Weave back into a fresh Sim: call apply(sim) before every sim.step(), like SolutionPlayer. */
export class Replayer {
  readonly weave: Weave;
  private next = 0;
  private cutDone = false;
  /** the first point where the replay did not match the recording, if any */
  desync: Desync | null = null;

  constructor(weave: Weave) {
    this.weave = weave;
  }

  isStale(def: LevelDef): boolean {
    return isStale(this.weave, def);
  }

  /** Grant every calling due on this tick, then cut the threads if the recording did. Returns the entries applied. */
  apply(sim: Sim): WeaveEntry[] {
    const out: WeaveEntry[] = [];
    const es = this.weave.entries, tick = sim.d.tick;
    while (this.next < es.length && es[this.next].tick <= tick) {
      const e = es[this.next++];
      if (e.tick < tick) { this.fail(tick, e, 'missed'); continue; }
      const w = sim.d.wyrds[e.id];
      if (!w || w.x !== e.x || w.y !== e.y) this.fail(tick, e, 'moved');
      if (sim.assign(e.id, e.skill)) out.push(e);
      else this.fail(tick, e, 'refused');
    }
    const cut = this.weave.cut;
    if (cut !== undefined && !this.cutDone && cut <= tick) {
      this.cutDone = true;
      if (cut < tick) this.fail(tick, null, 'missed');
      sim.finishNow();
    }
    return out;
  }

  get finished(): boolean {
    return this.next >= this.weave.entries.length && (this.weave.cut === undefined || this.cutDone);
  }

  private fail(tick: number, entry: WeaveEntry | null, reason: Desync['reason']): void {
    if (!this.desync) this.desync = { tick, entry, reason };
  }
}

// ------------------------------------------------------------------ compact text form
// "<version>.<base64url payload>". Payload: level id (length + chars), level hash, entry count, then per
// entry: tick delta, wyrdling id, skill index, zigzag x, zigzag y (all unsigned LEB128 varints), then
// the cut (0 = none, else delta from the last entry + 1).

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function putVarint(out: number[], n: number): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`weave: cannot encode ${n}`);
  while (n >= 128) {
    out.push((n % 128) + 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
}

function zigzag(n: number): number {
  if (!Number.isSafeInteger(n)) throw new RangeError(`weave: cannot encode ${n}`);
  return n >= 0 ? n * 2 : -n * 2 - 1;
}

function toBase64Url(bytes: number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let k = 0; k < chars; k++) s += B64[(n >> (18 - 6 * k)) & 63];
  }
  return s;
}

function fromBase64Url(s: string): number[] | null {
  if (s.length % 4 === 1) return null;
  const out: number[] = [];
  let acc = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64.indexOf(s[i]);
    if (v < 0) return null;
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
  }
  // leftover bits must be zero padding, or the string was not made by toBase64Url
  if (acc & ((1 << bits) - 1)) return null;
  return out;
}

export function encodeWeave(w: Weave): string {
  const b: number[] = [];
  putVarint(b, w.level.length);
  for (let i = 0; i < w.level.length; i++) {
    const c = w.level.charCodeAt(i);
    if (c > 127) throw new RangeError('weave: level ids must be ASCII');
    b.push(c);
  }
  putVarint(b, w.hash >>> 0);
  putVarint(b, w.entries.length);
  let prev = 0;
  for (const e of w.entries) {
    const skill = SKILLS.indexOf(e.skill);
    if (skill < 0) throw new RangeError(`weave: unknown skill ${e.skill}`);
    putVarint(b, e.tick - prev); // throws if ticks go backwards
    putVarint(b, e.id);
    putVarint(b, skill);
    putVarint(b, zigzag(e.x));
    putVarint(b, zigzag(e.y));
    prev = e.tick;
  }
  if (w.cut !== undefined && w.cut < prev) throw new RangeError('weave: cut before the last calling');
  putVarint(b, w.cut === undefined ? 0 : w.cut - prev + 1);
  return `${w.v}.${toBase64Url(b)}`;
}

/** Parse encodeWeave's output; null if the string is not a well-formed Weave. */
export function decodeWeave(s: string): Weave | null {
  const m = /^([1-9][0-9]{0,8})\.([A-Za-z0-9_-]*)$/.exec(s.trim());
  if (!m) return null;
  const b = fromBase64Url(m[2]);
  if (!b) return null;
  let p = 0;
  const safe = (n: number): number => {
    if (!Number.isSafeInteger(n)) throw new Error('number too large');
    return n;
  };
  const varint = (): number => {
    let n = 0, mul = 1;
    for (let k = 0; k < 8; k++) {
      if (p >= b.length) throw new Error('truncated');
      const c = b[p++];
      n += (c & 127) * mul;
      // past 2^53 the sum rounds; encodeWeave never writes such a number
      if (c < 128) return safe(n);
      mul *= 128;
    }
    throw new Error('varint too long');
  };
  const unzig = (z: number): number => (z % 2 === 0 ? z / 2 : -(z + 1) / 2);
  try {
    const len = varint();
    if (len > 64 || p + len > b.length) return null;
    let level = '';
    for (let i = 0; i < len; i++) level += String.fromCharCode(b[p++]);
    const hash = varint();
    if (hash > 0xffffffff) return null;
    const n = varint();
    if (n > b.length) return null; // every entry takes at least five bytes
    const entries: WeaveEntry[] = [];
    let tick = 0;
    for (let i = 0; i < n; i++) {
      tick = safe(tick + varint());
      const id = varint();
      const skill = SKILLS[varint()];
      if (!skill) return null;
      entries.push({ tick, id, skill, x: unzig(varint()), y: unzig(varint()) });
    }
    const cut = varint();
    if (p !== b.length) return null;
    const w: Weave = { v: Number(m[1]), level, hash, entries };
    if (cut > 0) w.cut = safe(tick + cut - 1);
    return w;
  } catch {
    return null;
  }
}
