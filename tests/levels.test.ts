// Every level must be provably beatable (scripted solution reaches the 2nd-star target and the
// Golden Spindle) and must not be beatable by doing nothing.
import { describe, expect, it } from 'vitest';
import { ALL_LEVELS } from '../src/levels';
import { runLevel } from './helpers';

const MAX = 30 * 60 * 8;

describe('levels', () => {
  it('have unique ids', () => {
    const ids = ALL_LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  for (const def of ALL_LEVELS) {
    describe(`${def.id} ${def.name}`, () => {
      it('is consistent', () => {
        expect(def.quota).toBeLessThanOrEqual(def.target);
        expect(def.target).toBeLessThanOrEqual(def.wyrdlings);
        expect(def.entities.filter((e) => e.type === 'entrance').length).toBe(1);
        expect(def.entities.filter((e) => e.type === 'exit').length).toBe(1);
      });
      it('scripted solution reaches the target (and the spindle)', () => {
        const r = runLevel(def, def.solution, MAX);
        expect(r.fired, 'every scripted step fired').toBe(def.solution.length);
        expect(r.sim.d.saved).toBeGreaterThanOrEqual(def.solutionSaves ?? def.target);
        if (def.entities.some((e) => e.type === 'spindle')) expect(r.sim.d.spindle).toBe(true);
        if (def.boss) expect(r.sim.d.boss!.hp).toBe(0);
        expect(r.sim.d.finished).toBe(true);
      });
      it('doing nothing fails the quota', () => {
        const r = runLevel(def, [], MAX);
        expect(r.sim.d.saved).toBeLessThan(def.quota);
      });
    });
  }
});
