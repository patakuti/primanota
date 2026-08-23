"""Unit tests for build_dataset.py's piece-set logic (02_design.md 3.12)."""
import pytest

import build_dataset
from build_dataset import build_sets, slugify

CATALOG = [
    {"id": "chopin_a", "composer_en": "Frédéric Chopin"},
    {"id": "chopin_b", "composer_en": "Frédéric Chopin"},
    {"id": "beethoven_a", "composer_en": "Ludwig van Beethoven"},
]


def test_slugify_strips_accents_and_lowercases():
    assert slugify("Frédéric Chopin") == "frederic-chopin"


def test_slugify_handles_multiple_words():
    assert slugify("Ludwig van Beethoven") == "ludwig-van-beethoven"
    assert slugify("Johann Sebastian Bach") == "johann-sebastian-bach"


def test_build_sets_derives_one_set_per_composer(tmp_path, monkeypatch):
    monkeypatch.setattr(build_dataset, "PIECE_SETS_PATH", tmp_path / "no_such_file.yaml")

    sets_meta, piece_id_to_sets = build_sets(CATALOG)

    ids = {s["id"] for s in sets_meta}
    assert ids == {"frederic-chopin", "ludwig-van-beethoven"}
    assert piece_id_to_sets["chopin_a"] == ["frederic-chopin"]
    assert piece_id_to_sets["beethoven_a"] == ["ludwig-van-beethoven"]

    chopin_set = next(s for s in sets_meta if s["id"] == "frederic-chopin")
    assert chopin_set == {
        "id": "frederic-chopin",
        "name": "Frédéric Chopin",
        "kind": "composer",
        "pieceCount": 2,
    }


def test_build_sets_larger_composer_group_sorts_first(tmp_path, monkeypatch):
    monkeypatch.setattr(build_dataset, "PIECE_SETS_PATH", tmp_path / "no_such_file.yaml")

    sets_meta, _ = build_sets(CATALOG)
    assert [s["id"] for s in sets_meta] == ["frederic-chopin", "ludwig-van-beethoven"]


def test_build_sets_includes_curated_set(tmp_path, monkeypatch):
    piece_sets_path = tmp_path / "piece_sets.yaml"
    piece_sets_path.write_text(
        '- id: famous\n  name_en: "Famous"\n  piece_ids: [chopin_a, beethoven_a]\n',
        encoding="utf-8",
    )
    monkeypatch.setattr(build_dataset, "PIECE_SETS_PATH", piece_sets_path)

    sets_meta, piece_id_to_sets = build_sets(CATALOG)

    curated = next(s for s in sets_meta if s["id"] == "famous")
    assert curated == {"id": "famous", "name": "Famous", "kind": "curated", "pieceCount": 2}
    assert piece_id_to_sets["chopin_a"] == ["famous", "frederic-chopin"]
    assert piece_id_to_sets["chopin_b"] == ["frederic-chopin"]


def test_build_sets_raises_on_unknown_piece_id(tmp_path, monkeypatch):
    piece_sets_path = tmp_path / "piece_sets.yaml"
    piece_sets_path.write_text(
        '- id: famous\n  name_en: "Famous"\n  piece_ids: [chopin_a, no_such_piece]\n',
        encoding="utf-8",
    )
    monkeypatch.setattr(build_dataset, "PIECE_SETS_PATH", piece_sets_path)

    with pytest.raises(ValueError, match="no_such_piece"):
        build_sets(CATALOG)
