// Skuld's Foresight: run the real simulation forward on a clone and record each wyrdling's fate.
import type { SkillId } from './constants';
import type { Sim } from './sim';
import type { WyrdState } from './state';
import { CS, CS_SHIFT } from './terrain';

export type FateKind = 'dead' | 'saved' | 'alive';

export interface FateEnd {
  kind: FateKind;
  x: number;
  y: number;
  /** ticks from now */
  t: number;
  cause?: string;
  /** alive at the horizon: its state then */
  st?: WyrdState;
  /** alive at the horizon: what last turned it back, if anything did */
  turned?: 'wall' | 'warden';
  /** alive at the horizon and pacing: it turned back at both ends of this stretch of floor */
  trap?: { lo: number; hi: number; y: number };
}

/** What a calling leaves in the terrain by the horizon, as horizontal runs [x, y, length, ...]. */
export interface Ghost {
  /** new solid ground (Weaver planks) */
  added: number[];
  /** dug or blasted out */
  carved: number[];
  /** carved pixels against ground that stays: the outline of a tunnel or crater */
  edge: number[];
}

/** Fates of the same wyrdlings over the same ticks without the calling. */
export interface Baseline {
  from: number;
  horizon: number;
  ends: Map<number, FateEnd>;
}

export interface Fate extends Baseline {
  /** tick the prediction started from */
  from: number;
  horizon: number;
  /** wyrdling id → flat [x0,y0,x1,y1,...] sampled every `sample` ticks */
  paths: Map<number, number[]>;
  ends: Map<number, FateEnd>;
  /** body id → flat path */
  bodies: Map<number, number[]>;
  /** predicted detonations / boss impacts: [x, y, ticksFromNow, radius] */
  blasts: number[];
  saved: number;
  dead: number;
  /** the override assignment was accepted */
  applied: boolean;
  /** the wyrdling given the override calling (-1 for a plain prediction) */
  focus: number;
  skill: SkillId | null;
  /** paths of everyone but the focus stop here (a projected branch follows only its own wyrdling further) */
  pathHorizon: number;
  /** what the focus' calling leaves in the terrain (branches only) */
  ghost: Ghost | null;
  /** the same ticks without the calling (projected branches, which outrun the base prediction) */
  shadow: Baseline | null;
}

export interface ForesightOptions {
  /** record path points every `sample` ticks */
  sample?: number;
  /** record other wyrdlings' paths only this far (default: the whole horizon) */
  pathHorizon?: number;
  /** also run the level without the override, as the baseline this branch is judged against */
  shadow?: boolean;
}

/** Per-wyrdling turn bookkeeping, to tell "turned back once" from "pacing between two walls". */
interface Track {
  dir: number;
  st: WyrdState;
  turns: number;
  by: 'wall' | 'warden';
  /** x of the last turn */
  at: number;
  /** left the floor (fell, flew, worked) since the last turn */
  moved: boolean;
  /** the last two turns bounded one walk along the same floor, [lo, hi] at height y; walking out of it ends the pacing */
  paced: boolean;
  lo: number;
  hi: number;
  y: number;
}

const GHOST_CELL = 2; // the ghost mask is kept at 4×4 px cells
const WORK_STATES: WyrdState[] = ['weave', 'bash', 'mine', 'dig'];

/**
 * An incremental prediction: advance it a few milliseconds per frame so heavy levels
 * (pouring snow, many bodies) never block rendering.
 */
export class ForesightJob {
  readonly fate: Fate;
  private c: Sim;
  private t = 0;
  private sample: number;
  private tracks: Track[] = [];
  private shadow: Sim | null = null;
  private shadowTracks: Track[] = [];
  /** terrain chunks at the start: copy-on-write keeps them unchanged, so they diff against the end */
  private startChunks: Uint8Array[] | null = null;
  /** 4×4 px cells the focus worked in or blasted */
  private mask: Uint8Array | null = null;
  private runes: number[] = [];
  done = false;

