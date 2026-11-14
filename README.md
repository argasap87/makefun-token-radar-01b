# Token Radar — radar-4

Which pre-token protocol launches biggest? A radar over DeFiLlama's public
protocol list, ranked by an implied launch value that is a plain function of
the snapshot — no protocol is placed by name.

## Model (unchanged since radar-3)

    implied = TVL × categoryMultiple × momentum × age × early × breadth

- **categoryMultiple**: Options / Synthetics 0.40; Collateral Markets,
  Basis Trading, Farm, Liquidity Manager 0.35; every other category 0.30.
- **momentum**: 1 + 7-day TVL change, clamped to −50…+100%.
- **age**: 1 + 0.15 × years running, capped at 4 years.
- **early**: 1 + 0.5 × e^(−years / 1.5) — younger protocols score higher,
  because a launch is more of the story.
- **breadth**: 1 + 0.05 × chains, capped at 8.

## Board

226 rows: the 40 watchlist protocols, plus the pre-token protocols below
the $50M floor with the most TVL. A protocol counts as pre-token when the
snapshot records no token for it (`gecko_id` and `symbol` both empty) —
never "has none", only "records no token". This run's top 5: Steakhouse
Financial, Gauntlet, Veda, USDD, Upshift.

## Farm plans (radar-4)

Each row carries a 7-step farm plan built from that protocol's own record —
its name, category, chains, TVL, 7-day change, age and rank. Ten playbooks
cover the category families (curators, exchanges, lending, yield, RWA,
staking, bridges, basis, options, everything else), and every step quotes
the row's own numbers: a test deposit sized to its TVL, gas on its first
chain, its rank and implied value with all five factors shown, and a cap
per position. No step is shared between two rows.

## Dashboard

`dashboard/` is a dependency-free page over `data.js`: a sortable,
filterable table (search, category and chain filters, watchlist toggle,
pre-token / already-live tabs), a detail drawer per protocol showing all
five model factors and the identical 7-step farm plan, and a
category-diversity strip — the strongest protocol in each of the strongest
non-curator categories — because the top of the board is vault-curator
heavy. The strip does not change the model; it only surfaces breadth.

Deep links: `#p=<slug>` opens a protocol's drawer,
`#category=<name>` filters to a category.

## Run

    MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json

Reads `/input/snapshot.json`, writes `/output/board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json`. The program is
deterministic: running it twice writes byte-identical board.json, data.js
and dossier.json.
