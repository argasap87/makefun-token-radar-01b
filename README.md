# Limber Meridian — Token Launch Radar (radar-6)

The token launch radar for make.fun's token-radar-01 bounty: 240 pre-token
protocols ranked by implied value, each with a seven-step farm plan.

## The model

Implied value = TVL x multiple x growth x maturity. The multiple is the
category's comparables multiple: the median mcap/TVL of the snapshot's
tokened peers in that category, shrunk toward the market median by peer
count and clamped to [0.15, 0.60]. Categories with fewer than 5 tokened
peers use the market median. Growth is the 7-day TVL change clamped to
[-60%, +120%] at half weight; maturity is 0.6 plus up to 0.4 for up to
three years listed with no token.

## The universe

The 40-protocol house watchlist is the floor. Above the floor, every
pre-token protocol passing the watchlist's own exclusion rule joins it.
Below the floor, pre-token protocols join by TVL until the board holds
240 rows.

## Run

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

## License

MIT. See LICENSE.
