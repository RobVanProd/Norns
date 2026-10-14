// Bosses: deterministic, telegraphed attack patterns + Seiðr stones (the boss weak point).
// Every attack spends `warn` ticks visibly telegraphing before it does anything, and all of it is
// simulation state, so Foresight shows exactly who an incoming attack will hit.
import { Mat } from './constants';
import type { BossDef } from './level';
import { isAlive, type BossState, type Hazard, type HazardKind, type Projectile, type ProjectileKind, type Wyrd } from './state';
import type { Sim } from './sim';

const STONE_FIRST = 60;
const STONE_COOLDOWN = 75;
const DYING_TICKS = 90;

export function createBoss(def: BossDef): BossState {
  return {
    kind: def.kind, hp: def.hp, maxHp: def.hp, x: def.x, y: def.y, act: 'idle', at: 0,
    cd: def.delay ?? 150, seq: 0, hurt: 0, stone: -1, stoneCd: STONE_FIRST, dying: 0, m: [],
  };
}

export function bossLocksExit(sim: Sim): boolean {
  const b = sim.d.boss;
  return !!b && b.hp > 0;
}

export function bossPhase(b: BossState): 0 | 1 | 2 {
  const f = b.hp / b.maxHp;
  return f > 0.67 ? 0 : f > 0.34 ? 1 : 2;
}

/** Mouth / emitter position used for projectiles and beams. */
export function bossEmitter(b: BossState): { x: number; y: number } {
  switch (b.kind) {
    case 'wyrm': return { x: b.x - 18, y: b.y - 2 };
    case 'jotunn': return { x: b.x - 30, y: b.y - 78 };
    default: return { x: b.x - 20, y: b.y - 90 };
  }
}

/** Point the Seiðr beams strike. */
export function bossCore(b: BossState): { x: number; y: number } {
  switch (b.kind) {
    case 'wyrm': return { x: b.x, y: b.y };
    case 'jotunn': return { x: b.x, y: b.y - 70 };
    default: return { x: b.x, y: b.y - 80 };
  }
}

const PATTERNS: Record<string, string[][]> = {
  wyrm: [['venom', 'venom'], ['venom', 'burrow', 'venom', 'burrow'], ['lash', 'venom', 'burrow', 'venom', 'lash', 'burrow']],
  jotunn: [['icicles', 'breath'], ['icicles', 'slam', 'breath', 'slam'], ['slam', 'icicles', 'breath', 'icicles', 'slam']],
  herald: [['meteors', 'sweep'], ['sweep', 'meteors', 'magma'], ['magma', 'sweep', 'meteors', 'sweep', 'meteors']],
};
const COOLDOWN = [150, 120, 90];

export function bossStep(sim: Sim): void {
  const b = sim.d.boss;
  if (!b) return;
  const def = sim.L.def.boss!;
  if (b.hurt > 0) b.hurt--;

  stepProjectiles(sim);
  stepHazards(sim);

  if (b.hp <= 0) {
    if (b.dying > 0 && b.dying < DYING_TICKS) b.dying++;
    return;
  }

  // --- Seiðr stones
  const stones = sim.L.seidr;
  if (stones.length) {
    if (b.stone < 0) {
      b.stoneCd--;
      if (b.stoneCd <= 0) {
        const prev = b.m[9] ?? -1;
        let next = stones.length === 1 ? 0 : Math.floor(sim.rand() * (stones.length - 1));
        if (stones.length > 1 && next >= prev && prev >= 0) next++;
        if (next >= stones.length) next = 0;
        b.stone = next;
        sim.emit('seidr_on', stones[next].x, stones[next].y, next);
      }
    } else {
      const s = stones[b.stone];
      for (const w of sim.d.wyrds) {
        if (!isAlive(w) || w.st === 'tumble' || w.st === 'leap' || w.st === 'frozen') continue;
        if (Math.abs(w.x - s.x) <= 7 && Math.abs(w.y - s.y) <= 3) {
          hitBoss(sim, b, s.x, s.y);
          b.m[9] = b.stone;
          b.stone = -1;
          b.stoneCd = STONE_COOLDOWN;
          break;
        }
      }
    }
  }
  if (b.hp <= 0) return;

  // --- attack scheduler
  if (b.act === 'idle') {
    b.cd--;
    if (b.cd <= 0) {
      const phase = bossPhase(b);
      const pat = PATTERNS[b.kind][phase];
      b.act = pat[b.seq % pat.length];
      b.seq++;
      b.at = 0;
      sim.emit('boss_telegraph', b.x, b.y, undefined, b.act);
    }
    return;
  }
  b.at++;
  const done = runAttack(sim, b, def);
  if (done) {
    b.act = 'idle';
    b.cd = COOLDOWN[bossPhase(b)];
  }
}

