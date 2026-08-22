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


def _compute_gains(events: list[tuple[float, mido.Message]]) -> tuple[float, float]:
    """Returns (cc7_gain, velocity_gain).

    90th-percentile (velocity * active CC7/127 * active CC11/127) across all
    note-on events is mapped to a multiplier that would bring it to
    TARGET_LOUDNESS. As much of that multiplier as fits is applied via CC7
    (cc7_gain, capped at 127/DEFAULT_CHANNEL_VOLUME since a channel starting
    at the GM default can't be pushed past 127); anything beyond that
    headroom is returned as velocity_gain instead.
    """
    channel_volume: dict[int, int] = {}
    expression: dict[int, int] = {}
    samples: list[float] = []
    for _, msg in events:
        if msg.type == "control_change" and msg.control == 7:
            channel_volume[msg.channel] = msg.value
        elif msg.type == "control_change" and msg.control == 11:
            expression[msg.channel] = msg.value
        elif msg.type == "note_on" and msg.velocity > 0:
            vol = channel_volume.get(msg.channel, DEFAULT_CHANNEL_VOLUME)
            expr = expression.get(msg.channel, DEFAULT_EXPRESSION)
            samples.append(msg.velocity * (vol / 127) * (expr / 127))

    if not samples:
        return 1.0, 1.0
    samples.sort()
    reference = samples[min(int(len(samples) * 0.90), len(samples) - 1)]
    if reference <= 0:
        return 1.0, 1.0

    total_gain = max(MIN_GAIN, min(MAX_GAIN, TARGET_LOUDNESS / reference))
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
