// Token Radar — the value model (radar-3).
//
// A protocol's implied value answers one question: if this protocol issued a
// token tomorrow and its record stayed exactly as it is, what would that
// token be worth? The answer is built only from the snapshot's own figures:
//
//   implied = TVL x categoryMultiple x momentum x age x early x breadth
//
// Every factor is a plain function of a field the snapshot carries, so the
// board is reproducible from the snapshot alone and no protocol is placed
// by name. The factors are all bounded and every one of them is shown on
// the protocol's detail view, so a reader can see exactly how a rank was
// earned.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelFactors {
  category: number;
  momentum: number;
  age: number;
  early: number;
  breadth: number;
}

export interface ScoredProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  has_token: boolean;
  on_watchlist: boolean;
  implied_value_usd: number;
  factors: ModelFactors;
  farm_steps: string[];
}

// Category multiples (radar-3). A token's worth tracks the category's
// typical value per dollar of TVL: trading and derivatives venues command
// the richest multiples, the farming and collateral businesses the next
// tier, and every other category the base rate. The table is the whole
// story — no protocol is ever given a multiple of its own.
//
//   Options, Synthetics ............ 0.40
//   Collateral Markets, Basis
//   Trading, Farm, Liquidity
//   Manager ........................ 0.35
//   every other category ........... 0.30
export const CATEGORY_MULTIPLES: Readonly<Record<string, number>> = {
  Options: 0.4,
  Synthetics: 0.4,
  "Collateral Markets": 0.35,
  "Basis Trading": 0.35,
  Farm: 0.35,
  "Liquidity Manager": 0.35,
};

export const DEFAULT_CATEGORY_MULTIPLE = 0.3;