function hitBoss(sim: Sim, b: BossState, sx: number, sy: number): void {
  b.hp--;
  b.hurt = 24;
  const core = bossCore(b);
  sim.d.hazards.push(mkHazard('beam', sx, sy, core.x, core.y, 0, 20, 0, 0));
  sim.emit('seidr_beam', sx, sy);
  sim.emit('boss_hit', core.x, core.y, undefined, b.kind, b.hp);
  if (b.hp <= 0) {
    b.dying = 1;
    b.act = 'idle';
    sim.d.projectiles.length = 0;
    sim.d.hazards = sim.d.hazards.filter((h) => h.kind === 'beam');
    sim.emit('boss_defeat', core.x, core.y, undefined, b.kind);
  }
}

function mkHazard(kind: HazardKind, x0: number, y0: number, x1: number, y1: number, warn: number, dur: number, dir: number, p: number): Hazard {
  return { kind, x0, y0, x1, y1, t: 0, warn, dur, dir, p, gone: false };
}

// ------------------------------------------------------------------ helpers

function targets(sim: Sim, def: BossDef): Wyrd[] {
  return sim.d.wyrds.filter((w) => isAlive(w) && w.x >= def.arena.x0 && w.x <= def.arena.x1 && w.st !== 'frozen');
}

function pickTarget(sim: Sim, def: BossDef): Wyrd | null {
  const ts = targets(sim, def);
  if (!ts.length) return null;
  return ts[Math.floor(sim.rand() * ts.length)];
}

/** First solid pixel scanning down from `fromY` at column x. */
export function surfaceY(sim: Sim, x: number, fromY: number): number {
  let y = Math.max(0, fromY);
  while (y < sim.L.h && !sim.solid(x, y)) y++;
  return y;
}

function clampX(def: BossDef, x: number): number {
  return Math.max(def.arena.x0 + 8, Math.min(def.arena.x1 - 8, x));
}

function launch(sim: Sim, kind: ProjectileKind, x: number, y: number, tx: number, ty: number, T: number, g: number): void {
  const vx = (tx - x) / T;
  const vy = (ty - y) / T - 0.5 * g * T;
  const p: Projectile = { kind, x, y, vx, vy, t: 0, tx, ty, gone: false };
  sim.d.projectiles.push(p);
}

function gravityOf(kind: ProjectileKind): number {
  return kind === 'venom' ? 0.15 : kind === 'icicle' ? 0.3 : 0;
}

// ------------------------------------------------------------------ attacks

