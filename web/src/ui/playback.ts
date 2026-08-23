// Full-piece MIDI playback for the revealed answer, and the 3-tier onset
// preview (02_design.md 4.8, 3.10, requirement 10).
//
// This project's own additive synth (audio/synth.ts, 4.3) is a handful of
// oscillators tuned for a keyboard tap; scheduling it note-by-note for an
// entire piece (an earlier version of this file did that) doesn't reproduce
// dynamics or the sustain pedal well enough to sound musical, and even for a
// single onset chord it now sounds noticeably different from the full-piece
// playback next to it. This instead uses a real SoundFont-based General MIDI
// synth (spessasynth_lib) for everything except keyboard taps, playing small
// derived MIDI files (tools/playback_extract.py, 3.9/3.10) that we re-encode
// ourselves -- piano-midi.de's original .mid files still aren't shipped, per
// this project's existing policy.
//
// The AudioContext/synth/SoundFont are expensive to set up (the SoundFont is
// ~32MB) so they're created once and shared across every PlaybackController
// instance *and* every onset preview; only the currently-loaded song is
// swapped via `loadNewSongList`.

import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib';

const WORKLET_URL = `${import.meta.env.BASE_URL}spessasynth_processor.min.js`;
const SOUNDFONT_URL = `${import.meta.env.BASE_URL}soundfonts/GeneralUser-GS.sf2`;

// spessasynth_lib exposes no master-volume API; the SoundFont's own reference
// level came out noticeably quieter than audio/synth.ts's keyboard/onset
// sound (which is deliberately boosted, see 4.3's loudness compensation), so
// boost the whole synth output with our own GainNode. Initial guess pending
// an ear check -- tune this value based on that, not by further reasoning.
const PLAYBACK_MASTER_GAIN = 1.8;

export interface PlaybackTick {
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
}

/** 'full' = the whole revealed piece; the others are the 3-tier onset preview (3.10). */
export type OnsetPreviewVariant = 'chord' | '0500' | '1000';

const PREVIEW_FILE_SUFFIX: Record<OnsetPreviewVariant, string> = {
  chord: 'chord',
  '0500': '0500',
  '1000': '1000',
};

type TickListener = (tick: PlaybackTick) => void;

let sharedContext: AudioContext | null = null;
let sharedSynth: WorkletSynthesizer | null = null;
let sharedSequencer: Sequencer | null = null;
let soundBankReady: Promise<void> | null = null;
let engineReady: Promise<Sequencer> | null = null;
// Key of whichever song (full piece or onset preview) is currently loaded into
// sharedSequencer, e.g. "chopin_op10_no12#full" or "chopin_op10_no12#chord".
// The full-piece PlaybackController and playOnsetPreview() below both compare
// against this to detect being superseded by the other.
let loadedSongKey: string | null = null;

/**
 * Load the AudioWorklet + SoundFont (~32MB) and build the shared Sequencer,
 * but never touch AudioContext.resume() -- unlike getSharedSequencer(), this
 * is safe to call without a user gesture (see preloadPlaybackEngine()).
 */
async function ensureEngineLoaded(): Promise<Sequencer> {
  sharedContext ??= new AudioContext();
  if (!sharedSynth) {
    await sharedContext.audioWorklet.addModule(WORKLET_URL);
    sharedSynth = new WorkletSynthesizer(sharedContext);

    const masterGain = sharedContext.createGain();
    masterGain.gain.value = PLAYBACK_MASTER_GAIN;
    // Safety limiter: PLAYBACK_MASTER_GAIN is a guess, not a measurement: if
    // it turns out too hot for some piece/soundfont combination, this softens
    // the peaks instead of letting them clip outright.
    const limiter = sharedContext.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    sharedSynth.connect(masterGain);
    masterGain.connect(limiter);
    limiter.connect(sharedContext.destination);
  }
  if (!soundBankReady) {
    soundBankReady = fetch(SOUNDFONT_URL)
      .then((res) => res.arrayBuffer())
      .then((buf) => sharedSynth!.soundBankManager.addSoundBank(buf, 'main'))
      .catch((err) => {
        soundBankReady = null; // let the next call retry the fetch instead of staying stuck on this rejection
        throw err;
      });
  }
  await soundBankReady;
  sharedSequencer ??= new Sequencer(sharedSynth, { skipToFirstNoteOn: false });
  return sharedSequencer;
}

/**
 * Kick off loading the sound engine in the background as soon as the app
 * starts, instead of waiting for the first preview click (main.ts calls this
 * at bootstrap). AudioContext.resume() still only happens later, from a user
 * gesture (getSharedSequencer(), below) -- this just hides the network
 * fetch/parse latency behind the time the user spends looking at the quiz.
 */
