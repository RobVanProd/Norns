// Trailer maker (dev server + ffmpeg): node scripts/trailer.mjs <baseUrl> [workDir=trailer-work] [out=docs/trailer.mp4]
// Every shot is the real game. The page switches to a manual clock (window.__norns, dev builds only)
// and is stepped one video frame at a time, 1/30 s = one simulation tick, so particles, animation
// and the simulation all run at true speed however slow the browser is. Captions, fades and the end
// card are DOM overlays in the game's own pixel font. The music is the game's soundtrack rendered
// offline by the same engine (with the tape-bend rewind effect timed to the rewind shot), then
// ffmpeg muxes frames + audio into an H.264/AAC MP4.
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [base = 'http://localhost:5173', work = 'trailer-work', out = 'docs/trailer.mp4'] = process.argv.slice(2);
const FPS = 30;
const SOL = 's.solution = new N.SolutionPlayer(s.cfg.level.solution);';
const HOVER_LEAD = "const w = s.sim.d.wyrds.filter((w) => w.st === 'walk').sort((a, b) => b.x - a.x)[0]; s.armed = 'weaver'; s.hoverPt = { x: w.x, y: w.y - 7, touch: false };";
// at: advance (unrendered) to this tick; then: js run there; skipTo: advance again before filming
const SHOTS = [
  { name: 'title', url: '/', frames: 105, fadeIn: 24 },
  { name: 'bridge', url: '/?level=m2&go', sol: true, at: 185, frames: 90, caption: 'Guide the Wyrdlings home', bar: true },
  { name: 'foresight', url: '/?level=m2&go', at: 228, then: HOVER_LEAD, hold: true, frames: 90, caption: 'See their fate before it happens', bar: true },
  { name: 'rewind', url: '/?level=m2&go', at: 330, frames: 90, rewindAt: 18, caption: 'Rewind when fate goes wrong', bar: true },
  { name: 'niflheim', url: '/?level=n3&go', sol: true, at: 236, frames: 75, caption: 'Brave the frost of Niflheim' },
  { name: 'muspelheim', url: '/?level=u4&go', sol: true, at: 480, frames: 75, caption: 'and the fires of Muspelheim' },
  { name: 'wyrm', url: '/?level=m5&go', sol: true, at: 162, frames: 60, caption: 'Outwit three bosses' },
  { name: 'jotunn', url: '/?level=n5&go', sol: true, at: 300, then: "const b = s.sim.d.boss; b.act = 'slam'; b.at = 0;", skipTo: 306, frames: 50 },
  { name: 'herald', url: '/?level=u5&go', sol: true, at: 300, then: "const b = s.sim.d.boss; b.act = 'meteors'; b.at = 0;", skipTo: 318, frames: 50 },
  { name: 'end', url: '/', frames: 120, end: true, fadeOut: 30 },
];

const CSS = `
  .hud-top, .hint, .fate, .vision-banner, #caption { display: none !important; }
  body:not(.tr-bar) .hud-bottom { display: none !important; }
  .title-screen .menu, .title-screen .foot { visibility: hidden !important; }
  body.tr-endcard .title-screen { visibility: hidden !important; }
  body.tr-bar #tr-cap { bottom: 132px; }
  #tr-fade { position: fixed; inset: 0; background: #000; opacity: 0; z-index: 50; pointer-events: none; }
  #tr-cap { position: fixed; left: 0; right: 0; bottom: 78px; text-align: center; z-index: 40; pointer-events: none;
    font: 700 46px 'Pixelify Sans', monospace; color: #ffd76a; letter-spacing: 1px;
    text-shadow: 3px 3px 0 #1a0f08, -1px -1px 0 #1a0f08, 1px -1px 0 #1a0f08, -1px 1px 0 #1a0f08, 0 0 18px rgba(0,0,0,.6); }
  #tr-end { position: fixed; inset: 0; z-index: 45; display: none; flex-direction: column; align-items: center; justify-content: center;
    gap: 26px; background: rgba(8, 6, 13, 0.74); pointer-events: none; }
  #tr-end img { width: 672px; image-rendering: pixelated; filter: drop-shadow(0 6px 0 rgba(0,0,0,.5)); }
  #tr-end .a { font: 700 40px 'Pixelify Sans', monospace; color: #ffd76a; text-shadow: 3px 3px 0 #1a0f08; }
  #tr-end .b { font: 400 26px 'Silkscreen', monospace; color: #e8e2f4; text-shadow: 2px 2px 0 #000; }`;

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
// (don't edit source files while this runs: Vite's HMR would reload the page mid-shot)

