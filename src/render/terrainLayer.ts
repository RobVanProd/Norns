// Terrain renderer: the level's material grid lives in an RGBA texture (r = material, g = static
// back-wall flag). A full-view quad shades every pixel from the realm's material atlas — caps,
// edge highlights, selective outlines, depth darkening, surface/hanging decorations (docs/ART_SPEC.md).
import * as THREE from 'three';
import type { Terrain } from '../sim/terrain';
import { CS, CS_SHIFT } from '../sim/terrain';

const VERT = /* glsl */ `
in vec2 position2;
void main() { gl_Position = vec4(position2 * 2.0 - 1.0, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D uMask;
uniform sampler2D uMat;
uniform sampler2D uBack;
uniform vec4 uView;
uniform vec2 uLevel;
uniform float uTime;
out vec4 outColor;

// Outside the level the terrain continues as its edge pixel, so boundary rows never get
// outlines, caps or hanging decorations as if they were exposed to open air.
ivec2 clampLevel(ivec2 p) { return clamp(p, ivec2(0), ivec2(uLevel) - 1); }
int matAt(ivec2 p) {
  return int(texelFetch(uMask, clampLevel(p), 0).r * 255.0 + 0.5);
}
vec4 atl(int m, int u, int row) { return texelFetch(uMat, ivec2(m * 64 + u, row), 0); }
float bayer(ivec2 f) {
  ivec2 i = f % 4;
  int t[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(t[i.x + i.y * 4]) + 0.5) / 16.0;
}

void main() {
  ivec2 frag = ivec2(gl_FragCoord.xy);
  ivec2 p = ivec2(int(uView.x) + frag.x, int(uView.y) + int(uView.w) - 1 - frag.y);
  int m = matAt(p);
  int u = ((p.x % 64) + 64) % 64;
  int v = ((p.y % 64) + 64) % 64;
  if (m != 0) {
    int du = 9, dd = 9, dl = 9, dr = 9;
    for (int k = 1; k <= 8; k++) { if (matAt(p + ivec2(0, -k)) == 0) { du = k; break; } }
    for (int k = 1; k <= 8; k++) { if (matAt(p + ivec2(0, k)) == 0) { dd = k; break; } }
    for (int k = 1; k <= 8; k++) { if (matAt(p + ivec2(-k, 0)) == 0) { dl = k; break; } }
    for (int k = 1; k <= 8; k++) { if (matAt(p + ivec2(k, 0)) == 0) { dr = k; break; } }
    vec4 base = atl(m, u, v);
    bool topCap = false, botCap = false;
    // no fresh grass/frost caps on the floor of a tunnel that was just dug
    bool dugAbove = du <= 8 && texelFetch(uMask, clampLevel(p + ivec2(0, -du)), 0).g > 0.75;
    if (du <= 8 && !dugAbove) { vec4 c = atl(m, u, 64 + du - 1); if (c.a > 0.5) { base = c; topCap = true; } }
    if (!topCap && dd <= 8) { vec4 c = atl(m, u, 72 + dd - 1); if (c.a > 0.5) { base = c; botCap = true; } }
    vec3 outl = atl(m, 0, 112).rgb, hi = atl(m, 1, 112).rgb, sh = atl(m, 2, 112).rgb;
    if (du == 1 && !topCap) base.rgb = hi;
    else if (dl == 1) base.rgb = mix(base.rgb, hi, 0.5);
    else if ((dd == 1 && !botCap) || dr == 1) base.rgb = outl;
    else if ((du == 2 && !topCap) || dl == 2) base.rgb = mix(base.rgb, hi, 0.2);
    else if ((dd == 2 && !botCap) || dr == 2) base.rgb = mix(base.rgb, sh, 0.3);
    int k = min(min(du, dd), min(dl, dr));
    base.rgb *= 1.0 - 0.02 * float(min(k, 8));
    if (m == 6) base.rgb += 0.06 * sin(uTime * 3.0 + float(p.x) * 0.35 + float(p.y) * 0.2);
    outColor = vec4(base.rgb, 1.0);
    return;
  }
  vec4 col = vec4(0.0);
  float bw = 0.0;
  bw = texelFetch(uMask, clampLevel(p), 0).g;
  if (bw > 0.25) {
    vec3 b = texelFetch(uBack, ivec2(u, v), 0).rgb;
    b = mix(b, vec3(dot(b, vec3(0.299, 0.587, 0.114))), 0.3) * 0.48;
    // contact shadow where a cave meets solid terrain (strongest under ceilings), so air and rock
    // never read alike even when the back wall shares the rock's texture
    int near = 7;
    for (int k = 1; k <= 6; k++) { if (matAt(p + ivec2(0, -k)) != 0) { near = k; break; } }
    for (int k = 1; k <= 4; k++) { if (matAt(p + ivec2(-k, 0)) != 0 || matAt(p + ivec2(k, 0)) != 0) { near = min(near, k + 1); break; } }
    for (int k = 1; k <= 3; k++) { if (matAt(p + ivec2(0, k)) != 0) { near = min(near, k + 2); break; } }
    float occ = float(7 - near) / 6.0;
    b *= 1.0 - 0.5 * floor(occ * 3.0 + bayer(frag)) / 3.0;
    col = vec4(b, 1.0);
  }
  bool dug = bw > 0.75;
  for (int d = 1; d <= 16 && !dug; d++) {
    int mb = matAt(p + ivec2(0, d));
    if (mb != 0) { vec4 c = atl(mb, u, 96 - d); if (c.a > 0.5) col = vec4(c.rgb, 1.0); break; }
  }
  for (int d = 1; d <= 16; d++) {
    int mt = matAt(p + ivec2(0, -d));
    if (mt != 0) { vec4 c = atl(mt, u, 95 + d); if (c.a > 0.5) col = vec4(c.rgb, 1.0); break; }
  }
  if (col.a < 0.01) discard;
  outColor = col;
}`;

