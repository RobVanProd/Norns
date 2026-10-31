// Who a click or tap hits, and cycling through a crowd. Pure (Wyrdlings in, ids out), so the rules
// that decide a grant can be tested without a browser.
import type { Wyrd } from '../sim/state';
import { isAlive } from '../sim/state';

/** Pick radius around the sprite's body, in world px: a finger covers more than a cursor. */
export const PICK_R = { mouse: 7, touch: 12 } as const;

export interface Candidate {
  id: number;
  /** distance from the pointer to the sprite's body */
  d: number;
  /** can take the armed calling (always true with nothing armed) */
  ok: boolean;
}

/**
 * Every living Wyrdling under the pointer at world (wx, wy), best first: the nearest, with those that
 * can take the armed calling ahead of those that can't (a 6 px head start), then by id.
 */
export function candidates(wyrds: readonly Wyrd[], wx: number, wy: number, touch: boolean, ok: (w: Wyrd) => boolean, reach?: number): Candidate[] {
  // reach: the player's touch-reach setting (Settings → Access), in world px
  const r = reach ?? (touch ? PICK_R.touch : PICK_R.mouse);
  const out: Candidate[] = [];
  for (const w of wyrds) {
    if (!isAlive(w)) continue;
    // distance to the sprite's body (a vertical capsule from hood to feet), with a little slack
    // behind a walker: the click aims at where it was a moment ago
    let dx = wx - w.x;
    if (w.st === 'walk' && dx * w.dir < 0) dx = Math.sign(dx) * Math.max(0, Math.abs(dx) - 3);
    const dy = wy < w.y - 13 ? wy - (w.y - 13) : wy > w.y - 2 ? wy - (w.y - 2) : 0;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= r) out.push({ id: w.id, d, ok: ok(w) });
  }
  const score = (c: Candidate) => c.d - (c.ok ? 6 : 0);
  return out.sort((a, b) => score(a) - score(b) || a.id - b.id);
}

/** The ids a crowd cycles through, in a fixed order (by id, so a walking crowd keeps its order): those
 *  that can take the armed calling, or everyone under the pointer if none can. */
export function cycleSet(c: readonly Candidate[]): number[] {
  const able = c.filter((k) => k.ok);
  return (able.length ? able : c).map((k) => k.id).sort((a, b) => a - b);
}

/** How much nearer (px) the best candidate must be than the next for a tap to be sure which one is meant. */
export const SURE_PX = 4;

/** A tap can't tell which is meant: two or more that could take the calling (or, if none can, any two) are
 *  about as near the finger as each other. */
export function ambiguous(c: readonly Candidate[]): boolean {
  const able = c.some((k) => k.ok) ? c.filter((k) => k.ok) : c;
  return able.length >= 2 && able[1].d - able[0].d < SURE_PX;
}

/** The next id after `current` in the cycle (`dir` -1: the one before), wrapping round; the first if
 *  `current` isn't in it. */
export function nextInCycle(set: readonly number[], current: number | null, dir: 1 | -1 = 1): number | null {
  if (!set.length) return null;
  const i = current === null ? -1 : set.indexOf(current);
  if (i < 0) return set[0];
  return set[(i + dir + set.length) % set.length];
}
