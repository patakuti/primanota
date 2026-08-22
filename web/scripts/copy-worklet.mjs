// spessasynth_lib ships its AudioWorklet processor as a plain JS file that
// must be served as a static asset (fetched by name via
// `audioContext.audioWorklet.addModule()`), not bundled by Vite -- so we copy
// it into public/ after every `npm install`, keeping it in lockstep with
// whatever version of the package is actually installed (02_design.md 4.8).
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'node_modules', 'spessasynth_lib', 'dist', 'spessasynth_processor.min.js');
const destDir = join(here, '..', 'public');

mkdirSync(destDir, { recursive: true });
copyFileSync(src, join(destDir, 'spessasynth_processor.min.js'));
console.log('Copied spessasynth_processor.min.js to public/');
