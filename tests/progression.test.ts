// Level and realm unlocks (src/game/save.ts): clearing a level at quota opens the next two in its
// realm, a guardian needs three of its realm's puzzles, a realm opens when the previous guardian falls
// or all its puzzles are cleared, and no unlock ever depends on second or third stars. Unlocks follow
// level ids and stick, so adding a level to a realm never relocks a save.
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_LEVELS, REALM_LIST, type RealmInfo } from '../src/levels';
import { BOSS_NEEDS, isUnlocked, loadSave, realmUnlocked, recordOutcome, type Outcome, type SaveData } from '../src/game/save';
import type { LevelDef } from '../src/sim/level';

const g = globalThis as unknown as { localStorage?: Storage };
afterEach(() => { delete g.localStorage; });

/** A localStorage stand-in; returns its backing map. */
function stubStorage(): Map<string, string> {
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage;
  return store;
}

/** No storage in the test environment, so this is a brand-new save. */
const newSave = (): SaveData => loadSave();
const level = (id: string): LevelDef => ALL_LEVELS.find((l) => l.id === id)!;

/** Clear a level the cheapest way: exactly the quota, no spindle (a guardian falls). */
function clear(s: SaveData, id: string, o: Partial<Outcome> = {}) {
  const l = level(id);
  return recordOutcome(s, {
    levelId: id, saved: l.quota, quota: l.quota, target: l.target, spindle: false, bossDefeated: l.boss ? true : null, ...o,
  });
}

const openIds = (s: SaveData, realms: RealmInfo[] = REALM_LIST): string[] =>
  realms.flatMap((r) => r.levels).filter((l) => isUnlocked(s, l.id, realms)).map((l) => l.id);

/** Midgard with a new puzzle inserted after m2, as a later content update might ship it. */
function withInserted(): RealmInfo[] {
  const extra: LevelDef = { ...level('m2'), id: 'm2b', name: 'A Thread Added Later' };
  return REALM_LIST.map((r) => r.id !== 'midgard' ? r : { ...r, levels: [...r.levels.slice(0, 2), extra, ...r.levels.slice(2)] });
}

