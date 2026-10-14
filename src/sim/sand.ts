// Granular material (sand / snow / ash): a falling-sand cellular automaton that only runs in
// "active" 32×32 chunks. Chunks wake when nearby terrain changes and sleep when nothing moves.
// Works directly on chunk arrays (it runs inside every Foresight prediction, so it must be fast).
import { Mat } from './constants';
import type { Sim } from './sim';
import { CS, CS_SHIFT } from './terrain';

const SAND = Mat.Sand;
const CM = CS - 1;

export function activateSand(sim: Sim, x0: number, y0: number, x1: number, y1: number): void {
  const t = sim.terrain;
  const cx0 = Math.max(0, x0 >> CS_SHIFT), cx1 = Math.min(t.cw - 1, Math.max(0, x1) >> CS_SHIFT);
  const cy0 = Math.max(0, y0 >> CS_SHIFT), cy1 = Math.min(t.ch - 1, Math.max(0, y1) >> CS_SHIFT);
  const act = sim.d.sandActive;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const ci = cy * t.cw + cx;
      if (!act.includes(ci)) act.push(ci);
    }
  }
}

export function stepSand(sim: Sim): void {
  const act = sim.d.sandActive;
  if (act.length === 0) return;
  const t = sim.terrain;
  const bodies = sim.d.bodies;
  const hasBodies = bodies.some((b) => !b.gone);
  // bottom chunks first so grains fall at most one pixel per tick
  act.sort((a, b) => b - a);
  const nextMark = new Uint8Array(t.chunks.length);
  const next: number[] = [];
  const mark = (ci: number) => { if (!nextMark[ci]) { nextMark[ci] = 1; next.push(ci); } };
  const tick = sim.d.tick;
  const W = t.w, H = t.h, cw = t.cw;
  const blocked = (x: number, y: number) => {
    if (!hasBodies) return false;
    for (const b of bodies) {
      if (b.gone) continue;
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy <= b.r * b.r) return true;
    }
    return false;
  };
  // read / write any pixel by world coords (used only when a move crosses a chunk edge)
  const getW = (x: number, y: number) => t.chunks[(y >> CS_SHIFT) * cw + (x >> CS_SHIFT)][((y & CM) << CS_SHIFT) | (x & CM)];
  const setW = (x: number, y: number, m: number) => {
    const ci = (y >> CS_SHIFT) * cw + (x >> CS_SHIFT);
    t.writable(ci)[((y & CM) << CS_SHIFT) | (x & CM)] = m;
    mark(ci);
  };
  for (const ci of act) {
    let c = t.chunks[ci];
    if (c.indexOf(SAND) < 0) continue;
    const cx = ci % cw, cy = (ci / cw) | 0;
    const x0 = cx * CS, y0 = cy * CS;
    let moved = false;
    let own = false;
    const write = () => { if (!own) { c = t.writable(ci); own = true; } };
    for (let ly = Math.min(CM, H - 1 - y0); ly >= 0; ly--) {
      const y = y0 + ly;
      const ltr = ((y + tick) & 1) === 0;
      const row = ly << CS_SHIFT;
      for (let k = 0; k < CS; k++) {
        const lx = ltr ? k : CM - k;
        const x = x0 + lx;
        if (x >= W || c[row | lx] !== SAND) continue;
        if (y + 1 >= H) { write(); c[row | lx] = 0; moved = true; continue; }
        // straight down
        const below = ly < CM ? c[row + CS + lx] : getW(x, y + 1);
        if (below === 0 && !blocked(x, y + 1)) {
          write(); c[row | lx] = 0;
          if (ly < CM) c[row + CS + lx] = SAND; else setW(x, y + 1, SAND);
          moved = true;
          continue;
        }
        // diagonal slide
        const first = ((x + y + tick) & 1) === 0 ? -1 : 1;
        for (let s = 0; s < 2; s++) {
          const dx = s === 0 ? first : -first;
          const nx = x + dx, nlx = lx + dx;
          if (nx < 0 || nx >= W) continue;
          const inChunk = nlx >= 0 && nlx < CS;
          const side = inChunk ? c[row | nlx] : getW(nx, y);
          if (side !== 0) continue;
          const diag = inChunk && ly < CM ? c[row + CS + nlx] : getW(nx, y + 1);
          if (diag !== 0 || blocked(nx, y + 1)) continue;
          write(); c[row | lx] = 0;
          if (inChunk && ly < CM) c[row + CS + nlx] = SAND; else setW(nx, y + 1, SAND);
          moved = true;
          break;
        }
      }
    }
    if (moved) {
      mark(ci);
      // the chunk above may now have unsupported grains
      if (cy > 0) mark(ci - cw);
      sim.wake(x0, y0, x0 + CS - 1, y0 + CS - 1);
      if ((tick & 7) === 0) sim.emit('sand', x0 + CS / 2, y0 + CS / 2);
    }
  }
  sim.d.sandActive = next;
}
