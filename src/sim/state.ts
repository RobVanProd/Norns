// Plain-data simulation state. Everything here must survive structuredClone (no classes,
// no functions) because foresight and rewind clone it constantly.
import type { SkillId } from './constants';

export type WyrdState =
  | 'walk' | 'wait' | 'fall' | 'land' | 'glide_open' | 'glide' | 'climb' | 'hoist'
  | 'warden' | 'weave' | 'shrug' | 'bash' | 'mine' | 'dig' | 'plant'
  | 'leap' | 'tumble' | 'frozen' | 'exit'
  | 'unravel' | 'burn' | 'drown' | 'gone';

export interface Wyrd {
  id: number;
  x: number;
  y: number;
  fx: number;
  fy: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  st: WyrdState;
  t: number;
  /** fall start y (for fall damage) */
  fallY: number;
  climber: boolean;
  glider: boolean;
  planks: number;
  frozen: number;
}

export interface Body {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  sleep: number;
  gone: boolean;
}

export interface Charge {
  x: number;
  y: number;
  fuse: number;
  vy: number;
}

export interface GateState {
  open: number;
}

export type ProjectileKind = 'venom' | 'icicle' | 'fireball' | 'meteor';

export interface Projectile {
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  /** predicted landing point (for telegraph markers) */
  tx: number;
  ty: number;
  gone: boolean;
}

export type HazardKind = 'burrow' | 'lash' | 'breath' | 'slam' | 'shock' | 'sweep' | 'magma' | 'beam';

/** A telegraphed area effect owned by a boss. `warn` ticks of telegraph, then `dur` ticks active. */
export interface Hazard {
  kind: HazardKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  warn: number;
  dur: number;
  dir: number;
  /** generic parameter (shockwave front, magma level, beam target...) */
  p: number;
  gone: boolean;
}

export interface BossState {
  kind: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  /** current action name and its timer */
  act: string;
  at: number;
  /** cooldown until next attack */
  cd: number;
  /** index into the attack pattern rotation */
  seq: number;
  /** hurt flash timer */
  hurt: number;
  /** index of the active Seiðr stone (-1 none) */
  stone: number;
  /** how many stones have lit so far: the position in the fixed stone order of the next one to light */
  ring: number;
  /** stone cooldown after firing */
  stoneCd: number;
  /** defeat animation timer (0 = alive) */
  dying: number;
}

/** Every event the simulation emits. The view's effects and the sound map key on these names, so a
 *  renamed or retired event is a type error there rather than a silent miss. */
export type SimEventType =
  // Wyrdlings
  | 'spawn' | 'assign' | 'death' | 'freeze' | 'land' | 'leap' | 'saved' | 'quota_met' | 'shrug' | 'bowled'
  // callings at work
  | 'dig' | 'bash' | 'mine' | 'clink' | 'plank' | 'rune_plant' | 'rune_tick' | 'blast'
  // the level
  | 'gate_open' | 'gate_move' | 'plate_on' | 'plate_off' | 'lever' | 'spindle' | 'crusher_break'
  | 'brittle_crack' | 'brittle_break' | 'boulder_impact' | 'boulder_roll' | 'stone_harden' | 'sand' | 'finished'
  // guardians: stones, attacks and the telegraphed hazards they leave (named when their warning ends)
  | 'seidr_on' | 'seidr_beam' | 'boss_telegraph' | 'boss_hit' | 'boss_defeat' | 'venom_spit' | 'venom_hit' | 'burrow'
  | 'icicle_warn' | 'ice_shatter' | 'inhale' | 'slam' | 'magma_warn' | 'meteor' | `hazard_${HazardKind}`;

export interface SimEvent {
  type: SimEventType;
  x: number;
  y: number;
  /** wyrdling id or other integer payload */
  id?: number;
  /** extra payload */
  s?: string;
  v?: number;
}

export interface SimData {
  tick: number;
  rng: number;
  wyrds: Wyrd[];
  spawned: number;
  saved: number;
  dead: number;
  skills: Record<SkillId, number>;
  used: number;
  bodies: Body[];
  charges: Charge[];
  gates: GateState[];
  plates: boolean[];
  levers: boolean[];
  brittle: number[];
  /** crushers wrecked by rune blasts */
  broken: boolean[];
  spindle: boolean;
  sandActive: number[];
  boss: BossState | null;
  projectiles: Projectile[];
  hazards: Hazard[];
  /** consecutive ticks the "nothing more can happen" condition has held */
  idle: number;
  finished: boolean;
}

export function isAlive(w: Wyrd): boolean {
  return w.st !== 'gone' && w.st !== 'unravel' && w.st !== 'burn' && w.st !== 'drown' && w.st !== 'exit';
}
