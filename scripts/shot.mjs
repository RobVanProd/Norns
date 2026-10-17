// Screenshot helper: node scripts/shot.mjs <url> <out.png> [width=960] [height=540] [waitMs=1500] [--mobile] [--dpr=1.25]
// Prints console errors/warnings from the page. Uses the preinstalled Chromium.
import { chromium } from 'playwright-core';

const [url, out, w = '960', h = '540', wait = '1500', ...flags] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [--mobile]');
  process.exit(2);
}
const mobile = flags.includes('--mobile');
const dprFlag = flags.find((f) => f.startsWith('--dpr='));
const dpr = dprFlag ? Number(dprFlag.slice(6)) : mobile ? 2 : 1;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({
  viewport: { width: +w, height: +h },
  deviceScaleFactor: dpr,
  isMobile: mobile,
  hasTouch: mobile,
});
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
await browser.close();
for (const p of problems) console.log(p);
console.log(`saved ${out}${problems.length ? ` (${problems.length} console problems)` : ''}`);
