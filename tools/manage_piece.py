"""Add or remove a piece from the catalog (01_requirements.md 11, 02_design.md 3.11).

Wraps the existing per-step scripts (download_midi.py, analyze_midi.py's
analyze_piece(), build_dataset.py) so adding or removing one piece doesn't
require running each step by hand and hunting for orphaned files afterward.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import analyze_midi
import build_dataset
import download_midi

ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = Path(__file__).resolve().parent
CATALOG_PATH = TOOLS_DIR / "catalog.yaml"
OVERRIDES_PATH = ROOT / "data" / "overrides.yaml"
MIDI_DIR = ROOT / "data" / "midi"
ANALYSIS_DIR = ROOT / "data" / "analysis"
PLAYBACK_DIR = ROOT / "web" / "public" / "playback"

# Mirrors the warning codes raised by analyze_midi.analyze_piece (02_design.md 3.4).
WARNING_DESCRIPTIONS = {
    "leading_silence": "over 1s of silence before the first note -- not necessarily "
    "wrong, but worth a listen",
    "arpeggiated": "the onset notes are spread out in time (likely a broken chord), "
    "not a single simultaneous chord",
    "grace_suspected": "a very short note near the onset may be a grace note rather "
    "than part of the main chord",
    "low_single": "a single, unusually low note was detected as the onset -- double-"
    "check it isn't an isolated bass note (see the Waldstein override for a real "
    "example)",
    "key_mismatch": "catalog.yaml's `key` doesn't match the MIDI file's own "
    "key_signature meta event",
}


def load_blocks(path: Path) -> list[str]:
    """Split a file into its leading comment header and blank-line-separated
    `- id: ...` entries (02_design.md 3.11). No entry in catalog.yaml or
    overrides.yaml contains a blank line internally, so this round-trips the
    file without disturbing any entry's own formatting/quoting."""
    return path.read_text(encoding="utf-8").rstrip("\n").split("\n\n")


def save_blocks(path: Path, blocks: list[str]) -> None:
    path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")


def block_id(block: str) -> str | None:
    first_line = block.splitlines()[0]
    if not first_line.startswith("- id:"):
        return None
    return first_line.removeprefix("- id:").strip()


def existing_ids(blocks: list[str]) -> set[str]:
    return {bid for b in blocks[1:] if (bid := block_id(b)) is not None}


def remove_block(blocks: list[str], piece_id: str) -> tuple[list[str], bool]:
    kept = [blocks[0]] + [b for b in blocks[1:] if block_id(b) != piece_id]
    return kept, len(kept) < len(blocks)


def yaml_double_quoted(value: str) -> str:
    """Escape a string for use inside a YAML double-quoted scalar (backslash
    and double-quote), matching the style already used throughout
    catalog.yaml (e.g. titles containing an embedded \"nickname\")."""
    return value.replace("\\", "\\\\").replace('"', '\\"')


def format_catalog_entry(
    piece_id: str,
    composer_en: str,
    composer_ja: str,
    title_en: str,
    title_ja: str,
    key: str | None,
    url: str,
) -> str:
    key_literal = f'"{key}"' if key else "null"
    return (
        f"- id: {piece_id}\n"
        f'  composer_en: "{yaml_double_quoted(composer_en)}"\n'
        f'  composer_ja: "{yaml_double_quoted(composer_ja)}"\n'
        f'  title_en: "{yaml_double_quoted(title_en)}"\n'
        f'  title_ja: "{yaml_double_quoted(title_ja)}"\n'
        f"  key: {key_literal}\n"
        f'  url: "{yaml_double_quoted(url)}"'
    )


def prompt(label: str, *, allow_empty: bool = False) -> str:
    while True:
        value = input(f"{label}: ").strip()
        if value or allow_empty:
            return value
        print("  (required)")


