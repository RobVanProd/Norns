// Browser smoke test of the main flow: node scripts/smoke.mjs <outDir> [baseUrl]. Exits 1 on page errors.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? "/tmp"; const base = process.argv[3] ?? "http://localhost:5180";
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
// desktop flow, first launch: title -> Begin -> story card -> straight into the first level -> menu -> map
let page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`${base}/`); await page.waitForTimeout(5000);
await page.click('text=Begin'); await page.waitForTimeout(500);
await page.click('.story .btn.gold'); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/flow-intro.png` });
await page.click('.modal.intro .btn.big.gold'); await page.waitForTimeout(4000);
// select digger and tap a wyrdling via keyboard + mouse
await page.keyboard.press('Digit1');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/flow-play.png` });
// Esc puts the calling away, a second Esc opens the menu
await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.click('text=World map'); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/flow-map.png` });
await page.close(); // free the software-GL renderer before the next page
// mobile landscape
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${base}/?level=m4&go`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(7000);
await page.screenshot({ path: `${out}/flow-mobile.png` });
await browser.close();
console.log(errs.length ? errs.join('\n') : 'no errors'); process.exit(errs.length ? 1 : 0);
