// Choosing the integer pixel scale and the internal view size for a given screen.
// Invariants (tested in tests/scale.test.ts):
//   - the scaled image always covers the whole screen (no letterbox bars; overflow is cropped),
//   - the view never extends past the level, so the void outside a level is never drawn,
//   - pixels stay square and integer-sized at every resolution and device-pixel ratio.

export interface ViewFit {
  scale: number;
  viewW: number;
  viewH: number;
  /** device-pixel offset of the scaled image (<= 0: centred crop) */
  ox: number;
  oy: number;
}

export interface FitOptions {
  /** level size in world pixels (0 = unknown / no constraint) */
  levelW?: number;
  levelH?: number;
  /** try to show at least this many world pixels across (boss arenas), never below 2x pixels */
  fitWidth?: number;
  /** player zoom preference, in whole scale steps */
  zoomOffset?: number;
}

/** Target: roughly 240-300 world pixels of height, i.e. a 32-bit-era screen. */
export function fitView(devW: number, devH: number, o: FitOptions = {}): ViewFit {
  devW = Math.max(1, Math.round(devW));
  devH = Math.max(1, Math.round(devH));
  let base = Math.max(1, Math.floor(Math.min(devH / 240, devW / 360)));
  if (o.fitWidth && o.fitWidth > 0) {
    while (base > 2 && Math.floor(devW / base) < o.fitWidth) base--;
  }
  let scale = Math.max(1, base + (o.zoomOffset ?? 0));
  // never show past the level edges: zoom in until the view fits inside the level
  if (o.levelW && o.levelW > 0) scale = Math.max(scale, Math.ceil(devW / o.levelW));
  if (o.levelH && o.levelH > 0) scale = Math.max(scale, Math.ceil(devH / o.levelH));
  const viewW = Math.max(1, Math.ceil(devW / scale));
  const viewH = Math.max(1, Math.ceil(devH / scale));
  return {
    scale, viewW, viewH,
    ox: Math.floor((devW - viewW * scale) / 2),
    oy: Math.floor((devH - viewH * scale) / 2),
  };
}
