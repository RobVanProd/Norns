// Tooling: render songs / stingers / SFX into OfflineAudioContexts through the real bus graph and
// the real lookahead player (pumped in small slices via OfflineAudioContext.suspend), and analyse
// the result. Used by scripts/audio-check.mjs and the preview page.

import { clearSampleCache, getZones, INSTRUMENTS, synthTimings, type InstId } from './instruments';
import { getSong, getStinger, prepare } from './library';
import { buildMixer, setDelayForSong } from './mixer';
import { SongPlayer } from './player';
import { clearSfxCache, getSfxBuffer, SFX, sfxSynthMs } from './sfx';
import { SFX_IDS, type SfxId, type SongId, type StingerId } from './types';

export interface RenderOpts {
  sampleRate?: number;
  /** include the final soft-clip safety stage (default false, so clipping is measurable) */
  safetyClip?: boolean;
}

export interface SongRenderOpts extends RenderOpts {
  intensity?: 0 | 1 | 2;
  /** timeline of live-control changes, applied at bar-accurate scheduler slices */
  events?: { at: number; intensity?: 0 | 1 | 2; rewind?: boolean; paused?: boolean }[];
  /** start at the first occurrence of this form section (or a beat number) */
  from?: string | number;
  /** only render these tracks */
  solo?: string[];
}

const SLICE = 0.1;

export async function renderSongOffline(id: SongId, seconds = 20, opts: SongRenderOpts = {}): Promise<AudioBuffer> {
  const sr = opts.sampleRate ?? 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const m = buildMixer(ctx, { safetyClip: opts.safetyClip ?? false });
  const song = getSong(id);
  prepare(song);
  setDelayForSong(m, (song.delayBeats * 60) / song.bpm, song.delayFb, 0);
  let intensity = opts.intensity ?? 0;
  // tape-bend model mirrors Engine.setRewinding
  let bend = { t0: 0, c0: 0, target: 0, tau: 0.1 };
  const cents = (t: number) => (t <= bend.t0 ? bend.c0 : bend.target + (bend.c0 - bend.target) * Math.exp(-(t - bend.t0) / bend.tau));
  let startBeat = 0;
  if (typeof opts.from === 'number') startBeat = opts.from;
  else if (opts.from) {
    const i = song.form.findIndex((sec) => sec.name === opts.from);
    if (i < 0) throw new Error(`no section '${opts.from}' in ${id}`);
    startBeat = song.formStarts[i];
  }
  const solo = opts.solo;
  const player = new SongPlayer({
    ctx, song, dryOut: m.musicIn, revOut: m.reverbIn, dlyOut: m.delayIn, bend: m.bend, startTime: 0.05,
    intensity: () => intensity, rate: (t) => Math.pow(2, cents(t) / 1200), startBeat,
    trackFilter: solo ? (name) => solo.includes(name) : undefined,
  });
  const events = [...(opts.events ?? [])].sort((a, b) => a.at - b.at);
  const step = (t: number) => {
    for (const e of events) {
      if (e.at > t || e.at <= t - SLICE) continue;
      if (e.intensity !== undefined) intensity = e.intensity;
      if (e.rewind !== undefined) {
        const target = e.rewind ? -884 : 0, tau = e.rewind ? 0.22 : 0.09;
        bend = { t0: t, c0: cents(t), target, tau };
        m.bend.offset.setValueAtTime(bend.c0, t);
        m.bend.offset.setTargetAtTime(target, t, tau);
        m.wobbleGain.gain.setTargetAtTime(e.rewind ? 32 : 0, t, 0.1);
        m.lp.frequency.setTargetAtTime(e.rewind ? 1300 : 20000, t, 0.08);
      }
      if (e.paused !== undefined) {
        m.lp.frequency.setTargetAtTime(e.paused ? 650 : 20000, t, 0.08);
        m.pauseGain.gain.setTargetAtTime(e.paused ? 0.45 : 1, t, 0.08);
      }
    }
    player.pump(t, t + 0.15);
  };
  step(0);
  for (let t = SLICE; t < seconds - SLICE / 2; t += SLICE) {
    const tt = Math.round((t * sr) / 128) * 128 / sr;
    ctx.suspend(tt).then(() => { step(tt); ctx.resume(); });
  }
  return ctx.startRendering();
}

