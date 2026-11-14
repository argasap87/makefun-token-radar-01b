# Limber Equinox — Token Launch Radar (radar-5)

A token launch radar for make.fun's token-radar-01 bounty ($1,325, deadline 14 Dec 2026).

## What it does

`main.ts` reads the sealed DeFiLlama snapshot (`/input/snapshot.json`), ranks every
launch candidate — a protocol that records no token and is not a versioned, wrapped,
staked or bridged product of a protocol whose token already trades, nor an exchange —
by its peer-calibrated implied value, and writes the board, the dashboard data, the
dashboard, the screenshots and the dossier into the output directory.

## The model (lib/model.ts)

```
implied value = TVL x peer multiple x growth x age
```

- **Peer multiple**: the median market-cap / TVL of the tokened protocols in the
  same category, computed at run time from the snapshot. A category with fewer
  than 3 tokened peers falls back to the market-wide median (0.2138 on this
  snapshot). Multiples are clamped to 0.02–2.00. No protocol name is hardcoded.
- **Growth**: the protocol's 7-day TVL change, mapped to a 0.80–1.40 factor.
- **Age**: +10% per year the protocol has run with no token recorded, capped at +20%.

On the 2026-11-14 snapshot this gives 198 launch candidates, the house watchlist
covered 40/40, topped by Steakhouse Financial at about $669M implied value.

## The dashboard

`dashboard/` is a static page (no network): a sortable, filterable board of 15 rows
per page, a detail view for every protocol with its value breakdown and seven
concrete farm steps (each priced in gas and timed), a diversity strip, and the full
peer-multiples table the model used.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Two runs on the same snapshot write the same bytes.

## License

MIT — see LICENSE.
