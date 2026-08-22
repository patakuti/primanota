// Simple additive-synthesis piano-ish voice (02_design.md 4.3).
// No sample assets: 4 oscillators per note (fundamental + 3 harmonics),
// a pitch-dependent decay envelope and lowpass filter.

import type { OnsetNote } from '../types.ts';

interface Voice {
  oscillators: OscillatorNode[];
  gain: GainNode;
  filter: BiquadFilterNode;
  /** AudioContext time the natural decay reaches silence and oscillators stop. */
  naturalEndAt: number;
}

const ATTACK_SEC = 0.005;
const RELEASE_SEC = 0.25; // used when a note is cut short (noteOff / retrigger)
const FINAL_FADE_SEC = 0.03; // short linear tail so the value reaches true 0, not just near it
const DECAY_LOW_SEC = 6.0; // decay time constant at the low end of the keyboard
const DECAY_HIGH_SEC = 1.2; // decay time constant at the high end of the keyboard
const DECAY_MIDI_LOW = 21; // A0
const DECAY_MIDI_HIGH = 108; // C8
const HARMONIC_GAINS = [1, 0.5, 0.28, 0.15]; // fundamental, 2nd, 3rd, 4th harmonic
const HARMONIC_WAVEFORMS: OscillatorType[] = ['triangle', 'sine', 'sine', 'sine'];
// Very low fundamentals (e.g. F1, ~44Hz) reproduce poorly on small speakers;
// boosting the harmonics further for the lowest notes lets the ear infer
// the pitch from the overtone series even when the fundamental itself is
// weak (the "missing fundamental" effect), rather than relying on the
// fundamental to carry the pitch on its own.
const LOW_NOTE_HARMONIC_BOOST_MIDI = 40; // roughly E2
const LOW_NOTE_HARMONIC_BOOST_MAX = 1.6;

// Rough equal-loudness compensation: low frequencies sound much quieter than
// midrange ones at the same linear amplitude, so boost bass notes (relative
// to middle C) rather than leaving raw velocity as the only gain factor.
const LOUDNESS_REFERENCE_FREQ = 261.6; // C4
const LOUDNESS_MAX_BOOST = 3.0;

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
const activeVoices = new Map<number, Voice>();

// Sustain pedal emulation (02_design.md 4.3): while engaged, a released note
// keeps ringing (natural decay continues) instead of being cut short; the
// set of such "damper-held" notes is released together when the pedal is
// lifted, mirroring a real piano's damper mechanism.
let sustainOn = false;
const sustainedMidis = new Set<number>();

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 1.0;
    // Safety limiter so louder per-note gain (below) doesn't clip when
    // several notes stack into a chord (up to ~7 in this dataset).
    const limiter = audioCtx.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    masterGain.connect(limiter);
    limiter.connect(audioCtx.destination);
  }
  return audioCtx;
}

