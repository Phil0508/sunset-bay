// Sunset Bay: hand-in program for the make.fun "Make GTA 6" bounty (gta6-01).
//
// The game itself is the static folder game/ (index.html + ES modules + a vendored three.js build,
// no network requests). This program only packages it: it copies game/ and screenshots/ into the
// output directory and writes dossier.json, the summary the judge reads, using make.fun's vendored
// buildDossier. Plain Node, standard library only.
//
// Play locally:   node serve.ts   then open http://localhost:8080
// Build dossier:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//                 (the grader runs it with /output as the output directory)

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repo = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Limits the scorer enforces; the entry is refused if the game or screenshots go over them.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyFolder(name: string, required: boolean): void {
  const from = join(repo, name);
  const to = join(outDir, name);
  if (!existsSync(from)) {
    if (required) throw new Error(`missing ${name}/ next to main.ts`);
    mkdirSync(to, { recursive: true });
    return;
  }
  rmSync(to, { recursive: true, force: true }); // never leave stale files from an earlier run
  cpSync(from, to, { recursive: true });
}

mkdirSync(outDir, { recursive: true });
copyFolder('game', true);
copyFolder('screenshots', false);

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, CAPS));
console.log(`dossier written to ${join(outDir, 'dossier.json')}`);