function runAttack(sim: Sim, b: BossState, def: BossDef): boolean {
  const phase = bossPhase(b);
  const top = def.arena.floorY - 140;
  switch (b.act) {
    // ---------------- Wyrm
    case 'venom': {
      const WIND = 24;
      if (b.at < WIND) return false;
      const k = b.at - WIND;
      const shots = phase === 2 ? 4 : 3;
      if (k % 9 === 0 && k / 9 < shots) {
        const t = pickTarget(sim, def);
        const mouth = bossEmitter(b);
        const T = 42;
        const lead = t ? t.x + (t.st === 'walk' ? t.dir * T : 0) : def.arena.x0 + sim.rand() * (def.arena.x1 - def.arena.x0);
        const off = (k / 9 - 1) * 26;
        const tx = clampX(def, Math.round(lead + off));
        const ty = surfaceY(sim, tx, top);
        launch(sim, 'venom', mouth.x, mouth.y, tx, ty, T, gravityOf('venom'));
        sim.emit('venom_spit', mouth.x, mouth.y);
      }
      return k >= shots * 9 + 10;
    }
    case 'burrow': {
      if (b.at === 1) {
        const t = pickTarget(sim, def);
        const x = clampX(def, t ? t.x + (t.st === 'walk' ? t.dir * 30 : 0) : (def.arena.x0 + def.arena.x1) / 2);
        const y = surfaceY(sim, x, top);
        sim.d.hazards.push(mkHazard('burrow', x, y, x, y, phase === 2 ? 40 : 50, 24, 0, 0));
        sim.emit('burrow', x, y);
      }
      return b.at >= 90;
    }
    case 'lash': {
      if (b.at === 1) {
        sim.d.hazards.push(mkHazard('lash', def.arena.x0, def.arena.floorY - 34, def.arena.x1, def.arena.floorY + 1, 45, 30, -1, def.arena.x1));
      }
      return b.at >= 85;
    }
    // ---------------- Jötunn
    case 'icicles': {
      if (b.at === 1) {
        const n = phase === 0 ? 4 : 5;
        const ts = targets(sim, def);
        for (let i = 0; i < n; i++) {
          const t = ts.length ? ts[Math.floor(sim.rand() * ts.length)] : null;
          const base = t ? t.x + (t.st === 'walk' ? t.dir * 40 : 0) : def.arena.x0 + sim.rand() * (def.arena.x1 - def.arena.x0);
          const x = clampX(def, Math.round(base + (sim.rand() - 0.5) * 50));
          const y = surfaceY(sim, x, top);
          // icicle falls from the ceiling above the marker; spawn delayed via t offset
          const ceil = ceilingY(sim, x, y);
          const p: Projectile = { kind: 'icicle', x, y: ceil + 6, vx: 0, vy: 0, t: -40 - i * 6, tx: x, ty: y, gone: false };
          sim.d.projectiles.push(p);
        }
        sim.emit('icicle_warn', b.x, b.y);
      }
      return b.at >= 110;
    }
    case 'breath': {
      if (b.at === 1) {
        const t = pickTarget(sim, def);
        const cx = clampX(def, t ? t.x : (def.arena.x0 + def.arena.x1) / 2);
        const w = phase === 2 ? 110 : 80;
        const x0 = Math.max(def.arena.x0, cx - w / 2), x1 = Math.min(def.arena.x1, cx + w / 2);
        const sy = t ? t.y : def.arena.floorY;
        sim.d.hazards.push(mkHazard('breath', x0, sy - 30, x1, sy + 3, 40, 36, -1, 0));
        sim.emit('inhale', b.x, b.y);
      }
      return b.at >= 100;
    }
    case 'slam': {
      if (b.at === 1) {
        const t = pickTarget(sim, def);
        const x = clampX(def, t ? t.x + (t.st === 'walk' ? t.dir * 36 : 0) : (def.arena.x0 + def.arena.x1) / 2);
        const y = surfaceY(sim, x, top);
        sim.d.hazards.push(mkHazard('slam', x, y, x, y, 36, 40, 0, 0));
      }
      return b.at >= 95;
    }
    // ---------------- Herald
    case 'sweep': {
      if (b.at === 1) {
        // sweep the half of the arena holding more wyrdlings
        const mid = (def.arena.x0 + def.arena.x1) / 2;
        let left = 0, right = 0;
        for (const w of targets(sim, def)) { if (w.x < mid) left++; else right++; }
        const x0 = left >= right ? def.arena.x0 : mid, x1 = left >= right ? mid : def.arena.x1;
        sim.d.hazards.push(mkHazard('sweep', x0, def.arena.floorY - 32, x1, def.arena.floorY - 4, 48, 24, -1, x1));
      }
      return b.at >= 90;
    }
    case 'magma': {
      if (b.at === 1) {
        sim.d.hazards.push(mkHazard('magma', def.arena.x0, def.arena.floorY + 2, def.arena.x1, sim.L.h, 60, 120, 0, sim.L.h));
        sim.emit('magma_warn', (def.arena.x0 + def.arena.x1) / 2, def.arena.floorY);
      }
      return b.at >= 200;
    }
    case 'meteors': {
      if (b.at === 1) {
        const n = phase === 2 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const t = pickTarget(sim, def);
          const base = t ? t.x + (t.st === 'walk' ? t.dir * 45 : 0) : def.arena.x0 + sim.rand() * (def.arena.x1 - def.arena.x0);
          const tx = clampX(def, Math.round(base + (i - (n - 1) / 2) * 30));
          const ty = surfaceY(sim, tx, top);
          const sx = tx + 60, sy = top - 20;
          const T = 45 + i * 8;
          const p: Projectile = { kind: 'meteor', x: sx, y: sy, vx: (tx - sx) / T, vy: (ty - sy) / T, t: 0, tx, ty, gone: false };
          sim.d.projectiles.push(p);
        }
      }
      return b.at >= 110;
    }
  }
  return true;
}

