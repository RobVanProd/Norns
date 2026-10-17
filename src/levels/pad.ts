// Growing a level's canvas without re-authoring it. Boss arenas are padded to 640×360 so that on
// 16:9 screens the whole arena fills the view at an integer scale (2× at 720p, 3× at 1080p,
// 4× at 1440p, 6× at 4K) while the view still never extends past the level.
import type { LevelDef, TerrainOp } from '../sim/level';

/** Ops that reach the authored right edge are carried past the new edge (by `right` + a margin, so
 *  rough boundaries stay off-screen). Noise is sampled per absolute pixel, so nothing else changes. */
function widen(op: TerrainOp, w0: number, by: number): TerrainOp {
  const px = (pts: [number, number][]) => pts.map(([x, y]) => [x >= w0 ? x + by : x, y] as [number, number]);
  switch (op.op) {
    case 'rect': return op.x + op.w >= w0 ? { ...op, w: op.w + by } : op;
    case 'poly': case 'ground': case 'ceiling': return { ...op, pts: px(op.pts) };
    default: return op;
  }
}

/** Add `top` px above and `right` px to the right. Terrain is rasterised at the authored height and
 *  embedded `top` px down (its top row extended upward), so the playfield is unchanged; every
 *  authored y (entities, boss, solution bounds) shifts down by `top`. */
export function padLevel(def: LevelDef, top: number, right = 0): LevelDef {
  return {
    ...def,
    width: def.width + right,
    height: def.height + top,
    terrain: right > 0 ? def.terrain.map((op) => widen(op, def.width, right + 8)) : def.terrain,
    raster: { top, w: def.width + right, h: def.height },
    entities: def.entities.map((e) => ({ ...e, y: e.y + top })),
    boss: def.boss && { ...def.boss, y: def.boss.y + top, arena: { ...def.boss.arena, floorY: def.boss.arena.floorY + top } },
    solution: def.solution.map((s) => ({
      ...s,
      ...(s.minY !== undefined ? { minY: s.minY + top } : {}),
      ...(s.maxY !== undefined ? { maxY: s.maxY + top } : {}),
    })),
  };
}
