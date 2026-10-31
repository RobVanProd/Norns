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
/** Arm `skill` and hover Wyrdling `nth` (as a mouse would), so Foresight shows its branch and terrain ghost. */
const hover = (nth, skill) => `const w = s.sim.d.wyrds[${nth}]; s.armed = '${skill}'; s.hoverPt = { x: w.x, y: w.y - 7, touch: false };`;
// url: &solution plays the level's scripted solution from tick 0; at: advance (unrendered) to this tick;
// then: js run there (s = the play scene); hold: the simulation stands still while visuals run; cam: pin the
// camera (world px); rewindAt / rewindStop: frames to start and end Rewind. The bosses fight on their own
// schedule (scripts/bosstrace.ts gives the ticks), so each shot shows a real attack with its telegraph.
const M2 = [53, 20];
const SHOTS = [
  { name: 'title', url: '/', frames: 90, fadeIn: 24 },
  // the lead's rising bridge climbs out over the gorge, the line following it up
  // (the Midgard captions go up top, clear of the gorge where the lead falls in the rewind shot)
  { name: 'bridge', url: '/?level=m2&go&solution', at: 395, cam: M2, frames: 105, caption: 'Guide the Wyrdlings home', bar: true, top: true },
  // a Weaver armed over the lead: its rising bridge as a ghost, and the fates it changes
  { name: 'foresight', url: '/?level=m2&go', at: 292, cam: M2, then: hover(0, 'weaver') + ' s.projectKey = true;', hold: true, frames: 75, caption: 'See their fate before it happens', bar: true, top: true },
  // with no calling the lead drowns in the gorge; Rewind takes the run back
  { name: 'rewind', url: '/?level=m2&go', at: 326, cam: M2, frames: 84, rewindAt: 28, rewindStop: 56, caption: 'Rewind when fate goes wrong', bar: true, top: true },
  // paused with a Warden armed over the lead on the plate: the verdict line weighs the whole run. 69 frames so
  // the cut to Niflheim (frame 423, 14.1 s) lands where the title song's A section comes in (the rewind's tape
  // slow-down pushes it from 13.8 s to 14.1 s, as measured; re-check it if an earlier shot changes)
  { name: 'verdict', url: '/?level=n3&go', at: 170, cam: [0, 60], then: hover(0, 'warden') + ' s.projectKey = true; s.togglePause();', frames: 69, caption: 'Pause, and weigh every choice', bar: true },
  // the Warden holds the plate and the hopper pours its snow into the chasm
  { name: 'niflheim', url: '/?level=n3&go&solution', at: 190, cam: [60, 50], frames: 70, caption: 'Brave the frost of Niflheim' },
  // the boulder rolls into the cracked hollow, breaks through (tick 393) and lands in the fire (424), which
  // hardens around it before the fade (caption up top, clear of the lava pool)
  { name: 'muspelheim', url: '/?level=u2&go&solution', at: 356, cam: [40, 60], frames: 94, caption: 'and the fires of Muspelheim', top: true },
  // zoomed in one step (as the + key does): the Wyrm rears and spits two globs of venom (ticks 454, 463) that
  // arc over the arena onto their red rings on the floor (520, 530); the Wyrm is in view throughout
  { name: 'wyrm', url: '/?level=m5&go&solution', at: 452, cam: [213, 104], then: 's.input.h.zoom(1);', frames: 86, caption: 'Outwit three bosses' },
  // the Jötunn's fist over the yard, its crush ring on the ground, as a Seiðr beam strikes him
  // (caption up top: the attack lands on the floor)
  { name: 'jotunn', url: '/?level=n5&go&solution', at: 700, frames: 55, caption: 'Every attack is foretold', top: true },
  // the Herald's meteors, each landing on its marked ring
  { name: 'herald', url: '/?level=u5&go&solution', at: 165, frames: 55 },
  { name: 'end', url: '/', frames: 110, end: true, fadeOut: 30 },
];

const CSS = `
  .hud-top, .hint, .fate, .notice, .hud-notes, .vision-banner, #caption { display: none !important; }
  body:not(.tr-bar) .hud-bottom { display: none !important; }
  .title-screen .menu, .title-screen .foot { visibility: hidden !important; }
  body.tr-endcard .title-screen { visibility: hidden !important; }
  body.tr-bar #tr-cap { bottom: 132px; }
  body.tr-top #tr-cap { top: 132px; bottom: auto; }
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
// a fresh profile with tutorial hints off: no level tips, and no lesson pauses the game mid-shot
await page.addInitScript(() => {
  if (!localStorage.getItem('norns.save.v1')) localStorage.setItem('norns.save.v1', JSON.stringify({ v: 1, settings: { hints: false } }));
});
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
  await page.evaluate(({ shot, CSS }) => {
    const N = window.__norns, s = N.scene();
    N.manual(true);
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
    document.body.classList.toggle('tr-bar', !!shot.bar);
    document.body.classList.toggle('tr-top', !!shot.top);
    document.body.classList.toggle('tr-endcard', !!shot.end);
    for (const id of ['tr-fade', 'tr-cap']) { const d = document.createElement('div'); d.id = id; document.body.append(d); }
    const end = document.createElement('div'); end.id = 'tr-end';
    end.innerHTML = '<img src="/docs/images/logo.png" alt=""><div class="a">Free to play in your browser</div><div class="b">robvanprod.github.io/Norns</div>';
    document.body.append(end);
    if (s.cfg.mode === 'play') {
      s.cfg.hints = false;
      s.pendingTip = null;
      s.hud?.hideHint();
      // Foresight jobs finish every frame, so the threads don't depend on how fast this machine is
      s.debugFullForesight = true;
    }
    if (shot.cam) s.debugCam = { x: shot.cam[0], y: shot.cam[1] };
    if (shot.at) s.debugAdvance(shot.at - s.sim.d.tick);
    if (shot.then) new Function('s', 'N', shot.then)(s, N);
    // warm up (Foresight, branch preview, verdict, particles) without moving the simulation
    s.debugHold = true;
    for (let i = 0; i < 12; i++) N.step(1 / 60);
    s.debugHold = !!shot.hold;
  }, { shot, CSS });
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
      if (shot.rewindStop !== undefined && i === shot.rewindStop) s.setRewind(false);
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
const tRewind = starts.rewind + rw.rewindAt / FPS, tRewindEnd = starts.rewind + (rw.rewindStop ?? rw.frames) / FPS;
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
