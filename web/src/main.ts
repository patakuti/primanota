import './styles.css';
import type { Piece, PiecesDataset } from './types.ts';
import piecesData from './data/pieces.json';
import { noteOff, noteOn, playOnset, resume } from './audio/synth.ts';
import { Keyboard } from './ui/keyboard.ts';

// NOTE: piece selection here is a temporary stand-in for M4/M5 testing
// only. The real shuffle-bag quiz flow (state machine, "次の問題") is built
// in M6 (02_design.md 4.5) and will replace this.
let currentPiece: Piece;

const KEYBOARD_CLICK_VELOCITY = 90;

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
    progressEl.textContent = `${dataset.pieces.length}曲を収録（M5テスト中: ${currentPiece.id}）`;
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

  const keyboardContainer = document.getElementById('keyboard');
  if (keyboardContainer) {
    const keyboard = new Keyboard(keyboardContainer);
    keyboard.render();

    keyboard.on('press', async (midi) => {
      await resume();
      noteOn(midi, KEYBOARD_CLICK_VELOCITY);
    });
    keyboard.on('release', (midi) => {
      noteOff(midi);
    });

    const showNamesCheckbox = document.getElementById('show-note-names') as HTMLInputElement | null;
    showNamesCheckbox?.addEventListener('change', () => {
      keyboard.setShowNoteNames(showNamesCheckbox.checked);
    });

    // Temporary M5 test hook: highlight the current piece's onset keys when
    // revealing the answer. Superseded by the real answer panel in M7.
    const revealBtn = document.getElementById('reveal-answer-btn');
    revealBtn?.addEventListener('click', () => {
      keyboard.highlight(currentPiece.onset.notes.map((n) => n.midi));
    });
  }
}

bootstrap();
