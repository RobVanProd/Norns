// Progression + settings persistence. localStorage can be unavailable (private mode, blocked
// storage); every access is guarded and the game works without it.
import { REALM_LIST, type RealmInfo } from '../levels';
import type { LevelDef } from '../sim/level';
import { SIM_VERSION, decodeWeave, encodeWeave, isStale, levelHash, type Weave } from '../sim/weave';
import { defaultKeys, readKeys, type KeyBinds } from './input';
import { sameFacts, verifyWeave, type RunFacts } from './share';

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

export interface Settings {
  music: number;
  sfx: number;
  /** Wyrdling barks */
  voice: number;
  foresight: boolean;
  hints: boolean;
  zoom: number;
  rewindToggle: boolean;
  verdict: boolean;
  /** fate colours: 'classic' red / green or 'cvd' blue / orange (see setPalette in view.ts) */
  palette: 'classic' | 'cvd';
  /** Clear Sight always on (it can also be held with C): only what the physics cares about */
  clearSight: boolean;
  /** no screen shake or flashes, a still backdrop and calmer UI animation (default: the system's setting) */
  reduceMotion: boolean;
  /** HTML text size, ×1 to ×1.5 */
  textSize: number;
  /** how far from a Wyrdling a finger still picks it, in world px */
  touchReach: number;
  keys: KeyBinds;
}

/** Text sizes Settings offers. */
export const TEXT_SIZES = [1, 1.25, 1.5];
/** Touch reach range (world px); the default is the reach before it was a setting. */
export const TOUCH_REACH = { min: 8, max: 20, def: 12 };

/** The system asks for less motion (the Reduce motion setting starts from this). */
function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  settings: Settings;
  seenIntro: boolean;
  /** best run per level id ("Watch your best") */
  weaves: Record<string, BestWeave>;
  /** onboarding moments already shown, each once per save: the event hints (see Lesson in play.ts) and 'map' */
  seen: string[];
  /** per level id, the furthest tier of Skuld's Vision watched (1-4); the Vision reopens there */
  visionTier: Record<string, number>;
  /** per level id, personal records and past clears, from verified Weaves only (see offerRecords) */
  records: Record<string, LevelRecords>;
}

const KEY = 'norns.save.v1';

/** The level order of the first release, whose saves have no opened list: there a level opened when the
 *  one before it in this order was cleared. Fixed here because today's realms insert levels into it. */
const LEGACY_ORDER = ['m1', 'm2', 'm3', 'm4', 'm5', 'n1', 'n2', 'n3', 'n4', 'n5', 'u1', 'u2', 'u3', 'u4', 'u5'];

/** What the first release had open for these stars: the first level, every cleared one and each one
 *  that followed a cleared one. */
function legacyOpened(stars: Record<string, number>): string[] {
  const done = (id: string) => ((stars[id] ?? 0) & 1) === 1;
  return LEGACY_ORDER.filter((id, i) => i === 0 || done(id) || done(LEGACY_ORDER[i - 1]));
}

