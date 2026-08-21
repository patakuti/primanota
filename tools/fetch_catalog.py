"""Fetch the full piece catalog from piano-midi.de for selected composers.

Does NOT guess file names or URLs: the top page (midi_files.htm) is fetched
to resolve each composer's page filename, and each composer page is parsed
to extract the actual .mid links and their titles (see 02_design.md 3.1).

Output: tools/catalog_raw.yaml (all pieces found for the target composers).
"""
from __future__ import annotations

import sys
import time
from dataclasses import dataclass, asdict
from urllib.parse import urljoin

import requests
import yaml
from bs4 import BeautifulSoup

BASE_URL = "http://piano-midi.de/"
TOP_PAGE = urljoin(BASE_URL, "midi_files.htm")
USER_AGENT = "PrimaNota-CatalogFetcher/0.1 (+https://github.com/patakuti/primanota)"
REQUEST_DELAY_SEC = 1.5

# Composers targeted for this quiz (design doc 02_design.md, section 3.1).
TARGET_COMPOSERS = [
    "Bach",
    "Chopin",
    "Beethoven",
    "Schubert",
    "Debussy",
    "Liszt",
    "Mozart",
    "Schumann",
]


@dataclass
class RawPiece:
    composer: str
    group: str  # e.g. "Préludes, Opus 28 (1838)"
    part: str  # e.g. "No. 15 - Raindrop"
    url: str


def fetch(url: str) -> str:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
    resp.raise_for_status()
    resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.text


def resolve_composer_pages(top_html: str) -> dict[str, str]:
    """Map composer display name -> absolute page URL, from the top page nav."""
    soup = BeautifulSoup(top_html, "html.parser")
    pages: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not href.endswith(".htm"):
            continue
        text = a.get_text(strip=True)
        if not text or "," in text:
            # Nav links come in two forms on this page: a short "Chopin" link
            # and a longer "Chopin, Frédéric" one. Keep the short form only.
            continue
        if text in TARGET_COMPOSERS and text not in pages:
            pages[text] = urljoin(BASE_URL, href)
    return pages


def parse_composer_page(composer: str, html: str, page_url: str) -> list[RawPiece]:
    soup = BeautifulSoup(html, "html.parser")
    pieces: list[RawPiece] = []
    current_group = ""
    for el in soup.find_all(["h2", "tr"]):
        if el.name == "h2":
            current_group = " ".join(el.get_text(" ", strip=True).split())
            continue
        if "midi" not in (el.get("class") or []):
            continue
        tds = el.find_all("td", recursive=False)
        if not tds:
            continue
        first_link = tds[0].find("a", href=True)
        if not first_link:
            continue
        href = first_link["href"]
        if not href.endswith(".mid") or "_format0" in href:
            continue
        part = " ".join(first_link.get_text(" ", strip=True).split())
        pieces.append(
            RawPiece(
                composer=composer,
                group=current_group,
                part=part,
                url=urljoin(page_url, href),
            )
        )
    return pieces


def main() -> None:
    print(f"Fetching top page: {TOP_PAGE}")
    top_html = fetch(TOP_PAGE)
    composer_pages = resolve_composer_pages(top_html)

    missing = [c for c in TARGET_COMPOSERS if c not in composer_pages]
    if missing:
        print(f"ERROR: could not resolve page URL for: {missing}", file=sys.stderr)
        sys.exit(1)

    all_pieces: list[RawPiece] = []
    for composer in TARGET_COMPOSERS:
        page_url = composer_pages[composer]
        print(f"Fetching {composer}: {page_url}")
        time.sleep(REQUEST_DELAY_SEC)
        html = fetch(page_url)
        pieces = parse_composer_page(composer, html, page_url)
        print(f"  -> {len(pieces)} pieces")
        all_pieces.extend(pieces)

    out_path = "catalog_raw.yaml"
    with open(out_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(
            [asdict(p) for p in all_pieces],
            f,
            allow_unicode=True,
            sort_keys=False,
        )
    print(f"Wrote {len(all_pieces)} pieces total to {out_path}")


if __name__ == "__main__":
    main()
