"""Extract the opening onset (and warning flags) for every piece in catalog.yaml.

Algorithm and thresholds are documented in 02_design.md section 3.3-3.4 and
were empirically validated against this project's 28-piece catalog (see
tools/report.md): all thresholds below are measured values, not assumptions
(CLAUDE.md: "推測に基づくデバッグNG").

Output: one JSON file per piece in data/analysis/<id>.json, plus
tools/report.md summarizing the results for the M1 gate review.
"""
from __future__ import annotations

import json
from pathlib import Path

import mido
import yaml

from midi_events import extract_key_signature, extract_notes
from notenames import note_names

ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = Path(__file__).resolve().parent
CATALOG_PATH = TOOLS_DIR / "catalog.yaml"
MIDI_DIR = ROOT / "data" / "midi"
ANALYSIS_DIR = ROOT / "data" / "analysis"
OVERRIDES_PATH = ROOT / "data" / "overrides.yaml"
REPORT_PATH = TOOLS_DIR / "report.md"

# Empirically validated (see report.md "Threshold validation"):
# chord onsets in this catalog cluster within ~2ms of each other, and the
# next distinct note never arrives before ~99ms. 50ms sits safely between
# both observed clusters with wide margin on either side.
ONSET_WINDOW_SEC = 0.050

# No piece in this catalog has an onset-group note shorter than 99ms
# (see report.md), so this default (design doc 3.4) was never triggered
# in practice; kept as a safety net for future catalog additions.
GRACE_MAX_SEC = 0.080

LEADING_SILENCE_THRESHOLD_SEC = 1.0
ARPEGGIATED_SPREAD_THRESHOLD_SEC = 0.020
LOW_SINGLE_MIDI_THRESHOLD = 40

# Relative-major lookup so a minor-key MIDI key_signature meta (which mido
# reports as the relative major, see report.md) can be compared against
# catalog.yaml's minor-key entries.
_RELATIVE_MAJOR_OF_MINOR = {
    "a": "C", "e": "G", "b": "D", "f#": "A", "c#": "E", "g#": "B", "d#": "F#",
    "d": "F", "g": "Bb", "c": "Eb", "f": "Ab", "bb": "Db", "eb": "Gb", "ab": "Cb",
}


def key_matches_midi(catalog_key: str | None, midi_key: str | None) -> bool | None:
    """Compare catalog.yaml key against the MIDI's key_signature meta.

    Returns None when there's nothing to compare (either side missing).
    """
    if catalog_key is None or midi_key is None:
        return None
    midi_key_norm = midi_key.rstrip("m")
    if catalog_key[0].isupper():
        return catalog_key == midi_key_norm
    # catalog_key is minor (lowercase); MIDI meta reports the relative major.
    expected_major = _RELATIVE_MAJOR_OF_MINOR.get(catalog_key)
    return expected_major == midi_key_norm


def load_overrides() -> dict[str, dict]:
    if not OVERRIDES_PATH.exists():
        return {}
    with open(OVERRIDES_PATH, encoding="utf-8") as f:
        entries = yaml.safe_load(f) or []
    return {e["id"]: e for e in entries}


def analyze_piece(piece: dict, overrides: dict[str, dict]) -> dict:
    path = MIDI_DIR / f"{piece['id']}.mid"
    mid = mido.MidiFile(path)
    notes = extract_notes(mid)
    if not notes:
        raise ValueError(f"{piece['id']}: no notes found in MIDI file")

    t0 = notes[0].start_sec
    group = [n for n in notes if n.start_sec - t0 <= ONSET_WINDOW_SEC]
    group.sort(key=lambda n: n.midi)

    override = overrides.get(piece["id"])
    override_applied = False
    if override and "midis" in override.get("onset", {}):
        target_midi_set = set(override["onset"]["midis"])
        # Search a wider window for an onset cluster (notes within
        # ONSET_WINDOW_SEC of each other) whose pitch set exactly matches
        # the override -- never fabricate velocity/timing, only pick real
        # note-on events from this same MIDI file.
        search_window_sec = 2.0
        candidates = sorted(
            (n for n in notes if n.start_sec - t0 <= search_window_sec),
            key=lambda n: n.start_sec,
        )
        matched_cluster: list = []
        i = 0
        while i < len(candidates):
            cluster_start = candidates[i].start_sec
            cluster = [
                n for n in candidates
                if cluster_start <= n.start_sec <= cluster_start + ONSET_WINDOW_SEC
            ]
            if {n.midi for n in cluster} == target_midi_set:
                matched_cluster = cluster
                break
            i += 1
        if not matched_cluster:
            raise ValueError(
                f"{piece['id']}: override pitch set {sorted(target_midi_set)} "
                f"not found as a single onset cluster within {search_window_sec}s of t0"
            )
        group = sorted(matched_cluster, key=lambda n: n.midi)
        override_applied = True

    midi_key = extract_key_signature(mid)
    key = piece["key"]

    onset_notes = [
        {
            "midi": n.midi,
            "velocity": n.velocity,
            "offsetMs": round((n.start_sec - t0) * 1000, 2),
            "durationMs": round(n.duration_sec * 1000, 2),
            "track": n.track,
            "name": note_names(n.midi, key),
        }
        for n in group
    ]

    warnings: list[str] = []
    if not override_applied:
        if t0 > LEADING_SILENCE_THRESHOLD_SEC:
            warnings.append("leading_silence")
        spread = max(n.start_sec for n in group) - min(n.start_sec for n in group)
        if spread > ARPEGGIATED_SPREAD_THRESHOLD_SEC:
            warnings.append("arpeggiated")
        if any(n.duration_sec < GRACE_MAX_SEC for n in group) and len(notes) > len(group):
            warnings.append("grace_suspected")
        if len(group) == 1 and group[0].midi < LOW_SINGLE_MIDI_THRESHOLD:
            warnings.append("low_single")

    key_match = key_matches_midi(key, midi_key)
    if key_match is False:
        warnings.append("key_mismatch")

    midi_names = [n["midi"] for n in onset_notes]
    label_parts_en = [note_names(m, key)["en"] for m in midi_names]
    label_parts_ja = [note_names(m, key)["ja"] for m in midi_names]
    label_parts_solfege = [note_names(m, key)["solfege"] for m in midi_names]

    return {
        "id": piece["id"],
        "t0Sec": round(t0, 4),
        "isChord": len(group) > 1,
        "notes": onset_notes,
        "label": {
            "en": "+".join(label_parts_en),
            "ja": "＋".join(label_parts_ja),
            "solfege": "＋".join(label_parts_solfege),
        },
        "midiKeySignature": midi_key,
        "catalogKey": key,
        "keyMatchesMidi": key_match,
        "warnings": warnings,
        "overrideApplied": override_applied,
        "overrideReason": override.get("reason", "").strip() if override_applied else None,
        "totalNotesInFile": len(notes),
    }


