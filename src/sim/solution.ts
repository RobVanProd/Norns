// Scripted solutions: used by tests to prove levels are solvable, and in-game by "Skuld's Vision".
import type { SolutionStep } from './level';
import type { Sim } from './sim';

export function stepReady(sim: Sim, s: SolutionStep): boolean {
  const w = sim.d.wyrds[s.nth];
  if (!w) return false;
  if (s.t !== undefined && sim.d.tick < s.t) return false;
  if (s.x !== undefined) {
    const passed = w.dir > 0 ? w.x >= s.x : w.x <= s.x;
    if (!passed) return false;
  }
  if (s.dir !== undefined && w.dir !== s.dir) return false;
  if (s.minY !== undefined && w.y < s.minY) return false;
  if (s.maxY !== undefined && w.y > s.maxY) return false;
  if (s.state !== undefined && w.st !== s.state) return false;
  return sim.canAssign(w, s.skill);
}

export class SolutionPlayer {
  private done: boolean[];
  constructor(private steps: SolutionStep[]) {
    this.done = steps.map(() => false);
  }
  /** Apply every ready step; returns the steps applied this tick. */
  apply(sim: Sim): SolutionStep[] {
    const out: SolutionStep[] = [];
    this.steps.forEach((s, i) => {
      if (this.done[i]) return;
      if (stepReady(sim, s) && sim.assign(s.nth, s.skill)) {
        this.done[i] = true;
        out.push(s);
      }
    });
    return out;
  }
  get finished(): boolean {
    return this.done.every(Boolean);
  }
}
