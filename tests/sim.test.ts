import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { flatLevel, runLevel, runSim } from './helpers';

describe('wyrdling basics', () => {
  it('walks from the entrance to the exit on flat ground', () => {
    const r = runLevel(flatLevel());
    expect(r.sim.d.saved).toBe(1);
    expect(r.sim.d.dead).toBe(0);
    expect(r.sim.d.finished).toBe(true);
  });

  it('turns around at walls', () => {
    const def = flatLevel({
      terrain: [
        { op: 'rect', mat: 'Earth', x: 0, y: 120, w: 320, h: 40 },
        { op: 'rect', mat: 'Rock', x: 150, y: 60, w: 10, h: 60 },
      ],
    });
    const sim = Sim.create(def);
    let turned = false;
    for (let i = 0; i < 400; i++) {
      sim.step();
      const w = sim.d.wyrds[0];
      if (w && w.dir === -1) turned = true;
    }
    expect(turned).toBe(true);
    expect(sim.d.wyrds[0].x).toBeLessThan(150);
  });

  it('dies from a long fall but survives a short one', () => {
    const tall = flatLevel({ entities: [{ type: 'entrance', x: 30, y: 10 }, { type: 'exit', x: 290, y: 119 }] });
    // drop from y=32 to 119 = 87 px > 64
    const r = runLevel(tall);
    expect(r.sim.d.dead).toBe(1);
    const short = runLevel(flatLevel());
    expect(short.sim.d.dead).toBe(0);
  });

  it('glider survives the long fall', () => {
    const tall = flatLevel({
      skills: { glider: 1 },
      entities: [{ type: 'entrance', x: 30, y: 10 }, { type: 'exit', x: 290, y: 119 }],
      solution: [{ nth: 0, skill: 'glider' }],
    });
    const r = runLevel(tall);
    expect(r.sim.d.dead).toBe(0);
    expect(r.sim.d.saved).toBe(1);
  });

  it('digger digs through soft ground and stops at iron', () => {
    const def = flatLevel({
      skills: { digger: 1 },
      terrain: [
        { op: 'rect', mat: 'Earth', x: 0, y: 120, w: 320, h: 40 },
        { op: 'rect', mat: 'Iron', x: 0, y: 150, w: 320, h: 10 },
      ],
      solution: [{ nth: 0, x: 100, skill: 'digger' }],
    });
    const r = runLevel(def, def.solution, 900);
    const w = r.sim.d.wyrds[0];
    expect(w.y).toBe(149);
    expect(r.sim.terrain.get(100, 130)).toBe(0);
  });

  it('weaver builds a staircase that bridges a gap', () => {
    const def = flatLevel({
      skills: { weaver: 1 },
      terrain: [
        { op: 'rect', mat: 'Earth', x: 0, y: 120, w: 140, h: 40 },
        { op: 'rect', mat: 'Earth', x: 170, y: 105, w: 150, h: 55 },
      ],
      entities: [{ type: 'entrance', x: 30, y: 80 }, { type: 'exit', x: 290, y: 104 }],
      solution: [{ nth: 0, x: 134, skill: 'weaver' }],
    });
    const r = runLevel(def);
    expect(r.sim.d.saved).toBe(1);
  });

  it('warden turns walkers back', () => {
    const def = flatLevel({
      wyrdlings: 3, quota: 1, rate: 40,
      skills: { warden: 1 },
      solution: [{ nth: 0, x: 120, skill: 'warden' }],
    });
    const r = runLevel(def, def.solution, 1500);
    // only the warden reaches nothing; others bounce between the left wall and the warden
    expect(r.sim.d.saved).toBe(0);
    expect(r.sim.d.wyrds[0].st).toBe('warden');
    expect(r.sim.d.wyrds[1].x).toBeLessThan(120);
  });

  it('basher tunnels through a wall', () => {
    const def = flatLevel({
      skills: { basher: 1 },
      terrain: [
        { op: 'rect', mat: 'Earth', x: 0, y: 120, w: 320, h: 40 },
        { op: 'rect', mat: 'Rock', x: 150, y: 60, w: 30, h: 60 },
      ],
      solution: [{ nth: 0, x: 146, skill: 'basher' }],
    });
    const r = runLevel(def);
    expect(r.sim.d.saved).toBe(1);
  });

  it('miner tunnels diagonally down', () => {
    const def = flatLevel({
      skills: { miner: 1 },
      terrain: [
        { op: 'rect', mat: 'Earth', x: 0, y: 120, w: 320, h: 40 },
        { op: 'rect', mat: 'Rock', x: 150, y: 60, w: 40, h: 60 },
      ],
      solution: [{ nth: 0, x: 140, skill: 'miner' }],
    });
    const sim = Sim.create(def);
    runSim(sim, def.solution, 700);
    const w = sim.d.wyrds[0];
    expect(w.y).toBeGreaterThan(119);
  });

  it('climber scales a wall', () => {
    const def = flatLevel({
      skills: { climber: 1 },
      terrain: [
        { op: 'rect', mat: 'Earth', x: 0, y: 120, w: 320, h: 40 },
        { op: 'rect', mat: 'Rock', x: 150, y: 90, w: 170, h: 30 },
      ],
      entities: [{ type: 'entrance', x: 30, y: 80 }, { type: 'exit', x: 290, y: 89 }],
      solution: [{ nth: 0, skill: 'climber' }],
    });
    const r = runLevel(def);
    expect(r.sim.d.saved).toBe(1);
  });

  it('leaper clears a gap', () => {
    const def = flatLevel({
      skills: { leaper: 1 },
      terrain: [
        { op: 'rect', mat: 'Earth', x: 0, y: 120, w: 140, h: 40 },
        { op: 'rect', mat: 'Earth', x: 175, y: 120, w: 145, h: 40 },
      ],
      solution: [{ nth: 0, x: 136, skill: 'leaper' }],
    });
    const r = runLevel(def);
    expect(r.sim.d.saved).toBe(1);
  });

  it('rune blast carves a hole and the planter survives', () => {
    const def = flatLevel({
      skills: { blast: 1 },
      terrain: [
        { op: 'rect', mat: 'Earth', x: 0, y: 120, w: 320, h: 40 },
        { op: 'rect', mat: 'Rock', x: 200, y: 60, w: 20, h: 60 },
      ],
      solution: [{ nth: 0, x: 60, skill: 'blast' }],
    });
    const sim = Sim.create(def);
    runSim(sim, def.solution, 400);
    expect(sim.terrain.get(63, 117)).toBe(0); // crater
    expect(sim.d.dead).toBe(0);
  });
});

