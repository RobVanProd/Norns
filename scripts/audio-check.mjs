// Audio verification: renders every song (first N seconds; boss at each intensity), every
// stinger and every SFX through OfflineAudioContexts in headless Chromium, then prints duration,
// peak, RMS, NaN count and flags silence / clipping / NaNs (exit code 1 if anything is flagged).
// Also reports sample-synthesis timings.
//
//   node scripts/audio-check.mjs [--url http://localhost:5176] [--seconds 20] [--only songs|sfx|stingers] [--full]
//   --full also renders every song through its whole form and 8 s past the loop point (boss at intensity 2).
//
// If nothing is listening at --url, a Vite dev server is started on port 5176 and stopped after.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const BASE = arg('--url', 'http://localhost:5176');
const SECONDS = Number(arg('--seconds', '20'));
const ONLY = arg('--only', '');
const FULL = args.includes('--full');

async function reachable(url) {
  try { const r = await fetch(url); return r.ok || r.status === 404; } catch { return false; }
}

let server = null;
if (!(await reachable(BASE + '/'))) {
  const port = new URL(BASE).port || '5176';
  server = spawn('npx', ['vite', '--port', port, '--strictPort'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore', detached: true });
  for (let i = 0; i < 100 && !(await reachable(BASE + '/')); i++) await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const consoleProblems = [];
page.on('console', (m) => { if (m.type() === 'error') consoleProblems.push(m.text()); });
page.on('pageerror', (e) => consoleProblems.push(e.message));
// Disable Vite's HMR client: other files in the repo changing must not reload the page mid-render.
await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: 'export const createHotContext = () => ({ accept() {}, dispose() {}, on() {}, invalidate() {} });' }));
await page.goto(BASE + '/preview/audio.html', { waitUntil: 'load' });
// Vite may reload the page once after optimising deps on first visit; let it settle.
await page.waitForTimeout(1500);
await page.waitForLoadState('load');

const check = async ({ seconds, only, full }) => {
    const A = await import('/src/audio/index.ts');
    const out = { synth: null, perSong: {}, rows: [] };
    // 1) truly cold total: first thing in a fresh page (cold JIT, empty caches)
    const t0 = performance.now();
    out.synth = A.warmAll();
    out.synth.wallMs = performance.now() - t0;
    // 2) per-song cost with empty sample caches (zones are synthesised lazily per song)
    for (const id of A.SONG_IDS) out.perSong[id] = A.measureSongSynth(id);
    A.clearCaches();
    A.warmAll();
    const row = async (kind, name, fn) => {
      const r0 = performance.now();
      try {
        const buf = await fn();
        out.rows.push({ kind, name, renderMs: performance.now() - r0, ...A.analyseBuffer(buf) });
      } catch (e) {
        out.rows.push({ kind, name, error: String(e && e.stack || e) });
      }
    };
    if (!only || only === 'songs') {
      for (const id of A.SONG_IDS) {
        if (id === 'boss') {
          for (const i of [0, 1, 2]) await row('song', `boss@${i}`, () => A.renderSongOffline(id, seconds, { intensity: i }));
        } else {
          await row('song', id, () => A.renderSongOffline(id, seconds));
        }
      }
      await row('test', 'boss 0→1→2 live', () => A.renderSongOffline('boss', 12, { events: [{ at: 3, intensity: 1 }, { at: 7, intensity: 2 }] }));
      await row('test', 'midgard rewind', () => A.renderSongOffline('midgard', 9, { events: [{ at: 2, rewind: true }, { at: 5.5, rewind: false }] }));
      await row('test', 'title paused', () => A.renderSongOffline('title', 8, { events: [{ at: 2, paused: true }, { at: 6, paused: false }] }));
      if (full) {
        for (const id of A.SONG_IDS) {
          const s = A.getSong(id);
          const total = (s.totalBeats * 60) / s.bpm;
          await row('full', `${id}${id === 'boss' ? '@2' : ''}`, () => A.renderSongOffline(id, total + 8, { intensity: id === 'boss' ? 2 : 0 }));
        }
      }
    }
    if (!only || only === 'stingers') for (const id of A.STINGER_IDS) await row('stinger', id, () => A.renderStingerOffline(id));
    if (!only || only === 'sfx') for (const id of A.SFX_IDS) await row('sfx', id, () => A.renderSfxOffline(id));
    return out;
};

// title cold start in its own fresh page (what the player pays on first unlock)
let titleCold = null;
try {
  titleCold = await page.evaluate(async () => (await import('/src/audio/index.ts')).measureSongSynth('title'));
} catch { /* reported as n/a */ }
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(500);

let result;
try {
  for (let attempt = 0; ; attempt++) {
    try { result = await page.evaluate(check, { seconds: SECONDS, only: ONLY, full: FULL }); break; } catch (e) {
      if (attempt >= 2 || !/context was destroyed|navigation/i.test(String(e))) throw e;
      await page.waitForLoadState('load');
      await page.waitForTimeout(1000);
    }
  }
} finally {
  await browser.close();
  if (server) { try { process.kill(-server.pid); } catch { /* gone */ } }
}

// ---- report ---------------------------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
const num = (v, d = 3) => (typeof v === 'number' ? v.toFixed(d) : '-');
const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');
let flagged = 0;
console.log(`\n${pad('kind', 8)}${pad('name', 20)}${pad('dur', 8)}${pad('peak', 8)}${pad('rms', 8)}${pad('rmsdB', 8)}${pad('minWin', 9)}${pad('NaN', 5)}${pad('render', 9)}flags`);
console.log('-'.repeat(96));
for (const r of result.rows) {
  if (r.error) { flagged++; console.log(`${pad(r.kind, 8)}${pad(r.name, 20)}ERROR ${r.error.split('\n')[0]}`); continue; }
  const flags = [];
  if (r.rms < 1e-4) flags.push('SILENT');
  if (r.peak > 1.0) flags.push('CLIP');
  if (r.nan > 0) flags.push('NAN');
  if ((r.kind === 'song' || r.kind === 'full') && r.minWindowRms < 1e-4) flags.push('gap?');
  if (flags.some((f) => f !== 'gap?')) flagged++;
  console.log(`${pad(r.kind, 8)}${pad(r.name, 20)}${pad(num(r.duration, 2), 8)}${pad(num(r.peak), 8)}${pad(num(r.rms, 4), 8)}${pad(db(r.rms), 8)}${pad(num(r.minWindowRms, 4), 9)}${pad(r.nan, 5)}${pad(r.renderMs.toFixed(0) + 'ms', 9)}${flags.join(' ')}`);
}

const s = result.synth;
console.log(`\nSample synthesis, fully cold page (all zones + all SFX): ${s.totalMs.toFixed(0)} ms (wall ${s.wallMs.toFixed(0)} ms; SFX ${s.sfxMs.toFixed(0)} ms)`);
console.log(`  title song cold start in a fresh page: ${titleCold === null ? 'n/a' : titleCold.toFixed(0) + ' ms'}`);
console.log('  banks: ' + Object.entries(s.banks).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', '));
console.log('  per song, empty sample cache (zones its notes use): ' +
  Object.entries(result.perSong).map(([id, ms]) => `${id} ${ms.toFixed(0)} ms`).join(', '));
if (consoleProblems.length) { console.log('\nConsole errors:'); for (const p of consoleProblems) console.log('  ' + p); }
console.log(flagged ? `\n${flagged} item(s) flagged.` : '\nAll clear: no silence, clipping or NaNs.');
process.exit(flagged || consoleProblems.length ? 1 : 0);
