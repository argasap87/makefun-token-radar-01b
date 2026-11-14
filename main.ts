// Token Radar — radar-4 entrypoint.
//
// Reads the sealed snapshot, builds the 226-row board, and writes the
// sealed outputs: board.json, data.js (the dashboard's data, beside the
// page), dashboard/ and screenshots/ copies, and dossier.json via
// make.fun's buildDossier. Every byte written is a deterministic function
// of the snapshot: no clock, no randomness, so running twice writes the
// same bytes.
//
// Usage:  MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
// Defaults: input /input/snapshot.json, output $MAKEFUN_OUTPUT_DIR or /output.

import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildDossier } from "./vendor/makefun-board.ts";
import {
  buildBoard,
  liveList,
  fmtUsd,
  type Snapshot,
} from "./lib/model.ts";

const root = dirname(fileURLToPath(import.meta.url));

function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const inputPath = argValue("--input", "/input/snapshot.json");
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

const snapshot = JSON.parse(readFileSync(inputPath, "utf-8")) as Snapshot;
const rows = buildBoard(snapshot);
const live = liveList(snapshot, 40).map((p) => ({
  slug: p.slug,
  name: p.name,
  category: p.category ?? "Uncategorised",
  chains: p.chains,
  tvl_usd: p.tvl_usd,
  change_7d: p.change_7d,
  mcap_usd: p.mcap_usd,
  listed_at: p.listed_at,
}));

mkdirSync(outDir, { recursive: true });

const board = {
  as_of: snapshot.as_of,
  model: "radar-4",
  floor_usd: snapshot.floor_usd,
  rows,
};
writeFileSync(join(outDir, "board.json"), JSON.stringify(board, null, 2) + "\n", "utf-8");

const data = {
  as_of: snapshot.as_of,
  model: "radar-4",
  rows,
  live,
};
writeFileSync(join(outDir, "data.js"), "window.RADAR=" + JSON.stringify(data) + ";\n", "utf-8");

cpSync(join(root, "dashboard"), join(outDir, "dashboard"), { recursive: true });
cpSync(join(root, "screenshots"), join(outDir, "screenshots"), { recursive: true });

const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
writeFileSync(join(outDir, "dossier.json"), dossier);

const watchCount = rows.filter((r) => r.watchlist).length;
console.log("token-radar radar-4");
console.log("as_of: " + snapshot.as_of);
console.log("rows: " + rows.length + " (watchlist " + watchCount + "/40)");
console.log("top 5:");
for (const r of rows.slice(0, 5)) {
  console.log("  #" + r.rank + " " + r.name + " [" + r.category + "] " + fmtUsd(r.implied_value_usd) + " implied, TVL " + fmtUsd(r.tvl_usd));
}
console.log("live tab: " + live.length + " token-bearing protocols");
console.log("wrote " + outDir + "/board.json, data.js, dashboard/, screenshots/, dossier.json");
