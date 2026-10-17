// Dev preview for the character / entity / icon / font art (preview A).
import { buildCharacterSprites } from '../src/art/characters';
import { buildEntitySprites } from '../src/art/entities';
import { buildIcons } from '../src/art/icons';
import { buildFont } from '../src/art/font';
import type { Anim, SpriteLib, BitmapFont } from '../src/art/types';

const q = new URLSearchParams(location.search);
const sections = (q.get('section') ?? 'wyrd,read,ent,icons,font').split(',');
const SCALE = Number(q.get('scale') ?? 4);
const only = (q.get('only') ?? '').split(',').filter(Boolean);
const live = q.get('anim') !== '0';
const root = document.getElementById('root')!;

const DARK = '#1b1d2b';
const EARTHY = '#6b5a3e';

const t0 = performance.now();
const chars = buildCharacterSprites();
const t1 = performance.now();
const ents = buildEntitySprites();
const t2 = performance.now();
const icons = buildIcons();
const t3 = performance.now();
const font = buildFont();
const t4 = performance.now();
document.getElementById('timing')!.textContent =
  `build ms — characters ${(t1 - t0).toFixed(1)}  entities ${(t2 - t1).toFixed(1)}  icons ${(t3 - t2).toFixed(1)}  font ${(t4 - t3).toFixed(1)}  total ${(t4 - t0).toFixed(1)}  ` +
  `(${Object.keys(chars).length} char anims, ${Object.keys(ents).length} entity anims, ${Object.keys(icons).length} icons, ${Object.keys(font.glyphs).length} glyphs)`;

if (q.get('bench') === '1') {
  // warm timings: best of 5 runs per builder
  const best = (fn: () => unknown) => { let b = Infinity; for (let i = 0; i < 5; i++) { const s = performance.now(); fn(); b = Math.min(b, performance.now() - s); } return b; };
  const r = [best(buildCharacterSprites), best(buildEntitySprites), best(buildIcons), best(buildFont)];
  document.getElementById('timing')!.textContent += `\nwarm best-of-5 ms — characters ${r[0].toFixed(1)}  entities ${r[1].toFixed(1)}  icons ${r[2].toFixed(1)}  font ${r[3].toFixed(1)}  total ${(r[0] + r[1] + r[2] + r[3]).toFixed(1)}`;
}

function h2(text: string) {
  const h = document.createElement('h2');
  h.textContent = text;
  root.appendChild(h);
}

function scaled(cv: HTMLCanvasElement, s = SCALE) {
  cv.style.width = `${cv.width * s}px`;
  cv.style.height = `${cv.height * s}px`;
  return cv;
}

/** all frames side by side on a background, cells shaded slightly so bounds are visible; anchor marked */
function sheet(a: Anim, bg: string): HTMLCanvasElement {
  const fw = a.frames[0].width, fh = a.frames[0].height;
  const cv = document.createElement('canvas');
  cv.width = a.frames.length * (fw + 2) + 2;
  cv.height = fh + 4;
  const g = cv.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, cv.width, cv.height);
  a.frames.forEach((f, i) => {
    const x = 2 + i * (fw + 2);
    g.fillStyle = 'rgba(255,255,255,0.045)';
    g.fillRect(x, 2, fw, fh);
    g.drawImage(f, x, 2);
    // anchor tick below the cell
    g.fillStyle = 'rgba(255,90,90,0.8)';
    g.fillRect(x + a.ax, 2 + fh + 1, 1, 1);
  });
  return scaled(cv);
}

const animators: { cv: HTMLCanvasElement; a: Anim; bg: string; fps: number }[] = [];
function liveCanvas(a: Anim, bg: string, fps: number, s = SCALE) {
  const cv = document.createElement('canvas');
  cv.width = a.frames[0].width + 4;
  cv.height = a.frames[0].height + 4;
  animators.push({ cv, a, bg, fps });
  return scaled(cv, s);
}

function fpsFor(key: string) {
  if (/walk|climb|glide|fall|tumble|warden|seidr|vent|torch|brazier|flame|spindle|banner|ring|target|charge/.test(key)) return 10;
  if (/warn/.test(key)) return 3;
  return 12;
}

