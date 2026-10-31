import { MUSPELHEIM } from '../src/levels/muspelheim';
import { describeBossFight } from './bossfight';
import { describeLevels, reportSlack } from './helpers';

describeLevels(MUSPELHEIM);
reportSlack('Muspelheim', MUSPELHEIM);
for (const def of MUSPELHEIM) if (def.boss) describeBossFight(def);
