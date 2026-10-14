// Dev audition page for the NORNS audio engine: every song, intensity, rewind/pause/speed,
// every stinger and every SFX.
import {
  audio, audioDebug, getSong, songSeconds, synthStats, SFX_IDS, SONG_IDS, STINGER_IDS,
  type SfxId, type SongId, type StingerId,
} from '../src/audio';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $<HTMLDivElement>('status');
let current: SongId | null = null;

function btn(label: string, parent: HTMLElement, onClick: (e: MouseEvent) => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', (e) => { void audio.unlock(); onClick(e); });
  parent.appendChild(b);
  return b;
}

$('unlock').addEventListener('click', async () => {
  await audio.unlock();
  $('hint').textContent = 'Audio unlocked.';
});

const songBtns = new Map<SongId, HTMLButtonElement>();
for (const id of SONG_IDS) {
  const secs = songSeconds(getSong(id)).toFixed(0);
  const b = btn(`${id} (${secs}s loop)`, $('songs'), () => {
    audio.playMusic(id);
    current = id;
    for (const [k, v] of songBtns) v.classList.toggle('on', k === id);
  });
  songBtns.set(id, b);
}

$('stop').addEventListener('click', () => {
  audio.stopMusic(1.2);
  current = null;
  for (const v of songBtns.values()) v.classList.remove('on');
});

document.querySelectorAll<HTMLButtonElement>('.int').forEach((b) => b.addEventListener('click', () => {
  const lvl = Number(b.dataset.i) as 0 | 1 | 2;
  audio.setIntensity(lvl);
  document.querySelectorAll('.int').forEach((x) => x.classList.toggle('on', x === b));
}));

document.querySelectorAll<HTMLButtonElement>('.spd').forEach((b) => b.addEventListener('click', () => {
  audio.setSpeed(Number(b.dataset.s) as 1 | 2 | 4);
  document.querySelectorAll('.spd').forEach((x) => x.classList.toggle('on', x === b));
}));

const rw = $<HTMLButtonElement>('rewind');
const rwOn = () => { audio.setRewinding(true); audio.sfx('rewind_start'); rw.classList.add('on'); };
const rwOff = () => { if (!rw.classList.contains('on')) return; audio.setRewinding(false); audio.sfx('rewind_end'); rw.classList.remove('on'); };
rw.addEventListener('pointerdown', rwOn);
rw.addEventListener('pointerup', rwOff);
rw.addEventListener('pointerleave', rwOff);

let paused = false;
$('pause').addEventListener('click', () => {
  paused = !paused;
  audio.setPaused(paused);
  audio.sfx(paused ? 'pause' : 'unpause');
  $('pause').classList.toggle('on', paused);
});

const vol = () => audio.setVolumes({
  master: Number($<HTMLInputElement>('vMaster').value),
  music: Number($<HTMLInputElement>('vMusic').value),
  sfx: Number($<HTMLInputElement>('vSfx').value),
});
for (const id of ['vMaster', 'vMusic', 'vSfx']) $(id).addEventListener('input', vol);
let muted = false;
$('mute').addEventListener('click', () => { muted = !muted; audio.setMuted(muted); $('mute').classList.toggle('on', muted); });

for (const id of STINGER_IDS) btn(id, $('stingers'), () => audio.stinger(id as StingerId));

let series = 0;
let seriesTimer = 0;
for (const id of SFX_IDS) {
  btn(id, $('sfx'), (e) => {
    if (e.altKey) {
      window.clearTimeout(seriesTimer);
      series++;
      seriesTimer = window.setTimeout(() => { series = 0; }, 1200);
    }
    audio.sfx(id as SfxId, {
      pan: e.shiftKey ? Math.random() * 2 - 1 : 0,
      pitch: e.altKey ? Math.pow(2, Math.min(series - 1, 12) / 12) : 1,
    });
  }, 'small');
}

// keyboard: R = hold rewind, P = pause, 0/1/2 = intensity
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'r') rwOn();
  if (e.key === 'p') $('pause').click();
  if (e.key === '0' || e.key === '1' || e.key === '2') (document.querySelector(`.int[data-i="${e.key}"]`) as HTMLButtonElement | null)?.click();
});
window.addEventListener('keyup', (e) => { if (e.key === 'r') rwOff(); });

function tick() {
  const d = audioDebug();
  const s = synthStats();
  status.textContent =
    `state: ${d.state}   song: ${d.song ?? '—'}   bar: ${d.bar}   beat: ${d.beat.toFixed(2)}   intensity: ${d.intensity}\n` +
    `rewinding: ${d.rewinding} (rate ${d.rate.toFixed(3)})   paused: ${d.paused}   sfx voices: ${d.voices}   selected: ${current ?? '—'}\n` +
    `sample synthesis so far: ${s.totalMs.toFixed(0)} ms (banks ${Object.keys(s.banks).length}, sfx ${s.sfxMs.toFixed(0)} ms)`;
  requestAnimationFrame(tick);
}
tick();
