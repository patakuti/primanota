# MIDI Onset Extraction Report (Phase 1 PoC)

Pieces analyzed: 46
Clean (no warnings): 36 / 46 (78%)

## Thresholds (empirically validated against this catalog)
- ONSET_WINDOW = 50ms (observed: same-chord gaps <= ~2ms, next-note gaps >= ~99ms)
- GRACE_MAX = 80ms (never triggered in this catalog)
- LEADING_SILENCE threshold = 1000ms
- ARPEGGIATED spread threshold = 20ms
- LOW_SINGLE MIDI threshold = 40 (MIDI 40 = E2)

## Per-piece results

| id | composer | title | onset | label | warnings |
|---|---|---|---|---|---|
| chopin_etude_op10_no12 | Frédéric Chopin | Étude Op.10 No.12 in C minor "Revolutionary" | MIDI [71,74,77,79,83] | B4+D5+F5+G5+B5 | - |
| chopin_prelude_op28_no15 | Frédéric Chopin | Prelude Op.28 No.15 in D-flat major "Raindrop" | MIDI [49,77] | Db3+F5 | - |
| chopin_fantaisie_impromptu | Frédéric Chopin | Fantaisie-Impromptu Op.66 in C-sharp minor | MIDI [44,56] | G#2+G#3 | - |
| chopin_sonata2_funeral_march | Frédéric Chopin | Piano Sonata No.2 Op.35, 3rd mvt "Funeral March" | MIDI [34,41,46,53,58] | Bb1+F2+Bb2+F3+Bb3 | - |
| chopin_nocturne_op27_no2 | Frédéric Chopin | Nocturne Op.27 No.2 in D-flat major | MIDI [37] | Db2 | low_single |
| beethoven_fur_elise | Ludwig van Beethoven | Für Elise, WoO 59 in A minor | MIDI [76] | E5 | - |
| beethoven_pathetique_1 | Ludwig van Beethoven | Piano Sonata No.8 Op.13 "Pathétique", 1st mvt | MIDI [36,39,43,48,51,55,60] | C2+Eb2+G2+C3+Eb3+G3+C4 | - |
| beethoven_moonlight_1 | Ludwig van Beethoven | Piano Sonata No.14 Op.27/2 "Moonlight", 1st mvt | MIDI [37,49,56] | C#2+C#3+G#3 | - |
| beethoven_waldstein_1 | Ludwig van Beethoven | Piano Sonata No.21 Op.53 "Waldstein", 1st mvt | MIDI [36,43,48,52] | C2+G2+C3+E3 | - |
| beethoven_appassionata_1 | Ludwig van Beethoven | Piano Sonata No.23 Op.57 "Appassionata", 1st mvt | MIDI [36,60] | C2+C4 | leading_silence |
| schubert_impromptu_d899_no2 | Franz Schubert | Impromptu D.899 (Op.90) No.2 in E-flat major | MIDI [82] | Bb5 | - |
| schubert_impromptu_d899_no3 | Franz Schubert | Impromptu D.899 (Op.90) No.3 in G-flat major | MIDI [42,49,70] | Gb2+Db3+Bb4 | - |
| schubert_moment_musical_no3 | Franz Schubert | Moment Musical D.780 (Op.94) No.3 in F minor | MIDI [53] | F3 | - |
| debussy_clair_de_lune | Claude Debussy | Clair de Lune (Suite bergamasque) | MIDI [65,68] | F4+Ab4 | - |
| debussy_prelude_bergamasque | Claude Debussy | Prélude (Suite bergamasque) | MIDI [29] | F1 | low_single |
| liszt_liebestraum_no3 | Franz Liszt | Liebestraum No.3 in A-flat major | MIDI [51] | Eb3 | leading_silence |
| liszt_la_campanella | Franz Liszt | Grandes Études de Paganini No.3 "La Campanella" | MIDI [63,75] | D#4+D#5 | - |
| liszt_hungarian_rhapsody_no2 | Franz Liszt | Hungarian Rhapsody No.2 in C-sharp minor | MIDI [61] | C#4 | leading_silence |
| mozart_rondo_alla_turca | Wolfgang Amadeus Mozart | Piano Sonata No.11 KV 331, 3rd mvt "Rondo alla Turca" | MIDI [71] | B4 | - |
| mozart_sonata_facile_1 | Wolfgang Amadeus Mozart | Piano Sonata No.16 KV 545 "Sonata facile", 1st mvt | MIDI [60,72] | C4+C5 | - |
| schumann_kinderszenen_no1 | Robert Schumann | Kinderszenen Op.15 No.1 "Von fremden Ländern und Menschen" | MIDI [55,59,71] | G3+B3+B4 | - |
| schumann_traumerei | Robert Schumann | Kinderszenen Op.15 No.7 "Träumerei" | MIDI [60] | C4 | leading_silence |
| chopin_ballade_no1 | Frédéric Chopin | Ballade No.1 Op.23 in G minor | MIDI [36,48] | C2+C3 | - |
| schubert_impromptu_d935_no3 | Franz Schubert | Impromptu D.935 (Op.142) No.3 in B-flat major | MIDI [46,74] | Bb2+D5 | - |
| schumann_abegg_variations | Robert Schumann | Variations on the name "Abegg", Op.1 | MIDI [69,81] | A4+A5 | - |
| bach_wtc1_prelude_fugue_846 | Johann Sebastian Bach | The Well-Tempered Clavier I, Prelude and Fugue in C major, BWV 846 | MIDI [60] | C4 | - |
| bach_wtc1_prelude_fugue_847 | Johann Sebastian Bach | The Well-Tempered Clavier I, Prelude and Fugue in C minor, BWV 847 | MIDI [48,72] | C3+C5 | - |
| bach_wtc1_prelude_fugue_850 | Johann Sebastian Bach | The Well-Tempered Clavier I, Prelude and Fugue in D major, BWV 850 | MIDI [50] | D3 | - |
| chopin_etude_op10_no1 | Frédéric Chopin | Étude Op.10 No.1 in C major | MIDI [36,48] | C2+C3 | - |
| chopin_etude_op10_no5 | Frédéric Chopin | Étude Op.10 No.5 in G-flat major "Black Key" | MIDI [54,58,61,66,90] | Gb3+Bb3+Db4+Gb4+Gb6 | - |
| chopin_etude_op25_no1 | Frédéric Chopin | Étude Op.25 No.1 in A-flat major "Harp" | MIDI [75] | Eb5 | leading_silence |
| chopin_etude_op25_no2 | Frédéric Chopin | Étude Op.25 No.2 in F minor | MIDI [72] | C5 | - |
| chopin_etude_op25_no3 | Frédéric Chopin | Étude Op.25 No.3 in F major | MIDI [72] | C5 | - |
| chopin_etude_op25_no4 | Frédéric Chopin | Étude Op.25 No.4 in A minor | MIDI [52] | E3 | - |
| chopin_etude_op25_no11 | Frédéric Chopin | Étude Op.25 No.11 in A minor "Winter Wind" | MIDI [64] | E4 | - |
| chopin_etude_op25_no12 | Frédéric Chopin | Étude Op.25 No.12 in C minor | MIDI [36,51] | C2+Eb3 | - |
| chopin_prelude_op28_no1 | Frédéric Chopin | Prelude Op.28 No.1 in C major | MIDI [36] | C2 | low_single |
| chopin_prelude_op28_no4 | Frédéric Chopin | Prelude Op.28 No.4 in E minor | MIDI [59] | B3 | - |
| chopin_prelude_op28_no6 | Frédéric Chopin | Prelude Op.28 No.6 in B minor | MIDI [47,62,66,71] | B2+D4+F#4+B4 | - |
| chopin_prelude_op28_no7 | Frédéric Chopin | Prelude Op.28 No.7 in A major | MIDI [64] | E4 | leading_silence |
| chopin_prelude_op28_no16 | Frédéric Chopin | Prelude Op.28 No.16 in B-flat minor | MIDI [29,41,63,69,78] | F1+F2+Eb4+A4+Gb5 | - |
| chopin_prelude_op28_no17 | Frédéric Chopin | Prelude Op.28 No.17 in A-flat major | MIDI [51,56,60,63] | Eb3+Ab3+C4+Eb4 | - |
| chopin_prelude_op28_no20 | Frédéric Chopin | Prelude Op.28 No.20 in C minor | MIDI [36,48,55,60,63,67] | C2+C3+G3+C4+Eb4+G4 | - |
| chopin_prelude_op28_no24 | Frédéric Chopin | Prelude Op.28 No.24 in D minor | MIDI [38] | D2 | low_single |
| chopin_polonaise_op53_heroic | Frédéric Chopin | Polonaise Op.53 in A-flat major "Heroic" | MIDI [27,39,51,63] | Eb1+Eb2+Eb3+Eb4 | - |
| chopin_scherzo_no2 | Frédéric Chopin | Scherzo No.2 Op.31 in B-flat minor | MIDI [46,58] | Bb2+Bb3 | - |

