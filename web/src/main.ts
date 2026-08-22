import './styles.css';
import type { PiecesDataset } from './types.ts';
import piecesData from './data/pieces.json';
import { noteOff, noteOn, resume, setSustain, stopAll } from './audio/synth.ts';
import { Keyboard } from './ui/keyboard.ts';
import { QuizController } from './ui/quiz.ts';
import * as answer from './ui/answer.ts';
import { playOnsetPreview, stopSharedPlayback, type OnsetPreviewVariant } from './ui/playback.ts';

const KEYBOARD_CLICK_VELOCITY = 90;
const SEEK_STEP_MS = 5000;

// Global one-key shortcuts (follow-up to requirement 9: even with roving
// tabindex, having to Tab to each control at all was flagged as inconvenient,
// so these were added). Only digits and `,`/`.` are used so they don't
// collide with QWERTY note input (a/w/s/...), the octave shift (z/x), or
// sustain (Ctrl). Requirement 10 split the onset preview into 3 tiers
// (1/2/3), which pushed reveal/playback down to 4/5.
const SHORTCUT_KEYS = {
  onsetChord: '1',
  onset0500: '2',
  onset1000: '3',
  reveal: '4',
  togglePlayback: '5',
  next: '9', // deliberately far from 1-5 -- "next piece" discards the current one, so a
  // mis-hit while reaching for those keys shouldn't be able to trigger it
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
      progressEl.textContent = `Question ${quiz.getQuestionNumber()} of ${dataset.pieces.length}`;
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

  async function playCurrentOnsetPreview(variant: OnsetPreviewVariant): Promise<void> {
    await playOnsetPreview(quiz.getCurrentPiece().id, variant);
  }

  function revealAnswer(): void {
    stopSharedPlayback();
    quiz.reveal();
  }

  function goToNextPiece(): void {
    stopAll();
    stopSharedPlayback();
    quiz.next();
  }

  document.getElementById('play-onset-chord-btn')?.addEventListener('click', () => void playCurrentOnsetPreview('chord'));
  document.getElementById('play-onset-0500-btn')?.addEventListener('click', () => void playCurrentOnsetPreview('0500'));
  document.getElementById('play-onset-1000-btn')?.addEventListener('click', () => void playCurrentOnsetPreview('1000'));
  document.getElementById('reveal-answer-btn')?.addEventListener('click', revealAnswer);
  document.getElementById('next-piece-btn')?.addEventListener('click', goToNextPiece);

  quiz.onChange(renderQuizState);
  renderQuizState();

  document.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    switch (ev.key) {
      case SHORTCUT_KEYS.onsetChord:
        void playCurrentOnsetPreview('chord');
        break;
      case SHORTCUT_KEYS.onset0500:
        void playCurrentOnsetPreview('0500');
        break;
      case SHORTCUT_KEYS.onset1000:
        void playCurrentOnsetPreview('1000');
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
