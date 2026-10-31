import { NIFLHEIM } from '../src/levels/niflheim';
import { describeBossFight } from './bossfight';
import { describeLevels, reportSlack } from './helpers';

describeLevels(NIFLHEIM);
reportSlack('Niflheim', NIFLHEIM);
for (const def of NIFLHEIM) if (def.boss) describeBossFight(def);
