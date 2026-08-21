// Lightweight MIDI -> note name helper for the keyboard's own static labels
// (independent of any particular piece's key signature -- the answer panel
// uses the piece-specific spelling already baked into pieces.json by
// tools/notenames.py). Defaults to sharp spelling, mirroring that script's
// no-key default. Middle C = C4 = MIDI 60.

const JA_NAMES = ['ハ', '嬰ハ', 'ニ', '嬰ニ', 'ホ', 'ヘ', '嬰ヘ', 'ト', '嬰ト', 'イ', '嬰イ', 'ロ'];
const EN_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

export function midiToNameJa(midi: number): string {
  return `${JA_NAMES[midi % 12]}${midiToOctave(midi)}`;
}

export function midiToNameEn(midi: number): string {
  return `${EN_NAMES[midi % 12]}${midiToOctave(midi)}`;
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}
