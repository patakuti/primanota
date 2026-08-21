"""MIDI note number -> note name conversion (English / Japanese / solfège).

Design: 02_design.md, section 3.5.
Octave numbering: middle C = C4 = MIDI 60.
"""
from __future__ import annotations

# Pitch classes 0..11, spelled with sharps and with flats.
SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

# Japanese note names (半音含む), matched index-for-index with the above.
JA_SHARP_NAMES = ["ハ", "嬰ハ", "ニ", "嬰ニ", "ホ", "ヘ", "嬰ヘ", "ト", "嬰ト", "イ", "嬰イ", "ロ"]
JA_FLAT_NAMES = ["ハ", "変ニ", "ニ", "変ホ", "ホ", "ヘ", "変ト", "ト", "変イ", "イ", "変ロ", "ロ"]

SOLFEGE_SHARP = ["ド", "ド♯", "レ", "レ♯", "ミ", "ファ", "ファ♯", "ソ", "ソ♯", "ラ", "ラ♯", "シ"]
SOLFEGE_FLAT = ["ド", "レ♭", "レ", "ミ♭", "ミ", "ファ", "ソ♭", "ソ", "ラ♭", "ラ", "シ♭", "シ"]

# Keys whose diatonic spelling uses flats. Keys not listed here use sharps.
# Format: lowercase = minor, uppercase (first letter) = major, matching
# tools/catalog.yaml's `key` convention (e.g. "Db" major, "c" minor).
FLAT_KEYS = {
    "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb",  # major
    "d", "g", "c", "f", "bb", "eb", "ab",  # minor
}


def uses_flats(key: str | None) -> bool:
    """Whether the given key (as in catalog.yaml) is conventionally spelled with flats."""
    if key is None:
        return False
    return key in FLAT_KEYS


def midi_to_octave(midi: int) -> int:
    """Octave number with middle C (MIDI 60) = C4."""
    return midi // 12 - 1


def midi_to_name_en(midi: int, key: str | None = None) -> str:
    """English note name + octave, e.g. 63 -> 'Eb4' or 'D#4' depending on key."""
    pc = midi % 12
    names = FLAT_NAMES if uses_flats(key) else SHARP_NAMES
    return f"{names[pc]}{midi_to_octave(midi)}"


def midi_to_name_ja(midi: int, key: str | None = None) -> str:
    """Japanese note name (no octave), e.g. 63 -> '変ホ' or '嬰ニ' depending on key."""
    pc = midi % 12
    names = JA_FLAT_NAMES if uses_flats(key) else JA_SHARP_NAMES
    return names[pc]


def midi_to_solfege(midi: int, key: str | None = None) -> str:
    """Fixed-do solfège syllable (no octave), e.g. 63 -> 'ミ♭' or 'レ♯'."""
    pc = midi % 12
    names = SOLFEGE_FLAT if uses_flats(key) else SOLFEGE_SHARP
    return names[pc]


def midi_to_vexflow_key(midi: int, key: str | None = None) -> str:
    """VexFlow StaveNote key format, e.g. 63 -> 'eb/4' or 'd#/4'."""
    pc = midi % 12
    names = FLAT_NAMES if uses_flats(key) else SHARP_NAMES
    letter = names[pc].lower().replace("#", "#")  # keep '#' as-is; VexFlow accepts 'd#/4'
    return f"{letter}/{midi_to_octave(midi)}"


def note_names(midi: int, key: str | None = None) -> dict:
    """All three display forms for a single MIDI note, ready for pieces.json."""
    return {
        "en": midi_to_name_en(midi, key),
        "ja": midi_to_name_ja(midi, key),
        "solfege": midi_to_solfege(midi, key),
    }
