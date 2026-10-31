// Progression + settings persistence. localStorage can be unavailable (private mode, blocked
// storage); every access is guarded and the game works without it.
import { ALL_LEVELS, REALM_LIST } from '../levels';

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

export interface SaveData {
  v: 1;
  stars: Record<string, number>;
  best: Record<string, number>;
  threads: number;
  upgrades: { foresight: number };
  hood: string;
  hoods: string[];
  settings: { music: number; sfx: number; foresight: boolean; hints: boolean; zoom: number; crt: boolean };
  seenIntro: boolean;
}

const KEY = 'norns.save.v1';

function fresh(): SaveData {
  return {
    v: 1, stars: {}, best: {}, threads: 0, upgrades: { foresight: 0 }, hood: 'teal', hoods: ['teal'],
    settings: { music: 0.7, sfx: 0.85, foresight: true, hints: true, zoom: 0, crt: false }, seenIntro: false,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw) as Partial<SaveData> & { upgrades?: { rewind?: number } };
    const f = fresh();
    const refund = RETIRED_REWIND_COSTS.slice(0, d.upgrades?.rewind ?? 0).reduce((a, b) => a + b, 0);
    return {
      ...f, ...d, threads: (d.threads ?? 0) + refund,
      upgrades: { foresight: d.upgrades?.foresight ?? f.upgrades.foresight }, settings: { ...f.settings, ...d.settings },
    } as SaveData;
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

/** A level is playable if it is the first, or the previous level in order is cleared. */
export function isUnlocked(s: SaveData, levelId: string): boolean {
  const i = ALL_LEVELS.findIndex((l) => l.id === levelId);
  if (i <= 0) return true;
  return ((s.stars[ALL_LEVELS[i - 1].id] ?? 0) & 1) === 1;
}

export function realmUnlocked(s: SaveData, realmIndex: number): boolean {
  if (realmIndex === 0) return true;
  const prev = REALM_LIST[realmIndex - 1];
  const last = prev.levels[prev.levels.length - 1];
  return ((s.stars[last.id] ?? 0) & 1) === 1;
}

export interface Outcome {
  levelId: string;
  saved: number;
  quota: number;
  target: number;
  spindle: boolean;
  bossDefeated: boolean | null;
}

/** Record a result; returns the star mask earned this run, newly earned stars and threads gained. */
export function recordOutcome(s: SaveData, o: Outcome): { mask: number; newMask: number; threads: number } {
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
  writeSave(s);
  return { mask, newMask, threads };
}
