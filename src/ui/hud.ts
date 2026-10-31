// In-level HUD: counters, quota bar, boss health, skill bar, time controls, hints, fate summary, the
// stalemate notice and the paused verdict. Above the skill bar: the armed calling's name and what it
// does, and the onboarding notes that belong down there (Rewind, hover to preview). Skuld's Vision
// gets a read-only HUD: counters, quota bar, boss bar, pause and speed. Every button carries an aria
// label naming its key, kept up to date with the bindings and with what the button would do now.
import { keysName, SLOT_ACTIONS, type KeyAction, type KeyBinds } from '../game/input';
import { SKILLS, SKILL_INFO, type SkillId } from '../sim/constants';
import { el, pixelCanvas } from './dom';

/** The callings on a level's bar, left to right: slot keys 1-9 arm them in this order. */
export function barSlots(available: Partial<Record<SkillId, number>>): SkillId[] {
  return SKILLS.filter((s) => available[s] !== undefined);
}

/** A speed as the HUD writes it. */
export function speedName(speed: number): string {
  return speed === 0.5 ? '½×' : `${speed}×`;
}

export interface HudCallbacks {
  skill(s: SkillId): void;
  /** the armed card's × */
  disarm(): void;
  pause(): void;
  /** paused tick-stepping: +1 / -1 */
  step(n: number): void;
  speed(): void;
  /** rewind button pressed (true) or released (false); hold vs toggle is the scene's call */
  rewind(down: boolean): void;
  foresight(): void;
  /** held: Foresight follows the hovered Wyrdling's calling further ahead */
  project(on: boolean): void;
  /** Cut the Threads: end the level now */
  cut(): void;
  /** the stalemate notice's ×: keep playing without it */
  closeNotice(): void;
  restart(): void;
  menu(): void;
}

export interface HudState {
  name: string;
  out: number;
  toCome: number;
  saved: number;
  quota: number;
  target: number;
  total: number;
  spindle: boolean | null;
  skills: Record<SkillId, number>;
  armed: SkillId | null;
  paused: boolean;
  speed: number;
  foresight: boolean;
  rewinding: boolean;
  rewindToggle: boolean;
  rewindSec: number;
  boss: { hp: number; max: number; name: string } | null;
  doomed: number;
  horizon: number;
  /** a stalemate is proven: offer Rewind or Cut the Threads */
  stalled: boolean;
  verdict: VerdictView | null;
}

/** The paused verdict: what it is about, then the outcome ([words, tone]) or, while weighing, nothing. */
export interface VerdictView {
  lead: string;
  busy: boolean;
  parts: [string, 'good' | 'bad' | ''][];
}

export class Hud {
  readonly root: HTMLDivElement;
  private skillBtns = new Map<SkillId, { b: HTMLButtonElement; n: HTMLSpanElement; key: HTMLSpanElement; slot: KeyAction }>();
  private stepBack: HTMLButtonElement;
  private stepFwd: HTMLButtonElement;
  private bannerEl: HTMLDivElement;
  private bannerTimer = 0;
  private keys: KeyBinds;
  private name: HTMLDivElement;
  private outEl: HTMLSpanElement;
  private savedEl: HTMLSpanElement;
  private bar: HTMLDivElement;
  private barFill: HTMLDivElement;
  private spindleEl: HTMLDivElement;
  private pauseBtn: HTMLButtonElement;
  private speedBtn: HTMLButtonElement;
  private eyeBtn: HTMLButtonElement;
  private rewindBtn: HTMLButtonElement;
  private projectBtn: HTMLButtonElement;
  private bossWrap: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossName: HTMLDivElement;
  private fateEl: HTMLDivElement;
  private noticeEl: HTMLDivElement;
  private verdictEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private hintTimer = 0;
  private armedEl: HTMLDivElement;
  private armedName: HTMLSpanElement;
  private armedDesc: HTMLSpanElement;
  private armedLessonEl: HTMLDivElement;
  private rewindTip: HTMLDivElement;
  private rewindTipTimer = 0;
  private icons: Record<string, HTMLCanvasElement>;
  private last = '';

