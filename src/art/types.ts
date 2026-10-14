// Contract between the procedural art modules and the renderer. See docs/ART_SPEC.md.

export type RealmId = 'midgard' | 'niflheim' | 'muspelheim';

export const REALMS: RealmId[] = ['midgard', 'niflheim', 'muspelheim'];

/** An animation: frames share size and anchor. Anchor = pixel in the frame placed at the entity position. */
export interface Anim {
  frames: HTMLCanvasElement[];
  ax: number;
  ay: number;
}

export type SpriteLib = Record<string, Anim>;

export interface BgLayer {
  /** horizontally tileable canvas */
  canvas: HTMLCanvasElement;
  /** 0 = fixed to screen, 1 = moves with the world, >1 = foreground */
  parallax: number;
  /** pixels from the bottom of the level to the bottom of this layer (layers are bottom-anchored) */
  bottomOffset: number;
}

export interface BackgroundSet {
  /** sky gradient stops, top → bottom, CSS hex strings */
  sky: string[];
  /** far → near, drawn behind terrain */
  layers: BgLayer[];
  /** 64x64 tileable texture drawn behind dug-out / cave areas */
  backWall: HTMLCanvasElement;
  /** ambient light color for the realm, 0..1 per channel */
  ambient: [number, number, number];
  /** ambient particle style for screen-space atmosphere */
  atmosphere: 'pollen' | 'snow' | 'embers';
}

export interface Glyph { x: number; y: number; w: number; h: number }

export interface BitmapFont {
  canvas: HTMLCanvasElement;
  glyphs: Record<string, Glyph>;
  lineHeight: number;
}

/** Material atlas layout — see docs/ART_SPEC.md "Material atlas". 1024 x 128 px. */
export const MAT_ATLAS_W = 1024;
export const MAT_ATLAS_H = 128;
export const MAT_TILE = 64;
