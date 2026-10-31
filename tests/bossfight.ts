// Boss fights must be planned, not watched (AGENTS.md, roadmap P2-bosses). Called from each realm's
// levels-<realm>.test.ts for its guardian, so the realms run in parallel. On top of the checks every level
// gets: at least two callings are needed to fell the guardian, the whole attack rotation shows in the
// scripted fight, the stones follow their fixed order without the RNG, every scripted calling survives a
// few ticks either way, no single calling on a coarse grid meets the quota, and the Root Gate is a short
// walk from the guardian.
import { describe, expect, it } from 'vitest';
import { PATTERNS, stoneOrder, nextStone } from '../src/sim/boss';
import type { LevelDef } from '../src/sim/level';
import { Sim } from '../src/sim/sim';
import { oneCallingGrid } from './bossgrid';
import { LEVEL_TICKS, applyStep, levelPurposes, lostWithout, playExact, purposeMet, recordSolution, type Recording } from './helpers';

/** Ticks either way each scripted calling may come and still win (the roadmap's precision rule: ±10 in
 *  Midgard, ±6 elsewhere). 1 tick = 1 px of walking. */
const slackFor = (def: LevelDef) => (def.realm === 'midgard' ? 10 : 6);
/** A walk of about 5 s. */
const NEAR = 150;

interface Fight {
  rec: Recording;
  /** attacks in the order they started */
  acts: string[];
  /** stones in the order they lit, and the stone shown as next just before each lit */
  lit: number[];
  shown: number[];
  defeat: number;
  /** tick the quota was met */
  quota: number;
}

function replay(def: LevelDef): Fight {
  const rec = recordSolution(def);
  const sim = Sim.create(def);
  const done = def.solution.map(() => false);
  const f: Fight = { rec, acts: [], lit: [], shown: [], defeat: -1, quota: -1 };
  while (!sim.d.finished && sim.d.tick < LEVEL_TICKS) {
    def.solution.forEach((s, i) => { if (!done[i] && applyStep(sim, s)) done[i] = true; });
    const next = nextStone(sim.d.boss!, def.boss!, sim.L.seidr.length);
    sim.step();
    for (const e of sim.events) {
      if (e.type === 'boss_telegraph') f.acts.push(e.s!);
      if (e.type === 'seidr_on') { f.lit.push(e.id!); f.shown.push(next); }
      if (e.type === 'boss_defeat') f.defeat = sim.d.tick;
      if (e.type === 'quota_met') f.quota = sim.d.tick;
    }
  }
  return f;
}

export function describeBossFight(def: LevelDef): void {
  const boss = def.boss!;
  describe(`${def.id} ${def.name}: a fight to plan`, () => {
    let fight: Fight | null = null;
    const get = () => (fight ??= replay(def));

    it('needs at least two callings to fell the guardian, each one load-bearing', () => {
      const f = get();
      const forBoss = def.solution.map((s, i) => i).filter((i) => def.solution[i].purpose?.includes('boss'));
      expect(forBoss.length, 'scripted callings that fell the guardian').toBeGreaterThanOrEqual(2);
      for (const i of forBoss) expect(lostWithout(def, f.rec, i), `without step ${i} the guardian stands`).toContain('boss');
    });

    it('uses every attack of its rotation in the scripted fight', () => {
      const f = get();
      expect(f.defeat).toBeGreaterThan(0);
      expect(new Set(f.acts)).toEqual(new Set(PATTERNS[boss.kind]));
    });

    it('lights its stones in a fixed order, each shown as next before it lights, and never draws on the RNG', () => {
      const f = get();
      const order = stoneOrder(boss, def.entities.filter((e) => e.type === 'seidr').length);
      expect(f.lit).toEqual(f.lit.map((_, k) => order[k % order.length]));
      expect(f.shown).toEqual(f.lit);
      expect(f.rec.sim.d.rng, 'the RNG never advanced').toBe(def.seed >>> 0);
    });

    it(`wins with every scripted calling up to ±${slackFor(def)} ticks off`, () => {
      const { rec } = get();
      const goals = levelPurposes(def);
      const need = def.solutionSaves ?? def.target;
      const won = (s: Sim) => goals.every((p) => purposeMet(def, s, p));
      const lost: string[] = [];
      def.solution.forEach((step, i) => {
        const f = rec.fired[i];
        for (let k = -slackFor(def); k <= slackFor(def); k++) {
          if (k === 0) continue;
          const at = rec.fired.slice();
          at[i] = f + k;
          if (at[i] < 0) continue;
          const sim = rec.at(Math.min(f, at[i]));
          const landed = playExact(sim, def.solution, at, LEVEL_TICKS,
            (s, a) => s.d.tick >= at[i] && (!a[i] || won(s) || s.total - s.d.dead < need));
          // a refused click is not a loss: the calling just would not land then
          if (landed[i] && !won(sim)) lost.push(`step ${i} (${step.skill} #${step.nth}) at ${k > 0 ? '+' : ''}${k}`);
        }
      });
      expect(lost).toEqual([]);
    }, 60_000);

    it('cannot be won with any one calling (coarse grid)', () => {
      const grid = { from: 40, to: 1200, every: 60, first: 6, horizon: 3000 };
      const r = oneCallingGrid(def, grid);
      console.log(`${def.id} one-calling grid: ticks ${grid.from}..${grid.to} every ${grid.every}, the first ${grid.first} Wyrdlings ` +
        `about, every calling given, ${grid.horizon} ticks each: ${r.runs} runs, ${r.wins.length} meet the quota, ` +
        `most wounds ${r.mostHits}/${boss.hp} (${r.best}). The fine search: npx tsx scripts/bossgrid.ts`);
      expect(r.runs).toBeGreaterThan(100);
      expect(r.wins).toEqual([]);
      expect(r.mostHits).toBeLessThan(boss.hp);
    }, 60_000);

    it(`opens its Root Gate within about 5 s of the guardian`, () => {
      const f = get();
      const exit = def.entities.find((e) => e.type === 'exit')!;
      expect(Math.abs(exit.x - boss.x), 'Root Gate to guardian, px').toBeLessThanOrEqual(NEAR);
      console.log(`${def.id}: guardian falls at ${f.defeat}, quota met ${f.quota - f.defeat} ticks later, run ends ${f.rec.sim.d.tick - f.defeat} ticks later`);
      expect(f.quota - f.defeat, 'ticks from the fall to the quota').toBeLessThanOrEqual(2 * NEAR);
    });
  });
}
