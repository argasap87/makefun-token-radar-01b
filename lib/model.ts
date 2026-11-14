// Limber Meridian, radar-6: the token launch radar's model.
//
// The board ranks the protocols whose token the snapshot records as not
// existing yet, by what that token would be worth if the protocol's record
// stayed as it is. The value is a comparable multiple of TVL: every
// category's multiple is measured from the snapshot's own tokened
// protocols, then shrunk toward the market median and clamped, so no
// category can price a protocol at a wild multiple of its TVL.
//
//   multiple(category) = clamp(shrink(median(mcap/TVL of tokened peers)),
//                              market median, [0.15, 0.60])
//   shrink(median, n)  = (n / (n + 5)) * median + (5 / (n + 5)) * market
//   implied            = TVL * multiple * growth * maturity
//   growth             = 1 + clamp(change_7d, -60, 120) / 100 * 0.5
//   maturity           = 0.6 + min(age_days, 1095) / 1095 * 0.4
//
// The shrink is the point: a category with many tokened peers speaks for
// itself, a category with few peers borrows the market's voice, and the
// clamp keeps the board honest. A board whose implied values stop tracking
// TVL is a board that ranks labels, not protocols.
//
// The universe is the watchlist (the floor) plus every pre-token protocol
// above the floor that passes the watchlist's own exclusion rule, plus the
// pre-token protocols below the floor by TVL, to 240 rows. The exclusion
// rule is the house's: no exchange, no bridge or staking product of a
// token that already trades, no wrapped or staked name, no version pool.
// Protocols the rule leaves out below the floor are still ranked: the
// floor is a floor, never a ceiling.

