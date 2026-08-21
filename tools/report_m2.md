# Score Extraction Report (Phase 1, M2)

Covers `tools/score_extract.py` + `tools/build_dataset.py`: extraction of the
opening 2 measures (per-voice VexFlow note/rest data) for all 28 pieces,
merged into `web/src/data/pieces.json`.

## Methodology (what was actually checked, and how)

Chrome (claude-in-chrome) was not connected this session, so the
"使い捨ての確認ページで全曲を目視確認" step (02_design.md 3.6) could not be
done in an actual browser as originally planned. Instead:

1. **Structural check**: rendered all 28 pieces' score data through the real
   VexFlow library (`Stave`, `Voice`, `Formatter`, `StaveNote`) in a headless
   Node.js + jsdom environment. All 28 rendered **without throwing any
   VexFlow exception** (no invalid duration strings, no invalid key
   signatures, no crashed voice formatting).
2. **Visual check**: converted 26/28 of those renders to PNG (via jsdom SVG
   output → resvg-js, with VexFlow's own bundled Bravura music font
   extracted and embedded so noteheads/clefs render correctly, not as
   mis-mapped Unicode glyphs) and inspected all 26 directly as images,
   arranged in labeled grids. 2 pieces (`bach_wtc1_prelude_fugue_847`,
   `schubert_impromptu_d899_no3`) crashed a Rust panic inside resvg-js
   specifically at PNG conversion (their SVG generation itself succeeded);
   not investigated further since `schubert_impromptu_d899_no3` was already
   independently flagged by the duration-sum check below, and time did not
   allow root-causing the resvg-specific crash.
3. **Programmatic check (all 28, all 112 voice-measures)**: for every
   piece/measure/staff, summed the generated duration tokens (in
   quarter-note beats) and compared against the time signature's expected
   beat count. This does **not** confirm the notation matches the real
   published score -- it only confirms internal consistency (no note data
   silently vanished or duplicated beyond the quantizer's known rounding).
4. **Key signature check (all 28)**: verified `catalog_key_to_vexflow()`'s
   output against VexFlow's own `keySignatures` table (fetched directly
   from the VexFlow source, not assumed) -- confirms 28/28 match the
   sharps/flats count already cross-validated against the MIDI's own
   key_signature meta in M1.

What this does **not** confirm: whether the notated rhythm/pitches actually
match the piece's real printed score. That requires either listening to the
result (once M4's synth exists) or comparing against sheet music by someone
who reads music -- neither was done here. Treat all of the below as "the
pipeline runs correctly and produces internally-consistent output," not
"the notation is verified correct" (see 02_design.md 3.6: this stage is
explicitly a draft/たたき台).

## Duration-sum check results

108 / 112 voice-measures (96%) sum to within 0.44 beats of the time
signature's expected total; most of those are small (<=0.19 beat) rounding
noise from the quantizer's minimum grid (32nd notes) on fast passages.

**4 voice-measures across 3 pieces show a large, systematic shortfall
(0.5-2.0 beats) with the same root cause: eighth-note triplets.**

| piece | measures | shortfall | cause |
|---|---|---|---|
| schubert_impromptu_d899_no3 | 0, 1 | -2.0 beats each | continuous 8th-note triplet accompaniment under a sustained melody note (confirmed: raw MIDI ticks are evenly spaced at 160 ticks = 1/3 beat) |
| beethoven_moonlight_1 | 0, 1 | -1.0 beat each | the famous triplet arpeggiated accompaniment |
| schubert_impromptu_d899_no2 | 1 | -0.75 beat | likely also triplet-based |

**Root cause, confirmed by inspecting raw MIDI ticks directly (not
assumed)**: `score_extract.py`'s `DURATION_UNITS` table only has binary
note values (whole/half/.../32nd, no triplets). A 1/3-beat gap (triplet
eighth) quantizes to the nearest binary value, a 1/4-beat sixteenth,
silently losing 1/12 beat per note; over many consecutive triplets this
accumulates into the multi-beat shortfalls above. `Voice.setStrict(false)`
means the app won't crash on these, but the rendered rhythm will look wrong
for these 3 pieces until either (a) `score_extract.py` gains tuplet support
(`VF.Tuplet`), or (b) these pieces get a manual `score` override in
`data/overrides.yaml`.

## Other finding: chopin_fantaisie_impromptu

The right-hand (treble) track has **zero notes in the first 2 measures**
by tick position -- confirmed directly from the MIDI (track 1's first note
starts at tick 7800, i.e. ~4 measures / ~5.8 seconds in at this file's
tempo), while the left hand holds a single long chord from tick 0. This
piece is famous for continuous, immediate motion in both hands, so a
multi-measure silent right hand is surprising. Not resolved: could reflect
an unusual structural choice in this specific transcription, or could
indicate the piece needs more than 2 measures extracted to reach its
audible opening. Flagged for a decision (extend measure count for this
piece via override, or accept as-is) rather than guessed at.

## Recommendation

Given design doc 3.7's framing (score data is a draft; `overrides.yaml`
exists precisely for cases like these), proceeding to M3 with these 4
pieces flagged is consistent with the plan. Suggest deciding on one of:
- Add triplet support to `score_extract.py` (proper fix, moderate effort)
- Manually author `score` overrides for the 4 affected pieces
- Accept the visual glitch for now and revisit during the M7 (score
  rendering) pass, when it can be checked in an actual browser
