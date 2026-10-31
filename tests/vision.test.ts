// Skuld's Vision as a staged hint (src/game/vision.ts): every tier plays only the quota-and-target
// route, which leaves out each step that serves only the spindle, and that route still wins.
import { describe, expect, it } from 'vitest';
import { planVision, playedMarks, shownMarks, visionRoute, type VisionTier } from '../src/game/vision';
import { ALL_LEVELS } from '../src/levels';
import { Sim } from '../src/sim/sim';
import { LEVEL_TICKS, runLevel } from './helpers';

/** Grant the first `n` marks at their planned ticks, as the Vision scene does, and run to the end. */
function replayMarks(def: (typeof ALL_LEVELS)[number], n: number): Sim {
  const marks = planVision(def).slice(0, n);
  const sim = Sim.create(def);
  while (sim.d.tick < LEVEL_TICKS && !sim.d.finished) {
    for (const m of marks) if (m.tick === sim.d.tick) expect(sim.assign(m.id, m.step.skill), `${m.step.skill} #${m.id} lands at ${m.tick}`).toBe(true);
    sim.step();
  }
  return sim;
}

describe('staged Vision', () => {
  it('shows one mark, then half the route, then all of it; only tiers 3 and 4 play them', () => {
    const tiers: VisionTier[] = [1, 2, 3, 4];
    expect(tiers.map((t) => shownMarks(t, 5))).toEqual([1, 1, 3, 5]);
    expect(tiers.map((t) => playedMarks(t, 5))).toEqual([0, 0, 3, 5]);
    expect(tiers.map((t) => shownMarks(t, 1))).toEqual([1, 1, 1, 1]);
    expect(shownMarks(4, 0)).toBe(0);
  });

  for (const def of ALL_LEVELS) {
    describe(`${def.id} ${def.name}`, () => {
      const route = visionRoute(def);

      it('never shows a step that serves only the spindle', () => {
        for (const s of def.solution) {
          const spindleOnly = (s.purpose ?? []).every((p) => p === 'spindle');
          expect(route.includes(s), `${s.skill} #${s.nth} (${(s.purpose ?? []).join(', ')})`).toBe(!spindleOnly);
        }
      });

      it('plays a route that meets the target (and fells the guardian) on its own', () => {
        const r = runLevel(def, route, LEVEL_TICKS);
        expect(r.fired, 'every route step fired').toBe(route.length);
        expect(r.sim.d.saved).toBeGreaterThanOrEqual(def.solutionSaves ?? def.target);
        if (def.boss) expect(r.sim.d.boss!.hp).toBe(0);
        // the spindle comes along only where a step the route needs also serves it
        if (r.sim.d.spindle) expect(route.some((s) => s.purpose?.includes('spindle'))).toBe(true);
      });

      it('plans each route step once, in the order they fire, and replays them exactly', () => {
        const marks = planVision(def);
        expect(marks.length).toBe(route.length);
        for (let i = 1; i < marks.length; i++) expect(marks[i].tick).toBeGreaterThanOrEqual(marks[i - 1].tick);
        const full = runLevel(def, route, LEVEL_TICKS).sim;
        const again = replayMarks(def, marks.length);
        expect([again.d.saved, again.d.dead, again.d.spindle, again.d.tick]).toEqual([full.d.saved, full.d.dead, full.d.spindle, full.d.tick]);
      });
    });
  }
});
