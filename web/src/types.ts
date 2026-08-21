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
  onset: Onset;
  score: Score;
}

export interface Credit {
  source: string;
  author: string;
  license: string;
  url: string;
}

export interface PiecesDataset {
  version: number;
  generatedAt: string;
  credit: Credit;
  pieces: Piece[];
}
