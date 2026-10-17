// Screenshot tour: node scripts/tour.mjs <baseUrl> <outDir> [waitMs] [w] [h] [ids...]
import { chromium } from 'playwright-core';
const [base, outDir, wait = '6000', w = '960', h = '540', ...ids] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(e.message));
for (const id of ids) {
  await page.goto(`${base}/?level=${id}&go`, { waitUntil: 'load' });
  await page.waitForTimeout(+wait);
  await page.screenshot({ path: `${outDir}/tour-${id}.png` });
  console.log('shot', id);
}
await browser.close();
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no console errors');