function animSection(lib: SpriteLib, title: string) {
  h2(title);
  for (const key of Object.keys(lib)) {
    if (only.length && !only.some((o) => key.includes(o))) continue;
    const a = lib[key];
    const row = document.createElement('div');
    row.className = 'anim';
    const lab = document.createElement('div');
    lab.className = 'label';
    lab.innerHTML = `${key}<small>${a.frames.length}f ${a.frames[0].width}×${a.frames[0].height} @(${a.ax},${a.ay})</small>`;
    const sheets = document.createElement('div');
    sheets.style.display = 'flex';
    sheets.style.flexDirection = 'column';
    sheets.style.gap = '3px';
    sheets.appendChild(sheet(a, DARK));
    sheets.appendChild(sheet(a, EARTHY));
    const lv = document.createElement('div');
    lv.className = 'pair';
    if (live) {
      lv.appendChild(liveCanvas(a, DARK, fpsFor(key)));
      lv.appendChild(liveCanvas(a, EARTHY, fpsFor(key)));
    }
    row.append(lab, sheets, lv);
    root.appendChild(row);
  }
}

// --- readability: Wyrdlings on the three realms' terrain -------------------------------------

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function terrainSwatch(kind: 'earth' | 'snow' | 'lava', w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!;
  const sky = kind === 'earth' ? ['#e9b98f', '#9cc0d8'] : kind === 'snow' ? ['#1a2450', '#3a4c86'] : ['#1a0608', '#4a1210'];
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, sky[1]); grd.addColorStop(1, sky[0]);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  const ground = Math.floor(h * 0.62);
  const pal = kind === 'earth' ? ['#4a2c1c', '#5e3a22', '#70462a', '#3c8a3a', '#64b046']
    : kind === 'snow' ? ['#a9c4dc', '#c8dcec', '#e8f2fa', '#ffffff', '#f4fbff']
      : ['#1a0c0c', '#2a1212', '#3a1a16', '#ff6a1e', '#ffb03a'];
  for (let y = ground; y < h; y++) for (let x = 0; x < w; x++) {
    const d = y - ground;
    let c = pal[Math.floor(hash(x >> 1, y >> 1) * 3)];
    if (d < 2) c = pal[3];
    if (d === 0 && hash(x, 7) > 0.5) c = pal[4];
    if (kind === 'lava' && d > 6 && hash(x >> 2, y >> 2) > 0.93) c = pal[3];
    g.fillStyle = c; g.fillRect(x, y, 1, 1);
  }
  // back wall band behind for the dark backdrop case
  if (kind === 'lava') { g.fillStyle = 'rgba(255,90,20,0.08)'; g.fillRect(0, ground - 20, w, 20); }
  return { cv, ground };
}

function readSection() {
  h2('Readability — walk/fall/warden on earth, snow, lava rock (1×, 2×, 3×)');
  const wrap = document.createElement('div');
  wrap.className = 'row';
  for (const kind of ['earth', 'snow', 'lava'] as const) {
    for (const s of [1, 2, 3]) {
      const W = 96, H = 40;
      const { cv: bgc, ground } = terrainSwatch(kind, W, H);
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const fig = document.createElement('figure');
      fig.append(scaled(cv, s));
      const cap = document.createElement('figcaption');
      cap.textContent = `${kind} ${s}×`;
      fig.append(cap);
      wrap.append(fig);
      readers.push({ cv, bgc, ground });
    }
  }
  root.appendChild(wrap);
}
const readers: { cv: HTMLCanvasElement; bgc: HTMLCanvasElement; ground: number }[] = [];

// --- icons ------------------------------------------------------------------------------------

function iconSection() {
  h2('Icons (4× on UI panel, 1× and 3× below)');
  const wrap = document.createElement('div');
  wrap.className = 'row';
  for (const [k, cv] of Object.entries(icons)) {
    const fig = document.createElement('figure');
    const big = document.createElement('canvas');
    big.width = cv.width + 2; big.height = cv.height + 2;
    const g = big.getContext('2d')!;
    g.fillStyle = DARK; g.fillRect(0, 0, big.width, big.height);
    g.drawImage(cv, 1, 1);
    fig.append(scaled(big, Number(q.get('iscale') ?? 4)));
    const cap = document.createElement('figcaption');
    cap.textContent = k;
    fig.append(cap);
    wrap.append(fig);
  }
  root.appendChild(wrap);
  // strip at 1× and 3× on panel & earthy colour for the skill bar feel
  for (const [s, bg] of [[1, DARK], [3, DARK], [3, EARTHY]] as const) {
    const keys = Object.keys(icons);
    const strip = document.createElement('canvas');
    strip.width = keys.length * 18 + 2; strip.height = 20;
    const g = strip.getContext('2d')!;
    g.fillStyle = bg; g.fillRect(0, 0, strip.width, strip.height);
    keys.forEach((k, i) => g.drawImage(icons[k], 2 + i * 18, 2));
    const d = document.createElement('div');
    d.style.marginTop = '6px';
    d.append(scaled(strip, s));
    root.appendChild(d);
  }
}

