// GameView: draws a Sim with Three.js and turns simulation events into juice (particles, flashes,
// shakes, popups). Purely presentational — never mutates the simulation.
import * as THREE from 'three';
import type { ArtBundle } from '../art/bundle';
import type { RealmId } from '../art/types';
import { Atlas, type FrameRef } from '../render/atlas';
import { Background, LiquidLayer, Particles, canvasTex } from '../render/layers';
import type { Pipeline } from '../render/pipeline';
import { SpriteBatch, type SpriteOpts } from '../render/spriteBatch';
import { TerrainLayer } from '../render/terrainLayer';
import { bossCore, bossPhase, magmaLevel, surfaceY } from '../sim/boss';
import { SKILL_INFO, TICK_RATE, type SkillId } from '../sim/constants';
import { compareFates, type Fate, type FateDelta, type FateEnd, type Ghost } from '../sim/foresight';
import type { Sim } from '../sim/sim';
import type { Hazard, SimEvent, Wyrd, WyrdState } from '../sim/state';
import { isAlive } from '../sim/state';

export interface ViewInput {
  sim: Sim;
  time: number;
  dt: number;
  hover: number | null;
  armed: SkillId | null;
  canAssign: boolean;
  fate: Fate | null;
  branch: Fate | null;
  showForesight: boolean;
  rewinding: boolean;
  /** Q or the touch button held: the branch looks further ahead */
  projecting: boolean;
  /** the pointer is a finger (for the look-ahead hint) */
  touch: boolean;
}

interface Popup { text: string; x: number; y: number; life: number; r: number; g: number; b: number }
interface TempLight { x: number; y: number; r: number; c: [number, number, number]; life: number; max: number }

function hexRgb(h: string): [number, number, number] {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
}

function makeLightTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

let sharedAtlas: Atlas | null = null;
let hoodSuffix = '';

/** Choose the cosmetic hood dye used for Wyrdling sprites ('' = default teal). */
export function setHood(id: string): void {
  hoodSuffix = id && id !== 'teal' ? `@${id}` : '';
}
let sharedLightTex: THREE.CanvasTexture | null = null;

export function getAtlas(art: ArtBundle): Atlas {
  if (!sharedAtlas) sharedAtlas = new Atlas(art.sprites, art.font);
  return sharedAtlas;
}

const SKILL_COLORS: Record<SkillId, [number, number, number]> = {
  digger: [0.95, 0.65, 0.3], weaver: [1, 0.82, 0.35], warden: [1, 0.9, 0.45], basher: [0.95, 0.55, 0.3],
  miner: [0.9, 0.6, 0.35], climber: [0.45, 0.85, 1], glider: [0.55, 1, 0.7], leaper: [0.5, 0.75, 1], blast: [1, 0.35, 0.3],
};

/** Wyrm burrow, in px below its perch: rear up, plunge out of sight, stay under while the strike
 *  erupts at the marker, then resurface before the attack ends (act length 90 ticks). */
function wyrmSink(at: number): number {
  if (at <= 0) return 0;
  if (at < 5) return -at * 1.5;
  if (at < 19) { const e = (at - 5) / 14; return -7.5 + e * e * 167.5; }
  if (at < 76) return 160;
  const e = Math.min(1, (at - 76) / 14);
  return 160 * (1 - e) * (1 - e);
}

export class GameView {
  readonly atlas: Atlas;
  private p: Pipeline;
  private art: ArtBundle;
  private realm: RealmId;
  private terrain: TerrainLayer;
  private bg: Background;
  private liquids: LiquidLayer[] = [];
  private magma: LiquidLayer;
  private matTex: THREE.CanvasTexture;
  private backTex: THREE.CanvasTexture;
  private behind: SpriteBatch; // drawn before terrain (big bosses)
  private ents: SpriteBatch;
  private actors: SpriteBatch;
  private front: SpriteBatch;
  private lights: SpriteBatch;
  private glow: SpriteBatch; // additive overlay sprites
  private over: SpriteBatch; // alpha overlay (foresight, telegraphs, text)
  private debris: Particles;
  private sparks: Particles;
  private popups: Popup[] = [];
  private tempLights: TempLight[] = [];
  private debrisColors: [number, number, number][][] = [];
  private crusherTops: number[] = [];
  shake = 0;
  flash: [number, number, number, number] = [1, 1, 1, 0];
  private atmoT = 0;

  constructor(p: Pipeline, art: ArtBundle, sim: Sim) {
    this.p = p;
    this.art = art;
    this.atlas = getAtlas(art);
    const realm = (sim.L.def.realm ?? 'midgard') as RealmId;
    this.realm = realm;
    p.clearScenes();
    const v = p.view;
    const A = this.atlas;
    const bgSet = art.backgrounds[realm];
    this.bg = new Background(bgSet, v, sim.L.w, sim.L.h);
    for (const m of this.bg.meshes) p.worldScene.add(m);
    this.matTex = canvasTex(art.materials[realm], false);
    this.backTex = canvasTex(bgSet.backWall, true);
    this.behind = new SpriteBatch(A.texture, A.size, v, 256);
    this.behind.mesh.renderOrder = 15;
    p.worldScene.add(this.behind.mesh);
    this.terrain = new TerrainLayer(sim.terrain, this.matTex, this.backTex, v);
    this.terrain.mesh.renderOrder = 20;
    p.worldScene.add(this.terrain.mesh);
    const maskTex = this.terrain.material.uniforms.uMask.value as THREE.Texture;
    for (const l of sim.L.liquids) {
      const lay = new LiquidLayer(l.type, l, maskTex, v, sim.L.w, sim.L.h);
      lay.mesh.renderOrder = 26;
      p.worldScene.add(lay.mesh);
      this.liquids.push(lay);
    }
    this.magma = new LiquidLayer('lava', { x: 0, y: sim.L.h + 10, w: 1, h: 1 }, maskTex, v, sim.L.w, sim.L.h);
    this.magma.mesh.renderOrder = 27;
    this.magma.mesh.visible = false;
    p.worldScene.add(this.magma.mesh);
    this.ents = new SpriteBatch(A.texture, A.size, v, 1024);
    this.ents.mesh.renderOrder = 30;
    p.worldScene.add(this.ents.mesh);
    this.actors = new SpriteBatch(A.texture, A.size, v, 1024);
    this.actors.mesh.renderOrder = 40;
    p.worldScene.add(this.actors.mesh);
    this.front = new SpriteBatch(A.texture, A.size, v, 512);
    this.front.mesh.renderOrder = 45;
    p.worldScene.add(this.front.mesh);
    this.debris = new Particles(v, 3000, false);
    this.debris.points.renderOrder = 50;
    p.worldScene.add(this.debris.points);

    if (!sharedLightTex) sharedLightTex = makeLightTexture();
    this.lights = new SpriteBatch(sharedLightTex, 64, v, 512, THREE.AdditiveBlending);
    p.lightScene.add(this.lights.mesh);

    this.glow = new SpriteBatch(A.texture, A.size, v, 1024, THREE.AdditiveBlending);
    this.glow.mesh.renderOrder = 60;
    p.overlayScene.add(this.glow.mesh);
    this.sparks = new Particles(v, 3000, true);
    this.sparks.points.renderOrder = 61;
    p.overlayScene.add(this.sparks.points);
    this.over = new SpriteBatch(A.texture, A.size, v, 4096);
    this.over.mesh.renderOrder = 70;
    p.overlayScene.add(this.over.mesh);

    const amb = bgSet.ambient;
    const lvlAmb = (sim.L.def as { ambient?: [number, number, number] }).ambient;
    p.ambient.setRGB(...(lvlAmb ?? amb));

    // debris colours per material from the atlas params row
    const ctx = art.materials[realm].getContext('2d')!;
    for (let m = 0; m < 10; m++) {
      const d = ctx.getImageData(m * 64 + 3, 112, 2, 1).data;
      const body = ctx.getImageData(m * 64 + 20, 20, 1, 1).data;
      const c1: [number, number, number] = d[3] > 0 ? [d[0] / 255, d[1] / 255, d[2] / 255] : [body[0] / 255, body[1] / 255, body[2] / 255];
      const c2: [number, number, number] = d[7] > 0 ? [d[4] / 255, d[5] / 255, d[6] / 255] : c1;
      this.debrisColors[m] = [c1, c2];
    }
    this.crusherTops = sim.L.crushers.map((c) => {
      let y = c.y - 17;
      while (y > 0 && sim.terrain.get(c.x, y) === 0) y--;
      return y;
    });
  }

