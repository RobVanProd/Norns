// Boss-level trace: stone activations, hits, deaths, attacks. npx tsx scripts/bosstrace.ts <levelId> [maxTicks]
import { ALL_LEVELS } from '../src/levels';
import { Sim } from '../src/sim/sim';
import { SolutionPlayer } from '../src/sim/solution';
const [id, maxS = '6000'] = process.argv.slice(2);
const def = ALL_LEVELS.find((l) => l.id === id)!;
const sim = Sim.create(def);
const pl = new SolutionPlayer(def.solution);
for (let t = 0; t < +maxS && !sim.d.finished; t++) {
  for (const s of pl.apply(sim)) { const w = sim.d.wyrds[s.nth]; console.log(`t=${sim.d.tick} ASSIGN #${s.nth} ${s.skill} @(${w.x},${w.y}) dir=${w.dir}`); }
  sim.step();
  for (const e of sim.events) {
    if (['seidr_on', 'boss_hit', 'death', 'boss_telegraph', 'boss_defeat', 'saved', 'crusher_break', 'lever', 'blast', 'stone_harden'].includes(e.type)) {
      console.log(`t=${sim.d.tick} ${e.type} ${e.s ?? ''} id=${e.id ?? ''} (${Math.round(e.x)},${Math.round(e.y)}) v=${e.v ?? ''}`);
    }
  }
}
console.log(`END t=${sim.d.tick} saved=${sim.d.saved} dead=${sim.d.dead} hp=${sim.d.boss?.hp} skills=${JSON.stringify(sim.d.skills)}`);
