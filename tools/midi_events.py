"""Shared low-level MIDI event extraction used by analyze_midi.py.

Converts each track's delta-time (ticks) events into absolute seconds,
honoring tempo changes wherever they occur (any track), and pairs
note-on/note-off events into discrete Note objects tagged with their
source track index (needed later for treble/bass separation in M2).
"""
from __future__ import annotations

from dataclasses import dataclass

import mido

DEFAULT_TEMPO = 500_000  # microseconds per quarter note (120 BPM), MIDI default


@dataclass
class Note:
    track: int
    channel: int
    midi: int
    velocity: int
    start_sec: float
    end_sec: float

    @property
    def duration_sec(self) -> float:
        return self.end_sec - self.start_sec


def _build_tempo_map(mid: mido.MidiFile) -> list[tuple[int, int]]:
    """Return sorted list of (abs_tick, tempo) from set_tempo events in any track."""
    events: list[tuple[int, int]] = []
    for track in mid.tracks:
        abs_tick = 0
        for msg in track:
            abs_tick += msg.time
            if msg.is_meta and msg.type == "set_tempo":
                events.append((abs_tick, msg.tempo))
    events.sort(key=lambda e: e[0])
    if not events or events[0][0] != 0:
        events.insert(0, (0, DEFAULT_TEMPO))
    return events


def _ticks_to_seconds(abs_tick: int, tempo_map: list[tuple[int, int]], ticks_per_beat: int) -> float:
    """Convert an absolute tick position to seconds, integrating tempo changes."""
    seconds = 0.0
    last_tick = 0
    last_tempo = tempo_map[0][1]
    for tick, tempo in tempo_map:
        if tick >= abs_tick:
            break
        seconds += mido.tick2second(tick - last_tick, ticks_per_beat, last_tempo)
        last_tick = tick
        last_tempo = tempo
    seconds += mido.tick2second(abs_tick - last_tick, ticks_per_beat, last_tempo)
    return seconds


def extract_notes(mid: mido.MidiFile) -> list[Note]:
    """All notes across all tracks, with absolute start/end times in seconds."""
    tempo_map = _build_tempo_map(mid)
    notes: list[Note] = []
    for track_idx, track in enumerate(mid.tracks):
        abs_tick = 0
        open_notes: dict[tuple[int, int], tuple[int, int, float]] = {}  # (channel, note) -> (velocity, tick, sec)
        for msg in track:
            abs_tick += msg.time
            if msg.type not in ("note_on", "note_off"):
                continue
            sec = _ticks_to_seconds(abs_tick, tempo_map, mid.ticks_per_beat)
            key = (msg.channel, msg.note)
            if msg.type == "note_on" and msg.velocity > 0:
                open_notes[key] = (msg.velocity, abs_tick, sec)
            else:
                # note_off, or note_on with velocity 0 (equivalent to note_off)
                opened = open_notes.pop(key, None)
                if opened is None:
                    continue  # note_off with no matching note_on; ignore
                velocity, _start_tick, start_sec = opened
                notes.append(
                    Note(
                        track=track_idx,
                        channel=msg.channel,
                        midi=msg.note,
                        velocity=velocity,
                        start_sec=start_sec,
                        end_sec=sec,
                    )
                )
    notes.sort(key=lambda n: n.start_sec)
    return notes


def extract_key_signature(mid: mido.MidiFile) -> str | None:
    """First key_signature meta event found in any track, e.g. 'C', 'Dbm', 'F#'."""
    for track in mid.tracks:
        for msg in track:
            if msg.is_meta and msg.type == "key_signature":
                return msg.key
    return None


def extract_time_signature(mid: mido.MidiFile) -> tuple[int, int]:
    """First time_signature meta event, defaulting to 4/4 if absent."""
    for track in mid.tracks:
        for msg in track:
            if msg.is_meta and msg.type == "time_signature":
                return (msg.numerator, msg.denominator)
    return (4, 4)
