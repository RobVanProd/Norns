// Boss framework (placeholder until bosses are implemented).
import type { BossDef } from './level';
import type { BossState } from './state';
import type { Sim } from './sim';

export function createBoss(def: BossDef): BossState {
  return { kind: def.kind, hp: def.hp, maxHp: def.hp, x: def.x, y: def.y, act: 'idle', at: 0, cd: def.delay ?? 120, seq: 0, hurt: 0, stone: -1, stoneCd: 0, dying: 0, m: [] };
}

export function bossStep(sim: Sim): void {
  void sim;
}

export function bossLocksExit(sim: Sim): boolean {
  const b = sim.d.boss;
  return !!b && b.hp > 0;
}