  dispose(): void {
    this.terrain.dispose();
    this.bg.dispose();
    for (const l of this.liquids) l.dispose();
    this.magma.dispose();
    this.matTex.dispose();
    this.backTex.dispose();
    this.p.clearScenes();
  }

  // ------------------------------------------------------------------ helpers

  private f(key: string, i = 0): FrameRef {
    return this.atlas.frame(key, i);
  }

  private frames(key: string): number {
    return this.atlas.anim(key).frames.length;
  }

  text(batch: SpriteBatch, s: string, x: number, y: number, r = 1, g = 1, b = 1, a = 1, align: 'left' | 'center' = 'center', shadow = true): void {
    let w = 0;
    for (const ch of s) w += (this.atlas.glyphs.get(ch) ?? this.atlas.glyphs.get(ch.toUpperCase()))?.w ?? 4;
    w += s.length - 1;
    let cx = align === 'center' ? Math.round(x - w / 2) : Math.round(x);
    for (const ch of s) {
      const gl = this.atlas.glyphs.get(ch) ?? this.atlas.glyphs.get(ch.toUpperCase());
      if (!gl) { cx += 4; continue; }
      if (shadow) batch.push(gl, cx + 1, y + 1, { r: 0.05, g: 0.03, b: 0.08, a: a * 0.85 });
      batch.push(gl, cx, y, { r, g, b, a });
      cx += gl.w + 1;
    }
  }

  private light(x: number, y: number, radius: number, r: number, g: number, b: number, k = 1): void {
    const s = (radius * 2) / 64;
    this.lights.push({ x: 0, y: 0, w: 64, h: 64, ax: 32, ay: 32 }, x, y, { sx: s, sy: s, r: r * k, g: g * k, b: b * k, a: 1, smooth: true });
  }

  // ------------------------------------------------------------------ events → juice

  handleEvents(events: SimEvent[], sim: Sim): void {
    for (const e of events) this.event(e, sim);
  }

