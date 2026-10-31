import { afterEach, describe, expect, it } from 'vitest';
import { loadSave } from '../src/game/save';
import { ALL_LEVELS } from '../src/levels';
import { Sim } from '../src/sim/sim';
import { SolutionPlayer } from '../src/sim/solution';
import { Timeline } from '../src/sim/timeline';

/** Play a level's scripted solution for `ticks`, recording like the game loop does. */
function play(id: string, ticks: number): { sim: Sim; tl: Timeline } {
  const def = ALL_LEVELS.find((l) => l.id === id)!;
  const sim = Sim.create(def);
  const tl = new Timeline();
  tl.record(sim);
  const sol = new SolutionPlayer(def.solution);
  for (let i = 0; i < ticks && !sim.d.finished; i++) {
    sol.apply(sim);
    sim.step();
    tl.record(sim);
  }
  return { sim, tl };
}

describe('rewind timeline', () => {
  it('reaches back to the first tick of a long run with a bounded number of snapshots', () => {
    const { sim, tl } = play('n4', 2400); // n4 runs about 81 s
    expect(tl.oldestTick).toBe(0);
    const t = sim.d.tick;
    // every tick for 5 s + every 10 ticks to 20 s + every 60 ticks before, plus the boundaries
    expect(tl.length).toBeLessThanOrEqual(151 + 46 + Math.ceil(t / 60) + 2);
    let s: Sim | null = sim;
    let last = t;
    while ((s = tl.back(last))) {
      expect(s.d.tick).toBeLessThan(last);
      last = s.d.tick;
    }
    expect(last).toBe(0);
  });

  it('steps back one tick at a time through the last five seconds', () => {
    const { sim, tl } = play('m2', 600);
    for (let k = 1; k <= 150; k++) {
      const s = tl.back(sim.d.tick - k + 1);
      expect(s?.d.tick).toBe(sim.d.tick - k);
    }
  });

  it('a restored snapshot replays exactly the same future', () => {
    const def = ALL_LEVELS.find((l) => l.id === 'u3')!;
    const { sim, tl } = play('u3', 700);
    const from = tl.back(sim.d.tick - 300 + 1)!;
    // replay from the snapshot with the same scripted solution, skipping steps that already fired
    const sol = new SolutionPlayer(def.solution);
    const ref = Sim.create(def);
    while (ref.d.tick < from.d.tick) { sol.apply(ref); ref.step(); }
    expect(JSON.stringify(from.d)).toBe(JSON.stringify(ref.d));
    while (from.d.tick < sim.d.tick) { sol.apply(from); from.step(); }
    expect(JSON.stringify(from.d)).toBe(JSON.stringify(sim.d));
  });
});

describe('save migration', () => {
  const g = globalThis as unknown as { localStorage?: Storage };
  afterEach(() => { delete g.localStorage; });

  it("refunds the retired Urðr's Memory upgrade once", () => {
    const store = new Map<string, string>();
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as Storage;
    store.set('norns.save.v1', JSON.stringify({ v: 1, threads: 10, upgrades: { foresight: 1, rewind: 2 } }));
    const s = loadSave();
    expect(s.threads).toBe(10 + 15 + 35);
    expect(s.upgrades).toEqual({ foresight: 1 });
    store.set('norns.save.v1', JSON.stringify(s));
    expect(loadSave().threads).toBe(60);
  });
});
