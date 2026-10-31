// PlayScene: runs one level — fixed-step simulation, rewind timeline, foresight, input, camera,
// HUD and view. Also powers attract mode and Skuld's Vision (scripted solution playback).
import { audio } from '../audio';
import type { ArtBundle } from '../art/bundle';
import type { Pipeline } from '../render/pipeline';
import { SKILLS, SKILL_INFO, TICK_RATE, type SkillId } from '../sim/constants';
import { bossPhase } from '../sim/boss';
import { ForesightJob, type Fate } from '../sim/foresight';
import type { LevelDef } from '../sim/level';
import { Sim } from '../sim/sim';
import { SolutionPlayer } from '../sim/solution';
import { isAlive } from '../sim/state';
import { Timeline } from '../sim/timeline';
import { Hud } from '../ui/hud';
import { Input } from './input';
import { SoundMapper } from './sound';
import { GameView } from './view';

export type PlayMode = 'play' | 'attract' | 'vision';

export interface PlayConfig {
  level: LevelDef;
  mode: PlayMode;
  horizonSec: number;
  foresight: boolean;
  hints: boolean;
  /** Rewind setting: false = runs while R / the button is held, true = press to start, press again to stop. */
  rewindToggle: boolean;
}

export interface PlayResult {
  saved: number;
  dead: number;
  spindle: boolean;
  bossDefeated: boolean | null;
  ticks: number;
  skillsUsed: number;
  rewinds: number;
}

export interface PlayHooks {
  finished(r: PlayResult): void;
  menu(): void;
  /** Whether a menu or card is open over the level (Esc then belongs to it). */
  dialogOpen(): boolean;
  restart(): void;
  foresightChanged(on: boolean): void;
}

const BOSS_NAMES: Record<string, string> = { wyrm: 'The Gnawing Wyrm', jotunn: 'Hrímgrímnir, Frost Jötunn', herald: "Surtr's Herald" };

export class PlayScene {
  sim: Sim;
  readonly cfg: PlayConfig;
  private p: Pipeline;
  private art: ArtBundle;
  private view: GameView;
  private timeline: Timeline;
  private hud: Hud | null = null;
  private input: Input | null = null;
  private hooks: PlayHooks;
  private sound = new SoundMapper();
  private solution: SolutionPlayer | null = null;
  state: 'intro' | 'play' | 'done' = 'intro';
  paused = false;
  speed: 1 | 2 | 4 = 1;
  armed: SkillId | null = null;
  hover: number | null = null;
  private hoverPt: { x: number; y: number; touch: boolean } | null = null;
  /** Touch: the Wyrdling a held finger pressed (preview follows it; release grants to it). */
  private heldTarget: number | null = null;
  private fate: Fate | null = null;
  private branch: Fate | null = null;
  private branchKey = '';
  private fateJob: ForesightJob | null = null;
  private branchJob: ForesightJob | null = null;
  private acc = 0;
  private rewinding = false;
  private rewindAcc = 0;
  private rewindHeld = 0;
  private rewindFx = 0;
  private rewinds = 0;
  private camX = 0;
  private camY = 0;
  private camVX = 0;
  private camVY = 0;
  private userPanned = false;
  private time = 0;
  private hintQueue: string[] = [];
  private hintCooldown = 1.5;
  private impossibleShown = false;
  private visionCaption: { text: string; t: number } | null = null;
  private dpr = 1;