  /** `readOnly` (Skuld's Vision): counters, quota bar, boss bar, pause and speed, and nothing to grant with. */
  constructor(parent: HTMLElement, icons: Record<string, HTMLCanvasElement>, available: Partial<Record<SkillId, number>>, cb: HudCallbacks,
    keys: KeyBinds, readOnly = false) {
    this.icons = icons;
    this.keys = keys;
    const icon = (k: string, s = 2) => pixelCanvas(icons[k], s, 'px icon');
    this.name = el('div', { class: 'hud-name' });
    this.outEl = el('span', { class: 'num' });
    this.savedEl = el('span', { class: 'num' });
    this.barFill = el('div', { class: 'qfill' });
    this.bar = el('div', { class: 'qbar' }, this.barFill, el('div', { class: 'qmark quota' }), el('div', { class: 'qmark target' }));
    this.spindleEl = el('div', { class: 'spindle-ind', title: 'Golden Spindle' }, icon('thread', 2));
    const counters = el('div', { class: 'counters panel' },
      el('div', { class: 'ctr', title: 'Wyrdlings out / still to come' }, icon('wyrd', 2), this.outEl),
      el('div', { class: 'ctr saved', title: 'Saved / needed' }, icon('gate', 2), this.savedEl, this.bar),
      this.spindleEl,
    );
    const btn = (k: string, title: string, f: () => void) => {
      const b = el('button', { class: 'ibtn', title, 'aria-label': title }, icon(k, 2));
      b.addEventListener('click', (e) => { e.stopPropagation(); f(); });
      return b;
    };
    this.pauseBtn = btn('pause', 'Pause (Space)', () => cb.pause());
    // shown only while paused (see .hud.paused in style.css)
    const stepBack = this.stepBack = btn('arrow_left', 'Step back one tick', () => cb.step(-1));
    const stepFwd = this.stepFwd = btn('arrow_right', 'Step forward one tick', () => cb.step(1));
    stepBack.classList.add('step'); stepFwd.classList.add('step');
    this.speedBtn = btn('fast', 'Speed', () => cb.speed());
    this.eyeBtn = btn('eye', "Skuld's Foresight", () => cb.foresight());
    const restartBtn = btn('restart', 'Restart', () => cb.restart());
    const menuBtn = btn('home', 'Menu (Esc)', () => cb.menu());
    const controls = readOnly ? el('div', { class: 'controls panel' }, this.pauseBtn, this.speedBtn)
      : el('div', { class: 'controls panel' }, this.eyeBtn, stepBack, this.pauseBtn, stepFwd, this.speedBtn, restartBtn, menuBtn);
    this.bossFill = el('div', { class: 'bfill' });
    this.bossName = el('div', { class: 'bname' });
    this.bossWrap = el('div', { class: 'bossbar' }, this.bossName, el('div', { class: 'btrack' }, this.bossFill));
    this.fateEl = el('div', { class: 'fate' });
    const top = el('div', { class: 'hud-top' }, this.name, counters, controls);

    const bar = el('div', { class: 'skillbar panel', role: 'toolbar', 'aria-label': 'Callings' });
    barSlots(available).forEach((s, i) => {
      const n = el('span', { class: 'count' });
      const key = el('span', { class: 'key' });
      // shown only on the armed card (see .skill.armed .x in style.css): the touch way to put a calling away
      const x = el('span', { class: 'x', title: 'Put away (Esc or right-click)', text: '×' });
      const b = el('button', { class: 'skill' }, icon(s, 3), n, key, el('span', { class: 'sname', text: SKILL_INFO[s].name }), x);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target === x && b.classList.contains('armed')) cb.disarm(); else cb.skill(s);
      });
      bar.append(b);
      this.skillBtns.set(s, { b, n, key, slot: SLOT_ACTIONS[i] });
    });
    this.rewindBtn = el('button', { class: 'rewind' }, icon('rewind', 3), el('span', { class: 'rsec' }));
    const start = (e: PointerEvent) => {
      e.preventDefault(); e.stopPropagation();
      // only a touch or the left button: a right-click must not flip a toggled rewind
      if (e.pointerType !== 'mouse' || e.button === 0) cb.rewind(true);
    };
    const stop = (e: Event) => { e.preventDefault(); cb.rewind(false); };
    this.rewindBtn.addEventListener('pointerdown', start);
    this.rewindBtn.addEventListener('pointerup', stop);
    this.rewindBtn.addEventListener('pointercancel', stop);
    this.rewindBtn.addEventListener('pointerleave', stop);
    this.rewindBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    // touch stand-in for holding Q: one finger holds a Wyrdling, the other holds this (touch screens only, see CSS)
    this.projectBtn = el('button', { class: 'project', title: 'Hold to look 15 s ahead (Q)', 'aria-label': 'Hold to look 15 seconds ahead' }, icon('eye', 2), el('span', { class: 'psec', text: '15s' }));
    const pOn = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.projectBtn.classList.add('on'); cb.project(true); };
    const pOff = (e: Event) => { e.preventDefault(); this.projectBtn.classList.remove('on'); cb.project(false); };
    this.projectBtn.addEventListener('pointerdown', pOn);
    for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const) this.projectBtn.addEventListener(t, pOff);
    this.projectBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    this.hintEl = el('div', { class: 'hint' });
    // a proven stalemate: honest about what is known (nothing changes by itself), never "lost"
    const nRewind = el('button', { class: 'btn small', text: 'Rewind', 'aria-label': 'Rewind' });
    nRewind.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      cb.rewind(true);
      // in hold mode the rewind runs until this press ends, wherever the pointer is by then (the
      // notice hides as soon as the run changes)
      const up = () => { cb.rewind(false); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
    const nCut = el('button', { class: 'btn small', text: 'Cut the Threads', 'aria-label': 'Cut the Threads: end the level now' });
    nCut.addEventListener('click', (e) => { e.stopPropagation(); cb.cut(); });
    const nClose = el('button', { class: 'nclose', title: 'Keep playing', 'aria-label': 'Close this notice and keep playing', text: '×' });
    nClose.addEventListener('click', (e) => { e.stopPropagation(); cb.closeNotice(); });
    this.noticeEl = el('div', { class: 'notice panel', role: 'status' },
      el('div', { class: 'ntext', text: 'Nothing more will happen unless you act.' }),
      el('div', { class: 'nrow' }, nRewind, nCut), nClose);
    this.verdictEl = el('div', { class: 'verdict panel', role: 'status' });
    // display only (clicks pass through to the world): the armed calling, and notes that point at the bar
    this.armedName = el('span', { class: 'aname' });
    this.armedDesc = el('span', { class: 'adesc' });
    this.armedLessonEl = el('div', { class: 'lesson' });
    this.armedEl = el('div', { class: 'armed-info', role: 'status' }, this.armedName, ' ', this.armedDesc, this.armedLessonEl);
    this.rewindTip = el('div', { class: 'rewind-tip', role: 'status' }, icon('rewind', 2), el('span'));
    const notes = el('div', { class: 'hud-notes' }, this.rewindTip, this.armedEl);
    const bottom = el('div', { class: 'hud-bottom' }, bar, this.rewindBtn, this.projectBtn);
    // level-wide news ('QUOTA MET!'): in screen space, so the edge of the view never cuts it off
    this.bannerEl = el('div', { class: 'hud-banner', role: 'status' });
    this.root = readOnly
      ? el('div', { class: 'hud read-only' }, top, this.bossWrap, this.bannerEl)
      : el('div', { class: 'hud' }, top, this.bossWrap, this.fateEl, this.hintEl, this.noticeEl, this.verdictEl, this.bannerEl, notes, bottom);
    // HUD panels swallow pointer events so taps on buttons don't reach the world
    for (const p of [top, bottom, this.bossWrap, this.noticeEl]) p.addEventListener('pointerdown', (e) => e.stopPropagation());
    parent.append(this.root);
    this.setKeys(keys);
  }

  /** The key bindings changed (or are first known): key chips, titles and labels name the new keys. */
  setKeys(keys: KeyBinds): void {
    this.keys = keys;
    for (const [s, { b, key, slot }] of this.skillBtns) {
      key.textContent = keys[slot].length ? keysName(keys, slot).split(' / ')[0] : '';
      b.title = `${SKILL_INFO[s].name} (${keysName(keys, slot)}) — ${SKILL_INFO[s].desc}`;
    }
    label(this.stepBack, `Step back one tick (${keysName(keys, 'stepBack')})`);
    label(this.stepFwd, `Step forward one tick (${keysName(keys, 'stepFwd')})`);
    // the next update() rewrites the labels that depend on state
    this.last = '';
  }

  /** A line of level-wide news across the screen for `seconds` (the quota met). */
  banner(text: string, seconds = 2.6): void {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    this.bannerTimer = seconds;
  }

  /** A line in the hint box for `seconds`; a `lesson` (an onboarding moment) is drawn a little louder. */
  hint(text: string, seconds = 6, lesson = false): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    this.hintEl.classList.toggle('lesson', lesson);
    this.hintTimer = seconds;
  }

  hideHint(): void {
    this.hintTimer = 0;
    this.hintEl.classList.remove('show');
  }

  /** Something is in the hint box. */
  get hintBusy(): boolean {
    return this.hintTimer > 0;
  }

  /** The first-death lesson: a note above the bar, and the Rewind button pulses; null puts both away. */
  rewindLesson(text: string | null, seconds = 8): void {
    (this.rewindTip.lastChild as HTMLElement).textContent = text ?? '';
    this.rewindTip.classList.toggle('show', text !== null);
    this.rewindBtn.classList.toggle('teach', text !== null);
    this.rewindTipTimer = text === null ? 0 : seconds;
  }

  /** The first-armed lesson, under the armed calling's description; null puts it away. */
  armedLesson(text: string | null): void {
    this.armedLessonEl.textContent = text ?? '';
    this.armedLessonEl.classList.toggle('on', text !== null);
  }

  /** Make the pause / play button pulse (after the doom lesson: "press play to go on"). */
  pulsePause(on: boolean): void {
    this.pauseBtn.classList.toggle('teach', on);
  }

  tick(dt: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.classList.remove('show');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hintEl.classList.remove('show');
    }
    if (this.rewindTipTimer > 0) {
      this.rewindTipTimer -= dt;
      if (this.rewindTipTimer <= 0) this.rewindLesson(null);
    }
  }

  flashSkill(s: SkillId): void {
    const b = this.skillBtns.get(s)?.b;
    if (!b) return;
    b.classList.remove('pulse');
    void b.offsetWidth;
    b.classList.add('pulse');
  }

  denySkill(s: SkillId): void {
    const b = this.skillBtns.get(s)?.b;
    if (!b) return;
    b.classList.remove('deny');
    void b.offsetWidth;
    b.classList.add('deny');
  }

  update(s: HudState): void {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    this.name.textContent = s.name;
    this.outEl.textContent = `${s.out}${s.toCome ? `+${s.toCome}` : ''}`;
    this.savedEl.textContent = `${s.saved}/${s.quota}`;
    this.savedEl.classList.toggle('met', s.saved >= s.quota);
    this.barFill.style.width = `${Math.min(100, (s.saved / s.total) * 100)}%`;
    (this.bar.children[1] as HTMLElement).style.left = `${(s.quota / s.total) * 100}%`;
    (this.bar.children[2] as HTMLElement).style.left = `${(s.target / s.total) * 100}%`;
    this.spindleEl.style.display = s.spindle === null ? 'none' : '';
    this.spindleEl.classList.toggle('got', !!s.spindle);
    const keys = (a: KeyAction) => keysName(this.keys, a);
    for (const [k, { b, n, slot }] of this.skillBtns) {
      const c = s.skills[k];
      n.textContent = String(c);
      b.classList.toggle('armed', s.armed === k);
      b.classList.toggle('empty', c <= 0);
      b.setAttribute('aria-label', `${SKILL_INFO[k].name}, ${c} left, key ${keys(slot)}`);
      b.setAttribute('aria-pressed', String(s.armed === k));
    }
    this.armedEl.classList.toggle('show', s.armed !== null);
    if (s.armed) {
      this.armedName.textContent = SKILL_INFO[s.armed].name;
      this.armedDesc.textContent = SKILL_INFO[s.armed].desc;
    }
    const swap = (b: HTMLButtonElement, k: string) => {
      const old = b.querySelector('canvas');
      if (old?.dataset.k === k) return;
      const c = pixelCanvas(this.icons[k], 2, 'px icon');
      c.dataset.k = k;
      if (old) old.replaceWith(c); else b.append(c);
    };
    swap(this.pauseBtn, s.paused ? 'play' : 'pause');
    label(this.pauseBtn, `${s.paused ? 'Resume' : 'Pause'} (${keys('pause')})`);
    swap(this.speedBtn, s.speed >= 4 ? 'faster' : 'fast');
    this.speedBtn.classList.toggle('on', s.speed !== 1);
    this.speedBtn.dataset.speed = speedName(s.speed);
    label(this.speedBtn, `Speed ${speedName(s.speed)} (${keys('speed')})`);
    swap(this.eyeBtn, s.foresight ? 'eye' : 'eye_off');
    this.eyeBtn.classList.toggle('on', s.foresight);
    label(this.eyeBtn, `Skuld's Foresight ${s.foresight ? 'on' : 'off'} (${keys('foresight')})`);
    this.eyeBtn.setAttribute('aria-pressed', String(s.foresight));
    this.projectBtn.classList.toggle('off', !s.foresight);
    this.pauseBtn.classList.toggle('on', s.paused);
    this.rewindBtn.classList.toggle('on', s.rewinding);
    label(this.rewindBtn, s.rewindToggle ? `Rewind (${keys('rewind')}): press to start, again to stop` : `Hold to rewind (${keys('rewind')})`);
    this.rewindBtn.setAttribute('aria-pressed', String(s.rewinding));
    (this.rewindBtn.querySelector('.rsec') as HTMLElement).textContent = `${Math.floor(s.rewindSec)}s`;
    if (s.boss) {
      this.bossWrap.classList.add('show');
      this.bossName.textContent = s.boss.name;
      this.bossFill.style.width = `${(s.boss.hp / s.boss.max) * 100}%`;
    } else this.bossWrap.classList.remove('show');
    if (s.foresight && s.doomed > 0) {
      this.fateEl.textContent = `☠ ${s.doomed} doomed within ${s.horizon}s`;
      this.fateEl.classList.add('show');
    } else this.fateEl.classList.remove('show');
    this.noticeEl.classList.toggle('show', s.stalled);
    const v = s.verdict;
    this.verdictEl.classList.toggle('show', v !== null);
    if (v) {
      const lead = el('span', { class: 'vlead', text: v.lead });
      const parts: (HTMLElement | string)[] = [lead, ' '];
      if (v.busy) parts.push(el('span', { class: 'vbusy', text: 'weighing fate…' }));
      else v.parts.forEach(([t, tone], i) => parts.push(i ? ' · ' : '', el('span', { class: tone && `v${tone}`, text: t })));
      this.verdictEl.replaceChildren(...parts);
    }
    this.root.classList.toggle('paused', s.paused);
    this.root.classList.toggle('verdict-on', v !== null);
    this.root.classList.toggle('boss', !!s.boss);
  }

  dispose(): void {
    this.root.remove();
  }
}

/** A button's tooltip and its accessible name, kept the same. */
function label(b: HTMLButtonElement, text: string): void {
  if (b.title !== text) b.title = text;
  if (b.getAttribute('aria-label') !== text) b.setAttribute('aria-label', text);
}
