// Answer panel: composer/title/onset-note text + score rendering
// (02_design.md 4.1, 4.6) + full-piece playback transport (4.8).

import type { Piece } from '../types.ts';
import { renderScore } from '../score/render.ts';
import { PlaybackController, type PlaybackTick } from './playback.ts';

export interface PlaybackElements {
  playBtn: HTMLButtonElement;
  stopBtn: HTMLButtonElement;
  seek: HTMLInputElement;
  time: HTMLElement;
}

let detailsEl: HTMLElement | null = null;
let scoreEl: HTMLElement | null = null;
let playbackEls: PlaybackElements | null = null;
let currentPiece: Piece | null = null;
let controller: PlaybackController | null = null;
let seeking = false;
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

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function renderTick(tick: PlaybackTick): void {
  if (!playbackEls) return;
  playbackEls.playBtn.disabled = tick.isPlaying;
  playbackEls.stopBtn.disabled = !tick.isPlaying;
  if (!seeking) {
    playbackEls.seek.max = String(tick.durationMs);
    playbackEls.seek.value = String(tick.positionMs);
    playbackEls.time.textContent = `${formatTime(tick.positionMs)} / ${formatTime(tick.durationMs)}`;
  }
}

export function init(details: HTMLElement, score: HTMLElement, playback: PlaybackElements): void {
  detailsEl = details;
  scoreEl = score;
  playbackEls = playback;

  resizeObserver = new ResizeObserver(() => scheduleRerender());
  resizeObserver.observe(scoreEl);

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => rerenderScore());

  playback.playBtn.addEventListener('click', () => {
    void controller?.play();
  });
  playback.stopBtn.addEventListener('click', () => {
    controller?.stop();
  });
  playback.seek.addEventListener('input', () => {
    seeking = true;
    playback.time.textContent = `${formatTime(Number(playback.seek.value))} / ${formatTime(controller?.durationMs ?? 0)}`;
  });
  playback.seek.addEventListener('change', () => {
    controller?.seek(Number(playback.seek.value));
    seeking = false;
  });
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

  controller?.dispose();
  controller = new PlaybackController(piece.id);
  controller.onTick(renderTick);
  renderTick({ positionMs: 0, durationMs: 0, isPlaying: false });
}

export function hide(): void {
  currentPiece = null;
  controller?.dispose();
  controller = null;
  if (scoreEl) {
    scoreEl.replaceChildren();
  }
}

/** For the global playback keyboard shortcuts (main.ts) -- no-op if nothing is revealed yet. */
export function togglePlayback(): void {
  if (!controller || !playbackEls) return;
  if (playbackEls.playBtn.disabled) {
    controller.stop();
  } else {
    void controller.play();
  }
}

/** For the global seek keyboard shortcuts (main.ts) -- no-op if nothing is revealed yet. */
export function seekPlaybackBy(deltaMs: number): void {
  if (!controller || !playbackEls) return;
  controller.seek(Number(playbackEls.seek.value) + deltaMs);
}
