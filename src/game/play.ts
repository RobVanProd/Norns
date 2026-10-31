// PlayScene: runs one level — fixed-step simulation, rewind timeline, foresight, input, camera,
// HUD and view. Also powers attract mode and Skuld's Vision (scripted solution playback, or the
// player's own best Weave). In play mode it records the attempt as a Weave, watches for a proven
// stalemate, and while paused weighs the hovered calling's verdict.
import { audio } from '../audio';
import type { ArtBundle } from '../art/bundle';
import type { Pipeline } from '../render/pipeline';
import { SKILLS, SKILL_INFO, TICK_RATE, type SkillId } from '../sim/constants';
import { bossPhase } from '../sim/boss';
import { ForesightJob, VerdictJob, type Calling, type Fate, type Verdict } from '../sim/foresight';
import type { LevelDef } from '../sim/level';
import { LoopDetector, type LoopProof } from '../sim/settle';
import { Sim } from '../sim/sim';
import { SolutionPlayer } from '../sim/solution';
import { isAlive } from '../sim/state';
import { Timeline } from '../sim/timeline';
import { Replayer, WeaveRecorder, type Weave } from '../sim/weave';
import { Hud, type VerdictView } from '../ui/hud';
import { Input } from './input';
import { SoundMapper } from './sound';
import { AttemptLog } from './stats';
import { GameView } from './view';

export type PlayMode = 'play' | 'attract' | 'vision';

/** Plays callings into the run before each step: Skuld's scripted solution, or a recorded Weave. */
interface Script {
  apply(sim: Sim): ({ skill: SkillId; nth: number } | { skill: SkillId; id: number })[];
}

export interface PlayConfig {
  level: LevelDef;
  mode: PlayMode;
  horizonSec: number;
  foresight: boolean;
  hints: boolean;
  /** Rewind setting: false = runs while R / the button is held, true = press to start, press again to stop. */
  rewindToggle: boolean;
  /** Assist: while paused, say what the hovered calling comes to if nothing more is done. */
  verdict: boolean;
  /** Vision mode: play this Weave (the player's own best) instead of Skuld's solution. */
  replay?: Weave;
}

