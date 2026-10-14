import type { LevelDef, RealmId } from '../sim/level';
import { MIDGARD } from './midgard';
import { NIFLHEIM } from './niflheim';

export interface RealmInfo {
  id: RealmId;
  name: string;
  subtitle: string;
  levels: LevelDef[];
}

export const REALM_LIST: RealmInfo[] = [
  { id: 'midgard', name: 'Midgard', subtitle: 'The Middle Meadows', levels: MIDGARD },
  { id: 'niflheim', name: 'Niflheim', subtitle: 'The Mist-Realm of Rime', levels: NIFLHEIM },
];

export const ALL_LEVELS: LevelDef[] = REALM_LIST.flatMap((r) => r.levels);
