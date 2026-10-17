// Compiled-song cache + instrument preparation shared by the live engine and offline tooling.

import { zoneFor } from './instruments';
import { compileSong, type CompiledSong } from './notation';
import { SONG_DEFS, STINGER_DEFS } from './songs';
import type { SongId, StingerId } from './types';

const cache = new Map<string, CompiledSong>();

export function getSong(id: SongId): CompiledSong {
  let s = cache.get('song:' + id);
  if (!s) { s = compileSong(id, SONG_DEFS[id]); cache.set('song:' + id, s); }
  return s;
}

export function getStinger(id: StingerId): CompiledSong {
  let s = cache.get('stinger:' + id);
  if (!s) { s = compileSong(id, STINGER_DEFS[id]); cache.set('stinger:' + id, s); }
  return s;
}

/** Synthesise every sample zone a song's notes use (no-op for zones already built). */
export function prepare(song: CompiledSong): void {
  for (const sec of song.form) {
    for (const e of sec.events) zoneFor(e.inst, e.midi);
    for (const e of sec.pre) zoneFor(e.inst, e.midi);
  }
}

/** Loop length in seconds (or total length for one-shots). */
export function songSeconds(song: CompiledSong, loopOnly = true): number {
  const beats = loopOnly && song.loopBeat >= 0 ? song.totalBeats - song.loopBeat : song.totalBeats;
  return (beats * 60) / song.bpm;
}
