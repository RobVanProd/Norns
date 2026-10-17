// Deterministic frame capture (dev server only, uses window.__norns):
//   node scripts/frames.mjs <url> <outDir> <w> <h> <tick,tick,...> [options]
// Loads the url (add &go, and &vision to replay the scripted solution), holds real-time ticking,
// then advances the simulation to each listed tick and screenshots it.
//   --cam=x,y        pin the camera (world px, top-left)
//   --dpr=N          device pixel ratio
//   --prefix=name    output file prefix (default f)
//   --wait=ms        settle time before each shot (default 250; Foresight needs ~800)
//   --do=TICK:js     run js at TICK with `s` = the play scene and `N` = window.__norns (repeatable),
//                    e.g. --do=0:"s.solution = new N.SolutionPlayer(s.cfg.level.solution)"
//   --eval=js --evalAt=tick   same as one --do (kept for older notes)
import { chromium } from 'playwright-core';

const [url, outDir, w, h, tickList, ...flags] = process.argv.slice(2);
const flag = (n) => { const f = flags.find((f) => f.startsWith(`--${n}=`)); return f ? f.slice(n.length + 3) : undefined; };
const wait = Number(flag('wait') ?? 250);
const actions = flags.filter((f) => f.startsWith('--do=')).map((f) => {
  const body = f.slice(5), i = body.indexOf(':');
  return { t: Number(body.slice(0, i)), js: body.slice(i + 1) };
});
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
if (flag('eval')) actions.push({ t: Number(flag('evalAt') ?? at), js: flag('eval') });
const advanceTo = async (t) => { if (t > at) { await page.evaluate((n) => window.__norns.scene().debugAdvance(n), t - at); at = t; } };
const runDue = async (t) => {
  for (const a of actions.filter((a) => a.t <= t && !a.done).sort((x, y) => x.t - y.t)) {
    await advanceTo(a.t);
    await page.evaluate((js) => new Function('s', 'N', js)(window.__norns.scene(), window.__norns), a.js);
    a.done = true;
  }
};
for (const t of ticks) {
  await runDue(t);
  await advanceTo(t);
  await page.waitForTimeout(wait);
  const file = `${outDir}/${prefix}-${String(t).padStart(5, '0')}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1); }
