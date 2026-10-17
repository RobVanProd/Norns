// Headless level preview: renders terrain, entities and the scripted solution's wyrdling trails to a PNG.
//   npx tsx scripts/levelpng.ts <levelId> [out.png] [--null] [--ticks N] [--scale 2] [--at T]
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { ALL_LEVELS } from '../src/levels';
import { Sim } from '../src/sim/sim';
import { SolutionPlayer } from '../src/sim/solution';
import { isAlive } from '../src/sim/state';

const args = process.argv.slice(2);
const id = args[0];
const out = args[1] && !args[1].startsWith('--') ? args[1] : `/tmp/claude-0/-home-user-Norns/d27a966b-b8f2-5c78-8912-d086f483128d/scratchpad/${id}.png`;
const flag = (n: string) => args.includes(n);
const opt = (n: string, d: number) => { const i = args.indexOf(n); return i >= 0 ? Number(args[i + 1]) : d; };
const scale = opt('--scale', 2);
const maxTicks = opt('--ticks', 30 * 60 * 5);
const at = opt('--at', -1);

const def = ALL_LEVELS.find((l) => l.id === id);
if (!def) { console.error('unknown level', id, ALL_LEVELS.map((l) => l.id).join(' ')); process.exit(1); }

const sim = Sim.create(def);
const W = def.width, H = def.height;
const img = new Uint8Array(W * H * 3);
const MAT: [number, number, number][] = [
  [20, 22, 34], [120, 86, 52], [110, 110, 120], [60, 70, 90], [214, 190, 120], [150, 210, 240], [242, 193, 78], [150, 120, 100], [80, 90, 110], [100, 70, 40],
];
const trails: { x: number; y: number; c: [number, number, number] }[] = [];
const player = new SolutionPlayer(flag('--null') ? [] : def.solution);
const assigns: string[] = [];
let snapshot: Uint8Array | null = null;
for (let t = 0; t < maxTicks && !sim.d.finished; t++) {
  for (const s of player.apply(sim)) assigns.push(`t=${sim.d.tick} #${s.nth} ${s.skill} @(${sim.d.wyrds[s.nth].x},${sim.d.wyrds[s.nth].y})`);
  sim.step();
  if (t % 3 === 0) {
    for (const w of sim.d.wyrds) if (isAlive(w)) trails.push({ x: w.x, y: w.y - 4, c: w.id === 0 ? [255, 255, 255] : [255, 230, 120] });
  }
  for (const e of sim.events) {
    if (e.type === 'death') trails.push({ x: e.x, y: e.y - 4, c: [255, 40, 40] }, { x: e.x + 1, y: e.y - 4, c: [255, 40, 40] }, { x: e.x, y: e.y - 5, c: [255, 40, 40] });
  }
  if (t === at) snapshot = sim.terrain.toFlat();
}
const flat = snapshot ?? sim.terrain.toFlat();
for (let i = 0; i < W * H; i++) {
  const m = flat[i];
  const c = m === 0 && sim.terrain.backWall[i] ? [34, 30, 44] : MAT[m] ?? [255, 0, 255];
  img.set(c, i * 3);
}
const put = (x: number, y: number, c: [number, number, number]) => {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && y >= 0 && x < W && y < H) img.set(c, (y * W + x) * 3);
};
for (const l of sim.L.liquids) for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) if (flat[y * W + x] === 0) put(x, y, l.type === 'lava' ? [230, 90, 20] : [40, 100, 200]);
for (const t of trails) put(t.x, t.y, t.c);
const box = (x: number, y: number, w: number, h: number, c: [number, number, number]) => {
  for (let i = 0; i < w; i++) { put(x + i, y, c); put(x + i, y + h - 1, c); }
  for (let j = 0; j < h; j++) { put(x, y + j, c); put(x + w - 1, y + j, c); }
};
box(sim.L.entrance.x - 8, sim.L.entrance.y, 16, 12, [80, 255, 80]);
box(sim.L.exit.x - 6, sim.L.exit.y - 14, 12, 15, [80, 200, 255]);
for (const p of sim.L.plates) box(p.x, p.y - 2, p.w, 3, [255, 120, 255]);
for (const l of sim.L.levers) box(l.x - 2, l.y - 10, 5, 11, [255, 120, 255]);
for (const s of sim.L.seidr) box(s.x - 8, s.y - 4, 17, 5, [0, 255, 220]);
if (sim.L.spindle) box(sim.L.spindle.x - 4, sim.L.spindle.y - 10, 9, 11, [255, 215, 0]);
for (const v of sim.L.vents) box(v.x, v.y - v.h, v.w, v.h, [150, 200, 255]);
for (const s of sim.L.spikes) box(s.x, s.y - 5, s.w, 6, [255, 60, 60]);
for (const b of sim.d.bodies) if (!b.gone) box(Math.round(b.x - b.r), Math.round(b.y - b.r), b.r * 2, b.r * 2, [200, 160, 120]);
if (def.boss) box(def.boss.x - 10, def.boss.y - 10, 20, 20, [255, 0, 0]);

// scale up
const SW = W * scale, SH = H * scale;
const raw = Buffer.alloc((SW * 3 + 1) * SH);
for (let y = 0; y < SH; y++) {
  raw[y * (SW * 3 + 1)] = 0;
  for (let x = 0; x < SW; x++) {
    const si = (Math.floor(y / scale) * W + Math.floor(x / scale)) * 3;
    const di = y * (SW * 3 + 1) + 1 + x * 3;
    raw[di] = img[si]; raw[di + 1] = img[si + 1]; raw[di + 2] = img[si + 2];
  }
}
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (buf: Buffer) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SW, 0); ihdr.writeUInt32BE(SH, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${def.id} "${def.name}": ticks=${sim.d.tick} saved=${sim.d.saved}/${def.wyrdlings} (quota ${def.quota}, target ${def.target}) dead=${sim.d.dead} spindle=${sim.d.spindle} boss=${sim.d.boss ? sim.d.boss.hp : '-'} finished=${sim.d.finished}`);
for (const a of assigns) console.log('  ' + a);
console.log('wrote', out);
