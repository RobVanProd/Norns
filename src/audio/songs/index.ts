import type { SongDef } from '../notation';
import type { SongId } from '../types';
import { boss } from './boss';
import { finale } from './finale';
import { map } from './map';
import { midgard } from './midgard';
import { muspelheim } from './muspelheim';
import { niflheim } from './niflheim';
import { title } from './title';

export { STINGER_DEFS } from './stingers';

export const SONG_DEFS: Record<SongId, SongDef> = { title, map, midgard, niflheim, muspelheim, boss, finale };
