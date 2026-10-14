import { describe, expect, it } from 'vitest';
import { ALL_LEVELS } from '../src/levels';
import { fitView } from '../src/render/scale';

// CSS viewport sizes people actually have (desktop windows, laptops, ultrawides, 4K, phones in landscape)
const SCREENS: [number, number][] = [
  [1920, 947], [1920, 1080], [2560, 1271], [2560, 1440], [3440, 1440], [3840, 2160], [1366, 768], [1280, 720],
  [1536, 864], [1440, 900], [2048, 1152], [5120, 1440], [844, 390], [932, 430], [740, 360], [1180, 820], [1024, 768],
  [800, 600], [3000, 1300], [1600, 500],
];
const DPRS = [1, 1.25, 1.5, 1.75, 2, 2.25, 3];

describe('fitView', () => {
  it('never shows past a level, always covers the screen, keeps integer pixels', () => {
    let checked = 0;
    for (const def of ALL_LEVELS) {
      for (const [w, h] of SCREENS) {
        for (const dpr of DPRS) {
          const devW = Math.round(w * dpr), devH = Math.round(h * dpr);
          for (const zoomOffset of [-2, -1, 0, 1, 2]) {
            const f = fitView(devW, devH, {
              levelW: def.width, levelH: def.height, zoomOffset,
              fitWidth: def.boss ? Math.min(def.width, 640) : 0,
            });
            const ctx = `${def.id} ${w}x${h}@${dpr} zoom ${zoomOffset}: scale ${f.scale} view ${f.viewW}x${f.viewH}`;
            expect(Number.isInteger(f.scale) && f.scale >= 1, ctx).toBe(true);
            expect(f.viewW, ctx).toBeLessThanOrEqual(def.width);
            expect(f.viewH, ctx).toBeLessThanOrEqual(def.height);
            expect(f.viewW * f.scale, ctx).toBeGreaterThanOrEqual(devW);
            expect(f.viewH * f.scale, ctx).toBeGreaterThanOrEqual(devH);
            // the crop is centred and less than one world pixel on each side
            expect(f.ox, ctx).toBeLessThanOrEqual(0);
            expect(-f.ox, ctx).toBeLessThan(f.scale);
            expect(f.oy, ctx).toBeLessThanOrEqual(0);
            expect(-f.oy, ctx).toBeLessThan(f.scale);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
  });

  it('keeps the classic ~240-300 px tall view on ordinary screens', () => {
    const f = fitView(1920, 1080, { levelW: 600, levelH: 320 });
    expect(f.viewH).toBeGreaterThanOrEqual(240);
    expect(f.viewH).toBeLessThanOrEqual(320);
  });

  it('reproduces the reported case: 1920x947 CSS at 125% on a 560x280 level no longer exceeds the level', () => {
    const f = fitView(2400, 1184, { levelW: 560, levelH: 280 });
    expect(f.viewW).toBeLessThanOrEqual(560);
    expect(f.viewH).toBeLessThanOrEqual(280);
  });
});
