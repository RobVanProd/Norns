// Granular material (sand / snow / ash): a falling-sand cellular automaton that only runs in
// "active" 32×32 chunks. Chunks wake when nearby terrain changes and sleep when nothing moves.
import { Mat } from './constants';
import type { Sim } from './sim';
import { CS, CS_SHIFT } from './terrain';

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
  // bottom chunks first so grains fall at most one pixel per tick
  act.sort((a, b) => b - a);
  const next: number[] = [];
  const tick = sim.d.tick;
  const W = t.w, H = t.h;
  for (const ci of act) {
    const cx = ci % t.cw, cy = (ci / t.cw) | 0;
    const chunk = t.chunks[ci];
    // quick reject: no sand in chunk
    let any = false;
    for (let i = 0; i < chunk.length; i++) if (chunk[i] === Mat.Sand) { any = true; break; }
    if (!any) continue;
    const x0 = cx * CS, y0 = cy * CS;
    let moved = false;
    for (let y = Math.min(H - 1, y0 + CS - 1); y >= y0; y--) {
      const ltr = ((y + tick) & 1) === 0;
      for (let k = 0; k < CS; k++) {
        const x = ltr ? x0 + k : x0 + CS - 1 - k;
        if (x >= W) continue;
        if (t.getRaw(x, y) !== Mat.Sand) continue;
        if (y + 1 >= H) { t.set(x, y, Mat.Air); moved = true; continue; }
        if (t.getRaw(x, y + 1) === 0 && !blockedByBody(sim, x, y + 1)) {
          t.set(x, y, Mat.Air); t.set(x, y + 1, Mat.Sand); moved = true;
          mark(sim, next, x, y + 1);
          continue;
        }
        const first = ((x + y + tick) & 1) === 0 ? -1 : 1;
        for (const dx of [first, -first]) {
          const nx = x + dx;
          if (nx < 0 || nx >= W) continue;
          if (t.getRaw(nx, y + 1) === 0 && t.getRaw(nx, y) === 0 && !blockedByBody(sim, nx, y + 1)) {
            t.set(x, y, Mat.Air); t.set(nx, y + 1, Mat.Sand); moved = true;
            mark(sim, next, nx, y + 1);
            break;
          }
        }
      }
    }
    if (moved) {
      if (!next.includes(ci)) next.push(ci);
      // the chunk above may now have unsupported grains
      if (cy > 0 && !next.includes(ci - t.cw)) next.push(ci - t.cw);
      sim.wake(x0, y0, x0 + CS - 1, y0 + CS - 1);
      if ((tick & 7) === 0) sim.emit('sand', x0 + CS / 2, y0 + CS / 2);
    }
  }
  sim.d.sandActive = next;
}

function mark(sim: Sim, next: number[], x: number, y: number): void {
  const ci = sim.chunkIndex(x, y);
  if (!next.includes(ci)) next.push(ci);
}

function blockedByBody(sim: Sim, x: number, y: number): boolean {
  for (const b of sim.d.bodies) {
    if (b.gone) continue;
    const dx = x - b.x, dy = y - b.y;
    if (dx * dx + dy * dy <= b.r * b.r) return true;
  }
  return false;
}