function fresh(): SaveData {
  const s: SaveData = {
    v: 1, stars: {}, best: {}, threads: 0, upgrades: { foresight: 0 }, hood: 'teal', hoods: ['teal'], opened: [],
    settings: {
      music: 0.7, sfx: 0.85, voice: 0.7, foresight: true, hints: true, zoom: 0, rewindToggle: false, verdict: true, palette: 'classic',
      clearSight: false, reduceMotion: prefersReducedMotion(), textSize: 1, touchReach: TOUCH_REACH.def, keys: defaultKeys(),
    },
    seenIntro: false,
    weaves: {}, seen: [], visionTier: {}, records: {},
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
    const stars = d.stars ?? {};
    // the CRT flag never did anything and is gone; keys are checked one by one
    const settings: Record<string, unknown> = { ...d.settings };
    delete settings.crt;
    const s = {
      ...f, ...d, threads: (d.threads ?? 0) + refund, stars,
      // a save with no opened list keeps what the old linear order opened; today's rules add to it below
      opened: Array.isArray(d.opened) ? d.opened : legacyOpened(stars),
      weaves: d.weaves && typeof d.weaves === 'object' ? d.weaves : {},
      seen: Array.isArray(d.seen) ? d.seen : [], visionTier: d.visionTier && typeof d.visionTier === 'object' ? d.visionTier : {},
      records: d.records && typeof d.records === 'object' ? d.records : {},
      upgrades: { foresight: d.upgrades?.foresight ?? f.upgrades.foresight }, settings: { ...f.settings, ...settings, keys: readKeys(settings.keys) },
    } as SaveData;
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

/** Mark an onboarding moment shown; false if it was already (the caller writes the save). */
export function markSeen(s: SaveData, key: string): boolean {
  if (s.seen.includes(key)) return false;
  s.seen.push(key);
  return true;
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
  // clearing a puzzle opens the next two in its realm. A cleared puzzle stays open, and so does one
  // added before it later (in play that order is already open, so this only reaches inserted levels).
  const i = ps.indexOf(level);
  return i === 0 || ps.slice(Math.max(0, i - 2)).some((l) => cleared(s, l.id));
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
  return beats('saved', a, b);
}

/** The stored best run of a level, if it still replays: a Weave from another simulation version or
 *  another shape of the level is ignored. */
export function bestWeave(s: SaveData, def: LevelDef): (BestWeave & { w: Weave }) | null {
  const b = s.weaves[def.id];
  const w = b ? decodeWeave(b.weave) : null;
  return b && w && !isStale(w, def) ? { ...b, w } : null;
}

/** Keep a finished run if it beats the stored best (or the stored one went stale). A run that saved
 *  nobody is never worth watching. True if kept; the caller writes the save. */
export function offerWeave(s: SaveData, def: LevelDef, w: Weave, run: { saved: number; ticks: number }): boolean {
  if (run.saved <= 0) return false;
  const cand = { saved: run.saved, used: w.entries.length, ticks: run.ticks };
  const old = bestWeave(s, def);
  if (old && !better(cand, old)) return false;
  s.weaves[def.id] = { weave: encodeWeave(w), ...cand };
  return true;
}

// ------------------------------------------------------------------ personal records

/** One verified clear: what it achieved and its encoded Weave. */
export interface RecordRun {
  saved: number;
  used: number;
  ticks: number;
  weave: string;
}

export type RecordKey = 'saved' | 'used' | 'ticks';
export const RECORD_KEYS: RecordKey[] = ['saved', 'used', 'ticks'];

/** A level's personal records (most saved, fewest callings, fastest finish) and the player's own past
 *  clears, all for one simulation version and one shape of the level. */
export interface LevelRecords {
  v: number;
  hash: number;
  saved: RecordRun;
  used: RecordRun;
  ticks: RecordRun;
  /** the last RUNS_KEPT verified clears, oldest first, as [saved, callings, ticks] */
  runs: [number, number, number][];
}

const RUNS_KEPT = 100;

/** Does `a` beat `b` on this record? A tie goes to the other two measures, in the usual order of merit. */
function beats(key: RecordKey, a: Omit<RecordRun, 'weave'>, b: Omit<RecordRun, 'weave'>): boolean {
  const order: RecordKey[] = key === 'saved' ? ['saved', 'used', 'ticks'] : key === 'used' ? ['used', 'saved', 'ticks'] : ['ticks', 'saved', 'used'];
  for (const k of order) if (a[k] !== b[k]) return k === 'saved' ? a[k] > b[k] : a[k] < b[k];
  return false;
}

/** The level's records, if they were set on this simulation version and this shape of the level. */
export function levelRecords(s: SaveData, def: LevelDef): LevelRecords | null {
  const r = s.records[def.id];
  return r && r.v === SIM_VERSION && r.hash === levelHash(def) && Array.isArray(r.runs) ? r : null;
}

/**
 * Offer a finished run to the records. Its Weave is replayed headless first: a run whose replay goes out
 * of step, or ends anywhere but exactly where `claimed` says, is refused and changes nothing. Only a
 * verified clear (quota met, any guardian felled) sets records and joins the past runs. Returns the
 * verified facts (null if refused) and the records this run set; the caller writes the save.
 */
export function offerRecords(s: SaveData, def: LevelDef, w: Weave, claimed: RunFacts): { facts: RunFacts | null; set: RecordKey[] } {
  const facts = verifyWeave(def, w, claimed.ticks);
  if (!facts || !sameFacts(facts, claimed)) return { facts: null, set: [] };
  if (facts.saved < def.quota || facts.bossDefeated === false) return { facts, set: [] };
  const run: RecordRun = { saved: facts.saved, used: facts.used, ticks: facts.ticks, weave: encodeWeave(w) };
  let r = levelRecords(s, def);
  const set: RecordKey[] = [];
  if (!r) {
    // the first clear, or the first since the level or the rules changed: older records no longer compare
    r = { v: SIM_VERSION, hash: levelHash(def), saved: run, used: run, ticks: run, runs: [] };
    s.records[def.id] = r;
    set.push(...RECORD_KEYS);
  } else {
    for (const k of RECORD_KEYS) if (beats(k, run, r[k])) { r[k] = run; set.push(k); }
  }
  r.runs.push([run.saved, run.used, run.ticks]);
  if (r.runs.length > RUNS_KEPT) r.runs.splice(0, r.runs.length - RUNS_KEPT);
  return { facts, set };
}
