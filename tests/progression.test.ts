// Level and realm unlocks (src/game/save.ts): clearing a level at quota opens the next two in its
// realm, a guardian needs three of its realm's puzzles, a realm opens when the previous guardian falls
// or all its puzzles are cleared, and no unlock ever depends on second or third stars. Unlocks follow
// level ids and stick, so adding a level to a realm never relocks a save, and a save from the first
// release (which opened levels in one global order and kept no opened list) keeps what it had open.
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

/** Midgard's puzzles in play order (m1, m2, m3, m3b, ...). */
const MIDGARD_PUZZLES = REALM_LIST[0].levels.filter((l) => !l.boss).map((l) => l.id);

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
    expect(openIds(s)).toEqual(['m1', 'm2', 'm3', 'm3b', 'm3c']);
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
    for (const id of MIDGARD_PUZZLES.slice(0, -1)) clear(s, id);
    expect(realmUnlocked(s, 1)).toBe(false);
    clear(s, MIDGARD_PUZZLES[MIDGARD_PUZZLES.length - 1]);
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
    clear(before, 'm2'); // opens m3 and m3b
    const openBefore = openIds(before);
    expect(openBefore).toEqual(['m1', 'm2', 'm3', 'm3b']);

    // the game updates with a new puzzle between m2 and m3, and the stored save loads again
    const inserted = withInserted();
    const after = loadSave();
    expect(store.size).toBe(1);
    for (const id of openBefore) expect(isUnlocked(after, id, inserted), id).toBe(true);
    expect(isUnlocked(after, 'm2b', inserted)).toBe(true); // follows the cleared m2
    // position alone would have relocked m3b (its two predecessors are now m2b and m3); the sticky
    // opened list is what keeps it open
    expect(isUnlocked({ ...after, opened: [] }, 'm3b', inserted)).toBe(false);
  });

  it('keeps open everything a save from before the Midgard split had open', () => {
    // wave 1 shipped Midgard as m1, m2, m3, m4 and the Wyrm; this save cleared all four, so Niflheim opened
    const store = stubStorage();
    const stars = { m1: 1, m2: 1, m3: 1, m4: 1 };
    store.set('norns.save.v1', JSON.stringify({ v: 1, stars, threads: 0, opened: ['m1', 'm2', 'm3', 'm4', 'm5', 'n1'] }));
    const s = loadSave();
    for (const id of ['m1', 'm2', 'm3', 'm4', 'm5', 'n1']) expect(isUnlocked(s, id), id).toBe(true);
    expect(realmUnlocked(s, 1)).toBe(true);
    // the split's new puzzles open by the usual rule: m3b and m3c follow the cleared m3
    expect(isUnlocked(s, 'm3b')).toBe(true);
    expect(isUnlocked(s, 'm3c')).toBe(true);
  });

  it('keeps the next realm open when a puzzle is added to a realm it was opened from', () => {
    stubStorage();
    const s = loadSave();
    for (const id of MIDGARD_PUZZLES) clear(s, id); // Niflheim opens by clearing every puzzle
    const inserted = withInserted();
    const after = loadSave();
    expect(realmUnlocked(after, 1, inserted)).toBe(true);
    expect(isUnlocked(after, 'n1', inserted)).toBe(true);
    expect(isUnlocked(after, 'm5', inserted)).toBe(true);
  });

  describe('saves from the first release (no opened list)', () => {
    // The first release (origin/main, the build players have saves from) ordered its levels globally and
    // opened a level when the one before it in that order was cleared, and a realm when the previous
    // realm's last level was. Its order is written out here, not taken from today's realms, which insert
    // levels into it.
    const OLD = ['m1', 'm2', 'm3', 'm4', 'm5', 'n1', 'n2', 'n3', 'n4', 'n5', 'u1', 'u2', 'u3', 'u4', 'u5'];
    const OLD_REALM_LAST = ['m5', 'n5'];
    const done = (stars: Record<string, number>, id: string) => ((stars[id] ?? 0) & 1) === 1;
    const oldOpen = (stars: Record<string, number>) => OLD.filter((_, i) => i === 0 || done(stars, OLD[i - 1]));

    /** Store a save exactly as the first release wrote it, then load it. */
    function loadOld(stars: Record<string, number>): SaveData {
      stubStorage().set('norns.save.v1', JSON.stringify({
        v: 1, stars, best: {}, threads: 3, upgrades: { foresight: 0, rewind: 0 }, hood: 'teal', hoods: ['teal'],
        settings: { music: 0.7, sfx: 0.85, foresight: true, hints: true, zoom: 0, crt: false }, seenIntro: true,
      }));
      return loadSave();
    }

    /** Nothing the first release had open, and nothing cleared, is locked now, and all of it is written down. */
    function keepsOld(stars: Record<string, number>, name: string): SaveData {
      const s = loadOld(stars);
      const old = oldOpen(stars);
      for (const id of old) expect(isUnlocked(s, id), `${name}: ${id} was open`).toBe(true);
      for (const id of Object.keys(stars)) if (done(stars, id)) expect(isUnlocked(s, id), `${name}: ${id} cleared`).toBe(true);
      OLD_REALM_LAST.forEach((id, ri) => { if (done(stars, id)) expect(realmUnlocked(s, ri + 1), `${name}: realm ${ri + 1}`).toBe(true); });
      // the migration writes those unlocks down, so a later insert can't take them away
      for (const id of old) expect(s.opened, `${name}: ${id} pinned`).toContain(id);
      return s;
    }

    it('keeps m4 open for a player who cleared the three before it, and m4 itself once cleared', () => {
      // today m3b, m3c and m3d sit between m3 and m4, so position alone would lock m4 here
      let s = keepsOld({ m1: 1, m2: 1, m3: 1 }, 'm1-m3');
      expect(openIds(s).filter((id) => id.startsWith('m'))).toEqual(['m1', 'm2', 'm3', 'm3b', 'm3c', 'm4', 'm5']);
      s = keepsOld({ m1: 1, m2: 1, m3: 1, m4: 1 }, 'm1-m4');
      expect(isUnlocked(s, 'm4')).toBe(true);
      expect(isUnlocked(s, 'm5')).toBe(true);
      expect(realmUnlocked(s, 1)).toBe(false);
      s = keepsOld({ m1: 7, m2: 3, m3: 1, m4: 1, m5: 1 }, 'm1-m5');
      expect(openIds(s)).toContain('n1');
    });

    it('opens the levels inserted before a cleared one', () => {
      // m3d follows m3b and m3c, which this player never saw, but it sits before the m4 they cleared
      const s = keepsOld({ m1: 1, m2: 1, m3: 1, m4: 1, m5: 1 }, 'all of Midgard');
      for (const id of MIDGARD_PUZZLES) expect(isUnlocked(s, id), id).toBe(true);
    });

    it('keeps every prefix of the old order open', () => {
      for (let k = 0; k <= OLD.length; k++) keepsOld(Object.fromEntries(OLD.slice(0, k).map((id) => [id, 1])), `first ${k}`);
    });

    it('keeps any mix of cleared Midgard levels, with or without the realms after it', () => {
      const later: Record<string, number>[] = [{}, { n1: 1, n2: 1 }, { n1: 1, n2: 1, n3: 1, n4: 1, n5: 1, u1: 1 }];
      for (let mask = 0; mask < 1 << 5; mask++) {
        const mid = Object.fromEntries(OLD.slice(0, 5).filter((_, b) => mask & (1 << b)).map((id) => [id, 1]));
        for (const rest of later) keepsOld({ ...mid, ...rest }, `${Object.keys({ ...mid, ...rest }).join(',') || 'nothing'}`);
      }
    });
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
