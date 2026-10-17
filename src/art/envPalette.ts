// Environment + boss color ramps (owned by the environment artist; character colors live in
// palette.ts). Every ramp is dark → light and hand-tuned with hue shifting: shadows drift toward
// blue/violet, highlights toward warm yellow. Terrain body tones are kept in the mid-values so
// the small bright Wyrdlings (teal hood, pale face, indigo cloak) stay readable on top.

import { hex, type Color } from './px';
import type { RealmId } from './types';

const R = (...h: string[]): Color[] => h.map((s) => hex(s));

export interface MatPal {
  /** body ramp, dark → light (6–8 shades) */
  body: Color[];
  /** secondary ramp (moss, frost, glow, rivets …) */
  alt: Color[];
  /** outline: dark, saturated */
  outline: Color;
  /** edge highlight for top-left facing edges */
  hi: Color;
  /** edge shadow for bottom-right facing edges */
  sh: Color;
  /** debris particle colors */
  debris: [Color, Color];
}

export interface RealmPal {
  earth: MatPal;
  /** top cap of earth: grass / frost crust / char */
  earthTop: Color[];
  rock: MatPal;
  iron: MatPal;
  /** rune glow ramp used on rune-iron (dim → bright) */
  ironRune: Color[];
  sand: MatPal;
  ice: MatPal;
  thread: MatPal;
  brittle: MatPal;
  gate: MatPal;
  /** gate rune band glow (shared amber-red family so gates read as barriers in every realm) */
  gateRune: Color[];
  root: MatPal;
  /** pebble / stone inclusions inside earth */
  pebble: Color[];
  /** foliage for surface decoration */
  leaf: Color[];
  /** accent colors for flowers / crystals / embers */
  accent: Color[];
  /** back wall ramp (dark, desaturated) */
  wall: Color[];
}

const THREAD: MatPal = {
  body: R('#5c3410', '#8a5418', '#b67b22', '#d9a032', '#f0bf48', '#f8d978', '#fff0b8'),
  alt: R('#7a3c12', '#c06a1c', '#ffe9a0'),
  outline: hex('#4a240c'),
  hi: hex('#fff3c4'),
  sh: hex('#8a4c16'),
  debris: [hex('#f2c14e'), hex('#fff0b8')],
};

const GATE_RUNE = R('#5a1010', '#9a1c14', '#d8381c', '#ff6a2a', '#ffae5a', '#ffe2a8');

