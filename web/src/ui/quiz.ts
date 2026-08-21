// Quiz progression: shuffle-bag piece selection + ready/revealed state
// machine (02_design.md 4.5). No history is persisted (reload resets).

import type { Piece } from '../types.ts';

export type QuizState = 'ready' | 'revealed';

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** A freshly shuffled bag, swapped so it doesn't start with `avoid` (prevents the same piece repeating right after a bag refill). */
function freshBag(pieces: Piece[], avoid?: Piece): Piece[] {
  const bag = shuffled(pieces);
  if (avoid && bag.length > 1 && bag[0]!.id === avoid.id) {
    [bag[0], bag[1]] = [bag[1]!, bag[0]!];
  }
  return bag;
}

export class QuizController {
  private readonly pieces: Piece[];
  private bag: Piece[];
  private current: Piece;
  private state: QuizState = 'ready';
  private questionNumber = 1;
  private listeners: Array<() => void> = [];

  constructor(pieces: Piece[]) {
    if (pieces.length === 0) {
      throw new Error('QuizController requires at least one piece');
    }
    this.pieces = pieces;
    this.bag = freshBag(pieces);
    this.current = this.bag.shift()!;
  }

  getCurrentPiece(): Piece {
    return this.current;
  }

  getState(): QuizState {
    return this.state;
  }

  getQuestionNumber(): number {
    return this.questionNumber;
  }

  /** Advance to the next piece and reset to the 'ready' state. */
  next(): void {
    if (this.bag.length === 0) {
      this.bag = freshBag(this.pieces, this.current);
    }
    this.current = this.bag.shift()!;
    this.state = 'ready';
    this.questionNumber++;
    this.notify();
  }

  /** Reveal the answer for the current piece. */
  reveal(): void {
    this.state = 'revealed';
    this.notify();
  }

  onChange(cb: () => void): void {
    this.listeners.push(cb);
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }
}