  constructor(sim: Sim, horizon: number, override?: { id: number; skill: SkillId }, opts: ForesightOptions = {}) {
    this.c = sim.clone();
    this.sample = opts.sample ?? 2;
    this.fate = {
      from: sim.d.tick, horizon, paths: new Map(), ends: new Map(), bodies: new Map(), blasts: [], saved: 0, dead: 0, applied: false,
      focus: override?.id ?? -1, skill: override?.skill ?? null, pathHorizon: Math.min(horizon, opts.pathHorizon ?? horizon), ghost: null, shadow: null,
    };
    if (opts.shadow) {
      this.shadow = sim.clone();
      this.fate.shadow = { from: sim.d.tick, horizon, ends: new Map() };
    }
    if (override) {
      this.fate.applied = this.c.assign(override.id, override.skill);
      if (this.fate.applied) this.startChunks = this.c.terrain.chunks.slice();
    }
    watch(this.c, this.tracks);
    if (this.shadow) watch(this.shadow, this.shadowTracks);
    this.record();
  }

  private record(): void {
    const fate = this.fate, c = this.c;
    const all = this.t <= fate.pathHorizon;
    for (const w of c.d.wyrds) {
      if (fate.ends.has(w.id) || w.st === 'gone' || (!all && w.id !== fate.focus)) continue;
      let p = fate.paths.get(w.id);
      if (!p) { p = []; fate.paths.set(w.id, p); }
      p.push(w.x, w.y);
    }
    if (!all) return;
    for (const b of c.d.bodies) {
      if (b.gone) continue;
      let p = fate.bodies.get(b.id);
      if (!p) { p = []; fate.bodies.set(b.id, p); }
      p.push(b.x, b.y);
    }
  }

  /** Step the prediction until done or the time budget (ms) runs out. Returns true when complete. */
  advance(budgetMs = Infinity): boolean {
    if (this.done) return true;
    const fate = this.fate, c = this.c, sh = this.shadow;
    const start = budgetMs === Infinity ? 0 : performance.now();
    let prev = start;
    while (this.t < fate.horizon && !(c.d.finished && (!sh || sh.d.finished))) {
      const t = ++this.t;
      c.step();
      for (const e of c.events) {
        if (e.type === 'death' && e.id !== undefined && !fate.ends.has(e.id)) {
          fate.ends.set(e.id, { kind: 'dead', x: e.x, y: e.y, t, cause: e.s });
          fate.dead++;
          if (t <= fate.pathHorizon || e.id === fate.focus) fate.paths.get(e.id)?.push(e.x, e.y);
        } else if (e.type === 'saved' && e.id !== undefined && !fate.ends.has(e.id)) {
          fate.ends.set(e.id, { kind: 'saved', x: e.x, y: e.y, t });
          fate.saved++;
          if (t <= fate.pathHorizon || e.id === fate.focus) fate.paths.get(e.id)?.push(e.x, e.y);
        } else if (e.type === 'blast') {
          const r = e.v ?? 13;
          fate.blasts.push(e.x, e.y, t, r);
          if (this.runes.includes(e.x)) this.markBox(e.x - r - 1, e.y - r - 1, e.x + r + 1, e.y + r + 1);
        } else if (e.type === 'rune_plant' && e.id === fate.focus && this.startChunks) {
          // charges only fall straight down, so the blast that matters is the one at this x
          this.runes.push(e.x);
        }
      }
      watch(c, this.tracks);
      if (this.startChunks) {
        const w = c.d.wyrds[fate.focus];
        if (w && WORK_STATES.includes(w.st)) this.markBox(w.x - 8, w.y - 11, w.x + 8, w.y + 5);
      }
      if (sh) {
        sh.step();
        const ends = fate.shadow!.ends;
        for (const e of sh.events) {
          if ((e.type === 'death' || e.type === 'saved') && e.id !== undefined && !ends.has(e.id)) {
            ends.set(e.id, e.type === 'death' ? { kind: 'dead', x: e.x, y: e.y, t, cause: e.s } : { kind: 'saved', x: e.x, y: e.y, t });
          }
        }
        watch(sh, this.shadowTracks);
      }
      if (t % this.sample === 0 && !c.d.finished) this.record();
      if (budgetMs !== Infinity) {
        // stop before a tick that, costing what the last one did, would overrun the budget (pouring snow
        // makes single ticks heavy); a tick always runs, so a job never stalls
        const now = performance.now();
        const tickMs = now - prev;
        prev = now;
        if (now - start + tickMs > budgetMs) return false;
      }
    }
    finish(c, fate.ends, this.tracks, fate.horizon);
    if (sh) finish(sh, fate.shadow!.ends, this.shadowTracks, fate.horizon);
    // no mask: the calling never dug, wove or blasted (Leaper, Warden...), so there is nothing to show
    if (this.mask && this.startChunks) fate.ghost = this.ghost(this.startChunks, this.mask);
    this.startChunks = null;
    this.mask = null;
    this.shadow = null;
    this.done = true;
    return true;
  }