describe('determinism', () => {
  it('a clone stepped in lockstep stays identical', () => {
    const def = flatLevel({
      wyrdlings: 6, rate: 20, skills: { digger: 2, blast: 1, weaver: 2 },
      entities: [{ type: 'entrance', x: 30, y: 80 }, { type: 'exit', x: 290, y: 119 }, { type: 'boulder', x: 200, y: 60, r: 8 }],
      solution: [
        { nth: 0, x: 80, skill: 'blast' },
        { nth: 1, x: 120, skill: 'digger' },
        { nth: 2, x: 150, skill: 'weaver' },
      ],
    });
    const a = Sim.create(def);
    runSim(a, def.solution, 200);
    const b = a.clone();
    for (let i = 0; i < 600; i++) { a.step(); b.step(); }
    expect(JSON.stringify(b.d)).toBe(JSON.stringify(a.d));
    expect(b.terrain.hash()).toBe(a.terrain.hash());
  });

  it('cloning does not disturb the original (copy-on-write)', () => {
    const def = flatLevel({ skills: { digger: 1 }, solution: [{ nth: 0, x: 100, skill: 'digger' }] });
    const a = Sim.create(def);
    runSim(a, def.solution, 150);
    const h0 = a.terrain.hash();
    const b = a.clone();
    for (let i = 0; i < 300; i++) b.step();
    expect(a.terrain.hash()).toBe(h0);
    expect(b.terrain.hash()).not.toBe(h0);
  });
});