export function preloadPlaybackEngine(): Promise<void> {
  engineReady ??= ensureEngineLoaded().catch((err) => {
    engineReady = null; // let the next call (e.g. a click) retry from scratch
    throw err;
  });
  return engineReady.then(() => undefined);
}

async function getSharedSequencer(): Promise<Sequencer> {
  engineReady ??= ensureEngineLoaded().catch((err) => {
    engineReady = null;
    throw err;
  });
  const sequencer = await engineReady;
  if (sharedContext!.state === 'suspended') {
    await sharedContext!.resume();
  }
  return sequencer;
}

export class PlaybackController {
  private readonly songKey: string;
  private readonly fileUrl: string;
  private isPlaying = false;
  private disposed = false;
  private rafHandle: number | null = null;
  private tickListeners: TickListener[] = [];

  constructor(pieceId: string) {
    this.songKey = `${pieceId}#full`;
    this.fileUrl = `${import.meta.env.BASE_URL}playback/${pieceId}.mid`;
  }

  /**
   * Read live rather than cached: right after `loadNewSongList()` the MIDI
   * may not be fully parsed on the worklet thread yet, so a duration read
   * captured at that instant can be stale (0). Re-reading it each tick lets
   * the seek bar's range self-correct within a frame or two of play()
   * instead of getting stuck at 0 (which made seeking look broken).
   */
  get durationMs(): number {
    return loadedSongKey === this.songKey ? (sharedSequencer?.duration ?? 0) * 1000 : 0;
  }

  /** Loads this piece into the shared sequencer if it isn't already current. */
  private async ensureLoaded(): Promise<Sequencer> {
    const sequencer = await getSharedSequencer();
    if (loadedSongKey !== this.songKey) {
      const res = await fetch(this.fileUrl);
      const binary = await res.arrayBuffer();
      sequencer.loadNewSongList([{ binary, fileName: this.songKey }]);
      loadedSongKey = this.songKey;
    }
    return sequencer;
  }

  async play(): Promise<void> {
    const sequencer = await this.ensureLoaded();
    if (this.disposed || loadedSongKey !== this.songKey) return; // superseded while awaiting
    this.isPlaying = true;
    sequencer.play();
    this.startTicking(sequencer);
    this.emitTick(sequencer);
  }

  /** Halt playback in place (position is preserved; play() resumes from here). */
  stop(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.stopTicking();
    if (loadedSongKey === this.songKey) sharedSequencer?.pause();
    this.emitTick(sharedSequencer);
  }

  seek(ms: number): void {
    if (loadedSongKey !== this.songKey || !sharedSequencer) return;
    sharedSequencer.currentTime = ms / 1000;
    this.emitTick(sharedSequencer);
  }

  onTick(cb: TickListener): void {
    this.tickListeners.push(cb);
  }

  /** Stop and detach; call when the piece changes so nothing keeps ringing across pieces. */
  dispose(): void {
    this.disposed = true;
    this.stop();
    this.tickListeners = [];
  }

  private startTicking(sequencer: Sequencer): void {
    const tick = (): void => {
      if (!this.isPlaying || loadedSongKey !== this.songKey) return;
      this.emitTick(sequencer);
      if (sequencer.isFinished) {
        this.stop();
        return;
      }
      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  private stopTicking(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private emitTick(sequencer: Sequencer | null): void {
    const positionMs = loadedSongKey === this.songKey ? (sequencer?.currentTime ?? 0) * 1000 : 0;
    const tick: PlaybackTick = { positionMs, durationMs: this.durationMs, isPlaying: this.isPlaying };
    for (const cb of this.tickListeners) cb(tick);
  }
}

/**
 * Play one of the 3-tier onset-preview clips (3.10) for the quiz's opening
 * "listen" shortcuts (1/2/3). These are short, self-terminating derived MIDI
 * files (each already ends exactly where it should -- see
 * tools/playback_extract.py), so unlike PlaybackController there's no seek
 * bar/duration UI to drive and no need for a client-side stop timer.
 */
export async function playOnsetPreview(pieceId: string, variant: OnsetPreviewVariant): Promise<void> {
  const songKey = `${pieceId}#${variant}`;
  const sequencer = await getSharedSequencer();
  if (loadedSongKey !== songKey) {
    const res = await fetch(`${import.meta.env.BASE_URL}playback/${pieceId}_${PREVIEW_FILE_SUFFIX[variant]}.mid`);
    const binary = await res.arrayBuffer();
    sequencer.loadNewSongList([{ binary, fileName: songKey }]);
    loadedSongKey = songKey;
  }
  sequencer.currentTime = 0; // restart from the top even if this exact preview was already loaded
  sequencer.play();
}

/** Stops whatever is currently sounding through the shared sequencer (full-piece playback or an onset preview). */
export function stopSharedPlayback(): void {
  sharedSequencer?.pause();
}