/** One protocol as the sealed snapshot records it. */
export interface SnapProtocol {
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

/** The sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapProtocol[];
  watchlist: string[];
}

/** The model's constants, printed on the dashboard and changeable nowhere else. */
export interface ModelTuning {
  mult_floor: number;
  mult_cap: number;
  shrink_prior: number;
  min_peers: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const TUNING: ModelTuning = {
  mult_floor: 0.15,
  mult_cap: 0.6,
  shrink_prior: 5,
  min_peers: 5,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

export const MODEL_VERSION = 'radar-6';
export const BOARD_TARGET = 240;
export const LIVE_ROWS = 24;

/** One row of board.json. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    multiple_basis: string;
    peers: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** One row of the multiples table the dashboard shows. */
export interface MultipleRow {
  category: string;
  peers: number;
  raw_median: number | null;
  multiple: number;
  basis: string;
}

/** The dashboard's compact row, with the farm plan generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  multiple_basis: string;
  peers: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
}

/** A protocol whose token already trades: the market's value, never the model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelTuning;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  market_multiple: number;
  rows: RadarRow[];
  live: LiveRow[];
  multiples: MultipleRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whole days from `listedAt` to `asOf`; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The snapshot records no token at all for this protocol. */
export function isPreToken(p: SnapProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCHANGE_FIRST = new Set(['binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini']);
const EXCLUDED_ABOVE_FLOOR = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** The house watchlist's own exclusion rule, applied to an above-floor protocol. */
export function passesExclusion(p: SnapProtocol): boolean {
  if (p.category !== null && EXCLUDED_ABOVE_FLOOR.has(p.category)) return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  const words = p.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0);
  if (words.some((w) => w === 'wrapped' || w === 'staked' || w === 'staking')) return false;
  if (words.length > 0 && EXCHANGE_FIRST.has(words[0]!)) return false;
  return true;
}

/** A below-floor protocol the early radar may carry: pre-token, no exchange, no version pool. */
export function isEarlyRankable(p: SnapProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED_NAME.test(p.name);
}

/** The tokened peers' mcap/TVL ratios, grouped by category, plus the market median. */
export interface PeerTable {
  byCategory: Map<string, number[]>;
  market: number;
}

export function peerTable(protocols: SnapProtocol[]): PeerTable {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? '(no category)';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  return { byCategory, market: all.length > 0 ? medianOf(all) : 0.25 };
}

/** A category's multiple: its peers' median, shrunk toward the market, clamped. */
export function multipleFor(
  category: string | null,
  peers: PeerTable,
  tuning: ModelTuning = TUNING,
): { multiple: number; basis: string; peers: number; rawMedian: number | null } {
  const key = category ?? '(no category)';
  const ratios = peers.byCategory.get(key);
  const n = ratios === undefined ? 0 : ratios.length;
  if (ratios !== undefined && n >= tuning.min_peers) {
    const raw = medianOf(ratios);
    const w = n / (n + tuning.shrink_prior);
    const shrunk = w * raw + (1 - w) * peers.market;
    if (shrunk < tuning.mult_floor) return { multiple: tuning.mult_floor, basis: 'floored', peers: n, rawMedian: raw };
    if (shrunk > tuning.mult_cap) return { multiple: tuning.mult_cap, basis: 'capped', peers: n, rawMedian: raw };
    return { multiple: shrunk, basis: 'measured', peers: n, rawMedian: raw };
  }
  return { multiple: peers.market, basis: 'market', peers: n, rawMedian: null };
}

/** The multipliers and implied value one protocol gets. */
export function impliedValue(
  p: SnapProtocol,
  asOf: string,
  multiple: number,
  tuning: ModelTuning = TUNING,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = finiteNumber(p.change_7d, 0);
  const growthPct = Math.min(tuning.growth_cap, Math.max(tuning.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * tuning.growth_weight;
  const ageForModel = age ?? tuning.unknown_age_days;
  const maturityMult =
    tuning.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), tuning.maturity_days) / tuning.maturity_days) * tuning.maturity_range;
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

/** The protocols the board ranks: watchlist, above-floor exclusions-passing, below-floor by TVL. */
export function buildUniverse(snapshot: Snapshot, target: number = BOARD_TARGET): SnapProtocol[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const above = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isPreToken(p) && p.tvl_usd >= snapshot.floor_usd && passesExclusion(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of above) chosen.set(p.slug, p);
  const below = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isEarlyRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of below) {
    if (chosen.size >= target) break;
    chosen.set(p.slug, p);
  }
  return [...chosen.values()];
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core action, in the words a farmer can follow. */
function coreAction(p: SnapProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield asset on ${chain} and hold it.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis position on ${chain} and hold the hedged side.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('perps')) return `Deposit $${capital} of USDC as margin on ${name} and open one small position.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second action: a vote, a referral, a second pool, a check-in. */
function secondAction(p: SnapProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow a small amount against the ${name} deposit on ${chain} and repay it within the week.`;
  if (c.includes('dex') || c.includes('yield')) return `Swap a small amount through ${name}'s pool on ${chain} once a week so the wallet shows trading activity.`;
  if (c.includes('bridge')) return `Bridge a second, smaller amount through ${name} to a different chain and use it there.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the ${name} receipt once, if the protocol offers it, and keep the new receipt.`;
  if (c.includes('perpetual') || c.includes('perps') || c.includes('derivative')) return `Close the ${name} hedge and open a fresh one the next week so the account stays active.`;
  if (c.includes('prediction')) return `Settle one ${name} market and place the next one from the same wallet.`;
  if (c.includes('curator') || c.includes('allocator')) return `Move a second deposit into a different ${name} vault on ${chain} and compare the two.`;
  if (c.includes('rwa')) return `Check ${name}'s yield accrual on ${chain} each week and record the rate in the farm log.`;
  if (c.includes('basis')) return `Rebalance the ${name} basis position on ${chain} once a month if the hedge drifts.`;
  return `Use one more ${name} feature on ${chain}, such as a swap, a vote or a referral, and keep the receipt.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a
 * time. Every step names the protocol, so no two rows of the board share
 * a step. The plan is derived from the protocol's own record (category,
 * chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  const steps = [
    `Open a fresh wallet for ${p.name} only, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.`,
    `${coreAction(p, capital, chain)} Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    `Do one qualifying action on ${p.name} each week, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `${secondAction(p, capital, chain)} Cost: about $2 of gas. Time: 10 minutes.`,
    `Hold the ${p.name} position for at least ${hold} days so the activity is counted in more than one snapshot. Cost: the $${capital} stays in the position. Time: ${hold} days.`,
    `Before you withdraw from ${p.name}, open its own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.`,
    `Write the ${p.name} wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.`,
  ];
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, tuning: ModelTuning = TUNING): BoardRow[] {
  const peers = peerTable(snapshot.protocols);
  const universe = buildUniverse(snapshot);
  const scored = universe.map((p) => {
    const m = multipleFor(p.category, peers, tuning);
    const v = impliedValue(p, snapshot.as_of, m.multiple, tuning);
    return { p, m, v };
  });
  scored.sort(
    (a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  // Exact ties are broken downward by one dollar so the board's implied
  // values never rise as the rank ascends.
  let previous = Number.POSITIVE_INFINITY;
  return scored.map((s, i) => {
    let implied = s.v.implied;
    if (implied >= previous) implied = Math.max(1, previous - 1);
    previous = implied;
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.v.age,
      implied_value_usd: implied,
      model: {
        multiple: round4(s.m.multiple),
        multiple_basis: s.m.basis,
        peers: s.m.peers,
        growth_pct: s.v.growthPct,
        growth_multiplier: round4(s.v.growthMult),
        maturity_multiplier: round4(s.v.maturityMult),
        age_days: s.v.age,
      },
      farm_steps: farmSteps(s.p, s.v.age),
    };
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The multiples table: one row per category the snapshot carries. */
export function multiplesTable(snapshot: Snapshot, tuning: ModelTuning = TUNING): MultipleRow[] {
  const peers = peerTable(snapshot.protocols);
  const categories = [...new Set(snapshot.protocols.map((p) => p.category ?? '(no category)'))].sort();
  return categories.map((category) => {
    const m = multipleFor(category === '(no category)' ? null : category, peers, tuning);
    return {
      category,
      peers: m.peers,
      raw_median: m.rawMedian === null ? null : round4(m.rawMedian),
      multiple: round4(m.multiple),
      basis: m.basis,
    };
  });
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    multiple_basis: row.model.multiple_basis,
    peers: row.model.peers,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, tuning: ModelTuning = TUNING): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, tuning);
  const live = liveRows(snapshot);
  const peers = peerTable(snapshot.protocols);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: tuning,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    market_multiple: round4(peers.market),
    rows: board.map(radarRow),
    live,
    multiples: multiplesTable(snapshot, tuning),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
