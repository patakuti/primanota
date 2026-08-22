// Answer panel: composer/title/onset-note text + score rendering
// (02_design.md 4.1, 4.6).

import type { Piece } from '../types.ts';
import { renderScore } from '../score/render.ts';

let detailsEl: HTMLElement | null = null;
let scoreEl: HTMLElement | null = null;
let currentPiece: Piece | null = null;
let resizeObserver: ResizeObserver | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;

function rerenderScore(): void {
  if (currentPiece && scoreEl) {
    renderScore(scoreEl, currentPiece.score);
  }
}

function scheduleRerender(): void {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(rerenderScore, 150);
}

export function init(details: HTMLElement, score: HTMLElement): void {
  detailsEl = details;
  scoreEl = score;

  resizeObserver = new ResizeObserver(() => scheduleRerender());
  resizeObserver.observe(scoreEl);

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => rerenderScore());
}

export function show(piece: Piece): void {
  currentPiece = piece;
  if (detailsEl) {
    detailsEl.innerHTML = `
      <dt>冒頭の音</dt>
      <dd>${piece.onset.label.ja}（${piece.onset.label.en}） / ${piece.onset.label.solfege}</dd>
      <dt>作曲家</dt>
      <dd>${piece.composer.ja}<br>${piece.composer.en}</dd>
      <dt>曲名</dt>
      <dd>${piece.title.ja}<br>${piece.title.en}</dd>
    `;
  }
  rerenderScore();
}

export function hide(): void {
  currentPiece = null;
  if (scoreEl) {
    scoreEl.replaceChildren();
  }
}
