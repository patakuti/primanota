"""Unit tests for manage_piece.py's file-editing logic (02_design.md 3.11).

Covers only the pure text/block manipulation -- no network access or
subprocess calls to the wrapped scripts.
"""
from pathlib import Path

import manage_piece
from manage_piece import (
    block_id,
    existing_ids,
    format_catalog_entry,
    load_blocks,
    remove_block,
    remove_piece_id_from_sets,
    save_blocks,
)

SAMPLE_CATALOG = """\
# header comment
# second line

- id: piece_a
  composer_en: "Composer A"
  key: "C"
  url: "http://example.com/a.mid"

- id: piece_b
  composer_en: "Composer B"
  key: null
  url: "http://example.com/b.mid"
"""


def write_sample(tmp_path: Path) -> Path:
    path = tmp_path / "catalog.yaml"
    path.write_text(SAMPLE_CATALOG, encoding="utf-8")
    return path


def test_load_blocks_splits_header_and_entries(tmp_path):
    blocks = load_blocks(write_sample(tmp_path))
    assert len(blocks) == 3
    assert blocks[0].startswith("# header comment")
    assert blocks[1].startswith("- id: piece_a")
    assert blocks[2].startswith("- id: piece_b")


def test_save_blocks_round_trips(tmp_path):
    path = write_sample(tmp_path)
    blocks = load_blocks(path)
    save_blocks(path, blocks)
    assert path.read_text(encoding="utf-8") == SAMPLE_CATALOG


def test_block_id_extracts_id():
    assert block_id("- id: chopin_ballade_no2\n  key: null") == "chopin_ballade_no2"


def test_block_id_none_for_non_entry_block():
    assert block_id("# just a comment") is None


def test_existing_ids(tmp_path):
    blocks = load_blocks(write_sample(tmp_path))
    assert existing_ids(blocks) == {"piece_a", "piece_b"}


def test_remove_block_drops_only_target(tmp_path):
    blocks = load_blocks(write_sample(tmp_path))
    new_blocks, removed = remove_block(blocks, "piece_a")
    assert removed is True
    assert [block_id(b) for b in new_blocks[1:]] == ["piece_b"]
    # The untouched entry keeps its exact original formatting.
    assert new_blocks[1] == blocks[2]


def test_remove_block_missing_id_is_noop(tmp_path):
    blocks = load_blocks(write_sample(tmp_path))
    new_blocks, removed = remove_block(blocks, "no_such_id")
    assert removed is False
    assert new_blocks == blocks


def test_add_then_remove_preserves_other_entries(tmp_path):
    path = write_sample(tmp_path)
    blocks = load_blocks(path)

    new_entry = format_catalog_entry(
        "piece_c", "Composer C", "作曲家C", "Title C", "曲C", "Db", "http://example.com/c.mid"
    )
    save_blocks(path, [*blocks, new_entry])
    assert existing_ids(load_blocks(path)) == {"piece_a", "piece_b", "piece_c"}

    blocks_after_add = load_blocks(path)
    new_blocks, removed = remove_block(blocks_after_add, "piece_c")
    assert removed is True
    save_blocks(path, new_blocks)

    # Back to the original two entries, byte-for-byte.
    assert path.read_text(encoding="utf-8") == SAMPLE_CATALOG


def test_format_catalog_entry_null_key_when_empty():
    entry = format_catalog_entry("id1", "A", "あ", "Ti", "タ", None, "http://x/y.mid")
    assert "key: null" in entry
    assert 'key: ""' not in entry


def test_format_catalog_entry_quotes_key_when_present():
    entry = format_catalog_entry("id1", "A", "あ", "Ti", "タ", "Db", "http://x/y.mid")
    assert 'key: "Db"' in entry


def test_format_catalog_entry_escapes_embedded_quotes():
    entry = format_catalog_entry(
        "id1", "A", "あ", 'Étude Op.10 No.1 in C major "Waterfall"', "タ", "C", "http://x/y.mid"
    )
    assert 'title_en: "Étude Op.10 No.1 in C major \\"Waterfall\\""' in entry
    # And it must parse back as the original, unescaped string.
    import yaml as _yaml

    parsed = _yaml.safe_load(entry)[0]
    assert parsed["title_en"] == 'Étude Op.10 No.1 in C major "Waterfall"'


def test_format_catalog_entry_matches_hand_written_style():
    entry = format_catalog_entry(
        "chopin_test", "Frédéric Chopin", "フレデリック・ショパン", "Test Piece", "テスト曲",
        "c", "http://piano-midi.de/midis/chopin/test.mid",
    )
    assert entry == (
        "- id: chopin_test\n"
        '  composer_en: "Frédéric Chopin"\n'
        '  composer_ja: "フレデリック・ショパン"\n'
        '  title_en: "Test Piece"\n'
        '  title_ja: "テスト曲"\n'
        '  key: "c"\n'
        '  url: "http://piano-midi.de/midis/chopin/test.mid"'
    )


SAMPLE_PIECE_SETS = """\
# header comment

- id: famous
  name_en: "Most Famous"
  piece_ids:
    - piece_a
    - piece_b
    - piece_c
"""


def test_remove_piece_id_from_sets_drops_only_that_line(tmp_path, monkeypatch):
    path = tmp_path / "piece_sets.yaml"
    path.write_text(SAMPLE_PIECE_SETS, encoding="utf-8")
    monkeypatch.setattr(manage_piece, "PIECE_SETS_PATH", path)

    removed = remove_piece_id_from_sets("piece_b")

    assert removed is True
    assert path.read_text(encoding="utf-8") == SAMPLE_PIECE_SETS.replace("    - piece_b\n", "")


def test_remove_piece_id_from_sets_missing_id_is_noop(tmp_path, monkeypatch):
    path = tmp_path / "piece_sets.yaml"
    path.write_text(SAMPLE_PIECE_SETS, encoding="utf-8")
    monkeypatch.setattr(manage_piece, "PIECE_SETS_PATH", path)

    removed = remove_piece_id_from_sets("no_such_piece")

    assert removed is False
    assert path.read_text(encoding="utf-8") == SAMPLE_PIECE_SETS


def test_remove_piece_id_from_sets_missing_file_is_noop(tmp_path, monkeypatch):
    monkeypatch.setattr(manage_piece, "PIECE_SETS_PATH", tmp_path / "no_such_file.yaml")
    assert remove_piece_id_from_sets("piece_a") is False