export const ENV: Record<RealmId, RealmPal> = {
  // ---------------------------------------------------------------- Midgard: dawn, loam, moss
  midgard: {
    earth: {
      body: R('#24151c', '#3a2222', '#52302a', '#6a4132', '#82543c', '#9a6a48', '#b4865c'),
      alt: R('#2c1a1a', '#4a2c26', '#6e4a3a'),
      outline: hex('#1e1018'),
      hi: hex('#b88a60'),
      sh: hex('#2e1a20'),
      debris: [hex('#6a4132'), hex('#9a6a48')],
    },
    earthTop: R('#173226', '#21482c', '#2f6232', '#477e36', '#66993c', '#8cb446', '#b6cc5c'),
    rock: {
      body: R('#1f2230', '#2f3442', '#434a58', '#59616c', '#6f7880', '#8a9296', '#a9b0ac'),
      alt: R('#22381e', '#34522a', '#4c6e32', '#6c8c3a', '#92aa4c'),
      outline: hex('#181a28'),
      hi: hex('#b4bab2'),
      sh: hex('#262a3a'),
      debris: [hex('#59616c'), hex('#8a9296')],
    },
    iron: {
      body: R('#0f1220', '#191e32', '#252c46', '#333d5c', '#465274', '#5e6c8e', '#7e8eac', '#a8b6cc'),
      alt: R('#2a2430', '#6a5a52', '#a89070', '#e0caa0'),
      outline: hex('#0a0c18'),
      hi: hex('#9aaac4'),
      sh: hex('#141828'),
      debris: [hex('#465274'), hex('#7e8eac')],
    },
    ironRune: R('#2a3c78', '#3e5cb0', '#6a8ee0', '#a8c4ff'),
    sand: {
      body: R('#5a4430', '#76593c', '#927246', '#ac8a54', '#c2a064', '#d4b67a', '#e6cc96'),
      alt: R('#4a3a2c', '#8a6e48', '#f0dcae'),
      outline: hex('#3e2c24'),
      hi: hex('#ecd6a2'),
      sh: hex('#6a503a'),
      debris: [hex('#c2a064'), hex('#e6cc96')],
    },
    ice: {
      body: R('#1e2c58', '#283e76', '#345490', '#486ea8', '#628ac0', '#84a8d4', '#b2cce6', '#e2eef8'),
      alt: R('#f4fbff', '#cfe2f4', '#6a8ec4'),
      outline: hex('#18204a'),
      hi: hex('#d8e8f6'),
      sh: hex('#22346a'),
      debris: [hex('#84a8d4'), hex('#e2eef8')],
    },
    thread: THREAD,
    brittle: {
      body: R('#3a2a2c', '#56403a', '#725848', '#8c7058', '#a4886a', '#baa080', '#cdb698'),
      alt: R('#22161e', '#3a2628', '#5a4038'),
      outline: hex('#24161c'),
      hi: hex('#d4c0a0'),
      sh: hex('#40302e'),
      debris: [hex('#8c7058'), hex('#baa080')],
    },
    gate: {
      body: R('#0c0e18', '#161a28', '#22283a', '#30384e', '#424c66', '#58647e', '#7a869c', '#a2acbc'),
      alt: R('#1a1418', '#3a2a24', '#6a5440'),
      outline: hex('#08090f'),
      hi: hex('#8a96aa'),
      sh: hex('#10121c'),
      debris: [hex('#424c66'), hex('#7a869c')],
    },
    gateRune: GATE_RUNE,
    root: {
      body: R('#1a1614', '#2a241e', '#3c3428', '#504634', '#665a42', '#7e7254', '#9a8e6c', '#b8ae8a'),
      alt: R('#10100e', '#3e5a28', '#5e7e34', '#86a244'),
      outline: hex('#14100e'),
      hi: hex('#aaa080'),
      sh: hex('#221c18'),
      debris: [hex('#504634'), hex('#7e7254')],
    },
    pebble: R('#2a2430', '#433c46', '#5e5660', '#7c7478', '#9c948e', '#bab2a4'),
    leaf: R('#163024', '#1f4a2c', '#2e6832', '#468638', '#68a23e', '#94bc4a', '#c2d464'),
    accent: R('#c84a50', '#f08a6a', '#f6d860', '#f4f0dc', '#a888e0'),
    wall: R('#3a2a2e', '#463232', '#543c38', '#62483e', '#705446', '#806250'),
  },

  // ---------------------------------------------------------------- Niflheim: night, frost, ice
  niflheim: {
    earth: {
      body: R('#1a1824', '#282434', '#363044', '#463e54', '#584e66', '#6c6078', '#84788e'),
      alt: R('#1a1824', '#2c2838', '#4a4458'),
      outline: hex('#0e0c18'),
      hi: hex('#9aa8c2'),
      sh: hex('#1a1626'),
      debris: [hex('#4e4458'), hex('#9aa8c2')],
    },
    earthTop: R('#3a4a6a', '#56688a', '#7486a8', '#94a8c4', '#b6c8de', '#d4e2f0', '#eef5fc'),
    rock: {
      body: R('#141c2c', '#1e2a3e', '#2a3a52', '#384a64', '#4a5e78', '#5e748c', '#7a90a4', '#9cb0c0'),
      alt: R('#7a92b2', '#a4bcd6', '#cadcee', '#eef6ff'),
      outline: hex('#0c1220'),
      hi: hex('#aac0d6'),
      sh: hex('#16202e'),
      debris: [hex('#4a5e78'), hex('#cadcee')],
    },
    iron: {
      body: R('#0c1120', '#141c32', '#1e2a48', '#2a3a5e', '#3c4e76', '#52668e', '#7086a8', '#9aaec8'),
      alt: R('#202a40', '#4a5a78', '#90a4c0', '#d8e6f6'),
      outline: hex('#080c18'),
      hi: hex('#9ab0cc'),
      sh: hex('#101628'),
      debris: [hex('#3c4e76'), hex('#7086a8')],
    },
    ironRune: R('#1e4a70', '#2e78a8', '#5ab4e0', '#b0eaff'),
    sand: {
      body: R('#5a6a8a', '#70829e', '#8a9cb6', '#a2b4cc', '#b8c8dc', '#ccd8e8', '#e2eaf4'),
      alt: R('#4a5878', '#f2f7fc', '#ffffff'),
      outline: hex('#3a4666'),
      hi: hex('#f0f6fc'),
      sh: hex('#5e6e8e'),
      debris: [hex('#ccd8e8'), hex('#f2f7fc')],
    },
    ice: {
      body: R('#16285a', '#1e3a78', '#2a5294', '#3c6cb0', '#5888c6', '#7aa6d8', '#a6c8e8', '#dcecfa'),
      alt: R('#f4fbff', '#c8e0f6', '#6a92cc'),
      outline: hex('#101c48'),
      hi: hex('#d6eaf8'),
      sh: hex('#1a2e66'),
      debris: [hex('#7aa6d8'), hex('#dcecfa')],
    },
    thread: THREAD,
    brittle: {
      body: R('#46506a', '#5e6a86', '#7884a0', '#929eb8', '#acb8cc', '#c4cede', '#d8e0ec'),
      alt: R('#121830', '#28304a', '#f0f6fe'),
      outline: hex('#141a30'),
      hi: hex('#e4ecf6'),
      sh: hex('#3a4460'),
      debris: [hex('#929eb8'), hex('#d8e0ec')],
    },
    gate: {
      body: R('#0a0e1a', '#121828', '#1c2438', '#28324c', '#384662', '#4c5c7a', '#6c7c98', '#96a4bc'),
      alt: R('#1a1418', '#3a2a24', '#6a5440'),
      outline: hex('#06080f'),
      hi: hex('#8a9cb8'),
      sh: hex('#0e1220'),
      debris: [hex('#384662'), hex('#6c7c98')],
    },
    gateRune: GATE_RUNE,
    root: {
      body: R('#14141c', '#20202a', '#2e2e38', '#3e3e48', '#52525a', '#686870', '#82848a', '#a0a4aa'),
      alt: R('#0c0c12', '#9ab0c8', '#c8d8ea', '#eef6ff'),
      outline: hex('#0c0c14'),
      hi: hex('#a8b4c4'),
      sh: hex('#1a1a24'),
      debris: [hex('#52525a'), hex('#c8d8ea')],
    },
    pebble: R('#1a1e2c', '#2a3040', '#3c4456', '#525c6e', '#6c7688', '#8a94a4'),
    leaf: R('#1a2a3a', '#2a4050', '#3e5a68', '#5a7a84', '#86a2aa', '#b8ccd2', '#e4eef2'),
    accent: R('#5ad8ff', '#a8f0ff', '#e8fcff', '#c8a8ff', '#ffffff'),
    wall: R('#242838', '#2c3244', '#363e52', '#404a60', '#4c566c', '#58647a'),
  },

  // ---------------------------------------------------------------- Muspelheim: ash, basalt, fire
  muspelheim: {
    earth: {
      body: R('#140c0e', '#22141a', '#321c1e', '#442622', '#58302a', '#6c3e30', '#844e38'),
      alt: R('#1a0e10', '#2a1416', '#4a2018'),
      outline: hex('#0c0608'),
      hi: hex('#a86040'),
      sh: hex('#1c0e12'),
      debris: [hex('#58302a'), hex('#ff8a3a')],
    },
    earthTop: R('#100a0c', '#1c1214', '#2a1a1a', '#3a2420', '#7a2a14', '#c44a16', '#ff8a2a'),
    rock: {
      body: R('#0e0c12', '#18141c', '#221c26', '#2e2632', '#3c3240', '#4c404e', '#5e5060', '#766674'),
      alt: R('#5a0e08', '#a8240c', '#e8561a', '#ff9a34', '#ffd468'),
      outline: hex('#08060a'),
      hi: hex('#8a6a6e'),
      sh: hex('#120e16'),
      debris: [hex('#3c3240'), hex('#ff8a3a')],
    },
    iron: {
      body: R('#0e0a10', '#18121a', '#241c26', '#322834', '#443644', '#584858', '#706070', '#90808c'),
      alt: R('#2a1a14', '#6a3a24', '#b07a50', '#e8c090'),
      outline: hex('#080508'),
      hi: hex('#9a8894'),
      sh: hex('#120c14'),
      debris: [hex('#443644'), hex('#706070')],
    },
    ironRune: R('#6a1408', '#b8300e', '#ff6a1a', '#ffc860'),
    sand: {
      body: R('#2a2426', '#3a3234', '#4c4244', '#5e5254', '#726466', '#887a78', '#a09290'),
      alt: R('#1e181a', '#ff6a1a', '#ffb048'),
      outline: hex('#1a1416'),
      hi: hex('#aa9c98'),
      sh: hex('#2e2628'),
      debris: [hex('#5e5254'), hex('#ff8a3a')],
    },
    ice: {
      body: R('#0c0814', '#160e22', '#221634', '#30204a', '#42305e', '#584278', '#765a96', '#a088c0'),
      alt: R('#e8d8ff', '#b8a0e0', '#ff8a4a'),
      outline: hex('#08050e'),
      hi: hex('#b49ad6'),
      sh: hex('#140c20'),
      debris: [hex('#42305e'), hex('#a088c0')],
    },
    thread: THREAD,
    brittle: {
      body: R('#1e1210', '#2e1a16', '#40241c', '#543024', '#683c2c', '#7e4c36', '#946042'),
      alt: R('#3a0808', '#9a1e0a', '#e8501a', '#ffa040'),
      outline: hex('#120a0a'),
      hi: hex('#a66a48'),
      sh: hex('#22140e'),
      debris: [hex('#543024'), hex('#ff8a3a')],
    },
    gate: {
      body: R('#0a080c', '#141016', '#1e1820', '#2a222c', '#3a303c', '#4c404e', '#665866', '#8a7c88'),
      alt: R('#1a1418', '#3a2a24', '#6a5440'),
      outline: hex('#060406'),
      hi: hex('#8a7a86'),
      sh: hex('#0e0a10'),
      debris: [hex('#3a303c'), hex('#665866')],
    },
    gateRune: GATE_RUNE,
    root: {
      body: R('#120c0c', '#1e1414', '#2c1e1c', '#3c2824', '#4e342e', '#62423a', '#7a5448', '#94685a'),
      alt: R('#0a0606', '#8a1e0a', '#e0561a', '#ffb048'),
      outline: hex('#0a0606'),
      hi: hex('#a07060'),
      sh: hex('#180e0e'),
      debris: [hex('#3c2824'), hex('#ff8a3a')],
    },
    pebble: R('#100c12', '#1c161e', '#2a222c', '#3a303a', '#4c404a', '#62545e'),
    leaf: R('#1a1210', '#2a1c18', '#3c2a22', '#523a2c', '#6a4c38', '#86624a', '#a07a5a'),
    accent: R('#ff4a1a', '#ff8a2a', '#ffc850', '#fff0b0', '#ff3a6a'),
    wall: R('#2a1c20', '#342226', '#40282a', '#4c3030', '#583836', '#66423c'),
  },
};

