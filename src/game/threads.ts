// Fate-thread geometry, kept pure so tests can hold it to its promises: each fate has its own pattern
// along the path (doomed: dashes, still walking: dots, saved: diamonds), so colour is never the only
// cue, and a death the screen can't show is pinned to the nearest edge of what it does show.
import type { FateKind } from '../sim/foresight';

/** One mark every `period` px of path; `len` > 0 makes it a dash that long, 0 a point (dot or diamond). */
export interface Pattern { period: number; len: number }

export const PATTERNS: Record<FateKind, Pattern> = {
  dead: { period: 7, len: 4 },
  alive: { period: 6, len: 0 },
  saved: { period: 8, len: 0 },
};

/** A mark at (x, y); a dash runs on to (x2, y2). `f` is how far along the path it sits (0 start, 1 end). */
export interface Mark { x: number; y: number; x2: number; y2: number; f: number }

/** Leave the first few px bare: the Wyrdling itself stands there (its body, walking or falling). */
export const SKIP = 6;

/**
 * The marks of a thread along the path [x0, y0, x1, y1, ...], spaced by arc length so a fall reads the
 * same as a walk. `march` (px, any value) slides the pattern along the path, so it can flow over time.
 * The pattern is anchored to the world along the path's first heading, so threads that share a floor
 * put their marks on the same spots instead of crowding each other's gaps.
 */
export function threadMarks(pts: readonly number[], kind: FateKind, march = 0): Mark[] {
  const n = pts.length >> 1;
  const out: Mark[] = [];
  if (n < 2) return out;
  const acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]));
  const total = acc[n - 1];
  const { period, len } = PATTERNS[kind];
  // the point at arc length s (seg: a segment index at or before it, advanced as s grows)
  let seg = 0;
  const at = (s: number): [number, number] => {
    while (seg < n - 2 && acc[seg + 1] < s) seg++;
    const d = acc[seg + 1] - acc[seg];
    const k = d > 0 ? Math.min(1, Math.max(0, (s - acc[seg]) / d)) : 0;
    return [pts[seg * 2] + (pts[seg * 2 + 2] - pts[seg * 2]) * k, pts[seg * 2 + 1] + (pts[seg * 2 + 3] - pts[seg * 2 + 1]) * k];
  };
  let anchor = 0;
  for (let i = 1; i < n; i++) {
    const dx = pts[i * 2] - pts[0], dy = pts[i * 2 + 1] - pts[1], d = Math.hypot(dx, dy);
    if (d > 0) { anchor = (pts[0] * dx + pts[1] * dy) / d; break; }
  }
  const shift = (((march - anchor - SKIP) % period) + period) % period;
  for (let s = SKIP + shift; s <= total; s += period) {
    const [x, y] = at(s);
    let x2 = x, y2 = y;
    if (len > 0) {
      const save = seg;
      [x2, y2] = at(Math.min(total, s + len));
      seg = save;
    }
    out.push({ x, y, x2, y2, f: total > 0 ? s / total : 1 });
  }
  return out;
}

export type EdgeDir = 'up' | 'down' | 'left' | 'right';

/** The part of the world the player can see, clear of the HUD: [x0, x1] × [y0, y1] in world px. */
export interface SafeRect { x0: number; y0: number; x1: number; y1: number }

/**
 * Where a fate's end shows: null when (x, y) is inside the safe rect (draw it there), otherwise the
 * nearest point on the rect's edge and which way the real end lies from it (the larger overshoot wins).
 */
export function edgePin(x: number, y: number, r: SafeRect): { x: number; y: number; dir: EdgeDir } | null {
  const ox = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0;
  const oy = y < r.y0 ? r.y0 - y : y > r.y1 ? y - r.y1 : 0;
  if (ox === 0 && oy === 0) return null;
  const cx = Math.max(r.x0, Math.min(r.x1, x)), cy = Math.max(r.y0, Math.min(r.y1, y));
  const dir: EdgeDir = oy >= ox ? (y > r.y1 ? 'down' : 'up') : x > r.x1 ? 'right' : 'left';
  return { x: cx, y: cy, dir };
}