  private markBox(x0: number, y0: number, x1: number, y1: number): void {
    const T = this.c.terrain;
    const mw = (T.w >> GHOST_CELL) + 1;
    const mask = (this.mask ??= new Uint8Array(mw * ((T.h >> GHOST_CELL) + 1)));
    const cx0 = Math.max(0, x0) >> GHOST_CELL, cx1 = Math.min(T.w - 1, x1) >> GHOST_CELL;
    const cy0 = Math.max(0, y0) >> GHOST_CELL, cy1 = Math.min(T.h - 1, y1) >> GHOST_CELL;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) mask[cy * mw + cx] = 1;
  }

  /** Pixels that changed between the start and the end of the branch, where the focus worked or blasted. */
  private ghost(start: Uint8Array[], mask: Uint8Array): Ghost {
    const T = this.c.terrain, mw = (T.w >> GHOST_CELL) + 1;
    const g: Ghost = { added: [], carved: [], edge: [] };
    for (let ci = 0; ci < T.chunks.length; ci++) {
      const a = start[ci], b = T.chunks[ci];
      if (a === b) continue; // never written: identical
      const x0 = (ci % T.cw) << CS_SHIFT, y0 = Math.floor(ci / T.cw) << CS_SHIFT;
      for (let ly = 0; ly < CS && y0 + ly < T.h; ly++) {
        const y = y0 + ly;
        // open run starts per kind (-1 = none); lx === CS closes every run at the chunk edge
        let ra = -1, rc = -1, re = -1;
        for (let lx = 0; lx <= CS; lx++) {
          const x = x0 + lx;
          let added = false, carved = false, edge = false;
          if (lx < CS && x < T.w && mask[(y >> GHOST_CELL) * mw + (x >> GHOST_CELL)]) {
            const m0 = a[(ly << CS_SHIFT) | lx], m1 = b[(ly << CS_SHIFT) | lx];
            added = m0 === 0 && m1 !== 0;
            carved = m0 !== 0 && m1 === 0;
            edge = carved && (T.get(x - 1, y) !== 0 || T.get(x + 1, y) !== 0 || T.get(x, y - 1) !== 0 || T.get(x, y + 1) !== 0);
          }
          if (added && ra < 0) ra = x;
          if (!added && ra >= 0) { g.added.push(ra, y, x - ra); ra = -1; }
          if (carved && rc < 0) rc = x;
          if (!carved && rc >= 0) { g.carved.push(rc, y, x - rc); rc = -1; }
          if (edge && re < 0) re = x;
          if (!edge && re >= 0) { g.edge.push(re, y, x - re); re = -1; }
        }
      }
    }
    return g;
  }
}

/** Update turn bookkeeping after a step: a walker whose direction flipped was turned back. */
function watch(c: Sim, tracks: Track[]): void {
  for (const w of c.d.wyrds) {
    const k = tracks[w.id];
    if (!k) { tracks[w.id] = { dir: w.dir, st: w.st, turns: 0, by: 'wall', at: w.x, moved: false, paced: false, lo: 0, hi: 0, y: 0 }; continue; }
    if (w.dir !== k.dir && w.st === 'walk' && (k.st === 'walk' || k.st === 'weave')) {
      k.paced = k.turns > 0 && !k.moved;
      k.lo = Math.min(k.at, w.x);
      k.hi = Math.max(k.at, w.x);
      k.y = w.y;
      k.at = w.x;
      k.turns++;
      k.moved = false;
      k.by = 'wall';
      for (const o of c.d.wyrds) if (o.st === 'warden' && Math.abs(o.x - w.x) <= 6 && Math.abs(o.y - w.y) <= 8) k.by = 'warden';
    } else if (w.st !== 'walk' && w.st !== 'wait') k.moved = true;
    // the way opened (a gate, a bridge, a boulder rolled off): it walked past where it used to turn
    else if (k.paced && (w.x < k.lo - 2 || w.x > k.hi + 2)) k.paced = false;
    k.dir = w.dir;
    k.st = w.st;
  }
}

