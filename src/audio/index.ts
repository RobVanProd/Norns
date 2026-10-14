// NORNS audio: a 32-bit-era style sample engine. All instrument samples, SFX and reverb impulse
// responses are synthesised in code; songs are written in a compact pattern notation
// (see notation.ts) and played by a lookahead scheduler on AudioContext time.
//
//   import { audio } from './audio';
//   button.onclick = () => { audio.unlock(); audio.playMusic('title'); };
//   audio.sfx('assign', { pan: -0.3 });
//
// Calls made before unlock() are safe no-ops (the last requested song starts on unlock).

import { Engine } from './engine';
import type { AudioEngine } from './types';

export type { SongId, StingerId, SfxId, SfxOpts, AudioEngine } from './types';
export { SONG_IDS, STINGER_IDS, SFX_IDS } from './types';

const engine = new Engine();

export const audio: AudioEngine = engine;

/** Current song / bar / intensity / rewind state (for dev tools). */
export const audioDebug = () => engine.debugState();

// Tooling (offline rendering + analysis). Tree-shaken out of builds that don't import them.
export {
  renderSongOffline, renderStingerOffline, renderSfxOffline, analyseBuffer, synthStats, warmAll, measureSongSynth, clearCaches,
} from './offline';
export { getSong, songSeconds } from './library';
