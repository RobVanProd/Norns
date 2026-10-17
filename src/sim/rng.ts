// Deterministic RNG + noise for the simulation and level builder (IEEE-exact operations only).

/** Advance a mulberry32 state; returns [value in [0,1), nextState]. */
export function rngNext(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

export function hashInt(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

export function noise1(x: number, seed: number): number {
  const x0 = Math.floor(x);
  const f = smooth(x - x0);
  const a = hashInt(x0, 0, seed), b = hashInt(x0 + 1, 0, seed);
  return a + (b - a) * f;
}

export function noise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smooth(x - x0), fy = smooth(y - y0);
  const a = hashInt(x0, y0, seed), b = hashInt(x0 + 1, y0, seed);
  const c = hashInt(x0, y0 + 1, seed), d = hashInt(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** Deterministic sine approximation (|err| < 2e-3), avoids engine-specific Math.sin. */
export function dsin(x: number): number {
  const TAU = 6.283185307179586;
  let t = x / TAU;
  t = t - Math.floor(t); // [0,1)
  let v = t * TAU; // [0, 2π)
  let sign = 1;
  if (v > Math.PI) { v -= Math.PI; sign = -1; }
  // Bhaskara I approximation refined: sin(v) for v in [0, π]
  const p = v * (Math.PI - v);
  return sign * ((16 * p) / (5 * Math.PI * Math.PI - 4 * p));
}

export function dcos(x: number): number {
  return dsin(x + 1.5707963267948966);
}
