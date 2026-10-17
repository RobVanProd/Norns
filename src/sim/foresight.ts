// Skuld's Foresight: run the real simulation forward on a clone and record each wyrdling's fate.
import type { SkillId } from './constants';
import type { Sim } from './sim';

export type FateKind = 'dead' | 'saved' | 'alive';

export interface FateEnd {
  kind: FateKind;
  x: number;
  y: number;
  /** ticks from now */
  t: number;
  cause?: string;
}

export interface Fate {
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
}

/**
 * An incremental prediction: advance it a few milliseconds per frame so heavy levels
 * (pouring snow, many bodies) never block rendering.
 */
export class ForesightJob {
  readonly fate: Fate;
  private c: Sim;
  private t = 0;
  private sample: number;
  done = false;

  constructor(sim: Sim, horizon: number, override?: { id: number; skill: SkillId }, sample = 2) {
    this.c = sim.clone();
    this.sample = sample;
    this.fate = {
      from: sim.d.tick, horizon, paths: new Map(), ends: new Map(), bodies: new Map(), blasts: [], saved: 0, dead: 0, applied: false,
    };
    if (override) this.fate.applied = this.c.assign(override.id, override.skill);
    this.record();
  }

  private record(): void {
    const fate = this.fate, c = this.c;
    for (const w of c.d.wyrds) {
      if (fate.ends.has(w.id) || w.st === 'gone') continue;
      let p = fate.paths.get(w.id);
      if (!p) { p = []; fate.paths.set(w.id, p); }
      p.push(w.x, w.y);
    }
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
    const fate = this.fate, c = this.c;
    const start = budgetMs === Infinity ? 0 : performance.now();
    while (this.t < fate.horizon && !c.d.finished) {
      const t = ++this.t;
      c.step();
      for (const e of c.events) {
        if (e.type === 'death' && e.id !== undefined && !fate.ends.has(e.id)) {
          fate.ends.set(e.id, { kind: 'dead', x: e.x, y: e.y, t, cause: e.s });
          fate.dead++;
          fate.paths.get(e.id)?.push(e.x, e.y);
        } else if (e.type === 'saved' && e.id !== undefined && !fate.ends.has(e.id)) {
          fate.ends.set(e.id, { kind: 'saved', x: e.x, y: e.y, t });
          fate.saved++;
          fate.paths.get(e.id)?.push(e.x, e.y);
        } else if (e.type === 'blast') {
          fate.blasts.push(e.x, e.y, t, e.v ?? 13);
        }
      }
      if (t % this.sample === 0) this.record();
      if (budgetMs !== Infinity && (t & 3) === 0 && performance.now() - start > budgetMs) return false;
    }
    for (const w of c.d.wyrds) {
      if (!fate.ends.has(w.id) && w.st !== 'gone') fate.ends.set(w.id, { kind: 'alive', x: w.x, y: w.y, t: fate.horizon });
    }
    this.done = true;
    return true;
  }
}

export function foresee(sim: Sim, horizon: number, override?: { id: number; skill: SkillId }, sample = 2): Fate {
  const job = new ForesightJob(sim, horizon, override, sample);
  job.advance();
  return job.fate;
}
