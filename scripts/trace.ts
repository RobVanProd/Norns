// Trace one wyrdling through a level's solution: npx tsx scripts/trace.ts <levelId> <nth> [from] [to] [every]
import { ALL_LEVELS } from '../src/levels';
import { Sim } from '../src/sim/sim';
import { SolutionPlayer } from '../src/sim/solution';
const [id, nthS, fromS = '0', toS = '2000', everyS = '5'] = process.argv.slice(2);
const def = ALL_LEVELS.find((l) => l.id === id)!;
const sim = Sim.create(def);
const pl = new SolutionPlayer(def.solution);
const nth = +nthS;
let last = '';
for (let t = 0; t <= +toS && !sim.d.finished; t++) {
  for (const s of pl.apply(sim)) console.log(`  assign t=${sim.d.tick} #${s.nth} ${s.skill}`);
  sim.step();
  const w = sim.d.wyrds[nth];
  for (const e of sim.events) if (e.id === nth || ['gate_move', 'lever', 'plate_on', 'boss_hit'].includes(e.type)) console.log(`  ev t=${sim.d.tick} ${e.type} ${e.s ?? ''} (${e.x},${e.y})`);
  if (!w || t < +fromS) continue;
  const line = `${w.st} x=${w.x} y=${w.y} dir=${w.dir}`;
  if (t % +everyS === 0 || line.split(' ')[0] !== last.split(' ')[0]) console.log(`t=${sim.d.tick} ${line}`);
  last = line;
}
console.log(`saved=${sim.d.saved} dead=${sim.d.dead}`);
