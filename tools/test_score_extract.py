"""Unit tests for score_extract.py's tie marking (02_design.md 3.6).

Only covers the tiedToNext behavior added for split-duration notes -- not a
general test suite for the rest of _measure_events (rests, tuplets), which
predates this and has no existing coverage to extend here.
"""
from midi_events import Note
from score_extract import _measure_events, _quantize_duration

TICKS_PER_BEAT = 480


def note(midi: int, start_beat: float, end_beat: float) -> Note:
    return Note(
        track=0,
        channel=0,
        midi=midi,
        velocity=80,
        start_sec=0.0,
        end_sec=0.0,
        start_tick=round(start_beat * TICKS_PER_BEAT),
        end_tick=round(end_beat * TICKS_PER_BEAT),
    )


def test_quantize_duration_splits_non_standard_length():
    # 4.5 beats has no single VexFlow token; must decompose into >1 tokens.
    assert _quantize_duration(4.5) == ["w", "8"]


def test_quantize_duration_standard_length_is_one_token():
    assert _quantize_duration(2.0) == ["h"]


def test_measure_events_ties_split_note_but_not_its_neighbors():
    # One held note spanning 4.5 beats (0..4.5), like the Appassionata's
    # opening F3, followed immediately by a separate quarter-note attack.
    groups = [
        [note(65, 0.0, 4.5)],  # F4, held 4.5 beats -> splits into w + 8
        [note(68, 4.5, 5.5)],  # G#4/Ab4, a distinct 1-beat attack right after
    ]
    measure_end_tick = round(5.5 * TICKS_PER_BEAT)  # exactly fills the measure, no trailing rest
    events = _measure_events(groups, 0, measure_end_tick, TICKS_PER_BEAT, None, "b/4", 3)

    durations = [(e["keys"], e["duration"], e.get("tiedToNext", False)) for e in events]
    assert durations == [
        (["f/4"], "w", True),
        (["f/4"], "8", False),
        (["g#/4"], "q", False),  # no key given -> default sharp spelling (notenames.py)
    ]


def test_measure_events_no_tie_for_standard_duration_note():
    # _measure_events derives duration from the gap to the next onset (or
    # measure end), not the Note's own end_tick -- so a single group filling
    # exactly to the measure boundary is what determines the "h" (half note).
    groups = [[note(60, 0.0, 2.0)]]  # C4
    measure_end_tick = round(2.0 * TICKS_PER_BEAT)
    events = _measure_events(groups, 0, measure_end_tick, TICKS_PER_BEAT, None, "b/4", 3)

    assert events[0] == {"keys": ["c/4"], "duration": "h"}
    assert "tiedToNext" not in events[0]
