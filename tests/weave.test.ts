// The Weave: a recorded attempt must replay to the identical run, survive its text encoding, and know
// when the level it was recorded on has changed.
import { describe, expect, it } from 'vitest';
import { ALL_LEVELS } from '../src/levels';
import type { LevelDef } from '../src/sim/level';
import { Sim } from '../src/sim/sim';
import { SolutionPlayer } from '../src/sim/solution';
import {
  Replayer, SIM_VERSION, WeaveRecorder, decodeWeave, encodeWeave, isStale, levelHash, type Weave,
} from '../src/sim/weave';

const MAX = 30 * 60 * 8;

/** Play the scripted solution, recording every calling it grants. Optionally cut the threads at `cutAt`. */
function record(def: LevelDef, cutAt = Infinity): { sim: Sim; weave: Weave } {
  const sim = Sim.create(def);
  const sol = new SolutionPlayer(def.solution);
  const rec = new WeaveRecorder(def);
  while (sim.d.tick < MAX && !sim.d.finished) {
    for (const s of sol.apply(sim)) rec.record(sim, s.nth, s.skill);
    if (sim.d.tick >= cutAt) { rec.cut(sim); sim.finishNow(); break; }
    sim.step();
  }
  return { sim, weave: rec.weave };
}

const memo = new Map<string, { sim: Sim; weave: Weave }>();
/** The scripted solution's recording, made once per level. */
function solved(def: LevelDef): { sim: Sim; weave: Weave } {
  let r = memo.get(def.id);
  if (!r) memo.set(def.id, (r = record(def)));
  return r;
}

function replay(def: LevelDef, weave: Weave): { sim: Sim; rp: Replayer } {
  const sim = Sim.create(def);
  const rp = new Replayer(weave);
  while (sim.d.tick < MAX && !sim.d.finished) {
    rp.apply(sim);
    if (sim.d.finished) break;
    sim.step();
  }
  return { sim, rp };
}

