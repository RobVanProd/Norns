// Cosmetic hood dyes: hue-swap the Wyrdling's teal hood pixels into alternate colours.
import { HOODS } from '../game/save';
import { aOf, fromHsl, toHsl } from './px';
import type { Anim, SpriteLib } from './types';

function recolor(src: HTMLCanvasElement, hue: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const px = new Uint32Array(img.data.buffer);
  for (let i = 0; i < px.length; i++) {
    const p = px[i];
    if (aOf(p) === 0) continue;
    const [h, s, l] = toHsl(p);
    // the hood ramp lives in the cyan/teal band; leave skin, gold thread, cloak alone
    if (h < 160 || h > 200 || s < 0.25) continue;
    if (hue < 0) px[i] = fromHsl(205, s * 0.15, Math.min(0.95, l * 1.12 + 0.08), aOf(p));
    else px[i] = fromHsl(hue + (h - 180) * 0.5, Math.min(1, s * 1.05), l, aOf(p));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function addHoodVariants(sprites: SpriteLib): void {
  const base = Object.entries(sprites).filter(([k]) => k.startsWith('wyrd.'));
  for (const hood of HOODS) {
    if (hood.hue === null) continue;
    for (const [k, a] of base) {
      const v: Anim = { frames: a.frames.map((f) => recolor(f, hood.hue!)), ax: a.ax, ay: a.ay };
      sprites[`${k}@${hood.id}`] = v;
    }
  }
}
