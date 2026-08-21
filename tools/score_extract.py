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

# Tuplet support. A run of N consecutive same-voice onsets, evenly spaced at
# a gap that does NOT match any standard binary duration, is a tuplet
# (e.g. triplet eighths: 3 notes filling the time of 2 eighths). numNotes ->
# notesOccupied follows standard notation convention (VexFlow's Tuplet
# options), except where a specific piece's published notation is known to
# use a different grouping for the same underlying gap -- see
# TUPLET_GROUP_SIZE_OVERRIDES.
TUPLET_NOTES_OCCUPIED: dict[int, int] = {3: 2, 5: 4, 6: 4, 7: 4, 9: 8}
TUPLET_GROUP_SIZE_DEFAULT = 3
# Schubert Impromptu D.899 No.3's accompaniment is published as sextuplets
# (6 notes per bracket), not two consecutive triplets, even though the two
# are durationally identical -- confirmed by the user (2026-08-22), not
# guessed from MIDI timing alone (timing can't distinguish the two).
TUPLET_GROUP_SIZE_OVERRIDES: dict[str, int] = {
    "schubert_impromptu_d899_no3": 6,
}
TUPLET_GAP_TOLERANCE_TICKS = 3
STANDARD_DURATION_TOLERANCE = 0.03  # fraction of the gap's own beat value


def _matches_standard_duration(beats: float) -> bool:
    for value, _ in DURATION_UNITS:
        if abs(beats - value) <= value * STANDARD_DURATION_TOLERANCE + 1e-9:
            return True
    return False


def _nearest_duration_token(beats: float) -> str | None:
    best = min(DURATION_UNITS, key=lambda vt: abs(vt[0] - beats))
    value, token = best
    if value <= 1e-9:
        return None
    return token


def _detect_tuplet(
    groups: list[list[Note]],
    start_idx: int,
    group_size: int,
    ticks_per_beat: int,
    measure_end_tick: int,
) -> tuple[str, int] | None:
    """Check whether `group_size` onsets starting at start_idx form a tuplet.

    Returns (duration_token, notes_occupied) if so, else None.
    """
    if start_idx + group_size > len(groups):
        return None
    notes_occupied = TUPLET_NOTES_OCCUPIED.get(group_size)
    if notes_occupied is None:
        return None

    gaps = []
    for i in range(start_idx, start_idx + group_size):
        onset = groups[i][0].start_tick
        next_onset = (
            groups[i + 1][0].start_tick if i + 1 < len(groups) else measure_end_tick
        )
        gaps.append(next_onset - onset)

    first_gap = gaps[0]
    if first_gap <= 0 or any(abs(g - first_gap) > TUPLET_GAP_TOLERANCE_TICKS for g in gaps):
        return None
    gap_beats = first_gap / ticks_per_beat
    if _matches_standard_duration(gap_beats):
        return None  # a plain fast passage, not a tuplet

    total_span_beats = (first_gap * group_size) / ticks_per_beat
    unit_beats = total_span_beats / notes_occupied
    if not _matches_standard_duration(unit_beats):
        return None  # doesn't cleanly resolve to a standard printed duration
    token = _nearest_duration_token(unit_beats)
    if token is None:
        return None
    return token, notes_occupied


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
    tuplet_group_size: int,
) -> list[dict]:
    """Build the {keys, duration} list for one staff in one measure."""
    events: list[dict] = []
    cursor = measure_start_tick
    in_measure = [
        g for g in groups
        if measure_start_tick <= g[0].start_tick < measure_end_tick
    ]
    candidate_sizes = sorted({tuplet_group_size, TUPLET_GROUP_SIZE_DEFAULT}, reverse=True)

    i = 0
    while i < len(in_measure):
        group = in_measure[i]
        onset = group[0].start_tick
        if onset > cursor:
            for token in _quantize_duration((onset - cursor) / ticks_per_beat):
                events.append({"keys": [rest_key], "duration": f"{token}r"})
            cursor = onset

        tuplet_match = None
        for size in candidate_sizes:
            tuplet_match = _detect_tuplet(in_measure, i, size, ticks_per_beat, measure_end_tick)
            if tuplet_match:
                tuplet_size = size
                break
        if tuplet_match:
            token, notes_occupied = tuplet_match
            for j in range(tuplet_size):
                g = in_measure[i + j]
                keys = sorted({midi_to_vexflow_key(n.midi, key) for n in g})
                events.append({
                    "keys": keys,
                    "duration": token,
                    "tuplet": {"numNotes": tuplet_size, "notesOccupied": notes_occupied},
                })
            last_onset = in_measure[i + tuplet_size - 1][0].start_tick
            next_onset = (
                in_measure[i + tuplet_size][0].start_tick
                if i + tuplet_size < len(in_measure) else measure_end_tick
            )
            cursor = min(next_onset, measure_end_tick)
            i += tuplet_size
            continue

        next_onset = in_measure[i + 1][0].start_tick if i + 1 < len(in_measure) else measure_end_tick
        dur_ticks = min(next_onset, measure_end_tick) - onset
        keys = sorted({midi_to_vexflow_key(n.midi, key) for n in group})
        durations = _quantize_duration(dur_ticks / ticks_per_beat) or ["q"]
        for token in durations:
            events.append({"keys": keys, "duration": token})
        cursor = onset + dur_ticks
        i += 1

    if cursor < measure_end_tick:
        for token in _quantize_duration((measure_end_tick - cursor) / ticks_per_beat):
            events.append({"keys": [rest_key], "duration": f"{token}r"})
    return events


def extract_score(mid: mido.MidiFile, key: str | None, piece_id: str | None = None) -> dict:
    num, den = extract_time_signature(mid)
    ticks_per_beat = mid.ticks_per_beat
    ticks_per_measure = int(ticks_per_beat * num * 4 / den)
    total_ticks = MEASURES_TO_EXTRACT * ticks_per_measure
    tuplet_group_size = TUPLET_GROUP_SIZE_OVERRIDES.get(piece_id, TUPLET_GROUP_SIZE_DEFAULT)

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
            "treble": _measure_events(treble_groups, m_start, m_end, ticks_per_beat, key, "b/4", tuplet_group_size),
            "bass": _measure_events(bass_groups, m_start, m_end, ticks_per_beat, key, "d/3", tuplet_group_size),
        })

    return {
        "keySignature": key_to_vexflow_signature(key),
        "timeSignature": f"{num}/{den}",
        "measures": measures,
        "trebleTracks": treble_tracks,
        "bassTracks": bass_tracks,
    }
