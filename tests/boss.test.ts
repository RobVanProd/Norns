import { describe, expect, it } from 'vitest';
import type { LevelDef } from '../src/sim/level';
import { Sim } from '../src/sim/sim';
import { foresee } from '../src/sim/foresight';
import { flatLevel } from './helpers';
import { ALL_LEVELS } from '../src/levels';

function arena(kind: 'wyrm' | 'jotunn' | 'herald'): LevelDef {
  return flatLevel({
    width: 480, height: 240, wyrdlings: 10, quota: 1, target: 1, rate: 25,
    terrain: [
      { op: 'rect', mat: 'Earth', x: 0, y: 200, w: 480, h: 40 },
      { op: 'rect', mat: 'Rock', x: 0, y: 0, w: 480, h: 20 },
    ],
    entities: [
      { type: 'entrance', x: 40, y: 150 }, { type: 'exit', x: 300, y: 199 },
      { type: 'seidr', x: 120, y: 199 }, { type: 'seidr', x: 200, y: 199 },
    ],
    boss: { kind, x: 420, y: 170, hp: 3, delay: 60, arena: { x0: 20, x1: 380, floorY: 199 } },
  });
}

describe('bosses', () => {
  for (const kind of ['wyrm', 'jotunn', 'herald'] as const) {
    it(`${kind}: attacks, stones damage it, defeat unlocks the exit, deterministic`, () => {
      const sim = Sim.create(arena(kind));
      const acts = new Set<string>();
      let hits = 0;
      for (let i = 0; i < 30 * 90 && !sim.d.finished; i++) {
        sim.step();
        if (sim.d.boss!.act !== 'idle') acts.add(sim.d.boss!.act);
        for (const e of sim.events) if (e.type === 'boss_hit') hits++;
      }
      expect(acts.size).toBeGreaterThan(0);
      expect(hits).toBeGreaterThan(0);
      // replay determinism
      const a = Sim.create(arena(kind));
      const b = Sim.create(arena(kind));
      for (let i = 0; i < 1200; i++) { a.step(); b.step(); }
      expect(JSON.stringify(a.d)).toBe(JSON.stringify(b.d));
      expect(a.terrain.hash()).toBe(b.terrain.hash());
    });
  }

  it('stones light in the level’s fixed order, and every attack strikes its fixed aim in turn', () => {
    const def: LevelDef = { ...arena('jotunn'), boss: { ...arena('jotunn').boss!, hp: 9, stones: [1, 0, 1], aim: { icicles: [100, 300], slam: [150] } } };
    const sim = Sim.create(def);
    const lit: number[] = [], strikes: string[] = [];
    for (let i = 0; i < 30 * 60 && strikes.length < 6; i++) {
      sim.step();
      for (const e of sim.events) {
        if (e.type === 'seidr_on') lit.push(e.id!);
        if (e.type === 'icicle_warn') strikes.push(`icicles@${(sim.d.projectiles.reduce((a, p) => a + p.tx, 0) / sim.d.projectiles.length).toFixed(0)}`);
        if (e.type === 'hazard_slam' || e.type === 'hazard_breath') strikes.push(`${e.s}@${Math.round(e.type === 'hazard_slam' ? e.x : 0)}`);
      }
    }
    expect(lit.slice(0, 3)).toEqual([1, 0, 1]);
    // icicles centre on 100, then 300; the breath (no aim) on the arena's middle; the slam on 150
    expect(strikes.slice(0, 5)).toEqual(['icicles@100', 'breath@0', 'slam@150', 'icicles@300', 'breath@0']);
    expect(sim.d.rng, 'no boss draws on the RNG').toBe(def.seed >>> 0);
  });

  it('a fallen Jötunn’s last quake shakes loose a Warden still holding the crowd back', () => {
    for (const kind of ['jotunn', 'wyrm'] as const) {
      const base = arena(kind);
      const def: LevelDef = {
        ...base,
        skills: { warden: 1 },
        entities: [{ type: 'entrance', x: 40, y: 150 }, { type: 'exit', x: 300, y: 199 }, { type: 'seidr', x: 20, y: 199 }],
        boss: { ...base.boss!, hp: 1, delay: 3000, aim: { slam: [100] } },
      };
      const sim = Sim.create(def);
      let fell = -1;
      for (let i = 0; i < 600 && fell < 0; i++) {
        if (sim.d.wyrds[0]?.st === 'walk' && sim.d.wyrds[0].x >= 80) sim.assign(0, 'warden');
        sim.step();
        if (sim.events.some((e) => e.type === 'boss_defeat')) fell = sim.d.tick;
      }
      // the second Wyrdling turns at the Warden and strikes the stone behind it
      expect(fell, kind).toBeGreaterThan(0);
      expect(sim.d.wyrds[0].st).toBe('warden');
      for (let i = 0; i < 40; i++) sim.step();
      expect(sim.d.wyrds[0].st === 'warden', kind).toBe(kind === 'wyrm');
    }
  });

  it('exit is locked while the boss lives and opens when it falls', () => {
    const sim = Sim.create(arena('wyrm'));
    expect(sim.exitOpen).toBe(false);
    sim.d.boss!.hp = 0;
    expect(sim.exitOpen).toBe(true);
  });

  it('foresight predicts boss kills that the real sim then produces', () => {
    const sim = Sim.create(ALL_LEVELS.find((l) => l.id === 'u5')!);
    let fate = foresee(sim, 120);
    // advance until foresight predicts at least one death (non-vacuous comparison)
    for (let i = 0; i < 3000 && fate.dead === 0; i++) {
      sim.step();
      if (i % 10 === 0) fate = foresee(sim, 120);
    }
    expect(fate.dead).toBeGreaterThan(0);
    const predictedDead = [...fate.ends.entries()].filter(([, e]) => e.kind === 'dead').map(([id]) => id).sort();
    const actualDead: number[] = [];
    for (let i = 0; i < 120; i++) {
      sim.step();
      for (const e of sim.events) if (e.type === 'death' && e.id !== undefined) actualDead.push(e.id);
    }
    expect(actualDead.sort()).toEqual(predictedDead);
  });
});
