"""Extract the opening 2 measures as VexFlow-ready score data (02_design.md 3.6).

This is explicitly a rough-draft generator (design doc: "自動生成はたたき台").
Piano-roll -> notation is an inherently lossy, ambiguous transformation;
the goal here is a reasonable starting point that a human reviews and,
where needed, replaces via data/overrides.yaml's `score` section.

Track -> staff assignment uses piano-midi.de's consistent track naming
convention (measured, not assumed -- see tools/report.md): tracks named
"Piano right..." go to the treble staff, "Piano left..." to the bass staff.
"""
from __future__ import annotations

from dataclasses import dataclass

import mido

from midi_events import Note, extract_notes, extract_time_signature, extract_track_names
from notenames import key_to_vexflow_signature, midi_to_vexflow_key

MEASURES_TO_EXTRACT = 2

# (duration in quarter-note beats, VexFlow duration token)
DURATION_UNITS: list[tuple[float, str]] = [
    (4.0, "w"),
    (3.0, "hd"),
    (2.0, "h"),
    (1.5, "qd"),
    (1.0, "q"),
    (0.75, "8d"),
    (0.5, "8"),
    (0.375, "16d"),
    (0.25, "16"),
    (0.1875, "32d"),
    (0.125, "32"),
]
MIN_UNIT_BEATS = DURATION_UNITS[-1][0]
ONSET_GROUP_TOLERANCE_BEATS = 1 / 128  # jitter tolerance when grouping simultaneous notes


@dataclass
class ScoreExtractionWarning:
    measure: int
    staff: str
    message: str


def _quantize_duration(beats: float) -> list[str]:
    """Greedily decompose a duration (in quarter-note beats) into VexFlow tokens."""
    remaining = beats
    tokens: list[str] = []
    while remaining > MIN_UNIT_BEATS / 2:
        for value, token in DURATION_UNITS:
            if value <= remaining + 1e-6:
                tokens.append(token)
                remaining -= value
                break
        else:
            break  # smaller than our minimum grid; drop the remainder
    return tokens


def _classify_tracks(track_names: list[str | None]) -> tuple[list[int], list[int]]:
    treble, bass = [], []
    for i, name in enumerate(track_names):
        if not name:
            continue
        lower = name.strip().lower()
        if lower.startswith("piano right"):
            treble.append(i)
        elif lower.startswith("piano left"):
            bass.append(i)
    return treble, bass


def _group_onsets(notes: list[Note], ticks_per_beat: int) -> list[list[Note]]:
    """Group notes in one voice into chords by (near-)identical start tick."""
    notes = sorted(notes, key=lambda n: n.start_tick)
    tolerance_ticks = ONSET_GROUP_TOLERANCE_BEATS * ticks_per_beat
    groups: list[list[Note]] = []
    for n in notes:
        if groups and n.start_tick - groups[-1][0].start_tick <= tolerance_ticks:
            groups[-1].append(n)
        else:
            groups.append([n])
    return groups


def _measure_events(
    groups: list[list[Note]],
    measure_start_tick: int,
    measure_end_tick: int,
    ticks_per_beat: int,
    key: str | None,
    rest_key: str,
) -> list[dict]:
    """Build the {keys, duration} list for one staff in one measure."""
    events: list[dict] = []
    cursor = measure_start_tick
    in_measure = [
        g for g in groups
        if measure_start_tick <= g[0].start_tick < measure_end_tick
    ]
    for i, group in enumerate(in_measure):
        onset = group[0].start_tick
        if onset > cursor:
            for token in _quantize_duration((onset - cursor) / ticks_per_beat):
                events.append({"keys": [rest_key], "duration": f"{token}r"})
        next_onset = in_measure[i + 1][0].start_tick if i + 1 < len(in_measure) else measure_end_tick
        dur_ticks = min(next_onset, measure_end_tick) - onset
        keys = sorted({midi_to_vexflow_key(n.midi, key) for n in group})
        durations = _quantize_duration(dur_ticks / ticks_per_beat) or ["q"]
        for token in durations:
            events.append({"keys": keys, "duration": token})
        cursor = onset + dur_ticks
    if cursor < measure_end_tick:
        for token in _quantize_duration((measure_end_tick - cursor) / ticks_per_beat):
            events.append({"keys": [rest_key], "duration": f"{token}r"})
    return events


def extract_score(mid: mido.MidiFile, key: str | None) -> dict:
    num, den = extract_time_signature(mid)
    ticks_per_beat = mid.ticks_per_beat
    ticks_per_measure = int(ticks_per_beat * num * 4 / den)
    total_ticks = MEASURES_TO_EXTRACT * ticks_per_measure

    track_names = extract_track_names(mid)
    treble_tracks, bass_tracks = _classify_tracks(track_names)

    all_notes = extract_notes(mid)
    treble_notes = [n for n in all_notes if n.track in treble_tracks and n.start_tick < total_ticks]
    bass_notes = [n for n in all_notes if n.track in bass_tracks and n.start_tick < total_ticks]

    treble_groups = _group_onsets(treble_notes, ticks_per_beat)
    bass_groups = _group_onsets(bass_notes, ticks_per_beat)

    measures = []
    for m in range(MEASURES_TO_EXTRACT):
        m_start = m * ticks_per_measure
        m_end = (m + 1) * ticks_per_measure
        measures.append({
            "treble": _measure_events(treble_groups, m_start, m_end, ticks_per_beat, key, rest_key="b/4"),
            "bass": _measure_events(bass_groups, m_start, m_end, ticks_per_beat, key, rest_key="d/3"),
        })

    return {
        "keySignature": key_to_vexflow_signature(key),
        "timeSignature": f"{num}/{den}",
        "measures": measures,
        "trebleTracks": treble_tracks,
        "bassTracks": bass_tracks,
    }