/** Everyone still undecided at the horizon is alive: note how they stand. */
function finish(c: Sim, ends: Map<number, FateEnd>, tracks: Track[], horizon: number): void {
  for (const w of c.d.wyrds) {
    if (ends.has(w.id) || w.st === 'gone') continue;
    const k = tracks[w.id];
    const e: FateEnd = { kind: 'alive', x: w.x, y: w.y, t: horizon, st: w.st };
    if (k && k.turns > 0) e.turned = k.by;
    if (k && k.paced && !k.moved) e.trap = { lo: k.lo, hi: k.hi, y: k.y };
    ends.set(w.id, e);
  }
}

export function foresee(sim: Sim, horizon: number, override?: { id: number; skill: SkillId }, sample = 2): Fate {
  const job = new ForesightJob(sim, horizon, override, { sample });
  job.advance();
  return job.fate;
}

/** How a branch's fates differ from its baseline's, over the ticks both cover. */
export interface FateDelta {
  /** died in the baseline but not in the branch (by a clear margin), or home only in the branch */
  saved: number;
  /** pacing between walls in the baseline, out of that stretch and not pacing in the branch */
  freed: number;
  /** alive or home in the baseline, dead in the branch */
  lost: number;
  /** home in the baseline, still out in the branch */
  delayed: number;
  /** dead either way */
  stillLost: number;
  /** ticks from the branch start to its first loss / first gain (Infinity when none) */
  firstLoss: number;
  firstGain: number;
  /** length of the compared stretch, in ticks */
  window: number;
}

/** A death the branch avoids only in the window's last second may just be postponed: don't call it saved. */
export const SAVE_MARGIN = 30;

type Outcome = 'dead' | 'trapped' | 'free' | 'saved';

function outcome(e: FateEnd, from: number, end: number): Outcome {
  if (e.kind !== 'alive' && from + e.t <= end) return e.kind;
  return e.trap ? 'trapped' : 'free';
}

/** Ended away from the stretch it paced in the baseline: past either turning point, or off that floor. */
function escaped(trap: { lo: number; hi: number; y: number }, e: FateEnd): boolean {
  return e.x < trap.lo - 2 || e.x > trap.hi + 2 || Math.abs(e.y - trap.y) > 16;
}

export function compareFates(base: Baseline, branch: Baseline): FateDelta {
  const start = Math.max(base.from, branch.from);
  const end = Math.min(base.from + base.horizon, branch.from + branch.horizon);
  const d: FateDelta = { saved: 0, freed: 0, lost: 0, delayed: 0, stillLost: 0, firstLoss: Infinity, firstGain: Infinity, window: Math.max(0, end - start) };
  for (const [id, b] of branch.ends) {
    const a = base.ends.get(id);
    // not in the baseline: spawned after it ended, or decided before it began
    if (!a) continue;
    const ka = outcome(a, base.from, end), kb = outcome(b, branch.from, end);
    if (ka === kb) {
      if (ka === 'dead') d.stillLost++;
      continue;
    }
    if (kb === 'dead') {
      d.lost++;
      d.firstLoss = Math.min(d.firstLoss, b.t);
    } else if (ka === 'dead') {
      const at = base.from + a.t;
      if (kb === 'saved' || end - at >= SAVE_MARGIN) {
        d.saved++;
        d.firstGain = Math.min(d.firstGain, at - branch.from);
      }
    } else if (kb === 'saved') {
      d.saved++;
      d.firstGain = Math.min(d.firstGain, b.t);
    } else if (ka === 'saved') d.delayed++;
    else if (ka === 'trapped' && escaped(a.trap!, b)) {
      // merely turning at other moments within the same stretch (a Warden in it) is not freedom
      d.freed++;
      d.firstGain = Math.min(d.firstGain, end - branch.from);
    }
    // free → trapped is a Warden doing its job: neither a loss nor a gain
  }
  return d;
}
