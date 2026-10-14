// Level definitions (authoring format) and rasterisation into terrain.
import { Mat, type MatName, type SkillId } from './constants';
import { Terrain } from './terrain';
import { noise1, noise2 } from './rng';

export type RealmId = 'midgard' | 'niflheim' | 'muspelheim';

type Pt = [number, number];

interface ShapeBase {
  /** material to paint, 'Air' carves */
  mat: MatName;
  /** edge roughness in px (noise-displaced boundary) */
  rough?: number;
  /** noise feature size in px (default 10) */
  grain?: number;
  seed?: number;
  /** paint the static back wall only (no collision) */
  back?: boolean;
  /** don't add a back wall behind this solid (open-air terrain) */
  noBack?: boolean;
  /** only replace pixels of these materials (for veins/overlays) */
  only?: MatName[];
}

export type TerrainOp =
  | (ShapeBase & { op: 'rect'; x: number; y: number; w: number; h: number })
  | (ShapeBase & { op: 'ellipse'; x: number; y: number; rx: number; ry: number })
  | (ShapeBase & { op: 'poly'; pts: Pt[] })
  /** surface polyline filled downward to `bottom` (default: level bottom) */
  | (ShapeBase & { op: 'ground'; pts: Pt[]; bottom?: number })
  /** surface polyline filled upward to `top` (default 0) */
  | (ShapeBase & { op: 'ceiling'; pts: Pt[]; top?: number });

export type EntityDef =
  | { type: 'entrance'; x: number; y: number; dir?: 1 | -1 }
  | { type: 'exit'; x: number; y: number; locked?: boolean }
  | { type: 'boulder'; x: number; y: number; r: number }
  | { type: 'plate'; id: string; x: number; y: number; w?: number }
  | { type: 'lever'; id: string; x: number; y: number }
  | {
      type: 'gate'; id: string; x: number; y: number; w: number; h: number; links: string[];
      mode?: 'any' | 'all'; invert?: boolean; orient?: 'v' | 'h';
      /** ticks per slice while opening (default 4: only a sustained press opens a gate) */ speed?: number;
    }
  | { type: 'vent'; x: number; y: number; w: number; h: number; force?: number; /** only blows while the boss lives */ boss?: boolean }
  | { type: 'water' | 'lava'; x: number; y: number; w: number; h: number }
  | { type: 'spikes'; x: number; y: number; w: number }
  | { type: 'crusher'; x: number; y: number; drop: number; period: number; phase?: number }
  | {
      type: 'firejet'; x: number; y: number; h: number; on: number; off: number; phase?: number;
      /** levers/plates that cut the gas (jet is dead while any is active) */ links?: string[];
    }
  | { type: 'brittle'; x: number; y: number; w: number; h: number; hp?: number }
  | { type: 'spindle'; x: number; y: number }
  | { type: 'seidr'; x: number; y: number }
  | { type: 'light'; x: number; y: number; r: number; color: string; flicker?: number }
  | { type: 'decor'; sprite: string; x: number; y: number; flip?: boolean };

export type BossKind = 'wyrm' | 'jotunn' | 'herald';

export interface BossDef {
  kind: BossKind;
  x: number;
  y: number;
  hp: number;
  /** ticks before the first attack */
  delay?: number;
  /** arena bounds the boss targets within */
  arena: { x0: number; x1: number; floorY: number };
}

/** A scripted assignment used by the test-suite to prove a level is solvable. */
export interface SolutionStep {
  skill: SkillId;
  /** spawn index of the wyrdling (0 = first out) */
  nth: number;
  /** earliest tick */
  t?: number;
  /** fire once the wyrdling has reached/passed this x in its walking direction */
  x?: number;
  /** require exact facing */
  dir?: 1 | -1;
  /** require y range */
  minY?: number;
  maxY?: number;
  /** require state */
  state?: string;
}

export interface LevelDef {
  id: string;
  name: string;
  realm: RealmId;
  /** flavour line shown on the intro card */
  intro: string;
  /** one-line tips shown as the level begins (legible tutorialisation) */
  hints?: string[];
  width: number;
  height: number;
  seed: number;
  wyrdlings: number;
  quota: number;
  /** second-star target */
  target: number;
  /** ticks between spawns */
  rate: number;
  skills: Partial<Record<SkillId, number>>;
  terrain: TerrainOp[];
  entities: EntityDef[];
  boss?: BossDef;
  music?: string;
  /** override the realm's ambient light (0..1 rgb) — darker for caves */
  ambient?: [number, number, number];
  /** solution replayed by tests (must reach `target` unless `solutionSaves` says otherwise) */
  solution: SolutionStep[];
  /** minimum saves the scripted solution must reach (default: target) */
  solutionSaves?: number;
}

