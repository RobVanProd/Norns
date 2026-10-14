// Simulation constants. The simulation is deterministic: it only uses integer/float arithmetic that
// is IEEE-exact across engines (+ - * / sqrt), never Math.random / sin / cos / pow / exp.

export const TICK_RATE = 30; // simulation ticks per second

export const Mat = {
  Air: 0,
  Earth: 1,
  Rock: 2,
  Iron: 3, // indestructible
  Sand: 4, // granular
  Ice: 5,
  Thread: 6, // weaver planks
  Brittle: 7,
  Gate: 8, // indestructible, entity-controlled
  Root: 9,
} as const;
export type MatName = keyof typeof Mat;

export const MAT_COUNT = 10;

/** Can skills / blasts remove this material? */
export function isDiggable(m: number): boolean {
  return m !== 0 && m !== Mat.Iron && m !== Mat.Gate;
}

export function isIndestructible(m: number): boolean {
  return m === Mat.Iron || m === Mat.Gate;
}

export const SKILLS = ['digger', 'weaver', 'warden', 'basher', 'miner', 'climber', 'glider', 'leaper', 'blast'] as const;
export type SkillId = (typeof SKILLS)[number];

export const SKILL_INFO: Record<SkillId, { name: string; key: string; desc: string }> = {
  digger: { name: 'Digger', key: '1', desc: 'Digs straight down through soft ground.' },
  weaver: { name: 'Weaver', key: '2', desc: 'Weaves 12 golden planks: a rising bridge.' },
  warden: { name: 'Warden', key: '3', desc: 'Stands firm and turns others back.' },
  basher: { name: 'Basher', key: '4', desc: 'Tunnels straight ahead.' },
  miner: { name: 'Miner', key: '5', desc: 'Tunnels diagonally downward.' },
  climber: { name: 'Climber', key: '6', desc: 'Permanent: scales vertical walls (not smooth rune-iron).' },
  glider: { name: 'Glider', key: '7', desc: 'Permanent: glides safely from any height, rides updrafts.' },
  leaper: { name: 'Leaper', key: '8', desc: 'One big jump forward over a gap.' },
  blast: { name: 'Rune Blast', key: '9', desc: 'Plants a rune that bursts 3 s later, carving rock and flinging things. The planter walks on.' },
};

// Wyrdling movement
export const STEP_UP = 6; // max height a walker climbs in one step
export const STEP_DOWN = 3; // max drop a walker follows without falling
export const FALL_DEATH = 64; // fall distance (px) that is fatal on landing
export const GRAVITY = 0.25; // px/tick^2
export const FALL_VMAX = 4; // px/tick
export const GLIDE_VMAX = 0.6;
export const GLIDE_VX = 0.5;
export const WYRD_HEIGHT = 11;

// Skills
export const WEAVE_PLANKS = 12;
export const WEAVE_CYCLE = 16;
export const BASH_CYCLE = 16;
export const MINE_CYCLE = 8;
export const DIG_CYCLE = 8;
export const PLANT_TICKS = 8;
export const RUNE_FUSE = 90;
export const BLAST_RADIUS = 13;
export const LEAP_VX = 1.6;
export const LEAP_VY = -3.2;

// Bodies
export const BODY_GRAVITY = 0.2;
export const BODY_CRUSH_SPEED = 1.3;
