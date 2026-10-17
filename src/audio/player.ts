// Lookahead song player. Works on any BaseAudioContext: the live engine pumps it from a timer a
// little ahead of ctx.currentTime; offline tooling pumps it once for the whole render.

import { INSTRUMENTS, zoneFor, type InstId } from './instruments';
import { forEachEvent, type CompiledSong, type NoteEvent } from './notation';

const PRE_LOOK = 1.4; // seconds: reverse swells are scheduled this far early

/** Schedule one sampled note. Returns the source for optional tracking. */
export function playNote(
  ctx: BaseAudioContext, instId: InstId, midi: number, vel: number, t: number, dur: number,
  dest: AudioNode, bend?: AudioNode, offset = 0,
): AudioBufferSourceNode {
  const inst = INSTRUMENTS[instId];
  const zone = zoneFor(instId, midi);
  const src = ctx.createBufferSource();
  src.buffer = zone.buf;
  src.playbackRate.value = Math.pow(2, (midi - zone.root) / 12);
  if (zone.loop) {
    src.loop = true;
    src.loopStart = zone.loop[0];
    src.loopEnd = zone.loop[1];
  }
  const g = ctx.createGain();
  const peak = inst.gain * Math.pow(Math.max(0, Math.min(1, vel)), 1.5);
  const e = inst.env;
  const p = g.gain;
  let stopAt: number;
  if (inst.oneShot) {
    p.value = peak;
    stopAt = t + (zone.buf.duration - offset) / src.playbackRate.value + 0.02;
  } else {
    const a = Math.max(0.001, e.a);
    const off = t + Math.max(dur, a + 0.01);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + a);
    if (e.d && e.s !== undefined && off > t + a) p.setTargetAtTime(peak * e.s, t + a, e.d / 3);
    p.setTargetAtTime(0, off, Math.max(0.005, e.r / 4));
    stopAt = off + e.r * 1.6 + 0.02;
    if (!zone.loop) stopAt = Math.min(stopAt, t + zone.buf.duration / src.playbackRate.value + 0.02);
  }
  src.connect(g);
  g.connect(dest);
  if (bend) bend.connect(src.detune);
  src.onended = () => {
    src.disconnect();
    g.disconnect();
    if (bend) { try { bend.disconnect(src.detune); } catch { /* already gone */ } }
  };
  src.start(t, offset);
  src.stop(stopAt);
  return src;
}

export interface PlayerOpts {
  ctx: BaseAudioContext;
  song: CompiledSong;
  dryOut: AudioNode;
  revOut?: AudioNode;
  dlyOut?: AudioNode;
  bend?: AudioNode;
  startTime: number;
  intensity?: () => number;
  rate?: (t: number) => number;
  level?: number;
  /** start with the output at 0 (caller ramps it up) */
  startSilent?: boolean;
  /** begin playback at this song beat instead of 0 (tooling / auditioning) */
  startBeat?: number;
  /** only play tracks for which this returns true (tooling: solo/mute) */
  trackFilter?: (name: string) => boolean;
}

interface Channel { input: GainNode; nodes: AudioNode[] }

export class SongPlayer {
  readonly song: CompiledSong;
  private ctx: BaseAudioContext;
  private bps: number;
  private anchorTime: number;
  private anchorBeat = 0;
  private rate = 1;
  private sched = 0;
  private schedPre = 0;
  private bar = -1;
  private activeI = 0;
  private channels: Channel[] = [];
  private buses: GainNode[] = [];
  private opts: PlayerOpts;
  finished = false;
  disposed = false;

  constructor(o: PlayerOpts) {
    this.opts = o;
    this.ctx = o.ctx;
    this.song = o.song;
    this.bps = o.song.bpm / 60;
    this.anchorTime = o.startTime;
    this.anchorBeat = this.sched = this.schedPre = o.startBeat ?? 0;
    const level = (o.level ?? 1) * o.song.gain;
    const mk = (dest?: AudioNode) => {
      const b = this.ctx.createGain();
      b.gain.value = o.startSilent ? 0 : level;
      if (dest) b.connect(dest);
      this.buses.push(b);
      return b;
    };
    const dry = mk(o.dryOut);
    const rev = o.revOut ? mk(o.revOut) : null;
    const dly = o.dlyOut ? mk(o.dlyOut) : null;
    for (const tr of o.song.tracks) {
      const input = this.ctx.createGain();
      input.gain.value = tr.vol;
      const nodes: AudioNode[] = [input];
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = tr.pan;
      input.connect(pan).connect(dry);
      nodes.push(pan);
      if (rev && tr.rev > 0) {
        const s = this.ctx.createGain(); s.gain.value = tr.rev; input.connect(s).connect(rev); nodes.push(s);
      }
      if (dly && tr.dly > 0) {
        const s = this.ctx.createGain(); s.gain.value = tr.dly; input.connect(s).connect(dly); nodes.push(s);
      }
      this.channels.push({ input, nodes });
    }
  }