// ------------------------------------------------------------------------------------------------

function inPoly(pts: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegments(pts: Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j];
    const [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + t * dx - x, py = ay + t * dy - y;
    const d = px * px + py * py;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function surfaceAt(pts: Pt[], x: number): number | null {
  if (x < pts[0][0] || x > pts[pts.length - 1][0]) return null;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x >= x0 && x <= x1) {
      if (x1 === x0) return Math.min(y0, y1);
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return null;
}

/** Rasterise all terrain ops. Returns the terrain (with static back wall). */
export function buildTerrain(def: LevelDef): Terrain {
  const { width: w, height: h } = def;
  const back = new Uint8Array(w * h);
  const terrain = new Terrain(w, h, back);
  let opIndex = 0;
  for (const op of def.terrain) {
    opIndex++;
    const seed = (op.seed ?? def.seed * 31 + opIndex * 977) | 0;
    const rough = op.rough ?? 0;
    const grain = op.grain ?? 10;
    const mat = Mat[op.mat];
    const only = op.only ? op.only.map((m) => Mat[m] as number) : null;
    const pad = Math.ceil(rough) + 1;

    // bounding box + signed "inside" test (negative = inside), distance-based for roughness
    let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1;
    let sdf: (x: number, y: number) => number;
    switch (op.op) {
      case 'rect': {
        x0 = op.x - pad; y0 = op.y - pad; x1 = op.x + op.w + pad; y1 = op.y + op.h + pad;
        const cx = op.x + op.w / 2, cy = op.y + op.h / 2, hx = op.w / 2, hy = op.h / 2;
        sdf = (x, y) => {
          const dx = Math.abs(x + 0.5 - cx) - hx, dy = Math.abs(y + 0.5 - cy) - hy;
          const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
          return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0);
        };
        break;
      }
      case 'ellipse': {
        x0 = op.x - op.rx - pad; y0 = op.y - op.ry - pad; x1 = op.x + op.rx + pad; y1 = op.y + op.ry + pad;
        const rm = Math.min(op.rx, op.ry);
        sdf = (x, y) => {
          const nx = (x + 0.5 - op.x) / op.rx, ny = (y + 0.5 - op.y) / op.ry;
          return (Math.sqrt(nx * nx + ny * ny) - 1) * rm;
        };
        break;
      }
      case 'poly': {
        x0 = Infinity; y0 = Infinity; x1 = -Infinity; y1 = -Infinity;
        for (const [px, py] of op.pts) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
        x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
        const pts = op.pts;
        sdf = rough > 0
          ? (x, y) => { const d = distToSegments(pts, x + 0.5, y + 0.5); return inPoly(pts, x + 0.5, y + 0.5) ? -d : d; }
          : (x, y) => (inPoly(pts, x + 0.5, y + 0.5) ? -1 : 1);
        break;
      }
      case 'ground':
      case 'ceiling': {
        const pts = op.pts;
        x0 = pts[0][0]; x1 = pts[pts.length - 1][0];
        const isGround = op.op === 'ground';
        const lim = isGround ? (op as { bottom?: number }).bottom ?? h : (op as { top?: number }).top ?? 0;
        y0 = isGround ? 0 : lim; y1 = isGround ? lim : h;
        sdf = (x, y) => {
          const s = surfaceAt(pts, x + 0.5);
          if (s === null) return 1e9;
          const yy = y + 0.5;
          if (isGround) return yy >= lim ? 1e9 : s - yy;
          return yy < lim ? 1e9 : yy - s;
        };
        break;
      }
    }

    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(w - 1, Math.ceil(x1)); y1 = Math.min(h - 1, Math.ceil(y1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let d = sdf(x, y);
        if (rough > 0) {
          const n = op.op === 'ground' || op.op === 'ceiling'
            ? noise1(x / grain, seed) * 0.75 + noise2(x / (grain * 0.4), y / (grain * 0.4), seed + 7) * 0.25
            : noise2(x / grain, y / grain, seed) * 0.7 + noise2(x / (grain * 0.35), y / (grain * 0.35), seed + 3) * 0.3;
          d += (n - 0.5) * 2 * rough;
        }
        if (d >= 0) continue;
        if (op.back) { back[y * w + x] = mat === 0 ? 0 : 1; continue; }
        if (only && !only.includes(terrain.getRaw(x, y))) continue;
        terrain.set(x, y, mat);
        if (mat !== 0 && !op.noBack) back[y * w + x] = 1;
      }
    }
  }
  // back wall: 1 = behind solid rock (revealed when dug), 2 = a designed cave interior (open at start)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (back[y * w + x] && terrain.getRaw(x, y) === 0) back[y * w + x] = 2;
  return terrain;
}
