// Bus graph. Built identically in the live AudioContext and in OfflineAudioContexts (tooling).
//
//  song players ─dry─▶ musicIn ─┐
//               ─rev─▶ reverb ──┼─▶ chain ─▶ hp(speed) ─▶ lp(pause/rewind) ─▶ pauseGain ─▶ musicVol ─┐
//               ─dly─▶ delay ───┘                                                                     │
//  stinger players ─dry─▶ jingleIn ──────────────────────────────────────────────────▶ musicVol      ├─▶ master ─▶ limiter ─▶ clip ─▶ out
//  sfx voices ─▶ sfxIn ─▶ sfxVol ────────────────────────────────────────────────────────────────────┤
//             ─▶ sfxVerb ─▶ sfxVol                                                                  │
//  barks ─▶ voiceIn ─▶ voiceVol ─────────────────────────────────────────────────────────────────────┘
//  bend: ConstantSource (+ wobble LFO) connected into every music note's detune (rewind tape bend)

/** Default live levels (the engine starts here; offline renders use the same). */
export const DEFAULT_VOLS = { master: 0.9, music: 0.8, sfx: 1, voice: 1 };
export const MUSIC_TRIM = 0.85;

export interface Mixer {
  ctx: BaseAudioContext;
  musicIn: GainNode;
  reverbIn: GainNode;
  delayIn: GainNode;
  delay: DelayNode;
  delayFb: GainNode;
  jingleIn: GainNode;
  sfxIn: GainNode;
  sfxRevIn: GainNode;
  hp: BiquadFilterNode;
  lp: BiquadFilterNode;
  pauseGain: GainNode;
  musicVol: GainNode;
  sfxVol: GainNode;
  voiceIn: GainNode;
  voiceVol: GainNode;
  master: GainNode;
  bend: ConstantSourceNode;
  wobble: OscillatorNode;
  wobbleGain: GainNode;
  limiter: DynamicsCompressorNode;
}

function makeIR(ctx: BaseAudioContext, dur: number, t60: number, seed: number, bright = 1): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(dur * sr);
  const buf = ctx.createBuffer(2, n, sr);
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2147483648 - 1; };
  const pre = Math.floor(0.018 * sr);
  const taps = [0.011, 0.019, 0.027, 0.041, 0.053, 0.067];
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lpState = 0;
    let energy = 0;
    const decay = Math.exp(-6.9 / (t60 * sr));
    let env = 1;
    let lk = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      if (((i - pre) & 63) === 0) {
        // progressively darker tail (air absorption)
        const fc = (1800 + 8500 * Math.exp(-t / 0.5)) * bright;
        lk = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      }
      lpState += (rnd() - lpState) * lk;
      d[i] = lpState * env * (t < 0.03 ? Math.min(1, t / 0.03 + 0.15) : 1);
      env *= decay;
    }
    for (let j = 0; j < taps.length; j++) {
      const idx = Math.floor((taps[j] + (c ? 0.0031 * (j + 1) : 0)) * sr);
      if (idx < n) d[idx] += (0.5 - j * 0.06) * (j % 2 ? -1 : 1);
    }
    for (let i = 0; i < n; i++) energy += d[i] * d[i];
    const k = 1 / Math.sqrt(energy || 1);
    for (let i = 0; i < n; i++) d[i] *= k;
    // fade tail
    const nf = Math.floor(0.05 * sr);
    for (let i = 0; i < nf; i++) d[n - 1 - i] *= i / nf;
  }
  return buf;
}

function clipCurve(): Float32Array<ArrayBuffer> {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    // transparent below 0.8, soft knee into 0.98
    const y = a < 0.8 ? a : 0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

export function buildMixer(ctx: BaseAudioContext, opts: { safetyClip?: boolean } = {}): Mixer {
  const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const musicIn = g(1);
  const reverbIn = g(1);
  const delayIn = g(1);
  const jingleIn = g(1);
  const sfxIn = g(1);
  const sfxRevIn = g(1);
  const chain = g(1);

  const verb = ctx.createConvolver();
  verb.normalize = false;
  verb.buffer = makeIR(ctx, 3.2, 2.7, 1234);
  const verbOut = g(0.55);
  reverbIn.connect(verb).connect(verbOut).connect(chain);

  const delay = ctx.createDelay(3);
  delay.delayTime.value = 0.4;
  const fbLp = ctx.createBiquadFilter(); fbLp.type = 'lowpass'; fbLp.frequency.value = 2600;
  const fbHp = ctx.createBiquadFilter(); fbHp.type = 'highpass'; fbHp.frequency.value = 280;
  const fb = g(0.3);
  const delayOut = g(0.5);
  delayIn.connect(delay);
  delay.connect(fbLp).connect(fbHp).connect(fb).connect(delay);
  fbHp.connect(delayOut);
  delayOut.connect(chain);
  delayOut.connect(reverbIn);

  musicIn.connect(chain);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 10; hp.Q.value = 0.5;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.9;
  const pauseGain = g(1);
  const musicVol = g(DEFAULT_VOLS.music * MUSIC_TRIM);
  chain.connect(hp).connect(lp).connect(pauseGain).connect(musicVol);
  jingleIn.connect(musicVol);

  const sfxVerb = ctx.createConvolver();
  sfxVerb.normalize = false;
  sfxVerb.buffer = makeIR(ctx, 1.6, 1.1, 777, 1.1);
  const sfxVerbOut = g(0.5);
  const sfxVol = g(DEFAULT_VOLS.sfx);
  sfxIn.connect(sfxVol);
  sfxRevIn.connect(sfxVerb).connect(sfxVerbOut).connect(sfxVol);

  const master = g(DEFAULT_VOLS.master);
  musicVol.connect(master);
  sfxVol.connect(master);
  const voiceIn = g(1);
  const voiceVol = g(DEFAULT_VOLS.voice);
  voiceIn.connect(voiceVol).connect(master);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 3;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.18;
  master.connect(limiter);
  if (opts.safetyClip !== false) {
    const clip = ctx.createWaveShaper();
    clip.curve = clipCurve();
    limiter.connect(clip).connect(ctx.destination);
  } else {
    limiter.connect(ctx.destination);
  }

  const bend = ctx.createConstantSource();
  bend.offset.value = 0;
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 3.2;
  const wobbleGain = g(0);
  wobble.connect(wobbleGain).connect(bend.offset);
  bend.start();
  wobble.start();

  return { ctx, musicIn, reverbIn, delayIn, delay, delayFb: fb, jingleIn, sfxIn, sfxRevIn, hp, lp, pauseGain, musicVol, sfxVol, voiceIn, voiceVol, master, bend, wobble, wobbleGain, limiter };
}

export function setDelayForSong(m: Mixer, seconds: number, feedback: number, at: number) {
  m.delay.delayTime.setTargetAtTime(Math.min(2.5, seconds), at, 0.05);
  m.delayFb.gain.setTargetAtTime(feedback, at, 0.05);
}
