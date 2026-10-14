// Instanced sprite batch: one draw call per layer. World coords are pixels, y down; shaders map
// them to clip space with the shared `uView` uniform (camX, camY, viewW, viewH).
import * as THREE from 'three';
import type { FrameRef } from './atlas';

export const VIEW_GLSL = /* glsl */ `
uniform vec4 uView;
vec4 worldToClip(vec2 p) {
  return vec4((p.x - uView.x) / uView.z * 2.0 - 1.0, 1.0 - (p.y - uView.y) / uView.w * 2.0, 0.0, 1.0);
}
`;

const VERT = /* glsl */ `
precision highp float;
${VIEW_GLSL}
in vec2 position2;
in vec2 aPos;
in vec4 aRect;    // atlas x,y,w,h (px)
in vec4 aXform;   // anchor x, anchor y, rotation, flipX(+1/-1)
in vec2 aScale;
in vec4 aColor;
in vec4 aAdd;
uniform vec2 uAtlas;
out vec2 vUv;
out vec4 vColor;
out vec4 vAdd;
void main() {
  vec2 local = position2 * aRect.zw - aXform.xy;
  local.x *= aXform.w;
  local *= aScale;
  float c = cos(aXform.z), s = sin(aXform.z);
  local = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  gl_Position = worldToClip(aPos + local);
  vUv = (aRect.xy + position2 * aRect.zw) / uAtlas;
  vColor = aColor;
  vAdd = aAdd;
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
in vec4 vColor;
in vec4 vAdd;
out vec4 outColor;
void main() {
  vec4 t = texture(uTex, vUv);
  if (t.a < 0.02) discard;
  vec4 c = t * vColor;
  c.rgb = mix(c.rgb, vAdd.rgb, vAdd.a);
  outColor = c;
}`;

export interface SpriteOpts {
  flip?: boolean;
  rot?: number;
  sx?: number;
  sy?: number;
  r?: number;
  g?: number;
  b?: number;
  a?: number;
  /** additive flash color + amount */
  fr?: number;
  fg?: number;
  fb?: number;
  fa?: number;
  /** don't snap to integer pixels (rotated / smoothly scaled sprites) */
  smooth?: boolean;
}

export class SpriteBatch {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.RawShaderMaterial;
  private geo: THREE.InstancedBufferGeometry;
  private cap: number;
  private n = 0;
  private aPos!: THREE.InstancedBufferAttribute;
  private aRect!: THREE.InstancedBufferAttribute;
  private aXform!: THREE.InstancedBufferAttribute;
  private aScale!: THREE.InstancedBufferAttribute;
  private aColor!: THREE.InstancedBufferAttribute;
  private aAdd!: THREE.InstancedBufferAttribute;

  constructor(texture: THREE.Texture, atlasSize: number, view: THREE.Vector4, capacity = 2048, blending: THREE.Blending = THREE.NormalBlending) {
    this.cap = capacity;
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute('position2', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.alloc(capacity);
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTex: { value: texture }, uAtlas: { value: new THREE.Vector2(atlasSize, atlasSize) }, uView: { value: view } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
  }

  private alloc(cap: number): void {
    const mk = (n: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aPos = mk(2); this.aRect = mk(4); this.aXform = mk(4); this.aScale = mk(2); this.aColor = mk(4); this.aAdd = mk(4);
    this.geo.setAttribute('aPos', this.aPos);
    this.geo.setAttribute('aRect', this.aRect);
    this.geo.setAttribute('aXform', this.aXform);
    this.geo.setAttribute('aScale', this.aScale);
    this.geo.setAttribute('aColor', this.aColor);
    this.geo.setAttribute('aAdd', this.aAdd);
    this.cap = cap;
  }

  begin(): void {
    this.n = 0;
  }

  /** Draw frame f with its anchor at world (x,y). */
  push(f: FrameRef, x: number, y: number, o?: SpriteOpts): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const smooth = o?.smooth || (o?.rot ?? 0) !== 0;
    const px = smooth ? x : Math.round(x), py = smooth ? y : Math.round(y);
    this.aPos.array[i * 2] = px;
    this.aPos.array[i * 2 + 1] = py;
    const r = this.aRect.array;
    r[i * 4] = f.x; r[i * 4 + 1] = f.y; r[i * 4 + 2] = f.w; r[i * 4 + 3] = f.h;
    const xf = this.aXform.array;
    xf[i * 4] = f.ax; xf[i * 4 + 1] = f.ay; xf[i * 4 + 2] = o?.rot ?? 0; xf[i * 4 + 3] = o?.flip ? -1 : 1;
    if (o?.flip) xf[i * 4] = f.ax + 1; // keep the anchor pixel column under the mirrored sprite
    this.aScale.array[i * 2] = o?.sx ?? 1;
    this.aScale.array[i * 2 + 1] = o?.sy ?? 1;
    const c = this.aColor.array;
    c[i * 4] = o?.r ?? 1; c[i * 4 + 1] = o?.g ?? 1; c[i * 4 + 2] = o?.b ?? 1; c[i * 4 + 3] = o?.a ?? 1;
    const ad = this.aAdd.array;
    ad[i * 4] = o?.fr ?? 1; ad[i * 4 + 1] = o?.fg ?? 1; ad[i * 4 + 2] = o?.fb ?? 1; ad[i * 4 + 3] = o?.fa ?? 0;
  }

  /** Solid rectangle using the atlas' white texel. */
  rect(white: FrameRef, x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number): void {
    this.push({ x: white.x + 1, y: white.y + 1, w: 1, h: 1, ax: 0, ay: 0 }, x, y, { sx: w, sy: h, r, g, b, a, smooth: true });
  }

  end(): void {
    this.geo.instanceCount = this.n;
    for (const a of [this.aPos, this.aRect, this.aXform, this.aScale, this.aColor, this.aAdd]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  get count(): number {
    return this.n;
  }
}
