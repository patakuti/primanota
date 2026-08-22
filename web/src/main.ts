import './styles.css';
import type { PiecesDataset } from './types.ts';
import piecesData from './data/pieces.json';
import { noteOff, noteOn, playOnset, resume, setSustain, stopAll } from './audio/synth.ts';
import { Keyboard } from './ui/keyboard.ts';
import { QuizController } from './ui/quiz.ts';
import * as answer from './ui/answer.ts';

const KEYBOARD_CLICK_VELOCITY = 90;
const SEEK_STEP_MS = 5000;

// Global one-key shortcuts (追加要求9フォローアップ: roving tabindexにしても
// Tabで各操作に辿り着く必要があること自体が不便という指摘を受けて追加)。
// QWERTY演奏（a/w/s/...）・オクターブシフト（z/x）・サスティン（Ctrl）と
// キーが重複しないよう、数字と `,`/`.` だけを使う。
const SHORTCUT_KEYS = {
  playOnset: '1',
  reveal: '2',
  next: '9', // deliberately far from 1/2 -- "next piece" discards the current one, so a
  // mis-hit while reaching for 1/2 shouldn't be able to trigger it
  togglePlayback: '4',
  seekBack: ',',
  seekForward: '.',
} as const;

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
  const playbackPlayBtn = document.getElementById('playback-play-btn') as HTMLButtonElement | null;
  const playbackStopBtn = document.getElementById('playback-stop-btn') as HTMLButtonElement | null;
  const playbackSeek = document.getElementById('playback-seek') as HTMLInputElement | null;
  const playbackTime = document.getElementById('playback-time');
  if (answerDetails && scoreDisplay && playbackPlayBtn && playbackStopBtn && playbackSeek && playbackTime) {
    answer.init(answerDetails, scoreDisplay, {
      playBtn: playbackPlayBtn,
      stopBtn: playbackStopBtn,
      seek: playbackSeek,
      time: playbackTime,
    });
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

  function revealAnswer(): void {
    quiz.reveal();
  }

  function goToNextPiece(): void {
    stopAll();
    quiz.next();
  }

  document.getElementById('play-onset-btn')?.addEventListener('click', playCurrentOnset);
  document.getElementById('reveal-answer-btn')?.addEventListener('click', revealAnswer);
  document.getElementById('next-piece-btn')?.addEventListener('click', goToNextPiece);

  quiz.onChange(renderQuizState);
  renderQuizState();

  document.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    switch (ev.key) {
      case SHORTCUT_KEYS.playOnset:
        void playCurrentOnset();
        break;
      case SHORTCUT_KEYS.reveal:
        revealAnswer();
        break;
      case SHORTCUT_KEYS.next:
        goToNextPiece();
        break;
      case SHORTCUT_KEYS.togglePlayback:
        answer.togglePlayback();
        break;
      case SHORTCUT_KEYS.seekBack:
        answer.seekPlaybackBy(-SEEK_STEP_MS);
        break;
      case SHORTCUT_KEYS.seekForward:
        answer.seekPlaybackBy(SEEK_STEP_MS);
        break;
    }
  });

  if (keyboard) {
    keyboard.on('press', async (midi) => {
      await resume();
      noteOn(midi, KEYBOARD_CLICK_VELOCITY);
    });
    keyboard.on('release', (midi) => {
      noteOff(midi);
    });
    keyboard.onSustainChange(setSustain);

    const showNamesCheckbox = document.getElementById('show-note-names') as HTMLInputElement | null;
    showNamesCheckbox?.addEventListener('change', () => {
      keyboard.setShowNoteNames(showNamesCheckbox.checked);
    });
  }
}

bootstrap();
