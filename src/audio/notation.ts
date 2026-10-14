// Song notation → compiled event lists.
//
// A song is a set of tracks and named sections arranged into a form. Each section gives every
// track a pattern string. Pattern grammar (whitespace separated tokens):
//
//   D4  F#5  Bb3          note (C4 = middle C). Durations are sticky (LilyPond-style).
//   D4:8  A4:4.  E5:8t    with duration: 1 2 4 8 16 32, '.' dotted, 't' triplet, '2+8' sums
//   r  r:2                rest
//   [D4 F4 A4]:2          simultaneous notes
//   modifiers (suffix):   ! accent   ? soft   ' staccato   _ legato   ~ tie into next same note
//   pp p mp mf f ff       dynamics (sticky velocity)
//   :8                    set default duration without playing
//   ( ... )x4             repeat a group
//   |                     bar line (validated: must fall exactly on a bar boundary)
//
// Chord tracks (track.chord = 'close' | 'spread' | 'root') read the section's `chords` line
// (e.g. 'Dm:2 G:2 | C/E:1') and use chord-tone indexes instead of note names:
//   0 1 2 ...  -1  chord tones of the current chord in the track's voicing (wrapping by octave)
//   x               the full voicing (pad)
// Chord-track notes are split at chord changes so pads follow the harmony automatically.
// 'close' voicings are voice-led (minimal movement); 'spread' is an open harp voicing
// (R 5 8 10 12 ..., bass note within a fifth either side of `lo`); 'root' is root position
// from the bass (slash) note, lowest at or above `lo`.
//
// Drum tracks (track.drums) take a grid: { step: 16, fd: 'x...x...', sh: '.x.x' } with
// x normal, X accent, o ghost, 1-9 explicit velocity, '.'/'-' rest. Lines shorter than the
// section repeat cyclically (their length must divide it).

import { DRUM_IDS, INSTRUMENTS, type DrumId, type InstId } from './instruments';
import { mulberry32 } from './dsp';

export interface DrumGrid { step: number; [drum: string]: string | number }

export interface TrackDef {
  inst?: InstId;
  vol?: number;
  pan?: number;
  rev?: number;
  dly?: number;
  oct?: number;
  tr?: number;
  chord?: 'close' | 'spread' | 'root';
  lo?: string;
  gate?: number;
  /** [min, max] intensity at which this track plays (boss layers) */
  layers?: [number, number];
  /** humanise timing in seconds (default 0.004) */
  hum?: number;
  drums?: boolean;
}

export interface SectionDef {
  bars: number;
  chords?: string;
  [track: string]: string | number | DrumGrid | undefined;
}

export interface SongDef {
  bpm: number;
  meter: number; // quarter-note beats per bar
  swing?: number; // 0..0.33 delay of off-beat 8ths, in fractions of an 8th... (0.33 ≈ triplet)
  delayBeats?: number;
  delayFb?: number;
  gain?: number;
  tracks: Record<string, TrackDef>;
  sections: Record<string, SectionDef>;
  form: string[];
  /** form index to loop back to; -1 = play once (stingers) */
  loop: number;
}

export interface NoteEvent { t: number; len: number; midi: number; vel: number; track: number; inst: InstId }

export interface CompiledTrack {
  name: string; inst: InstId; vol: number; pan: number; rev: number; dly: number;
  minI: number; maxI: number;
}

export interface CompiledSection { name: string; beats: number; events: NoteEvent[]; pre: NoteEvent[] }

export interface CompiledSong {
  id: string;
  bpm: number;
  meter: number;
  gain: number;
  delayBeats: number;
  delayFb: number;
  tracks: CompiledTrack[];
  form: CompiledSection[];
  formStarts: number[];
  totalBeats: number;
  loopIndex: number;
  loopBeat: number;
  instruments: InstId[];
}

