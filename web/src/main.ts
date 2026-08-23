import './styles.css';
import type { Piece, PiecesDataset, SetDefinition } from './types.ts';
import piecesData from './data/pieces.json';
import { noteOff, noteOn, resume, setSustain, stopAll } from './audio/synth.ts';
import { Keyboard } from './ui/keyboard.ts';
import { QuizController } from './ui/quiz.ts';
import * as answer from './ui/answer.ts';
import { playOnsetPreview, preloadPlaybackEngine, stopSharedPlayback, type OnsetPreviewVariant } from './ui/playback.ts';

const KEYBOARD_CLICK_VELOCITY = 90;
const SEEK_STEP_MS = 5000;
const ACTIVE_SET_STORAGE_KEY = 'primanota:activeSet';

/** Empty/unknown setId falls back to the full dataset (02_design.md 4.5). */
function poolForSet(dataset: PiecesDataset, setId: string | null): Piece[] {
  if (!setId || !dataset.sets.some((s) => s.id === setId)) return dataset.pieces;
  return dataset.pieces.filter((p) => p.sets.includes(setId));
}

function readStoredSetId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SET_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeSetId(setId: string | null): void {
  try {
    if (setId) {
      localStorage.setItem(ACTIVE_SET_STORAGE_KEY, setId);
    } else {
      localStorage.removeItem(ACTIVE_SET_STORAGE_KEY);
    }
  } catch {
    // Private browsing / storage disabled: the selection just won't persist.
  }
}

function populateSetSelect(select: HTMLSelectElement, dataset: PiecesDataset): void {
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = `All pieces (${dataset.pieces.length})`;
  select.appendChild(allOption);

  const appendGroup = (label: string, sets: SetDefinition[]): void => {
    if (sets.length === 0) return;
    const group = document.createElement('optgroup');
    group.label = label;
    for (const s of sets) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.pieceCount})`;
      group.appendChild(opt);
    }
    select.appendChild(group);
  };

  appendGroup('Featured', dataset.sets.filter((s) => s.kind === 'curated'));
  appendGroup('By composer', dataset.sets.filter((s) => s.kind === 'composer'));
}

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
    const { source, author, license, url, licenseUrl } = dataset.credit;
    creditEl.innerHTML = `MIDI: <a href="${url}" target="_blank" rel="noopener">${source}</a> (${author}) / <a href="${licenseUrl}" target="_blank" rel="noopener">${license}</a>`;
  }

  const setSelect = document.getElementById('set-select') as HTMLSelectElement | null;
  let activeSetId: string | null = null;
  if (setSelect) {
    populateSetSelect(setSelect, dataset);
    const stored = readStoredSetId();
    activeSetId = stored && dataset.sets.some((s) => s.id === stored) ? stored : null;
    setSelect.value = activeSetId ?? '';
  }

  const quiz = new QuizController(poolForSet(dataset, activeSetId));

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
      progressEl.textContent = `Question ${quiz.getQuestionNumber()} of ${quiz.getPieceCount()}`;
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

  setSelect?.addEventListener('change', () => {
    stopAll();
    stopSharedPlayback();
    activeSetId = setSelect.value || null;
    storeSetId(activeSetId);
    quiz.setPool(poolForSet(dataset, activeSetId));
    // A native <select> keeps focus after a change, so subsequent letter
    // keys (QWERTY note input, shortcut digits) would jump its own options
    // instead of reaching the global keydown handler below. Hand focus back
    // to the page so playing immediately after picking a set works.
    setSelect.blur();
  });

  document.getElementById('play-onset-chord-btn')?.addEventListener('click', () => void playCurrentOnsetPreview('chord'));
  document.getElementById('play-onset-0500-btn')?.addEventListener('click', () => void playCurrentOnsetPreview('0500'));
  document.getElementById('play-onset-1000-btn')?.addEventListener('click', () => void playCurrentOnsetPreview('1000'));
  document.getElementById('reveal-answer-btn')?.addEventListener('click', revealAnswer);
  document.getElementById('next-piece-btn')?.addEventListener('click', goToNextPiece);

  // Preload the sound engine (AudioWorklet + ~32MB SoundFont) as soon as the
  // app starts, instead of waiting for the first preview click, so the
  // network fetch/parse latency is mostly hidden behind quiz-reading time
  // (requirement 20). The preview buttons stay disabled + a status message
  // shown (see index.html) until this settles.
  const soundStatusEl = document.getElementById('sound-status');
  const onsetButtons = ['play-onset-chord-btn', 'play-onset-0500-btn', 'play-onset-1000-btn']
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement);
  preloadPlaybackEngine()
    .then(() => {
      for (const btn of onsetButtons) btn.disabled = false;
      if (soundStatusEl) soundStatusEl.hidden = true;
    })
    .catch((err: unknown) => {
      console.error('Failed to preload the sound engine', err);
      // Re-enable anyway: clicking calls playOnsetPreview(), which retries the load itself.
      for (const btn of onsetButtons) btn.disabled = false;
      if (soundStatusEl) soundStatusEl.textContent = 'Sound engine failed to load — press a preview button to retry.';
    });

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
