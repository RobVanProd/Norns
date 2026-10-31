// Level design report (report only, never fails): per level the scripted and spare callings, how each
// calling is reused after it is introduced, and where each hazard first appears. These are the advisory
// rules of AGENTS.md "Level design rules"; the enforced ones (every scripted step load-bearing, the null
// run fails and misses the spindle) are checked in levels-<realm>.test.ts.
import { it } from 'vitest';
import { ALL_LEVELS } from '../src/levels';
import { SKILLS } from '../src/sim/constants';
import type { LevelDef } from '../src/sim/level';

/** What can kill a Wyrdling; the rest of hazards() only blocks or pushes. */
const KILLS = new Set(['water', 'lava', 'spikes', 'crusher', 'firejet', 'boulder', 'sand']);

/** Things that can kill or block, as the level data names them. */
function hazards(def: LevelDef): string[] {
  const out = new Set<string>();
  for (const e of def.entities) {
    if (['water', 'lava', 'spikes', 'crusher', 'firejet', 'boulder', 'vent', 'brittle', 'gate'].includes(e.type)) out.add(e.type);
  }
  if (def.terrain.some((op) => op.mat === 'Sand')) out.add('sand');
  if (def.terrain.some((op) => op.mat === 'Iron')) out.add('iron');
  if (def.boss) out.add(`boss:${def.boss.kind}`);
  return [...out];
}

it('level design report (report only)', () => {
  console.log('Callings per level: scripted = the solution\'s callings (an upper bound on the minimum), spare = given but unused by it.');
  console.table(ALL_LEVELS.map((def) => {
    const given = Object.values(def.skills).reduce((a, n) => a + (n ?? 0), 0);
    return {
      level: def.id, realm: def.realm, idea: def.idea ?? '(none)', given, scripted: def.solution.length, spare: given - def.solution.length,
      uses: [...new Set(def.solution.map((s) => s.skill))].join(' '), hazards: hazards(def).join(' '),
    };
  }));

  console.log('Calling reuse: after a calling is first given, the later levels that give it again (rule: at least 3, across 2 realms).');
  console.table(SKILLS.map((skill) => {
    const at = ALL_LEVELS.map((l, i) => [l, i] as const).filter(([l]) => l.skills[skill] !== undefined);
    const used = ALL_LEVELS.filter((l) => l.solution.some((s) => s.skill === skill)).map((l) => l.id);
    const later = at.slice(1).map(([l]) => l);
    const realms = new Set(later.map((l) => l.realm));
    return {
      calling: skill, first: at[0]?.[0].id ?? '-', later: later.map((l) => l.id).join(' '), realms: realms.size,
      'scripted in': used.join(' '), rule: later.length >= 3 && realms.size >= 2 ? 'ok' : 'short',
    };
  }));

  console.log('Hazards: the level each first appears in (rule: first where it is harmless, and Foresight shows it before it can kill).');
  const first = new Map<string, string>();
  for (const def of ALL_LEVELS) for (const h of hazards(def)) if (!first.has(h)) first.set(h, def.id);
  console.table([...first].map(([hazard, level]) => ({ hazard, kind: KILLS.has(hazard) || hazard.startsWith('boss') ? 'kills' : 'blocks', level })));
});
