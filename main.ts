// Limber Meridian, radar-6: the entrypoint.
//
// Reads the sealed snapshot at --input (default /input/snapshot.json),
// ranks the pre-token protocols with the shrunk-comparables model, and
// writes the board, the dashboard's data, the dashboard and its
// screenshots, and the dossier into --output (default
// MAKEFUN_OUTPUT_DIR, else /output). Runs the same way twice: no clock,
// no randomness, no network, so both runs write the same bytes.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';

const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };

/** A --name value, --name=value, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (withEquals !== undefined) return withEquals.slice(name.length + 3);
  return fallback;
}

/** Copy a directory tree, skipping dotfiles, creating the target as needed. */
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    const target = join(to, name);
    if (statSync(source).isDirectory()) copyTree(source, target);
    else copyFileSync(source, target);
  }
}

function main(): void {
  const inputFile = arg('input', '/input/snapshot.json');
  const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const repoRoot = dirname(fileURLToPath(import.meta.url));

  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) throw new Error(`board refused: ${issue}`);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));
  const dashboardDir = join(repoRoot, 'dashboard');
  if (existsSync(dashboardDir)) copyTree(dashboardDir, join(out, 'dashboard'));
  const screenshotsDir = join(repoRoot, 'screenshots');
  if (existsSync(screenshotsDir)) copyTree(screenshotsDir, join(out, 'screenshots'));

  const dossier = buildDossier(out, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: DASHBOARD_CAPS,
  });
  writeFileSync(join(out, 'dossier.json'), dossier);

  const top = board.slice(0, 5).map((r) => `#${r.rank} ${r.slug} $${Math.round(r.implied_value_usd / 1e6)}M`).join(', ');
  const steps = new Set(board.flatMap((r) => r.farm_steps));
  console.log(`radar-6: ${board.length} rows, ${steps.size} unique farm steps, dossier ${dossier.length} bytes`);
  console.log(`radar-6: top 5: ${top}`);
}

main();
