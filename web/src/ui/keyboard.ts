// Interactive on-screen piano keyboard (02_design.md 4.4).
// Range: C3 (MIDI 48) - C6 (MIDI 84), fixed (see 02_design.md 4.4 for the
// rationale: 11/28 pieces have onset notes below C3, accepted as a known
// limitation rather than widening the keyboard).

import { isBlackKey, midiToNameJa } from '../util/notenames.ts';

const LOWEST_MIDI = 48; // C3
const HIGHEST_MIDI = 84; // C6

const WHITE_KEY_WIDTH = 32;
const WHITE_KEY_HEIGHT = 140;
const BLACK_KEY_WIDTH = 20;
const BLACK_KEY_HEIGHT = 90;

type KeyEventName = 'press' | 'release';
type KeyListener = (midi: number) => void;
type SustainListener = (on: boolean) => void;

interface KeyLayout {
  midi: number;
  black: boolean;
  x: number;
  width: number;
  height: number;
}

function buildLayout(): { keys: KeyLayout[]; totalWidth: number } {
  const keys: KeyLayout[] = [];
  let whiteIndex = 0;
  for (let midi = LOWEST_MIDI; midi <= HIGHEST_MIDI; midi++) {
    if (isBlackKey(midi)) {
      keys.push({
        midi,
        black: true,
        x: whiteIndex * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2,
        width: BLACK_KEY_WIDTH,
        height: BLACK_KEY_HEIGHT,
      });
    } else {
      keys.push({
        midi,
        black: false,
        x: whiteIndex * WHITE_KEY_WIDTH,
        width: WHITE_KEY_WIDTH,
        height: WHITE_KEY_HEIGHT,
      });
      whiteIndex++;
    }
  }
  return { keys, totalWidth: whiteIndex * WHITE_KEY_WIDTH };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export class Keyboard {
  private container: HTMLElement;
  private keyElements = new Map<number, SVGRectElement>();
  private labelElements = new Map<number, SVGTextElement>();
  private listeners: Record<KeyEventName, KeyListener[]> = { press: [], release: [] };
  private sustainListeners: SustainListener[] = [];
  private pressedMidis = new Set<number>();
  private highlightedMidis = new Set<number>();
  private showNoteNames = false;
  private sustainIndicator: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    // Sustain ("damper pedal", 02_design.md 4.4) is a global modifier so it
    // works the same whether notes come from mouse clicks on the keyboard or
    // (M11) QWERTY-mapped key presses -- both funnel through this class.
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Control' && !ev.repeat) this.setSustainIndicator(true);
    });
    document.addEventListener('keyup', (ev) => {
      if (ev.key === 'Control') this.setSustainIndicator(false);
    });
    // If the window loses focus while Ctrl is held (e.g. alt-tab), the keyup
    // never arrives -- release sustain defensively so it can't get stuck on.
    window.addEventListener('blur', () => this.setSustainIndicator(false));
  }

  private setSustainIndicator(on: boolean): void {
    this.sustainIndicator?.classList.toggle('active', on);
    for (const cb of this.sustainListeners) cb(on);
  }

  /** Fired when the sustain pedal (Ctrl) is pressed or released. */
  onSustainChange(cb: SustainListener): void {
    this.sustainListeners.push(cb);
  }

  render(): void {
    const { keys, totalWidth } = buildLayout();
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${WHITE_KEY_HEIGHT}`);
    svg.setAttribute('width', String(totalWidth));
    svg.setAttribute('height', String(WHITE_KEY_HEIGHT));
    svg.style.touchAction = 'none';
    svg.style.userSelect = 'none';

    // White keys first, so black keys visually stack on top and win hit-testing.
    for (const key of keys.filter((k) => !k.black)) {
      svg.appendChild(this.buildKeyGroup(key));
    }
    for (const key of keys.filter((k) => k.black)) {
      svg.appendChild(this.buildKeyGroup(key));
    }

    const indicator = document.createElement('p');
    indicator.className = 'sustain-indicator';
    indicator.textContent = 'サスティン中（Ctrl）';
    this.sustainIndicator = indicator;

    this.container.replaceChildren(svg, indicator);
  }

  private buildKeyGroup(key: KeyLayout): SVGGElement {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', key.black ? 'key key-black' : 'key key-white');
    g.setAttribute('role', 'button');
    g.setAttribute('tabindex', '0');
    g.setAttribute('aria-label', midiToNameJa(key.midi));
    g.style.cursor = 'pointer';

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(key.x));
    rect.setAttribute('y', '0');
    rect.setAttribute('width', String(key.width));
    rect.setAttribute('height', String(key.height));
    rect.setAttribute('rx', '2');
    rect.setAttribute('fill', key.black ? 'var(--color-key-black)' : 'var(--color-key-white)');
    rect.setAttribute('stroke', 'var(--color-key-border)');
    rect.setAttribute('stroke-width', '1');
    g.appendChild(rect);
    this.keyElements.set(key.midi, rect);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(key.x + key.width / 2));
    label.setAttribute('y', String(key.height - 8));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '9');
    label.setAttribute('fill', key.black ? 'var(--color-key-white)' : 'var(--color-key-black)');
    label.setAttribute('pointer-events', 'none');
    label.style.display = this.showNoteNames ? '' : 'none';
    label.textContent = midiToNameJa(key.midi);
    g.appendChild(label);
    this.labelElements.set(key.midi, label);

    this.wireKeyEvents(g, key.midi);
    return g;
  }

  private wireKeyEvents(g: SVGGElement, midi: number): void {
    const press = (ev: PointerEvent) => {
      ev.preventDefault();
      (ev.target as Element).setPointerCapture?.(ev.pointerId);
      this.press(midi);
    };
    const release = () => this.release(midi);

    g.addEventListener('pointerdown', press);
    g.addEventListener('pointerup', release);
    g.addEventListener('pointerleave', release);
    g.addEventListener('pointercancel', release);

    g.addEventListener('keydown', (ev: KeyboardEvent) => {
      if ((ev.key === ' ' || ev.key === 'Enter') && !this.pressedMidis.has(midi)) {
        ev.preventDefault();
        this.press(midi);
      }
    });
    g.addEventListener('keyup', (ev: KeyboardEvent) => {
      if (ev.key === ' ' || ev.key === 'Enter') {
        ev.preventDefault();
        this.release(midi);
      }
    });
  }

  private press(midi: number): void {
    if (this.pressedMidis.has(midi)) return;
    this.pressedMidis.add(midi);
    this.updateKeyVisual(midi);
    for (const cb of this.listeners.press) cb(midi);
  }

  private release(midi: number): void {
    if (!this.pressedMidis.has(midi)) return;
    this.pressedMidis.delete(midi);
    this.updateKeyVisual(midi);
    for (const cb of this.listeners.release) cb(midi);
  }

  on(event: KeyEventName, cb: KeyListener): void {
    this.listeners[event].push(cb);
  }

  /** Highlight specific keys (e.g. the revealed answer's onset notes). */
  highlight(midis: number[]): void {
    for (const midi of this.highlightedMidis) {
      this.highlightedMidis.delete(midi);
      this.updateKeyVisual(midi);
    }
    for (const midi of midis) {
      this.highlightedMidis.add(midi);
      this.updateKeyVisual(midi);
    }
  }

  setShowNoteNames(show: boolean): void {
    this.showNoteNames = show;
    for (const label of this.labelElements.values()) {
      label.style.display = show ? '' : 'none';
    }
  }

  private updateKeyVisual(midi: number): void {
    const rect = this.keyElements.get(midi);
    if (!rect) return;
    const black = isBlackKey(midi);
    const pressed = this.pressedMidis.has(midi);
    const highlighted = this.highlightedMidis.has(midi);
    if (pressed || highlighted) {
      rect.setAttribute('fill', 'var(--color-key-highlight)');
    } else {
      rect.setAttribute('fill', black ? 'var(--color-key-black)' : 'var(--color-key-white)');
    }
  }
}
