// Opening-measures score rendering with VexFlow (02_design.md 4.6).

import {
  Accidental,
  Beam,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Tuplet,
  Voice,
} from 'vexflow';
import type { Score, ScoreEvent } from '../types.ts';

const MIN_MEASURE_WIDTH = 120;
const FIRST_MEASURE_EXTRA_WIDTH = 110; // room for clef + key signature + time signature
const TOP_MARGIN = 50; // headroom for ledger lines above a high treble note
const BOTTOM_MARGIN = 60; // headroom for ledger lines below a low bass note
const STAVE_GAP = 140; // vertical gap between the treble and bass stave tops -
// wide enough that notes needing several ledger lines (e.g. an Alberti bass
// climbing above the bass staff, or a treble chord reaching below middle C)
// don't visually collide with the other staff (see report_m7.md)
const LEFT_MARGIN = 10;

function isDarkMode(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function buildNotes(events: ScoreEvent[], clef: 'treble' | 'bass'): StaveNote[] {
  return events.map((e) => new StaveNote({ clef, keys: e.keys, duration: e.duration }));
}

/** Wrap consecutive notes sharing the same tuplet ratio in one VF.Tuplet bracket. */
function applyTuplets(context: ReturnType<Renderer['getContext']>, notes: StaveNote[], events: ScoreEvent[]): void {
  let i = 0;
  while (i < events.length) {
    const t = events[i]!.tuplet;
    if (!t) {
      i++;
      continue;
    }
    let j = i;
    while (
      j < events.length &&
      events[j]!.tuplet &&
      events[j]!.tuplet!.numNotes === t.numNotes &&
      events[j]!.tuplet!.notesOccupied === t.notesOccupied
    ) {
      j++;
    }
    const group = notes.slice(i, j);
    const tuplet = new Tuplet(group, { numNotes: t.numNotes, notesOccupied: t.notesOccupied });
    tuplet.setContext(context).draw();
    i = j;
  }
}

interface MeasureBuild {
  trebleNotes: StaveNote[];
  bassNotes: StaveNote[];
  trebleVoice: Voice;
  bassVoice: Voice;
  trebleBeams: Beam[];
  bassBeams: Beam[];
  width: number;
}

/** Render `score`'s opening measures into `container` as a grand staff. */
export function renderScore(container: HTMLElement, score: Score): void {
  container.replaceChildren();

  const wrapper = document.createElement('div');
  wrapper.style.overflowX = 'auto';
  container.appendChild(wrapper);

  const [num, den] = score.timeSignature.split('/').map(Number) as [number, number];

  // Pass 1: build voices and let VexFlow tell us the minimum width each
  // measure actually needs -- forcing a fixed width regardless of content
  // (e.g. several chords packed into one measure) made notes overlap.
  const builds: MeasureBuild[] = score.measures.map((measure, i) => {
    const trebleNotes = buildNotes(measure.treble, 'treble');
    const bassNotes = buildNotes(measure.bass, 'bass');

    const trebleVoice = new Voice({ numBeats: num, beatValue: den }).setStrict(false);
    trebleVoice.addTickables(trebleNotes);
    const bassVoice = new Voice({ numBeats: num, beatValue: den }).setStrict(false);
    bassVoice.addTickables(bassNotes);

    Accidental.applyAccidentals([trebleVoice], score.keySignature);
    Accidental.applyAccidentals([bassVoice], score.keySignature);

    // Beam.generateBeams() with no config defaults to grouping every 2
    // eighth notes, which is only correct for simple time signatures.
    // Compound meters (6/8, 9/8, 12/8, ...) group in 3s (per dotted-quarter
    // beat); getDefaultBeamGroups() returns the musically correct grouping
    // for whatever timeSignature this piece actually has.
    const beamGroups = Beam.getDefaultBeamGroups(score.timeSignature);
    const trebleBeams = Beam.generateBeams(trebleNotes, { groups: beamGroups });
    const bassBeams = Beam.generateBeams(bassNotes, { groups: beamGroups });

    const minWidth = new Formatter()
      .joinVoices([trebleVoice])
      .joinVoices([bassVoice])
      .preCalculateMinTotalWidth([trebleVoice, bassVoice]);
    const width = Math.max(MIN_MEASURE_WIDTH, minWidth + 30) + (i === 0 ? FIRST_MEASURE_EXTRA_WIDTH : 0);

    return { trebleNotes, bassNotes, trebleVoice, bassVoice, trebleBeams, bassBeams, width };
  });

  const totalWidth = LEFT_MARGIN * 2 + builds.reduce((sum, b) => sum + b.width, 0);
  const height = TOP_MARGIN + STAVE_GAP + 40 + BOTTOM_MARGIN;

  const renderer = new Renderer(wrapper, Renderer.Backends.SVG);
  renderer.resize(totalWidth, height);
  const context = renderer.getContext();

  const color = isDarkMode() ? '#eeeeee' : '#1a1a1a';
  context.setFillStyle(color);
  context.setStrokeStyle(color);

  // Pass 2: create staves at each measure's actual width and draw.
  const trebleStaves: Stave[] = [];
  const bassStaves: Stave[] = [];
  let x = LEFT_MARGIN;

  score.measures.forEach((measure, i) => {
    const build = builds[i]!;
    const treble = new Stave(x, TOP_MARGIN, build.width);
    const bass = new Stave(x, TOP_MARGIN + STAVE_GAP, build.width);
    if (i === 0) {
      treble.addClef('treble').addKeySignature(score.keySignature).addTimeSignature(score.timeSignature);
      bass.addClef('bass').addKeySignature(score.keySignature).addTimeSignature(score.timeSignature);
    }
    treble.setContext(context).draw();
    bass.setContext(context).draw();
    trebleStaves.push(treble);
    bassStaves.push(bass);
    x += build.width;

    const contentWidth = build.width - (i === 0 ? FIRST_MEASURE_EXTRA_WIDTH : 0) - 20;
    new Formatter()
      .joinVoices([build.trebleVoice])
      .joinVoices([build.bassVoice])
      .format([build.trebleVoice, build.bassVoice], contentWidth);

    build.trebleVoice.draw(context, treble);
    build.bassVoice.draw(context, bass);
    applyTuplets(context, build.trebleNotes, measure.treble);
    applyTuplets(context, build.bassNotes, measure.bass);
    for (const beam of [...build.trebleBeams, ...build.bassBeams]) {
      beam.setContext(context).draw();
    }
  });

  if (trebleStaves.length > 0) {
    const first = 0;
    const last = trebleStaves.length - 1;
    new StaveConnector(trebleStaves[first]!, bassStaves[first]!).setType('brace').setContext(context).draw();
    new StaveConnector(trebleStaves[first]!, bassStaves[first]!).setType('singleLeft').setContext(context).draw();
    new StaveConnector(trebleStaves[last]!, bassStaves[last]!).setType('singleRight').setContext(context).draw();
  }
}