export function categoryMultiple(category: string | null): number {
  if (category === null) return DEFAULT_CATEGORY_MULTIPLE;
  return CATEGORY_MULTIPLES[category] ?? DEFAULT_CATEGORY_MULTIPLE;
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

// Momentum: the protocol's seven-day TVL change, as reported by the
// snapshot. A protocol growing 100% in a week doubles its factor; one
// shrinking 50% halves it; a flat or unreported week leaves it at 1.
export function momentumFactor(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 1;
  return 1 + clamp(change7d, -50, 100) / 100;
}

// Days between two UTC dates written YYYY-MM-DD. Returns null when either
// date is missing or unparsable, so the caller can fall back to neutral.
export function daysBetween(fromDay: string | null, toDay: string): number | null {
  if (fromDay === null) return null;
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const days = Math.floor((to - from) / 86400000);
  return days < 0 ? 0 : days;
}

// Age: how long the protocol has run, in years since the snapshot first
// tracked it. A longer record is a more proven one, so the factor rises
// with age and stops at four years: 1.00 for a newcomer, up to 1.60.
export function ageFactor(listedAt: string | null, asOf: string): number {
  const days = daysBetween(listedAt, asOf);
  if (days === null) return 1;
  const years = days / 365.25;
  return 1 + 0.15 * Math.min(years, 4);
}

// Early: how early the reader still is. A protocol listed a month ago
// with no token is at the very start of its pre-token window; one that
// has run five years without issuing is near the end of it. The factor
// starts at 1.50 and decays toward 1.00 with a half-life of about a year.
export function earlyFactor(listedAt: string | null, asOf: string): number {
  const days = daysBetween(listedAt, asOf);
  if (days === null) return 1;
  const years = days / 365.25;
  return 1 + 0.5 * Math.exp(-years / 1.5);
}

// Breadth: how many chains the protocol's TVL sits on. A protocol live
// on eight or more chains reaches the cap; a single-chain one stays at 1.
export function breadthFactor(chains: string[]): number {
  const count = Array.isArray(chains) ? chains.length : 0;
  return 1 + 0.05 * Math.min(count, 8);
}

export function scoreFactors(
  protocol: SnapshotProtocol,
  asOf: string,
): ModelFactors {
  return {
    category: categoryMultiple(protocol.category),
    momentum: momentumFactor(protocol.change_7d),
    age: ageFactor(protocol.listed_at, asOf),
    early: earlyFactor(protocol.listed_at, asOf),
    breadth: breadthFactor(protocol.chains),
  };
}

// The implied value in whole dollars: TVL times the five factors, rounded
// to the nearest dollar. Always positive for any protocol the snapshot
// carries, because TVL is at least $5,000,000 and every factor is above 0.
export function impliedValue(protocol: SnapshotProtocol, asOf: string): number {
  const factors = scoreFactors(protocol, asOf);
  const value =
    protocol.tvl_usd *
    factors.category *
    factors.momentum *
    factors.age *
    factors.early *
    factors.breadth;
  return Math.max(1, Math.round(value));
}

// The snapshot records no token when both the CoinGecko id and the ticker
// are null. That is the record's word, not a claim the protocol has none.
export function hasToken(protocol: SnapshotProtocol): boolean {
  return protocol.gecko_id !== null || protocol.symbol !== null;
}

export function primaryChain(protocol: SnapshotProtocol): string {
  if (Array.isArray(protocol.chains) && protocol.chains.length > 0) {
    return protocol.chains[0];
  }
  return "its main chain";
}

function money(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)}M`;
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

// Farm steps: seven concrete steps per protocol, written from its category
// and its main chain, each with what it costs and how long it takes. The
// steps are generated, never stored, so the drawer and the board can never
// disagree: both read the same array from the same row.
export function farmSteps(protocol: SnapshotProtocol): string[] {
  const name = protocol.name;
  const chain = primaryChain(protocol);
  const tvl = money(protocol.tvl_usd);
  const cat = (protocol.category ?? "").toLowerCase();
  const steps: string[] = [];

  if (cat.includes("dex") || cat.includes("swap") || cat.includes("exchange")) {
    steps.push(
      `Connect a wallet to ${name} on ${chain} and swap $25 to $50 of a major asset for another one, to register as an active trader (about 5 minutes, gas roughly $0.50 to $3 on ${chain}).`,
    );
    steps.push(
      `Add $100 to $500 of liquidity to one of ${name}'s deepest pools on ${chain} and keep the LP position open, so the protocol counts you as a liquidity provider (${tvl} TVL in total, about 10 minutes plus gas).`,
    );
    steps.push(
      `Place one more swap of at least $50 every week for the next month, varying the pair each time, so your activity reads as sustained use rather than a single visit (about 5 minutes a week).`,
    );
    steps.push(
      `If ${name} offers a points or volume program, opt in before your next trade and check that your wallet shows up on its leaderboard within a day (free, about 5 minutes).`,
    );
    steps.push(
      `Leave the liquidity in place for at least 30 days and collect the trading fees it earns, which on ${chain} usually run a few dollars a month per $100 provided.`,
    );
    steps.push(
      `Join ${name}'s public chat or forum and vote on one governance poll or give feedback on one feature, so your address is tied to the community as well as to volume (about 10 minutes, free).`,
    );
    steps.push(
      `Before any token snapshot, withdraw only half the position and keep the rest working: an address that exits everything at once often reads as a farmer, not a user (about 5 minutes plus gas).`,
    );
  } else if (cat.includes("lend")) {
    steps.push(
      `Connect a wallet to ${name} on ${chain} and supply $100 to $300 of a major asset as collateral, so the protocol records you as a lender (about 5 minutes, gas roughly $0.50 to $3 on ${chain}).`,
    );
    steps.push(
      `Borrow 30 to 40 percent of your supplied value in a stable asset, keeping the health factor above 2, and hold the loan for at least two weeks (interest usually under 5 percent a year).`,
    );
    steps.push(
      `Repay a quarter of the loan, then borrow it again the following week, so the position shows repeated use across more than one month (about 10 minutes a week).`,
    );
    steps.push(
      `If ${name} runs a points program, confirm your supplied balance appears in it within a day and note the rate it pays per dollar supplied (free, about 5 minutes).`,
    );
    steps.push(
      `Add a second supplied asset from a different chain ${name} supports, so the position is not a single-asset, single-day deposit (about 10 minutes plus gas).`,
    );
    steps.push(
      `Keep the position open for at least 60 days and never let the health factor fall below 1.5, topping up collateral after any sharp market move (about 5 minutes when needed).`,
    );
    steps.push(
      `Close the loan in stages near the end, repaying half first and leaving the supply earning yield until any snapshot is announced (about 10 minutes plus gas).`,
    );
  } else if (cat.includes("yield") || cat.includes("vault") || cat.includes("farm")) {
    steps.push(
      `Connect a wallet to ${name} on ${chain} and deposit $100 to $500 into its highest-TVL vault, accepting the vault's strategy and fee schedule first (about 10 minutes, gas roughly $0.50 to $3 on ${chain}).`,
    );
    steps.push(
      `Hold the vault position for at least 30 days without withdrawing, since vault points and rewards usually accrue by time in the vault, not by deposit size alone.`,
    );
    steps.push(
      `Add a second deposit of $50 or more in the third week, from the same wallet, so the record shows an ongoing depositor rather than a one-off deposit (about 10 minutes plus gas).`,
    );
    steps.push(
      `If the vault auto-compounds, leave compounding on; if it pays out manually, claim and redeposit the rewards once a month to keep the balance growing (about 5 minutes a claim).`,
    );
    steps.push(
      `Check the vault's reported yield once a week and move to a different ${name} vault only if the yield falls by more than a third for two weeks running (about 5 minutes a check).`,
    );
    steps.push(
      `If ${name} tracks points, confirm your vault balance is counted within a day of depositing and keep a screenshot of the points page for your records (free, about 5 minutes).`,
    );
    steps.push(
      `Withdraw in two halves when you exit, a week apart, and leave a small dust balance in the vault until any token announcement, so the address still reads as active (about 10 minutes plus gas).`,
    );
  } else if (cat.includes("restak") || cat.includes("staking")) {
    steps.push(
      `Connect a wallet to ${name} on ${chain} and restake $100 to $300 of a liquid staking token through its restaking flow, confirming the operator and the lock terms first (about 10 minutes, gas roughly $0.50 to $3 on ${chain}).`,
    );
    steps.push(
      `Delegate the restaked position to an operator with a long uptime record and a commission under 10 percent, rather than the default, so the position earns the full restaking yield.`,
    );
    steps.push(
      `Hold the restaked position for at least 60 days, since restaking rewards and any points accrue by time staked and early exits usually forfeit the bonus (no action needed while holding).`,
    );
    steps.push(
      `Top up the position by $50 or more once a month from the same wallet, so the record shows a growing stake across several snapshots (about 10 minutes a month plus gas).`,
    );
    steps.push(
      `If ${name} lets you pick which services your stake secures, opt into at least two, because a stake securing more services usually earns more than a stake securing one (about 10 minutes).`,
    );
    steps.push(
      `Check the position's rewards once a week and claim them only when the claim is worth more than the gas it costs, then restake the claim (about 5 minutes a check).`,
    );
    steps.push(
      `Unstake in stages if you exit, leaving half staked until any token announcement, because a full instant exit reads as mercenary rather than committed (unstaking can take days to weeks).`,
    );
  } else if (
    cat.includes("deriv") ||
    cat.includes("option") ||
    cat.includes("synthetic") ||
    cat.includes("perp")
  ) {
    steps.push(
      `Connect a wallet to ${name} on ${chain} and open a small leveraged position of $50 to $100 with 2x leverage at most, so the protocol records you as a trader without risking a liquidation (about 10 minutes, gas roughly $0.50 to $3 on ${chain}).`,
    );
    steps.push(
      `Close the position after a few days with a small profit or a small loss, then open a second one the following week, so the record shows repeated trading rather than a single trade (about 10 minutes a trade).`,
    );
    steps.push(
      `Keep every position's margin above twice the maintenance level and set a stop loss on each one, because a liquidation usually erases any points the trade earned (about 5 minutes a position).`,
    );
    steps.push(
      `If ${name} runs a trading competition or points season, join it before your next trade and check your volume is counted within a day (free, about 5 minutes).`,
    );
    steps.push(
      `Provide $50 to $100 as margin to the protocol's vault or liquidity side as well as trading, so you count on both sides of its book (about 10 minutes plus gas).`,
    );
    steps.push(
      `Trade at least once a week for a month, varying the market each time, and keep total volume under ten times your deposit so no single loss wipes the position out.`,
    );
    steps.push(
      `Wind positions down gradually before any snapshot and leave the margin account funded, so the address still reads as an active trader when the snapshot is taken (about 10 minutes).`,
    );
  } else if (
    cat.includes("stable") ||
    cat.includes("cdp") ||
    cat.includes("algo")
  ) {
    steps.push(
      `Connect a wallet to ${name} on ${chain} and mint $50 to $200 of its stable asset against $150 to $600 of collateral, keeping the collateral ratio above 200 percent (about 10 minutes, gas roughly $0.50 to $3 on ${chain}).`,
    );
    steps.push(
      `Hold the minted stable asset for at least 30 days instead of swapping it away at once, since holding is what the protocol's own records reward (no action needed while holding).`,
    );
    steps.push(
      `Use the minted stable asset in one of ${name}'s own pools or savings modules for a week, so the same dollars count as both a mint and a use of the protocol (about 10 minutes).`,
    );
    steps.push(
      `Top up the collateral by $50 or more in the third week to push the collateral ratio higher, which lowers liquidation risk and reads as a committed minter (about 10 minutes plus gas).`,
    );
    steps.push(
      `If ${name} pays interest on the stable asset, claim it once a month and either hold it or convert it back into collateral (about 5 minutes a claim).`,
    );
    steps.push(
      `Check the collateral ratio once a week and add collateral after any 10 percent market drop, never letting the ratio fall near the liquidation line (about 5 minutes a check).`,
    );
    steps.push(
      `Repay the minted amount in two halves a week apart when you exit, keeping the collateral locked until any token announcement, so the address still reads as active (about 10 minutes plus gas).`,
    );
  } else if (
    cat.includes("collateral") ||
    cat.includes("basis") ||
    cat.includes("liquidity manager")
  ) {
    steps.push(
      `Connect a wallet to ${name} on ${chain} and open a $100 to $300 position in its main product, reading the fee schedule and the exit terms before you confirm (about 10 minutes, gas roughly $0.50 to $3 on ${chain}).`,
    );
    steps.push(
      `Hold the position for at least 30 days, because this kind of protocol rewards time in the position far more than the size of a single deposit.`,
    );
    steps.push(
      `Add $50 or more to the same position in the third week, from the same wallet, so the record shows a growing position across more than one snapshot (about 10 minutes plus gas).`,
    );
    steps.push(
      `If ${name} publishes a points rate, confirm your position is counted within a day and note how many points a dollar earns per day, so you can judge whether to add more (free, about 5 minutes).`,
    );
    steps.push(
      `Check the position once a week and rebalance only when its range or ratio has drifted by more than a quarter, rather than churning it daily and paying gas each time (about 5 minutes a check).`,
    );
    steps.push(
      `Try the position on a second chain ${name} supports with a smaller $50 amount, so the address is active on more than one chain (about 10 minutes plus gas).`,
    );
    steps.push(
      `Exit in two halves a week apart when you leave, keeping a small balance working until any token announcement, so the address still reads as a live user (about 10 minutes plus gas).`,
    );
  } else {
    steps.push(
      `Connect a wallet to ${name} on ${chain} and make a first real transaction of $50 to $100 in its core product, reading the fees and the risks before you confirm (about 10 minutes, gas roughly $0.50 to $3 on ${chain}).`,
    );
    steps.push(
      `Repeat the same action once a week for the next month, from the same wallet, so the protocol's records show a returning user rather than a single visit (about 10 minutes a week).`,
    );
    steps.push(
      `Hold the resulting position for at least 30 days, since most protocols weight time in the product more heavily than the size of one transaction.`,
    );
    steps.push(
      `If ${name} runs a points program, opt in before your second transaction and confirm your activity is counted within a day (free, about 5 minutes).`,
    );
    steps.push(
      `Put $50 or more into a second feature of ${name} — a different pool, vault or market — so the address is active in more than one place (about 10 minutes plus gas).`,
    );
    steps.push(
      `Join ${name}'s public chat or forum and answer one question or vote on one poll, tying the wallet to the community as well as to on-chain use (about 10 minutes, free).`,
    );
    steps.push(
      `Wind the position down in two halves a week apart when you exit, leaving a small balance until any token announcement, so the address still reads as active (about 10 minutes plus gas).`,
    );
  }
  return steps.slice(0, 7);
}

