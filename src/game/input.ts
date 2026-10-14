// Unified mouse / touch / pen / keyboard input for the game canvas.

export interface InputHandlers {
  hover?(x: number, y: number, touch: boolean): void;
  leave?(): void;
  /** press-and-hold start (touch): lets the view preview the branched fate before release */
  press?(x: number, y: number, touch: boolean): void;
  tap?(x: number, y: number, touch: boolean): void;
  pan?(dx: number, dy: number): void;
  panEnd?(): void;
  zoom?(dir: 1 | -1): void;
  key?(code: string, down: boolean, repeat: boolean): void;
}

interface Ptr { x: number; y: number; sx: number; sy: number; moved: boolean; touch: boolean }

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
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
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
    this.ptrs.set(e.pointerId, { x, y, sx: x, sy: y, moved: false, touch });
    if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()];
      this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      for (const p of this.ptrs.values()) p.moved = true; // two-finger gestures never tap
    } else if (e.button === 0 || touch) {
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
    if (!p.moved && Math.hypot(x - p.sx, y - p.sy) > (p.touch ? 12 : 6)) p.moved = true;
    if (p.moved) this.h.pan?.(-dx, -dy);
    else this.h.hover?.(x, y, p.touch);
  }

  private up(e: PointerEvent): void {
    const [x, y] = this.local(e);
    const p = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    if (!p) return;
    if (!p.moved && this.ptrs.size === 0) this.h.tap?.(x, y, p.touch);
    if (p.moved) this.h.panEnd?.();
    if (p.touch && this.ptrs.size === 0) this.h.leave?.();
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off = [];
  }
}
