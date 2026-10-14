// Urðr's Rewind: a ring buffer of cheap simulation snapshots.
import type { Sim } from './sim';

export class Timeline {
  readonly interval: number;
  capacity: number;
  private snaps: Sim[] = [];

  constructor(seconds: number, interval = 10, tickRate = 30) {
    this.interval = interval;
    this.capacity = Math.ceil((seconds * tickRate) / interval) + 1;
  }

  setSeconds(seconds: number, tickRate = 30): void {
    this.capacity = Math.ceil((seconds * tickRate) / this.interval) + 1;
    while (this.snaps.length > this.capacity) this.snaps.shift();
  }

  clear(): void {
    this.snaps.length = 0;
  }

  /** Call after every step; stores a snapshot on interval boundaries. */
  record(sim: Sim): void {
    if (sim.d.tick % this.interval !== 0) return;
    const last = this.snaps[this.snaps.length - 1];
    if (last && last.d.tick >= sim.d.tick) {
      // timeline was rewound: drop the stale future
      while (this.snaps.length && this.snaps[this.snaps.length - 1].d.tick >= sim.d.tick) this.snaps.pop();
    }
    this.snaps.push(sim.clone());
    if (this.snaps.length > this.capacity) this.snaps.shift();
  }

  get oldestTick(): number {
    return this.snaps.length ? this.snaps[0].d.tick : 0;
  }

  get length(): number {
    return this.snaps.length;
  }

  /**
   * Step back: returns a fresh clone of the newest snapshot strictly older than `tick`
   * (dropping newer ones), or null if nothing older is stored.
   */
  back(tick: number): Sim | null {
    while (this.snaps.length && this.snaps[this.snaps.length - 1].d.tick >= tick) this.snaps.pop();
    const s = this.snaps[this.snaps.length - 1];
    if (!s) return null;
    return s.clone();
  }
}