export interface PlayResult {
  saved: number;
  dead: number;
  spindle: boolean;
  bossDefeated: boolean | null;
  ticks: number;
  skillsUsed: number;
  rewinds: number;
  /** the attempt as played (play mode only) */
  weave: Weave | null;
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

/** How far holding Q (or the touch button) projects the hovered Wyrdling's branch. */
const PROJECT_SEC = 15;
/** Frame time Foresight may use while paused (or on the intro card): base fate, branch and verdict share it. */
const PAUSED_MS = 12;
/** Verdict jobs kept half-done, so hovering back to a Wyrdling picks up where it left off. */
const VERDICT_JOBS = 3;

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
  private solution: Script | null = null;
  /** the attempt so far, as a Weave (play mode only) */
  private recorder: WeaveRecorder | null = null;
  /** play-test counts for this attempt (play mode only; the Game folds them into the stats) */
  readonly log: AttemptLog | null = null;
  /** proves "nothing more will happen unless you act" (play mode only) */
  private loops = new LoopDetector();
  /** the proof whose notice the player closed */
  private noticeClosed: LoopProof | null = null;
  /** verdicts weighed since the last input (a calling, a restored snapshot): with none since, the future is fixed */
  private verdicts = new Map<string, Verdict>();
  private verdictJobs = new Map<string, VerdictJob>();
  /** what the paused verdict is about right now (null: nothing to weigh) */
  private verdictWant: { key: string; skill: SkillId; branch: boolean } | null = null;
  private hoverKey = '';
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
  /** Q held / touch button held: the branch looks PROJECT_SEC ahead */
  private projectKey = false;
  private projectTouch = false;
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
      this.solution = cfg.replay ? new Replayer(cfg.replay) : new SolutionPlayer(cfg.level.solution);
      this.state = 'play';
    } else {
      this.recorder = new WeaveRecorder(cfg.level);
      this.log = new AttemptLog();
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
        project: (on) => { this.projectTouch = on; },
        cut: () => this.cutThreads(),
        closeNotice: () => { this.noticeClosed = this.loops.loop; },
        restart: () => hooks.restart(),
        menu: () => hooks.menu(),
      });
      // level hints speak of the default hold mode
      this.hintQueue = cfg.hints ? (cfg.level.hints ?? []).map((h) => cfg.rewindToggle ? h.replace('Hold REWIND', 'Tap REWIND') : h) : [];
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
    if (code === 'Blur') { this.setRewind(false); this.projectKey = false; return; }
    // behind a dialog the level takes no keys but Esc: R would start a rewind nobody sees (and nothing
    // stops in toggle mode), Space would set the level running behind the intro card or pause menu
    if (this.hooks.dialogOpen() && code !== 'Escape') return;
    // key repeat must not restart a rewind that stopped at the first tick (or flip a toggle)
    if (code === 'KeyR' || code === 'Backspace') { if (!repeat) this.rewindInput(down); return; }
    if (code === 'KeyQ') { this.projectKey = down; return; }
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
    // the touch look-ahead button hides with Foresight, so it may never see its finger lift
    this.projectTouch = false;
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
    this.fate = null; this.fateJob = null; this.branch = null; this.branchJob = null; this.branchKey = '';
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
      this.restore(prev);
    }
    this.forgetFate();
  }

  /** The run goes back to an earlier snapshot (Rewind, a step back, Rewind from the results). Callings
   *  granted on or after its tick never happened: the Weave forgets them, and so do the verdicts. */
  private restore(prev: Sim): void {
    this.log?.rewound(this.sim.d.tick - prev.d.tick, this.time);
    this.sim = prev;
    this.recorder?.rewind(prev.d.tick);
    this.loops.reset();
    this.inputChanged();
  }

  /** A calling was granted or the run was set back: what was foreseen to the end no longer holds. */
  private inputChanged(): void {
    this.verdicts.clear();
    this.verdictJobs.clear();
  }

  /** End the level now (Cut the Threads): the rest of the run is given up, and the Weave notes the tick. */
  cutThreads(): void {
    if (this.cfg.mode !== 'play' || this.state !== 'play' || this.sim.d.finished) return;
    if (this.rewinding) this.setRewind(false);
    this.recorder?.cut(this.sim);
    this.sim.finishNow();
    if (this.paused) this.togglePause();
  }

  /** One simulation tick with all its side effects: scripted solution, step, timeline, effects, sound. */
  private tick(sound: boolean): void {
    if (this.solution) {
      const before = this.sim.events.length;
      const applied = this.solution.apply(this.sim);
      if (applied.length) {
        const s = applied[applied.length - 1];
        const who = this.cfg.replay ? 'You grant' : 'Skuld grants';
        if (this.cfg.mode === 'vision') this.visionCaption = { text: `${who} ${SKILL_INFO[s.skill].name.toUpperCase()}`, t: 2.2 };
        // a scripted play mode (dev tooling) is still the player's attempt
        for (const a of applied) this.recorder?.record(this.sim, 'nth' in a ? a.nth : a.id, a.skill);
        if (this.recorder) { this.loops.reset(); this.inputChanged(); }
        const fresh = this.sim.events.slice(before);
        this.view.handleEvents(fresh, this.sim);
        if (sound && this.cfg.mode === 'vision') this.sound.play(fresh, this.sim.d.tick, this.camX, this.p.viewW);
      }
    }
    this.sim.step();
    this.timeline.record(this.sim);
    // the stalemate proof needs every tick; Vision and attract runs never show it
    if (this.cfg.mode === 'play') this.loops.observe(this.sim);
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
    // the pressed Wyrdling was lost on the way (it fell, it died): the grant goes to whoever is under the finger
    if (held !== null && id !== held && this.armed && this.log) this.log.misgrants++;
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
    const skill = this.armed;
    if (this.sim.assign(id, skill)) {
      this.recorder?.record(this.sim, id, skill);
      this.log?.grant(this.time);
      this.loops.reset();
      this.inputChanged();
      const fresh = this.sim.events.slice(before);
      this.view.handleEvents(fresh, this.sim);
      this.sound.play(fresh, this.sim.d.tick, this.camX, this.p.viewW);
      this.hud?.flashSkill(this.armed);
      this.forgetFate();
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
        else { this.rewindAcc -= this.sim.d.tick - prev.d.tick; this.restore(prev); }
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
    if (this.log && this.state === 'play') this.log.sec += dt;

    // foresight
    if (this.cfg.mode === 'play' && this.cfg.foresight && !this.rewinding && this.state !== 'done') this.updateForesight();
    else { this.fate = null; this.branch = null; this.verdictWant = null; }

    // hover
    const heldId = this.heldTarget !== null && isAlive(this.sim.d.wyrds[this.heldTarget]) ? this.heldTarget : null;
    this.hover = heldId ?? (this.hoverPt ? this.pick(this.hoverPt.x, this.hoverPt.y, this.hoverPt.touch) : null);
    const hk = this.armed && this.hover !== null ? `${this.armed}:${this.hover}` : '';
    if (hk && hk !== this.hoverKey && this.log) this.log.hovers++;
    this.hoverKey = hk;

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
          weave: this.weave,
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
    // paused: plenty of frame time, shared by every job; running: a few ms per job, never a hitch
    const paused = this.paused || this.state === 'intro';
    const budget = this.debugFullForesight ? Infinity : paused ? PAUSED_MS : 4;
    const cost = this.debugForesightCost;
    const t0 = performance.now();
    const left = () => (paused && budget !== Infinity ? budget - (performance.now() - t0) : budget);
    const stale = !this.fate || sim.d.tick - this.fate.from >= 6 || sim.d.tick < this.fate.from;
    if (stale && !this.fateJob) this.fateJob = new ForesightJob(sim, horizon);
    if (this.fateJob && this.fateJob.advance(budget)) {
      this.fate = this.fateJob.fate;
      this.fateJob = null;
    }
    if (!this.fate && !this.fateJob) this.fateJob = new ForesightJob(sim, horizon);
    const t1 = cost ? performance.now() : 0;
    const target = this.hover;
    const w = target !== null ? sim.d.wyrds[target] : undefined;
    if (this.armed && target !== null && w && sim.canAssign(w, this.armed)) {
      const far = this.projectKey || this.projectTouch;
      const reach = far ? PROJECT_SEC * TICK_RATE : horizon;
      // another Wyrdling, calling or reach drops the job in flight; the last result stays up until the next one lands
      const key = `${this.armed}:${target}:${reach}`;
      if (key !== this.branchKey) {
        this.branchKey = key;
        this.branchJob = null;
        if (this.log && !this.log.granted) this.log.previews++;
      }
      const b = this.branch;
      const fresh = b && b.focus === target && b.skill === this.armed && b.horizon === reach && sim.d.tick >= b.from && sim.d.tick - b.from < 6;
      // a job runs to the end before the next starts, so a long projection still lands on a heavy level
      if (!fresh && !this.branchJob) {
        // a projection outruns the base fate, so it carries its own baseline, stepped in this job's budget;
        // other Wyrdlings' changed threads stop at the usual horizon
        this.branchJob = new ForesightJob(sim, reach, { id: target, skill: this.armed }, { shadow: far, pathHorizon: horizon });
      }
      if (this.branchJob && left() > 0 && this.branchJob.advance(left())) {
        this.branch = this.branchJob.fate;
        this.branchJob = null;
      }
    } else {
      this.branch = null;
      this.branchJob = null;
      this.branchKey = '';
    }
    if (cost) cost.push(t1 - t0, performance.now() - t1);
    this.updateVerdict(left);
  }

  /**
   * The verdict: paused (or on the intro card) with a calling armed, run the hovered Wyrdling's branch on
   * to its end, in time slices, assuming no further callings. With nobody hovered it weighs the run as it
   * stands. With no new input the future is fixed, so results keep until the next calling or rewind: the
   * do-nothing run holds at every tick, a branch at its own tick, and half-done jobs wait to be hovered again.
   */
  private updateVerdict(left: () => number): void {
    const sim = this.sim, armed = this.armed;
    const paused = this.paused || this.state === 'intro';
    if (!this.cfg.verdict || !paused || !armed) { this.verdictWant = null; return; }
    const target = this.hover;
    const w = target !== null ? sim.d.wyrds[target] : undefined;
    const branch = target !== null && !!w && sim.canAssign(w, armed);
    const key = branch ? `${sim.d.tick}:${target}:${armed}` : 'base';
    this.verdictWant = { key, skill: armed, branch };
    if (this.verdicts.has(key)) return;
    let job = this.verdictJobs.get(key);
    if (!job) {
      const calls: Calling[] = branch ? [{ id: target!, skill: armed }] : [];
      job = new VerdictJob(sim, calls);
      this.verdictJobs.set(key, job);
      for (const k of this.verdictJobs.keys()) {
        if (this.verdictJobs.size <= VERDICT_JOBS) break;
        this.verdictJobs.delete(k);
      }
    }
    // dev tooling counts every frame a verdict is waited for, also those with no time left for it
    const log = this.debugVerdictLog ? (this.debugVerdictLog[key] ??= { frames: 0, ms: 0, ticks: 0, end: '' }) : null;
    if (log) log.frames++;
    const ms = left();
    if (ms <= 0) return;
    const t0 = performance.now();
    const done = job.advance(ms);
    if (log) {
      log.ms += performance.now() - t0;
      log.ticks = job.ticks;
      if (done) log.end = job.result!.end;
    }
    if (done) {
      this.verdicts.set(key, job.result!);
      this.verdictJobs.delete(key);
    }
  }

  /** What the HUD shows of the verdict: what it is about, and the outcome once weighed. */
  private verdictView(): VerdictView | null {
    const want = this.verdictWant;
    if (!want) return null;
    const lead = want.branch ? `With this ${SKILL_INFO[want.skill].name}, if you do nothing more:` : 'If you do nothing more:';
    const v = this.verdicts.get(want.key);
    return v ? { lead, busy: false, parts: verdictParts(v, this.cfg.level) } : { lead, busy: true, parts: [] };
  }

  /** Results screen → back into the level just before it ended, paused, so the player can keep rewinding.
   *  Stars already earned stay earned (the save merges outcomes). */
  reopen(): boolean {
    if (this.state !== 'done') return false;
    const prev = this.timeline.back(this.sim.d.tick);
    if (!prev) return false;
    this.restore(prev);
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
  /** Dev tooling: when an array, each frame appends the ms its base and branch Foresight jobs took. */
  debugForesightCost: number[] | null = null;
  /** Dev tooling: when an object, per verdict key the frames, ms and ticks its job took, and how it ended. */
  debugVerdictLog: Record<string, { frames: number; ms: number; ticks: number; end: string }> | null = null;

  /** The attempt so far, as a Weave (play mode only). */
  get weave(): Weave | null {
    return this.recorder ? structuredClone(this.recorder.weave) : null;
  }

  /** The Replayer's first mismatch with the recording, if this Vision replays a Weave and went out of step. */
  get replayDesync(): boolean {
    return this.solution instanceof Replayer && this.solution.desync !== null;
  }

  /** "Nothing more will happen unless you act": a stalemate is proven, and the player has not closed the notice. */
  private get stalled(): boolean {
    const proof = this.loops.loop;
    return proof !== null && proof !== this.noticeClosed && this.state === 'play' && !this.rewinding && !this.sim.d.finished;
  }

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
      projecting: this.projectKey || this.projectTouch, touch: !!this.hoverPt?.touch,
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
        stalled: this.stalled, verdict: this.verdictView(),
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

/** A verdict against the level's goals, as the HUD shows it: [words, good / bad / neutral]. */
function verdictParts(v: Verdict, level: LevelDef): [string, 'good' | 'bad' | ''][] {
  const met = (ok: boolean): 'good' | 'bad' => (ok ? 'good' : 'bad');
  const parts: [string, 'good' | 'bad' | ''][] = [
    [`saves ${v.saved}`, ''],
    [`quota ${level.quota} ${v.saved >= level.quota ? 'met' : 'not met'}`, met(v.saved >= level.quota)],
    [`target ${level.target} ${v.saved >= level.target ? 'met' : 'not met'}`, met(v.saved >= level.target)],
  ];
  if (v.bossHp !== null) parts.push([v.bossHp === 0 ? 'the guardian falls' : 'the guardian stands', met(v.bossHp === 0)]);
  if (level.entities.some((e) => e.type === 'spindle')) parts.push([v.spindle ? 'spindle found' : 'no spindle', met(v.spindle)]);
  // no proof either way by the limit: say these are the counts then, not the end
  if (v.end === 'cap') parts.push([`(still undecided at ${Math.floor(v.at / TICK_RATE / 60)}:${String(Math.floor(v.at / TICK_RATE) % 60).padStart(2, '0')})`, '']);
  return parts;
}
