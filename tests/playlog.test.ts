// The player's best Weave in the save, and the local playtest log: ranking, staleness, the misgrant
// proxy, and a report whose Weaves decode and replay.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bestWeave, loadSave, offerWeave, writeSave } from '../src/game/save';
import { AttemptLog, eraseStats, levelStats, loadStats, logFinish, logQuit, playtestReport } from '../src/game/stats';
import { ALL_LEVELS } from '../src/levels';
import type { LevelDef } from '../src/sim/level';
import { Sim } from '../src/sim/sim';
import { SolutionPlayer } from '../src/sim/solution';
import { Replayer, WeaveRecorder, decodeWeave, type Weave } from '../src/sim/weave';

const m1 = ALL_LEVELS.find((l) => l.id === 'm1')!;

/** A Map-backed localStorage for node. */
beforeEach(() => {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k),
  };
});
afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

/** A level's scripted solution, recorded as the player would; cut at `cutAt` if given. */
function play(cutAt?: number, def: LevelDef = m1): { sim: Sim; weave: Weave } {
  const sim = Sim.create(def);
  const sol = new SolutionPlayer(def.solution);
  const rec = new WeaveRecorder(def);
  while (!sim.d.finished) {
    for (const s of sol.apply(sim)) rec.record(sim, s.nth, s.skill);
    if (sim.d.tick === cutAt) { rec.cut(sim); sim.finishNow(); break; }
    sim.step();
  }
  return { sim, weave: rec.weave };
}

describe('best Weave', () => {
  it('keeps the run that saved most, then used fewer callings, then took fewer ticks', () => {
    const s = loadSave();
    const full = play();
    const cut = play(600);
    expect(cut.sim.d.saved).toBeGreaterThan(0);
    expect(offerWeave(s, m1, cut.weave, { saved: cut.sim.d.saved, ticks: 600 })).toBe(true);
    expect(offerWeave(s, m1, full.weave, { saved: full.sim.d.saved, ticks: full.sim.d.tick })).toBe(true);
    expect(offerWeave(s, m1, cut.weave, { saved: cut.sim.d.saved, ticks: 600 })).toBe(false);
    // same saves and callings: only a faster run replaces it
    expect(offerWeave(s, m1, full.weave, { saved: full.sim.d.saved, ticks: full.sim.d.tick + 1 })).toBe(false);
    expect(offerWeave(s, m1, full.weave, { saved: full.sim.d.saved, ticks: full.sim.d.tick - 1 })).toBe(true);
    writeSave(s);
    const back = bestWeave(loadSave(), m1)!;
    expect(back.saved).toBe(m1.wyrdlings);
    expect(back.w).toEqual(full.weave);
  });

  it('ignores a Weave recorded on another shape of the level, and replaces it', () => {
    const s = loadSave();
    const full = play();
    offerWeave(s, m1, full.weave, { saved: full.sim.d.saved, ticks: full.sim.d.tick });
    // new words on the intro card keep it
    expect(bestWeave(s, { ...m1, intro: 'other words', idea: 'one idea' })).not.toBeNull();
    const moved: LevelDef = { ...m1, entities: m1.entities.map((e) => (e.type === 'exit' ? { ...e, x: e.x + 1 } : e)) };
    expect(bestWeave(s, moved)).toBeNull();
    // a run that saved nobody is never kept; any other run on the new shape beats the stale best
    const cut = play(100, moved);
    expect(offerWeave(s, moved, cut.weave, { saved: 0, ticks: 100 })).toBe(false);
    expect(bestWeave(s, moved)).toBeNull();
    const worse = play(600, moved);
    expect(worse.sim.d.saved).toBeGreaterThan(0);
    expect(worse.sim.d.saved).toBeLessThan(full.sim.d.saved);
    expect(offerWeave(s, moved, worse.weave, { saved: worse.sim.d.saved, ticks: 600 })).toBe(true);
    expect(bestWeave(s, moved)!.saved).toBe(worse.sim.d.saved);
  });
});

describe('playtest log', () => {
  it('counts a calling rewound within 2 s as a likely mis-assignment, once', () => {
    const log = new AttemptLog();
    log.grant(10);
    log.rewound(30, 11.5);
    log.rewound(30, 11.6);
    log.grant(20);
    log.rewound(60, 23);
    expect(log.misgrants).toBe(1);
    expect(log.rewindTicks).toBe(120);
    expect(log.callings).toBe(2);
  });

  it('persists, reports Weaves that replay, and erases', () => {
    const st = loadStats();
    const full = play();
    const log = new AttemptLog();
    log.sec = 42;
    log.grant(1);
    levelStats(st, 'm1').attempts = 2;
    logQuit(st, 'm1', new AttemptLog(), { tick: 300, saved: 0, used: 0, via: 'restart' }, play(300).weave);
    logFinish(st, 'm1', log, true, full.weave);
    const back = loadStats().levels.m1;
    expect(back).toMatchObject({ attempts: 2, restarts: 1, finishes: 1, clears: 1, clearSec: 42, clearAttempts: 2, callings: 1 });
    expect(back.quits).toMatchObject([{ tick: 300, saved: 0, used: 0, via: 'restart' }]);

    const report = JSON.parse(playtestReport(loadStats(), ALL_LEVELS, { m1: 7 }, { w: 1280, h: 720, touch: false }));
    expect(report.levels.m1.stars).toBe(7);
    // the finished attempt replays to its end; the one left at tick 300 replays to there and stops
    const finished = (report.levels.m1.weaves as string[]).map((t) => decodeWeave(t)!);
    const quit = decodeWeave(report.levels.m1.quits[0].weave)!;
    expect(finished.length).toBe(1);
    expect(quit.cut).toBe(300);
    for (const [w, ticks] of [[finished[0], full.sim.d.tick], [quit, 300]] as const) {
      expect(w.level).toBe('m1');
      const sim = Sim.create(m1);
      const r = new Replayer(w);
      while (!sim.d.finished) { r.apply(sim); sim.step(); }
      expect(r.desync).toBeNull();
      expect(sim.d.tick).toBe(ticks);
    }
    expect(quit.entries.length).toBe(1);

    eraseStats();
    expect(loadStats().levels).toEqual({});
  });
});
