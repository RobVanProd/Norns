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

export function foresee(sim: Sim, horizon: number, override?: { id: number; skill: SkillId }, sample = 2): Fate {
  const c = sim.clone();
  const fate: Fate = {
    from: sim.d.tick, horizon, paths: new Map(), ends: new Map(), bodies: new Map(), blasts: [], saved: 0, dead: 0, applied: false,
  };
  if (override) fate.applied = c.assign(override.id, override.skill);
  const record = () => {
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
  };
  record();
  for (let t = 1; t <= horizon && !c.d.finished; t++) {
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
    if (t % sample === 0) record();
  }
  for (const w of c.d.wyrds) {
    if (!fate.ends.has(w.id) && w.st !== 'gone') fate.ends.set(w.id, { kind: 'alive', x: w.x, y: w.y, t: horizon });
  }
  return fate;
}
