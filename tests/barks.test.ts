// Wyrdling barks (src/audio/barks.ts): however many Wyrdlings want to speak, a crowd never drones. Every
// sliding second holds at most BARK_LIMITS.total barks, no two closer than the hush, and no kind repeats
// within its cooldown. Also: each Wyrdling keeps one voice, the voices differ, and the Voices volume is saved.
import { afterEach, describe, expect, it } from 'vitest';
import { BARK_LIMITS, BarkLimiter, barkPitch } from '../src/audio/barks';
import { SFX } from '../src/audio/sfx';
import { SFX_IDS } from '../src/audio/types';
import { loadSave, writeSave } from '../src/game/save';

const KINDS = ['bark_hup', 'bark_mm', 'bark_oh', 'bark_whee', 'bark_yay'];

/** Offer barks to a limiter at the given times; returns what was let through. */
function run(offers: { kind: string; t: number }[], lim = new BarkLimiter()): { kind: string; t: number }[] {
  return offers.filter((o) => lim.allow(o.kind, o.t));
}

/** Check every limit over a list of played barks. */
function expectWithinLimits(played: { kind: string; t: number }[]): void {
  const L = BARK_LIMITS;
  for (let i = 0; i < played.length; i++) {
    const p = played[i];
    if (i > 0) expect(p.t - played[i - 1].t).toBeGreaterThanOrEqual(L.hush - 1e-9);
    const inWindow = played.filter((q) => q.t <= p.t && p.t - q.t < L.window);
    expect(inWindow.length).toBeLessThanOrEqual(L.total);
    const prevSame = played.slice(0, i).filter((q) => q.kind === p.kind).pop();
    if (prevSame) expect(p.t - prevSame.t).toBeGreaterThanOrEqual((L.kinds[p.kind] ?? L.cooldown) - 1e-9);
  }
}

describe('bark crowd limit', () => {
  it('lets one bark through a burst of many at the same moment', () => {
    const burst = Array.from({ length: 40 }, (_, i) => ({ kind: KINDS[i % KINDS.length], t: 5 }));
    expect(run(burst)).toEqual([{ kind: 'bark_hup', t: 5 }]);
  });

  it('keeps a crowd of every kind, every 10 ms for a minute, within every limit', () => {
    const offers: { kind: string; t: number }[] = [];
    for (let i = 0; i < 6000; i++) offers.push({ kind: KINDS[(i * 7) % KINDS.length], t: i / 100 });
    const played = run(offers);
    expectWithinLimits(played);
    // a crowd is quieted, not silenced: barks keep coming, at no more than the total rate
    expect(played.length).toBeGreaterThan(60);
    expect(played.length).toBeLessThanOrEqual(60 * BARK_LIMITS.total + 1);
    for (const k of KINDS) expect(played.some((p) => p.kind === k)).toBe(true);
  });

  it('spaces one kind by its cooldown: a stream of arrivals is not a stream of cheers', () => {
    const played = run(Array.from({ length: 300 }, (_, i) => ({ kind: 'bark_yay', t: i / 30 })));
    expectWithinLimits(played);
    const gap = BARK_LIMITS.kinds.bark_yay!;
    expect(played.length).toBeLessThanOrEqual(Math.floor(10 / gap) + 1);
    expect(played.length).toBeGreaterThanOrEqual(Math.floor(10 / (gap + 1 / 30)));
  });

  it('lets a bark through again once its limits have passed', () => {
    const lim = new BarkLimiter();
    expect(lim.allow('bark_mm', 1)).toBe(true);
    expect(lim.allow('bark_mm', 1 + BARK_LIMITS.hush / 2)).toBe(false);
    expect(lim.allow('bark_oh', 1 + BARK_LIMITS.hush / 2)).toBe(false);
    expect(lim.allow('bark_oh', 1 + BARK_LIMITS.hush + 0.001)).toBe(true);
    expect(lim.allow('bark_mm', 1 + BARK_LIMITS.kinds.bark_mm! + 0.001)).toBe(true);
  });

  it('starts afresh when the clock goes backwards (a new audio context)', () => {
    const lim = new BarkLimiter();
    expect(lim.allow('bark_hup', 100)).toBe(true);
    expect(lim.allow('bark_hup', 0.5)).toBe(true);
  });

  it('applies to every bark and only to barks', () => {
    const barks = SFX_IDS.filter((id) => SFX[id].bus === 'voice');
    expect([...barks].sort()).toEqual([...KINDS].sort());
    for (const k of KINDS) expect(BARK_LIMITS.kinds[k]).toBeGreaterThan(0);
  });
});

describe('bark voices', () => {
  it('gives each Wyrdling one pitch, within a small range, and gives a crowd several', () => {
    const pitches = Array.from({ length: 40 }, (_, id) => barkPitch(id));
    for (const p of pitches) {
      expect(p).toBeGreaterThanOrEqual(0.88);
      expect(p).toBeLessThanOrEqual(1.12);
    }
    expect(barkPitch(7)).toBe(barkPitch(7));
    expect(new Set(pitches).size).toBeGreaterThanOrEqual(6);
  });
});

describe('Voices volume', () => {
  const g = globalThis as unknown as { localStorage?: Storage };
  afterEach(() => { delete g.localStorage; });
  const stub = (store: Map<string, string>) => {
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
  };

  it('is saved and loaded back, and a save from before it gets the default', () => {
    const store = new Map<string, string>();
    stub(store);
    const s = loadSave();
    expect(s.settings.voice).toBe(0.7);
    s.settings.voice = 0.25;
    writeSave(s);
    expect(loadSave().settings.voice).toBe(0.25);
    // an older save: its settings have no voice
    const old = JSON.parse(store.get('norns.save.v1')!);
    delete old.settings.voice;
    store.set('norns.save.v1', JSON.stringify(old));
    expect(loadSave().settings.voice).toBe(0.7);
  });
});