export class TerrainLayer {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.RawShaderMaterial;
  private maskTex: THREE.DataTexture;
  private data: Uint8Array;
  private lastChunks: (Uint8Array | null)[];
  private lastVers: Uint32Array;
  readonly w: number;
  readonly h: number;

  constructor(terrain: Terrain, matAtlas: THREE.Texture, backWall: THREE.Texture, view: THREE.Vector4) {
    this.w = terrain.w;
    this.h = terrain.h;
    this.data = new Uint8Array(this.w * this.h * 4);
    for (let i = 0; i < this.w * this.h; i++) this.data[i * 4 + 1] = terrain.backWall[i] === 1 ? 255 : terrain.backWall[i] === 2 ? 128 : 0;
    this.maskTex = new THREE.DataTexture(this.data, this.w, this.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.maskTex.magFilter = THREE.NearestFilter;
    this.maskTex.minFilter = THREE.NearestFilter;
    this.maskTex.generateMipmaps = false;
    this.maskTex.flipY = false;
    this.lastChunks = new Array(terrain.chunks.length).fill(null);
    this.lastVers = new Uint32Array(terrain.chunks.length);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position2', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uMask: { value: this.maskTex }, uMat: { value: matAtlas }, uBack: { value: backWall },
        uView: { value: view }, uLevel: { value: new THREE.Vector2(this.w, this.h) }, uTime: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.sync(terrain, true);
  }

  /** Upload chunks whose identity or version changed since the last sync. */
  sync(terrain: Terrain, force = false): void {
    const dirty: number[] = [];
    for (let i = 0; i < terrain.chunks.length; i++) {
      if (force || terrain.chunks[i] !== this.lastChunks[i] || terrain.vers[i] !== this.lastVers[i]) dirty.push(i);
    }
    if (!dirty.length) return;
    const W = this.w, H = this.h, d = this.data;
    for (const ci of dirty) {
      const chunk = terrain.chunks[ci];
      this.lastChunks[ci] = chunk;
      this.lastVers[ci] = terrain.vers[ci];
      const cx = (ci % terrain.cw) << CS_SHIFT, cy = ((ci / terrain.cw) | 0) << CS_SHIFT;
      for (let yy = 0; yy < CS; yy++) {
        const y = cy + yy;
        if (y >= H) break;
        for (let xx = 0; xx < CS; xx++) {
          const x = cx + xx;
          if (x >= W) break;
          d[(y * W + x) * 4] = chunk[(yy << CS_SHIFT) | xx];
        }
      }
    }
    const tex = this.maskTex;
    tex.clearUpdateRanges();
    if (!force && dirty.length < 40) {
      for (const ci of dirty) {
        const cx = (ci % terrain.cw) << CS_SHIFT, cy = ((ci / terrain.cw) | 0) << CS_SHIFT;
        const w = Math.min(CS, W - cx);
        for (let yy = 0; yy < CS && cy + yy < H; yy++) tex.addUpdateRange(((cy + yy) * W + cx) * 4, w * 4);
      }
    }
    tex.needsUpdate = true;
  }

  setTime(t: number): void {
    this.material.uniforms.uTime.value = t;
  }

  dispose(): void {
    this.maskTex.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
