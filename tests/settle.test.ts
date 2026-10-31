// Settlement and stalemate proofs. The loop detector may stay silent when it cannot prove a loop, but it
// must never claim one that is not there: these tests check it on real stalemates, on every scripted
// solution, and check the two facts its proof rests on (the canonical state covers every field; the
// next step depends on nothing else).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_LEVELS } from '../src/levels';
import { TICK_RATE } from '../src/sim/constants';
import type { LevelDef, SolutionStep } from '../src/sim/level';
import { LoopDetector, UNTIMED, hashData, sameData, settled, stateHash } from '../src/sim/settle';
import { Sim } from '../src/sim/sim';
import { SolutionPlayer } from '../src/sim/solution';
import type { SimData } from '../src/sim/state';
import type { Terrain } from '../src/sim/terrain';
import { flatLevel } from './helpers';

const level = (id: string): LevelDef => ALL_LEVELS.find((l) => l.id === id)!;
const SOLUTION_MAX = 30 * 60 * 8;

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
  if (p) for (let t = 0; t + p < hashes.length && loopStart < 0; t++) if (hashes[t] != null && hashes[t] === hashes[t + p]) loopStart = t;
  return { sim, det, at, loopStart, lastChange, observeMs };
}

function report(name: string, r: Watched): void {
  const lp = r.det.loop!;
  console.log(
    `${name}: loop of ${lp.period} ticks from tick ${r.loopStart}, proven at tick ${r.at}: ` +
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
      ['n4 null run', level('n4'), []],
      ['m2, second Weaver at x=320', level('m2'), [{ nth: 0, x: 196, skill: 'weaver' }, { nth: 0, x: 320, dir: 1, skill: 'weaver' }]],
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

  it('proves the m4, n1 and n2 null runs are loops too', () => {
    for (const id of ['m4', 'n1', 'n2']) {
      const r = watch(level(id), [], 30 * 60 * 3);
      expect(r.at, id).toBeGreaterThan(0);
      report(`${id} null run`, r);
    }
  });

  it('stays silent on the u1, u2 and u4 null runs: a resting boulder jitters below a pixel forever', () => {
    // Each resting boulder bobs up to 0.47 px and never falls asleep (its end-of-tick speed never drops
    // under the sleep threshold), and float rounding means its exact position never repeats. In u1 and u4
    // everything else does repeat; in u2 the walkers turn around against a boulder at a pixel that depends
    // on its bob, so not even they settle into a cycle. Without a repeat there is no proof.
    for (const id of ['u1', 'u2', 'u4']) {
      const sim = Sim.create(level(id));
      const det = new LoopDetector();
      const rest = new Set<number>(), bodies = new Set<string>();
      let restRepeats = false, bodiesRepeat = false, verdict = false;
      while (sim.d.tick < 30 * 80) {
        sim.step();
        if (det.observe(sim) === 'loop') verdict = true;
        if (sim.d.spawned < sim.total) continue;
        const h = hashData({ ...sim.d, bodies: [] });
        if (rest.has(h)) restRepeats = true;
        rest.add(h);
        const b = JSON.stringify(sim.d.bodies);
        if (bodies.has(b)) bodiesRepeat = true;
        bodies.add(b);
      }
      if (id !== 'u2') expect(restRepeats, `${id}: everything but the boulders repeats`).toBe(true);
      expect(bodiesRepeat, `${id}: the boulders now repeat (do they sleep?): add ${id} to the levels that must prove a loop`).toBe(false);
      expect(verdict, id).toBe(false);
    }
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
      const L = sim.L;
      const periods = [2, ...L.gates.map((g) => g.speed), ...L.crushers.map((c) => c.period), ...L.firejets.map((f) => f.on + f.off)];
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
});
