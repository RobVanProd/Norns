// Background (sky gradient + parallax), liquids and point particles.
import * as THREE from 'three';
import type { BackgroundSet } from '../art/types';
import { VIEW_GLSL } from './spriteBatch';

const FS_VERT = /* glsl */ `
in vec2 position2;
void main() { gl_Position = vec4(position2 * 2.0 - 1.0, 0.0, 1.0); }`;

function fsQuad(mat: THREE.Material, order: number): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position2', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = order;
  return m;
}

function hexToVec3(h: string): THREE.Vector3 {
  const c = new THREE.Color(h);
  return new THREE.Vector3(c.r, c.g, c.b);
}

function canvasTex(cv: HTMLCanvasElement, repeat: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  return t;
}

export { canvasTex };

const SKY_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uStops[4];
uniform int uCount;
uniform vec4 uView;
uniform vec2 uLevel;
out vec4 outColor;
float bayer(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i.x + i.y * 4]) + 0.5) / 16.0;
}
void main() {
  float wy = uView.y + uView.w - gl_FragCoord.y;
  // the sky spans the level height with a little parallax
  float t = clamp((wy * 0.6 + uView.y * 0.4) / max(uLevel.y, 1.0), 0.0, 1.0);
  float f = t * float(uCount - 1);
  int i = int(floor(f));
  float k = f - float(i);
  // quantise the blend to 12 steps with ordered dither: a banded 32-bit-era gradient
  float q = floor(k * 12.0 + bayer(gl_FragCoord.xy)) / 12.0;
  vec3 a = uStops[min(i, uCount - 1)], b = uStops[min(i + 1, uCount - 1)];
  outColor = vec4(mix(a, b, q), 1.0);
}`;

const PARALLAX_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexSize;
uniform vec4 uView;
uniform vec2 uLevel;
uniform float uPar;
uniform float uBottom;
uniform float uTime;
uniform float uDrift;
out vec4 outColor;
void main() {
  float sx = gl_FragCoord.x;
  float sy = uView.w - gl_FragCoord.y; // screen y, top = 0
  float camBottom = max(0.0, uLevel.y - uView.w);
  float layerBottom = uView.w - uBottom + (camBottom - uView.y) * uPar * 0.6;
  float ly = sy - (layerBottom - uTexSize.y);
  if (ly < 0.0 || ly >= uTexSize.y) discard;
  float lx = floor(sx + uView.x * uPar + uTime * uDrift);
  vec4 c = texelFetch(uTex, ivec2(int(mod(lx, uTexSize.x)), int(ly)), 0);
  if (c.a < 0.5) discard;
  outColor = vec4(c.rgb, 1.0);
}`;

export class Background {
  readonly meshes: THREE.Mesh[] = [];
  private mats: THREE.RawShaderMaterial[] = [];

  constructor(bg: BackgroundSet, view: THREE.Vector4, levelW: number, levelH: number) {
    const stops = bg.sky.slice(0, 4).map(hexToVec3);
    while (stops.length < 2) stops.push(stops[0] ?? new THREE.Vector3(0.1, 0.1, 0.2));
    const padded = [...stops];
    while (padded.length < 4) padded.push(padded[padded.length - 1]);
    const level = new THREE.Vector2(levelW, levelH);
    const sky = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: FS_VERT, fragmentShader: SKY_FRAG,
      uniforms: { uStops: { value: padded }, uCount: { value: stops.length }, uView: { value: view }, uLevel: { value: level } },
      depthTest: false, depthWrite: false,
    });
    this.mats.push(sky);
    this.meshes.push(fsQuad(sky, 0));
    bg.layers.forEach((layer, i) => {
      const tex = canvasTex(layer.canvas, true);
      const m = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: FS_VERT, fragmentShader: PARALLAX_FRAG,
        uniforms: {
          uTex: { value: tex }, uTexSize: { value: new THREE.Vector2(layer.canvas.width, layer.canvas.height) },
          uView: { value: view }, uLevel: { value: level }, uPar: { value: layer.parallax }, uBottom: { value: layer.bottomOffset },
          uTime: { value: 0 }, uDrift: { value: 0 },
        },
        depthTest: false, depthWrite: false, transparent: true,
      });
      this.mats.push(m);
      this.meshes.push(fsQuad(m, 1 + i));
    });
  }

  setTime(t: number): void {
    for (const m of this.mats) if (m.uniforms.uTime) m.uniforms.uTime.value = t;
  }

  dispose(): void {
    for (const m of this.meshes) { m.geometry.dispose(); }
    for (const m of this.mats) {
      const t = m.uniforms.uTex?.value as THREE.Texture | undefined;
      t?.dispose();
      m.dispose();
    }
  }
}