// ---------------------------------------------------------------- boss + title palettes

export const BOSS = {
  // The Gnawing Wyrm: dusky violet scales, bone horns, acid venom
  wyrmScale: R('#1a0f22', '#2a1832', '#3e2244', '#542e56', '#6c3c66', '#884e74', '#a6667e', '#c4848a'),
  wyrmBelly: R('#3a2a24', '#5e4634', '#86683e', '#aa8c4e', '#c8ac66', '#e0ca8a', '#f2e4b4'),
  bone: R('#3a2e2c', '#5e5046', '#86765e', '#ac9c7e', '#cec0a0', '#e8dec4', '#fbf6e6'),
  venom: R('#0e3a18', '#1a6a1e', '#3aa21e', '#7ad21e', '#b8f03a', '#eaff8a', '#fbffe0'),
  mouth: R('#1a0610', '#3a0c1a', '#5e1426', '#862236', '#aa3a44'),
  // Hrímgrímnir: frost-blue skin, glacier armour, grey fur, rime beard
  frostSkin: R('#181a34', '#282c50', '#3a426a', '#505c84', '#6a789c', '#8896b4', '#acb8cc', '#d6dce8'),
  glacier: R('#16306a', '#1e4a8e', '#2c6aae', '#4a90cc', '#74b4e2', '#a2d4f0', '#d2eefa', '#f6fdff'),
  fur: R('#1a1418', '#2a2226', '#3c3234', '#524644', '#6a5c56', '#86786c', '#a49684'),
  rime: R('#3a4c74', '#56709a', '#7896bc', '#a0bcd8', '#c8dcee', '#e8f2fa', '#ffffff'),
  frostGlow: R('#2a6aa8', '#4ab0e8', '#8ee2ff', '#d4f8ff', '#ffffff'),
  // Surtr's Herald: obsidian armour, molten seams, fire
  obsidian: R('#0a070c', '#140e18', '#1e1626', '#2a2034', '#382c44', '#4a3a58', '#5e4c70', '#7c6890'),
  ember: R('#3a0a08', '#6e140a', '#a8240c', '#e0441a', '#ff7a26', '#ffb040', '#ffe070', '#fff8d0'),
  flame: R('#5a0e0a', '#a8200c', '#e8481a', '#ff7c22', '#ffaa36', '#ffd458', '#fff0a0', '#fffde8'),
  cloth: R('#1a080c', '#2e0c12', '#48121a', '#661c22', '#842a2a', '#a43c32'),
};

export const TITLE = {
  gold: R('#3a1e0c', '#5e3410', '#8a5216', '#b47422', '#d89a32', '#f0bc4a', '#fad874', '#fff2b4', '#fffbe8'),
  stone: R('#141420', '#1e1e2e', '#2a2a3e', '#38384e', '#4a4a60', '#5e5e74', '#76768a', '#9494a4'),
  thread: R('#6a2a0a', '#b8641a', '#f2c14e', '#ffe48a', '#fff8d8'),
  bark: R('#140e10', '#22181a', '#322424', '#44302c', '#583e34', '#6e4e3e', '#86624a', '#a07c5a'),
  canopy: R('#0a121c', '#0f1e26', '#152c30', '#1c3e36', '#27523c', '#366844', '#4e824c', '#72a056', '#a6c46a'),
};
