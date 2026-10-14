import type { LevelDef, RealmId } from '../sim/level';
import { MIDGARD } from './midgard';

export interface RealmInfo {
  id: RealmId;
  name: string;
  subtitle: string;
  levels: LevelDef[];
}

export const REALM_LIST: RealmInfo[] = [
  { id: 'midgard', name: 'Midgard', subtitle: 'The Middle Meadows', levels: MIDGARD },
];

export const ALL_LEVELS: LevelDef[] = REALM_LIST.flatMap((r) => r.levels);