describe('weave', () => {
  for (const def of ALL_LEVELS) {
    it(`${def.id}: the scripted solution's Weave replays to the identical run`, () => {
      const { sim, weave } = solved(def);
      expect(weave.entries.length, 'every scripted step was recorded').toBe(def.solution.length);
      const back = decodeWeave(encodeWeave(weave));
      expect(back).toEqual(weave);
      const r = replay(def, back!);
      expect(r.rp.desync).toBeNull();
      expect(r.rp.finished).toBe(true);
      expect(r.sim.d.saved).toBe(sim.d.saved);
      expect(r.sim.terrain.hash()).toBe(sim.terrain.hash());
      expect(JSON.stringify(r.sim.d)).toBe(JSON.stringify(sim.d));
      expect(r.rp.isStale(def)).toBe(false);
    });
  }

  it('encodes every scripted solution in under 200 characters', () => {
    const lengths = ALL_LEVELS.map((def) => [def.id, encodeWeave(solved(def).weave).length] as const);
    console.log('Weave lengths: ' + lengths.map(([id, n]) => `${id} ${n}`).join(', '));
    expect(Math.max(...lengths.map(([, n]) => n))).toBeLessThan(200);
  });

  it('records and replays cutting the threads', () => {
    const def = ALL_LEVELS.find((l) => l.id === 'm3')!;
    const { sim, weave } = record(def, 500);
    expect(weave.cut).toBe(500);
    const text = encodeWeave(weave);
    expect(decodeWeave(text)).toEqual(weave);
    const r = replay(def, decodeWeave(text)!);
    expect(r.rp.desync).toBeNull();
    expect(r.sim.d.finished).toBe(true);
    expect(r.sim.d.tick).toBe(500);
    expect(JSON.stringify(r.sim.d)).toBe(JSON.stringify(sim.d));
  });

  it('drops the callings a rewind undid', () => {
    const def = ALL_LEVELS.find((l) => l.id === 'm2')!;
    const { weave } = solved(def);
    const rec = new WeaveRecorder(def);
    rec.weave.entries.push(...weave.entries.map((e) => ({ ...e })));
    rec.weave.cut = weave.entries[2].tick + 50;
    rec.rewind(weave.entries[1].tick);
    expect(rec.weave.entries).toEqual([weave.entries[0]]);
    expect(rec.weave.cut).toBeUndefined();
    // recording into the past without rewinding first is a bug in the caller
    const sim = Sim.create(def);
    expect(() => rec.record(sim, 0, 'weaver')).toThrow();
  });

  it('goes stale when the geometry, the rules version or the level changes, not the text', () => {
    const def = ALL_LEVELS.find((l) => l.id === 'n3')!;
    const { weave } = solved(def);
    expect(isStale(weave, def)).toBe(false);
    expect(levelHash(structuredClone(def))).toBe(levelHash(def));

    const moved = structuredClone(def);
    const rect = moved.terrain.find((op) => op.op === 'rect')!;
    if (rect.op === 'rect') rect.w += 1;
    expect(isStale(weave, moved)).toBe(true);

    const entity = structuredClone(def);
    const plate = entity.entities.find((e) => e.type === 'plate')!;
    plate.x += 1;
    expect(isStale(weave, entity)).toBe(true);

    expect(isStale(weave, { ...def, rate: def.rate + 1 })).toBe(true);
    expect(isStale({ ...weave, v: SIM_VERSION + 1 }, def)).toBe(true);
    expect(isStale(weave, { ...def, id: 'n4' })).toBe(true);

    const reworded = { ...def, name: 'Renamed', intro: 'New words.', hints: [], music: 'boss', entities: def.entities.filter((e) => e.type !== 'decor') };
    expect(isStale(weave, reworded)).toBe(false);
    // key order never matters
    const reordered = Object.fromEntries(Object.entries(def).reverse()) as unknown as LevelDef;
    expect(levelHash(reordered)).toBe(levelHash(def));
  });

  it('notices a replay that goes out of step', () => {
    const def = ALL_LEVELS.find((l) => l.id === 'm1')!;
    const { weave } = solved(def);
    const late = { ...weave, entries: weave.entries.map((e) => ({ ...e, tick: e.tick + 3 })) };
    expect(replay(def, late).rp.desync?.reason).toBe('moved');
    const early = { ...weave, entries: weave.entries.map((e) => ({ ...e, tick: 0 })) };
    expect(replay(def, early).rp.desync?.reason).toBe('moved');
  });

  it('round-trips edge values and rejects malformed text', () => {
    const w: Weave = {
      v: SIM_VERSION, level: 'u5', hash: 0xffffffff, cut: 99999,
      entries: [
        { tick: 0, id: 0, skill: 'digger', x: 0, y: 0 },
        { tick: 0, id: 300, skill: 'blast', x: -5, y: 1000 },
        { tick: 99000, id: 19, skill: 'glider', x: 639, y: -1 },
      ],
    };
    const text = encodeWeave(w);
    expect(text.startsWith(`${SIM_VERSION}.`)).toBe(true);
    expect(text).toMatch(/^[0-9]+\.[A-Za-z0-9_-]+$/);
    expect(decodeWeave(text)).toEqual(w);
    expect(decodeWeave(encodeWeave({ ...w, entries: [], cut: undefined }))).toEqual({ ...w, entries: [], cut: undefined });

    const payload = text.slice(text.indexOf('.') + 1);
    for (const bad of ['', '1', '1.', 'x.' + payload, '0.' + payload, '1.' + payload + 'A', '1.' + payload.slice(0, -2), '1.' + payload + '!', '1.' + payload.slice(0, -1) + '_']) {
      expect(decodeWeave(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(() => encodeWeave({ ...w, entries: [w.entries[2], w.entries[0]] })).toThrow();
    expect(() => encodeWeave({ ...w, cut: 5 })).toThrow();
    expect(() => encodeWeave({ ...w, entries: [{ ...w.entries[0], x: 1.5 }] })).toThrow();
  });
});
