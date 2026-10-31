// In-level HUD: counters, quota bar, boss health, skill bar, time controls, hints, fate summary, the
// stalemate notice and the paused verdict.
import { SKILLS, SKILL_INFO, type SkillId } from '../sim/constants';
import { el, pixelCanvas } from './dom';

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
  private skillBtns = new Map<SkillId, { b: HTMLButtonElement; n: HTMLSpanElement }>();
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
  private icons: Record<string, HTMLCanvasElement>;
  private last = '';

  constructor(parent: HTMLElement, icons: Record<string, HTMLCanvasElement>, available: Partial<Record<SkillId, number>>, cb: HudCallbacks) {
    this.icons = icons;
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
    const stepBack = btn('arrow_left', 'Step back one tick (,)', () => cb.step(-1));
    const stepFwd = btn('arrow_right', 'Step forward one tick (.)', () => cb.step(1));
    stepBack.classList.add('step'); stepFwd.classList.add('step');
    this.speedBtn = btn('fast', 'Speed (F)', () => cb.speed());
    this.eyeBtn = btn('eye', "Skuld's Foresight (V)", () => cb.foresight());
    const restartBtn = btn('restart', 'Restart', () => cb.restart());
    const menuBtn = btn('home', 'Menu (Esc)', () => cb.menu());
    const controls = el('div', { class: 'controls panel' }, this.eyeBtn, stepBack, this.pauseBtn, stepFwd, this.speedBtn, restartBtn, menuBtn);
    this.bossFill = el('div', { class: 'bfill' });
    this.bossName = el('div', { class: 'bname' });
    this.bossWrap = el('div', { class: 'bossbar' }, this.bossName, el('div', { class: 'btrack' }, this.bossFill));
    this.fateEl = el('div', { class: 'fate' });
    const top = el('div', { class: 'hud-top' }, this.name, counters, controls);

    const bar = el('div', { class: 'skillbar panel' });
    for (const s of SKILLS) {
      if (available[s] === undefined) continue;
      const n = el('span', { class: 'count' });
      // shown only on the armed card (see .skill.armed .x in style.css): the touch way to put a calling away
      const x = el('span', { class: 'x', title: 'Put away (Esc or right-click)', text: '×' });
      const b = el('button', { class: 'skill', title: `${SKILL_INFO[s].name} (${SKILL_INFO[s].key}) — ${SKILL_INFO[s].desc}`, 'aria-label': SKILL_INFO[s].name },
        icon(s, 3), n, el('span', { class: 'key', text: SKILL_INFO[s].key }), el('span', { class: 'sname', text: SKILL_INFO[s].name }), x);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target === x && b.classList.contains('armed')) cb.disarm(); else cb.skill(s);
      });
      bar.append(b);
      this.skillBtns.set(s, { b, n });
    }
    this.rewindBtn = el('button', { class: 'rewind', title: 'Hold to rewind (R)', 'aria-label': 'Rewind' }, icon('rewind', 3), el('span', { class: 'rsec' }));
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
    this.projectBtn = el('button', { class: 'project', title: 'Hold to look 15 s ahead (Q)', 'aria-label': 'Look further ahead' }, icon('eye', 2), el('span', { class: 'psec', text: '15s' }));
    const pOn = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.projectBtn.classList.add('on'); cb.project(true); };
    const pOff = (e: Event) => { e.preventDefault(); this.projectBtn.classList.remove('on'); cb.project(false); };
    this.projectBtn.addEventListener('pointerdown', pOn);
    for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const) this.projectBtn.addEventListener(t, pOff);
    this.projectBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    this.hintEl = el('div', { class: 'hint' });
    // a proven stalemate: honest about what is known (nothing changes by itself), never "lost"
    const nRewind = el('button', { class: 'btn small', text: 'Rewind' });
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
    const nCut = el('button', { class: 'btn small', text: 'Cut the Threads' });
    nCut.addEventListener('click', (e) => { e.stopPropagation(); cb.cut(); });
    const nClose = el('button', { class: 'nclose', title: 'Keep playing', 'aria-label': 'Close', text: '×' });
    nClose.addEventListener('click', (e) => { e.stopPropagation(); cb.closeNotice(); });
    this.noticeEl = el('div', { class: 'notice panel', role: 'status' },
      el('div', { class: 'ntext', text: 'Nothing more will happen unless you act.' }),
      el('div', { class: 'nrow' }, nRewind, nCut), nClose);
    this.verdictEl = el('div', { class: 'verdict panel', role: 'status' });
    const bottom = el('div', { class: 'hud-bottom' }, bar, this.rewindBtn, this.projectBtn);
    this.root = el('div', { class: 'hud' }, top, this.bossWrap, this.fateEl, this.hintEl, this.noticeEl, this.verdictEl, bottom);
    // HUD panels swallow pointer events so taps on buttons don't reach the world
    for (const p of [top, bottom, this.bossWrap, this.noticeEl]) p.addEventListener('pointerdown', (e) => e.stopPropagation());
    parent.append(this.root);
  }

  hint(text: string, seconds = 6): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    this.hintTimer = seconds;
  }

  tick(dt: number): void {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hintEl.classList.remove('show');
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
    for (const [k, { b, n }] of this.skillBtns) {
      const c = s.skills[k];
      n.textContent = String(c);
      b.classList.toggle('armed', s.armed === k);
      b.classList.toggle('empty', c <= 0);
    }
    const swap = (b: HTMLButtonElement, k: string) => {
      const old = b.querySelector('canvas');
      if (old?.dataset.k === k) return;
      const c = pixelCanvas(this.icons[k], 2, 'px icon');
      c.dataset.k = k;
      if (old) old.replaceWith(c); else b.append(c);
    };
    swap(this.pauseBtn, s.paused ? 'play' : 'pause');
    swap(this.speedBtn, s.speed >= 4 ? 'faster' : 'fast');
    this.speedBtn.classList.toggle('on', s.speed > 1);
    this.speedBtn.dataset.speed = `${s.speed}×`;
    swap(this.eyeBtn, s.foresight ? 'eye' : 'eye_off');
    this.eyeBtn.classList.toggle('on', s.foresight);
    this.projectBtn.classList.toggle('off', !s.foresight);
    this.pauseBtn.classList.toggle('on', s.paused);
    this.rewindBtn.classList.toggle('on', s.rewinding);
    const rewindTitle = s.rewindToggle ? 'Rewind (R): press to start, again to stop' : 'Hold to rewind (R)';
    if (this.rewindBtn.title !== rewindTitle) this.rewindBtn.title = rewindTitle;
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
