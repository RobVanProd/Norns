// One-calling search over a boss fight (finer and longer than the test's):
//   npx tsx scripts/bossgrid.ts [levelId...] [--every N] [--first K] [--to T] [--horizon H]
// Grants one calling (every calling the level gives) to one of the first K Wyrdlings at every N-th tick up
// to T, then lets the fight run H ticks with nothing more. Exits 1 if any single calling meets the quota.
import { ALL_LEVELS } from '../src/levels';
import { oneCallingGrid } from '../tests/bossgrid';

const args = process.argv.slice(2);
const opt = (n: string, d: number) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const ids = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const levels = ALL_LEVELS.filter((l) => l.boss && (!ids.length || ids.includes(l.id)));
const o = { from: 40, to: opt('to', 1500), every: opt('every', 15), first: opt('first', 12), horizon: opt('horizon', 30 * 60 * 8) };
let failed = false;
for (const def of levels) {
  const t0 = performance.now();
  const r = oneCallingGrid(def, o);
  const s = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`${def.id}: ticks ${o.from}..${o.to} every ${o.every}, the first ${o.first} Wyrdlings about, ${Object.keys(def.skills).join('/')}, ` +
    `horizon ${o.horizon}: ${r.runs} runs (${r.refused} refused), ${r.wins.length} meet the quota, ${r.undecided} undecided at the horizon, ` +
    `most wounds ${r.mostHits}/${def.boss!.hp} (${r.best}), ${s} s`);
  if (r.wins.length) { failed = true; console.log('  wins: ' + r.wins.join(', ')); }
}
process.exit(failed ? 1 : 0);