let frame = 0;
const starts = {};
for (const shot of SHOTS) {
  starts[shot.name] = frame / FPS;
  await page.goto(base + shot.url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__norns?.scene()?.state === 'play' || window.__norns?.scene()?.cfg?.mode === 'attract', null, { timeout: 60000 });
  await page.waitForTimeout(600); // fonts and the title DOM settle
  await page.evaluate(({ shot, CSS, SOL }) => {
    const N = window.__norns, s = N.scene();
    N.manual(true);
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
    document.body.classList.toggle('tr-bar', !!shot.bar);
    document.body.classList.toggle('tr-endcard', !!shot.end);
    for (const id of ['tr-fade', 'tr-cap']) { const d = document.createElement('div'); d.id = id; document.body.append(d); }
    const end = document.createElement('div'); end.id = 'tr-end';
    end.innerHTML = '<img src="/docs/images/logo.png" alt=""><div class="a">Free to play in your browser</div><div class="b">github.com/RobVanProd/Norns</div>';
    document.body.append(end);
    if (s.hintQueue) { s.hintQueue = []; s.hintCooldown = 1e9; }
    if (shot.sol) new Function('s', 'N', SOL)(s, N);
    if (shot.at) s.debugAdvance(shot.at - s.sim.d.tick);
    if (shot.then) new Function('s', 'N', shot.then)(s, N);
    if (shot.skipTo) s.debugAdvance(shot.skipTo - s.sim.d.tick);
    // warm up (Foresight, branch preview, particles) without moving the simulation
    s.debugHold = true;
    for (let i = 0; i < 12; i++) N.step(1 / 60);
    s.debugHold = !!shot.hold;
  }, { shot, CSS, SOL });
  if (shot.end) await page.waitForFunction(() => document.querySelector('#tr-end img')?.complete);
  for (let i = 0; i < shot.frames; i++) {
    await page.evaluate(({ shot, i }) => {
      const N = window.__norns, s = N.scene();
      const fin = shot.fadeIn ?? 6, fout = shot.fadeOut ?? 6, n = shot.frames;
      const fade = Math.max(0, 1 - i / fin, 1 - (n - 1 - i) / fout);
      document.getElementById('tr-fade').style.opacity = String(Math.min(1, fade));
      const cap = document.getElementById('tr-cap');
      cap.textContent = shot.caption ?? '';
      const ca = Math.max(0, Math.min(1, (i - 5) / 8, (n - 4 - i) / 8));
      cap.style.opacity = String(ca);
      cap.style.transform = `translateY(${Math.round((1 - Math.min(1, (i - 5) / 8)) * 10)}px)`;
      const end = document.getElementById('tr-end');
      end.style.display = shot.end ? 'flex' : 'none';
      if (shot.end) end.style.opacity = String(Math.min(1, i / 12));
      if (shot.rewindAt !== undefined && i === shot.rewindAt) s.setRewind(true);
      N.step(1 / 60); N.step(1 / 60);
    }, { shot, i });
    await page.screenshot({ path: `${work}/f${String(frame).padStart(5, '0')}.png` });
    frame++;
  }
  console.log(`${shot.name}: ${shot.frames} frames`);
}
const total = frame / FPS;

// ------------------------------------------------------------------ music (the game's own engine)
const audioPage = await browser.newPage();
await audioPage.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: 'export const createHotContext = () => ({ accept() {}, dispose() {}, on() {}, invalidate() {} });' }));
await audioPage.goto(base + '/preview/audio.html', { waitUntil: 'load' });
await audioPage.waitForTimeout(1500);
const rw = SHOTS.find((s) => s.name === 'rewind');
const tRewind = starts.rewind + rw.rewindAt / FPS, tRewindEnd = starts.rewind + rw.frames / FPS;
const tBoss = starts.wyrm, tEnd = starts.end;
const tracks = await audioPage.evaluate(async ({ titleSec, bossSec, tRewind, tRewindEnd }) => {
  const A = await import('/src/audio/index.ts');
  A.warmAll();
  const pcm = (buf) => {
    const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
    const out = new Int16Array(L.length * 2);
    for (let i = 0; i < L.length; i++) {
      out[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767;
      out[i * 2 + 1] = Math.max(-1, Math.min(1, R[i])) * 32767;
    }
    let s = '';
    const b = new Uint8Array(out.buffer);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return { sr: buf.sampleRate, b64: btoa(s) };
  };
  const title = await A.renderSongOffline('title', titleSec, { events: [{ at: tRewind, rewind: true }, { at: tRewindEnd, rewind: false }] });
  const boss = await A.renderSongOffline('boss', bossSec, { intensity: 2 });
  const victory = await A.renderStingerOffline('victory');
  return { title: pcm(title), boss: pcm(boss), victory: pcm(victory) };
}, { titleSec: tBoss + 1, bossSec: tEnd - tBoss + 1.5, tRewind, tRewindEnd });
const wav = (name, { sr, b64 }) => {
  const data = Buffer.from(b64, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(`${work}/${name}.wav`, Buffer.concat([h, data]));
};
for (const [k, v] of Object.entries(tracks)) wav(k, v);
await browser.close();

// ------------------------------------------------------------------ mux
const ms = (t) => Math.round(t * 1000);
const filter = [
  `[1:a]volume=7dB,atrim=0:${(tBoss + 0.5).toFixed(3)},afade=t=out:st=${(tBoss - 0.25).toFixed(3)}:d=0.6[t]`,
  `[2:a]adelay=${ms(tBoss - 0.3)}|${ms(tBoss - 0.3)},afade=t=in:st=${(tBoss - 0.3).toFixed(3)}:d=0.3,afade=t=out:st=${(tEnd - 0.2).toFixed(3)}:d=0.7[b]`,
  `[3:a]adelay=${ms(tEnd)}|${ms(tEnd)}[v]`,
  `[t][b][v]amix=inputs=3:normalize=0:duration=longest,alimiter=limit=0.9,afade=t=out:st=${(total - 1.2).toFixed(3)}:d=1.2,atrim=0:${total.toFixed(3)}[a]`,
].join(';');
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', `${work}/f%05d.png`,
  '-i', `${work}/title.wav`, '-i', `${work}/boss.wav`, '-i', `${work}/victory.wav`,
  '-filter_complex', filter, '-map', '0:v', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '24', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', out,
], { stdio: 'inherit' });
console.log(`wrote ${out}: ${frame} frames, ${total.toFixed(1)} s`);
if (problems.length) { console.log('PAGE ERRORS:\n' + problems.join('\n')); process.exit(1); }
