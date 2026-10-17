// Packs every sprite frame (and font glyph) into one texture atlas.
import * as THREE from 'three';
import type { Anim, BitmapFont, SpriteLib } from '../art/types';

export interface FrameRef {
  /** atlas pixel rect */
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

export interface AnimRef {
  frames: FrameRef[];
}

export class Atlas {
  readonly texture: THREE.CanvasTexture;
  readonly size: number;
  readonly anims = new Map<string, AnimRef>();
  readonly glyphs = new Map<string, FrameRef>();
  readonly fontLineHeight: number;
  private missing: AnimRef;

  constructor(sprites: SpriteLib, font: BitmapFont) {
    type Item = { key: string; idx: number; cv: CanvasImageSource; w: number; h: number; ax: number; ay: number; glyph?: string; gx?: number; gy?: number };
    const items: Item[] = [];
    // utility sprites
    const white = document.createElement('canvas');
    white.width = white.height = 4;
    const wctx = white.getContext('2d')!;
    wctx.fillStyle = '#fff';
    wctx.fillRect(0, 0, 4, 4);
    items.push({ key: '__white', idx: 0, cv: white, w: 4, h: 4, ax: 0, ay: 0 });
    const miss = document.createElement('canvas');
    miss.width = miss.height = 8;
    const mctx = miss.getContext('2d')!;
    mctx.fillStyle = '#ff00ff';
    mctx.fillRect(0, 0, 8, 8);
    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, 4, 4);
    mctx.fillRect(4, 4, 4, 4);
    items.push({ key: '__missing', idx: 0, cv: miss, w: 8, h: 8, ax: 4, ay: 7 });

    for (const [key, anim] of Object.entries(sprites)) {
      anim.frames.forEach((cv, idx) => items.push({ key, idx, cv, w: cv.width, h: cv.height, ax: anim.ax, ay: anim.ay }));
    }
    for (const [ch, g] of Object.entries(font.glyphs)) {
      items.push({ key: '__glyph', idx: 0, cv: font.canvas, w: g.w, h: g.h, ax: 0, ay: 0, glyph: ch, gx: g.x, gy: g.y });
    }
    this.fontLineHeight = font.lineHeight;

    // shelf packing, tallest first, 1px padding
    const order = items.map((_, i) => i).sort((a, b) => items[b].h - items[a].h || items[b].w - items[a].w);
    let size = 512;
    const pos = new Array<[number, number]>(items.length);
    for (;;) {
      let x = 0, y = 0, shelf = 0, ok = true;
      for (const i of order) {
        const it = items[i];
        if (x + it.w + 1 > size) { x = 0; y += shelf + 1; shelf = 0; }
        if (y + it.h + 1 > size || it.w + 1 > size) { ok = false; break; }
        pos[i] = [x, y];
        x += it.w + 1;
        shelf = Math.max(shelf, it.h);
      }
      if (ok) break;
      size *= 2;
      if (size > 4096) throw new Error('atlas overflow');
    }
    this.size = size;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    items.forEach((it, i) => {
      const [x, y] = pos[i];
      if (it.glyph !== undefined) ctx.drawImage(it.cv, it.gx!, it.gy!, it.w, it.h, x, y, it.w, it.h);
      else ctx.drawImage(it.cv, x, y);
      const ref: FrameRef = { x, y, w: it.w, h: it.h, ax: it.ax, ay: it.ay };
      if (it.glyph !== undefined) { this.glyphs.set(it.glyph, ref); return; }
      let a = this.anims.get(it.key);
      if (!a) { a = { frames: [] }; this.anims.set(it.key, a); }
      a.frames[it.idx] = ref;
    });
    this.missing = this.anims.get('__missing')!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    this.texture = tex;
  }

  anim(key: string): AnimRef {
    return this.anims.get(key) ?? this.missing;
  }

  has(key: string): boolean {
    return this.anims.has(key);
  }

  frame(key: string, i: number): FrameRef {
    const a = this.anim(key);
    const n = a.frames.length;
    return a.frames[((i % n) + n) % n];
  }

  get white(): FrameRef {
    return this.anims.get('__white')!.frames[0];
  }
}

export type { Anim };
