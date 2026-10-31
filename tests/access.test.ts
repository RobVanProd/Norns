// Accessibility settings and keys: they persist, a key remap survives the save, slot keys follow the bar,
// and old saves lose the dead CRT flag. Node has no localStorage, so a stand-in is set up per test.
import { afterEach, describe, expect, it } from 'vitest';
import { actionFor, bindKey, defaultKeys, KEY_ACTIONS, keysName, readKeys, reservedKey, SLOT_ACTIONS } from '../src/game/input';
import { loadSave, writeSave } from '../src/game/save';
import { ALL_LEVELS } from '../src/levels';
import { SKILLS } from '../src/sim/constants';
import { barSlots } from '../src/ui/hud';

const g = globalThis as unknown as { localStorage?: Storage };
afterEach(() => { delete g.localStorage; });

function stubStorage(): Map<string, string> {
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage;
  return store;
}

describe('key bindings', () => {
  it('give every action a key, and no key two actions', () => {
    const k = defaultKeys();
    const all = KEY_ACTIONS.flatMap((a) => k[a.id]);
    expect(KEY_ACTIONS.every((a) => k[a.id].length > 0)).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    expect(actionFor(k, 'Digit1')).toBe('slot1');
    expect(actionFor(k, 'KeyP')).toBe('pause');
    expect(keysName(k, 'pause')).toBe('Space / P');
  });

  it('move a key that was in use, and swap when the other action would be left with none', () => {
    const k = defaultKeys();
    // F was Speed's only key: Speed takes Foresight's old V
    expect(bindKey(k, 'foresight', 'KeyF')).toBe('speed');
    expect(k.foresight).toEqual(['KeyF']);
    expect(k.speed).toEqual(['KeyV']);
    // P was one of Pause's two keys: Pause keeps Space
    expect(bindKey(k, 'rewind', 'KeyP')).toBe('pause');
    expect(k.pause).toEqual(['Space']);
    expect(k.rewind).toEqual(['KeyP']);
    // a key bound to nothing just binds
    expect(bindKey(k, 'slot1', 'KeyJ')).toBeNull();
    expect(actionFor(k, 'Digit1')).toBeNull();
    const all = KEY_ACTIONS.flatMap((a) => k[a.id]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keep Esc, Shift and Tab for themselves', () => {
    expect(['Escape', 'ShiftLeft', 'Tab'].every(reservedKey)).toBe(true);
    expect(reservedKey('KeyQ')).toBe(false);
  });

  it('read a damaged save back to something whole', () => {
    expect(readKeys(undefined)).toEqual(defaultKeys());
    const k = readKeys({ pause: ['KeyX'], rewind: 'KeyR', speed: ['KeyX'], foresight: [5, 'Escape'], slot2: ['Digit1'] });
    expect(k.pause).toEqual(['KeyX']);
    expect(k.rewind).toEqual(defaultKeys().rewind);
    // claimed twice: the first saved binding keeps it, the second is left without
    expect(k.speed).toEqual([]);
    expect(k.foresight).toEqual(defaultKeys().foresight);
    // a saved binding beats a default it collides with
    expect(k.slot2).toEqual(['Digit1']);
    expect(k.slot1).toEqual([]);
  });
});

describe('settings in the save', () => {
  it('round-trip a key remap through the save', () => {
    const store = stubStorage();
    const s = loadSave();
    bindKey(s.settings.keys, 'slot1', 'KeyJ');
    bindKey(s.settings.keys, 'pause', 'KeyF');
    writeSave(s);
    const raw = JSON.parse(store.get('norns.save.v1')!);
    expect(raw.settings.keys.slot1).toEqual(['KeyJ']);
    const back = loadSave();
    expect(back.settings.keys).toEqual(s.settings.keys);
    expect(actionFor(back.settings.keys, 'KeyJ')).toBe('slot1');
    expect(actionFor(back.settings.keys, 'KeyF')).toBe('pause');
    // F was Speed's only key, so Speed took Pause's first old key
    expect(back.settings.keys.speed).toEqual(['Space']);
  });

  it('keep reduce motion, text size and touch reach', () => {
    stubStorage();
    const s = loadSave();
    expect(s.settings).toMatchObject({ reduceMotion: false, textSize: 1, touchReach: 12 });
    Object.assign(s.settings, { reduceMotion: true, textSize: 1.25, touchReach: 18 });
    writeSave(s);
    expect(loadSave().settings).toMatchObject({ reduceMotion: true, textSize: 1.25, touchReach: 18 });
  });

  it('drop the dead CRT flag from an old save, and give it the new settings', () => {
    const store = stubStorage();
    store.set('norns.save.v1', JSON.stringify({ v: 1, stars: { m1: 1 }, settings: { music: 0.3, crt: true, zoom: 1 } }));
    const s = loadSave();
    expect('crt' in s.settings).toBe(false);
    expect(s.settings).toMatchObject({ music: 0.3, zoom: 1, reduceMotion: false, textSize: 1, touchReach: 12 });
    expect(s.settings.keys).toEqual(defaultKeys());
    writeSave(s);
    expect('crt' in JSON.parse(store.get('norns.save.v1')!).settings).toBe(false);
  });
});

describe('slot keys', () => {
  it('follow the bar: key 1 is the leftmost calling, whatever it is', () => {
    const k = defaultKeys();
    const u5 = ALL_LEVELS.find((l) => l.id === 'u5')!;
    const bar = barSlots(u5.skills);
    expect(bar[0]).not.toBe('digger');
    expect(bar[0]).toBe('weaver');
    const slot = SLOT_ACTIONS.indexOf(actionFor(k, 'Digit1')!);
    expect(bar[slot]).toBe('weaver');
    // the last calling on a six-calling bar is key 6, not its old fixed key 9
    expect(bar[SLOT_ACTIONS.indexOf(actionFor(k, 'Digit6')!)]).toBe('blast');
    expect(bar[SLOT_ACTIONS.indexOf(actionFor(k, 'Digit9')!)]).toBeUndefined();
  });

  it('cover every level: its bar is its callings in the usual order, each on a key', () => {
    for (const l of ALL_LEVELS) {
      const bar = barSlots(l.skills);
      expect(bar).toEqual(SKILLS.filter((s) => l.skills[s] !== undefined));
      expect(bar.length).toBeLessThanOrEqual(SLOT_ACTIONS.length);
    }
  });
});
