// Limber Equinox — token-radar-01, radar-5.
//
// Reads the sealed snapshot, ranks every launch candidate by its
// peer-calibrated implied value (see lib/model.ts), and writes the board,
// the dashboard data, the dashboard, the screenshots and the dossier.
//
// Usage: node main.ts [--input <snapshot.json>] [--output <dir>]
//   --input defaults to /input/snapshot.json (the grade sandbox path).
//   --output defaults to $MAKEFUN_OUTPUT_DIR, then /output.
// The program is deterministic: two runs on the same snapshot write the
// same bytes (no clocks, no randomness, stable sort with a slug tiebreak).

import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-board.ts";
import { buildBoard } from "./lib/model.ts";
import type { Snapshot } from "./lib/model.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const inputPath = argValue("--input") ?? "/input/snapshot.json";
  const outDir =
    argValue("--output") ?? process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  const snapshot = JSON.parse(readFileSync(inputPath, "utf8")) as Snapshot;
  const built = buildBoard(snapshot);
  const rows = built.rows;

  // The gate's own invariants, checked before anything is written.
  if (rows.length < 100) throw new Error(`board too small: ${rows.length} rows`);
  const watchlist = new Set(snapshot.watchlist);
  const covered = rows.filter((r) => r.watchlist).length;
  if (covered !== watchlist.size) {
    throw new Error(`watchlist coverage ${covered}/${watchlist.size}`);
  }
  const seenSlugs = new Set<string>();
  const seenSteps = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.rank !== i + 1) throw new Error(`rank break at ${r.slug}`);
    if (seenSlugs.has(r.slug)) throw new Error(`duplicate slug ${r.slug}`);
    seenSlugs.add(r.slug);
    if (i > 0 && r.implied_value_usd > rows[i - 1].implied_value_usd) {
      throw new Error(`implied value rises at rank ${r.rank}`);
    }
    if (r.implied_value_usd <= 0) throw new Error(`non-positive value at ${r.slug}`);
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      throw new Error(`farm step count ${r.farm_steps.length} at ${r.slug}`);
    }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) {
        throw new Error(`farm step length ${t.length} at ${r.slug}`);
      }
      if (seenSteps.has(t)) throw new Error(`duplicate farm step at ${r.slug}`);
      seenSteps.add(t);
    }
  }

  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, "dashboard"), { recursive: true });
  mkdirSync(join(outDir, "screenshots"), { recursive: true });

  // board.json: the ranked board, with the model breakdown on every row.
  const board = {
    site: "Limber Equinox",
    as_of: built.asOf,
    snapshot_protocols: snapshot.protocols.length,
    watchlist: snapshot.watchlist.length,
    global_median_multiple: built.table.globalMedian,
    rows,
  };
  writeFileSync(join(outDir, "board.json"), JSON.stringify(board, null, 2) + "\n");

  // data.js: everything the dashboard renders, beside the page.
  const data = {
    site: "Limber Equinox",
    as_of: built.asOf,
    snapshot_protocols: snapshot.protocols.length,
    watchlist_count: snapshot.watchlist.length,
    floor_usd: snapshot.floor_usd,
    global_median_multiple: built.table.globalMedian,
    multiples: built.multiples,
    diversity: built.diversity,
    rows,
  };
  writeFileSync(
    join(outDir, "data.js"),
    "window.LIMBER_DATA = " + JSON.stringify(data) + ";\n"
  );

  // The dashboard and its screenshots, copied whole into /output.
  cpSync(join(ROOT, "dashboard"), join(outDir, "dashboard"), { recursive: true });
  cpSync(join(ROOT, "screenshots"), join(outDir, "screenshots"), { recursive: true });

  // dossier.json: byte for byte what the kit library writes from them.
  const dossier = await buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, "dossier.json"), dossier);

  console.log(
    `Limber Equinox radar-5: ${rows.length} rows, ` +
      `watchlist ${covered}/${watchlist.size}, ` +
      `top ${rows[0].name} ${rows[0].implied_value_usd}, ` +
      `global median multiple ${built.table.globalMedian.toFixed(4)}`
  );
}

// No top-level await: the grade sandbox loads this file as CommonJS, where
// top-level await is a syntax error. The promise chain drains before exit.
main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
