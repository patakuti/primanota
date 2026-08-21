"""Merge catalog.yaml + onset analysis + score extraction + overrides into
web/src/data/pieces.json (02_design.md 3.8 -- the data contract between the
offline preprocessing pipeline and the web app).
"""
from __future__ import annotations

import datetime
import json
from pathlib import Path

import mido
import yaml

from analyze_midi import analyze_piece, load_overrides
from score_extract import extract_score

ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = Path(__file__).resolve().parent
CATALOG_PATH = TOOLS_DIR / "catalog.yaml"
MIDI_DIR = ROOT / "data" / "midi"
OUT_PATH = ROOT / "web" / "src" / "data" / "pieces.json"

CREDIT = {
    "source": "piano-midi.de",
    "author": "Bernd Krueger",
    "license": "CC BY-SA 3.0 DE",
    "url": "http://piano-midi.de/",
}


def build_piece(piece: dict, overrides: dict) -> dict:
    onset_result = analyze_piece(piece, overrides)
    mid = mido.MidiFile(MIDI_DIR / f"{piece['id']}.mid")

    score_override = overrides.get(piece["id"], {}).get("score")
    if score_override:
        score = score_override
    else:
        score = extract_score(mid, piece["key"], piece_id=piece["id"])
        del score["trebleTracks"]
        del score["bassTracks"]

    return {
        "id": piece["id"],
        "composer": {"en": piece["composer_en"], "ja": piece["composer_ja"]},
        "title": {"en": piece["title_en"], "ja": piece["title_ja"]},
        "key": piece["key"],
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


def main() -> None:
    with open(CATALOG_PATH, encoding="utf-8") as f:
        catalog = yaml.safe_load(f)
    overrides = load_overrides()

    pieces = [build_piece(piece, overrides) for piece in catalog]

    dataset = {
        "version": 1,
        "generatedAt": datetime.date.today().isoformat(),
        "credit": CREDIT,
        "pieces": pieces,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(pieces)} pieces to {OUT_PATH}")


if __name__ == "__main__":
    main()
