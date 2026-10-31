// Urðr's Rewind: snapshots of the whole run, so time can unspool all the way back to the first tick.
// Recent history is dense (every tick for the last 5 s, so a paused player can step back one tick at a
// time; every 10 ticks back to 20 s), older history sparse (every 60 ticks). Clones share unchanged
// terrain chunks, so even an 8-minute run stays a few MB.
import type { Sim } from './sim';

const FINE = 150; // ticks kept at every tick
const MID = 600; // ticks kept at every MID_EVERY
const MID_EVERY = 10;
const FAR_EVERY = 60;

export class Timeline {
  private snaps: Sim[] = []; // ascending by tick

  clear(): void {
    this.snaps.length = 0;
  }

  /** Call after every step (and once at the start). */
  record(sim: Sim): void {
    const t = sim.d.tick;
    // the timeline was rewound: drop the future that no longer happens
    while (this.snaps.length && this.snaps[this.snaps.length - 1].d.tick >= t) this.snaps.pop();
    this.snaps.push(sim.clone());
    if (t % 30 === 0) this.thin(t);
  }

  private thin(now: number): void {
    const first = this.snaps[0];
    this.snaps = this.snaps.filter((s) => {
      const age = now - s.d.tick;
      return s === first || age <= FINE || (age <= MID ? s.d.tick % MID_EVERY === 0 : s.d.tick % FAR_EVERY === 0);
    });
  }

  get oldestTick(): number {
    return this.snaps.length ? this.snaps[0].d.tick : 0;
  }

  get length(): number {
    return this.snaps.length;
  }

  /**
   * Step back: returns a fresh clone of the newest snapshot strictly older than `tick`, dropping newer
   * ones, or null if nothing older is stored. The first snapshot is never dropped.
   */
  back(tick: number): Sim | null {
    while (this.snaps.length > 1 && this.snaps[this.snaps.length - 1].d.tick >= tick) this.snaps.pop();
    const s = this.snaps[this.snaps.length - 1];
    if (!s || s.d.tick >= tick) return null;
    return s.clone();
  }
}
