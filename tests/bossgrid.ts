// The one-calling search for boss fights: grant a single calling to one of the first Wyrdlings at one of a
// grid of ticks, then let the fight play out with nothing more. A guardian that falls to one calling plays
// itself, so tests/bossfight.ts runs a coarse grid and scripts/bossgrid.ts a fine one. A grid is a sample,
// not a proof: a pass means no plan on it wins.
import { SKILLS, type SkillId } from '../src/sim/constants';
import type { LevelDef } from '../src/sim/level';
import { Sim } from '../src/sim/sim';
import { isAlive } from '../src/sim/state';

export interface GridOptions {
  /** first and last tick of the grid, and its step */
  from: number;
  to: number;
  every: number;
  /** callings go to each of the `first` Wyrdlings still about at that tick (lowest numbers first) */
  first: number;
  /** ticks each run gets after its calling before it counts as not won */
  horizon: number;
}

export interface GridResult {
  /** callings the sim accepted (each one run) */
  runs: number;
  /** callings refused (the Wyrdling not out yet, or not able to take it then) */
  refused: number;
  /** runs that met the quota, as "tick #n skill" */
  wins: string[];
  /** the most guardian wounds any single calling dealt, and which */
  mostHits: number;
  best: string;
  /** runs still undecided when their horizon ran out (no quota, the guardian standing) */
  undecided: number;
}

export function oneCallingGrid(def: LevelDef, o: GridOptions): GridResult {
  const skills = SKILLS.filter((s) => (def.skills[s] ?? 0) > 0) as SkillId[];
  const out: GridResult = { runs: 0, refused: 0, wins: [], mostHits: 0, best: '-', undecided: 0 };
  const base = Sim.create(def);
  for (let T = o.from; T <= o.to && !base.d.finished; T += o.every) {
    while (base.d.tick < T && !base.d.finished) base.step();
    const about = base.d.wyrds.filter(isAlive).slice(0, o.first).map((w) => w.id);
    for (const n of about) {
      for (const skill of skills) {
        const sim = base.clone();
        if (!sim.assign(n, skill)) { out.refused++; continue; }
        out.runs++;
        const end = T + o.horizon;
        while (!sim.d.finished && sim.d.tick < end && sim.d.saved < def.quota) {
          sim.step();
          // too few left (out or still to come) to make the quota: decided
          if (sim.d.saved + sim.aliveCount + sim.total - sim.d.spawned < def.quota) break;
        }
        const what = `t${T} #${n} ${skill}`, b = sim.d.boss!;
        if (sim.d.saved >= def.quota) out.wins.push(what);
        else if (!sim.d.finished && sim.d.tick >= end && sim.d.saved + sim.aliveCount + sim.total - sim.d.spawned >= def.quota) out.undecided++;
        if (b.maxHp - Math.max(0, b.hp) > out.mostHits) { out.mostHits = b.maxHp - Math.max(0, b.hp); out.best = what; }
      }
    }
  }
  return out;
}
