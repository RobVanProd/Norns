// Small helpers for writing songs compactly.

/** Repeat a pattern fragment n times. */
export const rep = (s: string, n: number): string => Array(n).fill(s).join(' ');

/** n bars of rest (4/4 or 3/4). */
export const R = (n: number, meter = 4): string => rep(meter === 3 ? 'r:2.' : 'r:1', n);

/** Drum grid: n bars of the same one-bar line. */
export const G = (n: number, bar: string): string => rep(bar, n);

/** Drum grid: n empty bars of `steps` steps. */
export const E = (n: number, steps: number): string => '.'.repeat(n * steps);
