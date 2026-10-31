// Crowd targeting (who a click hits, cycling a crowd) and fate-thread geometry (patterns, edge pins).
import { describe, expect, it } from 'vitest';
import { PICK_R, SURE_PX, ambiguous, candidates, cycleSet, nextInCycle } from '../src/game/crowd';
import { PATTERNS, SKIP, edgePin, threadMarks } from '../src/game/threads';
import type { Wyrd } from '../src/sim/state';

const wyrd = (id: number, x: number, y = 100, over: Partial<Wyrd> = {}): Wyrd => ({
  id, x, y, fx: x, fy: y, vx: 0, vy: 0, dir: 1, st: 'walk', t: 0, fallY: y, climber: false, glider: false, planks: 0, frozen: 0, ...over,
});
const all = () => true;

describe('crowd targeting', () => {
  // seven walkers 1 px apart, facing both ways: the dense crowd of scripts/clicktest.mjs
  const crowd = [0, 1, 2, 3, 4, 5, 6].map((i) => wyrd(i + 10, 97 + i, 100, { dir: i & 1 ? -1 : 1 }));

  it('finds everyone under the pointer, nearest first, ties by id', () => {
    const c = candidates(crowd, 100, 93, false, all);
    expect(c.map((k) => k.id).sort()).toEqual(crowd.map((w) => w.id));
    // x 100 is on #13; walkers it is up to 3 px behind (#11 walking left, #14 and #16 walking right) count as on
    // it too, since a click aims where a walker was a moment ago: ties go to the lower id
    expect(c.filter((k) => k.d === 0).map((k) => k.id)).toEqual([11, 13, 14, 16]);
    expect(c[0].id).toBe(11);
    for (let i = 1; i < c.length; i++) expect(c[i - 1].d < c[i].d || (c[i - 1].d === c[i].d && c[i - 1].id < c[i].id)).toBe(true);
  });

  it('keeps the old pick: one that can take the calling beats a nearer one that can not, within 6 px', () => {
    const ws = [wyrd(1, 100), wyrd(2, 105)];
    const okOnly2 = (w: Wyrd) => w.id === 2;
    expect(candidates(ws, 100, 93, false, okOnly2)[0].id).toBe(2);
    // the body is a capsule from hood (y-13) to feet (y-2): straight above the hood by 8 px is out of a cursor's reach
    expect(candidates([wyrd(1, 100)], 100, 100 - 13 - 8, false, all)).toEqual([]);
    expect(candidates([wyrd(1, 100)], 100, 100 - 13 - PICK_R.touch, true, all)).toHaveLength(1);
    // the dead and the departed are never picked
    expect(candidates([wyrd(1, 100, 100, { st: 'drown' }), wyrd(2, 100, 100, { st: 'exit' })], 100, 93, true, all)).toEqual([]);
  });

  it('cycles through those that can take the calling, in id order, wrapping round', () => {
    const ok = (w: Wyrd) => w.id !== 12;
    const set = cycleSet(candidates(crowd, 100, 93, false, ok));
    expect(set).toEqual([10, 11, 13, 14, 15, 16]);
    // with nobody able, everyone under the pointer
    expect(cycleSet(candidates(crowd, 100, 93, false, () => false))).toHaveLength(7);
    expect(nextInCycle(set, 16)).toBe(10);
    expect(nextInCycle(set, 10, -1)).toBe(16);
    expect(nextInCycle(set, 12)).toBe(10); // not in the cycle: start at its head
    expect(nextInCycle([], 3)).toBeNull();
  });

  it('calls a tap ambiguous only when two that could take the calling are about as near the finger', () => {
    expect(ambiguous(candidates(crowd, 100, 93, true, all))).toBe(true);
    // a finger right on one, the next one 10 px off: that one is meant
    const two = [wyrd(1, 100, 100, { dir: -1 }), wyrd(2, 110, 100, { dir: -1 })];
    const c = candidates(two, 100, 93, true, all);
    expect(c.map((k) => k.id)).toEqual([1, 2]);
    expect(c[1].d - c[0].d).toBeGreaterThanOrEqual(SURE_PX);
    expect(ambiguous(c)).toBe(false);
    // between the two: either could be meant
    expect(ambiguous(candidates(two, 105, 93, true, all))).toBe(true);
    // only one of them can take the calling: no doubt left
    expect(ambiguous(candidates(two, 105, 93, true, (w) => w.id === 2))).toBe(false);
    expect(ambiguous(candidates([wyrd(1, 100)], 100, 93, true, all))).toBe(false);
  });

  it('reaches every Wyrdling of a crowd, each once, from any start', () => {
    const set = cycleSet(candidates(crowd, 100, 93, true, all));
    for (const start of set) {
      const seen = new Set<number>();
      let cur: number | null = start;
      for (let i = 0; i < set.length; i++) { seen.add(cur!); cur = nextInCycle(set, cur, 1); }
      expect(seen.size).toBe(set.length);
      expect(cur).toBe(start);
    }
  });
});

