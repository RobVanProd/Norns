// Unified mouse / touch / pen / keyboard input for the game canvas, and the rebindable keys.

// ------------------------------------------------------------------ key bindings

/** What the keyboard can be rebound for (Settings → Keys). `slot1`-`slot9` arm the calling in that
 *  position on the level's bar, counting from the left. */
export type KeyAction =
  | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5' | 'slot6' | 'slot7' | 'slot8' | 'slot9'
  | 'pause' | 'rewind' | 'speed' | 'foresight' | 'stepBack' | 'stepFwd';

/** Each action's keys (KeyboardEvent.code). A rebound action has the one key it was given. */
export type KeyBinds = Record<KeyAction, string[]>;

export const SLOT_ACTIONS: KeyAction[] = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8', 'slot9'];

/** In the order Settings lists them. */
export const KEY_ACTIONS: { id: KeyAction; label: string }[] = [
  { id: 'pause', label: 'Pause' }, { id: 'rewind', label: 'Rewind' }, { id: 'speed', label: 'Speed' },
  { id: 'foresight', label: 'Foresight' }, { id: 'stepBack', label: 'Step back' }, { id: 'stepFwd', label: 'Step forward' },
  ...SLOT_ACTIONS.map((id, i) => ({ id, label: `Calling ${i + 1}` })),
];

export function defaultKeys(): KeyBinds {
  const k = {
    pause: ['Space', 'KeyP'], rewind: ['KeyR', 'Backspace'], speed: ['KeyF'], foresight: ['KeyV'], stepBack: ['Comma'], stepFwd: ['Period'],
  } as KeyBinds;
  SLOT_ACTIONS.forEach((a, i) => { k[a] = [`Digit${i + 1}`]; });
  return k;
}

/** Keys that keep their one meaning: Esc puts a calling away and opens the menu, Shift turns a tick step
 *  into a second, Tab and the system keys belong to the browser. (The camera keys, Q and zoom give way
 *  to an action bound to them instead.) */