export async function renderStingerOffline(id: StingerId, opts: RenderOpts = {}): Promise<AudioBuffer> {
  const sr = opts.sampleRate ?? 44100;
  const song = getStinger(id);
  prepare(song);
  const len = (song.totalBeats * 60) / song.bpm + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(len * sr), sr);
  const m = buildMixer(ctx, { safetyClip: opts.safetyClip ?? false });
  const player = new SongPlayer({ ctx, song, dryOut: m.jingleIn, revOut: m.reverbIn, startTime: 0.02 });
  player.pump(0, len);
  return ctx.startRendering();
}

export async function renderSfxOffline(id: SfxId, opts: RenderOpts & { pitch?: number } = {}): Promise<AudioBuffer> {
  const sr = opts.sampleRate ?? 44100;
  const buf = getSfxBuffer(id);
  const def = SFX[id];
  const pitch = opts.pitch ?? 1;
  const len = buf.duration / pitch + (def.rev ? 1.2 : 0.1);
  const ctx = new OfflineAudioContext(2, Math.ceil(len * sr), sr);
  const m = buildMixer(ctx, { safetyClip: opts.safetyClip ?? false });
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = pitch;
  const g = ctx.createGain();
  g.gain.value = def.gain;
  src.connect(g).connect(def.bus === 'voice' ? m.voiceIn : m.sfxIn);
  if (def.rev) { const s = ctx.createGain(); s.gain.value = def.rev; g.connect(s).connect(m.sfxRevIn); }
  src.start(0.01);
  return ctx.startRendering();
}

export interface BufferStats { duration: number; peak: number; rms: number; nan: number; minWindowRms: number }

/** Peak / RMS / non-finite count, plus the quietest 250 ms window after the first second (gap detector). */
export function analyseBuffer(buf: AudioBuffer): BufferStats {
  let peak = 0, sum = 0, nan = 0, n = 0;
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  for (const d of chans) {
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) { nan++; continue; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sum += v * v;
      n++;
    }
  }
  const win = Math.floor(buf.sampleRate * 0.25);
  let minWin = Infinity;
  for (let s = buf.sampleRate; s + win <= buf.length; s += win) {
    let e = 0;
    for (const d of chans) for (let i = s; i < s + win; i++) { const v = d[i]; if (Number.isFinite(v)) e += v * v; }
    minWin = Math.min(minWin, Math.sqrt(e / (win * chans.length)));
  }
  return { duration: buf.duration, peak, rms: Math.sqrt(sum / Math.max(1, n)), nan, minWindowRms: Number.isFinite(minWin) ? minWin : 0 };
}

/** Synthesise every instrument bank and SFX now; returns per-item timings in ms. */
export function warmAll(): { banks: Record<string, number>; sfxMs: number; totalMs: number } {
  for (const i of Object.keys(INSTRUMENTS) as InstId[]) getZones(i);
  for (const id of SFX_IDS) getSfxBuffer(id);
  return synthStats();
}

/**
 * Tooling: cold synthesis cost of one song (sample caches are cleared first, so call this before
 * anything else that needs samples, e.g. at the start of a check run).
 */
export function measureSongSynth(id: SongId): number {
  clearSampleCache();
  const t0 = performance.now();
  prepare(getSong(id));
  return performance.now() - t0;
}

/** Tooling: forget all synthesised samples and SFX. */
export function clearCaches(): void {
  clearSampleCache();
  clearSfxCache();
}

export function synthStats(): { banks: Record<string, number>; sfxMs: number; totalMs: number } {
  const banks = { ...synthTimings };
  const bankMs = Object.values(banks).reduce((a, b) => a + b, 0);
  return { banks, sfxMs: sfxSynthMs, totalMs: bankMs + sfxSynthMs };
}