def cmd_add() -> None:
    blocks = load_blocks(CATALOG_PATH)
    ids = existing_ids(blocks)

    print("Adding a new piece to tools/catalog.yaml.\n")
    while True:
        piece_id = prompt("id (snake_case, e.g. chopin_ballade_no2)")
        if piece_id in ids:
            print(f"  '{piece_id}' already exists in catalog.yaml -- choose another id.")
            continue
        break
    composer_en = prompt("composer_en")
    composer_ja = prompt("composer_ja")
    title_en = prompt("title_en")
    title_ja = prompt("title_ja")
    key = prompt("key (e.g. C, c#, Db -- leave empty if unknown)", allow_empty=True) or None
    url = prompt("url (a piano-midi.de .mid link)")

    entry_block = format_catalog_entry(piece_id, composer_en, composer_ja, title_en, title_ja, key, url)
    save_blocks(CATALOG_PATH, [*blocks, entry_block])
    print(f"\nAdded '{piece_id}' to {CATALOG_PATH.relative_to(ROOT)}.")

    print("\nDownloading MIDI files (existing files are skipped)...")
    download_midi.main()
    midi_path = MIDI_DIR / f"{piece_id}.mid"
    if not midi_path.exists():
        print(
            f"\nERROR: {midi_path.relative_to(ROOT)} was not downloaded -- check the url "
            f"in {CATALOG_PATH.relative_to(ROOT)} and re-run `python3 download_midi.py`.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"\nAnalyzing '{piece_id}'...")
    piece = {
        "id": piece_id,
        "composer_en": composer_en,
        "composer_ja": composer_ja,
        "title_en": title_en,
        "title_ja": title_ja,
        "key": key,
        "url": url,
    }
    overrides = analyze_midi.load_overrides()
    result = analyze_midi.analyze_piece(piece, overrides)
    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
    with open(ANALYSIS_DIR / f"{piece_id}.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    if result["warnings"]:
        print(f"\nWarnings for '{piece_id}': {', '.join(result['warnings'])}")
        for w in result["warnings"]:
            print(f"  - {w}: {WARNING_DESCRIPTIONS.get(w, '(no description)')}")
        midis = [n["midi"] for n in result["notes"]]
        print(
            f"\nIf the detected onset above is wrong, add an override to "
            f"{OVERRIDES_PATH.relative_to(ROOT)}, e.g.:\n\n"
            f"- id: {piece_id}\n"
            f"  onset:\n"
            f"    midis: {midis}\n"
            f"  reason: >\n"
            f"    <why the auto-detected onset is wrong, and what the correct notes are,\n"
            f"    per 02_design.md 3.4 / the beethoven_waldstein_1 example>\n"
        )
    else:
        print(f"\nNo warnings for '{piece_id}'.")

    print("\nRegenerating web/src/data/pieces.json and web/public/playback/...")
    build_dataset.main()

    print(
        f"\nDone. Next steps:\n"
        f"  - review data/analysis/{piece_id}.json and tools/catalog.yaml\n"
        f"  - cd web && npm run build   # sanity check\n"
        f"  - git add tools/catalog.yaml data/analysis/{piece_id}.json "
        f"web/src/data/pieces.json 'web/public/playback/{piece_id}*.mid'"
    )


def cmd_remove(piece_id: str) -> None:
    blocks = load_blocks(CATALOG_PATH)
    target = next((b for b in blocks[1:] if block_id(b) == piece_id), None)
    if target is None:
        print(f"'{piece_id}' is not in {CATALOG_PATH.relative_to(ROOT)}.", file=sys.stderr)
        sys.exit(1)

    print(target)
    answer = input(f"\nRemove '{piece_id}' shown above? [y/N] ").strip().lower()
    if answer != "y":
        print("Cancelled.")
        return

    new_blocks, _ = remove_block(blocks, piece_id)
    save_blocks(CATALOG_PATH, new_blocks)
    print(f"Removed '{piece_id}' from {CATALOG_PATH.relative_to(ROOT)}.")

    if OVERRIDES_PATH.exists():
        override_blocks = load_blocks(OVERRIDES_PATH)
        new_override_blocks, removed = remove_block(override_blocks, piece_id)
        if removed:
            save_blocks(OVERRIDES_PATH, new_override_blocks)
            print(f"Removed '{piece_id}' from {OVERRIDES_PATH.relative_to(ROOT)}.")

    stale_files = [
        MIDI_DIR / f"{piece_id}.mid",
        ANALYSIS_DIR / f"{piece_id}.json",
        PLAYBACK_DIR / f"{piece_id}.mid",
        PLAYBACK_DIR / f"{piece_id}_chord.mid",
        PLAYBACK_DIR / f"{piece_id}_0500.mid",
        PLAYBACK_DIR / f"{piece_id}_1000.mid",
    ]
    for path in stale_files:
        if path.exists():
            path.unlink()
            print(f"Deleted {path.relative_to(ROOT)}.")

    print("\nRegenerating web/src/data/pieces.json...")
    build_dataset.main()

    print(
        "\nDone. Next steps:\n"
        "  - cd web && npm run build   # sanity check\n"
        "  - git add -u   # stage the deletions, then commit"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("add", help="Interactively add a new piece to the catalog.")
    remove_parser = sub.add_parser("remove", help="Remove a piece from the catalog.")
    remove_parser.add_argument("id", help="The piece id to remove (as it appears in catalog.yaml).")

    args = parser.parse_args()
    if args.command == "add":
        cmd_add()
    elif args.command == "remove":
        cmd_remove(args.id)


if __name__ == "__main__":
    main()