function ceilingY(sim: Sim, x: number, fromY: number): number {
  let y = fromY - 14;
  while (y > 0 && !sim.solid(x, y)) y--;
  return y;
}

// ------------------------------------------------------------------ projectiles

function stepProjectiles(sim: Sim): void {
  const ps = sim.d.projectiles;
  for (const p of ps) {
    if (p.gone) continue;
    p.t++;
    if (p.t <= 0) continue; // delayed spawn (icicles hang while telegraphing)
    const g = gravityOf(p.kind);
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy + g)) / 2));
    p.vy += g;
    for (let s = 0; s < steps && !p.gone; s++) {
      p.x += p.vx / steps;
      p.y += p.vy / steps;
      const ix = Math.round(p.x), iy = Math.round(p.y);
      if (iy >= sim.L.h) { p.gone = true; break; }
      let hit = sim.solid(ix, iy);
      if (!hit) {
        for (const w of sim.d.wyrds) {
          if (!isAlive(w) || w.st === 'frozen') continue;
          if (Math.abs(w.x - ix) <= 3 && iy <= w.y && iy >= w.y - 11) { hit = true; break; }
        }
      }
      if (hit) impact(sim, p, ix, iy);
    }
  }
  sim.d.projectiles = ps.filter((p) => !p.gone);
}

function impact(sim: Sim, p: Projectile, x: number, y: number): void {
  p.gone = true;
  const killR = p.kind === 'icicle' ? 5 : p.kind === 'meteor' ? 10 : 8;
  for (const w of sim.d.wyrds) {
    if (!isAlive(w)) continue;
    const dx = w.x - x, dy = w.y - 5 - y;
    if (dx * dx + dy * dy <= (killR + 4) * (killR + 4)) sim.kill(w, p.kind === 'icicle' ? 'unravel' : 'burn', p.kind);
  }
  switch (p.kind) {
    case 'venom':
      sim.carveCircle(x, y, 7);
      sim.emit('venom_hit', x, y);
      break;
    case 'icicle': {
      // shatters into a small ice spire that blocks the path
      const sy = surfaceY(sim, x, y - 4);
      for (let yy = sy - 9; yy < sy; yy++) {
        const half = Math.max(1, Math.floor((yy - (sy - 10)) / 3) + 1);
        for (let xx = x - half; xx <= x + half; xx++) if (sim.terrain.get(xx, yy) === 0 && !wyrdAt(sim, xx, yy)) sim.terrain.set(xx, yy, Mat.Ice);
      }
      sim.touched(x - 4, sy - 10, x + 4, sy);
      sim.emit('ice_shatter', x, sy);
      break;
    }
    case 'meteor':
    case 'fireball':
      sim.carveCircle(x, y, 9);
      sim.emit('meteor', x, y);
      if (sim.d.boss && bossPhase(sim.d.boss) === 2 && sim.rand() < 0.5) {
        sim.d.bodies.push({ id: sim.d.bodies.length, x, y: y - 16, vx: (sim.rand() - 0.5) * 2, vy: -1, r: 6, a: 0, sleep: 0, gone: false });
      }
      break;
  }
}

function wyrdAt(sim: Sim, x: number, y: number): boolean {
  for (const w of sim.d.wyrds) if (isAlive(w) && Math.abs(w.x - x) <= 2 && y <= w.y && y >= w.y - 10) return true;
  return false;
}

// ------------------------------------------------------------------ hazards

