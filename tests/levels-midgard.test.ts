import { MIDGARD } from '../src/levels/midgard';
import { describeBossFight } from './bossfight';
import { describeLevels, reportSlack } from './helpers';

describeLevels(MIDGARD);
reportSlack('Midgard', MIDGARD);
for (const def of MIDGARD) if (def.boss) describeBossFight(def);