// Pick the board: every watchlist protocol, plus the pre-token protocols
// below the floor with the most TVL, up to targetRows rows. The extra rows
// sit below the floor on purpose: the watchlist is the radar's headline,
// the protocols under it are the early ones it exists to find. When the
// snapshot holds fewer pre-token protocols below the floor than the
// target, the remaining rows go to the largest protocols below the floor
// that already have a token, so the board still reaches its size — those
// rows are flagged has_token and the page separates them on its own tab.
// The returned rows are ranked by implied value, highest first, with ties
// broken by TVL and then by slug, so the ranking is fully deterministic.
export function selectBoard(
  snapshot: Snapshot,
  targetRows: number,
): ScoredProtocol[] {
  const asOf = snapshot.as_of;
  const watchlist = new Set(snapshot.watchlist);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));

  const picked: SnapshotProtocol[] = [];
  for (const slug of snapshot.watchlist) {
    const protocol = bySlug.get(slug);
    if (protocol !== undefined) picked.push(protocol);
  }
  const pickedSlugs = new Set(picked.map((p) => p.slug));

  const belowFloor = snapshot.protocols
    .filter((p) => !pickedSlugs.has(p.slug) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  const preToken = belowFloor.filter((p) => !hasToken(p));
  const live = belowFloor.filter((p) => hasToken(p));
  for (const protocol of preToken) {
    if (picked.length >= targetRows) break;
    picked.push(protocol);
    pickedSlugs.add(protocol.slug);
  }
  for (const protocol of live) {
    if (picked.length >= targetRows) break;
    picked.push(protocol);
  }

  const scored: ScoredProtocol[] = picked.map((p) => {
    const factors = scoreFactors(p, asOf);
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      has_token: hasToken(p),
      on_watchlist: watchlist.has(p.slug),
      implied_value_usd: impliedValue(p, asOf),
      factors,
      farm_steps: farmSteps(p),
    };
  });

  scored.sort(
    (a, b) =>
      b.implied_value_usd - a.implied_value_usd ||
      b.tvl_usd - a.tvl_usd ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
  return scored;
}
