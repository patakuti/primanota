// Full-piece MIDI playback for the revealed answer (02_design.md 4.8).
//
// This project's own additive synth (audio/synth.ts, 4.3) is a handful of
// oscillators tuned for a single onset note/chord; scheduling it note-by-note
// for an entire piece (an earlier version of this file did that) doesn't
// reproduce dynamics or the sustain pedal well enough to sound musical. This
// instead uses a real SoundFont-based General MIDI synth (spessasynth_lib)
// playing a small derived MIDI file (tools/playback_extract.py, 3.9) that we
// re-encode ourselves -- piano-midi.de's original .mid files still aren't
// shipped, per this project's existing policy.
//
// The AudioContext/synth/SoundFont are expensive to set up (the SoundFont is
// ~32MB) so they're created once and shared across every PlaybackController
// instance (one gets created per revealed piece); only the currently-loaded
// song is swapped via `loadNewSongList`.

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

type TickListener = (tick: PlaybackTick) => void;

let sharedContext: AudioContext | null = null;
let sharedSynth: WorkletSynthesizer | null = null;
let sharedSequencer: Sequencer | null = null;
let soundBankReady: Promise<void> | null = null;
let loadedPieceId: string | null = null;

async function getSharedSequencer(): Promise<Sequencer> {
  sharedContext ??= new AudioContext();
  if (sharedContext.state === 'suspended') {
    await sharedContext.resume();
  }
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
  soundBankReady ??= fetch(SOUNDFONT_URL)
    .then((res) => res.arrayBuffer())
    .then((buf) => sharedSynth!.soundBankManager.addSoundBank(buf, 'main'));
  await soundBankReady;
  sharedSequencer ??= new Sequencer(sharedSynth, { skipToFirstNoteOn: false });
  return sharedSequencer;
}

export class PlaybackController {
  private readonly pieceId: string;
  private isPlaying = false;
  private disposed = false;
  private rafHandle: number | null = null;
  private tickListeners: TickListener[] = [];

  constructor(pieceId: string) {
    this.pieceId = pieceId;
  }

  /**
   * Read live rather than cached: right after `loadNewSongList()` the MIDI
   * may not be fully parsed on the worklet thread yet, so a duration read
   * captured at that instant can be stale (0). Re-reading it each tick lets
   * the seek bar's range self-correct within a frame or two of play()
   * instead of getting stuck at 0 (which made seeking look broken).
   */
  get durationMs(): number {
    return loadedPieceId === this.pieceId ? (sharedSequencer?.duration ?? 0) * 1000 : 0;
  }

  /** Loads this piece into the shared sequencer if it isn't already current. */
  private async ensureLoaded(): Promise<Sequencer> {
    const sequencer = await getSharedSequencer();
    if (loadedPieceId !== this.pieceId) {
      const res = await fetch(`${import.meta.env.BASE_URL}playback/${this.pieceId}.mid`);
      const binary = await res.arrayBuffer();
      sequencer.loadNewSongList([{ binary, fileName: `${this.pieceId}.mid` }]);
      loadedPieceId = this.pieceId;
    }
    return sequencer;
  }

  async play(): Promise<void> {
    const sequencer = await this.ensureLoaded();
    if (this.disposed || loadedPieceId !== this.pieceId) return; // superseded while awaiting
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
    if (loadedPieceId === this.pieceId) sharedSequencer?.pause();
    this.emitTick(sharedSequencer);
  }

  seek(ms: number): void {
    if (loadedPieceId !== this.pieceId || !sharedSequencer) return;
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
      if (!this.isPlaying || loadedPieceId !== this.pieceId) return;
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
    const positionMs = loadedPieceId === this.pieceId ? (sequencer?.currentTime ?? 0) * 1000 : 0;
    const tick: PlaybackTick = { positionMs, durationMs: this.durationMs, isPlaying: this.isPlaying };
    for (const cb of this.tickListeners) cb(tick);
  }
}
