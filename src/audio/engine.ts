// Live audio engine: owns the AudioContext, the bus graph, the song/stinger players and SFX voices.

import { mulberry32 } from './dsp';
import { INSTRUMENTS, warmZone, zoneCount, type InstId } from './instruments';
import { getSong, getStinger, prepare } from './library';
import { buildMixer, DEFAULT_VOLS, MUSIC_TRIM, setDelayForSong, type Mixer } from './mixer';
import { SongPlayer } from './player';
import { getSfxBuffer, SFX } from './sfx';
import { SFX_IDS, type AudioEngine, type SfxId, type SfxOpts, type SongId, type StingerId } from './types';

const LOOKAHEAD = 0.15; // s, foreground
const LOOKAHEAD_HIDDEN = 1.2; // s, background tabs (timers may be throttled)
const TICK_MS = 25;
const REWIND_CENTS = -884; // ×0.6 playback rate
const MAX_SFX_VOICES = 28;

interface SfxVoice { id: SfxId; src: AudioBufferSourceNode; g: GainNode; end: number }

export class Engine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private mixer: Mixer | null = null;
  private _unlocked = false;
  private unlocking: Promise<void> | null = null;
  private current: { id: SongId; player: SongPlayer } | null = null;
  private retiring: { player: SongPlayer; until: number }[] = [];
  private jingles: { player: SongPlayer; until: number }[] = [];
  private requested: { id: SongId; fadeIn?: number } | null = null;
  private intensity: 0 | 1 | 2 = 0;
  private rewinding = false;
  private paused = false;
  private speed: 1 | 2 | 4 = 1;
  private vols = { ...DEFAULT_VOLS };
  private muted = false;
  private bendModel = { t0: 0, c0: 0, target: 0, tau: 0.1 };
  private worker: Worker | null = null;
  private sfxLast = new Map<SfxId, number>();
  private voices: SfxVoice[] = [];
  private rand = mulberry32(0x5eed);
  private warmQueue: (() => void)[] = [];

  get unlocked(): boolean { return this._unlocked; }

  unlock(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state !== 'running') return this.ctx.resume().catch(() => undefined);
      return this.unlocking ?? Promise.resolve();
    }
    if (typeof window === 'undefined') return Promise.resolve();
    const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return Promise.resolve();
    // Everything up to resume() must run synchronously inside the user gesture.
    let ctx: AudioContext;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return Promise.resolve(); // no audio available: stay locked, every call remains a no-op
    }
    this.ctx = ctx;
    try {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch { /* ignore */ }
    const resumed = ctx.resume().catch(() => undefined);
    try {
      this.mixer = buildMixer(ctx);
    } catch (e) {
      console.warn('[audio] could not build mixer', e);
      return Promise.resolve();
    }
    this._unlocked = true;
    this.applyVolumes(true);
    this.applyFilters(true);
    this.startTimer();
    this.installLifecycle();
    this.unlocking = resumed.then(() => {
      if (this.requested) {
        const r = this.requested;
        this.requested = null;
        this.startSong(r.id, r.fadeIn);
      }
      this.queueWarmup();
    });
    return this.unlocking;
  }

  // ---- music --------------------------------------------------------------------------------

  playMusic(id: SongId, opts?: { fadeIn?: number }): void {
    if (!this._unlocked || !this.ctx) { this.requested = { id, fadeIn: opts?.fadeIn }; return; }
    if (this.current?.id === id) return;
    if (this.ctx.state !== 'running' && !this.current) { this.requested = { id, fadeIn: opts?.fadeIn }; return; }
    this.startSong(id, opts?.fadeIn);
  }

  private startSong(id: SongId, fadeIn?: number) {
    const ctx = this.ctx, m = this.mixer;
    if (!ctx || !m) return;
    if (this.current?.id === id) return;
    const song = getSong(id);
    prepare(song);
    const now = ctx.currentTime;
    const hadSong = !!this.current;
    const fade = Math.max(0, fadeIn ?? (hadSong ? 1.5 : 0.4));
    if (this.current) this.retire(this.current.player, Math.max(0.6, fade));
    const start = now + 0.06;
    const player = new SongPlayer({
      ctx, song, dryOut: m.musicIn, revOut: m.reverbIn, dlyOut: m.delayIn, bend: m.bend,
      startTime: start, intensity: () => this.intensity, rate: (t) => this.rateAt(t), startSilent: fade > 0.01,
    });
    if (fade > 0.01) player.ramp(1, start, fade);
    setDelayForSong(m, (song.delayBeats * 60) / song.bpm, song.delayFb, now);
    this.current = { id, player };
    player.pump(now, now + LOOKAHEAD);
  }

  private retire(p: SongPlayer, fade: number) {
    const now = this.ctx!.currentTime;
    p.ramp(0, now, fade);
    this.retiring.push({ player: p, until: now + fade + 0.1 });
  }

  stopMusic(fadeOut = 1): void {
    this.requested = null;
    if (!this.ctx || !this.current) return;
    this.retire(this.current.player, Math.max(0.02, fadeOut));
    this.current = null;
  }

  stinger(id: StingerId): void {
    const ctx = this.ctx, m = this.mixer;
    if (!ctx || !m || !this._unlocked) return;
    const song = getStinger(id);
    prepare(song);
    const now = ctx.currentTime;
    const start = now + 0.04;
    const len = (song.totalBeats * 60) / song.bpm;
    const player = new SongPlayer({ ctx, song, dryOut: m.jingleIn, revOut: m.reverbIn, startTime: start });
    player.pump(now, now + LOOKAHEAD);
    this.jingles.push({ player, until: start + len + 4 });
    this.current?.player.duck(0.22, now, len + 0.3);
  }

  setIntensity(level: 0 | 1 | 2): void {
    this.intensity = level === 2 ? 2 : level === 1 ? 1 : 0;
  }

  // ---- tape bend / filters -----------------------------------------------------------------

  private centsAt(t: number): number {
    const b = this.bendModel;
    if (t <= b.t0) return b.c0;
    return b.target + (b.c0 - b.target) * Math.exp(-(t - b.t0) / b.tau);
  }

  private rateAt(t: number): number {
    const c = this.centsAt(t);
    return Math.abs(c) < 0.5 ? 1 : Math.pow(2, c / 1200);
  }

  setRewinding(on: boolean): void {
    if (this.rewinding === on) return;
    this.rewinding = on;
    const ctx = this.ctx, m = this.mixer;
    if (!ctx || !m) return;
    const now = ctx.currentTime;
    const target = on ? REWIND_CENTS : 0;
    const tau = on ? 0.22 : 0.09;
    this.bendModel = { t0: now, c0: this.centsAt(now), target, tau };
    const p = m.bend.offset;
    p.cancelScheduledValues(now);
    p.setValueAtTime(this.bendModel.c0, now);
    p.setTargetAtTime(target, now, tau);
    m.wobbleGain.gain.cancelScheduledValues(now);
    m.wobbleGain.gain.setTargetAtTime(on ? 32 : 0, now, on ? 0.2 : 0.06);
    this.applyFilters();
  }

  setPaused(on: boolean): void {
    if (this.paused === on) return;
    this.paused = on;
    this.applyFilters();
  }

  setSpeed(mult: 1 | 2 | 4): void {
    this.speed = mult === 4 ? 4 : mult === 2 ? 2 : 1;
    this.applyFilters();
  }

  private applyFilters(immediate = false) {
    const ctx = this.ctx, m = this.mixer;
    if (!ctx || !m) return;
    const now = ctx.currentTime;
    const cutoff = this.paused ? 650 : this.rewinding ? 1300 : 20000;
    const q = this.paused ? 0.7 : this.rewinding ? 2.5 : 0.7;
    const gain = this.paused ? 0.45 : this.rewinding ? 0.8 : 1;
    const hp = this.speed === 4 ? 260 : this.speed === 2 ? 130 : 10;
    const tc = immediate ? 0.001 : 0.08;
    m.lp.frequency.setTargetAtTime(cutoff, now, tc);
    m.lp.Q.setTargetAtTime(q, now, tc);
    m.pauseGain.gain.setTargetAtTime(gain, now, tc);
    m.hp.frequency.setTargetAtTime(hp, now, tc);
  }

  // ---- volumes ------------------------------------------------------------------------------

  setVolumes(v: { master?: number; music?: number; sfx?: number }): void {
    const c = (x: number | undefined, d: number) => (x === undefined || !Number.isFinite(x) ? d : Math.max(0, Math.min(1, x)));
    this.vols = { master: c(v.master, this.vols.master), music: c(v.music, this.vols.music), sfx: c(v.sfx, this.vols.sfx) };
    this.applyVolumes();
  }

  setMuted(mu: boolean): void {
    this.muted = !!mu;
    this.applyVolumes();
  }

  private applyVolumes(immediate = false) {
    const ctx = this.ctx, m = this.mixer;
    if (!ctx || !m) return;
    const now = ctx.currentTime;
    const tc = immediate ? 0.001 : 0.05;
    m.master.gain.setTargetAtTime(this.muted ? 0 : this.vols.master, now, tc);
    m.musicVol.gain.setTargetAtTime(this.vols.music * MUSIC_TRIM, now, tc);
    m.sfxVol.gain.setTargetAtTime(this.vols.sfx, now, tc);
  }

  // ---- sfx ----------------------------------------------------------------------------------

  sfx(id: SfxId, opts?: SfxOpts): void {
    const ctx = this.ctx, m = this.mixer;
    if (!ctx || !m || !this._unlocked || ctx.state !== 'running') return;
    const def = SFX[id];
    if (!def) return;
    const now = ctx.currentTime;
    const last = this.sfxLast.get(id) ?? -1;
    if (now - last < (def.gap ?? 0.02)) return;
    this.sfxLast.set(id, now);
    // prune finished voices, enforce per-id and global limits (steal the oldest)
    this.voices = this.voices.filter((v) => v.end > now);
    const same = this.voices.filter((v) => v.id === id);
    if (same.length >= (def.voices ?? 4)) this.killVoice(same[0], now);
    if (this.voices.length >= MAX_SFX_VOICES) this.killVoice(this.voices[0], now);

    const buf = getSfxBuffer(id);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const jitter = def.jitter ? 1 + (this.rand() * 2 - 1) * def.jitter : 1;
    const pitch = Math.max(0.25, Math.min(4, (opts?.pitch ?? 1) * jitter));
    src.playbackRate.value = pitch;
    const g = ctx.createGain();
    g.gain.value = def.gain * Math.max(0, Math.min(1, opts?.volume ?? 1));
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, opts?.pan ?? 0));
    src.connect(g).connect(pan).connect(m.sfxIn);
    let send: GainNode | null = null;
    if (def.rev) { send = ctx.createGain(); send.gain.value = def.rev; pan.connect(send).connect(m.sfxRevIn); }
    const end = now + buf.duration / pitch;
    src.onended = () => { src.disconnect(); g.disconnect(); pan.disconnect(); send?.disconnect(); };
    src.start(now);
    this.voices.push({ id, src, g, end });
  }

  private killVoice(v: SfxVoice, now: number) {
    try {
      v.g.gain.cancelScheduledValues(now);
      v.g.gain.setTargetAtTime(0, now, 0.01);
      v.src.stop(now + 0.05);
    } catch { /* already stopped */ }
    v.end = 0;
    this.voices = this.voices.filter((x) => x !== v);
  }

  // ---- scheduler ----------------------------------------------------------------------------

  private startTimer() {
    const tick = () => this.pump();
    try {
      const code = 'let id=0;onmessage=e=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}';
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = tick;
      w.postMessage(TICK_MS);
      this.worker = w;
    } catch {
      this.worker = null;
    }
    // belt and braces: a main-thread interval too (cheap; pump is idempotent)
    window.setInterval(tick, this.worker ? 100 : TICK_MS);
  }

  private pump() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const ahead = typeof document !== 'undefined' && document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD;
    const horizon = now + ahead;
    this.current?.player.pump(now, horizon);
    this.retiring = this.retiring.filter((r) => {
      if (now >= r.until) { r.player.dispose(); return false; }
      r.player.pump(now, Math.min(horizon, r.until));
      return true;
    });
    this.jingles = this.jingles.filter((j) => {
      if (now >= j.until) { j.player.dispose(); return false; }
      j.player.pump(now, horizon);
      return true;
    });
    if (this.voices.length) this.voices = this.voices.filter((v) => v.end > now);
    if (this.warmQueue.length) {
      const t0 = performance.now();
      while (this.warmQueue.length && performance.now() - t0 < 6) this.warmQueue.shift()!();
    }
  }

  private installLifecycle() {
    const ctx = this.ctx!;
    const resume = () => {
      if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, resume, { capture: true, passive: true });
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running' && this.requested && !this.current) {
        const r = this.requested; this.requested = null; this.startSong(r.id, r.fadeIn);
      }
    });
  }

  /** Synthesise remaining samples in small slices on the scheduler tick (keeps first use glitch-free). */
  private queueWarmup() {
    const insts = Object.keys(INSTRUMENTS) as InstId[];
    // current song's zones are already built; the rest is synthesised one zone per slice
    for (const i of insts) for (let z = 0; z < zoneCount(i); z++) this.warmQueue.push(() => warmZone(i, z));
    for (const id of SFX_IDS) this.warmQueue.push(() => { getSfxBuffer(id); });
  }

  /** Debug info for the preview page. */
  debugState() {
    const p = this.current?.player;
    const t = this.ctx?.currentTime ?? 0;
    return {
      song: this.current?.id ?? null,
      beat: p ? p.beatAt(t) : 0,
      bar: p ? Math.floor(p.beatAt(t) / p.song.meter) : 0,
      intensity: this.intensity,
      rewinding: this.rewinding,
      paused: this.paused,
      state: this.ctx?.state ?? 'locked',
      voices: this.voices.length,
      rate: this.rateAt(t),
    };
  }
}
