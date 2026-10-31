// Settlement and stalemate proofs. The loop detector may stay silent when it cannot prove a loop, but it
// must never claim one that is not there: these tests check it on real stalemates, on every scripted
// solution, and check the two facts its proof rests on (the canonical state covers every field; the
// next step depends on nothing else).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_LEVELS } from '../src/levels';
import { TICK_RATE } from '../src/sim/constants';
import type { LevelDef, SolutionStep } from '../src/sim/level';
import { SLEEP_TICKS } from '../src/sim/physics';
import { LoopDetector, UNTIMED, hashData, sameData, settled, stateHash, tickPeriods, type LoopProof } from '../src/sim/settle';
import { Sim } from '../src/sim/sim';
import { SolutionPlayer } from '../src/sim/solution';
import type { SimData, Wyrd } from '../src/sim/state';
import type { Terrain } from '../src/sim/terrain';
import { flatLevel } from './helpers';
import { LEGACY_M2, LEGACY_N3, LEGACY_N4 } from './levels-legacy';

const level = (id: string): LevelDef => ALL_LEVELS.find((l) => l.id === id)!;
const SOLUTION_MAX = 30 * 60 * 8;
/** Loops longer than this are not run through to find where they began. */
const LONG = 30 * 60 * 10;

interface Watched {
  sim: Sim;
  det: LoopDetector;
  /** tick of the first 'loop' verdict (-1 if none) */
  at: number;
  /** first tick of the repeating stretch, from the canonical hashes the detector computed */
  loopStart: number;
  /** last spawn, calling, save, death or terrain write */
  lastChange: number;
  observeMs: number[];
}

/** Run with scripted callings, observing every tick until the first loop verdict (or the end). */
function watch(def: LevelDef, steps: SolutionStep[], maxTicks: number, stopAtLoop = true): Watched {
  const sim = Sim.create(def);
  const sol = new SolutionPlayer(steps);
  const det = new LoopDetector();
  const hashes: (number | null)[] = [];
  const observeMs: number[] = [];
  let at = -1, lastChange = 0;
  let { saved, dead, spawned } = sim.d;
  let vers = sim.terrain.vers.slice();
  while (sim.d.tick < maxTicks && !sim.d.finished) {
    if (sol.apply(sim).length) lastChange = sim.d.tick;
    sim.step();
    const d = sim.d;
    if (d.saved !== saved || d.dead !== dead || d.spawned !== spawned) {
      ({ saved, dead, spawned } = d);
      lastChange = d.tick;
    }
    if (sim.terrain.vers.some((v, i) => v !== vers[i])) {
      vers = sim.terrain.vers.slice();
      lastChange = d.tick;
    }
    const t0 = performance.now();
    const v = det.observe(sim);
    observeMs.push(performance.now() - t0);
    hashes[d.tick] = det.hash;
    if (v === 'loop' && at < 0) {
      at = d.tick;
      if (stopAtLoop) break;
    }
  }
  let loopStart = -1;
  const p = det.loop?.period;
  if (p && p < LONG) {
    // a proof of cycles apart comes before the whole state ever repeats: run on (on a copy) until it has
    // repeated, which also checks the claimed period
    const run = sim.clone();
    while (run.d.tick < at + p) {
      run.step();
      hashes[run.d.tick] = stateHash(run);
    }
    for (let t = 0; t + p < hashes.length && loopStart < 0; t++) if (hashes[t] != null && hashes[t] === hashes[t + p]) loopStart = t;
  }
  return { sim, det, at, loopStart, lastChange, observeMs };
}

function report(name: string, r: Watched): void {
  const lp = r.det.loop!;
  console.log(
    `${name}: loop of ${lp.period} ticks${lp.apart.length ? ` (${lp.apart.length} Wyrdlings apart)` : ''} from tick ${r.loopStart}, proven at tick ${r.at}: ` +
    `${r.at - r.loopStart} ticks (${((r.at - r.loopStart) / TICK_RATE).toFixed(1)} s) after it began, ` +
    `${r.at - r.lastChange} ticks after the last state change (tick ${r.lastChange})`,
  );
}

