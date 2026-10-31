// The deterministic game simulation. Pure TypeScript, no DOM: runs in the browser, in foresight
// clones, and headless in tests.
import {
  BASH_CYCLE, BLAST_RADIUS, DIG_CYCLE, FALL_DEATH, FALL_VMAX, GLIDE_VMAX, GLIDE_VX, GRAVITY,
  LEAP_VX, LEAP_VY, Mat, MINE_CYCLE, PLANT_TICKS, RUNE_FUSE, SKILLS, STEP_DOWN, STEP_UP,
  WEAVE_CYCLE, WEAVE_PLANKS, WYRD_HEIGHT, isDiggable, isIndestructible, type SkillId,
} from './constants';
import { buildTerrain, type EntityDef, type LevelDef } from './level';
import { isAlive, type SimData, type SimEvent, type SimEventType, type Wyrd, type WyrdState } from './state';
import { Terrain, CS_SHIFT } from './terrain';
import { stepBodies, wakeBodies, bodyImpulse } from './physics';
import { stepSand, activateSand } from './sand';
import { bossStep, createBoss, bossLocksExit } from './boss';

type E<T extends EntityDef['type']> = Extract<EntityDef, { type: T }>;

export interface StaticLevel {
  def: LevelDef;
  w: number;
  h: number;
  entrance: { x: number; y: number; dir: 1 | -1 };
  exit: { x: number; y: number; locked: boolean };
  plates: { id: string; x: number; y: number; w: number }[];
  levers: { id: string; x: number; y: number }[];
  gates: {
    id: string; x: number; y: number; w: number; h: number; orient: 'v' | 'h'; mode: 'any' | 'all'; invert: boolean; speed: number;
    links: { kind: 'plate' | 'lever'; idx: number }[];
  }[];
  vents: E<'vent'>[];
  liquids: E<'water' | 'lava'>[];
  spikes: E<'spikes'>[];
  crushers: E<'crusher'>[];
  firejets: E<'firejet'>[];
  brittles: (E<'brittle'> & { hp: number })[];
  spindle: { x: number; y: number } | null;
  seidr: { x: number; y: number }[];
}

export const SPAWN_START = 40;
const ENTRANCE_DROP = 22;
const DEATH_TICKS: Partial<Record<WyrdState, number>> = { unravel: 12, burn: 10, drown: 10 };
const GROUND_SKILL_STATES: WyrdState[] = ['walk', 'wait', 'weave', 'shrug', 'bash', 'mine', 'dig'];

export { isAlive };

export function buildStatic(def: LevelDef): StaticLevel {
  const L: StaticLevel = {
    def, w: def.width, h: def.height,
    entrance: { x: 40, y: 20, dir: 1 }, exit: { x: def.width - 40, y: def.height - 40, locked: false },
    plates: [], levers: [], gates: [], vents: [], liquids: [], spikes: [], crushers: [], firejets: [],
    brittles: [], spindle: null, seidr: [],
  };
  for (const e of def.entities) {
    switch (e.type) {
      case 'entrance': L.entrance = { x: e.x, y: e.y, dir: e.dir ?? 1 }; break;
      case 'exit': L.exit = { x: e.x, y: e.y, locked: !!e.locked }; break;
      case 'plate': L.plates.push({ id: e.id, x: e.x, y: e.y, w: e.w ?? 14 }); break;
      case 'lever': L.levers.push({ id: e.id, x: e.x, y: e.y }); break;
      case 'vent': L.vents.push(e); break;
      case 'water': case 'lava': L.liquids.push(e); break;
      case 'spikes': L.spikes.push(e); break;
      case 'crusher': L.crushers.push(e); break;
      case 'firejet': L.firejets.push(e); break;
      case 'brittle': L.brittles.push({ ...e, hp: e.hp ?? 45 }); break;
      case 'spindle': L.spindle = { x: e.x, y: e.y }; break;
      case 'seidr': L.seidr.push({ x: e.x, y: e.y }); break;
      default: break;
    }
  }
  for (const e of def.entities) {
    if (e.type !== 'gate') continue;
    const links = e.links.map((id) => {
      const pi = L.plates.findIndex((p) => p.id === id);
      if (pi >= 0) return { kind: 'plate' as const, idx: pi };
      const li = L.levers.findIndex((l) => l.id === id);
      if (li >= 0) return { kind: 'lever' as const, idx: li };
      throw new Error(`gate ${e.id}: unknown link ${id}`);
    });
    L.gates.push({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h, orient: e.orient ?? 'v', mode: e.mode ?? 'any', invert: !!e.invert, speed: e.speed ?? 4, links });
  }
  return L;
}

export class Sim {
  readonly L: StaticLevel;
  terrain: Terrain;
  d: SimData;
  events: SimEvent[] = [];
  /** dynamic solids rebuilt each tick (bodies + frozen wyrdlings) */
  private dyn: number[] = [];
  private wardens: number[] = [];
  private weavers: number[] = [];

  constructor(L: StaticLevel, terrain: Terrain, d: SimData) {
    this.L = L;
    this.terrain = terrain;
    this.d = d;
  }

