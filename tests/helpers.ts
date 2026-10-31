import { describe, expect, it } from 'vitest';
import type { LevelDef, SolutionStep, StepPurpose } from '../src/sim/level';
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
  const t0 = sim.d.tick;
  const done = steps.map(() => false);
  playVision(sim, steps, done, t0 + maxTicks);
  return { sim, ticks: sim.d.tick - t0, fired: done.filter(Boolean).length };
}

export function applyStep(sim: Sim, s: SolutionStep): boolean {
  return stepReady(sim, s) && sim.assign(s.nth, s.skill);
}

/** Play steps the way Skuld's Vision does: each fires on the first tick its conditions hold.
 *  `done` marks steps already fired (or left out) and is updated. Runs until tick `until` or the end. */
export function playVision(sim: Sim, steps: SolutionStep[], done: boolean[], until: number): void {
  while (sim.d.tick < until && !sim.d.finished) {
    steps.forEach((s, i) => { if (!done[i] && applyStep(sim, s)) done[i] = true; });
    sim.step();
  }
}

/** Click step i at exactly tick at[i], with no conditions: stepReady's `t` is only the earliest tick,
 *  which would hide how precise a click has to be. A refused click is lost, not retried. Runs until
 *  tick `until`, the end, or `stop` (asked after each tick's clicks); returns which clicks landed. */
export function playExact(
  sim: Sim, steps: SolutionStep[], at: number[], until: number,
  stop?: (sim: Sim, accepted: boolean[]) => boolean,
): boolean[] {
  const accepted = steps.map(() => false);
  while (sim.d.tick < until && !sim.d.finished) {
    for (let i = 0; i < steps.length; i++) if (at[i] === sim.d.tick) accepted[i] = sim.assign(steps[i].nth, steps[i].skill);
    if (stop?.(sim, accepted)) break;
    sim.step();
  }
  return accepted;
}

// ------------------------------------------------------------------ level hygiene

/** How long a level run may take: 8 minutes of game time. */
export const LEVEL_TICKS = 30 * 60 * 8;

/** Has the run met this purpose yet? Each one only ever turns from false to true. */
export function purposeMet(def: LevelDef, sim: Sim, p: StepPurpose): boolean {
  switch (p) {
    case 'quota': return sim.d.saved >= def.quota;
    case 'target': return sim.d.saved >= (def.solutionSaves ?? def.target);
    case 'spindle': return sim.d.spindle;
    case 'boss': return sim.d.boss !== null && sim.d.boss.hp === 0;
    case 'finish': return sim.d.finished;
  }
}

/** Everything the full solution achieves and the checks hold it to. 'finish' (which the solution
 *  test asserts anyway) counts only on levels where a step exists for it, so the slack report does
 *  not count a stray wanderer as a loss elsewhere. */
export function levelPurposes(def: LevelDef): StepPurpose[] {
  const out: StepPurpose[] = ['quota', 'target'];
  if (def.entities.some((e) => e.type === 'spindle')) out.push('spindle');
  if (def.boss) out.push('boss');
  if (def.solution.some((s) => s.purpose?.includes('finish'))) out.push('finish');
  return out;
}

/** The full solution as the Vision plays it, kept so the checks can restart it from any tick. */
export interface Recording {
  /** final state */
  sim: Sim;
  /** tick each step fired at (-1: never) */
  fired: number[];
  /** first tick each step's Wyrdling could be clicked */
  spawned: number[];
  /** a fresh copy of the run at the start of tick t, before that tick's clicks */
  at(t: number): Sim;
}

const SNAP_EVERY = 32;

export function recordSolution(def: LevelDef): Recording {
  const steps = def.solution;
  const sim = Sim.create(def);
  const fired = steps.map(() => -1);
  const spawned = steps.map(() => -1);
  const snaps: Sim[] = [];
  while (sim.d.tick < LEVEL_TICKS && !sim.d.finished) {
    const t = sim.d.tick;
    if (t % SNAP_EVERY === 0) snaps.push(sim.clone());
    steps.forEach((s, i) => {
      if (spawned[i] < 0 && sim.d.wyrds[s.nth]) spawned[i] = t;
      if (fired[i] < 0 && applyStep(sim, s)) fired[i] = t;
    });
    sim.step();
  }
  return {
    sim, fired, spawned,
    // clicking at the recorded ticks replays the Vision exactly (stepReady has no side effects)
    at: (t) => {
      const s = snaps[Math.floor(t / SNAP_EVERY)].clone();
      playExact(s, steps, fired, t);
      return s;
    },
  };
}

/** Which of step i's purposes the solution fails without exactly that step (Vision player, full
 *  horizon). The run is identical to the recording until the step would have fired, so it starts there. */
export function lostWithout(def: LevelDef, rec: Recording, i: number): StepPurpose[] {
  const f = rec.fired[i];
  const sim = rec.at(f);
  const done = rec.fired.map((g, j) => j === i || (g >= 0 && g < f));
  playVision(sim, def.solution, done, LEVEL_TICKS);
  return (def.solution[i].purpose ?? []).filter((p) => !purposeMet(def, sim, p));
}

/** Ticks of slack the report looks for on each side of a click. */
export const SLACK_TICKS = 30;
/** A shifted run gets this long past the full solution's own end to meet its purposes. It keeps
 *  stalemated runs short; when written, 600 gave the same table as the full 8-minute horizon. */
const SLACK_GRACE = 600;