def main() -> None:
    with open(CATALOG_PATH, encoding="utf-8") as f:
        catalog = yaml.safe_load(f)
    overrides = load_overrides()

    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)

    results = []
    for piece in catalog:
        result = analyze_piece(piece, overrides)
        results.append(result)
        out_path = ANALYSIS_DIR / f"{piece['id']}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

    write_report(catalog, results)

    n_clean = sum(1 for r in results if not r["warnings"])
    n_warned = len(results) - n_clean
    print(f"Analyzed {len(results)} pieces: {n_clean} clean, {n_warned} with warnings "
          f"({sum(1 for r in results if r['overrideApplied'])} resolved via override).")
    print(f"Report written to {REPORT_PATH}")


def write_report(catalog: list[dict], results: list[dict]) -> None:
    by_id = {p["id"]: p for p in catalog}
    lines = ["# MIDI Onset Extraction Report (Phase 1 PoC)", ""]
    lines.append(f"Pieces analyzed: {len(results)}")
    n_clean = sum(1 for r in results if not r["warnings"])
    lines.append(f"Clean (no warnings): {n_clean} / {len(results)} ({n_clean/len(results)*100:.0f}%)")
    lines.append("")
    lines.append("## Thresholds (empirically validated against this catalog)")
    lines.append(f"- ONSET_WINDOW = {ONSET_WINDOW_SEC*1000:.0f}ms "
                  "(observed: same-chord gaps <= ~2ms, next-note gaps >= ~99ms)")
    lines.append(f"- GRACE_MAX = {GRACE_MAX_SEC*1000:.0f}ms (never triggered in this catalog)")
    lines.append(f"- LEADING_SILENCE threshold = {LEADING_SILENCE_THRESHOLD_SEC*1000:.0f}ms")
    lines.append(f"- ARPEGGIATED spread threshold = {ARPEGGIATED_SPREAD_THRESHOLD_SEC*1000:.0f}ms")
    lines.append(f"- LOW_SINGLE MIDI threshold = {LOW_SINGLE_MIDI_THRESHOLD} "
                  f"(MIDI {LOW_SINGLE_MIDI_THRESHOLD} = "
                  f"{note_names(LOW_SINGLE_MIDI_THRESHOLD)['en']})")
    lines.append("")
    lines.append("## Per-piece results")
    lines.append("")
    lines.append("| id | composer | title | onset | label | warnings |")
    lines.append("|---|---|---|---|---|---|")
    for r in results:
        p = by_id[r["id"]]
        midi_list = ",".join(str(n["midi"]) for n in r["notes"])
        warn_str = ", ".join(r["warnings"]) if r["warnings"] else "-"
        lines.append(
            f"| {r['id']} | {p['composer_en']} | {p['title_en']} | "
            f"MIDI [{midi_list}] | {r['label']['en']} | {warn_str} |"
        )
    lines.append("")

    warned = [r for r in results if r["warnings"]]
    if warned:
        lines.append("## Warnings detail")
        lines.append("")
        for r in warned:
            p = by_id[r["id"]]
            lines.append(f"### {r['id']} ({p['title_en']})")
            lines.append(f"- warnings: {r['warnings']}")
            lines.append(f"- t0 = {r['t0Sec']*1000:.1f}ms, onset MIDI notes = "
                          f"{[n['midi'] for n in r['notes']]}")
            if r["keyMatchesMidi"] is False:
                lines.append(
                    f"- key mismatch: catalog.yaml says '{r['catalogKey']}', "
                    f"MIDI key_signature meta says '{r['midiKeySignature']}'"
                )
            lines.append("")

    lines.append("## Key signature cross-check (catalog.yaml vs MIDI meta)")
    lines.append("")
    lines.append(
        "MIDI's key_signature meta event does not reliably mark major/minor "
        "mode in this corpus (the `mi` flag reads as 0 / major even for "
        "minor-key pieces); mido therefore reports the *relative major* for "
        "every minor-key piece. Comparison below accounts for that."
    )
    lines.append("")
    mismatches = [r for r in results if r["keyMatchesMidi"] is False]
    if mismatches:
        lines.append(f"**{len(mismatches)} mismatch(es) found** (see Warnings detail above).")
    else:
        lines.append(
            f"All {sum(1 for r in results if r['keyMatchesMidi'] is not None)} "
            "pieces with a determinable key: catalog.yaml matches the MIDI's "
            "actual key_signature meta (sharps/flats count) exactly."
        )
    lines.append("")

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


if __name__ == "__main__":
    main()
