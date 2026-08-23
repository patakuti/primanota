"""Merge catalog.yaml + onset analysis + score extraction + overrides into
web/src/data/pieces.json (02_design.md 3.8 -- the data contract between the
offline preprocessing pipeline and the web app).

Also writes one re-encoded, derived Standard MIDI File per piece to
web/public/playback/<id>.mid (02_design.md 3.9) for the answer panel's
SoundFont-based playback (4.8). These live under web/public (a static asset
fetched at runtime), not web/src/data, since they're consumed as raw binary
by spessasynth_lib rather than imported as a TS/JSON module.
"""
from __future__ import annotations

import datetime
import json
import re
import unicodedata
from pathlib import Path

import mido
import yaml

from analyze_midi import analyze_piece, load_overrides
from playback_extract import (
    extract_onset_chord_midi,
    extract_playback_midi,
    extract_truncated_preview_midi,
)
from score_extract import extract_score

ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = Path(__file__).resolve().parent
CATALOG_PATH = TOOLS_DIR / "catalog.yaml"
MIDI_DIR = ROOT / "data" / "midi"
OUT_PATH = ROOT / "web" / "src" / "data" / "pieces.json"
PLAYBACK_DIR = ROOT / "web" / "public" / "playback"
PIECE_SETS_PATH = ROOT / "data" / "piece_sets.yaml"

CREDIT = {
    "source": "piano-midi.de",
    "author": "Bernd Krueger",
    "license": "CC BY-SA 3.0 DE",
    "url": "http://piano-midi.de/",
}


def slugify(text: str) -> str:
    """ASCII-safe id for an auto-generated composer set (02_design.md 3.12),
    e.g. "Frédéric Chopin" -> "frederic-chopin"."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text).strip("-").lower()


def build_sets(catalog: list[dict]) -> tuple[list[dict], dict[str, list[str]]]:
    """Compute the sets shown in pieces.json's top-level "sets" (02_design.md
    3.12) and, for every piece id, which of those sets it belongs to.

    Composer sets are derived from catalog.yaml's composer_en; curated,
    cross-cutting sets come from data/piece_sets.yaml.
    """
    catalog_ids = {piece["id"] for piece in catalog}

    curated: list[dict] = []
    if PIECE_SETS_PATH.exists():
        with open(PIECE_SETS_PATH, encoding="utf-8") as f:
            curated = yaml.safe_load(f) or []

    piece_id_to_sets: dict[str, list[str]] = {piece["id"]: [] for piece in catalog}
    sets_meta: list[dict] = []

    for entry in sorted(curated, key=lambda e: -len(e["piece_ids"])):
        unknown = [pid for pid in entry["piece_ids"] if pid not in catalog_ids]
        if unknown:
            raise ValueError(
                f"data/piece_sets.yaml set '{entry['id']}' references piece id(s) "
                f"not in catalog.yaml: {unknown}"
            )
        sets_meta.append(
            {
                "id": entry["id"],
                "name": entry["name_en"],
                "kind": "curated",
                "pieceCount": len(entry["piece_ids"]),
            }
        )
        for pid in entry["piece_ids"]:
            piece_id_to_sets[pid].append(entry["id"])

    composer_pieces: dict[str, list[str]] = {}
    composer_names: dict[str, str] = {}
    for piece in catalog:
        slug = slugify(piece["composer_en"])
        composer_pieces.setdefault(slug, []).append(piece["id"])
        composer_names[slug] = piece["composer_en"]

    for slug, pids in sorted(composer_pieces.items(), key=lambda kv: -len(kv[1])):
        sets_meta.append(
            {"id": slug, "name": composer_names[slug], "kind": "composer", "pieceCount": len(pids)}
        )
        for pid in pids:
            piece_id_to_sets[pid].append(slug)

    return sets_meta, piece_id_to_sets


def build_piece(piece: dict, overrides: dict, sets_by_piece: dict[str, list[str]]) -> tuple[dict, dict, dict]:
    onset_result = analyze_piece(piece, overrides)
    mid = mido.MidiFile(MIDI_DIR / f"{piece['id']}.mid")

    score_override = overrides.get(piece["id"], {}).get("score")
    if score_override:
        score = score_override
    else:
        score = extract_score(mid, piece["key"], piece_id=piece["id"])
        del score["trebleTracks"]
        del score["bassTracks"]

    piece_data = {
        "id": piece["id"],
        "composer": {"en": piece["composer_en"], "ja": piece["composer_ja"]},
        "title": {"en": piece["title_en"], "ja": piece["title_ja"]},
        "key": piece["key"],
        "sets": sets_by_piece[piece["id"]],
        "onset": {
            "notes": [
                {
                    "midi": n["midi"],
                    "velocity": n["velocity"],
                    "offsetMs": n["offsetMs"],
                    "name": n["name"],
                }
                for n in onset_result["notes"]
            ],
            "isChord": onset_result["isChord"],
            "label": onset_result["label"],
        },
        "score": score,
    }
    playback_midi = extract_playback_midi(mid)
    t0_sec = onset_result["t0Sec"]
    preview_midis = {
        "chord": extract_onset_chord_midi(mid, t0_sec, piece_data["onset"]["notes"]),
        "0500": extract_truncated_preview_midi(mid, t0_sec, 0.5),
        "1000": extract_truncated_preview_midi(mid, t0_sec, 1.0),
    }
    return piece_data, playback_midi, preview_midis


def main() -> None:
    with open(CATALOG_PATH, encoding="utf-8") as f:
        catalog = yaml.safe_load(f)
    overrides = load_overrides()
    sets_meta, piece_id_to_sets = build_sets(catalog)

    built = [build_piece(piece, overrides, piece_id_to_sets) for piece in catalog]
    pieces = [piece_data for piece_data, _, _ in built]

    dataset = {
        "version": 2,
        "generatedAt": datetime.date.today().isoformat(),
        "credit": CREDIT,
        "sets": sets_meta,
        "pieces": pieces,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)

    PLAYBACK_DIR.mkdir(parents=True, exist_ok=True)
    for piece_data, playback_midi, preview_midis in built:
        playback_midi.save(PLAYBACK_DIR / f"{piece_data['id']}.mid")
        for variant, preview_midi in preview_midis.items():
            preview_midi.save(PLAYBACK_DIR / f"{piece_data['id']}_{variant}.mid")

    print(f"Wrote {len(pieces)} pieces to {OUT_PATH}")
    print(f"Wrote {len(built)} playback MIDI files (+{len(built) * 3} onset previews) to {PLAYBACK_DIR}")


if __name__ == "__main__":
    main()