  constructor(p: Pipeline, art: ArtBundle, cfg: PlayConfig, hooks: PlayHooks, uiRoot: HTMLElement | null) {
    this.p = p;
    this.art = art;
    this.cfg = cfg;
    this.hooks = hooks;
    this.sim = Sim.create(cfg.level);
    p.fitWidth = cfg.level.boss ? Math.min(cfg.level.width, 640) : 0;
    p.levelW = cfg.level.width;
    p.levelH = cfg.level.height;
    this.view = new GameView(p, art, this.sim);
    this.timeline = new Timeline();
    this.timeline.record(this.sim);
    if (cfg.mode !== 'play') {
      this.solution = new SolutionPlayer(cfg.level.solution);
      this.state = 'play';
    }
    const e = this.sim.L.entrance;
    const boss = cfg.level.boss;
    // boss arenas open framed on the guardian; everything else on the entrance
    this.camX = (boss ? boss.x : e.x) - p.viewW / 2;
    this.camY = (boss ? boss.arena.floorY - 60 : e.y + 40) - p.viewH / 2;
    this.clampCam();
    if (cfg.mode === 'play' && uiRoot) {
      this.hud = new Hud(uiRoot, art.icons, cfg.level.skills, {
        skill: (s) => this.selectSkill(s),
        disarm: () => this.disarm(),
        pause: () => this.togglePause(),
        step: (n) => this.stepTicks(n),
        speed: () => this.cycleSpeed(),
        rewind: (down) => this.rewindInput(down),
        foresight: () => this.toggleForesight(),
        restart: () => hooks.restart(),
        menu: () => hooks.menu(),
      });
      this.hintQueue = cfg.hints ? [...(cfg.level.hints ?? [])] : [];
    }
    if (cfg.mode !== 'attract') this.bindInput();
  }

  dispose(): void {
    this.view.dispose();
    this.hud?.dispose();
    this.input?.dispose();
    if (this.rewinding) audio.setRewinding(false);
  }

  /** Called by the intro card's Begin button. */
  begin(): void {
    if (this.state === 'intro') {
      this.state = 'play';
      audio.sfx('level_start');
    }
  }

  // ------------------------------------------------------------------ input

  private bindInput(): void {
    const input = new Input(this.p.canvas);
    this.input = input;
    input.h = {
      hover: (x, y, touch) => { this.hoverPt = { ...this.p.screenToWorld(x, y, this.dpr), touch }; },
      leave: () => { this.hoverPt = null; this.heldTarget = null; },
      press: (x, y, touch) => {
        this.hoverPt = { ...this.p.screenToWorld(x, y, this.dpr), touch };
        // a held finger stays on the Wyrdling it pressed, even as that Wyrdling walks out from under it
        if (touch) this.heldTarget = this.pick(this.hoverPt.x, this.hoverPt.y, true);
      },
      act: (x, y) => this.act(this.p.screenToWorld(x, y, this.dpr)),
      tap: (x, y, touch, sx, sy) => this.tap(this.p.screenToWorld(x, y, this.dpr), touch, this.p.screenToWorld(sx, sy, this.dpr)),
      pan: (dx, dy) => {
        this.heldTarget = null;
        this.camX += (dx * this.dpr) / this.p.scale;
        this.camY += (dy * this.dpr) / this.p.scale;
        this.camVX = 0; this.camVY = 0;
        this.userPanned = true;
        this.clampCam();
      },
      zoom: (dir) => {
        const cx = this.camX + this.p.viewW / 2, cy = this.camY + this.p.viewH / 2;
        this.p.zoomOffset = Math.max(-2, Math.min(3, this.p.zoomOffset + dir));
        this.resize(window.innerWidth, window.innerHeight, this.dpr);
        this.camX = cx - this.p.viewW / 2; this.camY = cy - this.p.viewH / 2;
        this.clampCam();
      },
      key: (code, down, repeat) => this.key(code, down, repeat),
      cancel: () => this.disarm(),
    };
  }