// ------------------------------------------------------------------ liquids

const LIQ_VERT = /* glsl */ `
precision highp float;
${VIEW_GLSL}
in vec2 position2;
uniform vec4 uRect;
out vec2 vWorld;
void main() {
  vWorld = uRect.xy + position2 * uRect.zw;
  gl_Position = worldToClip(vWorld);
}`;

const LIQ_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMask;
uniform vec2 uLevel;
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uFoam;
uniform float uAlpha;
uniform float uSurface;
uniform float uLava;
in vec2 vWorld;
out vec4 outColor;
void main() {
  ivec2 p = ivec2(floor(vWorld));
  if (texelFetch(uMask, clamp(p, ivec2(0), ivec2(uLevel) - 1), 0).r > 0.001) discard;
  float wave = floor(sin(float(p.x) * 0.21 + uTime * (uLava > 0.5 ? 1.3 : 2.4)) * 1.2 + sin(float(p.x) * 0.07 - uTime * 0.9));
  float depth = float(p.y) - (uSurface + wave);
  if (depth < 0.0) discard;
  vec3 c;
  if (depth < 1.0) c = uFoam;
  else if (depth < 4.0) c = uMid;
  else c = mix(uMid, uDeep, clamp((depth - 4.0) / 18.0, 0.0, 1.0));
  // moving glints / crust cells
  float g = fract(sin(dot(floor(vec2(p) / vec2(3.0, 2.0)) + floor(uTime * (uLava > 0.5 ? 1.5 : 3.0)), vec2(12.9898, 78.233))) * 43758.5453);
  if (g > 0.985 && depth > 2.0) c = mix(c, uFoam, 0.6);
  if (uLava > 0.5) {
    float cell = sin(float(p.x) * 0.3 + uTime) * sin(float(p.y) * 0.4 - uTime * 0.7);
    if (cell > 0.75) c = mix(c, uFoam, 0.35);
  }
  outColor = vec4(c, depth < 1.0 ? 1.0 : uAlpha);
}`;

export class LiquidLayer {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.RawShaderMaterial;

  constructor(kind: 'water' | 'lava', rect: { x: number; y: number; w: number; h: number }, mask: THREE.Texture, view: THREE.Vector4, levelW: number, levelH: number) {
    const lava = kind === 'lava';
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: LIQ_VERT, fragmentShader: LIQ_FRAG,
      uniforms: {
        uView: { value: view }, uRect: { value: new THREE.Vector4(rect.x, rect.y - 3, rect.w, rect.h + 3) }, uMask: { value: mask },
        uLevel: { value: new THREE.Vector2(levelW, levelH) }, uTime: { value: 0 },
        uDeep: { value: lava ? new THREE.Vector3(0.55, 0.06, 0.02) : new THREE.Vector3(0.04, 0.12, 0.28) },
        uMid: { value: lava ? new THREE.Vector3(0.95, 0.35, 0.05) : new THREE.Vector3(0.12, 0.38, 0.62) },
        uFoam: { value: lava ? new THREE.Vector3(1.0, 0.86, 0.4) : new THREE.Vector3(0.75, 0.93, 1.0) },
        uAlpha: { value: lava ? 1.0 : 0.78 }, uSurface: { value: rect.y }, uLava: { value: lava ? 1 : 0 },
      },
      transparent: true, depthTest: false, depthWrite: false,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position2', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }

  set(rect: { x: number; y: number; w: number; h: number }, time: number): void {
    (this.material.uniforms.uRect.value as THREE.Vector4).set(rect.x, rect.y - 3, rect.w, rect.h + 3);
    this.material.uniforms.uSurface.value = rect.y;
    this.material.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

// ------------------------------------------------------------------ particles

const P_VERT = /* glsl */ `
precision highp float;
${VIEW_GLSL}
in vec2 aP;
in vec4 aC;
in float aS;
out vec4 vC;
void main() {
  gl_Position = worldToClip(floor(aP) + 0.5);
  gl_PointSize = aS;
  vC = aC;
}`;

const P_FRAG = /* glsl */ `
precision highp float;
in vec4 vC;
out vec4 outColor;
void main() { outColor = vC; }`;

/** CPU particles rendered as square points (crisp pixels). */
export class Particles {
  readonly points: THREE.Points;
  private cap: number;
  n = 0;
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array;
  life: Float32Array; max: Float32Array; grav: Float32Array; drag: Float32Array;
  col: Float32Array; size: Float32Array; collide: Uint8Array; fade: Uint8Array;
  private aP: THREE.BufferAttribute; private aC: THREE.BufferAttribute; private aS: THREE.BufferAttribute;
  private geo: THREE.BufferGeometry;

  constructor(view: THREE.Vector4, capacity: number, additive: boolean) {
    this.cap = capacity;
    this.x = new Float32Array(capacity); this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity); this.vy = new Float32Array(capacity);
    this.life = new Float32Array(capacity); this.max = new Float32Array(capacity);
    this.grav = new Float32Array(capacity); this.drag = new Float32Array(capacity);
    this.col = new Float32Array(capacity * 4); this.size = new Float32Array(capacity);
    this.collide = new Uint8Array(capacity); this.fade = new Uint8Array(capacity);
    this.geo = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(new Float32Array(capacity * 2), 2);
    this.aC = new THREE.BufferAttribute(new Float32Array(capacity * 4), 4);
    this.aS = new THREE.BufferAttribute(new Float32Array(capacity), 1);
    for (const a of [this.aP, this.aC, this.aS]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aP', this.aP);
    this.geo.setAttribute('aC', this.aC);
    this.geo.setAttribute('aS', this.aS);
    // three requires a position attribute for bounding computations; keep a dummy
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: P_VERT, fragmentShader: P_FRAG,
      uniforms: { uView: { value: view } },
      transparent: true, depthTest: false, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, r: number, g: number, b: number, a = 1, size = 1, grav = 0.1, opts: { collide?: boolean; drag?: number; fade?: boolean } = {}): void {
    let i: number;
    if (this.n < this.cap) i = this.n++;
    else i = Math.floor(Math.random() * this.cap);
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = opts.drag ?? 0.99;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.size[i] = size; this.collide[i] = opts.collide ? 1 : 0; this.fade[i] = opts.fade === false ? 0 : 1;
  }

  /** dt in 60fps frames; solid(x,y) for terrain collisions */
  update(dt: number, solid: (x: number, y: number) => boolean): void {
    let j = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      this.vy[i] += this.grav[i] * dt;
      const d = Math.pow(this.drag[i], dt);
      this.vx[i] *= d; this.vy[i] *= d;
      const nx = this.x[i] + this.vx[i] * dt, ny = this.y[i] + this.vy[i] * dt;
      if (this.collide[i] && solid(Math.floor(nx), Math.floor(ny))) {
        if (!solid(Math.floor(this.x[i]), Math.floor(ny))) { this.vx[i] *= -0.4; }
        else { this.vy[i] *= -0.3; this.vx[i] *= 0.6; }
        if (Math.abs(this.vy[i]) < 0.15 && Math.abs(this.vx[i]) < 0.1) this.life[i] = Math.min(this.life[i], 20);
      } else { this.x[i] = nx; this.y[i] = ny; }
      if (j !== i) this.copy(i, j);
      j++;
    }
    this.n = j;
    const p = this.aP.array as Float32Array, c = this.aC.array as Float32Array, s = this.aS.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      p[i * 2] = this.x[i]; p[i * 2 + 1] = this.y[i];
      const f = this.fade[i] ? Math.min(1, this.life[i] / Math.min(20, this.max[i])) : 1;
      c[i * 4] = this.col[i * 4]; c[i * 4 + 1] = this.col[i * 4 + 1]; c[i * 4 + 2] = this.col[i * 4 + 2]; c[i * 4 + 3] = this.col[i * 4 + 3] * f;
      s[i] = this.size[i];
    }
    this.geo.setDrawRange(0, this.n);
    for (const a of [this.aP, this.aC, this.aS]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); a.needsUpdate = true; }
  }

  /** Pixel size scale for gl_PointSize (point size is in device pixels of the render target). */
  private copy(i: number, j: number): void {
    this.x[j] = this.x[i]; this.y[j] = this.y[i]; this.vx[j] = this.vx[i]; this.vy[j] = this.vy[i];
    this.life[j] = this.life[i]; this.max[j] = this.max[i]; this.grav[j] = this.grav[i]; this.drag[j] = this.drag[i];
    for (let k = 0; k < 4; k++) this.col[j * 4 + k] = this.col[i * 4 + k];
    this.size[j] = this.size[i]; this.collide[j] = this.collide[i]; this.fade[j] = this.fade[i];
  }

  clear(): void {
    this.n = 0;
    this.geo.setDrawRange(0, 0);
  }
}

export { fsQuad };
