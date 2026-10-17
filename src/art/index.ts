// Builds every piece of procedural art at startup.
import { buildBackground } from './backgrounds';
import { buildBossSprites } from './bosses';
import type { ArtBundle } from './bundle';
import { buildCharacterSprites } from './characters';
import { buildEntitySprites } from './entities';
import { buildFont } from './font';
import { buildIcons } from './icons';
import { buildMaterialAtlas } from './materials';
import { buildLogo, buildYggdrasil } from './title';
import { REALMS, type BackgroundSet, type RealmId } from './types';
import { addHoodVariants } from './recolor';

export function buildArt(onProgress?: (label: string) => void): ArtBundle {
  const step = <T>(label: string, f: () => T): T => {
    onProgress?.(label);
    return f();
  };
  const sprites = {
    ...step('weaving wyrdlings', buildCharacterSprites),
    ...step('carving runes', buildEntitySprites),
    ...step('waking the giants', buildBossSprites),
  };
  step('dyeing hoods', () => addHoodVariants(sprites));
  const materials = {} as Record<RealmId, HTMLCanvasElement>;
  const backgrounds = {} as Record<RealmId, BackgroundSet>;
  for (const r of REALMS) {
    materials[r] = step(`shaping ${r}`, () => buildMaterialAtlas(r));
    backgrounds[r] = step(`painting ${r} skies`, () => buildBackground(r));
  }
  return {
    sprites,
    icons: step('inking icons', buildIcons),
    font: step('cutting letters', buildFont),
    materials,
    backgrounds,
    logo: step('gilding the title', buildLogo),
    yggdrasil: step('growing Yggdrasil', buildYggdrasil),
  };
}
