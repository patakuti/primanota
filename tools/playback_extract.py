"""Re-encode a piece's full performance (notes + sustain pedal + program
changes) into a small derived Standard MIDI File for answer-panel playback
(02_design.md 3.9, 4.8).

This project's own additive synth (audio/synth.ts, 4.3) can't reproduce pedal
or dynamics well enough for a whole piece to sound musical -- an earlier
implementation that scheduled it note-by-note was reported "unnatural" on
listen. Instead we feed a real SoundFont-based General MIDI synth
(spessasynth_lib) a real MIDI file. We still don't ship piano-midi.de's
original .mid files (per the project's existing policy): this writes our own
minimal re-encoding built purely from the note/CC/program-change data we
already extract, using a fixed tempo map (only the absolute timing of events
matters for audio playback, not preserving the original tempo curve).

Also normalizes per-piece loudness (measured across this 28-piece catalog:
the 90th-percentile "effective loudness" -- velocity scaled by each note's
active channel-volume/expression CCs -- ranges from ~38.6 to ~74.0, a ~1.9x
spread that made some pieces sound noticeably quieter on playback). This is
done primarily by scaling each channel's volume controller (CC7) rather than
note velocities, so a piece's internal dynamics (pp vs ff) stay intact and
only its overall level shifts -- except CC7 tops out at 127, so a channel
starting from the GM default (100) only has 1.27x of headroom that way; the
quietest pieces in this catalog need slightly more than that, so any leftover
gain beyond 1.27x is applied to note velocities too (see _compute_gains).
"""
from __future__ import annotations

import mido

from midi_events import extract_channel_messages

TICKS_PER_BEAT = 480
MICROSECONDS_PER_BEAT = 500_000  # fixed 120 BPM; used only to re-encode our own extracted absolute timings back to ticks

# General MIDI defaults used when a channel never sends an explicit CC7/CC11.
DEFAULT_CHANNEL_VOLUME = 100
DEFAULT_EXPRESSION = 127

# Loudness normalization target and clamp, calibrated against this catalog's
# measured 90th-percentile effective-loudness spread (~38.6-74.0, see above)
# rather than guessed: 60 sits mid-spread, and the catalog's actual min/max
# only need ~0.81x-1.55x correction to reach it, well inside this clamp.
TARGET_LOUDNESS = 60.0
MIN_GAIN = 0.5
MAX_GAIN = 2.5


def _seconds_to_ticks(sec: float) -> int:
    return round(sec * TICKS_PER_BEAT * 1_000_000 / MICROSECONDS_PER_BEAT)


def _effective_loudness_samples(
    events: list[tuple[float, mido.Message]], end_sec: float = float("inf")
) -> list[float]:
    """velocity * active CC7/127 * active CC11/127 for every note-on up to end_sec.

    CC7/CC11 state is tracked across *all* events up to end_sec (a channel's
    volume is usually set once near the start, possibly before end_sec but
    still in effect), while only note-ons at or before end_sec become samples.
    """
    channel_volume: dict[int, int] = {}
    expression: dict[int, int] = {}
    samples: list[float] = []
    for sec, msg in events:
        if sec > end_sec:
            break
        if msg.type == "control_change" and msg.control == 7:
            channel_volume[msg.channel] = msg.value
        elif msg.type == "control_change" and msg.control == 11:
            expression[msg.channel] = msg.value
        elif msg.type == "note_on" and msg.velocity > 0:
            vol = channel_volume.get(msg.channel, DEFAULT_CHANNEL_VOLUME)
            expr = expression.get(msg.channel, DEFAULT_EXPRESSION)
            samples.append(msg.velocity * (vol / 127) * (expr / 127))
    return samples


def _total_gain(samples: list[float]) -> float:
    """90th-percentile of samples mapped to the multiplier that would bring it to TARGET_LOUDNESS."""
    if not samples:
        return 1.0
    samples = sorted(samples)
    reference = samples[min(int(len(samples) * 0.90), len(samples) - 1)]
    if reference <= 0:
        return 1.0
    return max(MIN_GAIN, min(MAX_GAIN, TARGET_LOUDNESS / reference))


def _compute_gains(events: list[tuple[float, mido.Message]]) -> tuple[float, float]:
    """Returns (cc7_gain, velocity_gain) for the whole piece.

    As much of the total gain as fits is applied via CC7 (cc7_gain, capped at
    127/DEFAULT_CHANNEL_VOLUME since a channel starting at the GM default
    can't be pushed past 127) so a piece's internal dynamics (pp vs ff) stay
    intact; anything beyond that headroom is returned as velocity_gain instead.
    """
    total_gain = _total_gain(_effective_loudness_samples(events))
    max_cc7_gain = 127 / DEFAULT_CHANNEL_VOLUME
    cc7_gain = min(total_gain, max_cc7_gain)
    velocity_gain = total_gain / cc7_gain
    return cc7_gain, velocity_gain


