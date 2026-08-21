import './styles.css';
import type { Piece, PiecesDataset } from './types.ts';
import piecesData from './data/pieces.json';
import { playOnset, resume } from './audio/synth.ts';

// NOTE: piece selection here is a temporary stand-in for M4 (audio) testing
// only. The real shuffle-bag quiz flow (state machine, "次の問題") is built
// in M6 (02_design.md 4.5) and will replace this.
let currentPiece: Piece;

function bootstrap(): void {
  const dataset = piecesData as PiecesDataset;
  console.log(`PrimaNota: loaded ${dataset.pieces.length} pieces (dataset v${dataset.version}, generated ${dataset.generatedAt})`);

  const creditEl = document.getElementById('credit');
  if (creditEl) {
    const { source, author, license, url } = dataset.credit;
    creditEl.innerHTML = `MIDI: <a href="${url}" target="_blank" rel="noopener">${source}</a> (${author}) / ${license}`;
  }

  currentPiece = dataset.pieces[Math.floor(Math.random() * dataset.pieces.length)]!;

  const progressEl = document.getElementById('quiz-progress');
  if (progressEl) {
    progressEl.textContent = `${dataset.pieces.length}曲を収録（M4テスト中: ${currentPiece.id}）`;
  }

  const playBtn = document.getElementById('play-onset-btn');
  const replayBtn = document.getElementById('replay-onset-btn');

  playBtn?.addEventListener('click', async () => {
    await resume();
    playOnset(currentPiece.onset.notes);
  });

  replayBtn?.addEventListener('click', async () => {
    await resume();
    playOnset(currentPiece.onset.notes);
  });
}

bootstrap();