export interface SlackRow {
  level: string;
  step: string;
  /** the recorded click */
  tick: number;
  /** ticks the click can come earlier / later; `${SLACK_TICKS}+` if it never lost within the look */
  early: number | string;
  late: number | string;
  /** ticks in the whole window, the recorded tick included */
  window: number | string;
  /** shifted clicks the sim refused: not losses, the click just would not land */
  refused: number;
}

/** Report only. For each step: how many ticks earlier and later its click can land (exactly, with every
 *  other click at its recorded tick) while the solution still meets everything it meets as written.
 *  Refused clicks (canAssign false) are not losses; clicks on the tick the Wyrdling appears are exempt. */
export function slackRows(def: LevelDef, rec: Recording): SlackRow[] {
  const goals = levelPurposes(def);
  const need = def.solutionSaves ?? def.target;
  const until = rec.sim.d.tick + SLACK_GRACE;
  const won = (s: Sim) => goals.every((p) => purposeMet(def, s, p));
  return def.solution.map((step, i) => {
    const f = rec.fired[i];
    const row: SlackRow = { level: def.id, step: `${i} ${step.skill} #${step.nth}`, tick: f, early: '-', late: '-', window: 'spawn', refused: 0 };
    if (f < 0) return { ...row, window: 'never fired' };
    if (f === rec.spawned[i]) return row;
    const edge = (dir: 1 | -1): number => {
      // every shift on this side shares the run up to its earliest click
      const base = rec.at(dir < 0 ? Math.max(0, f - SLACK_TICKS) : f);
      for (let k = 1; k <= SLACK_TICKS; k++) {
        const at = rec.fired.slice();
        at[i] = f + dir * k;
        const sim = base.clone();
        // settled once the click is refused, everything is met, or too few Wyrdlings are left
        const landed = playExact(sim, def.solution, at, until,
          (s, a) => s.d.tick >= at[i] && (!a[i] || won(s) || s.total - s.d.dead < need));
        if (!landed[i]) { row.refused++; continue; }
        if (!won(sim)) return k - 1;
      }
      return SLACK_TICKS;
    };
    const early = edge(-1);
    const late = edge(1);
    const open = early === SLACK_TICKS || late === SLACK_TICKS;
    const show = (n: number) => (n === SLACK_TICKS ? `${n}+` : n);
    return { ...row, early: show(early), late: show(late), window: open ? `${early + late + 1}+` : early + late + 1 };
  });
}

// one recording per level per test file, shared by its checks and the slack report
const recordings = new Map<string, Recording>();
function recording(def: LevelDef): Recording {
  let rec = recordings.get(def.id);
  if (!rec) recordings.set(def.id, (rec = recordSolution(def)));
  return rec;
}

/** The checks every level gets. One file per realm, so vitest runs the realms in parallel. */
export function describeLevels(levels: LevelDef[]): void {
  for (const def of levels) {
    describe(`${def.id} ${def.name}`, () => {
      it('is consistent', () => {
        expect(def.quota).toBeLessThanOrEqual(def.target);
        expect(def.target).toBeLessThanOrEqual(def.wyrdlings);
        expect(def.entities.filter((e) => e.type === 'entrance').length).toBe(1);
        expect(def.entities.filter((e) => e.type === 'exit').length).toBe(1);
        const can = new Set<StepPurpose>([...levelPurposes(def), 'finish']);
        def.solution.forEach((s, i) => {
          expect(s.purpose?.length, `step ${i} says what it is for`).toBeGreaterThan(0);
          for (const p of s.purpose ?? []) expect(can.has(p), `step ${i}: this level has no ${p}`).toBe(true);
        });
      });

      it('scripted solution reaches the target (and the spindle)', () => {
        const r = recording(def);
        expect(r.fired.filter((f) => f >= 0).length, 'every scripted step fired').toBe(def.solution.length);
        expect(r.sim.d.saved).toBeGreaterThanOrEqual(def.solutionSaves ?? def.target);
        if (def.entities.some((e) => e.type === 'spindle')) expect(r.sim.d.spindle).toBe(true);
        if (def.boss) expect(r.sim.d.boss!.hp).toBe(0);
        expect(r.sim.d.finished).toBe(true);
      });

      def.solution.forEach((s, i) => {
        it(`step ${i} (${s.skill} #${s.nth}) is load-bearing: ${(s.purpose ?? []).join(', ')}`, () => {
          const r = recording(def);
          expect(r.fired[i], 'the step fired in the full solution').toBeGreaterThanOrEqual(0);
          expect(lostWithout(def, r, i), 'dropping it loses at least one of its purposes').not.toEqual([]);
        });
      });

      it('doing nothing fails the quota and misses the spindle', () => {
        const r = runLevel(def, [], LEVEL_TICKS);
        expect(r.sim.d.saved).toBeLessThan(def.quota);
        expect(r.sim.d.spindle, 'the null run collects the spindle').toBe(false);
      });
    });
  }
}

/** Prints the realm's slack table; never fails. */
export function reportSlack(realm: string, levels: LevelDef[]): void {
  it(`${realm}: slack report (report only)`, () => {
    const rows = levels.flatMap((def) => slackRows(def, recording(def)));
    console.log(`${realm} slack: how many ticks each click can come earlier or later (every other click at its exact ` +
      `tick) while the solution still meets all it meets as written. Walkers move 1 px a tick, so ticks = px. ` +
      `${SLACK_TICKS}+ = never lost within ${SLACK_TICKS} ticks; refused = shifted clicks the sim refused (not losses); ` +
      `spawn = clicked as the Wyrdling appears (exempt).`);
    console.table(rows);
  });
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
