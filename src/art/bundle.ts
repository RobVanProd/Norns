import type { BackgroundSet, BitmapFont, RealmId, SpriteLib } from './types';

/** Everything the game needs from the procedural art modules. */
export interface ArtBundle {
  sprites: SpriteLib;
  icons: Record<string, HTMLCanvasElement>;
  font: BitmapFont;
  materials: Record<RealmId, HTMLCanvasElement>;
  backgrounds: Record<RealmId, BackgroundSet>;
  logo: HTMLCanvasElement;
  yggdrasil: { canvas: HTMLCanvasElement; realms: Record<RealmId, { x: number; y: number }> };
}
