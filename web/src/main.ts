import './styles.css';
import type { PiecesDataset } from './types.ts';
import piecesData from './data/pieces.json';

function bootstrap(): void {
  const dataset = piecesData as PiecesDataset;
  console.log(`PrimaNota: loaded ${dataset.pieces.length} pieces (dataset v${dataset.version}, generated ${dataset.generatedAt})`);

  const creditEl = document.getElementById('credit');
  if (creditEl) {
    const { source, author, license, url } = dataset.credit;
    creditEl.innerHTML = `MIDI: <a href="${url}" target="_blank" rel="noopener">${source}</a> (${author}) / ${license}`;
  }

  const progressEl = document.getElementById('quiz-progress');
  if (progressEl) {
    progressEl.textContent = `${dataset.pieces.length}曲を収録`;
  }
}

bootstrap();
