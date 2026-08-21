"""Unit tests for notenames.py (02_design.md 6.4)."""
from notenames import (
    midi_to_name_en,
    midi_to_name_ja,
    midi_to_octave,
    midi_to_solfege,
    midi_to_vexflow_key,
    uses_flats,
)


def test_middle_c_is_c4():
    assert midi_to_octave(60) == 4
    assert midi_to_name_en(60) == "C4"


def test_octave_boundary_b_to_c():
    # B3 (59) and C4 (60) straddle the octave boundary.
    assert midi_to_name_en(59) == "B3"
    assert midi_to_name_en(60) == "C4"
    # Same boundary one octave down / up.
    assert midi_to_name_en(47) == "B2"
    assert midi_to_name_en(72) == "C5"


def test_default_sharp_spelling_without_key():
    assert midi_to_name_en(61) == "C#4"
    assert midi_to_name_ja(61) == "嬰ハ"
    assert midi_to_solfege(61) == "ド♯"


def test_flat_key_spelling():
    # Db major: MIDI 63 should spell as Eb, not D#.
    assert uses_flats("Db") is True
    assert midi_to_name_en(63, key="Db") == "Eb4"
    assert midi_to_name_ja(63, key="Db") == "変ホ"
    assert midi_to_solfege(63, key="Db") == "ミ♭"


def test_sharp_key_spelling():
    # E major: MIDI 63 should spell as D#, not Eb.
    assert uses_flats("E") is False
    assert midi_to_name_en(63, key="E") == "D#4"
    assert midi_to_name_ja(63, key="E") == "嬰ニ"


def test_minor_key_flat_spelling():
    # F minor (Appassionata): MIDI 65 (F) is natural either way; check a
    # pitch class that differs, e.g. Ab (MIDI 68) vs G# under sharp default.
    assert uses_flats("f") is True
    assert midi_to_name_en(68, key="f") == "Ab4"


def test_vexflow_key_format():
    assert midi_to_vexflow_key(60) == "c/4"
    assert midi_to_vexflow_key(63, key="Db") == "eb/4"
    assert midi_to_vexflow_key(63, key="E") == "d#/4"


def test_natural_pitch_class_unaffected_by_key():
    # C (pitch class 0) is spelled the same regardless of flat/sharp key.
    assert midi_to_name_en(60, key="Db") == "C4"
    assert midi_to_name_en(60, key="E") == "C4"
