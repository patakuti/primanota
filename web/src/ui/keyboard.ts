// Interactive on-screen piano keyboard (02_design.md 4.4).
// Range: C3 (MIDI 48) - C6 (MIDI 84), fixed (see 02_design.md 4.4 for the
// rationale: 11/28 pieces have onset notes below C3, accepted as a known
// limitation rather than widening the keyboard).

import { isBlackKey, midiToNameEn } from '../util/notenames.ts';

const LOWEST_MIDI = 48; // C3
const HIGHEST_MIDI = 84; // C6

const WHITE_KEY_WIDTH = 32;
const WHITE_KEY_HEIGHT = 140;
const BLACK_KEY_WIDTH = 20;
const BLACK_KEY_HEIGHT = 90;

// QWERTY-to-piano mapping (02_design.md 4.4): a movable ~1-octave-plus-fourth
// window, like Ableton/GarageBand's computer-keyboard input, since the full
// 37-key C3-C6 range can't reasonably fit on a single row without colliding
// with Ctrl (sustain, M9) or browser shortcuts. Z/X shift the window's base
// note down/up by an octave to reach the rest of the range.
const QWERTY_SEMITONE_OFFSETS: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15,
};
const QWERTY_WINDOW_SEMITONES = 15; // highest offset in QWERTY_SEMITONE_OFFSETS
const DEFAULT_BASE_MIDI = 60; // C4
const MIN_BASE_MIDI = LOWEST_MIDI;
const MAX_BASE_MIDI = HIGHEST_MIDI - QWERTY_WINDOW_SEMITONES;

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
  private octaveIndicator: HTMLElement | null = null;
  private baseMidi = DEFAULT_BASE_MIDI;
  private keyGroups = new Map<number, SVGGElement>();
  /** Roving tabindex (WAI-ARIA pattern for widgets like this): only the
   * "current" key is a Tab stop, so Tab enters/exits the whole 37-key
   * keyboard in one step instead of 37; arrow keys move within it. Without
   * this, reaching the buttons after the keyboard required tabbing through
   * every key one at a time (reported as "can't operate the buttons"). */
  private focusableMidi = DEFAULT_BASE_MIDI;
  /** Physical QWERTY key -> the MIDI note it triggered, so a keyup releases
   * the right note even if the octave was shifted while the key was held. */
  private qwertyPressedKeys = new Map<string, number>();

  constructor(container: HTMLElement) {
    this.container = container;
    // Sustain ("damper pedal", 02_design.md 4.4) is a global modifier so it
    // works the same whether notes come from mouse clicks on the keyboard or
    // (M11) QWERTY-mapped key presses -- both funnel through this class.
    document.addEventListener('keydown', (ev) => this.handleGlobalKeyDown(ev));
    document.addEventListener('keyup', (ev) => this.handleGlobalKeyUp(ev));
    // If the window loses focus while Ctrl or a note key is held (e.g.
    // alt-tab), the keyup never arrives -- release everything defensively so
    // nothing can get stuck on.
    window.addEventListener('blur', () => {
      this.setSustainIndicator(false);
      for (const midi of [...this.pressedMidis]) this.release(midi);
      this.qwertyPressedKeys.clear();
    });
  }

  private handleGlobalKeyDown(ev: KeyboardEvent): void {
    if (ev.key === 'Control') {
      if (!ev.repeat) this.setSustainIndicator(true);
      return;
    }
    if (ev.repeat) return; // ignore OS auto-repeat so held keys don't re-trigger
    const key = ev.key.toLowerCase();
    if (key === 'z') {
      this.shiftOctave(-1);
      return;
    }
    if (key === 'x') {
      this.shiftOctave(1);
      return;
    }
    const offset = QWERTY_SEMITONE_OFFSETS[key];
    if (offset === undefined || this.qwertyPressedKeys.has(key)) return;
    const midi = this.baseMidi + offset;
    this.qwertyPressedKeys.set(key, midi);
    this.press(midi);
  }

  private handleGlobalKeyUp(ev: KeyboardEvent): void {
    if (ev.key === 'Control') {
      this.setSustainIndicator(false);
      return;
    }
    const key = ev.key.toLowerCase();
    const midi = this.qwertyPressedKeys.get(key);
    if (midi === undefined) return;
    this.qwertyPressedKeys.delete(key);
    this.release(midi);
  }

  private shiftOctave(direction: -1 | 1): void {
    this.baseMidi = Math.max(MIN_BASE_MIDI, Math.min(MAX_BASE_MIDI, this.baseMidi + direction * 12));
    if (this.octaveIndicator) {
      this.octaveIndicator.textContent = `Base: ${midiToNameEn(this.baseMidi)} (Z/X to change)`;
    }
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

    const sustainIndicator = document.createElement('p');
    sustainIndicator.className = 'sustain-indicator';
    sustainIndicator.textContent = 'Sustain (Ctrl)';
    this.sustainIndicator = sustainIndicator;

    const octaveIndicator = document.createElement('p');
    octaveIndicator.className = 'octave-indicator';
    octaveIndicator.textContent = `Base: ${midiToNameEn(this.baseMidi)} (Z/X to change)`;
    this.octaveIndicator = octaveIndicator;

    this.container.replaceChildren(svg, octaveIndicator, sustainIndicator);
  }

  private buildKeyGroup(key: KeyLayout): SVGGElement {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', key.black ? 'key key-black' : 'key key-white');
    g.setAttribute('role', 'button');
    g.setAttribute('tabindex', key.midi === this.focusableMidi ? '0' : '-1');
    g.setAttribute('aria-label', midiToNameEn(key.midi));
    g.style.cursor = 'pointer';
    this.keyGroups.set(key.midi, g);

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
    label.textContent = midiToNameEn(key.midi);
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

    g.addEventListener('focus', () => this.setFocusableMidi(midi));

    g.addEventListener('keydown', (ev: KeyboardEvent) => {
      if ((ev.key === ' ' || ev.key === 'Enter') && !this.pressedMidis.has(midi)) {
        ev.preventDefault();
        this.press(midi);
      } else if (ev.key === 'ArrowRight') {
        ev.preventDefault();
        this.focusAdjacentKey(1);
      } else if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        this.focusAdjacentKey(-1);
      }
    });
    g.addEventListener('keyup', (ev: KeyboardEvent) => {
      if (ev.key === ' ' || ev.key === 'Enter') {
        ev.preventDefault();
        this.release(midi);
      }
    });
  }

  /** Roving tabindex bookkeeping: exactly one key is ever a Tab stop. */
  private setFocusableMidi(midi: number): void {
    if (midi === this.focusableMidi) return;
    this.keyGroups.get(this.focusableMidi)?.setAttribute('tabindex', '-1');
    this.focusableMidi = midi;
    this.keyGroups.get(midi)?.setAttribute('tabindex', '0');
  }

  private focusAdjacentKey(direction: -1 | 1): void {
    const midi = Math.max(LOWEST_MIDI, Math.min(HIGHEST_MIDI, this.focusableMidi + direction));
    this.keyGroups.get(midi)?.focus();
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
