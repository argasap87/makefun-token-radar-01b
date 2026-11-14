// Limber Equinox — token-radar-01, radar-5.
//
// Peer-calibrated implied value. Every multiple below is derived at run time
// from the sealed snapshot's own tokened protocols: for each category, the
// median market-cap / TVL of the tokened protocols in that category. A
// category with fewer than three tokened peers falls back to the market-wide
// median, and every multiple is clamped to [0.02, 2.0] so one thin peer set
// can never set the price. No protocol name is hardcoded anywhere: the board
// is whatever the snapshot's figures say it is.
//
// impliedValueUsd = tvl_usd * peerMultiple * growthFactor * ageFactor, where
// growthFactor reads the protocol's 7-day TVL change and ageFactor reads how
// long it has run with no token recorded.

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

export interface CategoryMultiple {
  category: string;
  multiple: number;
  peers: number;
  fallback: boolean;
}

export interface PeerTable {
  globalMedian: number;
  byCategory: Map<string, CategoryMultiple>;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  multiple: number;
  peers: number;
  multiple_fallback: boolean;
  growth_factor: number;
  age_factor: number;
  implied_value_usd: number;
  watchlist: boolean;
  farm_steps: string[];
}

export const MIN_PEERS = 3;
export const MULTIPLE_MIN = 0.02;
export const MULTIPLE_MAX = 2.0;

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median mcap/TVL per category over the snapshot's tokened protocols. */
export function peerMultiples(protocols: SnapshotProtocol[]): PeerTable {
  const byCategory = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd == null || !(p.tvl_usd > 0) || !(p.mcap_usd > 0)) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    allRatios.push(ratio);
    const cat = p.category ?? "Uncategorised";
    const list = byCategory.get(cat) ?? [];
    list.push(ratio);
    byCategory.set(cat, list);
  }
  const globalMedian = median(allRatios);
  const table: PeerTable = { globalMedian, byCategory: new Map() };
  for (const [cat, ratios] of byCategory) {
    const fallback = ratios.length < MIN_PEERS;
    const raw = fallback ? globalMedian : median(ratios);
    const multiple = Math.min(MULTIPLE_MAX, Math.max(MULTIPLE_MIN, raw));
    table.byCategory.set(cat, { category: cat, multiple, peers: ratios.length, fallback });
  }
  return table;
}

export function multipleFor(table: PeerTable, category: string | null): CategoryMultiple {
  const cat = category ?? "Uncategorised";
  const found = table.byCategory.get(cat);
  if (found) return found;
  return { category: cat, multiple: table.globalMedian, peers: 0, fallback: true };
}

/** 7-day TVL change, in per cent, mapped to a 0.80–1.40 value factor. */
export function growthFactor(p: SnapshotProtocol): number {
  if (p.change_7d == null || !Number.isFinite(p.change_7d)) return 1;
  const clamped = Math.min(80, Math.max(-40, p.change_7d));
  return 1 + clamped / 200;
}

/** Time running with no token: +10% per year listed, capped at +20%. */
export function ageFactor(p: SnapshotProtocol, asOf: Date): number {
  if (!p.listed_at) return 1;
  const listed = new Date(p.listed_at + "T00:00:00Z").getTime();
  if (!Number.isFinite(listed)) return 1;
  const days = (asOf.getTime() - listed) / 86400000;
  if (!(days > 0)) return 1;
  return 1 + 0.1 * Math.min(days / 365, 2);
}

export interface ImpliedBreakdown {
  value: number;
  multiple: number;
  peers: number;
  fallback: boolean;
  growth: number;
  age: number;
}

export function impliedValue(
  p: SnapshotProtocol,
  table: PeerTable,
  asOf: Date
): ImpliedBreakdown {
  const mult = multipleFor(table, p.category);
  const growth = growthFactor(p);
  const age = ageFactor(p, asOf);
  const value = Math.floor(p.tvl_usd * mult.multiple * growth * age);
  return { value, multiple: mult.multiple, peers: mult.peers, fallback: mult.fallback, growth, age };
}

// The house watchlist's exclusion rule, minus its TVL floor: a launch
// candidate records no token and is not a versioned, wrapped, staked or
// bridged product of a protocol whose token already trades, nor an exchange.
const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);
const EXCHANGE_NAMES = [
  "Binance",
  "Coinbase",
  "Bybit",
  "Kraken",
  "Bitget",
  "OKX",
  "Bitfinex",
  "Gemini",
];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;

