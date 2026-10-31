// Skuld's Vision as a staged hint, planned from a level's scripted solution:
//   1 marks where and when the route's first calling happens (a marker with a countdown);
//   2 also names that calling;
//   3 plays the first half of the route, each step marked, named and its terrain ghost shown first;
//   4 plays the whole quota-and-target route the same way.
// The route leaves out every step that serves only the spindle, so no tier gives the third star away;
// a step that serves the quota and the spindle is shown only as part of the quota route.
// No DOM here: the tests plan every level's Vision headlessly.
import { ForesightJob, type Ghost } from '../sim/foresight';
import type { LevelDef, SolutionStep } from '../sim/level';
import { Sim } from '../sim/sim';
import { stepReady } from '../sim/solution';

export type VisionTier = 1 | 2 | 3 | 4;

export const VISION_TIERS: Record<VisionTier, string> = { 1: 'Where and when', 2: 'Which calling', 3: 'The first steps', 4: 'The whole path' };

/** How far ahead a step's terrain ghost looks: long enough for a Weaver's 12 planks or a long tunnel. */
const GHOST_TICKS = 30 * 15;
/** The route is planned this far at most (the level tests' 8 minutes). */
const PLAN_TICKS = 30 * 60 * 8;

/** The steps a Vision may show, in solution order: every step that serves anything but the spindle. */
export function visionRoute(def: LevelDef): SolutionStep[] {
  return def.solution.filter((s) => (s.purpose ?? []).some((p) => p !== 'spindle'));
}

/** One route step as the Vision plays it. */
export interface VisionMark {
  step: SolutionStep;
  /** tick it is granted on (before that tick's step) */
  tick: number;
  /** the Wyrdling granted it, and where it stood */
  id: number;
  x: number;
  y: number;
  /** what the calling leaves in the terrain, if it digs, weaves or blasts (planned on request) */
  ghost: Ghost | null;
}

/** How many of the route's marks a tier shows: the first only for tiers 1 and 2, the first half
 *  (at least one) for 3, all of them for 4. */
export function shownMarks(tier: VisionTier, n: number): number {
  if (n === 0) return 0;
  return tier <= 2 ? 1 : tier === 3 ? Math.max(1, Math.ceil(n / 2)) : n;
}

/** How many marks a tier grants: tiers 1 and 2 only point, 3 and 4 play what they show. */
export function playedMarks(tier: VisionTier, n: number): number {
  return tier >= 3 ? shownMarks(tier, n) : 0;
}

/** Ticks a partial Vision runs on after its last shown mark, so the moment (and what the last
 *  calling starts) can be seen before it fades. */
export function lingerTicks(tier: VisionTier): number {
  return tier <= 2 ? 75 : 150;
}

/**
 * Play the route headlessly, the way Skuld's Vision plays it (each step on the first tick its
 * conditions hold, in solution order), and note each step's mark. The first `ghosts` marks also get
 * the terrain ghost of their calling, from a Foresight branch at that moment. Planning stops after
 * the first `limit` marks (a tier that shows only those needn't wait for the rest).
 */
export function planVision(def: LevelDef, ghosts = 0, limit = Infinity): VisionMark[] {
  const route = visionRoute(def);
  const sim = Sim.create(def);
  const done = route.map(() => false);
  const marks: VisionMark[] = [];
  const want = Math.min(route.length, limit);
  while (sim.d.tick < PLAN_TICKS && !sim.d.finished && marks.length < want) {
    route.forEach((s, i) => {
      if (done[i] || marks.length >= want || !stepReady(sim, s)) return;
      const w = sim.d.wyrds[s.nth];
      const before = marks.length < ghosts ? sim.clone() : null;
      if (!sim.assign(s.nth, s.skill)) return;
      done[i] = true;
      let ghost: Ghost | null = null;
      if (before) {
        const job = new ForesightJob(before, GHOST_TICKS, { id: s.nth, skill: s.skill });
        job.advance();
        ghost = job.fate.ghost;
      }
      marks.push({ step: s, tick: sim.d.tick, id: s.nth, x: w.x, y: w.y, ghost });
    });
    sim.step();
  }
  return marks;
}
