// Progression + settings persistence. localStorage can be unavailable (private mode, blocked
// storage); every access is guarded and the game works without it.
import { REALM_LIST, type RealmInfo } from '../levels';
import type { LevelDef } from '../sim/level';
import { decodeWeave, encodeWeave, isStale, type Weave } from '../sim/weave';

export const HOODS: { id: string; name: string; hue: number | null; cost: number }[] = [
  { id: 'teal', name: 'Loom Teal', hue: null, cost: 0 },
  { id: 'crimson', name: 'Ember Crimson', hue: 355, cost: 15 },
  { id: 'violet', name: 'Twilight Violet', hue: 275, cost: 15 },
  { id: 'amber', name: 'Harvest Amber', hue: 38, cost: 20 },
  { id: 'moss', name: 'Moss Green', hue: 110, cost: 20 },
  { id: 'frost', name: 'Rime White', hue: -1, cost: 30 },
];

export const UPGRADES = {
  foresight: { name: "Skuld's Sight", desc: 'Foresight sees further ahead.', levels: [4, 6, 8, 10], costs: [12, 28, 50] },
} as const;

/** Urðr's Memory (longer rewind) was retired when rewind reached back to the first tick; its costs are
 *  refunded to old saves. */
const RETIRED_REWIND_COSTS = [15, 35];

/** The player's best run of a level: its encoded Weave (which carries the simulation version and the
 *  level's hash) and what it achieved, to rank the next run against. */
export interface BestWeave {
  weave: string;
  saved: number;
  used: number;
  ticks: number;
}

export interface SaveData {
  v: 1;
  stars: Record<string, number>;
  best: Record<string, number>;
  threads: number;
  upgrades: { foresight: number };
  hood: string;
  hoods: string[];
  /** Ids of every level ever opened. Unlocks stick, so a level added to a realm later never relocks one. */
  opened: string[];
  settings: { music: number; sfx: number; foresight: boolean; hints: boolean; zoom: number; crt: boolean; rewindToggle: boolean; verdict: boolean };
  seenIntro: boolean;
  /** best run per level id ("Watch your best") */
  weaves: Record<string, BestWeave>;
}

const KEY = 'norns.save.v1';

function fresh(): SaveData {
  const s: SaveData = {
    v: 1, stars: {}, best: {}, threads: 0, upgrades: { foresight: 0 }, hood: 'teal', hoods: ['teal'], opened: [],
    settings: { music: 0.7, sfx: 0.85, foresight: true, hints: true, zoom: 0, crt: false, rewindToggle: false, verdict: true }, seenIntro: false,
    weaves: {},
  };
  refreshOpened(s);
  return s;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw) as Partial<SaveData> & { upgrades?: { rewind?: number } };
    const f = fresh();
    const refund = RETIRED_REWIND_COSTS.slice(0, d.upgrades?.rewind ?? 0).reduce((a, b) => a + b, 0);
    const s = {
      ...f, ...d, threads: (d.threads ?? 0) + refund, stars: d.stars ?? {}, opened: Array.isArray(d.opened) ? d.opened : [],
      weaves: d.weaves && typeof d.weaves === 'object' ? d.weaves : {},
      upgrades: { foresight: d.upgrades?.foresight ?? f.upgrades.foresight }, settings: { ...f.settings, ...d.settings },
    } as SaveData;
    // older saves have no opened list: pin down what their stars open today
    refreshOpened(s);
    return s;
  } catch {
    return fresh();
  }
}

export function writeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: progress lasts for this session only */
  }
}

export function starCount(mask: number | undefined): number {
  return ((mask ?? 0) & 1) + (((mask ?? 0) >> 1) & 1) + (((mask ?? 0) >> 2) & 1);
}

export function totalStars(s: SaveData): number {
  return Object.values(s.stars).reduce((a, m) => a + starCount(m), 0);
}

// Unlocks follow ids and each realm's own puzzle list, never a global index, and anything once
// opened stays open (SaveData.opened). Only clearing at quota counts; no star totals gate anything.

/** A guardian wakes once this many of its realm's puzzles are cleared (or all of them, if fewer). */
export const BOSS_NEEDS = 3;

function cleared(s: SaveData, id: string): boolean {
  return ((s.stars[id] ?? 0) & 1) === 1;
}

function puzzles(r: RealmInfo): LevelDef[] {
  return r.levels.filter((l) => !l.boss);
}