## Warnings detail

### chopin_nocturne_op27_no2 (Nocturne Op.27 No.2 in D-flat major)
- warnings: ['low_single']
- t0 = 0.0ms, onset MIDI notes = [37]

### beethoven_appassionata_1 (Piano Sonata No.23 Op.57 "Appassionata", 1st mvt)
- warnings: ['leading_silence']
- t0 = 1628.2ms, onset MIDI notes = [36, 60]

### debussy_prelude_bergamasque (Prélude (Suite bergamasque))
- warnings: ['low_single']
- t0 = 1.4ms, onset MIDI notes = [29]

### liszt_liebestraum_no3 (Liebestraum No.3 in A-flat major)
- warnings: ['leading_silence']
- t0 = 1847.9ms, onset MIDI notes = [51]

### liszt_hungarian_rhapsody_no2 (Hungarian Rhapsody No.2 in C-sharp minor)
- warnings: ['leading_silence']
- t0 = 1134.2ms, onset MIDI notes = [61]

### schumann_traumerei (Kinderszenen Op.15 No.7 "Träumerei")
- warnings: ['leading_silence']
- t0 = 1800.0ms, onset MIDI notes = [60]

### chopin_etude_op25_no1 (Étude Op.25 No.1 in A-flat major "Harp")
- warnings: ['leading_silence']
- t0 = 2127.0ms, onset MIDI notes = [75]

### chopin_prelude_op28_no1 (Prelude Op.28 No.1 in C major)
- warnings: ['low_single']
- t0 = 1.8ms, onset MIDI notes = [36]

### chopin_prelude_op28_no7 (Prelude Op.28 No.7 in A major)
- warnings: ['leading_silence']
- t0 = 1183.3ms, onset MIDI notes = [64]

### chopin_prelude_op28_no24 (Prelude Op.28 No.24 in D minor)
- warnings: ['low_single']
- t0 = 0.0ms, onset MIDI notes = [38]

## Key signature cross-check (catalog.yaml vs MIDI meta)

MIDI's key_signature meta event does not reliably mark major/minor mode in this corpus (the `mi` flag reads as 0 / major even for minor-key pieces); mido therefore reports the *relative major* for every minor-key piece. Comparison below accounts for that.

All 46 pieces with a determinable key: catalog.yaml matches the MIDI's actual key_signature meta (sharps/flats count) exactly.
