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
  /** stone cooldown after firing */
  stoneCd: number;
  /** defeat animation timer (0 = alive) */
  dying: number;
  /** free-form numeric memory for the specific boss (positions, targets) */
  m: number[];
}

export interface SimEvent {
  type: string;
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
