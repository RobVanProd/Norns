// The paused verdict must be exactly true: for every scripted calling, granted on its recorded tick and on
// each of the 10 ticks either side, the verdict equals what really happens when the player grants it and
// nothing more. One file per realm (verdict-<realm>.test.ts) so vitest runs them in parallel.
import { expect, it } from 'vitest';
import type { SkillId } from '../src/sim/constants';
import { VERDICT_TICKS, verdict } from '../src/sim/foresight';
import type { LevelDef } from '../src/sim/level';
import type { Sim } from '../src/sim/sim';
import { playExact, recordSolution } from './helpers';

/** Ticks either side of each recorded calling that are checked too. */
const AROUND = 10;

/** The ground truth: grant the calling, then run with no further callings to the finish or the limit. */
function actual(sim: Sim, id: number, skill: SkillId, until: number): 'finished' | 'cap' {
  expect(sim.assign(id, skill)).toBe(true);
  while (!sim.d.finished && sim.d.tick < until) sim.step();
  return sim.d.finished ? 'finished' : 'cap';
}

export function describeVerdicts(levels: LevelDef[]): void {
  for (const def of levels) {
    it(`${def.id}: the verdict is what granting each scripted calling (±${AROUND} ticks) and nothing more comes to`, () => {
      const rec = recordSolution(def);
      const steps = def.solution;
      const ends: Record<string, number> = {};
      let cases = 0, slowest = 0;
      steps.forEach((step, i) => {
        const f = rec.fired[i];
        // every other calling at its recorded tick, this one held back
        const at = rec.fired.map((t, j) => (j === i ? -1 : t));
        const run = rec.at(Math.max(0, f - AROUND));
        for (let T = run.d.tick; T <= f + AROUND && !run.d.finished; T++) {
          const w = run.d.wyrds[step.nth];
          if (w && run.canAssign(w, step.skill)) {
            const until = Math.max(VERDICT_TICKS, T + 30 * 60);
            const t0 = performance.now();
            const v = verdict(run, { id: step.nth, skill: step.skill }, until);
            slowest = Math.max(slowest, performance.now() - t0);
            const real = run.clone();
            const how = actual(real, step.nth, step.skill, until);
            const where = `step ${i} (${step.skill} #${step.nth}) at tick ${T}`;
            expect(v.applied, where).toBe(true);
            expect(v.from, where).toBe(T);
            expect({ saved: v.saved, dead: v.dead, spindle: v.spindle, bossHp: v.bossHp }, where)
              .toEqual({ saved: real.d.saved, dead: real.d.dead, spindle: real.d.spindle, bossHp: real.d.boss ? Math.max(0, real.d.boss.hp) : null });
            // settled runs finish; a proven loop is still going at the limit, as is a run judged there
            expect(how, where).toBe(v.end === 'settled' ? 'finished' : 'cap');
            ends[v.end] = (ends[v.end] ?? 0) + 1;
            cases++;
          }
          playExact(run, steps, at, T + 1);
        }
      });
      expect(cases).toBeGreaterThan(0);
      console.log(`${def.id}: ${cases} verdicts checked (${Object.entries(ends).map(([k, n]) => `${n} ${k}`).join(', ')}), slowest ${slowest.toFixed(0)} ms`);
    }, 120_000);
  }
}