describe('fate threads', () => {
  // a walk of 100 px sampled every 2 px, and a fall of the same length sampled every 5 px
  const walk: number[] = [], fall: number[] = [];
  for (let i = 0; i <= 50; i++) walk.push(i * 2, 50);
  for (let i = 0; i <= 20; i++) fall.push(0, i * 5);

  it('spaces marks by length along the path, whatever the sampling', () => {
    for (const kind of ['dead', 'alive', 'saved'] as const) {
      const a = threadMarks(walk, kind), b = threadMarks(fall, kind);
      expect(a.length).toBe(b.length);
      expect(a.length).toBe(Math.floor((100 - SKIP) / PATTERNS[kind].period) + 1);
      for (let i = 1; i < a.length; i++) expect(a[i].x - a[i - 1].x).toBeCloseTo(PATTERNS[kind].period);
      for (let i = 1; i < b.length; i++) expect(b[i].y - b[i - 1].y).toBeCloseTo(PATTERNS[kind].period);
      for (const m of a) expect(m.f).toBeGreaterThan(0);
    }
  });

  it('draws each fate as a different pattern, so colour is never the only cue', () => {
    const dead = threadMarks(walk, 'dead'), alive = threadMarks(walk, 'alive'), saved = threadMarks(walk, 'saved');
    // doomed: dashes (the last one may be cut short by the path's end); the others: points
    for (const m of dead.slice(0, -1)) expect(Math.hypot(m.x2 - m.x, m.y2 - m.y)).toBeCloseTo(PATTERNS.dead.len);
    for (const m of [...alive, ...saved]) expect([m.x2, m.y2]).toEqual([m.x, m.y]);
    // dots and diamonds differ in rhythm too
    expect(new Set([PATTERNS.dead.period, PATTERNS.alive.period, PATTERNS.saved.period]).size).toBe(3);
    // a dash that reaches the end stops there
    const last = dead[dead.length - 1];
    expect(last.x2).toBeLessThanOrEqual(100);
    expect(last.x2 - last.x).toBeGreaterThan(0);
  });

  it('flows along the path as time passes, never past either end', () => {
    for (const march of [0, 2.5, 7, 13.25, -3]) {
      const ms = threadMarks(walk, 'dead', march);
      expect(ms[0].x).toBeGreaterThanOrEqual(SKIP);
      expect(ms[0].x).toBeLessThan(SKIP + PATTERNS.dead.period);
      for (const m of ms) expect(m.x).toBeLessThanOrEqual(100);
    }
    expect(threadMarks([5, 5], 'alive')).toEqual([]);
  });

  it('puts the marks of threads sharing a floor on the same spots', () => {
    const from = (x0: number) => { const p: number[] = []; for (let x = x0; x <= 120; x += 2) p.push(x, 50); return p; };
    for (const march of [0, 3.5, 11]) {
      const a = threadMarks(from(0), 'alive', march).map((m) => m.x), b = threadMarks(from(14), 'alive', march).map((m) => m.x);
      for (const x of b) expect(a.some((ax) => Math.abs(ax - x) < 1e-9)).toBe(true);
    }
  });

  it('pins an end the screen cannot show to the nearest edge, pointing out to it', () => {
    const r = { x0: 0, y0: 30, x1: 400, y1: 200 };
    expect(edgePin(100, 100, r)).toBeNull();
    expect(edgePin(100, 260, r)).toEqual({ x: 100, y: 200, dir: 'down' });
    expect(edgePin(100, 10, r)).toEqual({ x: 100, y: 30, dir: 'up' });
    expect(edgePin(-20, 100, r)).toEqual({ x: 0, y: 100, dir: 'left' });
    expect(edgePin(450, 100, r)).toEqual({ x: 400, y: 100, dir: 'right' });
    // past a corner: the larger overshoot names the edge
    expect(edgePin(410, 260, r)?.dir).toBe('down');
    expect(edgePin(480, 210, r)?.dir).toBe('right');
  });
});