def _scale_midi_value(value: int, gain: float) -> int:
    return max(1, min(127, round(value * gain)))


def extract_playback_midi(mid: mido.MidiFile) -> mido.MidiFile:
    events = extract_channel_messages(mid)
    cc7_gain, velocity_gain = _compute_gains(events)
    channels = sorted({msg.channel for _, msg in events if hasattr(msg, "channel")})

    out = mido.MidiFile(type=0, ticks_per_beat=TICKS_PER_BEAT)
    track = mido.MidiTrack()
    out.tracks.append(track)
    track.append(mido.MetaMessage("set_tempo", tempo=MICROSECONDS_PER_BEAT, time=0))
    # Seed every channel's volume up front so pieces that never send an
    # explicit CC7 (a few in this catalog have none at all) still get the
    # normalization; any real CC7 event encountered below then overrides it
    # (scaled the same way), so mid-piece volume automation is preserved.
    for channel in channels:
        track.append(
            mido.Message(
                "control_change",
                channel=channel,
                control=7,
                value=_scale_midi_value(DEFAULT_CHANNEL_VOLUME, cc7_gain),
                time=0,
            )
        )

    last_tick = 0
    for sec, msg in events:
        tick = _seconds_to_ticks(sec)
        delta = max(0, tick - last_tick)
        if msg.type == "control_change" and msg.control == 7:
            msg = msg.copy(value=_scale_midi_value(msg.value, cc7_gain))
        elif msg.type == "note_on" and msg.velocity > 0 and velocity_gain != 1.0:
            msg = msg.copy(velocity=_scale_midi_value(msg.velocity, velocity_gain))
        track.append(msg.copy(time=delta))
        last_tick = tick
    track.append(mido.MetaMessage("end_of_track", time=0))

    return out


# Onset-preview clips (02_design.md 3.10, added for the 3-tier "listen to the
# opening" feature). Unlike the whole-piece file above, these are short,
# self-contained snippets played through the same SoundFont synth
# (ui/playback.ts's playOnsetPreview), so there's no need to preserve
# within-piece dynamics via CC7 -- the whole gain is baked straight into
# note velocity.

ONSET_CHORD_RING_SEC = 6.0  # matches audio/synth.ts's DECAY_LOW_SEC (lowest-note decay time)
ONSET_CHORD_WINDOW_PAD_SEC = 0.05  # covers float rounding of a block chord's near-simultaneous notes


def extract_onset_chord_midi(mid: mido.MidiFile, t0_sec: float, onset_notes: list[dict]) -> mido.MidiFile:
    """Builds a tiny MIDI containing just the identified onset notes (pieces.json's
    onset.notes -- the same data used for keyboard highlighting), each held long
    enough to ring out naturally via the SoundFont's own release, rather than
    re-deriving "the opening" from the raw MIDI (which could disagree with what's
    actually shown/highlighted as the answer). Loudness is still measured from the
    real channel messages (so an explicit CC7/CC11 at the very start is honored),
    just windowed to only the onset's own notes -- offset by t0_sec (analyze_midi.py's
    `t0Sec`, the onset's own absolute position) since `onset_notes[].offsetMs` is
    relative to t0_sec, not to the raw file's start.
    """
    window_end = t0_sec + max((n["offsetMs"] for n in onset_notes), default=0.0) / 1000 + ONSET_CHORD_WINDOW_PAD_SEC
    gain = _total_gain(_effective_loudness_samples(extract_channel_messages(mid), window_end))

    out = mido.MidiFile(type=0, ticks_per_beat=TICKS_PER_BEAT)
    track = mido.MidiTrack()
    out.tracks.append(track)
    track.append(mido.MetaMessage("set_tempo", tempo=MICROSECONDS_PER_BEAT, time=0))
    track.append(mido.Message("program_change", channel=0, program=0, time=0))  # Acoustic Grand Piano

    note_events: list[tuple[int, mido.Message]] = []
    for n in onset_notes:
        on_sec = n["offsetMs"] / 1000
        velocity = _scale_midi_value(n["velocity"], gain)
        note_events.append((_seconds_to_ticks(on_sec), mido.Message("note_on", channel=0, note=n["midi"], velocity=velocity, time=0)))
        note_events.append((_seconds_to_ticks(on_sec + ONSET_CHORD_RING_SEC), mido.Message("note_off", channel=0, note=n["midi"], velocity=0, time=0)))
    note_events.sort(key=lambda e: e[0])

    last_tick = 0
    for tick, msg in note_events:
        track.append(msg.copy(time=max(0, tick - last_tick)))
        last_tick = tick
    track.append(mido.MetaMessage("end_of_track", time=0))

    return out


