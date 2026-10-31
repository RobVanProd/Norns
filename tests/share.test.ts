// Share links and personal records (src/game/share.ts, src/game/save.ts): a Weave survives the trip
// through a URL and replays to the identical run, a link that can't replay true says why instead of
// playing, the copied result gives nothing away, and records only ever come from a Weave that replays
// headless to exactly the run that was claimed.
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_LEVELS } from '../src/levels';
import { levelRecords, loadSave, offerRecords, writeSave, type SaveData } from '../src/game/save';
import { fmtTicks, histogram, readShared, resultText, shareUrl, skuldPar, verifyWeave, weaveFromHash, type RunFacts } from '../src/game/share';
import type { LevelDef } from '../src/sim/level';
import { Sim } from '../src/sim/sim';
import { SolutionPlayer } from '../src/sim/solution';
import { Replayer, SIM_VERSION, WeaveRecorder, encodeWeave, type Weave } from '../src/sim/weave';

const MAX = 30 * 60 * 8;
const level = (id: string): LevelDef => ALL_LEVELS.find((l) => l.id === id)!;

/** Play the scripted solution, recording every calling; cut the threads once `cut(sim)` says so. */
function record(def: LevelDef, cut?: (sim: Sim) => boolean): { sim: Sim; weave: Weave } {
  const sim = Sim.create(def);
  const sol = new SolutionPlayer(def.solution);
  const rec = new WeaveRecorder(def);
  while (sim.d.tick < MAX && !sim.d.finished) {
    for (const s of sol.apply(sim)) rec.record(sim, s.nth, s.skill);
    if (cut?.(sim)) { rec.cut(sim); sim.finishNow(); break; }
    sim.step();
  }
  return { sim, weave: rec.weave };
}

/** What a run claims at the results screen, as PlayScene reports it. */
function claim(sim: Sim): RunFacts {
  const b = sim.d.boss;
  return { saved: sim.d.saved, used: sim.d.used, ticks: sim.d.tick, spindle: sim.d.spindle, bossDefeated: b ? b.hp <= 0 : null };
}

/** Watch a Weave the way Skuld's Vision plays one: the Replayer grants before every step. */
function watch(def: LevelDef, w: Weave): Sim {
  const sim = Sim.create(def);
  const rp = new Replayer(w);
  while (sim.d.tick < MAX && !sim.d.finished) {
    rp.apply(sim);
    if (sim.d.finished) break;
    sim.step();
  }
  expect(rp.desync).toBeNull();
  return sim;
}

const g = globalThis as unknown as { localStorage?: Storage };
afterEach(() => { delete g.localStorage; });