describe('progression', () => {
  it('starts with only the first level of Midgard open', () => {
    const s = newSave();
    expect(openIds(s)).toEqual(['m1']);
    expect(realmUnlocked(s, 0)).toBe(true);
    expect(realmUnlocked(s, 1)).toBe(false);
    expect(realmUnlocked(s, 2)).toBe(false);
  });

  it('opens the next two levels of the realm when a level is cleared at quota, with no extra stars', () => {
    const s = newSave();
    const out = clear(s, 'm1');
    expect(out.mask).toBe(1);
    expect(out.opened).toEqual(['m2', 'm3']);
    expect(openIds(s)).toEqual(['m1', 'm2', 'm3']);
    clear(s, 'm3');
    expect(openIds(s)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('opens nothing for a run below the quota, however many stars it would otherwise earn', () => {
    const s = newSave();
    const out = clear(s, 'm1', { saved: level('m1').quota - 1, spindle: true });
    expect(out.mask).toBe(0);
    expect(out.opened).toEqual([]);
    expect(openIds(s)).toEqual(['m1']);
  });

  it(`wakes a guardian once ${BOSS_NEEDS} of its realm's puzzles are cleared, in any order`, () => {
    expect(BOSS_NEEDS).toBe(3);
    const s = newSave();
    clear(s, 'm1');
    clear(s, 'm2');
    expect(isUnlocked(s, 'm5')).toBe(false);
    clear(s, 'm4'); // m3 skipped
    expect(isUnlocked(s, 'm5')).toBe(true);
    expect(isUnlocked(s, 'm3')).toBe(true);
  });

  it('opens the next realm when its guardian falls', () => {
    const s = newSave();
    for (const id of ['m1', 'm2', 'm3']) clear(s, id);
    expect(realmUnlocked(s, 1)).toBe(false);
    // the quota alone is not enough while the guardian stands
    expect(clear(s, 'm5', { bossDefeated: false }).mask).toBe(0);
    expect(realmUnlocked(s, 1)).toBe(false);
    expect(isUnlocked(s, 'n1')).toBe(false);
    const out = clear(s, 'm5');
    expect(out.opened).toContain('n1');
    expect(realmUnlocked(s, 1)).toBe(true);
    expect(openIds(s).filter((id) => id.startsWith('n'))).toEqual(['n1']);
    expect(realmUnlocked(s, 2)).toBe(false);
  });

  it("opens the next realm when all of the previous realm's puzzles are cleared, guardian or not", () => {
    const s = newSave();
    for (const id of ['m1', 'm2', 'm3']) clear(s, id);
    expect(realmUnlocked(s, 1)).toBe(false);
    clear(s, 'm4');
    expect(realmUnlocked(s, 1)).toBe(true);
    expect(isUnlocked(s, 'n1')).toBe(true);
    expect(isUnlocked(s, 'm5')).toBe(true);
    expect(realmUnlocked(s, 2)).toBe(false);
  });

  it('reaches every level by clearing them in order', () => {
    const s = newSave();
    for (const l of ALL_LEVELS) {
      expect(isUnlocked(s, l.id), l.id).toBe(true);
      clear(s, l.id);
    }
  });

  it('relocks nothing in a save made before a level is inserted mid-realm', () => {
    const store = stubStorage();
    const before = loadSave();
    clear(before, 'm1');
    clear(before, 'm2'); // opens m3 and m4
    const openBefore = openIds(before);
    expect(openBefore).toEqual(['m1', 'm2', 'm3', 'm4']);

    // the game updates with a new puzzle between m2 and m3, and the stored save loads again
    const inserted = withInserted();
    const after = loadSave();
    expect(store.size).toBe(1);
    for (const id of openBefore) expect(isUnlocked(after, id, inserted), id).toBe(true);
    expect(isUnlocked(after, 'm2b', inserted)).toBe(true); // follows the cleared m2
    // position alone would have relocked m4 (its two predecessors are now m2b and m3); the sticky
    // opened list is what keeps it open
    expect(isUnlocked({ ...after, opened: [] }, 'm4', inserted)).toBe(false);
  });

  it('keeps the next realm open when a puzzle is added to a realm it was opened from', () => {
    stubStorage();
    const s = loadSave();
    for (const id of ['m1', 'm2', 'm3', 'm4']) clear(s, id); // Niflheim opens by clearing every puzzle
    const inserted = withInserted();
    const after = loadSave();
    expect(realmUnlocked(after, 1, inserted)).toBe(true);
    expect(isUnlocked(after, 'n1', inserted)).toBe(true);
    expect(isUnlocked(after, 'm5', inserted)).toBe(true);
  });

  it('keeps everything a save from before these rules had open', () => {
    // the old rule: a level is open if it is the very first or the level before it (in global order) is cleared
    const oldOpen = (s: SaveData, i: number) => i === 0 || ((s.stars[ALL_LEVELS[i - 1].id] ?? 0) & 1) === 1;
    const store = stubStorage();
    for (let k = 0; k <= ALL_LEVELS.length; k++) {
      const stars = Object.fromEntries(ALL_LEVELS.slice(0, k).map((l) => [l.id, 1]));
      store.set('norns.save.v1', JSON.stringify({ v: 1, stars, threads: 0 })); // no opened list yet
      const s = loadSave();
      ALL_LEVELS.forEach((l, i) => { if (oldOpen(s, i)) expect(isUnlocked(s, l.id), `${k} cleared: ${l.id}`).toBe(true); });
      // and the migration writes those unlocks down, so later inserts can't take them away
      ALL_LEVELS.forEach((l) => { if (isUnlocked(s, l.id)) expect(s.opened, l.id).toContain(l.id); });
    }
  });

  it('stores the rewind mode with the other settings', () => {
    const store = stubStorage();
    const s = loadSave();
    expect(s.settings.rewindToggle).toBe(false);
    s.settings.rewindToggle = true;
    clear(s, 'm1'); // writes the save
    expect(JSON.parse(store.get('norns.save.v1')!).settings.rewindToggle).toBe(true);
    expect(loadSave().settings.rewindToggle).toBe(true);
  });
});