  static create(def: LevelDef): Sim {
    const L = buildStatic(def);
    const terrain = buildTerrain(def);
    const skills = {} as Record<SkillId, number>;
    for (const s of SKILLS) skills[s] = def.skills[s] ?? 0;
    const d: SimData = {
      tick: 0, rng: def.seed >>> 0, wyrds: [], spawned: 0, saved: 0, dead: 0, skills, used: 0,
      bodies: [], charges: [], gates: L.gates.map(() => ({ open: 0 })), plates: L.plates.map(() => false),
      levers: L.levers.map(() => false), brittle: L.brittles.map((b) => b.hp), broken: L.crushers.map(() => false), spindle: false,
      sandActive: [], boss: null, projectiles: [], hazards: [], idle: 0, finished: false,
    };
    const sim = new Sim(L, terrain, d);
    let bid = 0;
    for (const e of def.entities) {
      if (e.type === 'boulder') d.bodies.push({ id: bid++, x: e.x, y: e.y, vx: 0, vy: 0, r: e.r, a: 0, sleep: 0, gone: false });
    }
    // gates start closed; fill their pixels, then open any whose links say "open" at start
    L.gates.forEach((g, i) => {
      for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) terrain.set(x, y, Mat.Gate);
      if (sim.gateTarget(i)) {
        const len = g.orient === 'v' ? g.h : g.w;
        for (let k = 0; k < len; k++) sim.gateSlice(i, k, Mat.Air);
        d.gates[i].open = len;
      }
    });
    L.brittles.forEach((b) => {
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) terrain.set(x, y, Mat.Brittle);
    });
    if (def.boss) d.boss = createBoss(def.boss);
    // initial sand settle check everywhere sand exists
    for (let ci = 0; ci < terrain.chunks.length; ci++) d.sandActive.push(ci);
    return sim;
  }

  clone(): Sim {
    return new Sim(this.L, this.terrain.clone(), structuredClone(this.d));
  }

  // ------------------------------------------------------------------ queries

  get total(): number {
    return this.L.def.wyrdlings;
  }

  get exitOpen(): boolean {
    return !this.L.exit.locked && !bossLocksExit(this);
  }

  emit(type: SimEventType, x: number, y: number, id?: number, s?: string, v?: number): void {
    this.events.push({ type, x, y, id, s, v });
  }

  rand(): number {
    const a = (this.d.rng + 0x6d2b79f5) >>> 0;
    this.d.rng = a;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  solid(x: number, y: number): boolean {
    if (this.terrain.get(x, y) !== 0) return true;
    const dyn = this.dyn;
    if (dyn.length === 0) return false;
    for (let i = 0; i < dyn.length; i += 4) {
      const kind = dyn[i];
      if (kind === 0) {
        const dx = x - dyn[i + 1], dy = y - dyn[i + 2], r = dyn[i + 3];
        if (dx * dx + dy * dy <= r * r) return true;
      } else if (x >= dyn[i + 1] - 3 && x <= dyn[i + 1] + 3 && y <= dyn[i + 2] && y >= dyn[i + 2] - 10) {
        return true;
      }
    }
    return false;
  }

  /** count of solid pixels stacked upward from (x,y), capped at max+1 */
  private stackHeight(x: number, y: number, max: number): number {
    let k = 0;
    while (k <= max && this.solid(x, y - k)) k++;
    return k;
  }

  liquidAt(x: number, y: number): 'water' | 'lava' | null {
    for (const l of this.L.liquids) {
      if (x >= l.x && x < l.x + l.w && y >= l.y + 2 && y < l.y + l.h) return l.type;
    }
    return null;
  }

  ventOn(v: { boss?: boolean }): boolean {
    return !v.boss || (!!this.d.boss && this.d.boss.hp > 0);
  }

  ventForce(x: number, y: number): number {
    for (const v of this.L.vents) {
      if (!this.ventOn(v)) continue;
      if (x >= v.x && x < v.x + v.w && y <= v.y && y >= v.y - v.h) return v.force ?? 0.22;
    }
    return 0;
  }

  crusherBottom(i: number, tick = this.d.tick): { hb: number; deadly: boolean; warn: boolean } {
    const c = this.L.crushers[i];
    if (this.d.broken[i]) return { hb: c.y - 6, deadly: false, warn: false };
    const cyc = (tick + (c.phase ?? 0)) % c.period;
    const rest = c.period - 36;
    if (cyc < rest) return { hb: c.y, deadly: false, warn: cyc >= rest - 12 };
    const k = cyc - rest;
    if (k < 6) return { hb: c.y + Math.round((c.drop * (k + 1)) / 6), deadly: true, warn: false };
    if (k < 18) return { hb: c.y + c.drop, deadly: true, warn: false };
    return { hb: c.y + c.drop - Math.round((c.drop * (k - 17)) / 18), deadly: false, warn: false };
  }

  firejetState(i: number, tick = this.d.tick): 0 | 1 | 2 {
    const f = this.L.firejets[i];
    if (f.links && f.links.some((id) => this.linkOn(id))) return 0;
    const cyc = (tick + (f.phase ?? 0)) % (f.on + f.off);
    if (cyc < f.on) return 2; // burning
    if (cyc >= f.on + f.off - 15) return 1; // warning flicker
    return 0;
  }

  // ------------------------------------------------------------------ terrain edits

  /** Remove diggable pixels in a rect; returns count removed. */
  carveRect(x0: number, y0: number, x1: number, y1: number, filter?: (x: number, y: number) => boolean): number {
    let n = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (filter && !filter(x, y)) continue;
        const m = this.terrain.get(x, y);
        if (m !== 0 && isDiggable(m) && y >= 0 && y < this.L.h && x >= 0 && x < this.L.w) {
          this.terrain.set(x, y, Mat.Air);
          n++;
        }
      }
    }
    if (n > 0) this.touched(x0, y0, x1, y1);
    return n;
  }

  carveCircle(cx: number, cy: number, r: number): number {
    const r2 = r * r;
    return this.carveRect(Math.floor(cx - r), Math.floor(cy - r), Math.ceil(cx + r), Math.ceil(cy + r), (x, y) => {
      const dx = x - cx, dy = y - cy;
      return dx * dx + dy * dy <= r2;
    });
  }

  /** Notify that terrain changed in a region: wake bodies, re-activate sand. */
  touched(x0: number, y0: number, x1: number, y1: number): void {
    wakeBodies(this, x0 - 2, y0 - 2, x1 + 2, y1 + 2);
    activateSand(this, x0 - 1, y0 - 2, x1 + 1, y1 + 1);
  }

  /** Wake sleeping bodies in a region (without re-activating sand). */
  wake(x0: number, y0: number, x1: number, y1: number): void {
    wakeBodies(this, x0, y0, x1, y1);
  }

  private regionHas(x0: number, y0: number, x1: number, y1: number, pred: (m: number) => boolean): boolean {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    for (let y = y0; y <= y1; y++) for (let x = xa; x <= xb; x++) if (pred(this.terrain.get(x, y))) return true;
    return false;
  }

  // ------------------------------------------------------------------ gates

  /** Is the plate or lever with this id active? */
  linkOn(id: string): boolean {
    const pi = this.L.plates.findIndex((p) => p.id === id);
    if (pi >= 0) return this.d.plates[pi];
    const li = this.L.levers.findIndex((l) => l.id === id);
    return li >= 0 && this.d.levers[li];
  }

  private gateTarget(i: number): boolean {
    const g = this.L.gates[i];
    const vals = g.links.map((l) => (l.kind === 'plate' ? this.d.plates[l.idx] : this.d.levers[l.idx]));
    let on = g.mode === 'all' ? vals.every(Boolean) : vals.some(Boolean);
    if (g.invert) on = !on;
    return on;
  }

  /** Set the k-th slice (row from the bottom for vertical gates, column from the right for horizontal). */
  private gateSlice(i: number, k: number, m: number): void {
    const g = this.L.gates[i];
    if (g.orient === 'v') {
      const y = g.y + g.h - 1 - k;
      for (let x = g.x; x < g.x + g.w; x++) this.terrain.set(x, y, m);
      this.touched(g.x, y, g.x + g.w - 1, y);
    } else {
      const x = g.x + g.w - 1 - k;
      for (let y = g.y; y < g.y + g.h; y++) this.terrain.set(x, y, m);
      this.touched(x, g.y, x, g.y + g.h - 1);
    }
  }

  private sliceBlocked(i: number, k: number): boolean {
    const g = this.L.gates[i];
    const sx0 = g.orient === 'v' ? g.x : g.x + g.w - 1 - k;
    const sx1 = g.orient === 'v' ? g.x + g.w - 1 : sx0;
    const sy0 = g.orient === 'v' ? g.y + g.h - 1 - k : g.y;
    const sy1 = g.orient === 'v' ? sy0 : g.y + g.h - 1;
    for (const w of this.d.wyrds) {
      if (!isAlive(w)) continue;
      if (w.x + 2 >= sx0 && w.x - 2 <= sx1 && w.y >= sy0 && w.y - 10 <= sy1) return true;
    }
    for (const b of this.d.bodies) {
      if (b.gone) continue;
      if (b.x + b.r >= sx0 && b.x - b.r <= sx1 && b.y + b.r >= sy0 && b.y - b.r <= sy1) return true;
    }
    return false;
  }

  private stepGates(): void {
    this.L.gates.forEach((g, i) => {
      const len = g.orient === 'v' ? g.h : g.w;
      const st = this.d.gates[i];
      const want = this.gateTarget(i);
      // gates grind open slowly (only a sustained press opens them) and slam shut quickly
      if (want && st.open < len) {
        if (this.d.tick % g.speed === 0) {
          this.gateSlice(i, st.open, Mat.Air);
          st.open++;
          if (st.open === 1 || st.open === len) this.emit('gate_move', g.x + g.w / 2, g.y + g.h / 2);
        }
      } else if (!want && st.open > 0) {
        for (let k = 0; k < 2 && st.open > 0; k++) {
          if (this.sliceBlocked(i, st.open - 1)) break;
          st.open--;
          this.gateSlice(i, st.open, Mat.Gate);
          if (st.open === len - 1 || st.open === 0) this.emit('gate_move', g.x + g.w / 2, g.y + g.h / 2);
        }
      }
    });
  }

  // ------------------------------------------------------------------ commands

  canAssign(w: Wyrd, skill: SkillId): boolean {
    if (this.d.finished || this.d.skills[skill] <= 0 || !isAlive(w) || w.st === 'frozen') return false;
    const onGround = GROUND_SKILL_STATES.includes(w.st) && this.solid(w.x, w.y + 1);
    switch (skill) {
      case 'climber': return !w.climber;
      case 'glider': return !w.glider;
      case 'digger': return onGround && w.st !== 'dig';
      case 'weaver': return onGround && w.st !== 'weave';
      case 'warden': return onGround;
      case 'basher': return onGround && w.st !== 'bash';
      case 'miner': return onGround && w.st !== 'mine';
      case 'leaper': return onGround && (w.st === 'walk' || w.st === 'wait' || w.st === 'shrug');
      case 'blast': return onGround;
    }
  }

  assign(id: number, skill: SkillId): boolean {
    const w = this.d.wyrds[id];
    if (!w || !this.canAssign(w, skill)) return false;
    this.d.skills[skill]--;
    this.d.used++;
    switch (skill) {
      case 'climber': w.climber = true; break;
      case 'glider': w.glider = true; break;
      case 'digger': this.setSt(w, 'dig'); break;
      case 'weaver': this.setSt(w, 'weave'); w.planks = WEAVE_PLANKS; break;
      case 'warden': this.setSt(w, 'warden'); break;
      case 'basher': this.setSt(w, 'bash'); break;
      case 'miner': this.setSt(w, 'mine'); break;
      case 'leaper': this.setSt(w, 'leap'); break;
      case 'blast': this.setSt(w, 'plant'); break;
    }
    this.emit('assign', w.x, w.y, w.id, skill);
    return true;
  }

  // ------------------------------------------------------------------ main step

  step(): void {
    const d = this.d;
    this.events.length = 0;
    if (d.finished) return;

    // spawn
    if (d.spawned < this.total && d.tick >= SPAWN_START && (d.tick - SPAWN_START) % this.L.def.rate === 0) this.spawn();
    if (d.tick === 0) this.emit('gate_open', this.L.entrance.x, this.L.entrance.y);

    this.stepGates();
    stepBodies(this);

    // dynamic solids + warden list for this tick
    this.dyn.length = 0;
    for (const b of d.bodies) if (!b.gone) this.dyn.push(0, b.x, b.y, b.r);
    this.wardens.length = 0;
    this.weavers.length = 0;
    for (const w of d.wyrds) {
      if (w.st === 'frozen') this.dyn.push(1, w.x, w.y, 0);
      // wardens turn walkers back; walkers wait behind busy weavers (nobody walks off an unfinished bridge)
      else if (w.st === 'warden') this.wardens.push(w.x, w.y, w.id);
      else if (w.st === 'weave' || w.st === 'shrug') this.weavers.push(w.x, w.y, w.id, w.dir);
    }

    for (const w of d.wyrds) if (w.st !== 'gone') this.updateWyrd(w);

    this.stepCharges();
    stepSand(this);
    bossStep(this);
    this.stepTriggers();
    this.checkEnd();
    d.tick++;
  }

  private spawn(): void {
    const e = this.L.entrance;
    const y = e.y + ENTRANCE_DROP;
    const w: Wyrd = {
      id: this.d.spawned, x: e.x, y, fx: e.x, fy: y, vx: 0, vy: 0, dir: e.dir, st: 'fall', t: 0,
      fallY: y, climber: false, glider: false, planks: 0, frozen: 0,
    };
    this.d.wyrds.push(w);
    this.d.spawned++;
    this.emit('spawn', e.x, y, w.id);
  }

  setSt(w: Wyrd, st: WyrdState): void {
    w.st = st;
    w.t = 0;
  }

  startFall(w: Wyrd): void {
    this.setSt(w, 'fall');
    w.vy = 0;
    w.fy = w.y;
    w.fallY = w.y;
  }

  kill(w: Wyrd, how: 'unravel' | 'burn' | 'drown', cause: string): void {
    if (!isAlive(w)) return;
    this.setSt(w, how);
    this.d.dead++;
    this.emit('death', w.x, w.y, w.id, cause);
  }

  fling(w: Wyrd, vx: number, vy: number): void {
    if (!isAlive(w)) return;
    this.setSt(w, 'tumble');
    w.fx = w.x;
    w.fy = w.y;
    w.vx = vx;
    w.vy = vy;
    w.fallY = w.y;
    w.planks = 0;
  }

  freeze(w: Wyrd, ticks: number): void {
    if (!isAlive(w) || w.st === 'frozen') return;
    this.setSt(w, 'frozen');
    w.frozen = ticks;
    this.emit('freeze', w.x, w.y, w.id);
  }

  /** A busy weaver just ahead (or level with us), building the way we're heading. */
  private weaverAhead(w: Wyrd): boolean {
    const ws = this.weavers;
    for (let i = 0; i < ws.length; i += 4) {
      if (ws[i + 2] === w.id || ws[i + 3] !== w.dir) continue;
      const ahead = (ws[i] - w.x) * w.dir;
      if (ahead >= 0 && ahead <= 5 && Math.abs(ws[i + 1] - w.y) <= 8) return true;
    }
    return false;
  }

  private wardenBlocks(w: Wyrd, nx: number, ws = this.wardens): boolean {
    for (let i = 0; i < ws.length; i += 3) {
      if (ws[i + 2] === w.id) continue;
      const wx = ws[i], wy = ws[i + 1];
      if (Math.abs(wy - w.y) > 8) continue;
      const inNow = Math.abs(w.x - wx) <= 4;
      const inNext = Math.abs(nx - wx) <= 4;
      if (inNext && !inNow) return true;
      if (inNow && Math.sign(wx - w.x) === w.dir && w.x !== wx) return true;
    }
    return false;
  }

  /** Move one pixel horizontally with step-up/step-down rules. Returns 'ok' | 'wall' | 'fall'. */
  private walkMove(w: Wyrd): 'ok' | 'wall' | 'fall' {
    const nx = w.x + w.dir;
    const k = this.stackHeight(nx, w.y, STEP_UP);
    if (k > STEP_UP) return 'wall';
    // body clearance at the destination: a low ceiling or a gate hanging just above the floor stops you
    if (k > 0 && this.solid(nx, w.y - k - WYRD_HEIGHT + 2)) return 'wall';
    if (k === 0 && (this.solid(nx, w.y - 3) || this.solid(nx, w.y - 7))) return 'wall';
    w.x = nx;
    w.y -= k;
    if (k === 0 && !this.solid(w.x, w.y + 1)) {
      let d = 1;
      while (d <= STEP_DOWN && !this.solid(w.x, w.y + 1 + d)) d++;
      if (d <= STEP_DOWN) w.y += d;
      else {
        // a Wyrdling is ~8 px wide: it steps across slots 1-2 px wide instead of dropping in
        for (let g = 1; g <= 2; g++) {
          const gx = w.x + w.dir * g;
          if (this.solid(gx, w.y + 1) || this.solid(gx, w.y + 2) || this.solid(gx, w.y)) return 'ok';
        }
        return 'fall';
      }
    }
    return 'ok';
  }

  /** Standing over a 1-2 px slot with ground just ahead or behind (too narrow to fall into). */
  private overSlot(w: Wyrd): boolean {
    if (this.solid(w.x, w.y + 2) || this.solid(w.x, w.y + 3)) return false; // just a step down, not a slot
    for (const off of [1, 2]) {
      if (this.solid(w.x + w.dir * off, w.y + 1) && (this.solid(w.x - w.dir, w.y + 1) || this.solid(w.x - w.dir * 2, w.y + 1))) return true;
    }
    return false;
  }

  /** Unstick a wyrdling whose feet got buried (sand, closing gate). Returns false if crushed. */
  private unbury(w: Wyrd): boolean {
    if (!this.solid(w.x, w.y)) return true;
    for (let k = 1; k <= STEP_UP; k++) {
      if (!this.solid(w.x, w.y - k)) { w.y -= k; return true; }
    }
    this.kill(w, 'unravel', 'buried');
    return false;
  }

  private land(w: Wyrd): void {
    const dist = w.y - w.fallY;
    if (dist > FALL_DEATH && !w.glider) {
      this.kill(w, 'unravel', 'fall');
      return;
    }
    if (dist > 20) {
      this.setSt(w, 'land');
      this.emit('land', w.x, w.y, w.id);
    } else this.setSt(w, 'walk');
  }

  private updateWyrd(w: Wyrd): void {
    const L = this.L;
    switch (w.st) {
      case 'walk': {
        if (!this.unbury(w)) return;
        if (!this.solid(w.x, w.y + 1) && !this.overSlot(w)) { this.startFall(w); break; }
        if (this.wardenBlocks(w, w.x + w.dir)) { w.dir = -w.dir as 1 | -1; break; }
        if (this.weaverAhead(w)) { this.setSt(w, 'wait'); break; }
        const r = this.walkMove(w);
        if (r === 'wall') {
          // rune-iron and gates are too smooth to climb
          const m = this.terrain.get(w.x + w.dir, w.y - 1);
          if (w.climber && !isIndestructible(m)) this.setSt(w, 'climb');
          else w.dir = -w.dir as 1 | -1;
        } else if (r === 'fall') this.startFall(w);
        break;
      }
      case 'wait': {
        if (!this.solid(w.x, w.y + 1)) { this.startFall(w); break; }
        if (!this.weaverAhead(w)) this.setSt(w, 'walk');
        break;
      }
      case 'land':
      case 'shrug': {
        if (!this.solid(w.x, w.y + 1)) { this.startFall(w); break; }
        if (w.t >= (w.st === 'land' ? 2 : 7)) this.setSt(w, 'walk');
        break;
      }
      case 'fall': {
        w.vy = Math.min(w.vy + GRAVITY, FALL_VMAX);
        w.fy += w.vy;
        const target = Math.floor(w.fy);
        let landed = this.solid(w.x, w.y + 1);
        while (!landed && w.y < target) {
          w.y++;
          landed = this.solid(w.x, w.y + 1);
        }
        if (landed) { w.fy = w.y; this.land(w); break; }
        if (w.glider && w.y - w.fallY >= 12) { this.setSt(w, 'glide_open'); w.fx = w.x; }
        break;
      }
      case 'glide_open':
      case 'glide': {
        const vent = this.ventForce(w.x, w.y);
        if (vent > 0) w.vy = Math.max(w.vy - vent, -1.1);
        else if (w.vy > GLIDE_VMAX) w.vy = Math.max(GLIDE_VMAX, w.vy - 0.6);
        else w.vy = Math.min(w.vy + 0.08, GLIDE_VMAX);
        if (w.st === 'glide_open' && w.t >= 3) this.setSt(w, 'glide');
        // horizontal drift
        w.fx += w.dir * GLIDE_VX;
        const tx = Math.round(w.fx);
        if (tx !== w.x) {
          if (this.solid(tx, w.y - 2) || this.solid(tx, w.y - 7)) { w.dir = -w.dir as 1 | -1; w.fx = w.x; }
          else w.x = tx;
        }
        // vertical
        w.fy += w.vy;
        const ty = Math.round(w.fy);
        while (w.y < ty) {
          if (this.solid(w.x, w.y + 1)) break;
          w.y++;
        }
        while (w.y > ty) {
          if (this.solid(w.x, w.y - WYRD_HEIGHT)) { w.vy = 0; break; }
          w.y--;
        }
        if (this.solid(w.x, w.y + 1) && w.vy >= 0) { w.fy = w.y; this.setSt(w, 'walk'); }
        else if (w.y !== ty) w.fy = w.y;
        break;
      }
      case 'climb': {
        const d = w.dir;
        const holdAt = (cx: number) => {
          for (const off of [d, 2 * d]) {
            if (this.solid(cx + off, w.y) || this.solid(cx + off, w.y - 1) || this.solid(cx + off, w.y - 5) || this.solid(cx + off, w.y - 9)) return true;
          }
          return false;
        };
        const freeCol = (cx: number) => {
          for (let yy = w.y - WYRD_HEIGHT; yy <= w.y; yy++) if (this.solid(cx, yy)) return false;
          return true;
        };
        // stay glued to a rough wall: pick the column nearest the wall with room for the body
        let col = -9999;
        for (const cx of [w.x + d, w.x, w.x - d]) {
          if (freeCol(cx) && holdAt(cx)) { col = cx; break; }
        }
        if (col === -9999) {
          const wallNear = holdAt(w.x) || holdAt(w.x + d);
          if (!wallNear) { this.setSt(w, 'hoist'); break; }
          w.dir = -d as 1 | -1;
          this.startFall(w);
          break;
        }
        w.x = col;
        if (w.t % 2 === 1) {
          if (w.y - WYRD_HEIGHT - 1 < 0) { w.dir = -d as 1 | -1; this.startFall(w); break; }
          if (this.solid(w.x, w.y - WYRD_HEIGHT - 1)) {
            // a bump on the wall face: lean out one pixel; a real overhang makes us fall off
            const out = w.x - d;
            let ok = !this.solid(out, w.y - WYRD_HEIGHT - 1);
            for (let yy = w.y - WYRD_HEIGHT; yy <= w.y && ok; yy++) if (this.solid(out, yy)) ok = false;
            if (ok && holdAt(out)) { w.x = out; w.y--; break; }
            w.dir = -d as 1 | -1;
            this.startFall(w);
            break;
          }
          w.y--;
        }
        break;
      }
      case 'hoist': {
        if (w.t >= 7) {
          w.x += w.dir;
          w.y -= 1;
          if (!this.unbury(w)) return;
          this.setSt(w, 'walk');
        }
        break;
      }
      case 'warden': {
        if (!this.solid(w.x, w.y + 1)) this.startFall(w);
        break;
      }
      case 'weave': this.stepWeave(w); break;
      case 'bash': this.stepBash(w); break;
      case 'mine': this.stepMine(w); break;
      case 'dig': this.stepDig(w); break;
      case 'plant': {
        if (w.t === 4) {
          let cy = w.y;
          const cx = w.x + w.dir * 3;
          while (cy < L.h && !this.solid(cx, cy + 1)) cy++;
          this.d.charges.push({ x: cx, y: cy, fuse: RUNE_FUSE, vy: 0 });
          this.emit('rune_plant', cx, cy, w.id);
        }
        if (w.t >= PLANT_TICKS - 1) this.setSt(w, 'walk');
        break;
      }
      case 'leap': {
        if (w.t < 4) {
          if (!this.solid(w.x, w.y + 1)) { this.startFall(w); break; }
          break;
        }
        if (w.t === 4) {
          w.fx = w.x; w.fy = w.y; w.vx = w.dir * LEAP_VX; w.vy = LEAP_VY; w.fallY = w.y;
          this.emit('leap', w.x, w.y, w.id);
        }
        this.ballistic(w);
        break;
      }
      case 'tumble': this.ballistic(w); break;
      case 'frozen': {
        w.frozen--;
        if (w.frozen <= 0) {
          if (this.solid(w.x, w.y + 1)) this.setSt(w, 'walk');
          else this.startFall(w);
        }
        break;
      }
      case 'exit': {
        if (w.t >= 7) w.st = 'gone';
        break;
      }
      case 'unravel':
      case 'burn':
      case 'drown': {
        if (w.st === 'drown' && w.t % 2 === 0) w.y++;
        if (w.t >= (DEATH_TICKS[w.st] ?? 10) - 1) w.st = 'gone';
        break;
      }
      case 'gone': return;
    }
    w.t++;
    if (isAlive(w)) this.hazards(w);
  }

  private ballistic(w: Wyrd): void {
    w.vy = Math.min(w.vy + GRAVITY, FALL_VMAX + 1);
    // horizontal
    w.fx += w.vx;
    const tx = Math.round(w.fx);
    while (w.x !== tx) {
      const nx = w.x + Math.sign(tx - w.x);
      if (this.solid(nx, w.y - 2) || this.solid(nx, w.y - 8)) {
        w.vx = -w.vx * 0.25;
        w.fx = w.x;
        if (w.st === 'leap') w.dir = -w.dir as 1 | -1;
        break;
      }
      // small steps over bumps while skidding
      if (this.solid(nx, w.y)) {
        if (!this.solid(nx, w.y - 1)) w.y--;
        else { w.vx = -w.vx * 0.25; w.fx = w.x; break; }
      }
      w.x = nx;
    }
    // vertical
    w.fy += w.vy;
    const ty = Math.round(w.fy);
    let landed = false;
    while (w.y < ty) {
      if (this.solid(w.x, w.y + 1)) { landed = true; break; }
      w.y++;
    }
    while (w.y > ty) {
      if (this.solid(w.x, w.y - WYRD_HEIGHT)) { w.vy = 0; w.fy = w.y; break; }
      w.y--;
    }
    if (w.vy < 0) w.fallY = Math.min(w.fallY, w.y);
    if (!landed && w.vy >= 0 && this.solid(w.x, w.y + 1)) landed = true;
    if (landed) {
      w.fy = w.y;
      w.vx = 0;
      w.vy = 0;
      this.land(w);
      return;
    }
    if (w.glider && w.vy > 0 && w.y - w.fallY >= 12) {
      this.setSt(w, 'glide_open');
      w.fx = w.x;
      w.fy = w.y;
      w.vy = Math.min(w.vy, 1.5);
    }
  }

  private stepWeave(w: Wyrd): void {
    if (!this.solid(w.x, w.y + 1)) { this.startFall(w); return; }
    const c = w.t % WEAVE_CYCLE;
    if (c === 0) {
      // blocked ahead (wall above step height) or ceiling → stop
      if (this.regionHas(w.x + w.dir, w.y - WYRD_HEIGHT, w.x + w.dir * 2, w.y - 3, (m) => m !== 0) ||
          this.solid(w.x, w.y - WYRD_HEIGHT - 1)) {
        w.dir = -w.dir as 1 | -1;
        this.setSt(w, 'walk');
        return;
      }
    }
    if (c === 8) {
      for (let i = 1; i <= 6; i++) {
        const px = w.x + w.dir * i;
        for (const py of [w.y - 1, w.y]) if (this.terrain.get(px, py) === 0 && px >= 0 && px < this.L.w) this.terrain.set(px, py, Mat.Thread);
      }
      w.planks--;
      this.touched(w.x - 6, w.y - 1, w.x + 6, w.y);
      this.emit('plank', w.x + w.dir * 3, w.y, w.id, undefined, w.planks);
    }
    if (c === 10 || c === 12 || c === 14) {
      const r = this.walkMove(w);
      if (r === 'wall') { w.dir = -w.dir as 1 | -1; this.setSt(w, 'walk'); return; }
      if (r === 'fall') { this.startFall(w); return; }
    }
    if (c === WEAVE_CYCLE - 1 && w.planks <= 0) {
      this.setSt(w, 'shrug');
      this.emit('shrug', w.x, w.y, w.id);
    }
  }

  private stepBash(w: Wyrd): void {
    if (!this.solid(w.x, w.y + 1)) { this.startFall(w); return; }
    const c = w.t % BASH_CYCLE;
    const x0 = w.x + w.dir, x1 = w.x + w.dir * 5;
    if (c === 0) {
      const hasDig = this.regionHas(w.x + w.dir, w.y - 9, w.x + w.dir * 10, w.y, (m) => isDiggable(m));
      const hasHard = this.regionHas(x0, w.y - 9, w.x + w.dir * 3, w.y - 1, (m) => isIndestructible(m));
      if (!hasDig || hasHard) {
        if (hasHard) this.emit('clink', w.x + w.dir * 3, w.y - 5, w.id);
        this.setSt(w, 'walk');
        return;
      }
    }
    if (c % 2 === 0) {
      const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
      const tip = x1;
      const removed = this.carveRect(xa, w.y - 9, xb, w.y, (x, y) => !(x === tip && (y === w.y - 9 || y === w.y)));
      if (removed && c % 8 === 0) this.emit('bash', w.x + w.dir * 4, w.y - 5, w.id);
      if (this.regionHas(x0, w.y - 9, x0, w.y - 1, (m) => m !== 0)) {
        // something hard right in front
        this.emit('clink', w.x + w.dir * 2, w.y - 5, w.id);
        this.setSt(w, 'walk');
        return;
      }
      const r = this.walkMove(w);
      if (r === 'wall') { this.setSt(w, 'walk'); return; }
      if (r === 'fall') { this.startFall(w); return; }
    }
  }

  private stepMine(w: Wyrd): void {
    if (!this.solid(w.x, w.y + 1)) { this.startFall(w); return; }
    const c = w.t % MINE_CYCLE;
    if (c === 0) {
      let hard = false;
      for (let i = 1; i <= 4 && !hard; i++) {
        const cx = w.x + w.dir * i;
        hard = this.regionHas(cx, w.y - 6 + (i >> 1), cx, w.y + 1 + (i >> 1), (m) => isIndestructible(m));
      }
      if (hard) { this.emit('clink', w.x + w.dir * 3, w.y, w.id); this.setSt(w, 'walk'); return; }
    }
    if (c === 4) {
      let n = 0;
      for (let i = 1; i <= 6; i++) {
        const cx = w.x + w.dir * i;
        n += this.carveRect(cx, w.y - 9 + (i >> 1), cx, w.y + (i >> 1));
      }
      if (w.t % 16 === 4) this.emit('mine', w.x + w.dir * 4, w.y, w.id, undefined, n);
    }
    if (c === 6 || c === 7) {
      const nx = w.x + w.dir;
      if (this.stackHeight(nx, w.y, STEP_UP) > 2) { this.setSt(w, 'walk'); return; }
      w.x = nx;
      if (c === 7) w.y++;
      if (!this.unbury(w)) return;
      if (!this.solid(w.x, w.y + 1)) {
        let d = 1;
        while (d <= STEP_DOWN && !this.solid(w.x, w.y + 1 + d)) d++;
        if (d <= STEP_DOWN) w.y += d;
        else { this.startFall(w); return; }
      }
    }
  }

  private stepDig(w: Wyrd): void {
    const c = w.t % DIG_CYCLE;
    if (c % 4 !== 0) return;
    const row = w.y + 1;
    if (this.regionHas(w.x - 1, row, w.x + 1, row, (m) => isIndestructible(m))) {
      this.emit('clink', w.x, row, w.id);
      this.setSt(w, 'walk');
      return;
    }
    if (!this.solid(w.x, row) && !this.regionHas(w.x - 3, row, w.x + 3, row, (m) => m !== 0)) {
      this.startFall(w);
      return;
    }
    this.carveRect(w.x - 4, row, w.x + 4, row);
    if (c === 0) this.emit('dig', w.x, row, w.id);
    w.y++;
    if (row >= this.L.h - 1) { this.startFall(w); return; }
  }

  private hazards(w: Wyrd): void {
    const L = this.L;
    if (w.y >= L.h) {
      w.st = 'gone';
      this.d.dead++;
      this.emit('death', w.x, L.h - 1, w.id, 'void');
      return;
    }
    const liq = this.liquidAt(w.x, w.y);
    if (liq) { this.kill(w, liq === 'lava' ? 'burn' : 'drown', liq); return; }
    for (const s of L.spikes) {
      if (w.x >= s.x && w.x < s.x + s.w && w.y <= s.y && w.y >= s.y - 5) { this.kill(w, 'unravel', 'spikes'); return; }
    }
    for (let i = 0; i < L.firejets.length; i++) {
      const f = L.firejets[i];
      if (this.firejetState(i) !== 2) continue;
      if (Math.abs(w.x - f.x) <= 5 && w.y >= f.y - f.h && w.y - 10 <= f.y) { this.kill(w, 'burn', 'fire'); return; }
    }
    for (let i = 0; i < L.crushers.length; i++) {
      const c = L.crushers[i];
      const cs = this.crusherBottom(i);
      if (cs.deadly && Math.abs(w.x - c.x) <= 11 && w.y >= cs.hb - 16 && w.y - 10 <= cs.hb) { this.kill(w, 'unravel', 'crusher'); return; }
    }
    // exit
    const ex = L.exit;
    if ((w.st === 'walk' || w.st === 'wait' || w.st === 'fall' || w.st === 'glide' || w.st === 'land' || w.st === 'shrug') &&
        Math.abs(w.x - ex.x) <= 3 && w.y <= ex.y + 2 && w.y >= ex.y - 10 && this.exitOpen) {
      this.setSt(w, 'exit');
      w.x = ex.x;
      this.d.saved++;
      this.emit('saved', ex.x, ex.y, w.id, undefined, this.d.saved);
      if (this.d.saved === L.def.quota) this.emit('quota_met', ex.x, ex.y);
    }
    // spindle
    if (L.spindle && !this.d.spindle && Math.abs(w.x - L.spindle.x) <= 6 && w.y >= L.spindle.y - 6 && w.y - 12 <= L.spindle.y) {
      this.d.spindle = true;
      this.emit('spindle', L.spindle.x, L.spindle.y, w.id);
    }
  }

  // ------------------------------------------------------------------ charges, triggers, end

  private stepCharges(): void {
    const d = this.d;
    for (let i = d.charges.length - 1; i >= 0; i--) {
      const c = d.charges[i];
      if (!this.solid(c.x, c.y + 1)) {
        c.vy = Math.min(c.vy + GRAVITY, FALL_VMAX);
        const ty = Math.floor(c.y + c.vy);
        while (c.y < ty && !this.solid(c.x, c.y + 1)) c.y++;
        if (c.y >= this.L.h) { d.charges.splice(i, 1); continue; }
      } else c.vy = 0;
      c.fuse--;
      if (c.fuse % 30 === 0 && c.fuse > 0) this.emit('rune_tick', c.x, c.y, undefined, undefined, c.fuse / 30);
      if (c.fuse <= 0) {
        d.charges.splice(i, 1);
        // centred at body height: blasts open passages without digging deep pits
        this.detonate(c.x, c.y - 8, BLAST_RADIUS);
      }
    }
  }

  detonate(cx: number, cy: number, r: number): void {
    this.carveCircle(cx, cy, r);
    this.emit('blast', cx, cy, undefined, undefined, r);
    bodyImpulse(this, cx, cy, 48, 3.2);
    // runes wreck forge machinery caught in the blast
    this.L.crushers.forEach((c, i) => {
      if (this.d.broken[i]) return;
      const hb = this.crusherBottom(i).hb;
      const dx = c.x - cx, dy = hb - 8 - cy;
      if (dx * dx + dy * dy <= (r + 20) * (r + 20)) {
        this.d.broken[i] = true;
        this.emit('crusher_break', c.x, hb - 8);
      }
    });
    const R = r + 10;
    for (const w of this.d.wyrds) {
      if (!isAlive(w)) continue;
      const dx = w.x - cx, dy = w.y - 5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > R) continue;
      const k = 1 - dist / R;
      const nx = dist > 0.01 ? dx / dist : 0;
      w.dir = (nx === 0 ? w.dir : nx > 0 ? 1 : -1) as 1 | -1;
      this.fling(w, nx * (1 + 2.5 * k), -1.5 - 2.5 * k + Math.min(0, dy / Math.max(dist, 1)));
    }
  }

  private stepTriggers(): void {
    const d = this.d, L = this.L;
    // plates
    L.plates.forEach((p, i) => {
      let on = false;
      for (const w of d.wyrds) {
        if (!isAlive(w) || w.st === 'tumble' || w.st === 'leap') continue;
        if (w.x >= p.x - 1 && w.x < p.x + p.w + 1 && w.y >= p.y - 2 && w.y <= p.y + 1) { on = true; break; }
      }
      if (!on) {
        for (const b of d.bodies) {
          if (b.gone) continue;
          if (b.x + b.r * 0.5 >= p.x && b.x - b.r * 0.5 <= p.x + p.w && b.y + b.r >= p.y - 2 && b.y + b.r <= p.y + 3) { on = true; break; }
        }
      }
      if (on !== d.plates[i]) {
        d.plates[i] = on;
        this.emit(on ? 'plate_on' : 'plate_off', p.x + p.w / 2, p.y);
      }
    });
    // levers latch on first touch
    L.levers.forEach((l, i) => {
      if (d.levers[i]) return;
      for (const w of d.wyrds) {
        if (!isAlive(w)) continue;
        if (Math.abs(w.x - l.x) <= 2 && w.y >= l.y - 4 && w.y <= l.y + 2) {
          d.levers[i] = true;
          this.emit('lever', l.x, l.y);
          break;
        }
      }
    });
    // brittle floors weaken under weight
    L.brittles.forEach((b, i) => {
      if (d.brittle[i] <= 0) return;
      let load = 0;
      for (const w of d.wyrds) {
        if (!isAlive(w)) continue;
        if (w.x >= b.x && w.x < b.x + b.w && w.y + 1 >= b.y && w.y + 1 < b.y + b.h && this.terrain.get(w.x, w.y + 1) === Mat.Brittle) load++;
      }
      for (const body of d.bodies) {
        if (!body.gone && body.x >= b.x && body.x < b.x + b.w && Math.abs(body.y + body.r - b.y) <= 2) load += 3;
      }
      if (load === 0) return;
      const before = d.brittle[i];
      d.brittle[i] = Math.max(0, before - load);
      const third = b.hp / 3;
      if (Math.ceil(before / third) !== Math.ceil(d.brittle[i] / third) && d.brittle[i] > 0) this.emit('brittle_crack', b.x + b.w / 2, b.y);
      if (d.brittle[i] === 0) {
        for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (this.terrain.get(x, y) === Mat.Brittle) this.terrain.set(x, y, Mat.Air);
        this.touched(b.x, b.y, b.x + b.w - 1, b.y + b.h - 1);
        this.emit('brittle_break', b.x + b.w / 2, b.y + b.h / 2, undefined, undefined, b.w);
      }
    });
  }

  private checkEnd(): void {
    const d = this.d;
    if (d.spawned < this.total || d.charges.length > 0) { d.idle = 0; return; }
    for (const w of d.wyrds) {
      if (w.st !== 'gone' && w.st !== 'warden') { d.idle = 0; return; }
    }
    d.idle++;
    if (d.idle >= 45) {
      d.finished = true;
      this.emit('finished', 0, 0);
    }
  }

  /** Player gave up on the remaining wyrdlings. */
  finishNow(): void {
    this.d.finished = true;
  }

  get aliveCount(): number {
    let n = 0;
    for (const w of this.d.wyrds) if (isAlive(w)) n++;
    return n;
  }

  /** Index of the first chunk-aligned region containing (x,y) — used by sand. */
  chunkIndex(x: number, y: number): number {
    return (y >> CS_SHIFT) * this.terrain.cw + (x >> CS_SHIFT);
  }
}
