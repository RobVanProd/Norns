// Share links, copied results and Skuld's par. Whatever a link or a record claims is proven the same way:
// the Weave is replayed headless into a fresh Sim (no rendering, a few dozen ms), and only what that
// replay does counts. Determinism makes the replay exact on this engine; other engines are untested.
import type { LevelDef } from '../sim/level';
import { Sim } from '../sim/sim';
import { SolutionPlayer } from '../sim/solution';
import { Replayer, SIM_VERSION, decodeWeave, encodeWeave, isStale, type Weave } from '../sim/weave';

/** What a finished run achieved. */
export interface RunFacts {
  saved: number;
  /** callings granted */
  used: number;
  /** the tick the run finished on */
  ticks: number;
  spindle: boolean;
  /** null on a level without a guardian */
  bossDefeated: boolean | null;
}

/** A replay is given up after this many ticks (30 minutes of game time): a guard against a crafted link
 *  that never ends, far longer than any attempt is played. */
const REPLAY_LIMIT = 30 * 60 * 30;
/** The scripted solutions all end by themselves well within this (tests/levels.test.ts). */
const PAR_LIMIT = 30 * 60 * 8;

function factsOf(sim: Sim): RunFacts {
  const b = sim.d.boss;
  return { saved: sim.d.saved, used: sim.d.used, ticks: sim.d.tick, spindle: sim.d.spindle, bossDefeated: b ? b.hp <= 0 : null };
}

export function sameFacts(a: RunFacts, b: RunFacts): boolean {
  return a.saved === b.saved && a.used === b.used && a.ticks === b.ticks && a.spindle === b.spindle && a.bossDefeated === b.bossDefeated;
}

/** Replay a Weave headless into a fresh Sim and say what it achieves. Null if it was recorded on another
 *  version of the simulation or of this level, goes out of step anywhere (a calling that lands on another
 *  spot or tick, or is refused), or has not finished by tick `limit`. */
export function verifyWeave(def: LevelDef, w: Weave, limit = REPLAY_LIMIT): RunFacts | null {
  if (isStale(w, def)) return null;
  const sim = Sim.create(def);
  const rp = new Replayer(w);
  while (!sim.d.finished && sim.d.tick <= limit) {
    rp.apply(sim);
    if (rp.desync) return null;
    if (sim.d.finished) break;
    sim.step();
  }
  // a calling still to come after the end never happened in any real run
  return sim.d.finished && rp.finished ? factsOf(sim) : null;
}

const parMemo = new WeakMap<LevelDef, RunFacts>();

/** Skuld's par: what the level's scripted solution achieves. Worked out once per level per session. */
export function skuldPar(def: LevelDef): RunFacts {
  let p = parMemo.get(def);
  if (!p) {
    const sim = Sim.create(def);
    const sol = new SolutionPlayer(def.solution);
    while (!sim.d.finished && sim.d.tick < PAR_LIMIT) {
      sol.apply(sim);
      sim.step();
    }
    parMemo.set(def, (p = factsOf(sim)));
  }
  return p;
}

// ------------------------------------------------------------------ links

/** The game's own address, without query or hash: where a copied result and a replay link point. */
export function gameUrl(loc: { origin: string; pathname: string }): string {
  return loc.origin + loc.pathname;
}

/** A link that opens the game and replays this Weave. The encoded Weave is URL-safe as it is. */
export function shareUrl(base: string, w: Weave): string {
  return `${base}#weave=${encodeWeave(w)}`;
}

/** The encoded Weave in a location hash ('#weave=1.AbC…'), or null if the hash holds none. */
export function weaveFromHash(hash: string): string | null {
  const m = /(?:^#?|&)weave=([^&]*)/.exec(hash);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** What a shared link holds: a Weave to watch, one that cannot be replayed here (and why), or nothing. */
export type SharedWeave =
  | { kind: 'ok'; w: Weave; level: LevelDef; facts: RunFacts }
  /** another simulation version, a level this version lacks, or another shape of the level: not replayed */
  | { kind: 'old'; w: Weave; level: LevelDef | null; why: 'version' | 'level' }
  /** this version and level, but the replay goes out of step (a damaged link, or another engine's arithmetic) */
  | { kind: 'step'; w: Weave; level: LevelDef }
  | { kind: 'bad' };

/** Read a shared Weave and prove it by replaying it headless before anything is shown. */
export function readShared(text: string, levels: LevelDef[]): SharedWeave {
  const w = decodeWeave(text);
  if (!w) return { kind: 'bad' };
  const level = levels.find((l) => l.id === w.level) ?? null;
  if (w.v !== SIM_VERSION) return { kind: 'old', w, level, why: 'version' };
  if (!level || isStale(w, level)) return { kind: 'old', w, level, why: 'level' };
  const facts = verifyWeave(level, w);
  return facts ? { kind: 'ok', w, level, facts } : { kind: 'step', w, level };
}

/** The spoiler-free result a player copies: level, counts and stars, then the game's address. No
 *  positions, ticks or Weave: nothing in it says how the level was solved. */
export function resultText(level: LevelDef, run: { saved: number; used: number }, mask: number, url: string): string {
  const n = level.entities.some((e) => e.type === 'spindle') ? 3 : 2;
  let stars = '';
  for (let k = 0; k < n; k++) stars += mask & (1 << k) ? '★' : '☆';
  const callings = `${run.used} calling${run.used === 1 ? '' : 's'}`;
  return `NORNS · ${level.name} · ${run.saved}/${level.wyrdlings} saved · ${callings} · ${stars}\n${url}`;
}

// ------------------------------------------------------------------ the player's own past runs

/** Counts of integer `values` in at most `maxBins` equal bins spanning lo..hi (both included), and the bin
 *  a value falls in. Each whole number gets its own bin when the span allows. */
export function histogram(values: number[], lo: number, hi: number, maxBins: number): { counts: number[]; bin: (v: number) => number } {
  const span = Math.max(1, hi - lo + 1);
  const bins = Math.max(1, Math.min(maxBins, span));
  const bin = (v: number) => Math.max(0, Math.min(bins - 1, Math.floor(((v - lo) * bins) / span)));
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) counts[bin(v)]++;
  return { counts, bin };
}

/** Game time as m:ss.t (records differ by fractions of a second). */
export function fmtTicks(ticks: number): string {
  const ds = Math.floor(ticks / 3);
  return `${Math.floor(ds / 600)}:${String(Math.floor(ds / 10) % 60).padStart(2, '0')}.${ds % 10}`;
}
