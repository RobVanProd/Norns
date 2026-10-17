// Builds a single self-contained HTML page (JS, CSS and fonts inlined) for sharing as one file.
//   node scripts/artifact.mjs <out.html>
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const out = process.argv[2] ?? 'dist-single/norns.html';
execSync('npx vite build --outDir dist-single --emptyOutDir', {
  stdio: 'inherit',
  env: { ...process.env, NORNS_SINGLE: '1' },
});
const assets = readdirSync('dist-single/assets');
const js = assets.filter((f) => f.endsWith('.js')).map((f) => readFileSync(`dist-single/assets/${f}`, 'utf8'));
const css = assets.filter((f) => f.endsWith('.css')).map((f) => readFileSync(`dist-single/assets/${f}`, 'utf8'));
let html = readFileSync('dist-single/index.html', 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const head = `<title>Norns</title>
<meta name="theme-color" content="#0d0b14">
<style>${css.join('\n')}</style>`;
const script = js.map((j) => `<script type="module">${j.replace(/<\/script/gi, '<\\/script')}</script>`).join('\n');
writeFileSync(out, `${head}\n${body}\n${script}\n`);
console.log(`wrote ${out} (${(readFileSync(out).length / 1024).toFixed(0)} KB)`);
