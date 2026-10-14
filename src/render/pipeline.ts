// Low-resolution 32-bit-style render pipeline:
//   scene RT (lit world) × light RT (ambient + additive coloured lights, posterised)
//   → comp RT, then emissive overlay (glows, particles, foresight, telegraphs) on top
//   → nearest-neighbour integer upscale to the canvas with post effects.
import * as THREE from 'three';

const QUAD_VERT = /* glsl */ `
in vec2 position2;
out vec2 vUv;
void main() { vUv = position2; gl_Position = vec4(position2 * 2.0 - 1.0, 0.0, 1.0); }`;

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uLight;
uniform float uBands;
in vec2 vUv;
out vec4 outColor;
float bayer(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[idx]) + 0.5) / 16.0;
}
void main() {
  vec4 s = texture(uScene, vUv);
  vec3 l = texture(uLight, vUv).rgb;
  // posterised light with ordered dither between bands: the classic banded torchlight look
  vec3 q = floor(l * uBands + bayer(gl_FragCoord.xy)) / uBands;
  outColor = vec4(s.rgb * q, 1.0);
}`;

const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uComp;
uniform vec2 uRes;
uniform float uTime;
uniform float uRewind;
uniform float uPause;
uniform vec4 uFlash;
uniform float uVignette;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 uv = vUv;
  if (uRewind > 0.0) {
    float line = floor(uv.y * uRes.y);
    uv.x += uRewind * 0.004 * sin(line * 0.9 + uTime * 40.0) + uRewind * 0.01 * step(0.97, fract(uv.y * 3.0 - uTime * 2.0));
  }
  vec3 c = texture(uComp, uv).rgb;
  if (uRewind > 0.0) {
    float g = dot(c, vec3(0.3, 0.55, 0.15));
    vec3 tint = vec3(g * 0.75, g * 0.95, g * 1.25) + vec3(0.02, 0.03, 0.08);
    c = mix(c, tint, uRewind * 0.85);
    float scan = 0.92 + 0.08 * sin(vUv.y * uRes.y * 3.14159);
    c *= mix(1.0, scan, uRewind);
  }
  if (uPause > 0.0) {
    float g = dot(c, vec3(0.3, 0.55, 0.15));
    c = mix(c, vec3(g) * vec3(0.8, 0.85, 1.0), uPause * 0.45);
  }
  c = mix(c, uFlash.rgb, uFlash.a);
  vec2 d = vUv - 0.5;
  c *= 1.0 - uVignette * dot(d, d) * 1.6;
  outColor = vec4(c, 1.0);
}`;

function quadMesh(material: THREE.Material): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position2', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const m = new THREE.Mesh(geo, material);
  m.frustumCulled = false;
  return m;
}

export interface PostState {
  rewind: number;
  pause: number;
  flash: [number, number, number, number];
  vignette: number;
}

