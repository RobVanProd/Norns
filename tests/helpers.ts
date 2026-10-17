import type { LevelDef, SolutionStep } from '../src/sim/level';
import { Sim } from '../src/sim/sim';
import { stepReady } from '../src/sim/solution';

/** Minimal level: flat floor, entrance at left, exit at right. Override anything. */
export function flatLevel(over: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 'test', name: 'Test', realm: 'midgard', intro: '', width: 320, height: 160, seed: 1,
    wyrdlings: 1, quota: 1, target: 1, rate: 30, skills: {},
    terrain: [{ op: 'rect', mat: 'Earth', x: 0, y: 120, w: 320, h: 40 }],
    entities: [
      { type: 'entrance', x: 30, y: 80 },
      { type: 'exit', x: 290, y: 119 },
    ],
    solution: [],
    ...over,
  };
}

export interface RunResult {
  sim: Sim;
  ticks: number;
  fired: number;
}

/** Run a level with scripted steps until finished or maxTicks. */
export function runLevel(def: LevelDef, steps: SolutionStep[] = def.solution, maxTicks = 30 * 60 * 6): RunResult {
  const sim = Sim.create(def);
  return runSim(sim, steps, maxTicks);
}

export function runSim(sim: Sim, steps: SolutionStep[], maxTicks: number): RunResult {
  const pending = steps.map((s) => ({ ...s, done: false }));
  let fired = 0;
  let t = 0;
  for (; t < maxTicks && !sim.d.finished; t++) {
    for (const s of pending) {
      if (s.done) continue;
      if (applyStep(sim, s)) { s.done = true; fired++; }
    }
    sim.step();
  }
  return { sim, ticks: t, fired };
}

export function applyStep(sim: Sim, s: SolutionStep): boolean {
  return stepReady(sim, s) && sim.assign(s.nth, s.skill);
}

/** Debug: ASCII picture of a region with wyrdlings. */
export function ascii(sim: Sim, x0: number, y0: number, w: number, h: number, step = 2): string {
  const rows: string[] = [];
  const chars = ' #%@s=~b+r';
  for (let y = y0; y < y0 + h; y += step) {
    let row = '';
    for (let x = x0; x < x0 + w; x += step) {
      let ch = chars[sim.terrain.get(x, y)] ?? '?';
      for (const wy of sim.d.wyrds) {
        if (wy.st !== 'gone' && Math.abs(wy.x - x) < step && Math.abs(wy.y - y) < step) ch = wy.dir > 0 ? '>' : '<';
      }
      row += ch;
    }
    rows.push(row);
  }
  return rows.join('\n');
}