function sameTerrain(a: Terrain, b: Terrain): boolean {
  for (let ci = 0; ci < a.chunks.length; ci++) {
    const x = a.chunks[ci], y = b.chunks[ci];
    if (x !== y && x.some((m, i) => m !== y[i])) return false;
  }
  return true;
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/** A Wyrdling's canonical state (the timer zeroed where nothing reads it). */
const canon = (w: Wyrd): Wyrd => ({ ...w, t: UNTIMED.has(w.st) ? 0 : w.t });

/**
 * Check a proof over `ticks` ticks from the one it was made on, by running the run on: every Wyrdling
 * apart is in the same state one of its periods later, the rest of the state one `rest` later, and no
 * count changes. Returns the ticks compared.
 */
function holds(sim: Sim, proof: LoopProof, ticks: number, label: string): number {
  const d0 = sim.d;
  const mask = new Uint8Array(d0.wyrds.length);
  for (const { id } of proof.apart) mask[id] = 1;
  const groups = new Map<number, number[]>([[proof.rest, []]]);
  for (const { id, period } of proof.apart) groups.set(period, [...(groups.get(period) ?? []), id]);
  let compared = 0;
  for (const [p, ids] of groups) {
    const a = sim.clone(), b = sim.clone();
    for (let i = 0; i < p; i++) b.step();
    for (let k = 0; k < ticks; k++) {
      const at = `${label}: tick ${a.d.tick} vs ${b.d.tick}`;
      if (p === proof.rest) {
        expect(sameData(a.d, b.d, mask), `${at}, the rest`).toBe(true);
        expect(sameTerrain(a.terrain, b.terrain), `${at}, terrain`).toBe(true);
      }
      for (const id of ids) expect(canon(b.d.wyrds[id]), `${at}, Wyrdling ${id}`).toEqual(canon(a.d.wyrds[id]));
      expect([b.d.saved, b.d.dead, b.d.spindle, b.d.boss?.hp], at).toEqual([d0.saved, d0.dead, d0.spindle, d0.boss?.hp]);
      a.step();
      b.step();
      compared++;
    }
  }
  return compared;
}

describe('settled', () => {
  it('waits for every Wyrdling to be saved, dead or a Warden, and for every spawn and rune', () => {
    const def = flatLevel({ wyrdlings: 2, rate: 60, skills: { warden: 1 } });
    const sim = Sim.create(def);
    const stepUntil = (done: () => boolean) => { for (let i = 0; i < 2000 && !done(); i++) sim.step(); expect(done()).toBe(true); };
    expect(settled(sim)).toBe(false);
    stepUntil(() => sim.d.wyrds[0]?.st === 'walk');
    expect(settled(sim), 'one walking, one still to spawn').toBe(false);
    // the second one stands guard behind the first
    stepUntil(() => sim.d.wyrds[1]?.st === 'walk');
    expect(sim.assign(1, 'warden')).toBe(true);
    expect(settled(sim), 'one walking').toBe(false);
    stepUntil(() => sim.d.wyrds[0].st === 'exit');
    expect(settled(sim), 'saved and warden').toBe(true);
    expect(sim.d.finished, 'before the sim finishes').toBe(false);
    stepUntil(() => sim.d.finished);
    expect(settled(sim)).toBe(true);
  });

  it('is not settled while a rune burns', () => {
    const def = flatLevel({ wyrdlings: 1, skills: { blast: 1, warden: 1 } });
    const sim = Sim.create(def);
    for (let i = 0; i < 500 && sim.d.wyrds[0]?.st !== 'walk'; i++) sim.step();
    expect(sim.assign(0, 'blast')).toBe(true);
    for (let i = 0; i < 500 && sim.d.wyrds[0].st !== 'walk'; i++) sim.step();
    expect(sim.d.charges.length).toBe(1);
    expect(sim.assign(0, 'warden')).toBe(true);
    expect(settled(sim)).toBe(false);
  });

  it('counts a cut as settled', () => {
    const sim = Sim.create(level('m1'));
    for (let i = 0; i < 100; i++) sim.step();
    expect(settled(sim)).toBe(false);
    sim.finishNow();
    expect(settled(sim)).toBe(true);
  });
});

describe('loop detector', () => {
  describe('proves stalemates within 10 s of their start', () => {
    const cases: [string, LevelDef, SolutionStep[]][] = [
      ['n3 null run', level('n3'), []],
      ['wave-1 n4 null run', LEGACY_N4, []],
      ['wave-1 m2, second Weaver at x=320', LEGACY_M2, [{ nth: 0, x: 196, skill: 'weaver' }, { nth: 0, x: 320, dir: 1, skill: 'weaver' }]],
    ];
    for (const [name, def, steps] of cases) {
      it(name, () => {
        const r = watch(def, steps, 30 * 60 * 3);
        expect(r.sim.d.used, 'every calling was granted').toBe(steps.length);
        expect(r.at, 'a loop was proven').toBeGreaterThan(0);
        expect(r.sim.d.saved).toBeLessThan(def.wyrdlings);
        report(name, r);
        expect(r.loopStart).toBeGreaterThanOrEqual(0);
        expect(r.at - r.loopStart).toBeLessThanOrEqual(10 * TICK_RATE);
      });
    }
  });

  it('proves the m4, n1, n2, u1, u2 and u4 null runs are loops too', () => {
    // these take one full period to prove; in u1, u2 and u4 the resting boulders must fall asleep first
    for (const id of ['m4', 'n1', 'n2', 'u1', 'u2', 'u4']) {
      const r = watch(level(id), [], 30 * 60 * 3);
      expect(r.at, id).toBeGreaterThan(0);
      if (r.sim.d.bodies.length) expect(r.sim.d.bodies.every((b) => b.sleep >= SLEEP_TICKS), `${id}: boulders asleep`).toBe(true);
      report(`${id} null run`, r);
      holds(r.sim, r.det.loop!, 300, `${id} null run`);
    }
  }, 30_000); // about 3 s alone, but it has passed 5 s in a loaded full run

  describe('proves cycles apart', () => {
    // n3 as it shipped in wave 1, a Warden granted to the first Wyrdling at tick 405, short of the plate: five
    // pace between the wall and the Warden (246 ticks a lap) and press the plate, so the gate opens and shuts
    // forever; six fell into the pit and pace there (76 ticks). The whole run repeats only every 12,032 ticks.
    const n3 = (): Sim => {
      const sim = Sim.create(LEGACY_N3);
      while (sim.d.tick < 405) sim.step();
      expect(sim.assign(0, 'warden')).toBe(true);
      return sim;
    };

    it('long before the whole run repeats, and the whole run does repeat', () => {
      const sim = n3();
      const det = new LoopDetector();
      while (sim.d.tick < 30 * 60 * 8 && det.observe(sim) !== 'loop') sim.step();
      const proof = det.loop!;
      expect(proof, 'proven').not.toBeNull();
      console.log(`n3 Warden at 405: proven at tick ${proof.at}, rest every ${proof.rest}, apart ${proof.apart.map((a) => `#${a.id}/${a.period}`).join(' ')}, whole run every ${proof.period}`);
      expect(proof.apart.map((a) => a.id)).toEqual([6, 7, 8, 9, 10, 11]);
      expect(proof.at).toBeLessThan(3000);
      expect(proof.period).toBe(12032);
      // run one whole period on: the state comes back exactly
      const a = sim.clone(), b = sim.clone();
      for (let i = 0; i < proof.period; i++) b.step();
      expect(sameData(a.d, b.d)).toBe(true);
      expect(sameTerrain(a.terrain, b.terrain)).toBe(true);
    });

    it('that hold: each apart repeats on its period, the rest on its own, and no count changes', () => {
      // every Warden and Leaper the first six Wyrdlings could be granted at a few moments, proven or not
      let proofs = 0, compared = 0;
      for (const T of [300, 500]) {
        const base = Sim.create(LEGACY_N3);
        while (base.d.tick < T) base.step();
        for (const w of base.d.wyrds.slice(0, 6)) {
          for (const skill of ['warden', 'leaper'] as const) {
            const sim = base.clone();
            if (!sim.assign(w.id, skill)) continue;
            const det = new LoopDetector();
            while (sim.d.tick < T + 6000 && !sim.d.finished && det.observe(sim) !== 'loop') sim.step();
            const proof = det.loop;
            if (!proof?.apart.length) continue;
            proofs++;
            compared += holds(sim, proof, 120, `n3 ${skill} #${w.id} at ${T}`);
          }
        }
      }
      console.log(`proofs apart checked: ${proofs}, ${compared} tick comparisons`);
      expect(proofs).toBeGreaterThan(5);
    }, 30_000);

    it('never with a Wyrdling on a plate nothing else holds', () => {
      // the pacers of the Warden case above press the plate: they must be part of the rest, not apart
      const sim = n3();
      const det = new LoopDetector();
      while (sim.d.tick < 30 * 60 * 8 && det.observe(sim) !== 'loop') sim.step();
      const plate = sim.L.plates[0];
      for (const { id } of det.loop!.apart) {
        // walk the Wyrdling apart through a lap: it never comes near the plate
        const c = sim.clone();
        for (let i = 0; i < 400; i++) {
          c.step();
          const w = c.d.wyrds[id];
          expect(w.x < plate.x - 1 || w.x > plate.x + plate.w || w.y < plate.y - 2 || w.y > plate.y + 1).toBe(true);
        }
      }
    });
  });

  for (const def of ALL_LEVELS) {
    it(`${def.id}: never fires during the scripted solution`, () => {
      const r = watch(def, def.solution, SOLUTION_MAX, false);
      expect(r.sim.d.finished).toBe(true);
      expect(r.at).toBe(-1);
    });
  }

  it('reports its cost per observe on n3', () => {
    for (const [name, steps] of [['null run', []], ['solution', level('n3').solution]] as const) {
      const r = watch(level('n3'), steps as SolutionStep[], SOLUTION_MAX);
      const ms = r.observeMs.slice().sort((a, b) => a - b);
      const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
      console.log(
        `n3 ${name}: ${ms.length} observes, mean ${(avg * 1000).toFixed(1)} µs, ` +
        `p99 ${(ms[Math.floor(ms.length * 0.99)] * 1000).toFixed(0)} µs, max ${(ms[ms.length - 1] * 1000).toFixed(0)} µs`,
      );
      expect(avg).toBeLessThan(0.5);
    }
  });

  it('keeps its incremental terrain hash equal to a full rehash', () => {
    const def = level('n3');
    const sim = Sim.create(def);
    const sol = new SolutionPlayer(def.solution);
    const det = new LoopDetector();
    let checked = 0;
    while (!sim.d.finished) {
      sol.apply(sim);
      sim.step();
      det.observe(sim);
      if (det.hash !== null && sim.d.tick % 97 === 0) {
        expect(det.hash).toBe(stateHash(sim));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  describe('on a pacing pit', () => {
    // one Wyrdling walks back and forth between two walls; the exit is out of reach
    const pit = (over: Partial<LevelDef> = {}): LevelDef => flatLevel({
      width: 400,
      terrain: [
        { op: 'rect', mat: 'Earth', x: 0, y: 120, w: 400, h: 40 },
        { op: 'rect', mat: 'Rock', x: 0, y: 40, w: 20, h: 80 },
        { op: 'rect', mat: 'Rock', x: 100, y: 40, w: 20, h: 80 },
      ],
      entities: [{ type: 'entrance', x: 50, y: 80 }, { type: 'exit', x: 300, y: 119 }],
      ...over,
    });
    const until = (def: LevelDef, max = 3000): Watched => watch(def, [], max);

    it('proves the loop one period after it starts', () => {
      const r = until(pit());
      expect(r.at).toBeGreaterThan(0);
      expect(r.at - r.loopStart).toBeLessThanOrEqual(r.det.loop!.period + 30);
    });

    it('waits for a crusher elsewhere to come round to the same phase', () => {
      const p = until(pit()).det.loop!.period;
      const period = 2 * p;
      const r = until(pit({ entities: [{ type: 'entrance', x: 50, y: 80 }, { type: 'exit', x: 300, y: 119 }, { type: 'crusher', x: 300, y: 20, drop: 10, period }] }));
      expect(r.at).toBeGreaterThan(0);
      expect(r.det.loop!.period % period).toBe(0);
    });

    it('waits for pending spawns', () => {
      const r = until(pit({ wyrdlings: 2, rate: 1200 }), 4000);
      expect(r.at).toBeGreaterThan(40 + 1200);
    });

    it('forgets the proof after a calling, a rewind or a skipped tick', () => {
      const def = pit({ skills: { warden: 1 } });
      const sim = Sim.create(def);
      const det = new LoopDetector();
      const prove = (s: Sim) => { for (let i = 0; i < 3000 && det.observe(s) !== 'loop'; i++) s.step(); };
      prove(sim);
      expect(det.observe(sim), 'same tick, same answer').toBe('loop');
      const rewound = sim.clone();
      sim.step();
      expect(det.observe(sim)).toBe('loop');
      expect(sim.assign(0, 'warden')).toBe(true);
      expect(det.observe(sim), 'a calling on a paused tick').toBeNull();
      sim.step();
      expect(det.observe(sim)).toBeNull();
      expect(det.observe(rewound), 'a rewind').toBeNull();
      prove(rewound);
      expect(det.observe(rewound)).toBe('loop');
      rewound.step();
      rewound.step();
      expect(det.observe(rewound), 'a skipped tick').toBeNull();
    });
  });
});

describe('loop proof foundations', () => {
  /** Every scripted solution, plus the boss fights left to run unopposed (projectiles, frozen Wyrdlings). */
  const runs = (): [LevelDef, SolutionStep[]][] =>
    [...ALL_LEVELS.map((def) => [def, def.solution] as [LevelDef, SolutionStep[]]), ...ALL_LEVELS.filter((def) => def.boss).map((def) => [def, []] as [LevelDef, SolutionStep[]])];

  /** One snapshot per run, the one richest in state: bosses mid-fight, runes, boulders, gates, sand. */
  function snapshots(): SimData[] {
    const out: SimData[] = [];
    for (const [def, steps] of runs()) {
      const sim = Sim.create(def);
      const sol = new SolutionPlayer(steps);
      let best = -1;
      let bestD: SimData | null = null;
      while (sim.d.tick < 2400 && !sim.d.finished) {
        sol.apply(sim);
        sim.step();
        const d = sim.d;
        const score = [d.projectiles, d.hazards, d.charges, d.bodies, d.sandActive, d.boss?.m ?? []].filter((a) => a.length).length +
          (d.wyrds.some((w) => !UNTIMED.has(w.st)) ? 1 : 0);
        if (score > best) {
          best = score;
          bestD = structuredClone(d);
        }
      }
      if (bestD) out.push(bestD);
    }
    return out;
  }

  it('the canonical state covers every field: changing any one leaf changes the hash and the comparison', () => {
    const covered = new Set<string>();
    let leaves = 0;
    const snaps = snapshots();
    for (const base of snaps) {
      const h0 = hashData(base);
      // every leaf (and every array's length), addressed by a path from the root; holes in sparse
      // arrays count as leaves. Long arrays are sampled: two elements, or one Wyrdling per state.
      const visit = (v: unknown, path: (string | number)[]): void => {
        if (v === null || typeof v !== 'object') return check(path, null);
        if (!Array.isArray(v)) {
          for (const k of Object.keys(v)) visit((v as Record<string, unknown>)[k], [...path, k]);
          return;
        }
        const states = new Set<string>();
        for (let i = 0; i < v.length; i++) {
          if (path.join() === 'wyrds') {
            const st = (v[i] as { st: string }).st;
            if (states.has(st)) continue;
            states.add(st);
          } else if (i >= 2) break;
          visit(v[i], [...path, i]);
        }
        check(path, (a) => a.push(Array.isArray(a[0]) ? [] : a[0] ?? 0));
      };
      const check = (path: (string | number)[], grow: ((a: unknown[]) => void) | null): void => {
        const d = structuredClone(base);
        let o = d as unknown as Record<string | number, unknown>;
        for (const k of path.slice(0, -1)) o = o[k] as Record<string | number, unknown>;
        const key = path[path.length - 1];
        const label = path.map((k) => (typeof k === 'number' ? '[]' : k)).join('.');
        if (grow) grow(o[key] as unknown[]);
        else {
          const v = o[key];
          if (typeof v === 'number') {
            // the smallest change a float can make
            const f = new Float64Array([v]), u = new Uint32Array(f.buffer);
            u[0] ^= 1;
            o[key] = f[0];
          } else if (typeof v === 'boolean') o[key] = !v;
          else if (typeof v === 'string') o[key] = v + 'x';
          else o[key] = 0;
        }
        const wyrd = path[0] === 'wyrds' ? base.wyrds[path[1] as number] : null;
        const ignored = path[0] === 'tick' || (wyrd !== null && key === 't' && UNTIMED.has(wyrd.st));
        leaves++;
        covered.add(label);
        if (ignored) {
          expect(sameData(base, d), label).toBe(true);
          expect(hashData(d), label).toBe(h0);
        } else {
          expect(sameData(base, d), label).toBe(false);
          expect(hashData(d), label).not.toBe(h0);
        }
      };
      visit(base, []);
    }
    // a field added to SimData is picked up by the generic walk; this only checks the snapshots reach it
    for (const k of Object.keys(snaps[0])) expect([...covered].some((c) => c === k || c.startsWith(k + '.')), k).toBe(true);
    for (const k of ['boss.m', 'projectiles.[].tx', 'hazards.[].p', 'charges.[].fuse', 'bodies.[].sleep', 'wyrds.[].frozen']) expect(covered.has(k), k).toBe(true);
    expect(leaves).toBeGreaterThan(500);
  });

  it('the terrain is part of it: one pixel changes the hash', () => {
    const sim = Sim.create(level('n3'));
    const h = stateHash(sim);
    const c = sim.clone();
    c.terrain.set(300, 150, c.terrain.get(300, 150) === 0 ? 1 : 0);
    expect(stateHash(c)).not.toBe(h);
  });

  it('the next step depends only on the canonical state and the tick phases', () => {
    // Shift the tick by a common multiple of every tick period (and 2, for sand) and scramble every
    // timer the simulation should never read: the next step must come out the same.
    const seen = new Map<string, number>();
    let checks = 0;
    for (const [def, steps] of runs()) {
      const sim = Sim.create(def);
      // the detector's own list of periods: a shift by their common multiple must not matter
      const periods = [2, ...tickPeriods(sim)];
      const K = 2 * periods.reduce((a, b) => (a * b) / gcd(a, b), 1);
      const sol = new SolutionPlayer(steps);
      while (sim.d.tick < 2400 && !sim.d.finished) {
        sol.apply(sim);
        sim.step();
        if (sim.d.spawned < sim.total || sim.d.tick % 11 !== 0) continue;
        const a = sim.clone(), b = sim.clone();
        b.d.tick += K;
        for (const w of b.d.wyrds) {
          if (!UNTIMED.has(w.st)) continue;
          w.t += sim.d.tick % 2 ? 1 : 1001;
          seen.set(w.st, (seen.get(w.st) ?? 0) + 1);
        }
        a.step();
        b.step();
        expect(b.d.tick - a.d.tick).toBe(K);
        expect(sameData(a.d, b.d), `${def.id} tick ${sim.d.tick}`).toBe(true);
        expect(sameTerrain(a.terrain, b.terrain), `${def.id} tick ${sim.d.tick}`).toBe(true);
        checks++;
      }
    }
    console.log(`next-step checks: ${checks}; untimed states scrambled: ${[...seen].map(([s, n]) => `${s} ${n}`).join(', ')}`);
    for (const st of UNTIMED) if (st !== 'gone') expect(seen.get(st) ?? 0, st).toBeGreaterThan(0);
  });

  it('knows every tick-driven rule and every piece of per-Sim state', () => {
    // settle.ts lists the tick periods the step reads. A new `tick` in the simulation needs a look there.
    const dir = new URL('../src/sim/', import.meta.url);
    const own = new Set(['settle.ts', 'weave.ts', 'foresight.ts', 'timeline.ts', 'solution.ts']);
    const found: string[] = [];
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts') && !own.has(f)).sort()) {
      const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const line of src.split('\n')) {
        const code = line.replace(/\/\/.*$/, '');
        if (/\btick\b/.test(code)) found.push(`${f}: ${code.trim()}`);
      }
    }
    expect(found).toEqual([
      'physics.ts: if (Math.abs(b.vx) > 0.4 && sim.d.tick % 12 === 0) sim.emit(\'boulder_roll\', b.x, b.y, b.id, undefined, Math.abs(b.vx));',
      'sand.ts: const tick = sim.d.tick;',
      'sand.ts: const ltr = ((y + tick) & 1) === 0;',
      'sand.ts: const first = ((x + y + tick) & 1) === 0 ? -1 : 1;',
      'sand.ts: if ((tick & 7) === 0) sim.emit(\'sand\', x0 + CS / 2, y0 + CS / 2);',
      'sim.ts: tick: 0, rng: def.seed >>> 0, wyrds: [], spawned: 0, saved: 0, dead: 0, skills, used: 0,',
      'sim.ts: crusherBottom(i: number, tick = this.d.tick): { hb: number; deadly: boolean; warn: boolean } {',
      'sim.ts: const cyc = (tick + (c.phase ?? 0)) % c.period;',
      'sim.ts: firejetState(i: number, tick = this.d.tick): 0 | 1 | 2 {',
      'sim.ts: const cyc = (tick + (f.phase ?? 0)) % (f.on + f.off);',
      'sim.ts: if (this.d.tick % g.speed === 0) {',
      'sim.ts: if (d.spawned < this.total && d.tick >= SPAWN_START && (d.tick - SPAWN_START) % this.L.def.rate === 0) this.spawn();',
      'sim.ts: if (d.tick === 0) this.emit(\'gate_open\', this.L.entrance.x, this.L.entrance.y);',
      'sim.ts: d.tick++;',
      'state.ts: tick: number;',
    ]);
    // the loop proof compares SimData and terrain; anything else a Sim carries must be rebuilt every step
    expect(Object.keys(Sim.create(level('m1'))).sort()).toEqual(['L', 'd', 'dyn', 'events', 'terrain', 'wardens', 'weavers']);
  });

  it('knows every place the step looks at the Wyrdlings', () => {
    // A proof of cycles apart rests on how the rest of the run can notice a passive Wyrdling: through the
    // step's Warden, Weaver and dynamic-solid lists (SEEN in settle.ts), the gate, plate, lever and brittle
    // zones, a fast boulder (seen in its chunks), or a guardian, its missiles and hazards, and runes (no
    // proof apart while any is about). A new look at d.wyrds needs a look at settle.ts first.
    const dir = new URL('../src/sim/', import.meta.url);
    const own = new Set(['settle.ts', 'weave.ts', 'foresight.ts', 'timeline.ts', 'solution.ts', 'state.ts']);
    const found: string[] = [];
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts') && !own.has(f)).sort()) {
      const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const line of src.split('\n')) {
        const code = line.replace(/\/\/.*$/, '');
        if (/\bwyrds\b/.test(code)) found.push(`${f}: ${code.trim()}`);
      }
    }
    expect(found).toEqual([
      // boss.ts: only while a guardian stands, or its missiles and hazards are about
      'boss.ts: for (const w of sim.d.wyrds) {',
      "boss.ts: return sim.d.wyrds.filter((w) => isAlive(w) && w.x >= def.arena.x0 && w.x <= def.arena.x1 && w.st !== 'frozen');",
      'boss.ts: for (const w of sim.d.wyrds) {',
      'boss.ts: for (const w of sim.d.wyrds) {',
      'boss.ts: for (const w of sim.d.wyrds) if (isAlive(w) && Math.abs(w.x - x) <= 2 && y <= w.y && y >= w.y - 10) return true;',
      'boss.ts: for (const w of sim.d.wyrds) {',
      'boss.ts: for (const w of sim.d.wyrds) {',
      'boss.ts: for (const w of sim.d.wyrds) {',
      'boss.ts: for (const w of sim.d.wyrds) {',
      'boss.ts: for (const w of sim.d.wyrds) {',
      'boss.ts: for (const w of sim.d.wyrds) {',
      // a fast boulder crushes or bowls Wyrdlings near it
      'physics.ts: for (const w of sim.d.wyrds) {',
      'sim.ts: tick: 0, rng: def.seed >>> 0, wyrds: [], spawned: 0, saved: 0, dead: 0, skills, used: 0,',
      // sliceBlocked: a closing gate (the gate zones)
      'sim.ts: for (const w of this.d.wyrds) {',
      'sim.ts: const w = this.d.wyrds[id];',
      // the step's frozen, Warden and Weaver lists (SEEN)
      'sim.ts: for (const w of d.wyrds) {',
      "sim.ts: for (const w of d.wyrds) if (w.st !== 'gone') this.updateWyrd(w);",
      'sim.ts: this.d.wyrds.push(w);',
      // detonate: runes
      'sim.ts: for (const w of this.d.wyrds) {',
      // plates, levers, brittle floors (zones)
      'sim.ts: for (const w of d.wyrds) {',
      'sim.ts: for (const w of d.wyrds) {',
      'sim.ts: for (const w of d.wyrds) {',
      // checkEnd: a passive Wyrdling is neither gone nor a Warden, so idle stays 0
      'sim.ts: for (const w of d.wyrds) {',
      'sim.ts: for (const w of this.d.wyrds) if (isAlive(w)) n++;',
    ]);
  });
});