  beatAt(time: number): number { return this.anchorBeat + (time - this.anchorTime) * this.bps * this.rate; }
  timeAt(beat: number): number { return this.anchorTime + (beat - this.anchorBeat) / (this.bps * this.rate); }

  /** Schedule everything up to `horizon` (ctx time). Returns false once a one-shot song is done. */
  pump(now: number, horizon: number): boolean {
    if (this.disposed) return false;
    const r = this.opts.rate ? this.opts.rate(now) : 1;
    if (Math.abs(r - this.rate) > 1e-5) {
      const T = Math.max(now, this.anchorTime);
      this.anchorBeat = this.beatAt(T);
      this.anchorTime = T;
      this.rate = r;
    }
    const nowBeat = this.beatAt(now);
    // fell far behind (throttled timer / long GC): skip what can no longer be played on time
    if (this.sched < nowBeat - 0.05 * this.bps) this.sched = nowBeat;
    if (this.schedPre < nowBeat) this.schedPre = nowBeat;
    const end = this.beatAt(horizon);
    if (end > this.sched) {
      forEachEvent(this.song, this.sched, end, false, (ev, b) => this.trigger(ev, b, now, false));
      this.sched = end;
    }
    const endPre = this.beatAt(horizon + PRE_LOOK);
    if (endPre > this.schedPre) {
      forEachEvent(this.song, this.schedPre, endPre, true, (ev, b) => this.trigger(ev, b, now, true));
      this.schedPre = endPre;
    }
    if (this.song.loopIndex < 0 && this.sched >= this.song.totalBeats) this.finished = true;
    return !this.finished;
  }

  private trigger(ev: NoteEvent, absBeat: number, now: number, pre: boolean) {
    const tr = this.song.tracks[ev.track];
    let intensity: number;
    if (pre) intensity = this.opts.intensity ? this.opts.intensity() : 0;
    else {
      const bar = Math.floor(absBeat / this.song.meter + 1e-9);
      if (bar !== this.bar) { this.bar = bar; this.activeI = this.opts.intensity ? this.opts.intensity() : 0; }
      intensity = this.activeI;
    }
    if (intensity < tr.minI || intensity > tr.maxI) return;
    if (this.opts.trackFilter && !this.opts.trackFilter(tr.name)) return;
    let t = this.timeAt(absBeat);
    let offset = 0;
    if (pre) {
      t -= INSTRUMENTS[ev.inst].pre ?? 0;
      if (t < now) {
        if (now - t > 0.15) return; // too late to swell properly (e.g. song starting on a swell)
        offset = now - t;
        t = now;
      }
    } else {
      if (t < now - 0.03) return;
      if (t < now) t = now;
    }
    const dur = ev.len / (this.bps * this.rate);
    playNote(this.ctx, ev.inst, ev.midi, ev.vel, t, dur, this.channels[ev.track].input, this.opts.bend, offset);
  }

  /** Ramp the player's output level (fades and ducking). */
  ramp(target: number, at: number, dur: number) {
    for (const b of this.buses) {
      const p = b.gain;
      const lvl = target * this.song.gain * (this.opts.level ?? 1);
      if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(at);
      else { p.cancelScheduledValues(at); p.setValueAtTime(p.value, at); }
      p.linearRampToValueAtTime(lvl, at + Math.max(0.005, dur));
    }
  }

  duck(amount: number, at: number, hold: number) {
    for (const b of this.buses) {
      const p = b.gain;
      const full = this.song.gain * (this.opts.level ?? 1);
      if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(at);
      else { p.cancelScheduledValues(at); p.setValueAtTime(p.value, at); }
      p.linearRampToValueAtTime(full * amount, at + 0.12);
      p.setValueAtTime(full * amount, at + hold);
      p.linearRampToValueAtTime(full, at + hold + 1.0);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const c of this.channels) for (const n of c.nodes) n.disconnect();
    for (const b of this.buses) b.disconnect();
  }
}
