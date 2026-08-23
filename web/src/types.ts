// Types for web/src/data/pieces.json (data contract with tools/build_dataset.py).
// See 02_design.md section 3.8.

export interface LocalizedText {
  en: string;
  ja: string;
}

export interface NoteName {
  en: string;
  ja: string;
  solfege: string;
}

export interface OnsetNote {
  midi: number;
  velocity: number;
  offsetMs: number;
  name: NoteName;
}

export interface OnsetLabel {
  en: string;
  ja: string;
  solfege: string;
}

export interface Onset {
  notes: OnsetNote[];
  isChord: boolean;
  label: OnsetLabel;
}

export interface TupletInfo {
  numNotes: number;
  notesOccupied: number;
}

export interface ScoreEvent {
  keys: string[];
  duration: string;
  tuplet?: TupletInfo;
  /** True if this event is one held note split across multiple duration
   * tokens (e.g. a 4.5-beat note as "w" + "8") and should be tied to the
   * next event of the same keys, rather than read as a repeated attack. */
  tiedToNext?: boolean;
}

export interface ScoreMeasure {
  treble: ScoreEvent[];
  bass: ScoreEvent[];
}

export interface Score {
  keySignature: string;
  timeSignature: string;
  measures: ScoreMeasure[];
}

export interface Piece {
  id: string;
  composer: LocalizedText;
  title: LocalizedText;
  key: string | null;
  sets: string[];
  onset: Onset;
  score: Score;
}

export interface Credit {
  source: string;
  author: string;
  license: string;
  url: string;
}

export interface SetDefinition {
  id: string;
  name: string;
  kind: 'curated' | 'composer';
  pieceCount: number;
}

export interface PiecesDataset {
  version: number;
  generatedAt: string;
  credit: Credit;
  sets: SetDefinition[];
  pieces: Piece[];
}