  private burst(p: Particles, x: number, y: number, n: number, c: [number, number, number], speed: number, life: number, grav: number, size = 1, collide = false): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      p.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s - speed * 0.3, life * (0.6 + Math.random() * 0.6), c[0], c[1], c[2], 1, size, grav, { collide });
    }
  }

  private matDebris(sim: Sim, x: number, y: number, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const px = Math.round(x + (Math.random() - 0.5) * 8), py = Math.round(y + (Math.random() - 0.5) * 8);
      let m = sim.terrain.get(px, py);
      if (m === 0) m = sim.terrain.get(px, py + 2) || 1;
      const cols = this.debrisColors[m] ?? this.debrisColors[1];
      const c = cols[Math.random() < 0.5 ? 0 : 1];
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const s = speed * (0.3 + Math.random() * 0.8);
      this.debris.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 50 + Math.random() * 60, c[0], c[1], c[2], 1, Math.random() < 0.25 ? 2 : 1, 0.12, { collide: true });
    }
  }

  private popup(text: string, x: number, y: number, c: [number, number, number] = [1, 0.9, 0.5]): void {
    this.popups.push({ text, x, y, life: 50, r: c[0], g: c[1], b: c[2] });
  }

  private event(e: SimEvent, sim: Sim): void {
    const GOLD: [number, number, number] = [1, 0.82, 0.35];
    switch (e.type) {
      case 'spawn': this.burst(this.sparks, e.x, e.y - 4, 8, GOLD, 0.8, 30, 0); break;
      case 'assign': {
        const c = SKILL_COLORS[e.s as SkillId] ?? GOLD;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          this.sparks.spawn(e.x, e.y - 6, Math.cos(a) * 1.4, Math.sin(a) * 1.4, 18, c[0], c[1], c[2], 1, 1, 0, { drag: 0.88 });
        }
        this.popup(e.s === 'blast' ? 'RUNE' : (e.s ?? '').toUpperCase(), e.x, e.y - 18, c);
        break;
      }
      case 'dig': case 'bash': case 'mine': this.matDebris(sim, e.x, e.y, e.type === 'dig' ? 5 : 7, 1.6); break;
      case 'plank': {
        this.burst(this.sparks, e.x, e.y - 1, 4, GOLD, 0.6, 20, 0.02);
        if ((e.v ?? 99) <= 3 && (e.v ?? 0) > 0) this.popup(String(e.v), e.x, e.y - 16, [1, 0.6, 0.3]);
        break;
      }
      case 'blast': {
        const r = e.v ?? 13;
        this.matDebris(sim, e.x, e.y, 50, 3.2);
        this.burst(this.sparks, e.x, e.y, 40, [1, 0.55, 0.25], 2.6, 30, 0.04, 1);
        this.burst(this.sparks, e.x, e.y, 20, [1, 0.95, 0.7], 1.5, 18, 0, 2);
        this.tempLights.push({ x: e.x, y: e.y, r: r * 6, c: [1.6, 0.9, 0.5], life: 24, max: 24 });
        this.shake = Math.max(this.shake, 7);
        this.flash = [1, 0.85, 0.6, 0.22];
        break;
      }
      case 'death': {
        const cause = e.s ?? '';
        const fire = cause === 'lava' || cause === 'fire' || cause === 'sweep' || cause === 'magma' || cause === 'meteor';
        const c: [number, number, number] = fire ? [1, 0.5, 0.2] : cause === 'water' ? [0.6, 0.85, 1] : GOLD;
        for (let i = 0; i < 12; i++) this.sparks.spawn(e.x + (Math.random() - 0.5) * 6, e.y - Math.random() * 10, (Math.random() - 0.5) * 0.5, -0.3 - Math.random() * 0.6, 50 + Math.random() * 30, c[0], c[1], c[2], 0.9, 1, -0.004, { drag: 0.98 });
        break;
      }
      case 'saved': {
        this.burst(this.sparks, e.x, e.y - 8, 18, GOLD, 1.4, 35, 0.01);
        this.popup('+1', e.x, e.y - 30, [0.7, 1, 0.6]);
        this.tempLights.push({ x: e.x, y: e.y - 12, r: 40, c: [1, 0.9, 0.5], life: 20, max: 20 });
        break;
      }
      case 'boulder_impact': this.matDebris(sim, e.x, e.y, Math.min(14, Math.round((e.v ?? 2) * 3)), 1.2); this.shake = Math.max(this.shake, Math.min(4, (e.v ?? 0) * 1.2)); break;
      case 'stone_harden': this.burst(this.sparks, e.x, e.y - 2, 24, [1, 0.9, 0.8], 0.9, 60, -0.01, 1); break;
      case 'brittle_crack': this.matDebris(sim, e.x, e.y, 6, 0.8); break;
      case 'brittle_break': this.matDebris(sim, e.x, e.y, 30, 1.6); this.shake = Math.max(this.shake, 3); break;
      case 'spindle': this.burst(this.sparks, e.x, e.y - 6, 40, GOLD, 2, 50, 0.02, 1); this.popup('SPINDLE!', e.x, e.y - 24, [1, 0.85, 0.3]); break;
      case 'plate_on': case 'lever': this.burst(this.sparks, e.x, e.y - 2, 10, [0.5, 0.95, 1], 0.9, 25, 0); break;
      case 'gate_move': this.matDebris(sim, e.x, e.y, 4, 0.8); break;
      case 'seidr_on': this.burst(this.sparks, e.x, e.y - 4, 20, [0.4, 1, 0.95], 1.2, 40, -0.01); break;
      case 'seidr_beam': this.tempLights.push({ x: e.x, y: e.y, r: 60, c: [0.6, 1.4, 1.4], life: 25, max: 25 }); break;
      case 'boss_hit': {
        this.shake = Math.max(this.shake, 8);
        this.flash = [1, 1, 1, 0.35];
        this.burst(this.sparks, e.x, e.y, 50, [0.6, 1, 1], 2.5, 40, 0.02, 1);
        this.popup(`${e.v ?? ''}`, e.x, e.y - 30, [0.6, 1, 1]);
        break;
      }
      case 'boss_defeat': this.shake = 14; this.flash = [1, 1, 1, 0.6]; this.burst(this.sparks, e.x, e.y, 120, [1, 0.9, 0.6], 3.5, 80, 0.02, 2); break;
      case 'venom_hit': this.matDebris(sim, e.x, e.y, 18, 2); this.burst(this.sparks, e.x, e.y, 16, [0.5, 1, 0.3], 1.5, 30, 0.05); this.shake = Math.max(this.shake, 3); break;
      case 'meteor': this.matDebris(sim, e.x, e.y, 30, 2.6); this.burst(this.sparks, e.x, e.y, 30, [1, 0.5, 0.15], 2.2, 35, 0.04); this.tempLights.push({ x: e.x, y: e.y, r: 70, c: [1.5, 0.6, 0.2], life: 20, max: 20 }); this.shake = Math.max(this.shake, 6); break;
      case 'ice_shatter': this.burst(this.debris, e.x, e.y - 4, 16, [0.8, 0.95, 1], 1.8, 50, 0.12, 1, true); break;
      case 'freeze': this.burst(this.sparks, e.x, e.y - 6, 14, [0.7, 0.95, 1], 1, 30, 0); break;
      case 'slam': this.shake = Math.max(this.shake, 9); this.matDebris(sim, e.x, e.y, 30, 2.4); break;
      case 'hazard_burrow': this.shake = Math.max(this.shake, 6); this.matDebris(sim, e.x, e.y, 40, 3); break;
      case 'hazard_lash': case 'hazard_sweep': this.shake = Math.max(this.shake, 4); break;
      case 'clink': this.burst(this.sparks, e.x, e.y, 6, [1, 1, 0.8], 1.2, 12, 0.05); break;
      case 'crusher_break': this.burst(this.sparks, e.x, e.y, 40, [1, 0.75, 0.35], 2.4, 30, 0.08, 1); this.matDebris(sim, e.x, e.y, 16, 2); this.shake = Math.max(this.shake, 6); this.popup('WRECKED!', e.x, e.y - 20, [1, 0.7, 0.3]); break;
      case 'bowled': this.burst(this.debris, e.x, e.y, 6, [0.8, 0.7, 0.6], 1, 20, 0.1, 1, true); break;
      case 'quota_met': this.popup('QUOTA MET!', e.x, e.y - 44, [0.6, 1, 0.6]); break;
      case 'land': this.burst(this.debris, e.x, e.y, 4, this.debrisColors[sim.terrain.get(e.x, e.y + 1)]?.[0] ?? [0.6, 0.5, 0.4], 0.6, 20, 0.08, 1, true); break;
    }
  }

  // ------------------------------------------------------------------ frame

  draw(inp: ViewInput): void {
    const { sim, time } = inp;
    this.terrain.sync(sim.terrain);
    this.terrain.setTime(time);
    this.bg.setTime(time);
    for (let i = 0; i < this.liquids.length; i++) this.liquids[i].set(sim.L.liquids[i], time);

    // decay effects
    this.shake *= Math.pow(0.86, inp.dt);
    if (this.shake < 0.2) this.shake = 0;
    this.flash[3] *= Math.pow(0.85, inp.dt);
    if (this.flash[3] < 0.01) this.flash[3] = 0;

    for (const b of [this.behind, this.ents, this.actors, this.front, this.lights, this.glow, this.over]) b.begin();

    this.drawEntities(sim, time);
    this.drawBodies(sim);
    this.drawBoss(sim, time);
    this.drawWyrds(sim, inp);
    this.drawHazards(sim, time);
    if (inp.showForesight && !inp.rewinding) this.drawForesight(sim, inp);
    this.drawPopups(inp.dt);
    this.atmosphere(sim, inp.dt);

    // temp lights
    for (const l of this.tempLights) {
      const k = l.life / l.max;
      this.light(l.x, l.y, l.r, l.c[0], l.c[1], l.c[2], k);
      l.life -= inp.dt;
    }
    this.tempLights = this.tempLights.filter((l) => l.life > 0);

    this.debris.update(inp.dt, (x, y) => sim.terrain.get(x, y) !== 0);
    this.sparks.update(inp.dt, () => false);

    for (const b of [this.behind, this.ents, this.actors, this.front, this.lights, this.glow, this.over]) b.end();
  }

  private drawEntities(sim: Sim, time: number): void {
    const L = sim.L, tick = sim.d.tick, E = this.ents;
    const def = L.def;
    // decor + level lights
    for (const e of def.entities) {
      if (e.type === 'decor') {
        const n = this.frames(e.sprite);
        E.push(this.f(e.sprite, Math.floor(time * 8) % Math.max(1, n)), e.x, e.y, { flip: e.flip });
        if (e.sprite === 'torch' || e.sprite === 'brazier') {
          const fl = 0.85 + 0.15 * Math.sin(time * 13 + e.x) * Math.sin(time * 7.3 + e.y);
          this.light(e.x, e.y - 12, 70, 1.0, 0.62, 0.3, fl);
        } else if (e.sprite === 'crystal') this.light(e.x, e.y - 8, 50, 0.4, 0.8, 1.0, 0.8);
      } else if (e.type === 'light') {
        const c = hexRgb(e.color);
        const fl = e.flicker ? 1 - e.flicker * 0.5 * (1 + Math.sin(time * 11 + e.x) * Math.sin(time * 6.1 + e.y)) : 1;
        this.light(e.x, e.y, e.r, c[0], c[1], c[2], fl);
      }
    }
    // lava glow
    for (const l of L.liquids) {
      if (l.type !== 'lava') continue;
      for (let x = l.x + 16; x < l.x + l.w; x += 36) this.light(x, l.y + 2, 60, 1.0, 0.45, 0.15, 0.9 + 0.1 * Math.sin(time * 2 + x));
    }
    // entrance
    const en = L.entrance;
    if (tick < 30) E.push(this.f('gate.entrance.open', Math.min(this.frames('gate.entrance.open') - 1, Math.floor(tick / 5))), en.x, en.y);
    else E.push(this.f('gate.entrance.idle', Math.floor(time * 8)), en.x, en.y);
    this.light(en.x, en.y + 14, 55, 1, 0.8, 0.45, 0.8);
    // exit
    const ex = L.exit;
    if (sim.exitOpen) {
      E.push(this.f('gate.exit', Math.floor(time * 10)), ex.x, ex.y);
      this.light(ex.x, ex.y - 14, 70, 0.9, 0.85, 0.5, 1.1);
      if (Math.random() < 0.3) this.sparks.spawn(ex.x + (Math.random() - 0.5) * 16, ex.y - Math.random() * 24, 0, -0.3, 40, 1, 0.85, 0.4, 0.8, 1, 0);
    } else {
      E.push(this.f('gate.exit.locked'), ex.x, ex.y);
      this.light(ex.x, ex.y - 14, 40, 0.9, 0.2, 0.15, 0.7);
    }
    // plates / levers
    L.plates.forEach((p, i) => E.push(this.f(sim.d.plates[i] ? 'plate.down' : 'plate.up'), p.x + p.w / 2, p.y + 1));
    L.levers.forEach((l, i) => {
      E.push(this.f(sim.d.levers[i] ? 'switch.on' : 'switch.off'), l.x, l.y);
      if (sim.d.levers[i]) this.light(l.x, l.y - 10, 30, 0.4, 0.9, 1, 0.8);
    });
    // linked gate indicators: a glowing rune on the gate top when its links are satisfied
    // vents
    for (const v of L.vents) {
      const on = sim.ventOn(v);
      for (let x = v.x; x < v.x + v.w; x += 16) E.push(this.f('vent', on ? Math.floor(time * 16) : 0), x + 8, v.y);
      if (on && Math.random() < 0.6 * (v.w / 16)) this.sparks.spawn(v.x + Math.random() * v.w, v.y - 4, 0, -1.2 - Math.random() * 0.8, v.h / 1.6, 0.6, 0.8, 1, 0.35, 1, 0, { drag: 1 });
    }
    // spikes
    for (const s of L.spikes) for (let x = s.x; x < s.x + s.w; x += 8) E.push(this.f('spikes'), x, s.y);
    // crushers
    L.crushers.forEach((c, i) => {
      const st = sim.crusherBottom(i);
      const broken = sim.d.broken[i];
      let jx = 0;
      if (st.warn) jx = Math.sin(time * 60) > 0 ? 1 : -1;
      const top = this.crusherTops[i];
      for (let y = st.hb - 16 - 8; y > top - 8; y -= 8) E.push(this.f('crusher.shaft'), c.x + jx, y, broken ? { r: 0.6, g: 0.55, b: 0.55 } : undefined);
      if (broken) {
        E.push(this.f('crusher.head'), c.x + 2, st.hb + 1, { rot: 0.28, r: 0.55, g: 0.5, b: 0.5, smooth: true });
        if (Math.random() < 0.04) this.sparks.spawn(c.x + (Math.random() - 0.5) * 16, st.hb - 4, (Math.random() - 0.5) * 0.6, -0.4, 18, 1, 0.7, 0.3, 1, 1, 0.05);
      } else E.push(this.f('crusher.head'), c.x + jx, st.hb);
    });
    // fire jets
    L.firejets.forEach((f, i) => {
      E.push(this.f('firejet.base'), f.x, f.y);
      const st = sim.firejetState(i);
      if (st === 2) {
        const fr = this.f('firejet.flame', Math.floor(time * 16));
        this.glow.push(fr, f.x, f.y - 5, { sy: f.h / 32 });
        this.light(f.x, f.y - f.h / 2, f.h + 20, 1.2, 0.6, 0.2);
        if (Math.random() < 0.5) this.sparks.spawn(f.x + (Math.random() - 0.5) * 6, f.y - f.h * Math.random(), (Math.random() - 0.5) * 0.4, -1, 25, 1, 0.6, 0.2, 1, 1, 0);
      } else if (st === 1 && Math.random() < 0.5) {
        this.sparks.spawn(f.x + (Math.random() - 0.5) * 4, f.y - 6, 0, -0.6, 14, 1, 0.5, 0.2, 1, 1, 0);
      }
    });
    // spindle
    if (L.spindle && !sim.d.spindle) {
      const bob = Math.round(Math.sin(time * 3) * 1.5);
      E.push(this.f('spindle', Math.floor(time * 10)), L.spindle.x, L.spindle.y + bob);
      this.light(L.spindle.x, L.spindle.y - 6, 40, 1, 0.85, 0.4, 0.9);
      if (Math.random() < 0.15) this.sparks.spawn(L.spindle.x + (Math.random() - 0.5) * 10, L.spindle.y - 6 + (Math.random() - 0.5) * 10, 0, -0.2, 30, 1, 0.9, 0.4, 1, 1, 0);
    }
    // seidr stones
    const boss = sim.d.boss;
    L.seidr.forEach((s, i) => {
      const on = boss && boss.hp > 0 && boss.stone === i;
      E.push(this.f(on ? 'seidr.on' : 'seidr.off', Math.floor(time * 8)), s.x, s.y + 1);
      if (on) {
        this.light(s.x, s.y - 6, 60, 0.4, 1.1, 1.1, 0.9 + 0.2 * Math.sin(time * 6));
        if (Math.random() < 0.4) this.sparks.spawn(s.x + (Math.random() - 0.5) * 14, s.y - 2, 0, -0.5 - Math.random() * 0.5, 40, 0.4, 1, 0.95, 1, 1, 0);
        // a pulsing guide arrow above the active stone
        this.text(this.over, 'v', s.x, s.y - 24 + Math.round(Math.sin(time * 5) * 2), 0.5, 1, 0.95, 1);
      }
    });
    // rune charges
    for (const c of sim.d.charges) {
      const k = 1 - c.fuse / 90;
      const fr = this.f('rune.charge', Math.floor(time * (6 + k * 18)));
      E.push(fr, c.x, c.y, { fr: 1, fg: 0.2, fb: 0.1, fa: k * 0.6 * (0.5 + 0.5 * Math.sin(time * 20)) });
      this.light(c.x, c.y - 3, 26 + k * 20, 1, 0.3, 0.2, 0.8);
      this.text(this.over, String(Math.ceil(c.fuse / 30)), c.x, c.y - 16, 1, 0.5 + 0.5 * (1 - k), 0.3, 1);
    }
  }

  private drawBodies(sim: Sim): void {
    for (const b of sim.d.bodies) {
      if (b.gone) continue;
      const s = (b.r * 2 + 1) / 24;
      this.actors.push(this.f('boulder'), b.x, b.y, { rot: b.a, sx: s, sy: s, smooth: true });
    }
  }

  private wyrdAnim(w: Wyrd, tick: number): { key: string; i: number; dx: number; dy: number } {
    const g = tick + w.id * 3;
    switch (w.st) {
      case 'walk': return { key: 'wyrd.walk', i: (g >> 1) & 7, dx: 0, dy: 0 };
      case 'wait': return { key: 'wyrd.walk', i: 0, dx: 0, dy: 0 };
      case 'fall': return { key: 'wyrd.fall', i: (g >> 1) & 3, dx: 0, dy: 0 };
      case 'tumble': return { key: 'wyrd.tumble', i: (w.t >> 1) & 3, dx: 0, dy: -4 };
      case 'land': return { key: 'wyrd.land', i: Math.min(1, w.t), dx: 0, dy: 0 };
      case 'warden': return { key: 'wyrd.warden', i: (g >> 3) & 3, dx: 0, dy: 0 };
      case 'weave': return { key: 'wyrd.weave', i: w.t % 16, dx: 0, dy: 0 };
      case 'shrug': return { key: 'wyrd.shrug', i: Math.min(7, w.t), dx: 0, dy: 0 };
      case 'bash': return { key: 'wyrd.bash', i: w.t % 16, dx: 0, dy: 0 };
      case 'mine': return { key: 'wyrd.mine', i: ((w.t * 2) + 4) % 16, dx: 0, dy: 0 };
      case 'dig': return { key: 'wyrd.dig', i: w.t % 8, dx: 0, dy: 0 };
      case 'climb': return { key: 'wyrd.climb', i: (w.t >> 1) & 7, dx: -3 * w.dir, dy: 0 };
      case 'hoist': return { key: 'wyrd.hoist', i: Math.min(7, w.t), dx: -3 * w.dir, dy: 0 };
      case 'glide_open': return { key: 'wyrd.glide_open', i: Math.min(3, w.t), dx: 0, dy: 0 };
      case 'glide': return { key: 'wyrd.glide', i: (g >> 3) & 3, dx: 0, dy: 0 };
      case 'plant': return { key: 'wyrd.plant', i: Math.min(7, w.t), dx: 0, dy: 0 };
      case 'leap': {
        let i = w.t < 4 ? w.t >> 1 : w.vy < -1 ? 2 : w.vy < 0.5 ? 3 : 4;
        if (i > 5) i = 5;
        return { key: 'wyrd.leap', i, dx: 0, dy: 0 };
      }
      case 'frozen': return { key: 'wyrd.frozen', i: 0, dx: 0, dy: 0 };
      case 'exit': return { key: 'wyrd.exit', i: Math.min(7, w.t), dx: 0, dy: 0 };
      case 'unravel': return { key: 'wyrd.unravel', i: Math.min(11, w.t), dx: 0, dy: 0 };
      case 'burn': return { key: 'wyrd.burn', i: Math.min(9, w.t), dx: 0, dy: 0 };
      case 'drown': return { key: 'wyrd.drown', i: Math.min(9, w.t), dx: 0, dy: 0 };
      default: return { key: 'wyrd.walk', i: 0, dx: 0, dy: 0 };
    }
  }

  private drawWyrds(sim: Sim, inp: ViewInput): void {
    const tick = sim.d.tick;
    for (const w of sim.d.wyrds) {
      if (w.st === 'gone') continue;
      const an = this.wyrdAnim(w, tick);
      const hovered = inp.hover === w.id;
      const o: SpriteOpts = { flip: w.dir < 0 };
      if (hovered && isAlive(w)) {
        o.fr = 1; o.fg = 1; o.fb = 1; o.fa = 0.18 + 0.1 * Math.sin(inp.time * 10);
      }
      const key = hoodSuffix && this.atlas.has(an.key + hoodSuffix) ? an.key + hoodSuffix : an.key;
      this.actors.push(this.f(key, an.i), w.x + an.dx, w.y + an.dy, o);
      if (isAlive(w)) {
        if (w.climber && w.glider) {
          this.front.push(this.f('mark.climber'), w.x - 4, w.y - 14);
          this.front.push(this.f('mark.glider'), w.x + 4, w.y - 14);
        } else if (w.climber) this.front.push(this.f('mark.climber'), w.x, w.y - 14);
        else if (w.glider) this.front.push(this.f('mark.glider'), w.x, w.y - 14);
      }
      if (w.st === 'warden' && (tick & 31) < 2) this.sparks.spawn(w.x + (Math.random() < 0.5 ? -5 : 5), w.y - 6, 0, -0.3, 20, 1, 0.9, 0.5, 1, 1, 0);
      // a faint golden thread glint on each living wyrdling keeps them readable in dark caves
      if (isAlive(w)) this.light(w.x, w.y - 6, 14, 0.5, 0.42, 0.25, 0.5);
    }
    // hover ring
    if (inp.hover !== null) {
      const w = sim.d.wyrds[inp.hover];
      if (w && isAlive(w)) {
        const bad = inp.armed !== null && !inp.canAssign;
        const ring = this.f('cursor.ring', Math.floor(inp.time * 10));
        this.over.push(ring, w.x, w.y - 6, bad ? { r: 1, g: 0.35, b: 0.3 } : { r: 1, g: 0.95, b: 0.6 });
        // the tag names what a click would grant; a click that grants nothing gets no tag (the ring says why)
        if (inp.armed !== null && inp.canAssign) this.text(this.over, SKILL_INFO[inp.armed].name, w.x, w.y - 28, 0.95, 0.95, 0.85, 0.95);
      }
    }
  }

  private drawBoss(sim: Sim, time: number): void {
    const b = sim.d.boss;
    if (!b) return;
    const tick = sim.d.tick;
    const flash: SpriteOpts = b.hurt > 0 && (b.hurt & 2) ? { fr: 1, fg: 1, fb: 1, fa: 0.7 } : {};
    const dying = b.hp <= 0;
    const fade = dying ? Math.max(0, 1 - b.dying / 90) : 1;
    if (fade <= 0) return;
    const shakeX = dying ? Math.round(Math.sin(time * 50) * 3) : 0;
    const phase = bossPhase(b);
    if (b.kind === 'wyrm') {
      const attacking = b.act === 'venom' && b.at >= 10;
      const sink = (b.act === 'burrow' ? wyrmSink(b.at) : 0) + (dying ? b.dying * 0.9 : 0);
      const bob = Math.sin(time * 2) * 3;
      const hx = b.x + shakeX, hy = b.y + bob + sink;
      // The neck rises out of the ground behind the perch. Everything is drawn before the terrain,
      // so the ground hides the part below the surface, and the whole Wyrm once it burrows.
      const entryX = b.x + 40;
      const surf = surfaceY(sim, entryX, b.y);
      const o: SpriteOpts = { ...flash, a: fade };
      this.wyrmNeck(this.behind, [
        hx + 12, hy + 8,
        hx + 34 + Math.sin(time * 2.2) * 4, hy + 16,
        entryX + 4 + Math.sin(time * 1.7 + 1) * 5, surf - 60 + sink,
        entryX, surf + 40 + sink,
      ], 0.9, 1.15, o);
      const head = b.hurt > 0 ? 'wyrm.head.hurt' : attacking ? 'wyrm.head.open' : 'wyrm.head.idle';
      this.behind.push(this.f(head, Math.floor(time * 3)), hx, hy, { ...o, flip: true });
      if (b.act === 'burrow' && ((b.at > 9 && b.at < 20) || (b.at > 75 && b.at < 86))) this.matDebris(sim, entryX + (Math.random() - 0.5) * 24, surf, 2, 2.2);
      if (sink < 60) {
        if (attacking) this.light(hx - 18, hy, 40, 0.5, 1, 0.3, 0.9);
        this.light(hx, hy, 80, 0.5, 0.6, 0.4, 0.4);
      }
    } else if (b.kind === 'jotunn') {
      const pose = b.hurt > 0 ? 'jotunn.body.hurt' : b.act === 'breath' && b.at < 40 ? 'jotunn.body.inhale' : b.act === 'slam' && b.at < 36 ? 'jotunn.body.slam' : 'jotunn.body.idle';
      const breathe = Math.round(Math.sin(time * 1.5) * 1.5);
      this.behind.push(this.f(pose, Math.floor(time * 1.5)), b.x + shakeX, b.y + breathe + (dying ? b.dying * 0.8 : 0), { ...flash, flip: true, a: fade });
      this.light(b.x - 30, b.y - 78, 50, 0.4, 0.8, 1.2, 0.8 + phase * 0.2);
    } else {
      const pose = b.hurt > 0 ? 'herald.body.hurt' : b.act === 'sweep' && b.at < 48 ? 'herald.body.raise' : 'herald.body.idle';
      const sway = Math.round(Math.sin(time * 1.2) * 2);
      this.behind.push(this.f(pose, Math.floor(time * 2)), b.x + sway + shakeX, b.y + (dying ? b.dying * 0.8 : 0), { ...flash, flip: true, a: fade });
      // resting sword
      if (!(b.act === 'sweep' && b.at >= 48)) {
        const rot = Math.PI * 0.62 + Math.sin(time * 1.3) * 0.05;
        this.behind.push(this.f('herald.sword'), b.x - 34 + sway, b.y - 60, { rot, flip: false, smooth: true, a: fade });
      }
      this.light(b.x - 10, b.y - 70, 110, 1.3, 0.55, 0.2, 0.9 + 0.1 * Math.sin(time * 5));
    }
    void tick;
  }

  /** Wyrm neck: overlapping body segments along a cubic Bézier from the head (p0) into the ground (p3). */
  private wyrmNeck(batch: SpriteBatch, c: number[], s0: number, s1: number, o: SpriteOpts): void {
    const N = 48;
    const xs: number[] = [], ys: number[] = [], len: number[] = [0];
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
      xs.push(a * c[0] + b * c[2] + d * c[4] + e * c[6]);
      ys.push(a * c[1] + b * c[3] + d * c[5] + e * c[7]);
      if (i) len.push(len[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
    }
    const total = len[N];
    const segs: number[][] = [];
    let j = 0;
    for (let dist = 4; dist < total; dist += 8) {
      while (j < N - 1 && len[j + 1] < dist) j++;
      const k = (dist - len[j]) / Math.max(1e-6, len[j + 1] - len[j]);
      // rotation points the sprite's +x toward the tail, which puts its belly (+y) on the front side
      segs.push([xs[j] + (xs[j + 1] - xs[j]) * k, ys[j] + (ys[j + 1] - ys[j]) * k,
        Math.atan2(ys[j + 1] - ys[j], xs[j + 1] - xs[j]), s0 + (s1 - s0) * (dist / total)]);
    }
    for (let i = segs.length - 1; i >= 0; i--) {
      const [x, y, rot, sc] = segs[i];
      batch.push(this.f('wyrm.body'), x, y, { ...o, rot, sx: sc, sy: sc, smooth: true });
    }
  }

  private drawHazards(sim: Sim, time: number): void {
    const A = this.atlas;
    const W = A.white;
    const blink = 0.5 + 0.5 * Math.sin(time * 14);
    // projectiles and their landing markers
    for (const p of sim.d.projectiles) {
      const key = p.kind === 'venom' ? 'wyrm.venom' : p.kind === 'icicle' ? 'jotunn.icicle' : 'herald.fireball';
      if (p.t > 0 || p.kind !== 'icicle') {
        const rot = p.kind === 'icicle' ? 0 : Math.atan2(p.vy, p.vx);
        this.actors.push(this.f(key, Math.floor(time * 12)), p.x, p.y, { rot: p.kind === 'icicle' ? 0 : rot, smooth: true });
        const c: [number, number, number] = p.kind === 'venom' ? [0.4, 1, 0.3] : p.kind === 'icicle' ? [0.5, 0.8, 1] : [1.3, 0.55, 0.2];
        this.light(p.x, p.y, 34, c[0], c[1], c[2], 0.9);
        if (p.kind !== 'icicle' && Math.random() < 0.7) this.sparks.spawn(p.x, p.y, -p.vx * 0.2, -p.vy * 0.2, 18, c[0], c[1], c[2], 0.8, 1, 0);
      } else {
        // icicle hanging and trembling before it drops
        const jx = Math.sin(time * 70) > 0 ? 1 : 0;
        this.actors.push(this.f(key), p.x + jx, p.y);
      }
      this.over.push(this.f('target', Math.floor(time * 10)), p.tx, p.ty - 3, { r: 1, g: 0.25, b: 0.2, a: 0.55 + 0.45 * blink });
    }
    for (const h of sim.d.hazards) this.drawHazard(sim, h, time, blink, W);
  }

  private drawHazard(sim: Sim, h: Hazard, time: number, blink: number, W: FrameRef): void {
    const warn = h.t < h.warn;
    const O = this.over;
    const red = (a: number) => [1, 0.18, 0.15, a] as const;
    switch (h.kind) {
      case 'burrow': {
        if (warn) {
          const k = h.t / h.warn;
          O.rect(W, h.x0 - 11, h.y0 - 40, 22, 42, ...red(0.12 + 0.18 * blink * k));
          O.push(this.f('target', Math.floor(time * 12)), h.x0, h.y0 - 3, { r: 1, g: 0.3, b: 0.2 });
          if (Math.random() < 0.5 * k) this.matDebris(sim, h.x0 + (Math.random() - 0.5) * 20, h.y0, 1, 1.2);
          this.shake = Math.max(this.shake, k * 1.5);
        } else {
          // the head bursts up out of the ground on a curved neck, leaning to one side, then sinks back
          const k = (h.t - h.warn) / h.dur;
          const rise = 50 * (k < 0.2 ? Math.sin((k / 0.2) * Math.PI / 2) : k > 0.65 ? Math.cos(((k - 0.65) / 0.35) * Math.PI / 2) : 1);
          const side = h.x0 % 2 === 0 ? -1 : 1;
          const lean = 0.42 + Math.sin(time * 14) * 0.04;
          const fx = side * Math.sin(lean), fy = -Math.cos(lean); // facing direction
          const cx = h.x0 + fx * 6, cy = h.y0 + 30 - rise;
          this.wyrmNeck(this.behind, [cx - fx * 16, cy - fy * 16, cx - fx * 30, cy - fy * 30, h.x0 - side * 2, h.y0 + 24, h.x0, h.y0 + 70], 0.85, 1, {});
          this.behind.push(this.f('wyrm.head.open', Math.floor(time * 8)), cx, cy,
            side < 0 ? { rot: Math.PI / 2 - lean, flip: true, smooth: true } : { rot: -Math.PI / 2 + lean, smooth: true });
          this.light(h.x0, h.y0 - 20, 50, 0.5, 1, 0.3, 0.6);
        }
        break;
      }
      case 'lash':
      case 'sweep': {
        if (warn) {
          const a = 0.1 + 0.2 * blink;
          O.rect(W, h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0, ...red(a));
          for (let x = h.x0; x < h.x1; x += 12) this.text(O, '!', x + ((Math.floor(time * 20)) % 12), h.y0 - 8, 1, 0.3, 0.25, blink);
        } else {
          const y = (h.y0 + h.y1) / 2;
          if (h.kind === 'lash') {
            // the tail whips across the floor tip-first; a ripple runs down it and each segment follows the wave's slope
            const n = 13;
            for (let i = n - 1; i >= 0; i--) {
              const ph = time * 12 - i * 0.7;
              const sc = 0.62 + 0.33 * (i / (n - 1));
              this.actors.push(this.f(i === 0 ? 'wyrm.tail' : 'wyrm.body'), h.p + i * 8, y + Math.sin(ph) * 3,
                { sx: sc, sy: sc, smooth: true, rot: Math.atan(-Math.cos(ph) * 3 * 0.7 / 8) });
            }
          } else {
            this.glow.push(this.f('herald.sword'), h.p, y, { rot: Math.PI, smooth: true });
            this.light(h.p, y, 70, 1.4, 0.6, 0.2);
            for (let i = 0; i < 3; i++) this.sparks.spawn(h.p + Math.random() * 30, y + (Math.random() - 0.5) * 20, 1.5, 0, 20, 1, 0.5, 0.15, 1, 1, 0);
          }
        }
        break;
      }
      case 'breath': {
        if (warn) {
          O.rect(W, h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0, 0.5, 0.85, 1, 0.08 + 0.16 * blink);
        } else {
          for (let i = 0; i < 6; i++) this.sparks.spawn(h.x0 + Math.random() * (h.x1 - h.x0), h.y0 + Math.random() * (h.y1 - h.y0), -0.8 - Math.random(), (Math.random() - 0.5) * 0.4, 30, 0.75, 0.95, 1, 0.8, Math.random() < 0.3 ? 2 : 1, 0);
          O.rect(W, h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0, 0.7, 0.9, 1, 0.12);
        }
        break;
      }
      case 'slam': {
        // a giant ice arm punches down through the ceiling and draws back up; drawn before the
        // terrain so the ceiling hides the arm where it passes through
        let ceil = h.y0 - 40;
        while (ceil > 0 && !sim.solid(h.x0, ceil)) ceil--;
        const hidden = ceil + 30; // fist bottom tucked up inside the ceiling
        const arm = (fistY: number) => {
          for (let y = fistY - 30; y > ceil - 16; y -= 16) this.behind.push(this.f('jotunn.arm'), h.x0, y - 16);
          this.behind.push(this.f('jotunn.fist'), h.x0, fistY);
        };
        if (warn) {
          const k = h.t / h.warn;
          const r = 12 + (1 - k) * 10;
          O.push(this.f('target', Math.floor(time * 12)), h.x0, h.y0 - 3, { r: 1, g: 0.3, b: 0.25, sx: r / 7, sy: r / 14, smooth: true });
          arm(hidden + (h.y0 - hidden) * k * k - 2 * (1 - k));
          if (h.t < 6 && Math.random() < 0.6) this.matDebris(sim, h.x0 + (Math.random() - 0.5) * 20, ceil + 2, 2, 1);
        } else {
          const k = h.t - h.warn;
          if (k < 22) { const e = Math.max(0, (k - 8) / 14); arm(h.y0 + (hidden - h.y0) * e * e); }
          for (const s of [-1, 1]) {
            const x = h.x0 + s * h.p;
            if (k < h.dur) for (let i = 0; i < 3; i++) this.sparks.spawn(x, h.y0 - Math.random() * 6, s * 0.3, -0.5 - Math.random(), 16, 0.8, 0.95, 1, 0.9, 1, 0.05);
          }
        }
        break;
      }
      case 'magma': {
        const lv = magmaLevel(h);
        if (warn) {
          if (Math.random() < 0.6) this.sparks.spawn(h.x0 + Math.random() * (h.x1 - h.x0), h.y0 - 1, 0, -0.8, 20, 1, 0.5, 0.15, 1, 1, 0.02);
          O.rect(W, h.x0, h.y0, h.x1 - h.x0, 2, ...red(0.3 * blink));
        }
        if (lv !== null) {
          this.magma.mesh.visible = true;
          this.magma.set({ x: h.x0, y: Math.round(lv), w: h.x1 - h.x0, h: sim.L.h - lv }, time);
          for (let x = h.x0 + 10; x < h.x1; x += 40) this.light(x, lv, 60, 1, 0.45, 0.15, 0.9);
        }
        break;
      }
      case 'beam': {
        const dx = h.x1 - h.x0, dy = h.y1 - h.y0;
        const len = Math.sqrt(dx * dx + dy * dy);
        const rot = Math.atan2(dy, dx);
        const k = 1 - h.t / h.dur;
        const fr = { x: W.x + 1, y: W.y + 1, w: 1, h: 1, ax: 0, ay: 0.5 };
        this.glow.push(fr, h.x0, h.y0 - 4, { sx: len, sy: 5 * k + 1, rot, r: 0.4, g: 1, b: 1, a: k, smooth: true });
        this.glow.push(fr, h.x0, h.y0 - 4, { sx: len, sy: 2, rot, r: 1, g: 1, b: 1, a: k, smooth: true });
        for (let i = 0; i < 6; i++) {
          const t = Math.random();
          this.sparks.spawn(h.x0 + dx * t, h.y0 - 4 + dy * t, (Math.random() - 0.5), (Math.random() - 0.5), 20, 0.5, 1, 1, 1, 1, 0);
        }
        const core = bossCore(sim.d.boss!);
        this.light(core.x, core.y, 80, 0.6, 1.4, 1.4, k);
        break;
      }
    }
  }

  private drawForesight(sim: Sim, inp: ViewInput): void {
    const O = this.over;
    const W = this.atlas.white;
    const dot = { x: W.x + 1, y: W.y + 1, w: 1, h: 1, ax: 0, ay: 0 };
    const fate = inp.fate;
    // a branch belongs to one Wyrdling and calling; while the next one computes, the last stays hidden
    const branch = inp.branch && inp.hover !== null && inp.branch.focus === inp.hover && inp.branch.skill === inp.armed ? inp.branch : null;
    // what the branch is judged against: its own shadow run when it looks past the base horizon
    const baseline = branch?.shadow ?? fate;
    const phase = (inp.time * 30) % 4;
    const drawPath = (pts: number[], r: number, g: number, b: number, a: number, every: number) => {
      const n = pts.length / 2;
      for (let i = 1; i < n; i++) {
        if ((i + Math.floor(phase)) % every !== 0) continue;
        const fade = 1 - i / n;
        const x = Math.round(pts[i * 2]), y = Math.round(pts[i * 2 + 1] - 5);
        // a dark under-dot keeps the thread readable on bright terrain
        O.push(dot, x, y + 1, { r: 0.05, g: 0.03, b: 0.08, a: a * 0.6 * (0.35 + 0.65 * fade), sx: 2, sy: 2 });
        O.push(dot, x, y, { r, g, b, a: a * (0.45 + 0.55 * fade), sx: 2, sy: 2 });
      }
    };
    const endMarker = (e: FateEnd | undefined, bright: boolean) => {
      if (!e) return;
      if (e.kind === 'dead') O.push(this.f('skull'), e.x, e.y - 5, { a: bright ? 1 : 0.75 });
      else if (e.kind === 'saved') O.push(this.f('spark'), e.x, e.y - 8, { a: bright ? 1 : 0.75 });
    };
    if (fate) {
      for (const [id, pts] of fate.paths) {
        const e = fate.ends.get(id);
        if (branch && inp.hover === id) continue;
        const dead = e?.kind === 'dead';
        const saved = e?.kind === 'saved';
        const changed = branch && branch.ends.get(id)?.kind !== baseline?.ends.get(id)?.kind;
        if (changed) continue;
        const [r, g, b] = dead ? [1, 0.3, 0.25] : saved ? [0.6, 1, 0.55] : [1, 0.92, 0.7];
        drawPath(pts, r, g, b, dead ? 0.9 : 0.55, dead ? 2 : 3);
        endMarker(e, false);
      }
      // boulders
      for (const [, pts] of fate.bodies) drawPath(pts, 0.85, 0.75, 0.6, 0.45, 4);
      // predicted blasts
      for (let i = 0; i < fate.blasts.length; i += 4) {
        O.push(this.f('target', Math.floor(inp.time * 10)), fate.blasts[i], fate.blasts[i + 1], { r: 1, g: 0.6, b: 0.2, a: 0.6, sx: fate.blasts[i + 3] / 7, sy: fate.blasts[i + 3] / 7, smooth: true });
      }
    }
    if (branch) {
      if (branch.ghost) this.drawGhost(branch.ghost, inp.time);
      for (const [id, pts] of branch.paths) {
        const e = branch.ends.get(id);
        const base = baseline?.ends.get(id);
        const focus = inp.hover === id;
        if (!focus && base && e && base.kind === e.kind) continue;
        const dead = e?.kind === 'dead';
        const [r, g, b] = dead ? [1, 0.35, 0.3] : focus ? [1, 0.85, 0.3] : [0.7, 1, 0.6];
        // a projection's other threads stop at the usual horizon, but where a changed fate ends still shows
        drawPath(pts, r, g, b, 1, 2);
        endMarker(e, true);
      }
    }
    // the hovered Wyrdling: its own end in words, then what the calling changes for everyone
    const w = inp.hover !== null ? sim.d.wyrds[inp.hover] : undefined;
    if (!w || !isAlive(w)) return;
    const rows: Seg[][] = [];
    const own = (branch ?? fate)?.ends.get(w.id);
    if (own) {
      const [s, c] = endWords(own);
      rows.push([{ s, c }]);
    }
    if (branch) {
      if (baseline) rows.push(deltaWords(compareFates(baseline, branch)));
      if (branch.skill && sim.d.skills[branch.skill] === 1) rows.push([{ s: `uses your last ${SKILL_INFO[branch.skill].name}`, c: COST }]);
      const looking = inp.projecting && !branch.shadow;
      if (looking || !inp.projecting) rows.push([{ s: looking ? 'looking further ahead...' : inp.touch ? 'hold the 15s eye button' : 'hold Q to look 15s ahead', c: DIM }]);
    }
    // one shared centre, pulled in from the view's edges so no row is cut off
    const v = this.p.view;
    let half = 0;
    for (const r of rows) half = Math.max(half, this.rowWidth(r) / 2);
    const x = Math.max(v.x + half + 2, Math.min(v.x + v.z - half - 2, w.x));
    rows.forEach((r, i) => this.textRow(r, x, w.y - 38 - i * 10));
  }

  /** What the calling would leave: a dimmed hollow with a light outline where it digs, gold where it weaves. */
  private drawGhost(g: Ghost, time: number): void {
    const O = this.over, W = this.atlas.white;
    const dot = { x: W.x + 1, y: W.y + 1, w: 1, h: 1, ax: 0, ay: 0 };
    const k = 0.8 + 0.2 * Math.sin(time * 4);
    const runs = (r: number[], cr: number, cg: number, cb: number, a: number) => {
      for (let i = 0; i < r.length; i += 3) O.push(dot, r[i], r[i + 1], { sx: r[i + 2], sy: 1, r: cr, g: cg, b: cb, a: a * k });
    };
    runs(g.carved, 0.06, 0.04, 0.1, 0.45);
    runs(g.edge, 1, 0.93, 0.75, 0.8);
    runs(g.added, 1, 0.8, 0.3, 0.65);
  }

  private textWidth(s: string): number {
    let w = s.length - 1;
    for (const ch of s) w += (this.atlas.glyphs.get(ch) ?? this.atlas.glyphs.get(ch.toUpperCase()))?.w ?? 4;
    return w;
  }

  /** '·' is not in the pixel font: rows draw it as a dot with room around it */
  private segWidth(s: string): number {
    return s === '·' ? 9 : this.textWidth(s);
  }

  private rowWidth(segs: Seg[]): number {
    let total = -1;
    for (const g of segs) total += this.segWidth(g.s) + 1;
    return total;
  }

  /** Coloured pieces of one centred line. */
  private textRow(segs: Seg[], x: number, y: number): void {
    let cx = Math.round(x - this.rowWidth(segs) / 2);
    const W = this.atlas.white;
    const dot = { x: W.x + 1, y: W.y + 1, w: 1, h: 1, ax: 0, ay: 0 };
    for (const g of segs) {
      if (g.s === '·') {
        this.over.push(dot, cx + 4, y + 4, { r: 0.05, g: 0.03, b: 0.08, a: 0.85, sx: 2, sy: 2 });
        this.over.push(dot, cx + 3, y + 3, { r: g.c[0], g: g.c[1], b: g.c[2], sx: 2, sy: 2 });
      } else this.text(this.over, g.s, cx, y, g.c[0], g.c[1], g.c[2], 1, 'left');
      cx += this.segWidth(g.s) + 1;
    }
  }

  private drawPopups(dt: number): void {
    for (const p of this.popups) {
      const a = Math.min(1, p.life / 15);
      this.text(this.over, p.text, p.x, Math.round(p.y), p.r, p.g, p.b, a);
      p.y -= 0.35 * dt;
      p.life -= dt;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  private atmosphere(sim: Sim, dt: number): void {
    const style = this.art.backgrounds[this.realm].atmosphere;
    const v = this.p.view;
    this.atmoT += dt;
    const rate = style === 'snow' ? 0.9 : style === 'embers' ? 0.6 : 0.25;
    while (this.atmoT > 1 / rate) {
      this.atmoT -= 1 / rate;
      const x = v.x + Math.random() * v.z;
      if (style === 'snow') this.debris.spawn(x, v.y - 2, (Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.3, 400, 0.92, 0.96, 1, 0.9, Math.random() < 0.2 ? 2 : 1, 0, { drag: 1, collide: true, fade: true });
      else if (style === 'embers') this.sparks.spawn(x, v.y + v.w + 2, (Math.random() - 0.5) * 0.4, -0.3 - Math.random() * 0.5, 400, 1, 0.45 + Math.random() * 0.3, 0.15, 0.9, 1, -0.0005, { drag: 1 });
      else this.sparks.spawn(x, v.y + Math.random() * v.w, 0.15 + Math.random() * 0.2, (Math.random() - 0.5) * 0.1, 300, 1, 0.95, 0.6, 0.5, 1, 0, { drag: 1 });
    }
    void sim;
  }
}

type Rgb = readonly [number, number, number];
interface Seg { s: string; c: Rgb }

const GOOD: Rgb = [0.6, 1, 0.6], BAD: Rgb = [1, 0.45, 0.4], GRIM: Rgb = [0.85, 0.55, 0.5], DIM: Rgb = [0.8, 0.75, 0.68];
const COST: Rgb = [1, 0.78, 0.4];

const DEATH_WORDS: Record<string, string> = {
  fall: 'falls', void: 'falls', water: 'drowns', lava: 'burns', fire: 'burns', magma: 'burns', sweep: 'burns', fireball: 'burns',
  meteor: 'burns', spikes: 'spiked', crusher: 'crushed', slam: 'crushed', boulder: 'crushed', buried: 'buried', venom: 'poisoned',
  icicle: 'struck', burrow: 'swallowed',
};

const STILL: Partial<Record<WyrdState, string>> = {
  warden: 'stands guard', frozen: 'still frozen', fall: 'still falling', glide: 'still gliding', glide_open: 'still gliding',
  climb: 'still climbing', hoist: 'still climbing', weave: 'still weaving', bash: 'still bashing', mine: 'still mining',
  dig: 'still digging', leap: 'still in the air', tumble: 'still in the air', wait: 'still waiting',
};

/** A Wyrdling's predicted end, in words. */
function endWords(e: FateEnd): [string, Rgb] {
  if (e.kind === 'saved') return ['reaches the gate', GOOD];
  if (e.kind === 'dead') return [`${DEATH_WORDS[e.cause ?? ''] ?? 'lost'} at x ${Math.round(e.x)}`, BAD];
  if (e.trap) return [e.turned === 'warden' ? 'held back by a Warden' : 'trapped between walls', [1, 0.75, 0.4]];
  if (e.turned) return [`turned back by a ${e.turned === 'warden' ? 'Warden' : 'wall'}`, [0.95, 0.85, 0.65]];
  return [STILL[e.st ?? 'walk'] ?? 'still walking', [0.95, 0.9, 0.8]];
}

/** What a calling changes for everyone, over the stretch both predictions cover. */
function deltaWords(d: FateDelta): Seg[] {
  const out: Seg[] = [];
  const add = (s: string, c: Rgb) => {
    if (out.length) out.push({ s: '·', c: DIM });
    out.push({ s, c });
  };
  const gains = [d.saved ? `${d.saved} saved` : '', d.freed ? `${d.freed} freed` : ''].filter(Boolean);
  if (d.lost && gains.length && d.firstLoss <= d.firstGain) {
    // a sacrifice: the loss comes first and buys what follows, so it shouldn't read as a mistake
    add(`${d.lost} lost`, BAD);
    add(`${gains.join(', ')} later`, GOOD);
  } else {
    if (d.saved) add(`saves ${d.saved}`, GOOD);
    if (d.freed) add(`frees ${d.freed}`, GOOD);
    if (d.lost) add(`${d.lost} more lost`, BAD);
    if (d.delayed) add(`${d.delayed} fewer home`, BAD);
  }
  if (d.stillLost) add(`${d.stillLost} still lost`, GRIM);
  const secs = Math.round(d.window / TICK_RATE);
  if (!out.length) out.push({ s: `no change in ${secs}s`, c: DIM });
  else out.push({ s: ` (${secs}s)`, c: DIM });
  return out;
}