// ---------------------------------------------------------------------------------------------

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_RE = /^([A-G])(#|b)?(-?\d)$/;
const DYN: Record<string, number> = { ppp: 0.22, pp: 0.32, p: 0.45, mp: 0.58, mf: 0.7, f: 0.82, ff: 0.92, fff: 1 };

export function noteToMidi(s: string): number {
  const m = NOTE_RE.exec(s);
  if (!m) throw new Error(`bad note '${s}'`);
  return 12 * (parseInt(m[3], 10) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function midiToNote(m: number): string {
  return SHARPS[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

/** Transpose every note name in a melodic pattern by `semis`. */
export function transpose(pattern: string, semis: number): string {
  return pattern.replace(/(^|[\s[(])([A-G](?:#|b)?-?\d)(?=[:!?'_~\s\],)]|$)/g, (_m, pre: string, n: string) => pre + midiToNote(noteToMidi(n) + semis));
}

export function parseDur(s: string): number {
  let total = 0;
  for (const p of s.split('+')) {
    const m = /^(\d+)(\.|t)?$/.exec(p);
    if (!m) throw new Error(`bad duration '${s}'`);
    let v = 4 / parseInt(m[1], 10);
    if (m[2] === '.') v *= 1.5;
    else if (m[2] === 't') v *= 2 / 3;
    total += v;
  }
  return total;
}

interface Chord { root: number; pcs: number[]; bass: number }
interface ChordSpan { t: number; len: number; chord: Chord | null }

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '5': [0, 7], sus2: [0, 2, 7], sus4: [0, 5, 7], '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], add9: [0, 4, 7, 2], madd9: [0, 3, 7, 2], m9: [0, 3, 7, 10, 2],
  dim: [0, 3, 6], aug: [0, 4, 8], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '7sus4': [0, 5, 7, 10],
  maj9: [0, 4, 7, 11, 2], mb6: [0, 3, 8], '7b9': [0, 4, 7, 10, 1],
};

function parseChord(sym: string): Chord | null {
  if (sym === 'N' || sym === '-') return null;
  const m = /^([A-G])(#|b)?([a-z0-9]*)(?:\/([A-G])(#|b)?)?$/.exec(sym);
  if (!m) throw new Error(`bad chord '${sym}'`);
  const root = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const q = QUALITIES[m[3]];
  if (!q) throw new Error(`unknown chord quality '${m[3]}' in '${sym}'`);
  const pcs = Array.from(new Set(q.map((i) => (root + i) % 12)));
  const bass = m[4] ? (PC[m[4]] + (m[5] === '#' ? 1 : m[5] === 'b' ? -1 : 0) + 12) % 12 : root;
  return { root, pcs, bass };
}

// ---------------------------------------------------------------------------------------------
// tokenizer

function tokenize(src: string): string[] {
  const s = src
    .replace(/\[([^\]]*)\]/g, (_m, inner: string) => '[' + inner.trim().split(/\s+/).join(',') + ']')
    .replace(/\(/g, ' ( ')
    .replace(/\)\s*x\s*(\d+)/g, ' )x$1 ')
    .replace(/\|/g, ' | ');
  return s.split(/\s+/).filter(Boolean);
}

function expandGroups(tokens: string[], ctx: string): string[] {
  const out: string[] = [];
  let i = 0;
  const walk = (dst: string[]): void => {
    while (i < tokens.length) {
      const t = tokens[i++];
      if (t === '(') {
        const inner: string[] = [];
        walk(inner);
        const end = tokens[i - 1];
        const m = /^\)x(\d+)$/.exec(end ?? '');
        if (!m) throw new Error(`${ctx}: unclosed group`);
        for (let k = 0; k < parseInt(m[1], 10); k++) dst.push(...inner);
      } else if (/^\)x\d+$/.test(t)) {
        return;
      } else dst.push(t);
    }
  };
  walk(out);
  return out;
}

interface RawNote { t: number; len: number; heads: string[]; vel: number; gate: number; tie: boolean }

const TOKEN_RE = /^(.+?)(?::([\d.t+]+))?([!?'_~]*)$/;

function parsePattern(src: string, meter: number, defGate: number, ctx: string): { notes: RawNote[]; length: number } {
  const tokens = expandGroups(tokenize(src), ctx);
  let t = 0;
  let dur = 1;
  let vel = DYN.mf;
  const notes: RawNote[] = [];
  for (const tok of tokens) {
    if (tok === '|') {
      const bars = t / meter;
      if (Math.abs(bars - Math.round(bars)) > 1e-6) throw new Error(`${ctx}: bar line at beat ${t.toFixed(3)} is not on a bar boundary (bar ${bars.toFixed(3)})`);
      continue;
    }
    if (DYN[tok] !== undefined) { vel = DYN[tok]; continue; }
    if (tok.startsWith(':')) { dur = parseDur(tok.slice(1)); continue; }
    const m = TOKEN_RE.exec(tok);
    if (!m) throw new Error(`${ctx}: bad token '${tok}'`);
    const [, head, d, mods] = m;
    if (d) dur = parseDur(d);
    if (head === 'r') { t += dur; continue; }
    const heads = head.startsWith('[') ? head.slice(1, -1).split(',').filter(Boolean) : [head];
    let v = vel;
    if (mods.includes('!')) v = Math.min(1, v * 1.22);
    if (mods.includes('?')) v *= 0.6;
    const gate = mods.includes("'") ? 0.45 : mods.includes('_') ? 1.0 : defGate;
    notes.push({ t, len: dur, heads, vel: v, gate, tie: mods.includes('~') });
    t += dur;
  }
  return { notes, length: t };
}

function parseChordLine(src: string, meter: number, ctx: string): { spans: ChordSpan[]; length: number } {
  const tokens = tokenize(src);
  let t = 0;
  let dur = meter;
  const spans: ChordSpan[] = [];
  for (const tok of tokens) {
    if (tok === '|') {
      const bars = t / meter;
      if (Math.abs(bars - Math.round(bars)) > 1e-6) throw new Error(`${ctx}: chord bar line at beat ${t} not on bar boundary`);
      continue;
    }
    const m = /^([^:]+)(?::([\d.t+]+))?$/.exec(tok);
    if (!m) throw new Error(`${ctx}: bad chord token '${tok}'`);
    if (m[2]) dur = parseDur(m[2]);
    spans.push({ t, len: dur, chord: parseChord(m[1]) });
    t += dur;
  }
  return { spans, length: t };
}

// ---------------------------------------------------------------------------------------------
// voicing

function nextWithPc(from: number, pcs: number[]): number {
  for (let m = from; m < from + 12; m++) if (pcs.includes(((m % 12) + 12) % 12)) return m;
  return from;
}

function lowestWithPc(lo: number, pc: number): number {
  return lo + ((pc - lo) % 12 + 12) % 12;
}

function rootVoicing(ch: Chord, lo: number): number[] {
  const base = lowestWithPc(lo, ch.bass);
  const tones = ch.pcs.map((pc) => base + ((pc - ch.bass + 12) % 12));
  if (!ch.pcs.includes(ch.bass)) tones.push(base);
  return Array.from(new Set(tones)).sort((a, b) => a - b);
}

function spreadVoicing(ch: Chord, lo: number): number[] {
  // centred on `lo` (within -5..+6 semitones) so arpeggios keep a steady hand position
  const base = lowestWithPc(lo - 5, ch.bass);
  const out = [base, nextWithPc(base + 6, ch.pcs)];
  let m = base + 12;
  while (out.length < 14) {
    m = nextWithPc(m, ch.pcs);
    if (m > out[out.length - 1]) out.push(m);
    m++;
  }
  return out;
}

function closeVoicing(ch: Chord, lo: number, prev: number[] | null): number[] {
  const cands: number[][] = [];
  const pcs = ch.pcs;
  for (let k = 0; k < pcs.length; k++) {
    for (const shift of [0, 12]) {
      const start = lowestWithPc(lo, pcs[k]) + shift;
      const v = [start];
      let m = start + 1;
      while (v.length < pcs.length) { m = nextWithPc(m, pcs); v.push(m); m++; }
      if (v[v.length - 1] <= lo + 19) cands.push(v);
    }
  }
  if (!cands.length) cands.push(rootVoicing(ch, lo));
  let best = cands[0];
  let bestCost = Infinity;
  for (const c of cands) {
    let cost: number;
    if (prev) {
      cost = 0;
      for (const n of c) { let d = Infinity; for (const p of prev) d = Math.min(d, Math.abs(n - p)); cost += d; }
      for (const p of prev) { let d = Infinity; for (const n of c) d = Math.min(d, Math.abs(n - p)); cost += d * 0.5; }
    } else {
      const mean = c.reduce((a, b) => a + b, 0) / c.length;
      cost = Math.abs(mean - (lo + 7));
    }
    if (cost < bestCost) { bestCost = cost; best = c; }
  }
  return best;
}

function pickTone(voicing: number[], idx: number): number {
  const n = voicing.length;
  const oct = Math.floor(idx / n);
  const i = ((idx % n) + n) % n;
  return voicing[i] + 12 * oct;
}

// ---------------------------------------------------------------------------------------------
// compile

export function compileSong(id: string, def: SongDef): CompiledSong {
  const meter = def.meter;
  const bps = def.bpm / 60;
  const trackNames = Object.keys(def.tracks);
  const tracks: CompiledTrack[] = trackNames.map((name) => {
    const td = def.tracks[name];
    return {
      name,
      inst: td.inst ?? 'fd',
      vol: td.vol ?? 0.5,
      pan: td.pan ?? 0,
      rev: td.rev ?? 0.2,
      dly: td.dly ?? 0,
      minI: td.layers ? td.layers[0] : 0,
      maxI: td.layers ? td.layers[1] : 2,
    };
  });
  const voiceState = new Map<string, number[] | null>();
  const compiled = new Map<string, CompiledSection>();
  const instSet = new Set<InstId>();
  const order = [...def.form, ...Object.keys(def.sections)];

  for (const secName of order) {
    if (compiled.has(secName)) continue;
    const sec = def.sections[secName];
    if (!sec) throw new Error(`${id}: form references unknown section '${secName}'`);
    const beats = sec.bars * meter;
    const events: NoteEvent[] = [];
    let chordSpans: ChordSpan[] = [];
    if (sec.chords) {
      const cl = parseChordLine(sec.chords, meter, `${id}.${secName}.chords`);
      if (beats % cl.length > 1e-6 && Math.abs((beats / cl.length) - Math.round(beats / cl.length)) > 1e-6) {
        throw new Error(`${id}.${secName}: chord line length ${cl.length} beats does not divide section length ${beats}`);
      }
      const reps = Math.round(beats / cl.length);
      for (let r = 0; r < reps; r++) for (const s of cl.spans) chordSpans.push({ ...s, t: s.t + r * cl.length });
    }
    const chordAt = (t: number): ChordSpan | undefined => chordSpans.find((s) => t >= s.t - 1e-9 && t < s.t + s.len - 1e-9);

    for (let ti = 0; ti < trackNames.length; ti++) {
      const name = trackNames[ti];
      const td = def.tracks[name];
      const part = sec[name];
      if (part === undefined || name === 'bars' || name === 'chords') continue;
      const ctx = `${id}.${secName}.${name}`;
      const rand = mulberry32(hash(ctx));
      const humBeats = (td.hum ?? 0.004) * bps;
      const transposeBy = (td.oct ?? 0) * 12 + (td.tr ?? 0);
      const push = (ev: NoteEvent) => {
        // metric accent + humanise
        const pos = ev.t % meter;
        const acc = Math.abs(pos) < 1e-6 ? 1 : Math.abs(pos - Math.round(pos)) < 1e-6 ? 0.93 : 0.87;
        ev.vel = Math.min(1, ev.vel * acc * (0.95 + rand() * 0.1));
        if (humBeats > 0 && ev.t > 0) ev.t = Math.max(0, ev.t + (rand() * 2 - 1) * humBeats);
        events.push(ev);
        instSet.add(ev.inst);
      };

      if (td.drums) {
        if (typeof part === 'string') {
          // token form: heads are drum names
          const { notes, length } = parsePattern(part, meter, 1, ctx);
          for (const n of cycle(notes, length, beats, ctx)) for (const h of n.heads) {
            if (!(DRUM_IDS as readonly string[]).includes(h)) throw new Error(`${ctx}: unknown drum '${h}'`);
            push({ t: n.t, len: n.len, midi: 60, vel: n.vel, track: ti, inst: h as DrumId });
          }
        } else if (typeof part === 'object') {
          const grid = part as DrumGrid;
          const stepBeats = 4 / grid.step;
          for (const key of Object.keys(grid)) {
            if (key === 'step') continue;
            if (!(DRUM_IDS as readonly string[]).includes(key)) throw new Error(`${ctx}: unknown drum '${key}'`);
            const line = String(grid[key]).replace(/[\s|]/g, '');
            const total = Math.round(beats / stepBeats);
            if (total % line.length !== 0) throw new Error(`${ctx}.${key}: grid length ${line.length} does not divide ${total} steps`);
            for (let s = 0; s < total; s++) {
              const c = line[s % line.length];
              let v = 0;
              if (c === 'x') v = 0.75; else if (c === 'X') v = 1; else if (c === 'o') v = 0.42;
              else if (c >= '1' && c <= '9') v = (c.charCodeAt(0) - 48) / 9;
              else if (c !== '.' && c !== '-') throw new Error(`${ctx}.${key}: bad grid char '${c}'`);
              if (v > 0) push({ t: s * stepBeats, len: stepBeats, midi: 60, vel: v, track: ti, inst: key as DrumId });
            }
          }
        }
        continue;
      }

      if (typeof part !== 'string') throw new Error(`${ctx}: expected pattern string`);
      const inst = td.inst;
      if (!inst) throw new Error(`${ctx}: track has no instrument`);
      const { notes, length } = parsePattern(part, meter, td.gate ?? 0.9, ctx);
      const all = cycle(notes, length, beats, ctx);

      if (td.chord) {
        if (!chordSpans.length) throw new Error(`${ctx}: chord track in section without chords`);
        const lo = noteToMidi(td.lo ?? 'C3');
        const key = name;
        for (const n of all) {
          // split at chord changes
          let t = n.t;
          const end = n.t + n.len;
          while (t < end - 1e-9) {
            const span = chordAt(t);
            if (!span) break;
            const segEnd = Math.min(end, span.t + span.len);
            if (span.chord) {
              let voicing: number[];
              if (td.chord === 'root') voicing = rootVoicing(span.chord, lo);
              else if (td.chord === 'spread') voicing = spreadVoicing(span.chord, lo);
              else {
                const prev = voiceState.get(key) ?? null;
                const cacheKey = `${key}@${secName}@${span.t}`;
                const cached = voiceState.get(cacheKey);
                voicing = cached ?? closeVoicing(span.chord, lo, prev);
                if (!cached) { voiceState.set(cacheKey, voicing); voiceState.set(key, voicing); }
              }
              const segLen = segEnd - t;
              const lenBeats = segEnd >= end - 1e-9 ? segLen * n.gate : segLen;
              for (const h of n.heads) {
                const midis = h === 'x' ? voicing : [pickTone(voicing, parseInt(h, 10))];
                if (h !== 'x' && !/^-?\d+$/.test(h)) throw new Error(`${ctx}: bad chord-tone token '${h}'`);
                for (const md of midis) push({ t, len: Math.max(0.05, lenBeats), midi: md + transposeBy, vel: n.vel * (h === 'x' ? 0.8 : 1), track: ti, inst });
              }
            }
            t = segEnd;
          }
        }
        continue;
      }

      // melodic
      let tieFrom: NoteEvent[] | null = null;
      for (const n of all) {
        const midis = n.heads.map((h) => noteToMidi(h) + transposeBy);
        if (tieFrom && tieFrom.length === midis.length && tieFrom.every((e, i) => e.midi === midis[i])) {
          for (const e of tieFrom) e.len = n.t + n.len * n.gate - e.t;
          tieFrom = n.tie ? tieFrom : null;
          continue;
        }
        const evs = midis.map((md) => ({ t: n.t, len: n.len * (n.tie ? 1 : n.gate), midi: md, vel: n.vel, track: ti, inst }));
        for (const e of evs) push(e);
        tieFrom = n.tie ? evs : null;
      }
    }

    // swing: delay off-beat 8ths
    if (def.swing) {
      for (const e of events) {
        const frac = e.t % 1;
        if (Math.abs(frac - 0.5) < 0.03) e.t += def.swing * 0.5;
      }
    }
    events.sort((a, b) => a.t - b.t);
    const pre = events.filter((e) => INSTRUMENTS[e.inst].pre);
    const main = events.filter((e) => !INSTRUMENTS[e.inst].pre);
    compiled.set(secName, { name: secName, beats, events: main, pre });
  }

  const form = def.form.map((n) => compiled.get(n)!);
  const formStarts: number[] = [];
  let acc = 0;
  for (const s of form) { formStarts.push(acc); acc += s.beats; }
  return {
    id,
    bpm: def.bpm,
    meter,
    gain: def.gain ?? 1,
    delayBeats: def.delayBeats ?? 0.75,
    delayFb: def.delayFb ?? 0.3,
    tracks,
    form,
    formStarts,
    totalBeats: acc,
    loopIndex: def.loop,
    loopBeat: def.loop >= 0 ? formStarts[def.loop] : -1,
    instruments: Array.from(instSet),
  };
}

function cycle(notes: RawNote[], length: number, beats: number, ctx: string): RawNote[] {
  if (length <= 0) return [];
  if (Math.abs(length - beats) < 1e-6) return notes;
  const reps = beats / length;
  if (Math.abs(reps - Math.round(reps)) > 1e-6 || reps < 1) {
    throw new Error(`${ctx}: pattern length ${length} beats does not fit section of ${beats} beats`);
  }
  const out: RawNote[] = [];
  for (let r = 0; r < Math.round(reps); r++) for (const n of notes) out.push({ ...n, t: n.t + r * length });
  return out;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Iterate events whose absolute beat lies in [b0, b1), following form + loop. */
export function forEachEvent(song: CompiledSong, b0: number, b1: number, pre: boolean, cb: (ev: NoteEvent, absBeat: number) => void): void {
  if (b1 <= 0) return;
  b0 = Math.max(0, b0);
  const total = song.totalBeats;
  const loops = song.loopIndex >= 0;
  const period = loops ? total - song.loopBeat : 0;
  // locate the occurrence containing b0
  let fi: number;
  let offset: number; // absolute beat of formStarts[0] for the current pass
  if (b0 < total || !loops) {
    if (b0 >= total) return;
    offset = 0;
    fi = 0;
    while (fi + 1 < song.form.length && song.formStarts[fi + 1] <= b0) fi++;
  } else {
    const cyc = Math.floor((b0 - total) / period);
    offset = total + cyc * period - song.loopBeat;
    const local = b0 - offset;
    fi = song.loopIndex;
    while (fi + 1 < song.form.length && song.formStarts[fi + 1] <= local) fi++;
  }
  for (let guard = 0; guard < 10000; guard++) {
    const sec = song.form[fi];
    const absStart = offset + song.formStarts[fi];
    if (absStart >= b1) return;
    const lo = b0 - absStart;
    const hi = b1 - absStart;
    const list = pre ? sec.pre : sec.events;
    // binary search first event with t >= lo
    let a = 0, b = list.length;
    while (a < b) { const mid = (a + b) >> 1; if (list[mid].t < lo) a = mid + 1; else b = mid; }
    for (let i = a; i < list.length && list[i].t < hi; i++) cb(list[i], absStart + list[i].t);
    fi++;
    if (fi >= song.form.length) {
      if (!loops) return;
      offset += period;
      fi = song.loopIndex;
    }
  }
}
