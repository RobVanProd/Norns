import { describe, expect, it } from 'vitest';
import type { SkillId } from '../src/sim/constants';
import { ForesightJob, SAVE_MARGIN, compareFates, foresee, type Baseline, type FateEnd, type Ghost } from '../src/sim/foresight';
import type { LevelDef } from '../src/sim/level';
import { Sim } from '../src/sim/sim';
import { flatLevel } from './helpers';

/** Step until wyrdling `id` stands at or past x (walking right) and can take the calling. */
function walkTo(sim: Sim, id: number, x: number, skill: SkillId): void {
  for (let i = 0; i < 3000; i++) {
    const w = sim.d.wyrds[id];
    if (w && w.x >= x && sim.canAssign(w, skill)) return;
    sim.step();
  }
  throw new Error(`wyrdling ${id} never reached x ${x}`);
}

function pixels(runs: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < runs.length; i += 3) for (let k = 0; k < runs[i + 2]; k++) out.push([runs[i] + k, runs[i + 1]]);
  return out;
}

/** The ghost must be what really happens: run the same calling for real and compare the terrain. */
function expectGhostMatchesReality(sim: Sim, id: number, skill: SkillId, horizon: number): Ghost {
  const job = new ForesightJob(sim, horizon, { id, skill });
  job.advance();
  const g = job.fate.ghost!;
  const real = sim.clone();
  const before = sim.clone();
  expect(real.assign(id, skill)).toBe(true);
  for (let i = 0; i < horizon; i++) real.step();
  for (const [x, y] of pixels(g.added)) {
    expect(before.terrain.get(x, y)).toBe(0);
    expect(real.terrain.get(x, y)).not.toBe(0);
  }
  for (const [x, y] of pixels(g.carved)) {
    expect(before.terrain.get(x, y)).not.toBe(0);
    expect(real.terrain.get(x, y)).toBe(0);
  }
  const carved = new Set(pixels(g.carved).map(([x, y]) => `${x},${y}`));
  for (const [x, y] of pixels(g.edge)) expect(carved.has(`${x},${y}`)).toBe(true);
  return g;
}

const gap = (): LevelDef => flatLevel({
  width: 400, skills: { weaver: 1 },
  terrain: [
    { op: 'rect', mat: 'Earth', x: 0, y: 120, w: 150, h: 40 },
    { op: 'rect', mat: 'Earth', x: 180, y: 120, w: 220, h: 40 },
  ],
  entities: [{ type: 'entrance', x: 30, y: 80 }, { type: 'exit', x: 380, y: 119 }],
});

const wall = (): LevelDef => flatLevel({
  width: 400, skills: { basher: 1, blast: 1, digger: 1 }, wyrdlings: 2, rate: 60,
  terrain: [
    { op: 'rect', mat: 'Earth', x: 0, y: 120, w: 400, h: 40 },
    { op: 'rect', mat: 'Rock', x: 260, y: 80, w: 30, h: 40 },
  ],
  entities: [{ type: 'entrance', x: 30, y: 80 }, { type: 'exit', x: 380, y: 119 }],
});

describe('foresight ghosts', () => {
  it('shows the planks a Weaver would lay, and nothing carved', () => {
    const sim = Sim.create(gap());
    walkTo(sim, 0, 140, 'weaver');
    const g = expectGhostMatchesReality(sim, 0, 'weaver', 240);
    expect(pixels(g.added).length).toBeGreaterThan(40);
    expect(g.carved.length).toBe(0);
    for (const [x] of pixels(g.added)) expect(x).toBeGreaterThan(140);
  });

  it('outlines a Basher tunnel and a Rune Blast crater', () => {
    const bash = Sim.create(wall());
    walkTo(bash, 0, 250, 'basher');
    const tunnel = expectGhostMatchesReality(bash, 0, 'basher', 150);
    expect(pixels(tunnel.carved).length).toBeGreaterThan(100);
    expect(tunnel.edge.length).toBeGreaterThan(0);

    const blast = Sim.create(wall());
    walkTo(blast, 0, 250, 'blast');
    const crater = expectGhostMatchesReality(blast, 0, 'blast', 150);
    expect(pixels(crater.carved).length).toBeGreaterThan(50);
  });

  it('leaves out what other Wyrdlings dig', () => {
    const sim = Sim.create(wall());
    walkTo(sim, 0, 250, 'basher');
    sim.assign(0, 'basher');
    walkTo(sim, 1, 200, 'digger');
    const job = new ForesightJob(sim, 120, { id: 1, skill: 'digger' });
    job.advance();
    // the basher keeps tunnelling the wall in the branch too, but the ghost is only the digger's shaft
    const carved = pixels(job.fate.ghost!.carved);
    expect(carved.length).toBeGreaterThan(50);
    for (const [x] of carved) expect(Math.abs(x - 200)).toBeLessThanOrEqual(8);
  });
});

