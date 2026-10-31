// The verdict on the moves the roadmap names, queued callings, and Foresight's early stop. The truth test
// over every level's scripted callings is in verdict-<realm>.test.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_LEVELS } from '../src/levels';
import type { SkillId } from '../src/sim/constants';
import { ForesightJob, VerdictJob, foresee, verdict } from '../src/sim/foresight';
import type { LevelDef } from '../src/sim/level';
import { Sim } from '../src/sim/sim';
import { flatLevel } from './helpers';

const level = (id: string): LevelDef => ALL_LEVELS.find((l) => l.id === id)!;

/** Step until Wyrdling `nth`, walking right, stands at or past x and can take the calling. */
function walkTo(def: LevelDef, nth: number, x: number, skill: SkillId): Sim {
  const sim = Sim.create(def);
  for (let i = 0; i < 5000; i++) {
    const w = sim.d.wyrds[nth];
    if (w && w.dir > 0 && w.x >= x && sim.canAssign(w, skill)) return sim;
    sim.step();
  }
  throw new Error(`#${nth} never reached x ${x}`);
}

describe('verdict', () => {
  it('m1: a Digger at x=44 misses the quota, at x=46 it saves everyone', () => {
    const def = level('m1');
    const early = verdict(walkTo(def, 0, 44, 'digger'), { id: 0, skill: 'digger' });
    const late = verdict(walkTo(def, 0, 46, 'digger'), { id: 0, skill: 'digger' });
    expect(early.saved).toBeLessThan(def.quota);
    expect(late.saved).toBeGreaterThanOrEqual(def.target);
    expect([early.end, late.end]).toEqual(['settled', 'settled']);
  });

  it('m2: the gorge bridge alone, at x=191 or x=196, does not meet the quota', () => {
    const def = level('m2');
    for (const x of [191, 196]) expect(verdict(walkTo(def, 0, x, 'weaver'), { id: 0, skill: 'weaver' }).saved, `x=${x}`).toBeLessThan(def.quota);
  });

  it('says when nothing more will happen: the n3 null run is a proven loop', () => {
    const v = verdict(Sim.create(level('n3')));
    expect(v.end).toBe('loop');
    expect(v.saved).toBeLessThan(level('n3').quota);
    expect(v.focus).toBe(-1);
  });

  it('weighs queued callings exactly as granting them on their ticks', () => {
    const def = level('m1');
    const sim = Sim.create(def);
    for (let i = 0; i < 40; i++) sim.step();
    const queued = verdict(sim, [{ id: 0, skill: 'digger', tick: 62 }]);
    const real = sim.clone();
    while (real.d.tick < 62) real.step();
    expect(queued.from).toBe(40);
    expect(queued).toMatchObject({ ...verdict(real, { id: 0, skill: 'digger' }), from: 40 });
    expect(queued.saved).toBe(def.wyrdlings);
  });

  it('gives the same answer in time slices', () => {
    const sim = Sim.create(level('n3'));
    const once = verdict(sim);
    const job = new VerdictJob(sim);
    let frames = 0;
    while (!job.advance(0)) frames++;
    expect(frames).toBeGreaterThan(10);
    expect(job.result).toEqual(once);
  });
});

describe('foresight', () => {
  const step = Sim.prototype.step;
  let steps = 0;
  afterEach(() => { Sim.prototype.step = step; });
  const counting = () => {
    steps = 0;
    Sim.prototype.step = function (this: Sim) { steps++; step.call(this); };
  };

  it('stops once nothing can change a fate, with the same fates', () => {
    // one Wyrdling walks off a cliff: decided long before a 20 s horizon
    const def = flatLevel({ terrain: [{ op: 'rect', mat: 'Earth', x: 0, y: 120, w: 100, h: 40 }], entities: [{ type: 'entrance', x: 30, y: 80 }, { type: 'exit', x: 290, y: 60 }] });
    const sim = Sim.create(def);
    counting();
    const fate = foresee(sim, 600);
    expect(fate.ends.get(0)?.kind).toBe('dead');
    expect(steps).toBeLessThan(400);
    // a standing Warden is settled for the sim, but a prediction runs on to the finish in case a hazard reaches it
    const guard = Sim.create(flatLevel({ skills: { warden: 1 } }));
    while (guard.d.wyrds[0]?.st !== 'walk') guard.step();
    counting();
    const held = foresee(guard, 600, { id: 0, skill: 'warden' });
    expect(held.ends.get(0)?.kind).toBe('alive');
    expect(steps).toBeGreaterThanOrEqual(45);
    expect(steps).toBeLessThan(100);
  });

  it('grants queued callings on their tick', () => {
    const def = level('m1');
    const sim = Sim.create(def);
    for (let i = 0; i < 40; i++) sim.step();
    const job = new ForesightJob(sim, 300, [{ id: 0, skill: 'digger', tick: 62 }]);
    job.advance();
    const real = sim.clone();
    while (real.d.tick < 62) real.step();
    const now = foresee(real, 278, { id: 0, skill: 'digger' });
    expect(job.fate.focus).toBe(0);
    expect(job.fate.applied).toBe(true);
    expect(job.fate.ends.get(0)).toEqual({ ...now.ends.get(0)!, t: now.ends.get(0)!.t + 22 });
  });
});
