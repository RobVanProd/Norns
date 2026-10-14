import { Sim } from '../src/sim/sim';
import { foresee } from '../src/sim/foresight';
import { flatLevel } from '../tests/helpers';
for (const kind of ['wyrm', 'jotunn', 'herald'] as const) {
  const def = flatLevel({
    width: 480, height: 240, wyrdlings: 10, quota: 1, target: 1, rate: 25,
    terrain: [{ op: 'rect', mat: 'Earth', x: 0, y: 200, w: 480, h: 40 }, { op: 'rect', mat: 'Rock', x: 0, y: 0, w: 480, h: 20 }],
    entities: [{ type: 'entrance', x: 40, y: 150 }, { type: 'exit', x: 300, y: 199 }, { type: 'seidr', x: 120, y: 199 }, { type: 'seidr', x: 200, y: 199 }],
    boss: { kind, x: 420, y: 170, hp: 3, delay: 60, arena: { x0: 20, x1: 380, floorY: 199 } },
  });
  const sim = Sim.create(def);
  const counts: Record<string, number> = {};
  for (let i = 0; i < 30 * 90 && !sim.d.finished; i++) {
    if (i === 400) { const f = foresee(sim, 150); console.log(kind, 'foresee@400 dead', f.dead, 'saved', f.saved); }
    sim.step();
    for (const e of sim.events) if (['boss_hit', 'death', 'saved', 'boss_telegraph', 'boss_defeat', 'freeze'].includes(e.type)) counts[e.type + (e.s ? ':' + e.s : '')] = (counts[e.type + (e.s ? ':' + e.s : '')] ?? 0) + 1;
  }
  console.log(kind, 'tick', sim.d.tick, 'hp', sim.d.boss!.hp, 'saved', sim.d.saved, 'dead', sim.d.dead, JSON.stringify(counts));
}