export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (p.mcap_usd != null || p.gecko_id != null || p.symbol != null) return false;
  if (p.category != null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_OR_STAKED.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

// Gas cost of one ordinary interaction on a chain, in whole dollars, and the
// gas token a reader needs to hold. Used only to price the farm steps.
const GAS: Record<string, { gas: string; token: string }> = {
  Ethereum: { gas: "8", token: "ETH" },
  Base: { gas: "0.50", token: "ETH" },
  Arbitrum: { gas: "0.50", token: "ETH" },
  Optimism: { gas: "0.50", token: "ETH" },
  "zkSync Era": { gas: "0.50", token: "ETH" },
  Linea: { gas: "0.50", token: "ETH" },
  Solana: { gas: "0.05", token: "SOL" },
  BSC: { gas: "0.30", token: "BNB" },
  Polygon: { gas: "0.10", token: "POL" },
  Avalanche: { gas: "0.50", token: "AVAX" },
  Mantle: { gas: "0.30", token: "MNT" },
  Berachain: { gas: "0.20", token: "BERA" },
};
export function gasFor(chain: string): { gas: string; token: string } {
  return GAS[chain] ?? { gas: "1", token: "gas token" };
}

// What farming actually means, per category. {name} {chain} {gas} are filled
// in per protocol, so no two protocols share a step.
interface CategoryPlay {
  core: string;
  second: string;
  unstake: string;
}
const PLAYS: Record<string, CategoryPlay> = {
  Lending: {
    core: "Supply $100-$300 of USDC to {name}'s lending market on {chain} and leave it earning for at least 4 weeks",
    second: "Borrow a small amount against your {name} supply, under 40% of its value, and repay it within a week to show both sides of the market",
    unstake: "no lock-up, minutes",
  },
  Dexs: {
    core: "Swap $100-$300 through {name} on {chain} across at least two different trading pairs",
    second: "Provide $100 of liquidity to one {name} pool on {chain} and hold the position for 4+ weeks",
    unstake: "no lock-up, minutes",
  },
  Yield: {
    core: "Deposit $100-$300 into {name}'s highest-TVL vault on {chain} and leave it compounding for at least 4 weeks",
    second: "Try a second {name} vault with a different asset so your activity spans more than one strategy",
    unstake: "1-3 days",
  },
  "Yield Aggregator": {
    core: "Deposit $100-$300 into {name}'s highest-TVL vault on {chain} and leave it compounding for at least 4 weeks",
    second: "Route a second deposit through a different strategy of {name} so the activity is not a single vault",
    unstake: "1-3 days",
  },
  RWA: {
    core: "Mint or buy $100-$300 of {name}'s tokenized real-world-asset position on {chain} and hold it for at least 4 weeks",
    second: "Reinvest or claim any yield your {name} position pays at least once, so the activity is not a single deposit",
    unstake: "1-3 days",
  },
  "Risk Curators": {
    core: "Deposit $100-$300 into a {name} curated vault on {chain} and leave it allocated for at least 4 weeks",
    second: "Allocate a second, smaller deposit to a different vault or curator strategy run by {name}",
    unstake: "1-3 days",
  },
  "Onchain Capital Allocator": {
    core: "Deposit $100-$300 into a {name} allocation vault on {chain} and leave it allocated for at least 4 weeks",
    second: "Allocate a second, smaller deposit to a different vault run by {name}",
    unstake: "1-3 days",
  },
  CDP: {
    core: "Open a collateralized debt position on {name} on {chain} with $100-$300 of collateral and mint against it at under 40% of its value",
    second: "Repay part of the {name} debt and top up collateral once, keeping the ratio healthy for 4+ weeks",
    unstake: "no lock-up, minutes",
  },
  "Basis Trading": {
    core: "Open a $100-$300 basis position on {name} on {chain} and hold it through at least one funding cycle",
    second: "Close and reopen a smaller {name} basis leg the following week to show repeated, deliberate use",
    unstake: "a day or two",
  },
  Restaking: {
    core: "Restake $100-$300 of liquid staking tokens through {name} on {chain} and leave them restaked for at least 4 weeks",
    second: "Delegate to a second operator through {name}, or restake a different asset once, so the position is not a single click",
    unstake: "7-14 days",
  },
  Derivatives: {
    core: "Open a $100-$300 perpetual or options position on {name} on {chain} at 2x leverage or less and hold it for several days",
    second: "Close the {name} position, then open a smaller one the next week to show repeated trading rather than a single trade",
    unstake: "minutes",
  },
  "Prediction Market": {
    core: "Place $20-$100 of prediction trades on {name} on {chain} across at least three different markets",
    second: "Trade a second market category on {name} the following week to widen your activity beyond one topic",
    unstake: "minutes",
  },
  "Cross Chain Bridge": {
    core: "Bridge $100-$300 through {name} to {chain} and use the funds on the destination chain the same week",
    second: "Bridge a second, smaller amount back the other way through {name} so the activity is a round trip, not a one-way move",
    unstake: "minutes",
  },
};
const DEFAULT_PLAY: CategoryPlay = {
  core: "Use {name}'s main feature on {chain} with $100-$300 and keep the position open for at least 4 weeks",
  second: "Return a second time and use a different feature or pool of {name} so the activity is not a single interaction",
  unstake: "a day or two",
};

function fill(template: string, p: SnapshotProtocol, gas: { gas: string; token: string }): string {
  const chain = p.chains[0] ?? "its main chain";
  return template
    .replaceAll("{name}", p.name)
    .replaceAll("{chain}", chain)
    .replaceAll("{gas}", gas.gas)
    .replaceAll("{token}", gas.token);
}

export function moneyShort(usd: number): string {
  if (usd >= 1e9) return "$" + (usd / 1e9).toFixed(2) + "B";
  if (usd >= 1e6) return "$" + (usd / 1e6).toFixed(1) + "M";
  if (usd >= 1e3) return "$" + (usd / 1e3).toFixed(0) + "K";
  return "$" + Math.round(usd);
}

/** Seven concrete farm steps for one protocol, each priced and timed. */
export function farmSteps(p: SnapshotProtocol): string[] {
  const gas = gasFor(p.chains[0] ?? "");
  const play = PLAYS[p.category ?? ""] ?? DEFAULT_PLAY;
  const chain = p.chains[0] ?? "its main chain";
  return [
    `Before spending anything, open ${p.name}'s docs and official channels and confirm it still records no token, and check whether it runs a points program - 15 minutes, free, and it sets what the next steps should target. (${p.slug})`,
    `Bridge $100-$500 to ${chain} to farm ${p.name} - about $${gas.gas} in gas on ${chain} plus the bridge fee, 10-30 minutes - and keep a little ${gas.token} aside so you can exit later without buying more.`,
    `${fill(play.core, p, gas)} - deposit gas about $${gas.gas}, and the position should stay open 4-12 weeks to count as real use.`,
    `${fill(play.second, p, gas)} - about 10 minutes and $${gas.gas} in gas.`,
    `Come back weekly for 10 minutes: top up, claim or re-stake any rewards, and re-balance if the market moved - each visit costs about $${gas.gas} in gas on ${chain}; leave the position open 6-12 weeks, since a single-day deposit rarely counts for much. ${p.name} holds ${moneyShort(p.tvl_usd)} of TVL.`,
    `Log every deposit hash and screenshot your ${p.name} dashboard and any points balance weekly - free, 5 minutes a week - and complete each quest or task ${p.name} publishes once, in the week it appears.`,
    `Plan the exit before any launch: unwinding takes ${play.unstake} and about $${gas.gas} in gas, so start it early, never pay to rush a claim, and keep the wallet that farmed ${p.name} - rewards go to the address that did the work.`,
  ];
}

export interface BoardBuild {
  rows: BoardRow[];
  table: PeerTable;
  asOf: string;
  multiples: CategoryMultiple[];
  diversity: { category: string; count: number }[];
}

/** The whole board: every launch candidate in the snapshot, ranked by the
 * peer-calibrated implied value. No names are hardcoded; the snapshot decides. */
export function buildBoard(snapshot: Snapshot): BoardBuild {
  const asOf = new Date(snapshot.as_of + "T00:00:00Z");
  const table = peerMultiples(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter(isLaunchCandidate);
  const scored = candidates.map((p) => {
    const b = impliedValue(p, table, asOf);
    return { p, ...b };
  });
  scored.sort((a, b) => b.value - a.value || a.p.slug.localeCompare(b.p.slug));
  const rows: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category ?? "Uncategorised",
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    multiple: s.multiple,
    peers: s.peers,
    multiple_fallback: s.fallback,
    growth_factor: s.growth,
    age_factor: s.age,
    implied_value_usd: s.value,
    watchlist: watchlist.has(s.p.slug),
    farm_steps: farmSteps(s.p),
  }));
  // The multiples actually used on this board, best multiple first.
  const used = new Map<string, CategoryMultiple>();
  for (const r of rows) {
    if (!used.has(r.category)) {
      used.set(r.category, {
        category: r.category,
        multiple: r.multiple,
        peers: r.peers,
        fallback: r.multiple_fallback,
      });
    }
  }
  const multiples = [...used.values()].sort((a, b) => b.multiple - a.multiple);
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  const diversity = [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
  return { rows, table, asOf: snapshot.as_of, multiples, diversity };
}
