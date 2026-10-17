// Deterministic frame capture (dev server only, uses window.__norns):
//   node scripts/frames.mjs <url> <outDir> <w> <h> <tick,tick,...> [--cam=x,y] [--dpr=N] [--prefix=name] [--eval=js] [--evalAt=tick]
// --eval runs once before stepping with `s` bound to the play scene (e.g. to force a boss attack).
// Loads the url (add &go, and &vision to replay the scripted solution), holds real-time ticking,
// then advances the simulation to each listed tick and screenshots it.
import { chromium } from 'playwright-core';

const [url, outDir, w, h, tickList, ...flags] = process.argv.slice(2);
const flag = (n) => { const f = flags.find((f) => f.startsWith(`--${n}=`)); return f ? f.slice(n.length + 3) : undefined; };
const cam = flag('cam')?.split(',').map(Number) ?? null;
const prefix = flag('prefix') ?? 'f';
const ticks = tickList.split(',').map(Number).sort((a, b) => a - b);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: Number(flag('dpr') ?? 1) });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => { const s = window.__norns?.scene(); return s && s.state === 'play'; }, null, { timeout: 60000 });
await page.evaluate((cam) => {
  const s = window.__norns.scene(); s.debugHold = true; if (cam) s.debugCam = { x: cam[0], y: cam[1] };
}, cam);
let at = await page.evaluate(() => window.__norns.scene().sim.d.tick);
const evalAt = Number(flag('evalAt') ?? at);
if (evalAt > at) { await page.evaluate((n) => window.__norns.scene().debugAdvance(n), evalAt - at); at = evalAt; }
if (flag('eval')) await page.evaluate((js) => new Function('s', js)(window.__norns.scene()), flag('eval'));
for (const t of ticks) {
  if (t > at) { await page.evaluate((n) => window.__norns.scene().debugAdvance(n), t - at); at = t; }
  await page.waitForTimeout(250);
  const file = `${outDir}/${prefix}-${String(t).padStart(5, '0')}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1); }
