// Token Radar — the entry point.
//
// Reads the sealed snapshot at /input/snapshot.json, ranks its protocols
// by implied value with the radar-3 model in lib/model.ts, and writes the
// whole entry into /output:
//
//   board.json      the ranked board (226 rows, the 40 watchlist protocols
//                   plus the pre-token protocols below the floor)
//   data.js         the same rows, as a script the dashboard page loads
//   dashboard/      a copy of this repository's dashboard/
//   screenshots/    a copy of this repository's screenshots/
//   dossier.json    what buildDossier writes from dashboard/ and
//                   screenshots/ (the sealed scorer checks it byte for
//                   byte, so it is built here, never by hand)
//
// The program is deterministic: it reads only the snapshot, never the
// clock and never the network, so two runs write the same bytes.
//
// Run it locally with:
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-board.ts";
import {
  hasToken,
  selectBoard,
  type ScoredProtocol,
  type Snapshot,
} from "./lib/model.ts";

const TARGET_ROWS = 226;
const DOSSIER_TEXT_MAX_BYTES = 65536;
const LIVE_REFERENCE_COUNT = 20;

const repoRoot = dirname(fileURLToPath(import.meta.url));

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0 || index + 1 >= process.argv.length) return null;
  return process.argv[index + 1];
}

function inputPath(): string {
  return (
    argValue("--input") ??
    process.env.MAKEFUN_INPUT ??
    "/input/snapshot.json"
  );
}

function outputDir(): string {
  return (
    argValue("--output") ??
    process.env.MAKEFUN_OUTPUT_DIR ??
    "/output"
  );
}

function readSnapshot(path: string): Snapshot {
  const text = readFileSync(path, "utf8");
  const parsed: unknown = JSON.parse(text);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Snapshot).protocols) ||
    !Array.isArray((parsed as Snapshot).watchlist) ||
    typeof (parsed as Snapshot).as_of !== "string"
  ) {
    throw new Error(`the snapshot at ${path} is not a protocol snapshot`);
  }
  return parsed as Snapshot;
}

// The board's rows, in the shape the gate reads, plus the fields the
// dashboard's detail view needs. Ranks are 1 to N, implied value never
// rises as rank ascends.
function boardRows(scored: ScoredProtocol[]): Record<string, unknown>[] {
  return scored.map((row, index) => ({
    slug: row.slug,
    name: row.name,
    rank: index + 1,
    implied_value_usd: row.implied_value_usd,
    farm_steps: row.farm_steps,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    has_token: row.has_token,
    on_watchlist: row.on_watchlist,
    factors: row.factors,
  }));
}

// The already-live protocols, for the dashboard's Live tab: the twenty
// largest by token market cap. They are a reference, not a ranking — a
// token that already trades has a price, not an implied value — so they
// are kept out of the board and shown beside it for comparison.
function liveReference(snapshot: Snapshot): Record<string, unknown>[] {
  return snapshot.protocols
    .filter((p) => hasToken(p) && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, LIVE_REFERENCE_COUNT)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains.slice(0, 3),
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
    }));
}

function copyDir(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source)) {
    const from = join(source, entry);
    if (!statSync(from).isFile()) continue;
    copyFileSync(from, join(target, entry));
  }
}

function checkBoard(rows: Record<string, unknown>[], snapshot: Snapshot): void {
  const slugs = new Set<string>();
  let previous = Number.POSITIVE_INFINITY;
  rows.forEach((row, index) => {
    const slug = row.slug as string;
    if (slugs.has(slug)) throw new Error(`board repeats slug ${slug}`);
    slugs.add(slug);
    if (row.rank !== index + 1) {
      throw new Error(`board rank ${String(row.rank)} is not ${index + 1}`);
    }
    const implied = row.implied_value_usd as number;
    if (!Number.isInteger(implied) || implied <= 0) {
      throw new Error(`board row ${slug} has no positive implied value`);
    }
    if (implied > previous) {
      throw new Error(`board implied value rises at rank ${index + 1}`);
    }
    previous = implied;
    const steps = row.farm_steps as string[];
    if (!Array.isArray(steps) || steps.length < 3 || steps.length > 12) {
      throw new Error(`board row ${slug} has no farm plan of 3 to 12 steps`);
    }
    for (const step of steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        throw new Error(`board row ${slug} has a farm step outside 20-600 chars`);
      }
    }
  });
  const missing = snapshot.watchlist.filter((slug) => !slugs.has(slug));
  if (missing.length > 0) {
    throw new Error(`board misses watchlist slugs: ${missing.join(", ")}`);
  }
}

function main(): void {
  const input = inputPath();
  const out = outputDir();
  const snapshot = readSnapshot(input);
  const scored = selectBoard(snapshot, TARGET_ROWS);
  const rows = boardRows(scored);
  checkBoard(rows, snapshot);

  const board = {
    as_of: snapshot.as_of,
    rows,
  };
  const data = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    rows,
    live_reference: liveReference(snapshot),
  };

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "board.json"), `${JSON.stringify(board, null, 2)}\n`, "utf8");
  writeFileSync(
    join(out, "data.js"),
    `window.RADAR=${JSON.stringify(data)};\n`,
    "utf8",
  );

  const dashboardSource = join(repoRoot, "dashboard");
  const screenshotsSource = join(repoRoot, "screenshots");
  if (!existsSync(dashboardSource)) {
    throw new Error(`no dashboard/ beside main.ts at ${repoRoot}`);
  }
  if (!existsSync(screenshotsSource)) {
    throw new Error(`no screenshots/ beside main.ts at ${repoRoot}`);
  }
  copyDir(dashboardSource, join(out, "dashboard"));
  copyDir(screenshotsSource, join(out, "screenshots"));

  const dossier = buildDossier(out, { text_max_bytes: DOSSIER_TEXT_MAX_BYTES });
  writeFileSync(join(out, "dossier.json"), dossier);

  const top = rows.slice(0, 5).map((r) => r.name as string);
  const watchlistCovered = snapshot.watchlist.filter((slug) =>
    rows.some((r) => r.slug === slug),
  ).length;
  console.log(`rows: ${rows.length}`);
  console.log(`watchlist covered: ${watchlistCovered}/${snapshot.watchlist.length}`);
  console.log(`top 5: ${top.join(" | ")}`);
  console.log(`dossier bytes: ${dossier.length}`);
  console.log(`wrote ${out}`);
}

main();