/** Open by today's rules alone, without the sticky list. */
function openNow(s: SaveData, realms: RealmInfo[], ri: number, level: LevelDef): boolean {
  const ps = puzzles(realms[ri]);
  if (level.boss) return ps.filter((l) => cleared(s, l.id)).length >= Math.min(BOSS_NEEDS, ps.length);
  // clearing a puzzle opens the next two in its realm
  const i = ps.indexOf(level);
  return i === 0 || ps.slice(Math.max(0, i - 2), i).some((l) => cleared(s, l.id));
}

/** A realm opens when the previous realm's guardian falls, or when all of its puzzles are cleared. */
export function realmUnlocked(s: SaveData, realmIndex: number, realms: RealmInfo[] = REALM_LIST): boolean {
  const r = realms[realmIndex];
  if (!r) return false;
  if (realmIndex === 0 || r.levels.some((l) => s.opened.includes(l.id))) return true;
  const prev = realms[realmIndex - 1];
  return prev.levels.some((l) => l.boss && cleared(s, l.id)) || puzzles(prev).every((l) => cleared(s, l.id));
}

export function isUnlocked(s: SaveData, levelId: string, realms: RealmInfo[] = REALM_LIST): boolean {
  if (s.opened.includes(levelId)) return true;
  const ri = realms.findIndex((r) => r.levels.some((l) => l.id === levelId));
  if (ri < 0) return false;
  return realmUnlocked(s, ri, realms) && openNow(s, realms, ri, realms[ri].levels.find((l) => l.id === levelId)!);
}

/** Add every level that is open now to the sticky list; returns the ids that were newly added. */
export function refreshOpened(s: SaveData, realms: RealmInfo[] = REALM_LIST): string[] {
  const added: string[] = [];
  for (const r of realms) {
    for (const l of r.levels) {
      if (!s.opened.includes(l.id) && isUnlocked(s, l.id, realms)) { s.opened.push(l.id); added.push(l.id); }
    }
  }
  return added;
}

export interface Outcome {
  levelId: string;
  saved: number;
  quota: number;
  target: number;
  spindle: boolean;
  bossDefeated: boolean | null;
}

/** Record a result; returns the star mask earned this run, newly earned stars, threads gained and the
 *  ids of levels it opened. */
export function recordOutcome(s: SaveData, o: Outcome): { mask: number; newMask: number; threads: number; opened: string[] } {
  const won = o.saved >= o.quota && o.bossDefeated !== false;
  let mask = 0;
  if (won) {
    mask |= 1;
    if (o.saved >= o.target) mask |= 2;
    if (o.spindle) mask |= 4;
  }
  const prev = s.stars[o.levelId] ?? 0;
  const newMask = mask & ~prev;
  const prevBest = s.best[o.levelId] ?? 0;
  let threads = starCount(newMask) * 5;
  if (won && o.saved > prevBest) threads += o.saved - prevBest;
  s.stars[o.levelId] = prev | mask;
  if (won) s.best[o.levelId] = Math.max(prevBest, o.saved);
  s.threads += threads;
  const opened = refreshOpened(s);
  writeSave(s);
  return { mask, newMask, threads, opened };
}

// ------------------------------------------------------------------ best Weave

/** Better run first: more saved, then fewer callings, then fewer ticks. */
function better(a: Omit<BestWeave, 'weave'>, b: Omit<BestWeave, 'weave'>): boolean {
  if (a.saved !== b.saved) return a.saved > b.saved;
  if (a.used !== b.used) return a.used < b.used;
  return a.ticks < b.ticks;
}

/** The stored best run of a level, if it still replays: a Weave from another simulation version or
 *  another shape of the level is ignored. */
export function bestWeave(s: SaveData, def: LevelDef): (BestWeave & { w: Weave }) | null {
  const b = s.weaves[def.id];
  const w = b ? decodeWeave(b.weave) : null;
  return b && w && !isStale(w, def) ? { ...b, w } : null;
}

/** Keep a finished run if it beats the stored best (or the stored one went stale). True if kept; the
 *  caller writes the save. */
export function offerWeave(s: SaveData, def: LevelDef, w: Weave, run: { saved: number; ticks: number }): boolean {
  const cand = { saved: run.saved, used: w.entries.length, ticks: run.ticks };
  const old = bestWeave(s, def);
  if (old && !better(cand, old)) return false;
  s.weaves[def.id] = { weave: encodeWeave(w), ...cand };
  return true;
}