def extract_truncated_preview_midi(mid: mido.MidiFile, t0_sec: float, duration_sec: float) -> mido.MidiFile:
    """Builds a preview clip containing the first duration_sec of the real performance,
    starting from t0_sec (analyze_midi.py's `t0Sec`, the onset's own absolute position
    -- the same reference `onset_notes[].offsetMs` is relative to), not from the raw
    file's start. piano-midi.de recordings often have a second or more of leading
    silence before the actual first note (measured directly, not guessed: e.g.
    schumann_traumerei's first note lands at t0_sec=1.8s), so without this offset a
    short preview like "the first 0.5s" could consist entirely of that silence --
    confirmed to be exactly what was reported: pieces with t0_sec above a given
    duration played silently for that duration's preview, and only that duration's.

    Any note still sounding at t0_sec + duration_sec is force-stopped there (including
    releasing the sustain pedal, since a held pedal would otherwise keep it ringing past
    the cutoff) rather than left to trail off, since this is meant to be an exact
    "first N seconds (of real music)" preview.
    """
    # t0_sec is analyze_midi.py's rounded `t0Sec` (round(t0, 4)); the raw event at
    # that exact onset can land a hair *before* the rounded value (e.g. 1.628172s
    # rounds to 1.6282s), so a strict `sec < t0_sec` comparison could exclude the
    # onset note itself (confirmed: beethoven_appassionata_1's 0.5s preview came out
    # with zero notes this way). Compare against t0_sec - _T0_EPSILON_SEC instead.
    _T0_EPSILON_SEC = 0.005

    events = extract_channel_messages(mid)
    cutoff_sec = t0_sec + duration_sec
    gain = _total_gain(_effective_loudness_samples(events, cutoff_sec))
    channels = sorted({msg.channel for _, msg in events if hasattr(msg, "channel")})

    out = mido.MidiFile(type=0, ticks_per_beat=TICKS_PER_BEAT)
    track = mido.MidiTrack()
    out.tracks.append(track)
    track.append(mido.MetaMessage("set_tempo", tempo=MICROSECONDS_PER_BEAT, time=0))

    # Replay whatever program/CC state was set during the leading silence before
    # t0_sec, so the preview still starts with the right instrument/pedal/volume --
    # just without making the listener wait through the silence itself.
    program: dict[int, int] = {}
    cc_state: dict[tuple[int, int], int] = {}
    for sec, msg in events:
        if sec >= t0_sec - _T0_EPSILON_SEC:
            break
        if msg.type == "program_change":
            program[msg.channel] = msg.program
        elif msg.type == "control_change":
            cc_state[(msg.channel, msg.control)] = msg.value
    for channel, prog in program.items():
        track.append(mido.Message("program_change", channel=channel, program=prog, time=0))
    for (channel, control), value in cc_state.items():
        track.append(mido.Message("control_change", channel=channel, control=control, value=value, time=0))

    active_notes: set[tuple[int, int]] = set()
    last_tick = 0
    for sec, msg in events:
        if sec < t0_sec - _T0_EPSILON_SEC:
            continue
        if sec > cutoff_sec:
            break
        tick = _seconds_to_ticks(max(0.0, sec - t0_sec))
        delta = max(0, tick - last_tick)
        if msg.type == "note_on" and msg.velocity > 0:
            msg = msg.copy(velocity=_scale_midi_value(msg.velocity, gain))
            active_notes.add((msg.channel, msg.note))
        elif msg.type in ("note_on", "note_off"):
            active_notes.discard((msg.channel, msg.note))
        track.append(msg.copy(time=delta))
        last_tick = tick

    cutoff_tick = _seconds_to_ticks(duration_sec)
    delta = max(0, cutoff_tick - last_tick)
    for channel in channels:  # release the pedal first so the note_offs below actually silence notes
        track.append(mido.Message("control_change", channel=channel, control=64, value=0, time=delta))
        delta = 0
    for channel, note in sorted(active_notes):
        track.append(mido.Message("note_off", channel=channel, note=note, velocity=0, time=delta))
        delta = 0
    track.append(mido.MetaMessage("end_of_track", time=0))

    return out