describe('share links', () => {
  for (const id of ['m2', 'm3c', 'n4', 'u3', 'u5']) {
    it(`${id}: encode → URL → decode → replay matches the original run`, () => {
      const def = level(id);
      const { sim, weave } = record(def);
      const url = shareUrl('https://example.org/norns/', weave);
      expect(url).toMatch(/^https:\/\/example\.org\/norns\/#weave=[0-9]+\.[A-Za-z0-9_-]+$/);
      // the browser's own URL parsing, as location.hash would hand it over
      const text = weaveFromHash(new URL(url).hash);
      expect(text).toBe(encodeWeave(weave));
      const shared = readShared(text!, ALL_LEVELS);
      expect(shared.kind).toBe('ok');
      if (shared.kind !== 'ok') return;
      expect(shared.level).toBe(def);
      expect(shared.w).toEqual(weave);
      expect(shared.facts).toEqual(claim(sim));
      const again = watch(def, shared.w);
      expect(again.terrain.hash()).toBe(sim.terrain.hash());
      expect(JSON.stringify(again.d)).toBe(JSON.stringify(sim.d));
    });
  }

  it('replays a run that cut the threads, to the tick', () => {
    const def = level('m3');
    const { sim, weave } = record(def, (s) => s.d.tick >= 700);
    const shared = readShared(weaveFromHash(new URL(shareUrl('http://localhost:5173/', weave)).hash)!, ALL_LEVELS);
    expect(shared.kind === 'ok' && shared.facts).toEqual(claim(sim));
    expect(JSON.stringify(watch(def, weave).d)).toBe(JSON.stringify(sim.d));
  });

  it('finds the Weave among other hash parameters, and nothing in a hash without one', () => {
    expect(weaveFromHash('#weave=1.AbC_-')).toBe('1.AbC_-');
    expect(weaveFromHash('#from=friend&weave=1.xyz')).toBe('1.xyz');
    expect(weaveFromHash('#weave=1.xyz&from=friend')).toBe('1.xyz');
    expect(weaveFromHash('weave=1.xyz')).toBe('1.xyz');
    expect(weaveFromHash('')).toBeNull();
    expect(weaveFromHash('#weaver=1.xyz')).toBeNull();
    expect(weaveFromHash('#level=m1')).toBeNull();
  });

  it('marks a link it cannot replay true, and never replays it', () => {
    const def = level('n3');
    const { weave } = record(def);
    const read = (w: Weave) => readShared(encodeWeave(w), ALL_LEVELS);
    expect(read({ ...weave, v: SIM_VERSION + 1 })).toMatchObject({ kind: 'old', why: 'version', level: def });
    expect(read({ ...weave, hash: (weave.hash + 1) >>> 0 })).toMatchObject({ kind: 'old', why: 'level', level: def });
    expect(read({ ...weave, level: 'zz9' })).toMatchObject({ kind: 'old', why: 'level', level: null });
    // the right version and level, but a calling three ticks late: out of step
    expect(read({ ...weave, entries: weave.entries.map((e) => ({ ...e, tick: e.tick + 3 })) })).toMatchObject({ kind: 'step', level: def });
    expect(readShared('not a weave', ALL_LEVELS)).toEqual({ kind: 'bad' });
    expect(readShared('', ALL_LEVELS)).toEqual({ kind: 'bad' });
  });

  it('copies a result with counts and stars only', () => {
    const def = level('m2');
    const text = resultText(def, { saved: 12, used: 2 }, 0b111, 'https://example.org/norns/');
    expect(text).toBe("NORNS · The Weaver's Bridge · 12/12 saved · 2 callings · ★★★\nhttps://example.org/norns/");
    expect(resultText(def, { saved: 9, used: 1 }, 0b001, 'u')).toBe("NORNS · The Weaver's Bridge · 9/12 saved · 1 calling · ★☆☆\nu");
    // a level without a spindle has two stars to show
    const plain = ALL_LEVELS.find((l) => !l.entities.some((e) => e.type === 'spindle'))!;
    expect(resultText(plain, { saved: 1, used: 0 }, 0, 'u')).toContain('· ☆☆\n');
    // no positions, ticks or Weave: the only numbers are the counts
    const { sim, weave } = record(def);
    const shared = resultText(def, { saved: sim.d.saved, used: sim.d.used }, 0b11, 'https://example.org/norns/');
    expect(shared).not.toContain('#');
    expect(shared).not.toContain(encodeWeave(weave).slice(2));
    expect(shared.split('\n')[0].match(/[0-9]+/g)).toEqual([String(sim.d.saved), String(def.wyrdlings), String(sim.d.used)]);
  });
});

describe('personal records', () => {
  const def = level('m2');
  const fresh = (): SaveData => loadSave();

  it('come from a verified clear, and match Skuld when the run is his', () => {
    const s = fresh();
    const { sim, weave } = record(def);
    const out = offerRecords(s, def, weave, claim(sim));
    expect(out.facts).toEqual(claim(sim));
    expect(out.set).toEqual(['saved', 'used', 'ticks']);
    const r = levelRecords(s, def)!;
    expect(r.saved).toEqual({ saved: sim.d.saved, used: sim.d.used, ticks: sim.d.tick, weave: encodeWeave(weave) });
    expect(r.runs).toEqual([[sim.d.saved, sim.d.used, sim.d.tick]]);
    expect(skuldPar(def)).toEqual(claim(sim));
    // the same run again beats nothing, but joins the past runs
    expect(offerRecords(s, def, weave, claim(sim)).set).toEqual([]);
    expect(levelRecords(s, def)!.runs).toHaveLength(2);
  });

  it('refuse a tampered Weave or a claim the replay does not bear out, and change nothing', () => {
    const s = fresh();
    const { sim, weave } = record(def);
    offerRecords(s, def, weave, claim(sim));
    const before = JSON.stringify(s.records);
    const e0 = weave.entries[0];
    const tampered: [string, Weave, RunFacts][] = [
      ['a calling moved one tick later', { ...weave, entries: [{ ...e0, tick: e0.tick + 1 }, ...weave.entries.slice(1)] }, claim(sim)],
      ['a calling given to another Wyrdling', { ...weave, entries: [{ ...e0, id: e0.id + 1 }, ...weave.entries.slice(1)] }, claim(sim)],
      ['a calling recorded one pixel off', { ...weave, entries: [{ ...e0, x: e0.x + 1 }, ...weave.entries.slice(1)] }, claim(sim)],
      ['another calling than the one granted', { ...weave, entries: [{ ...e0, skill: e0.skill === 'digger' ? 'basher' : 'digger' }, ...weave.entries.slice(1)] }, claim(sim)],
      ['every calling dropped', { ...weave, entries: [] }, claim(sim)],
      ['a calling after the end', { ...weave, entries: [...weave.entries, { ...e0, tick: sim.d.tick + 100 }] }, claim(sim)],
      ['recorded on another shape of the level', { ...weave, hash: (weave.hash + 1) >>> 0 }, claim(sim)],
      ['recorded on another simulation version', { ...weave, v: SIM_VERSION + 1 }, claim(sim)],
      ['a true Weave, but more saved claimed', weave, { ...claim(sim), saved: sim.d.saved + 1 }],
      ['a true Weave, but fewer callings claimed', weave, { ...claim(sim), used: sim.d.used - 1 }],
      ['a true Weave, but a faster finish claimed', weave, { ...claim(sim), ticks: sim.d.tick - 30 }],
    ];
    for (const [why, w, c] of tampered) {
      expect(offerRecords(s, def, w, c), why).toEqual({ facts: null, set: [] });
      expect(JSON.stringify(s.records), why).toBe(before);
    }
    expect(verifyWeave(def, weave)).toEqual(claim(sim));
  });

  it('take each record from the run that beats it, and only clears count', () => {
    const s = fresh();
    const full = record(def);
    offerRecords(s, def, full.weave, claim(full.sim));
    // cut the threads the moment the quota is met: faster, but fewer saved, with the same callings
    const quick = record(def, (sim) => sim.d.saved >= def.quota);
    expect(quick.sim.d.tick).toBeLessThan(full.sim.d.tick);
    expect(offerRecords(s, def, quick.weave, claim(quick.sim)).set).toEqual(['ticks']);
    const r = levelRecords(s, def)!;
    expect(r.ticks.ticks).toBe(quick.sim.d.tick);
    expect(r.saved.saved).toBe(full.sim.d.saved);
    expect(r.runs).toHaveLength(2);
    // a run that missed the quota is verified, but sets nothing and is not one of the past clears
    const lost = record(def, (sim) => sim.d.tick >= 200);
    const out = offerRecords(s, def, lost.weave, claim(lost.sim));
    expect(out.facts).toEqual(claim(lost.sim));
    expect(out.set).toEqual([]);
    expect(levelRecords(s, def)!.runs).toHaveLength(2);
  });

  it('are kept with the save, and set aside when the level changes shape', () => {
    const store = new Map<string, string>();
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } as Storage;
    const s = loadSave();
    const { sim, weave } = record(def);
    offerRecords(s, def, weave, claim(sim));
    writeSave(s);
    const back = loadSave();
    expect(levelRecords(back, def)).toEqual(levelRecords(s, def));
    expect(levelRecords(back, { ...def, intro: 'Other words.' })).not.toBeNull();
    const moved = structuredClone(def);
    const rect = moved.terrain.find((op) => op.op === 'rect')!;
    if (rect.op === 'rect') rect.w += 1;
    expect(levelRecords(back, moved)).toBeNull();
    // a save from before records existed loads with none
    store.set('norns.save.v1', JSON.stringify({ v: 1, stars: { m1: 1 } }));
    expect(loadSave().records).toEqual({});
  });
});

describe('record display helpers', () => {
  it('bins whole numbers one per bin while they fit, and evenly after', () => {
    const h = histogram([3, 3, 4, 7], 3, 7, 10);
    expect(h.counts).toEqual([2, 1, 0, 0, 1]);
    expect(h.bin(7)).toBe(4);
    const wide = histogram([600, 650, 1199, 1200], 600, 1200, 8);
    expect(wide.counts).toHaveLength(8);
    expect(wide.counts.reduce((a, b) => a + b)).toBe(4);
    expect(wide.bin(600)).toBe(0);
    expect(wide.bin(1200)).toBe(7);
    expect(histogram([5], 5, 5, 8).counts).toEqual([1]);
  });

  it('shows game time to a tenth of a second', () => {
    expect(fmtTicks(0)).toBe('0:00.0');
    expect(fmtTicks(788)).toBe('0:26.2');
    expect(fmtTicks(30 * 61 + 15)).toBe('1:01.5');
  });
});