/** current magma surface for a magma hazard (or null if not active) */
export function magmaLevel(h: Hazard): number | null {
  if (h.t < h.warn) return null;
  const k = h.t - h.warn;
  const rise = 30, hold = h.dur - 60;
  const lo = h.y0 + 18, hi = h.y0; // starts below floor, rises to just under it
  if (k < rise) return lo + ((hi - lo) * k) / rise;
  if (k < rise + hold) return hi;
  return hi + ((lo - hi) * (k - rise - hold)) / 30;
}

function stepHazards(sim: Sim): void {
  const hs = sim.d.hazards;
  for (const h of hs) {
    if (h.gone) continue;
    h.t++;
    const active = h.t >= h.warn && h.t < h.warn + h.dur;
    if (h.t === h.warn) sim.emit('hazard_' + h.kind, (h.x0 + h.x1) / 2, (h.y0 + h.y1) / 2, undefined, h.kind);
    switch (h.kind) {
      case 'burrow':
        if (h.t === h.warn) {
          for (const w of sim.d.wyrds) {
            if (isAlive(w) && Math.abs(w.x - h.x0) <= 11 && w.y >= h.y0 - 40 && w.y <= h.y0 + 6) sim.kill(w, 'unravel', 'burrow');
          }
          // carve a shallow crater (escapable: <= step height)
          sim.carveRect(h.x0 - 13, h.y0 - 2, h.x0 + 13, h.y0 + 6, (x, y) => {
            const nx = (x - h.x0) / 13, ny = (y - h.y0 + 2) / 8;
            return nx * nx + ny * ny <= 1;
          });
        }
        break;
      case 'lash':
      case 'sweep':
        if (active) {
          const k = h.t - h.warn;
          const span = h.x1 - h.x0;
          const prev = h.x1 - (span * k) / h.dur;
          const cur = h.x1 - (span * (k + 1)) / h.dur;
          h.p = cur;
          for (const w of sim.d.wyrds) {
            if (!isAlive(w) || w.st === 'frozen') continue;
            if (w.x > prev + 2 || w.x < cur - 2) continue;
            if (w.y < h.y0 || w.y - 10 > h.y1) continue;
            if (h.kind === 'lash') {
              w.dir = -1;
              sim.fling(w, -2.6, -2.4);
            } else sim.kill(w, 'burn', 'sweep');
          }
        }
        break;
      case 'breath':
        if (active) {
          for (const w of sim.d.wyrds) {
            if (isAlive(w) && w.x >= h.x0 && w.x <= h.x1 && w.y >= h.y0 && w.y - 10 <= h.y1) sim.freeze(w, 150);
          }
        }
        break;
      case 'slam':
        if (h.t === h.warn) {
          for (const w of sim.d.wyrds) {
            if (isAlive(w) && Math.abs(w.x - h.x0) <= 10 && w.y >= h.y0 - 16 && w.y <= h.y0 + 2) sim.kill(w, 'unravel', 'slam');
          }
          sim.emit('slam', h.x0, h.y0);
        }
        if (active) {
          const prev = (h.t - h.warn) * 4, cur = prev + 4;
          h.p = cur;
          for (const w of sim.d.wyrds) {
            if (!isAlive(w)) continue;
            const grounded = w.st === 'walk' || w.st === 'weave' || w.st === 'bash' || w.st === 'mine' || w.st === 'dig' ||
              w.st === 'shrug' || w.st === 'land' || w.st === 'warden' || w.st === 'plant';
            if (!grounded) continue;
            const dist = Math.abs(w.x - h.x0);
            if (dist > prev && dist <= cur && Math.abs(w.y - h.y0) <= 24) {
              const away = w.x >= h.x0 ? 1 : -1;
              sim.fling(w, away * 1.1, -3.4);
            }
          }
        }
        break;
      case 'magma': {
        const lv = magmaLevel(h);
        h.p = lv ?? sim.L.h;
        if (lv !== null && active) {
          for (const w of sim.d.wyrds) {
            if (isAlive(w) && w.x >= h.x0 && w.x <= h.x1 && w.y >= lv) sim.kill(w, 'burn', 'magma');
          }
        }
        break;
      }
      case 'beam':
      case 'shock':
        break;
    }
    if (h.t >= h.warn + h.dur) h.gone = true;
  }
  sim.d.hazards = hs.filter((h) => !h.gone);
}