const RESERVED = new Set(['Escape', 'ShiftLeft', 'ShiftRight', 'Tab', 'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'CapsLock', 'ContextMenu', 'F5', 'F11', 'F12']);

export function reservedKey(code: string): boolean {
  return RESERVED.has(code);
}

/** The action a key is bound to, if any. */
export function actionFor(binds: KeyBinds, code: string): KeyAction | null {
  for (const a of KEY_ACTIONS) if (binds[a.id].includes(code)) return a.id;
  return null;
}

/**
 * Bind `code` to `action` alone. A key does one thing: if another action had it, that action loses it,
 * and if that leaves it with no key at all it takes over `action`'s old key (a swap). Returns the action
 * that gave the key up, or null. The caller refuses reserved keys first.
 */
export function bindKey(binds: KeyBinds, action: KeyAction, code: string): KeyAction | null {
  const old = binds[action].filter((c) => c !== code);
  const other = actionFor(binds, code);
  binds[action] = [code];
  if (!other || other === action) return null;
  binds[other] = binds[other].filter((c) => c !== code);
  if (!binds[other].length) binds[other] = old.slice(0, 1);
  return other;
}

/** Saved bindings, checked: malformed entries fall back to the defaults, reserved keys are dropped, and a
 *  key claimed twice (an edited save, or a newer default the save never moved) stays with a saved
 *  binding first, then with the first action in KEY_ACTIONS order. */
export function readKeys(raw: unknown): KeyBinds {
  const k = defaultKeys();
  if (!raw || typeof raw !== 'object') return k;
  const saved = new Set<KeyAction>();
  for (const { id } of KEY_ACTIONS) {
    const v = (raw as Record<string, unknown>)[id];
    if (!Array.isArray(v)) continue;
    const codes = v.filter((c): c is string => typeof c === 'string' && c.length > 0 && !RESERVED.has(c));
    if (codes.length) { k[id] = [...new Set(codes)]; saved.add(id); }
  }
  const owned = new Set<string>();
  for (const { id } of [...KEY_ACTIONS.filter((a) => saved.has(a.id)), ...KEY_ACTIONS.filter((a) => !saved.has(a.id))]) {
    k[id] = k[id].filter((c) => !owned.has(c));
    for (const c of k[id]) owned.add(c);
  }
  return k;
}

const KEY_NAMES: Record<string, string> = {
  Space: 'Space', Backspace: '⌫', Enter: 'Enter', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'",
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End',
  PageUp: 'PgUp', PageDown: 'PgDn',
};

/** A key as players read it: 'KeyR' → 'R', 'Digit1' → '1', 'Numpad4' → 'Num 4'. */
export function keyName(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** An action's keys as players read them ('Space / P'), or '—' when it has none. */
export function keysName(binds: KeyBinds, action: KeyAction): string {
  return binds[action].map(keyName).join(' / ') || '—';
}

// ------------------------------------------------------------------ pointer and keyboard

export interface InputHandlers {
  hover?(x: number, y: number, touch: boolean): void;
  leave?(): void;
  /** press-and-hold start (touch): lets the view preview the branched fate before release */
  press?(x: number, y: number, touch: boolean): void;
  /** mouse press: act immediately; return true if consumed (that press then never pans or taps) */
  act?(x: number, y: number): boolean;
  /** release without dragging; (sx, sy) is where the press started */
  tap?(x: number, y: number, touch: boolean, sx: number, sy: number): void;
  pan?(dx: number, dy: number): void;
  panEnd?(): void;
  zoom?(dir: 1 | -1): void;
  key?(code: string, down: boolean, repeat: boolean): void;
  /** right mouse button pressed */
  cancel?(): void;
}

/** primary: a touch or the left button; only those tap (a right-click must never grant a calling) */
interface Ptr { x: number; y: number; sx: number; sy: number; moved: boolean; touch: boolean; used: boolean; primary: boolean }

export class Input {
  private ptrs = new Map<number, Ptr>();
  private pinchStart = 0;
  private wheelAcc = 0;
  private el: HTMLElement;
  h: InputHandlers = {};
  readonly held = new Set<string>();
  private off: (() => void)[] = [];

  constructor(el: HTMLElement) {
    this.el = el;
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(t, f as EventListener, opts);
      this.off.push(() => el.removeEventListener(t, f as EventListener));
    };
    const onW = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(t, f as EventListener);
      this.off.push(() => window.removeEventListener(t, f as EventListener));
    };
    on('pointerdown', (e) => this.down(e));
    on('pointermove', (e) => this.move(e));
    on('pointerup', (e) => this.up(e));
    on('pointercancel', (e) => { this.ptrs.delete(e.pointerId); this.h.panEnd?.(); });
    on('pointerleave', (e) => { if (e.pointerType === 'mouse') this.h.leave?.(); });
    on('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey) {
        this.wheelAcc += e.deltaY;
        if (Math.abs(this.wheelAcc) > 60) { this.h.zoom?.(this.wheelAcc < 0 ? 1 : -1); this.wheelAcc = 0; }
      } else this.h.pan?.(e.shiftKey ? e.deltaY : e.deltaX, e.shiftKey ? 0 : e.deltaY);
    }, { passive: false });
    on('contextmenu', (e) => e.preventDefault());
    onW('keydown', (e) => {
      // form controls keep their own keys (arrows and Space work a <select>); Esc still reaches the game
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName) && e.code !== 'Escape') return;
      this.held.add(e.code);
      this.h.key?.(e.code, true, e.repeat);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    onW('keyup', (e) => {
      this.held.delete(e.code);
      this.h.key?.(e.code, false, false);
    });
    onW('blur', () => { this.held.clear(); this.h.key?.('Blur', false, false); });
  }

  private local(e: PointerEvent): [number, number] {
    const r = this.el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private down(e: PointerEvent): void {
    const [x, y] = this.local(e);
    const touch = e.pointerType !== 'mouse';
    this.el.setPointerCapture?.(e.pointerId);
    const primary = touch || e.button === 0;
    this.ptrs.set(e.pointerId, { x, y, sx: x, sy: y, moved: false, touch, used: false, primary });
    if (!touch && e.button === 2) this.h.cancel?.();
    if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()];
      this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      for (const p of this.ptrs.values()) p.moved = true; // two-finger gestures never tap
    } else if (e.button === 0 || touch) {
      // mouse: a press on a Wyrdling acts at once, so a click on a moving target can't turn into a pan
      if (!touch && this.h.act?.(x, y)) { this.ptrs.get(e.pointerId)!.used = true; return; }
      this.h.press?.(x, y, touch);
    }
  }

  private move(e: PointerEvent): void {
    const [x, y] = this.local(e);
    const p = this.ptrs.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.h.hover?.(x, y, false);
      return;
    }
    const dx = x - p.x, dy = y - p.y;
    p.x = x; p.y = y;
    if (p.used) { this.h.hover?.(x, y, false); return; }
    if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchStart > 0) {
        if (d / this.pinchStart > 1.35) { this.h.zoom?.(1); this.pinchStart = d; }
        else if (d / this.pinchStart < 0.74) { this.h.zoom?.(-1); this.pinchStart = d; }
      }
      this.h.pan?.(-dx / 2, -dy / 2);
      return;
    }
    if (!p.moved && Math.hypot(x - p.sx, y - p.sy) > (p.touch ? 16 : 6)) p.moved = true;
    if (p.moved) this.h.pan?.(-dx, -dy);
    else this.h.hover?.(x, y, p.touch);
  }

  private up(e: PointerEvent): void {
    const [x, y] = this.local(e);
    const p = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    if (!p || p.used) return;
    if (!p.moved && this.ptrs.size === 0 && p.primary) this.h.tap?.(x, y, p.touch, p.sx, p.sy);
    if (p.moved) this.h.panEnd?.();
    if (p.touch && this.ptrs.size === 0) this.h.leave?.();
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off = [];
  }
}
