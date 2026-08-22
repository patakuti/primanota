import './styles.css';
import type { PiecesDataset } from './types.ts';
import piecesData from './data/pieces.json';
import { noteOff, noteOn, playOnset, resume } from './audio/synth.ts';
import { Keyboard } from './ui/keyboard.ts';
import { QuizController } from './ui/quiz.ts';
import * as answer from './ui/answer.ts';

const KEYBOARD_CLICK_VELOCITY = 90;

function bootstrap(): void {
  const dataset = piecesData as PiecesDataset;
  console.log(`PrimaNota: loaded ${dataset.pieces.length} pieces (dataset v${dataset.version}, generated ${dataset.generatedAt})`);

  const creditEl = document.getElementById('credit');
  if (creditEl) {
    const { source, author, license, url } = dataset.credit;
    creditEl.innerHTML = `MIDI: <a href="${url}" target="_blank" rel="noopener">${source}</a> (${author}) / ${license}`;
  }

  const quiz = new QuizController(dataset.pieces);

  const progressEl = document.getElementById('quiz-progress');
  const answerPanel = document.getElementById('answer-panel');
  const answerDetails = document.getElementById('answer-details');
  const scoreDisplay = document.getElementById('score-display');
  if (answerDetails && scoreDisplay) {
    answer.init(answerDetails, scoreDisplay);
  }

  const keyboardContainer = document.getElementById('keyboard');
  const keyboard = keyboardContainer ? new Keyboard(keyboardContainer) : null;
  keyboard?.render();

  function renderQuizState(): void {
    if (progressEl) {
      progressEl.textContent = `第${quiz.getQuestionNumber()}問（全${dataset.pieces.length}曲）`;
    }
    const revealed = quiz.getState() === 'revealed';
    if (answerPanel) {
      answerPanel.hidden = !revealed;
    }
    const piece = quiz.getCurrentPiece();
    if (revealed) {
      answer.show(piece);
      keyboard?.highlight(piece.onset.notes.map((n) => n.midi));
    } else {
      answer.hide();
      keyboard?.highlight([]);
    }
  }

  async function playCurrentOnset(): Promise<void> {
    await resume();
    playOnset(quiz.getCurrentPiece().onset.notes);
  }

  document.getElementById('play-onset-btn')?.addEventListener('click', playCurrentOnset);
  document.getElementById('replay-onset-btn')?.addEventListener('click', playCurrentOnset);

  document.getElementById('reveal-answer-btn')?.addEventListener('click', () => {
    quiz.reveal();
  });

  document.getElementById('next-piece-btn')?.addEventListener('click', () => {
    quiz.next();
  });

  quiz.onChange(renderQuizState);
  renderQuizState();

  if (keyboard) {
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
  }
}

bootstrap();
