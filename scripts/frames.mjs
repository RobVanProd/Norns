// Deterministic frame capture (dev server only, uses window.__norns):
//   node scripts/frames.mjs <url> <outDir> <w> <h> <tick,tick,...> [options]
// Loads the url (add &go; &solution plays the whole scripted solution, &vision Skuld's Vision of the
// quota route and &tier=1-4 one stage of it) and drives the game on its manual clock. For each listed
// tick it fast-forwards the simulation to `settle` ticks before it, then
// plays the rest one rendered frame per tick (1/30 s), so popups, particles, flashes and shake look
// exactly as a player would see them. Foresight jobs run to completion every frame, so its threads
// don't depend on how fast this machine is.
//   --cam=x,y        pin the camera (world px, top-left)
//   --dpr=N          device pixel ratio
//   --prefix=name    output file prefix (default f)
//   --settle=N       true-time frames played before each shot (default 45)
//   --freeze         stop the simulation at each shot tick and only let visuals settle (e.g. to show a
//                    branch preview on a hovered Wyrdling)
//   --do=TICK:js     run js at TICK with `s` = the play scene and `N` = window.__norns (repeatable),
//                    e.g. --do=0:"s.solution = new N.SolutionPlayer(s.cfg.level.solution)"
//   --eval=js --evalAt=tick   same as one --do (kept for older notes)
import { chromium } from 'playwright-core';

const [url, outDir, w, h, tickList, ...flags] = process.argv.slice(2);
const flag = (n) => { const f = flags.find((f) => f.startsWith(`--${n}=`)); return f ? f.slice(n.length + 3) : undefined; };
const settle = Number(flag('settle') ?? 45);
const freeze = flags.includes('--freeze');
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
  const N = window.__norns, s = N.scene();
  N.manual(true);
  s.debugFullForesight = true;
  if (cam) s.debugCam = { x: cam[0], y: cam[1] };
}, cam);
const tick = () => page.evaluate(() => window.__norns.scene().sim.d.tick);
if (flag('eval')) actions.push({ t: Number(flag('evalAt') ?? (await tick())), js: flag('eval') });
// jump without rendering (effects would not age), then play the last stretch frame by frame
const fastTo = (t) => page.evaluate((t) => { const s = window.__norns.scene(); if (t > s.sim.d.tick) s.debugAdvance(t - s.sim.d.tick); }, t);
const playTo = (t) => page.evaluate((t) => {
  const N = window.__norns, s = N.scene();
  for (let guard = 0; s.sim.d.tick < t && !s.sim.d.finished && guard < 100000; guard++) N.step(1 / 30);
}, t);
const runDue = async (t) => {
  for (const a of actions.filter((a) => a.t <= t && !a.done).sort((x, y) => x.t - y.t)) {
    await fastTo(a.t - settle);
    await playTo(a.t);
    await page.evaluate((js) => new Function('s', 'N', js)(window.__norns.scene(), window.__norns), a.js);
    a.done = true;
  }
};
for (const t of ticks) {
  await runDue(t);
  await fastTo(t - settle);
  await playTo(t);
  if (freeze) {
    await page.evaluate((n) => {
      const N = window.__norns, s = N.scene();
      s.debugHold = true;
      for (let i = 0; i < n; i++) N.step(1 / 30);
      s.debugHold = false;
    }, Math.min(settle, 20));
  }
  const file = `${outDir}/${prefix}-${String(t).padStart(5, '0')}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
if (problems.length) { console.log('PROBLEMS:\n' + problems.join('\n')); process.exit(1); }