export class Pipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  /** shared view uniform: camX, camY, viewW, viewH (world px) */
  readonly view = new THREE.Vector4(0, 0, 480, 270);
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  /** world layers drawn into the lit scene */
  readonly worldScene = new THREE.Scene();
  /** light sprites (additive) */
  readonly lightScene = new THREE.Scene();
  /** emissive overlay drawn after lighting */
  readonly overlayScene = new THREE.Scene();
  ambient = new THREE.Color(1, 1, 1);
  lightBands = 7;
  post: PostState = { rewind: 0, pause: 0, flash: [1, 1, 1, 0], vignette: 0.35 };

  viewW = 480;
  viewH = 270;
  scale = 1;
  zoomOffset = 0;
  /** preferred minimum view width in world px (boss arenas want to show the whole fight) */
  fitWidth = 0;
  private devW = 1;
  private devH = 1;
  private sceneRT: THREE.WebGLRenderTarget;
  private lightRT: THREE.WebGLRenderTarget;
  private compRT: THREE.WebGLRenderTarget;
  private compositeMat: THREE.RawShaderMaterial;
  private postMat: THREE.RawShaderMaterial;
  private compositeScene = new THREE.Scene();
  private postScene = new THREE.Scene();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const rtOpts = { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false };
    this.sceneRT = new THREE.WebGLRenderTarget(480, 270, rtOpts);
    this.lightRT = new THREE.WebGLRenderTarget(480, 270, { ...rtOpts, type: THREE.HalfFloatType });
    this.compRT = new THREE.WebGLRenderTarget(480, 270, rtOpts);
    this.compositeMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG,
      uniforms: { uScene: { value: this.sceneRT.texture }, uLight: { value: this.lightRT.texture }, uBands: { value: 7 } },
      depthTest: false, depthWrite: false,
    });
    this.compositeScene.add(quadMesh(this.compositeMat));
    this.postMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: QUAD_VERT, fragmentShader: POST_FRAG,
      uniforms: {
        uComp: { value: this.compRT.texture }, uRes: { value: new THREE.Vector2(480, 270) }, uTime: { value: 0 },
        uRewind: { value: 0 }, uPause: { value: 0 }, uFlash: { value: new THREE.Vector4() }, uVignette: { value: 0.35 },
      },
      depthTest: false, depthWrite: false,
    });
    this.postScene.add(quadMesh(this.postMat));
  }

  /** Pick an integer pixel scale so the internal height is ~240-300 px, then size targets. */
  resize(cssW: number, cssH: number, dpr: number): void {
    const devW = Math.max(1, Math.round(cssW * dpr));
    const devH = Math.max(1, Math.round(cssH * dpr));
    this.devW = devW;
    this.devH = devH;
    let base = Math.max(1, Math.floor(Math.min(devH / 240, devW / 360)));
    if (this.fitWidth > 0) {
      // zoom out (never below 2x pixels) until the requested width fits
      while (base > 2 && Math.floor(devW / base) < this.fitWidth) base--;
    }
    const scale = Math.max(1, base + this.zoomOffset);
    this.scale = scale;
    this.viewW = Math.max(64, Math.floor(devW / scale));
    this.viewH = Math.max(64, Math.floor(devH / scale));
    this.renderer.setSize(devW, devH, false);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    for (const rt of [this.sceneRT, this.lightRT, this.compRT]) rt.setSize(this.viewW, this.viewH);
    this.view.z = this.viewW;
    this.view.w = this.viewH;
    (this.postMat.uniforms.uRes.value as THREE.Vector2).set(this.viewW, this.viewH);
  }

  /** Map a CSS-pixel position on the canvas to world pixel coordinates. */
  screenToWorld(cssX: number, cssY: number, dpr: number): { x: number; y: number } {
    const ox = Math.floor((this.devW - this.viewW * this.scale) / 2);
    const oy = Math.floor((this.devH - this.viewH * this.scale) / 2);
    return {
      x: this.view.x + (cssX * dpr - ox) / this.scale,
      y: this.view.y + (cssY * dpr - oy) / this.scale,
    };
  }

  setCamera(x: number, y: number): void {
    this.view.x = Math.round(x);
    this.view.y = Math.round(y);
  }

  render(time: number): void {
    const r = this.renderer;
    // 1. lit world
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, false, false);
    r.render(this.worldScene, this.camera);
    // 2. lights
    r.setRenderTarget(this.lightRT);
    r.setClearColor(this.ambient, 1);
    r.clear(true, false, false);
    r.render(this.lightScene, this.camera);
    // 3. composite + overlay
    this.compositeMat.uniforms.uBands.value = this.lightBands;
    r.setRenderTarget(this.compRT);
    r.render(this.compositeScene, this.camera);
    r.render(this.overlayScene, this.camera);
    // 4. upscale to screen
    r.setRenderTarget(null);
    r.setClearColor(0x05040a, 1);
    r.setViewport(0, 0, this.devW, this.devH);
    r.clear(true, false, false);
    const w = this.viewW * this.scale, h = this.viewH * this.scale;
    const ox = Math.floor((this.devW - w) / 2), oy = Math.floor((this.devH - h) / 2);
    r.setViewport(ox, oy, w, h);
    const u = this.postMat.uniforms;
    u.uTime.value = time;
    u.uRewind.value = this.post.rewind;
    u.uPause.value = this.post.pause;
    (u.uFlash.value as THREE.Vector4).set(...this.post.flash);
    u.uVignette.value = this.post.vignette;
    r.render(this.postScene, this.camera);
    r.setViewport(0, 0, this.devW, this.devH);
  }

  clearScenes(): void {
    for (const s of [this.worldScene, this.lightScene, this.overlayScene]) {
      while (s.children.length) s.remove(s.children[0]);
    }
  }
}

export { quadMesh, QUAD_VERT };
