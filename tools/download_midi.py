"""Download the MIDI files listed in tools/catalog.yaml to data/midi/.

Idempotent: files already present are skipped. A delay is inserted between
requests out of courtesy to piano-midi.de (see 02_design.md 3.2).
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import requests
import yaml

USER_AGENT = "PrimaNota-MidiDownloader/0.1 (+https://github.com/patakuti/primanota)"
REQUEST_DELAY_SEC = 1.5

ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = Path(__file__).resolve().parent / "catalog.yaml"
MIDI_DIR = ROOT / "data" / "midi"


def main() -> None:
    with open(CATALOG_PATH, encoding="utf-8") as f:
        catalog = yaml.safe_load(f)

    MIDI_DIR.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    skipped = 0
    failed: list[str] = []

    for piece in catalog:
        dest = MIDI_DIR / f"{piece['id']}.mid"
        if dest.exists():
            skipped += 1
            continue
        url = piece["url"]
        print(f"Downloading {piece['id']} <- {url}")
        try:
            time.sleep(REQUEST_DELAY_SEC)
            resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
            resp.raise_for_status()
            dest.write_bytes(resp.content)
            downloaded += 1
        except requests.RequestException as exc:
            print(f"  FAILED: {exc}", file=sys.stderr)
            failed.append(piece["id"])

    print(f"\nDownloaded: {downloaded}, skipped (already present): {skipped}, failed: {len(failed)}")
    if failed:
        print(f"Failed ids: {failed}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
