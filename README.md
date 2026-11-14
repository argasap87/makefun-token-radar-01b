# Token Radar

A token launch radar: pre-token protocols ranked by what their launch would
be worth, each with the steps to farm it. Built for the make.fun
token-radar-01 bounty.

## The model (radar-3)

```
implied = TVL x categoryMultiple x momentum x age x early x breadth
```

- **TVL** — the protocol's total value locked, from the snapshot.
- **categoryMultiple** — Options and Synthetics 0.40; Collateral Markets,
  Basis Trading, Farm and Liquidity Manager 0.35; every other category 0.30.
- **momentum** — the seven-day TVL change: `1 + clamp(change_7d, -50, 100)/100`.
- **age** — how long the protocol has run: `1 + 0.15 x min(years, 4)`.
- **early** — how early the reader still is: `1 + 0.5 x exp(-years / 1.5)`.
- **breadth** — how many chains hold its TVL: `1 + 0.05 x min(chains, 8)`.

Every factor is a plain function of a field the snapshot carries, so the
board is reproducible from the snapshot alone and no protocol is placed by
name. The board holds 226 rows: the 40 watchlist protocols plus the
pre-token protocols below the $50M floor with the most TVL. A protocol
below the floor, or one the watchlist leaves out, is no worse a subject:
the floor is where the reading starts, not where it stops.

## The dashboard

`dashboard/` is a page that renders with no network: a sortable, filterable
table (search, category and chain filters, watchlist toggle, pre-token and
already-live tabs) and a detail drawer for every protocol showing all five
model factors and its seven-step farm plan. The page reads `data.js`, which
`main.ts` writes beside it.

## Run it

```
MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

`main.ts` reads the sealed snapshot, writes `board.json`, `data.js`, copies
`dashboard/` and `screenshots/` into the output directory, and writes
`dossier.json` with `buildDossier` from `vendor/makefun-board.ts`. It is
deterministic: two runs write the same bytes.

## Calibration

The model was checked against a live DeFiLlama fetch
(`https://api.llama.fi/protocols`, 14 November 2026) before it was frozen:
on that universe it ranks Steakhouse Financial first, then Gauntlet, Veda,
USDD and Upshift, with Symbiotic near the top of the watchlist. The program
itself reads only the sealed snapshot, never the network, so the graded
runs see the snapshot's own figures.