describe('foresight projection', () => {
  it("the shadow run is exactly the plain prediction", () => {
    const sim = Sim.create(gap());
    walkTo(sim, 0, 140, 'weaver');
    const job = new ForesightJob(sim, 300, { id: 0, skill: 'weaver' }, { shadow: true, pathHorizon: 120 });
    job.advance();
    const plain = foresee(sim, 300);
    const strip = (m: Map<number, FateEnd>) => [...m.entries()].sort((a, b) => a[0] - b[0]);
    expect(strip(job.fate.shadow!.ends)).toEqual(strip(plain.ends));
    // only the focus' thread runs past the usual horizon
    for (const [id, p] of job.fate.paths) if (id !== 0) expect(p.length / 2).toBeLessThanOrEqual(120 / 2 + 2);
    expect(job.fate.paths.get(0)!.length / 2).toBeGreaterThan(120 / 2 + 2);
  });

  it('slicing the work over frames gives the same answer', () => {
    const sim = Sim.create(wall());
    walkTo(sim, 0, 250, 'blast');
    const once = new ForesightJob(sim, 300, { id: 0, skill: 'blast' }, { shadow: true });
    once.advance();
    const sliced = new ForesightJob(sim, 300, { id: 0, skill: 'blast' }, { shadow: true });
    let frames = 0;
    while (!sliced.advance(0)) frames++;
    expect(frames).toBeGreaterThan(10);
    expect(sliced.fate.ends).toEqual(once.fate.ends);
    expect(sliced.fate.shadow!.ends).toEqual(once.fate.shadow!.ends);
    expect(sliced.fate.paths).toEqual(once.fate.paths);
    expect(sliced.fate.ghost).toEqual(once.fate.ghost);
  });
});

describe('foresight turns', () => {
  it('tells pacing between two walls from a single turn', () => {
    const walls = (right: boolean) => flatLevel({
      width: 400,
      terrain: [
        { op: 'rect', mat: 'Earth', x: 0, y: 120, w: 400, h: 40 },
        { op: 'rect', mat: 'Rock', x: 60, y: 90, w: 10, h: 30 },
        ...(right ? [{ op: 'rect' as const, mat: 'Rock' as const, x: 200, y: 90, w: 10, h: 30 }] : []),
      ],
      entities: [{ type: 'entrance', x: 120, y: 80 }, { type: 'exit', x: 380, y: 60 }],
    });
    const boxed = foresee(Sim.create(walls(true)), 600).ends.get(0)!;
    expect(boxed.kind).toBe('alive');
    expect(boxed.turned).toBe('wall');
    expect(boxed.trap).toBeDefined();
    expect(boxed.trap!.lo).toBeLessThan(80);
    expect(boxed.trap!.hi).toBeGreaterThan(190);

    // one wall: it turns once (at the far edge of the level it would turn again, so stop before)
    const open = foresee(Sim.create(walls(false)), 200).ends.get(0)!;
    expect(open.kind).toBe('alive');
    expect(open.trap).toBeUndefined();
  });
});

describe('compareFates', () => {
  const end = (kind: FateEnd['kind'], t: number, more: Partial<FateEnd> = {}): FateEnd => ({ kind, x: 100, y: 100, t, ...more });
  const run = (from: number, horizon: number, ends: [number, FateEnd][]): Baseline => ({ from, horizon, ends: new Map(ends) });

  it('calls averted deaths saved, unless they are only postponed to the window edge', () => {
    const base = run(0, 450, [[0, end('dead', 40)], [1, end('dead', 440)], [2, end('dead', 100)]]);
    const branch = run(0, 450, [[0, end('alive', 450)], [1, end('alive', 450)], [2, end('dead', 120)]]);
    const d = compareFates(base, branch);
    expect(d.saved).toBe(1); // #1 died 10 ticks before the edge: too close to call
    expect(450 - 440).toBeLessThan(SAVE_MARGIN);
    expect(d.stillLost).toBe(1);
    expect(d.lost).toBe(0);
  });

  it('reads a sacrifice: an early loss, then others freed from a trap', () => {
    const trap = { lo: 0, hi: 80, y: 100 };
    const base = run(0, 450, [[0, end('alive', 450, { trap })], [1, end('alive', 450, { trap })], [2, end('alive', 450, { trap })]]);
    const branch = run(0, 450, [[0, end('dead', 60)], [1, end('alive', 450, { x: 300 })], [2, end('alive', 450, { x: 40 })]]);
    const d = compareFates(base, branch);
    expect(d.lost).toBe(1);
    expect(d.freed).toBe(1); // #2 is still inside its old stretch: not freed
    expect(d.firstLoss).toBeLessThan(d.firstGain);
  });

  it('compares only the ticks both predictions cover', () => {
    // the branch started 4 ticks after the base: a branch death after the base's horizon is not a loss
    const base = run(100, 120, [[0, end('alive', 120)], [1, end('saved', 2)]]);
    const branch = run(104, 120, [[0, end('dead', 118)]]);
    const d = compareFates(base, branch);
    expect(d.window).toBe(116);
    expect(d.lost).toBe(0);
    expect(d.delayed).toBe(0); // #1 got home before the branch began, so the branch never sees it
  });
});