  private key(code: string, down: boolean, repeat: boolean): void {
    if (this.cfg.mode !== 'play') {
      if (down && code === 'Escape') this.hooks.menu();
      return;
    }
    // key repeat must not restart a rewind that stopped at the first tick (or flip a toggle)
    if (code === 'KeyR' || code === 'Backspace') { if (!repeat) this.rewindInput(down); return; }
    if (code === 'Blur') { this.setRewind(false); return; }
    if (!down || repeat) return;
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'].indexOf(code);
    if (idx >= 0) {
      const s = SKILLS[idx];
      if (this.cfg.level.skills[s] !== undefined) this.selectSkill(s);
      return;
    }
    switch (code) {
      case 'Period': this.stepTicks(this.input?.held.has('ShiftLeft') || this.input?.held.has('ShiftRight') ? TICK_RATE : 1); break;
      case 'Comma': this.stepTicks(this.input?.held.has('ShiftLeft') || this.input?.held.has('ShiftRight') ? -TICK_RATE : -1); break;
      case 'Space': case 'KeyP': this.togglePause(); break;
      case 'KeyF': this.cycleSpeed(); break;
      case 'KeyV': this.toggleForesight(); break;
      // Esc first puts an armed calling away; with nothing armed (or a dialog open) it is the menu key
      case 'Escape': if (this.hooks.dialogOpen() || !this.disarm()) this.hooks.menu(); break;
      case 'Equal': case 'NumpadAdd': this.input?.h.zoom?.(1); break;
      case 'Minus': case 'NumpadSubtract': this.input?.h.zoom?.(-1); break;
    }
  }

  /** Picking a calling always arms it; picking the armed one again keeps it (a double click must not
   *  silently disarm). Esc, right-click or the armed card's × put it away. */
  selectSkill(s: SkillId): void {
    this.armed = s;
    audio.sfx('select_skill');
    this.branchKey = '';
  }

  /** Put the armed calling away; false if nothing was armed. */
  disarm(): boolean {
    if (!this.armed) return false;
    this.armed = null;
    audio.sfx('ui_back');
    this.branchKey = '';
    return true;
  }

  togglePause(): void {
    if (this.state === 'intro') { this.begin(); return; }
    this.paused = !this.paused;
    audio.sfx(this.paused ? 'pause' : 'unpause');
    audio.setPaused(this.paused);
  }

  cycleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
    audio.setSpeed(this.speed);
    audio.sfx('ui_click');
  }

  toggleForesight(): void {
    this.cfg.foresight = !this.cfg.foresight;
    audio.sfx('foresight');
    this.hooks.foresightChanged(this.cfg.foresight);
  }

  /** R / the rewind button pressed (down) or released, per the hold / toggle setting. */
  rewindInput(down: boolean): void {
    if (this.cfg.rewindToggle) { if (down) this.setRewind(!this.rewinding); }
    else this.setRewind(down);
  }

  setRewind(on: boolean): void {
    if (on === this.rewinding || this.state === 'done') return;
    if (on && this.timeline.length <= 1) { audio.sfx('ui_deny'); return; }
    this.rewinding = on;
    audio.setRewinding(on);
    audio.sfx(on ? 'rewind_start' : 'rewind_end');
    if (on) { this.rewinds++; this.rewindAcc = 0; this.rewindHeld = 0; }
    else this.forgetFate();
  }

  private forgetFate(): void {
    this.fate = null; this.fateJob = null; this.branchJob = null; this.branchKey = '';
  }

  /** Paused tick-stepping (`,` `.`; Shift for a second): forward does exactly a game-loop tick, back
   *  restores the previous snapshot (the last 5 s are kept per tick), undoing any calling made on it. */
  stepTicks(n: number): void {
    if (this.cfg.mode !== 'play' || this.state !== 'play' || this.rewinding) return;
    if (!this.paused) this.togglePause();
    if (n > 0) {
      for (let i = 0; i < n && !this.sim.d.finished; i++) this.tick(true);
    } else {
      const prev = this.timeline.back(Math.max(0, this.sim.d.tick + n) + 1);
      if (!prev || prev.d.tick >= this.sim.d.tick) { audio.sfx('ui_deny'); return; }
      this.sim = prev;
    }
    this.forgetFate();
  }

  /** One simulation tick with all its side effects: scripted solution, step, timeline, effects, sound. */
  private tick(sound: boolean): void {
    if (this.solution) {
      const before = this.sim.events.length;
      const applied = this.solution.apply(this.sim);
      if (applied.length) {
        const s = applied[applied.length - 1];
        if (this.cfg.mode === 'vision') this.visionCaption = { text: `Skuld grants ${SKILL_INFO[s.skill].name.toUpperCase()}`, t: 2.2 };
        const fresh = this.sim.events.slice(before);
        this.view.handleEvents(fresh, this.sim);
        if (sound && this.cfg.mode === 'vision') this.sound.play(fresh, this.sim.d.tick, this.camX, this.p.viewW);
      }
    }
    this.sim.step();
    this.timeline.record(this.sim);
    this.view.handleEvents(this.sim.events, this.sim);
    if (sound && this.cfg.mode !== 'attract') this.sound.play(this.sim.events, this.sim.d.tick, this.camX, this.p.viewW);
  }

  private pick(wx: number, wy: number, touch: boolean): number | null {
    const r = touch ? 12 : 7;
    let best: number | null = null, bestScore = Infinity;
    for (const w of this.sim.d.wyrds) {
      if (!isAlive(w)) continue;
      // distance to the sprite's body (a vertical capsule from hood to feet), with a little slack
      // behind a walker: the click aims at where it was a moment ago
      let dx = wx - w.x;
      if (w.st === 'walk' && dx * w.dir < 0) dx = Math.sign(dx) * Math.max(0, Math.abs(dx) - 3);
      const dy = wy < w.y - 13 ? wy - (w.y - 13) : wy > w.y - 2 ? wy - (w.y - 2) : 0;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      const ok = this.armed ? this.sim.canAssign(w, this.armed) : true;
      const score = d - (ok ? 6 : 0);
      if (score < bestScore) { bestScore = score; best = w.id; }
    }
    return best;
  }

  /** Mouse press: assign straight away when it lands on a Wyrdling. */
  private act(pt: { x: number; y: number }): boolean {
    if (this.cfg.mode !== 'play' || this.state !== 'play') return false;
    const id = this.pick(pt.x, pt.y, false);
    if (id === null) return false;
    audio.unlock();
    this.grant(id);
    return true;
  }

  private tap(pt: { x: number; y: number }, touch: boolean, start?: { x: number; y: number }): void {
    if (this.cfg.mode !== 'play' || this.state === 'done') return;
    audio.unlock();
    if (this.state === 'intro') this.begin();
    const held = this.heldTarget;
    this.heldTarget = null;
    const id = held !== null && isAlive(this.sim.d.wyrds[held]) ? held
      : this.pick(pt.x, pt.y, touch) ?? (start ? this.pick(start.x, start.y, touch) : null);
    if (id === null) return;
    this.grant(id);
  }

  private grant(id: number): void {
    if (!this.armed) {
      this.hud?.hint('Choose a calling from the bar first, then tap a Wyrdling.', 3);
      audio.sfx('ui_deny');
      return;
    }
    // a calling lands on the moment on screen: stop rewinding first, or the rewind would run on and undo it
    if (this.rewinding) this.setRewind(false);
    const before = this.sim.events.length;
    if (this.sim.assign(id, this.armed)) {
      const fresh = this.sim.events.slice(before);
      this.view.handleEvents(fresh, this.sim);
      this.sound.play(fresh, this.sim.d.tick, this.camX, this.p.viewW);
      this.hud?.flashSkill(this.armed);
      this.fate = null;
      this.fateJob = null;
      this.branchKey = '';
      if (this.sim.d.skills[this.armed] <= 0) this.armed = null;
    } else {
      this.hud?.denySkill(this.armed);
      audio.sfx('assign_fail');
      const w = this.sim.d.wyrds[id];
      if (this.sim.d.skills[this.armed] <= 0) this.hud?.hint(`No ${SKILL_INFO[this.armed].name} callings left.`, 2.5);
      else if (w) this.hud?.hint(`A ${SKILL_INFO[this.armed].name} can't be granted while ${w.st === 'fall' ? 'falling' : 'busy like that'}.`, 2.5);
    }
  }

  // ------------------------------------------------------------------ camera

  resize(w: number, h: number, dpr: number): void {
    this.dpr = dpr;
    this.p.resize(w, h, dpr);
    this.clampCam();
  }

  private clampCam(): void {
    const L = this.sim.L, vw = this.p.viewW, vh = this.p.viewH;
    this.camX = vw >= L.w ? (L.w - vw) / 2 : Math.max(0, Math.min(L.w - vw, this.camX));
    this.camY = vh >= L.h ? (L.h - vh) / 2 : Math.max(0, Math.min(L.h - vh, this.camY));
  }

  private autoCamera(dt: number): void {
    // demo modes and the opening seconds follow the action
    const alive = this.sim.d.wyrds.filter(isAlive);
    if (!alive.length) return;
    let sx = 0, sy = 0;
    for (const w of alive) { sx += w.x; sy += w.y; }
    let cx = sx / alive.length, cy = sy / alive.length;
    const b = this.sim.d.boss;
    if (b && b.hp > 0) { cx = cx * 0.5 + b.x * 0.5; cy = cy * 0.8 + (b.y - 40) * 0.2; }
    const tx = cx - this.p.viewW / 2, ty = cy - this.p.viewH / 2 - 10;
    const k = 1 - Math.pow(0.03, dt);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.clampCam();
  }

  // ------------------------------------------------------------------ frame

  /** Boss music layer last sent to the audio engine (it only adds layers on bar boundaries). */
  private musicIntensity: 0 | 1 | 2 = 0;

  update(dt: number): void {
    this.time += dt;
    // the boss theme gains brass, choir and double-time drums as the guardian weakens; following the
    // live state (not hit events) keeps it right after a rewind too
    const boss = this.sim.d.boss;
    const intensity = this.cfg.mode !== 'attract' && boss && boss.hp > 0 ? bossPhase(boss) : 0;
    if (intensity !== this.musicIntensity) { this.musicIntensity = intensity; audio.setIntensity(intensity); }
    const held = this.input?.held;
    if (held && this.cfg.mode === 'play') {
      const sp = 260 * dt;
      const ax = (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0) - (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0);
      const ay = (held.has('ArrowDown') || held.has('KeyS') ? 1 : 0) - (held.has('ArrowUp') || held.has('KeyW') ? 1 : 0);
      if (ax || ay) { this.camX += ax * sp; this.camY += ay * sp; this.userPanned = true; this.clampCam(); }
    }
    const bossCam = !!this.sim.d.boss && this.sim.d.boss.hp > 0;
    if (this.cfg.mode !== 'play' || (!this.userPanned && (bossCam || this.sim.d.tick < 30 * 12) && this.state === 'play')) this.autoCamera(dt);
    this.camX += this.camVX * dt; this.camY += this.camVY * dt;

    if (this.rewinding) {
      // 4× to start, speeding up to 16× over a few seconds of holding, so the start of a long level is in reach
      this.rewindHeld += dt;
      this.rewindAcc += dt * TICK_RATE * (4 + 4 * Math.min(3, this.rewindHeld));
      const target = this.sim.d.tick - Math.floor(this.rewindAcc);
      if (target < this.sim.d.tick) {
        const prev = this.timeline.back(Math.max(0, target) + 1);
        if (!prev || prev.d.tick >= this.sim.d.tick) this.setRewind(false); // back at the start
        else { this.rewindAcc -= this.sim.d.tick - prev.d.tick; this.sim = prev; }
      }
    } else if (this.state === 'play' && !this.paused && !this.debugHold && !this.sim.d.finished) {
      this.acc += dt * TICK_RATE * (this.cfg.mode === 'attract' ? 1 : this.speed);
      let steps = 0;
      while (this.acc >= 1 && steps < 12) {
        this.acc -= 1;
        steps++;
        this.tick(true);
        if (this.sim.d.finished) break;
      }
      if (this.acc > 4) this.acc = 0;
    }
    this.rewindFx += ((this.rewinding ? 1 : 0) - this.rewindFx) * Math.min(1, dt * 10);

    // foresight
    if (this.cfg.mode === 'play' && this.cfg.foresight && !this.rewinding && this.state !== 'done') this.updateForesight();
    else { this.fate = null; this.branch = null; }

    // hover
    const heldId = this.heldTarget !== null && isAlive(this.sim.d.wyrds[this.heldTarget]) ? this.heldTarget : null;
    this.hover = heldId ?? (this.hoverPt ? this.pick(this.hoverPt.x, this.hoverPt.y, this.hoverPt.touch) : null);

    // finish
    if (this.sim.d.finished && this.state === 'play') {
      if (this.cfg.mode === 'attract') {
        this.restartAttract();
      } else {
        this.state = 'done';
        const b = this.sim.d.boss;
        this.hooks.finished({
          saved: this.sim.d.saved, dead: this.sim.d.dead, spindle: this.sim.d.spindle,
          bossDefeated: b ? b.hp <= 0 : null, ticks: this.sim.d.tick, skillsUsed: this.sim.d.used, rewinds: this.rewinds,
        });
      }
    }

    // hints
    if (this.hud) {
      this.hud.tick(dt);
      if (this.state !== 'intro' && this.hintQueue.length) {
        this.hintCooldown -= dt;
        if (this.hintCooldown <= 0) { this.hud.hint(this.hintQueue.shift()!, 6.5); this.hintCooldown = 7.5; }
      }
      const d = this.sim.d;
      const toCome = this.total - d.spawned;
      if (!this.impossibleShown && d.saved + this.sim.aliveCount + toCome < this.cfg.level.quota && this.state === 'play') {
        this.impossibleShown = true;
        this.hud.hint(`The quota is out of reach — ${this.cfg.rewindToggle ? 'tap' : 'hold'} REWIND to undo, or restart.`, 6);
      }
      if (this.impossibleShown && d.saved + this.sim.aliveCount + toCome >= this.cfg.level.quota) this.impossibleShown = false;
    }
  }

  private get total(): number {
    return this.cfg.level.wyrdlings;
  }

  private restartAttract(): void {
    this.view.dispose();
    this.sim = Sim.create(this.cfg.level);
    this.view = new GameView(this.p, this.art, this.sim);
    this.solution = new SolutionPlayer(this.cfg.level.solution);
    this.timeline.clear();
  }

  private updateForesight(): void {
    const horizon = Math.round(this.cfg.horizonSec * TICK_RATE);
    const sim = this.sim;
    // paused: plenty of frame time; running: a few ms per frame, never a hitch
    const budget = this.debugFullForesight ? Infinity : this.paused || this.state === 'intro' ? 12 : 4;
    const stale = !this.fate || sim.d.tick - this.fate.from >= 6 || sim.d.tick < this.fate.from;
    if (stale && !this.fateJob) this.fateJob = new ForesightJob(sim, horizon);
    if (this.fateJob && this.fateJob.advance(budget)) {
      this.fate = this.fateJob.fate;
      this.fateJob = null;
      this.branchKey = '';
    }
    if (!this.fate && !this.fateJob) this.fateJob = new ForesightJob(sim, horizon);
    const target = this.hover;
    if (this.armed && target !== null) {
      const w = sim.d.wyrds[target];
      const key = `${this.armed}:${target}:${this.fate?.from ?? -1}`;
      if (key !== this.branchKey) {
        this.branchKey = key;
        this.branchJob = w && sim.canAssign(w, this.armed) ? new ForesightJob(sim, horizon, { id: target, skill: this.armed }) : null;
        if (!this.branchJob) this.branch = null;
      }
      if (this.branchJob && this.branchJob.advance(budget)) {
        this.branch = this.branchJob.fate;
        this.branchJob = null;
      }
    } else {
      this.branch = null;
      this.branchJob = null;
      this.branchKey = '';
    }
  }

  /** Results screen → back into the level just before it ended, paused, so the player can keep rewinding.
   *  Stars already earned stay earned (the save merges outcomes). */
  reopen(): boolean {
    if (this.state !== 'done') return false;
    const prev = this.timeline.back(this.sim.d.tick);
    if (!prev) return false;
    this.sim = prev;
    this.state = 'play';
    this.rewinds++;
    if (!this.paused) this.togglePause();
    this.forgetFate();
    return true;
  }

  /** Dev tooling (scripts/frames.mjs): advance exactly n ticks with the same per-tick work as update(). */
  debugAdvance(n: number): void {
    for (let i = 0; i < n && !this.sim.d.finished; i++) this.tick(false);
  }

  /** Dev tooling: pin the camera (world px, top-left) or release it with null. */
  debugCam: { x: number; y: number } | null = null;
  /** Dev tooling: stop real-time ticking without the pause dimming. */
  debugHold = false;
  /** Dev tooling: finish Foresight jobs every frame, so captured frames don't depend on machine speed. */
  debugFullForesight = false;

  render(): void {
    if (this.debugCam) { this.camX = this.debugCam.x; this.camY = this.debugCam.y; this.clampCam(); }
    const shake = this.view.shake;
    const sx = shake ? Math.round((Math.random() - 0.5) * shake) : 0;
    const sy = shake ? Math.round((Math.random() - 0.5) * shake) : 0;
    // screen shake must not reveal anything past the level edges either
    const L = this.sim.L;
    const cx = Math.max(0, Math.min(Math.max(0, L.w - this.p.viewW), this.camX + sx));
    const cy = Math.max(0, Math.min(Math.max(0, L.h - this.p.viewH), this.camY + sy));
    this.p.setCamera(cx, cy);
    this.view.draw({
      sim: this.sim, time: this.time, dt: 1, hover: this.hover, armed: this.armed,
      canAssign: this.hover !== null && this.armed !== null && this.sim.canAssign(this.sim.d.wyrds[this.hover], this.armed),
      fate: this.fate, branch: this.branch, showForesight: this.cfg.foresight && this.cfg.mode === 'play', rewinding: this.rewinding,
    });
    this.p.post.rewind = this.rewindFx;
    this.p.post.pause = this.paused || this.state === 'intro' ? 1 : 0;
    this.p.post.flash = this.view.flash;
    if (this.hud) {
      const d = this.sim.d;
      const b = d.boss;
      this.hud.update({
        name: this.cfg.level.name, out: this.sim.aliveCount, toCome: this.total - d.spawned, saved: d.saved,
        quota: this.cfg.level.quota, target: this.cfg.level.target, total: this.total,
        spindle: this.sim.L.spindle ? d.spindle : null, skills: d.skills, armed: this.armed, paused: this.paused,
        speed: this.speed, foresight: this.cfg.foresight, rewinding: this.rewinding, rewindToggle: this.cfg.rewindToggle,
        rewindSec: Math.max(0, (d.tick - this.timeline.oldestTick) / TICK_RATE),
        boss: b ? { hp: Math.max(0, b.hp), max: b.maxHp, name: BOSS_NAMES[b.kind] ?? b.kind } : null,
        doomed: this.fate?.dead ?? 0, horizon: this.cfg.horizonSec,
      });
    }
  }

  get caption(): string | null {
    if (!this.visionCaption) return null;
    return this.visionCaption.text;
  }

  tickCaption(dt: number): void {
    if (this.visionCaption) {
      this.visionCaption.t -= dt;
      if (this.visionCaption.t <= 0) this.visionCaption = null;
    }
  }
}
