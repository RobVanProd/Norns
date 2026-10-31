// Checks across every realm. Each level is checked in its realm's file (levels-<realm>.test.ts,
// see describeLevels in helpers.ts): provably beatable, every scripted step needed, and not beatable
// (nor its spindle collectable) by doing nothing.
import { describe, expect, it } from 'vitest';
import { ALL_LEVELS } from '../src/levels';

describe('levels', () => {
  it('have unique ids', () => {
    const ids = ALL_LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