/** Resume the AudioContext; must be called from a user-gesture handler. */
export async function resume(): Promise<void> {
  const ctx = getContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function decayTimeForMidi(midi: number): number {
  const t = (midi - DECAY_MIDI_LOW) / (DECAY_MIDI_HIGH - DECAY_MIDI_LOW);
  return lerp(DECAY_LOW_SEC, DECAY_HIGH_SEC, t);
}

function harmonicScaleForMidi(midi: number): number {
  // Higher notes get weaker harmonics (thinner, less buzzy at the top).
  const t = (midi - DECAY_MIDI_LOW) / (DECAY_MIDI_HIGH - DECAY_MIDI_LOW);
  const base = lerp(1, 0.3, t);
  if (midi >= LOW_NOTE_HARMONIC_BOOST_MIDI) return base;
  const lowT = (LOW_NOTE_HARMONIC_BOOST_MIDI - midi) / (LOW_NOTE_HARMONIC_BOOST_MIDI - DECAY_MIDI_LOW);
  return lerp(base, LOW_NOTE_HARMONIC_BOOST_MAX, lowT);
}

function filterCutoffForFrequency(freq: number): number {
  return Math.min(12000, Math.max(2000, freq * 6));
}

function loudnessCompensation(freq: number): number {
  return Math.min(LOUDNESS_MAX_BOOST, Math.max(1, Math.sqrt(LOUDNESS_REFERENCE_FREQ / freq)));
}

/**
 * Schedule the note's *entire* lifecycle as AudioParam automation up front
 * (attack -> decay -> true silence), instead of using a JS-thread timer to
 * trigger a later stop. A `setTimeout`-driven stop races against the audio
 * thread's sample-accurate clock and can land mid-ramp, producing an
 * audible click; scheduling everything on the AudioParam itself avoids
 * that entirely.
 */
function scheduleDecayEnvelope(
  gainParam: AudioParam,
  startAt: number,
  peak: number,
  decaySec: number,
): number {
  const sustainFloor = Math.max(0.0001, peak * 0.05);
  const decayEndAt = startAt + ATTACK_SEC + decaySec;
  const silentAt = decayEndAt + FINAL_FADE_SEC;

  gainParam.cancelScheduledValues(startAt);
  gainParam.setValueAtTime(0, startAt);
  gainParam.linearRampToValueAtTime(peak, startAt + ATTACK_SEC);
  gainParam.exponentialRampToValueAtTime(sustainFloor, decayEndAt);
  gainParam.linearRampToValueAtTime(0, silentAt); // guarantees true 0 (exponential ramps can't target it)

  return silentAt;
}

function stopVoiceEarly(voice: Voice, ctx: AudioContext, releaseSec: number): void {
  const now = ctx.currentTime;
  const currentValue = voice.gain.gain.value;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(currentValue, now);
  voice.gain.gain.linearRampToValueAtTime(0, now + releaseSec);
  for (const osc of voice.oscillators) {
    osc.stop(now + releaseSec + 0.02);
  }
}

/** Start a note (e.g. from a keyboard press, or a scheduled quiz onset). Re-triggering the same pitch cuts the prior voice short first. */
export function noteOn(midi: number, velocity: number, whenSec?: number): void {
  const ctx = getContext();
  const startAt = whenSec ?? ctx.currentTime;

  // A fresh press is a newly-held note, not a pedal-held one, even if this
  // pitch was previously left ringing by the sustain pedal.
  sustainedMidis.delete(midi);

  const existing = activeVoices.get(midi);
  if (existing) {
    stopVoiceEarly(existing, ctx, 0.03);
    activeVoices.delete(midi);
  }

  const freq = midiToFrequency(midi);
  const decaySec = decayTimeForMidi(midi);
  const harmonicScale = harmonicScaleForMidi(midi);
  const peak = 0.55 * (velocity / 127) * loudnessCompensation(freq);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterCutoffForFrequency(freq);

  const gain = ctx.createGain();
  const naturalEndAt = scheduleDecayEnvelope(gain.gain, startAt, peak, decaySec);

  filter.connect(gain);
  gain.connect(masterGain!);

  const oscillators: OscillatorNode[] = [];
  HARMONIC_WAVEFORMS.forEach((type, i) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq * (i + 1);

    const harmonicGain = ctx.createGain();
    const scale = i === 0 ? 1 : harmonicScale;
    harmonicGain.gain.value = HARMONIC_GAINS[i] * scale;

    osc.connect(harmonicGain);
    harmonicGain.connect(filter);
    osc.start(startAt);
    osc.stop(naturalEndAt + 0.02);
    oscillators.push(osc);
  });

  const voice: Voice = { oscillators, gain, filter, naturalEndAt };
  activeVoices.set(midi, voice);

  // Housekeeping only (drop the Map entry once the voice is done) -- not
  // used to schedule any audio, so timer jitter here can't cause a click.
  setTimeout(
    () => {
      if (activeVoices.get(midi) === voice) {
        activeVoices.delete(midi);
      }
    },
    Math.max(0, (naturalEndAt - ctx.currentTime) * 1000) + 50,
  );
}

/** Release a currently-sounding note early (e.g. from a keyboard release). */
export function noteOff(midi: number): void {
  if (sustainOn) {
    // Damper is up: let the note keep ringing until the pedal is released.
    sustainedMidis.add(midi);
    return;
  }
  const ctx = getContext();
  const voice = activeVoices.get(midi);
  if (!voice) return;
  stopVoiceEarly(voice, ctx, RELEASE_SEC);
  activeVoices.delete(midi);
}

/** Engage/release the sustain ("damper") pedal; see the note above `sustainOn`. */
export function setSustain(on: boolean): void {
  if (sustainOn === on) return;
  sustainOn = on;
  if (on) return;

  const ctx = getContext();
  for (const midi of sustainedMidis) {
    const voice = activeVoices.get(midi);
    if (voice) {
      stopVoiceEarly(voice, ctx, RELEASE_SEC);
      activeVoices.delete(midi);
    }
  }
  sustainedMidis.clear();
}

/** Immediately silence every currently-sounding note (e.g. stopping playback or switching pieces). */
export function stopAll(): void {
  const ctx = getContext();
  for (const [midi, voice] of activeVoices) {
    stopVoiceEarly(voice, ctx, 0.03);
    activeVoices.delete(midi);
  }
  sustainedMidis.clear();
}

/** Play a quiz piece's opening onset: a single note or a (possibly arpeggiated) chord. */
export function playOnset(notes: OnsetNote[]): void {
  const ctx = getContext();
  const now = ctx.currentTime;
  for (const note of notes) {
    noteOn(note.midi, note.velocity, now + note.offsetMs / 1000);
  }
}
