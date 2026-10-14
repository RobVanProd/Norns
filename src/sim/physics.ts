// Rigid circle bodies (boulders) against pixel terrain: gravity, rolling, restitution, friction,
// body-body contacts, liquids, crushing. Deterministic (sqrt only).
import { BODY_CRUSH_SPEED, BODY_GRAVITY, Mat } from './constants';
import { isAlive, type Body } from './state';
import type { Sim } from './sim';

const SLEEP_TICKS = 20;
const SUBSTEPS = 3;
const RESTITUTION = 0.25;

const ringCache = new Map<number, Int16Array>();

/** Boundary sample offsets for a circle of radius r (integer pixel ring), cached. */
function ring(r: number): Int16Array {
  const key = Math.round(r * 4);
  let c = ringCache.get(key);
  if (c) return c;
  const pts: number[] = [];
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= r && d > r - 1.5) pts.push(x, y);
    }
  }
  c = Int16Array.from(pts);
  ringCache.set(key, c);
  return c;
}

function terrainSolid(sim: Sim, x: number, y: number): boolean {
  if (y < 0) return false;
  return sim.terrain.get(x, y) !== 0;
}

/** returns contact normal (pointing out of terrain) or null */
function contact(sim: Sim, b: Body): [number, number, number] | null {
  const pts = ring(b.r);
  let nx = 0, ny = 0, n = 0;
  const bx = Math.round(b.x), by = Math.round(b.y);
  for (let i = 0; i < pts.length; i += 2) {
    const ox = pts[i], oy = pts[i + 1];
    if (terrainSolid(sim, bx + ox, by + oy)) {
      nx -= ox;
      ny -= oy;
      n++;
    }
  }
  if (n === 0) return null;
  const len = Math.sqrt(nx * nx + ny * ny);
  if (len < 1e-6) return [0, -1, n];
  return [nx / len, ny / len, n];
}

export function wakeBodies(sim: Sim, x0: number, y0: number, x1: number, y1: number): void {
  for (const b of sim.d.bodies) {
    if (b.gone || b.sleep < SLEEP_TICKS) continue;
    if (b.x + b.r >= x0 && b.x - b.r <= x1 && b.y + b.r >= y0 && b.y - b.r <= y1) b.sleep = 0;
  }
}

export function bodyImpulse(sim: Sim, cx: number, cy: number, radius: number, strength: number): void {
  for (const b of sim.d.bodies) {
    if (b.gone) continue;
    const dx = b.x - cx, dy = b.y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > radius) continue;
    const k = (1 - d / radius) * strength;
    const nx = d > 0.01 ? dx / d : 0, ny = d > 0.01 ? dy / d : -1;
    b.vx += nx * k;
    b.vy += ny * k - k * 0.35;
    b.sleep = 0;
  }
}

export function stepBodies(sim: Sim): void {
  const bodies = sim.d.bodies;
  if (bodies.length === 0) return;
  const L = sim.L;
  for (const b of bodies) {
    if (b.gone || b.sleep >= SLEEP_TICKS) continue;
    let touching = false;
    for (let s = 0; s < SUBSTEPS; s++) {
      b.vy += BODY_GRAVITY / SUBSTEPS;
      b.x += b.vx / SUBSTEPS;
      b.y += b.vy / SUBSTEPS;
      const c = contact(sim, b);
      if (!c) continue;
      touching = true;
      const [nx, ny] = c;
      // push out
      for (let k = 0; k < b.r * 4; k++) {
        b.x += nx * 0.5;
        b.y += ny * 0.5;
        if (!contact(sim, b)) break;
      }
      // velocity response
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        const speed = -vn;
        const bounce = speed > 0.8 ? RESTITUTION : 0;
        b.vx -= (1 + bounce) * vn * nx;
        b.vy -= (1 + bounce) * vn * ny;
        if (speed > 1.6) sim.emit('boulder_impact', b.x, b.y + b.r, b.id, undefined, speed);
      }
      // rolling friction along the tangent
      const tx = -ny, ty = nx;
      const vt = b.vx * tx + b.vy * ty;
      const vt2 = vt * 0.992;
      b.vx += (vt2 - vt) * tx;
      b.vy += (vt2 - vt) * ty;
    }
    // rolling angle: arc length / r
    if (touching) {
      b.a += b.vx / b.r;
      if (Math.abs(b.vx) > 0.4 && sim.d.tick % 12 === 0) sim.emit('boulder_roll', b.x, b.y, b.id, undefined, Math.abs(b.vx));
    } else b.a += b.vx / (b.r * 2);

    // liquids
    for (const l of L.liquids) {
      if (b.x < l.x || b.x >= l.x + l.w || b.y + b.r * 0.3 < l.y || b.y - b.r > l.y + l.h) continue;
      if (l.type === 'water') {
        b.vx *= 0.9;
        b.vy = b.vy * 0.85 - BODY_GRAVITY * 0.5;
      } else if (b.y >= l.y + b.r * 0.4) {
        // lava: harden into a stepping stone sitting at the surface, centred in the pool if it fits
        const cx = l.w >= b.r * 2 ? Math.max(l.x + b.r, Math.min(l.x + l.w - b.r, b.x)) : l.x + l.w / 2;
        b.x = cx;
        const cy = l.y + b.r - 4;
        const r2 = b.r * b.r;
        for (let y = Math.floor(cy - b.r); y <= Math.ceil(cy + b.r); y++) {
          for (let x = Math.floor(b.x - b.r); x <= Math.ceil(b.x + b.r); x++) {
            const dx = x - b.x, dy = y - cy;
            if (dx * dx + dy * dy <= r2 && sim.terrain.get(x, y) === 0) sim.terrain.set(x, y, Mat.Rock);
          }
        }
        b.gone = true;
        sim.touched(Math.floor(b.x - b.r), Math.floor(cy - b.r), Math.ceil(b.x + b.r), Math.ceil(cy + b.r));
        sim.emit('stone_harden', b.x, l.y, b.id, undefined, b.r);
      }
    }
    if (b.gone) continue;
    if (b.y - b.r > L.h) { b.gone = true; continue; }

    // crush wyrdlings
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (speed > BODY_CRUSH_SPEED) {
      for (const w of sim.d.wyrds) {
        if (!isAlive(w)) continue;
        const dx = w.x - b.x, dy = w.y - 5 - b.y;
        const rr = b.r + 4;
        if (dx * dx + dy * dy < rr * rr) sim.kill(w, 'unravel', 'boulder');
      }
    }
    // sleep
    if (touching && speed < 0.05) b.sleep++;
    else b.sleep = 0;
    if (b.sleep >= SLEEP_TICKS) { b.vx = 0; b.vy = 0; }
  }
  // body-body contacts
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (a.gone) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (b.gone) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const overlap = rr - d;
      const ma = a.r * a.r, mb = b.r * b.r; // mass ~ area
      const ta = mb / (ma + mb), tb = ma / (ma + mb);
      a.x -= nx * overlap * ta; a.y -= ny * overlap * ta;
      b.x += nx * overlap * tb; b.y += ny * overlap * tb;
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) {
        const jimp = -(1 + RESTITUTION) * rv / (1 / ma + 1 / mb);
        a.vx -= (jimp / ma) * nx; a.vy -= (jimp / ma) * ny;
        b.vx += (jimp / mb) * nx; b.vy += (jimp / mb) * ny;
        a.sleep = 0; b.sleep = 0;
      }
    }
  }
}
