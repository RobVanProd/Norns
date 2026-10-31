// Local playtest log: per-level counts of how a player gets on (attempts, rewinds, Vision, Foresight
// use, likely mis-clicks) plus the last few attempts as Weaves, so a playtest can be replayed exactly.
// It never leaves the device by itself: Settings → "Copy playtest report" copies it to the clipboard.
import type { LevelDef } from '../sim/level';
import { SIM_VERSION, encodeWeave, type Weave } from '../sim/weave';

const KEY = 'norns.stats.v1';
/** Attempt Weaves and quit points kept per level. */
const KEEP = 5;
/** A rewind this soon (real seconds) after a calling suggests the calling went to the wrong Wyrdling or moment. */
const MISGRANT_SEC = 2;

/** Where an attempt was left unfinished: the run's tick and counts, and what the player did instead. */
export interface QuitPoint {
  tick: number;
  saved: number;
  used: number;
  via: 'restart' | 'vision' | 'left' | 'closed';
}

export interface LevelStats {
  /** attempts started (each Begin, Restart and Retry) */
  attempts: number;
  /** attempts abandoned with Restart or Retry */
  restarts: number;
  /** real seconds spent in the level (paused time included: thinking counts) */
  sec: number;
  /** finished runs, and those that met the quota */
  finishes: number;
  clears: number;
  /** real seconds and attempts before the first clear (null until then) */
  clearSec: number | null;
  clearAttempts: number | null;
  /** game seconds unspooled by Rewind and stepping back */
  rewindSec: number;
  /** times Skuld's Vision was watched */
  visions: number;
  /** callings granted, counting those later rewound */
  callings: number;
  /** Wyrdlings hovered (or touch-held) with a calling armed */
  hovers: number;
  /** branch previews started before an attempt's first calling */
  previews: number;
  /** mis-assignment proxy: a calling followed within 2 s by a rewind, or a touch grant to another Wyrdling than the one pressed */
  misgrants: number;
  /** the last few unfinished attempts */
  quits: QuitPoint[];
  /** the last few attempts, encoded Weaves */
  weaves: string[];
}

export interface Stats {
  v: 1;
  levels: Record<string, LevelStats>;
}

function blank(): LevelStats {
  return {
    attempts: 0, restarts: 0, sec: 0, finishes: 0, clears: 0, clearSec: null, clearAttempts: null, rewindSec: 0, visions: 0,
    callings: 0, hovers: 0, previews: 0, misgrants: 0, quits: [], weaves: [],
  };
}

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    const d = raw ? (JSON.parse(raw) as Partial<Stats>) : null;
    const levels: Record<string, LevelStats> = {};
    if (d && d.v === 1 && d.levels && typeof d.levels === 'object') {
      for (const [id, l] of Object.entries(d.levels)) levels[id] = { ...blank(), ...l };
    }
    return { v: 1, levels };
  } catch {
    return { v: 1, levels: {} };
  }
}

export function writeStats(s: Stats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: the log lasts for this session only */
  }
}

export function eraseStats(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function levelStats(s: Stats, id: string): LevelStats {
  return (s.levels[id] ??= blank());
}

function keepLast<T>(list: T[], item: T): void {
  list.push(item);
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
}

/** What one attempt did since it was last folded into the stats (PlayScene counts, the Game folds). */
export class AttemptLog {
  sec = 0;
  callings = 0;
  rewindTicks = 0;
  hovers = 0;
  previews = 0;
  misgrants = 0;
  /** a calling has been granted in this attempt (previews after that no longer count) */
  granted = false;
  /** scene time of the last calling no rewind has followed yet */
  private lastGrant = -Infinity;

  grant(now: number): void {
    this.callings++;
    this.granted = true;
    this.lastGrant = now;
  }

  /** The run was set back by `ticks` at scene time `now`. */
  rewound(ticks: number, now: number): void {
    this.rewindTicks += Math.max(0, ticks);
    if (now - this.lastGrant <= MISGRANT_SEC) {
      this.misgrants++;
      this.lastGrant = -Infinity;
    }
  }

  /** Add the counts to a level's stats and start counting afresh. */
  foldInto(l: LevelStats): void {
    l.sec += this.sec;
    l.callings += this.callings;
    l.rewindSec += this.rewindTicks / 30;
    l.hovers += this.hovers;
    l.previews += this.previews;
    l.misgrants += this.misgrants;
    this.sec = this.callings = this.rewindTicks = this.hovers = this.previews = this.misgrants = 0;
  }
}

/** A finished run: fold the attempt in, count the finish (and a first clear), keep its Weave. */
export function logFinish(s: Stats, id: string, log: AttemptLog, won: boolean, weave: Weave | null): void {
  const l = levelStats(s, id);
  log.foldInto(l);
  l.finishes++;
  if (won) {
    l.clears++;
    if (l.clearSec === null) { l.clearSec = Math.round(l.sec); l.clearAttempts = l.attempts; }
  }
  if (weave) keepLast(l.weaves, encodeWeave(weave));
  writeStats(s);
}

/** An attempt left unfinished: fold it in and note where. `weave` is the attempt so far. */
export function logQuit(s: Stats, id: string, log: AttemptLog, q: QuitPoint, weave: Weave | null): void {
  const l = levelStats(s, id);
  log.foldInto(l);
  if (q.via === 'restart') l.restarts++;
  keepLast(l.quits, q);
  if (weave) keepLast(l.weaves, encodeWeave(weave));
  writeStats(s);
}

/** The report a playtester pastes back: the stats, each level's last few attempts as Weaves, and the
 *  stars earned. Plain JSON text; nothing identifying beyond the screen size and pointer kind. */
export function playtestReport(s: Stats, levels: LevelDef[], stars: Record<string, number>, device: { w: number; h: number; touch: boolean }): string {
  const out: Record<string, unknown> = {};
  for (const def of levels) {
    const l = s.levels[def.id];
    if (!l) continue;
    out[def.id] = { ...l, sec: Math.round(l.sec), rewindSec: Math.round(l.rewindSec * 10) / 10, stars: stars[def.id] ?? 0 };
  }
  return JSON.stringify({ report: 'norns-playtest', v: 1, sim: SIM_VERSION, device, levels: out }, null, 1);
}