// --- font -------------------------------------------------------------------------------------

function drawText(f: BitmapFont, text: string, color: string, shadow: string | null) {
  const lines = text.split('\n');
  const w = Math.max(...lines.map((l) => [...l].reduce((s, ch) => s + (f.glyphs[ch]?.w ?? 6), 0))) + 2;
  const h = lines.length * f.lineHeight + 2;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!;
  // tint: draw glyph, then colour with source-in on a temp canvas
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tg = tmp.getContext('2d')!;
  lines.forEach((line, li) => {
    let x = 0;
    for (const ch of line) {
      const gl = f.glyphs[ch];
      if (gl) tg.drawImage(f.canvas, gl.x, gl.y, gl.w, gl.h, x, li * f.lineHeight, gl.w, gl.h);
      x += gl?.w ?? 6;
    }
  });
  const tint = (col: string) => {
    const c2 = document.createElement('canvas');
    c2.width = w; c2.height = h;
    const g2 = c2.getContext('2d')!;
    g2.drawImage(tmp, 0, 0);
    g2.globalCompositeOperation = 'source-in';
    g2.fillStyle = col; g2.fillRect(0, 0, w, h);
    return c2;
  };
  if (shadow) g.drawImage(tint(shadow), 1, 1);
  g.drawImage(tint(color), 0, 0);
  return cv;
}

function fontSection() {
  h2('Bitmap font');
  const atlas = document.createElement('canvas');
  atlas.width = font.canvas.width + 4; atlas.height = font.canvas.height + 4;
  const ag = atlas.getContext('2d')!;
  ag.fillStyle = DARK; ag.fillRect(0, 0, atlas.width, atlas.height);
  ag.drawImage(font.canvas, 2, 2);
  root.appendChild(scaled(atlas, 3));
  const sample = 'NORNS: THREADS OF FATE\nThe quick brown fox jumps over the lazy dog.\n0123456789 +-/!?:.,\'()% ★→×\nSaved 12/20 (60%) ★★☆  Rewind → 30s  ×2';
  for (const [s, fg, sh, bg] of [[3, '#f4ecd8', '#2a1a3a', DARK], [2, '#f2c14e', '#3a1a08', EARTHY], [1, '#ffffff', '#000000', DARK]] as const) {
    const t = drawText(font, sample, fg, sh);
    const box = document.createElement('div');
    box.style.background = bg; box.style.display = 'inline-block'; box.style.padding = '6px'; box.style.margin = '6px 6px 0 0';
    box.append(scaled(t, s));
    root.appendChild(box);
  }
}

// --- assemble ---------------------------------------------------------------------------------

if (sections.includes('wyrd')) animSection(chars, 'Wyrdling & marks');
if (sections.includes('read')) readSection();
if (sections.includes('ent')) animSection(ents, 'Entities');
if (sections.includes('icons')) iconSection();
if (sections.includes('font')) fontSection();

let tick = 0;
function frame() {
  tick++;
  for (const { cv, a, bg, fps } of animators) {
    const g = cv.getContext('2d')!;
    g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
    const i = Math.floor((tick / 60) * fps) % a.frames.length;
    g.drawImage(a.frames[i], 2, 2);
  }
  const walkA = chars['wyrd.walk'], fallA = chars['wyrd.fall'], wardA = chars['wyrd.warden'];
  for (const { cv, bgc, ground } of readers) {
    const g = cv.getContext('2d')!;
    g.drawImage(bgc, 0, 0);
    const wi = Math.floor((tick / 60) * 10) % walkA.frames.length;
    const x = 10 + (Math.floor(tick / 6) % 40);
    g.drawImage(walkA.frames[wi], x - walkA.ax, ground - 1 - walkA.ay);
    g.save(); g.scale(-1, 1);
    g.drawImage(walkA.frames[(wi + 3) % 8], -(70 - walkA.ax) - 16, ground - 1 - walkA.ay);
    g.restore();
    g.drawImage(wardA.frames[Math.floor((tick / 60) * 6) % 4], 80 - wardA.ax, ground - 1 - wardA.ay);
    g.drawImage(fallA.frames[Math.floor((tick / 60) * 10) % 4], 48 - fallA.ax, 16 - fallA.ay + 4);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
