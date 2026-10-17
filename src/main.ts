import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/silkscreen/400.css';
import './ui/style.css';
import { buildArt } from './art';
import { Game } from './game/game';
import { Pipeline } from './render/pipeline';

const boot = document.getElementById('boot')!;
const msg = boot.querySelector('.boot-msg') as HTMLElement;
const fill = boot.querySelector('.boot-fill') as HTMLElement;

document.getElementById('rotate-ok')?.addEventListener('click', () => document.body.classList.add('rotate-ok'));

function frame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  let pipeline: Pipeline;
  try {
    pipeline = new Pipeline(canvas);
  } catch (e) {
    msg.textContent = 'This device could not start WebGL2, which NORNS needs.';
    console.error(e);
    return;
  }
  await frame();
  let n = 0;
  const art = buildArt((label) => {
    n++;
    msg.textContent = `${label}…`;
    fill.style.width = `${Math.min(100, n * 7)}%`;
  });
  fill.style.width = '100%';
  await frame();
  const game = new Game(pipeline, art, document.getElementById('ui')!);
  (window as unknown as { norns: Game }).norns = game;
  boot.classList.add('gone');
  setTimeout(() => boot.remove(), 600);
}

main().catch((e) => {
  console.error(e);
  msg.textContent = `Something tangled: ${(e as Error).message}`;
});
