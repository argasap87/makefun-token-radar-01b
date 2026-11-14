// Token Radar — radar-4 model and farm-plan generator.
//
// The value model is the radar-3 model, unchanged: a protocol's implied
// launch value is its TVL times a category multiple times four bounded
// factors, every one a plain function of a field the snapshot carries, so
// the board is reproducible from the snapshot alone and no protocol is
// placed by name.
//
//   implied = TVL x categoryMultiple x momentum x age x early x breadth
//
// The farm plan is built per protocol from its own record: its name,
// category, chains, TVL, seven-day change, age and rank. Each category
// family has its own playbook (its own instrument, its own verbs, its own
// risks), and every step carries numbers from that protocol's row, so two
// rows never share a plan step.

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
  categoryMultiple: number;
  momentum: number;
  age: number;
  early: number;
  breadth: number;
  years: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  watchlist: boolean;
  rank: number;
  implied_value_usd: number;
  factors: ModelFactors;
  farm_steps: string[];
}

export const BOARD_ROWS = 226;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function yearsSince(listedAt: string | null, asOf: string): number {
  if (!listedAt) return 0;
  const listed = new Date(listedAt + "T00:00:00Z").getTime();
  const ref = new Date(asOf + "T00:00:00Z").getTime();
  if (Number.isNaN(listed) || Number.isNaN(ref)) return 0;
  return Math.max(0, (ref - listed) / (365.25 * 86400_000));
}

export function categoryMultiple(category: string | null): number {
  if (category === "Options" || category === "Synthetics") return 0.4;
  if (
    category === "Collateral Markets" ||
    category === "Basis Trading" ||
    category === "Farm" ||
    category === "Liquidity Manager"
  ) {
    return 0.35;
  }
  return 0.3;
}

export function computeFactors(p: SnapshotProtocol, asOf: string): ModelFactors {
  const years = yearsSince(p.listed_at, asOf);
  return {
    categoryMultiple: categoryMultiple(p.category),
    momentum: 1 + clamp(p.change_7d ?? 0, -50, 100) / 100,
    age: 1 + 0.15 * Math.min(years, 4),
    early: 1 + 0.5 * Math.exp(-years / 1.5),
    breadth: 1 + 0.05 * Math.min(p.chains.length, 8),
    years,
  };
}

export function impliedValue(p: SnapshotProtocol, asOf: string): number {
  const f = computeFactors(p, asOf);
  return Math.round(
    p.tvl_usd * f.categoryMultiple * f.momentum * f.age * f.early * f.breadth,
  );
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id == null && p.symbol == null;
}

// ---------------------------------------------------------------- formatting

export function fmtUsd(v: number): string {
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + Math.round(v);
}

export function fmtSignedPct(v: number): string {
  const s = Math.abs(v) < 10 ? Math.abs(v).toFixed(1) : Math.abs(v).toFixed(0);
  return v > 0 ? "+" + s + "%" : v < 0 ? "-" + s + "%" : "0%";
}

export function fmtPctSmall(v: number): string {
  return v.toFixed(5).replace(/0+$/, "").replace(/\.$/, "") + "%";
}

export function fmtMonths(years: number): string {
  const m = years * 12;
  if (m < 1) return "under a month";
  if (m < 12) return m.toFixed(0) + " months";
  const y = Math.floor(m / 12);
  const r = Math.round(m % 12);
  return r === 0 ? y + " year" + (y > 1 ? "s" : "") : y + " year" + (y > 1 ? "s" : "") + " " + r + " months";
}

export function fmtFactor(v: number): string {
  return v.toFixed(2);
}

// A test deposit sized to the protocol's TVL: big enough to see real yield
// and fees, small enough that a mispriced vault costs little.
export function testSize(tvl: number): number {
  if (tvl >= 1e9) return 1000;
  if (tvl >= 1e8) return 500;
  if (tvl >= 2e7) return 250;
  return 100;
}

// Typical gas for one transaction on a chain, in dollars. Approximate,
// from public fee levels; the plan quotes it as a range, never a promise.
export function gasNote(chain: string): string {
  const table: Record<string, string> = {
    Ethereum: "$2-$8",
    Arbitrum: "$0.10-$0.50",
    Base: "$0.05-$0.30",
    Optimism: "$0.10-$0.50",
    Solana: "$0.01 or less",
    BSC: "$0.10-$0.30",
    Polygon: "$0.02-$0.10",
    Avalanche: "$0.20-$1",
    Tron: "$0.50-$2",
    Sui: "$0.05 or less",
    Aptos: "$0.05 or less",
    zkSync: "$0.10-$0.50",
    Linea: "$0.05-$0.30",
    Scroll: "$0.05-$0.30",
    Unichain: "$0.05-$0.30",
    Berachain: "$0.05-$0.30",
    Hyperliquid: "$0.01-$0.10",
    Blast: "$0.05-$0.30",
    Mantle: "$0.05-$0.30",
    Mode: "$0.05-$0.30",
    Fraxtal: "$0.05-$0.30",
  };
  return table[chain] ?? "$1";
}

// ---------------------------------------------------------------- farm plans

interface PlanCtx {
  name: string;
  category: string;
  chain1: string;
  chain2: string | null;
  chainCount: number;
  tvl: string;
  tvlNum: number;
  change: string;
  changeDir: string;
  months: string;
  rank: number;
  value: string;
  mult: string;
  mom: string;
  ageF: string;
  earlyF: string;
  breadthF: string;
  size: number;
  sizePct: string;
  cap: number;
  gas: string;
  watchlist: boolean;
}

function planContext(row: BoardRow): PlanCtx {
  const f = row.factors;
  const size = testSize(row.tvl_usd);
  const change =
    row.change_7d == null
      ? "flat over 7 days"
      : row.change_7d > 0
        ? "up " + fmtSignedPct(row.change_7d).slice(1) + " over 7 days"
        : row.change_7d < 0
          ? "down " + fmtSignedPct(row.change_7d).slice(1) + " over 7 days"
          : "flat over 7 days";
  return {
    name: row.name,
    category: row.category,
    chain1: row.chains[0] ?? "Ethereum",
    chain2: row.chains.length > 1 ? row.chains[1] : null,
    chainCount: row.chains.length,
    tvl: fmtUsd(row.tvl_usd),
    tvlNum: row.tvl_usd,
    change,
    changeDir: row.change_7d != null && row.change_7d > 0 ? "growing" : row.change_7d != null && row.change_7d < 0 ? "cooling" : "flat",
    months: fmtMonths(f.years),
    rank: row.rank,
    value: fmtUsd(row.implied_value_usd),
    mult: fmtFactor(f.categoryMultiple),
    mom: fmtFactor(f.momentum),
    ageF: fmtFactor(f.age),
    earlyF: fmtFactor(f.early),
    breadthF: fmtFactor(f.breadth),
    size,
    sizePct: fmtPctSmall((size / row.tvl_usd) * 100),
    cap: size * 20,
    gas: gasNote(row.chains[0] ?? "Ethereum"),
    watchlist: row.watchlist,
  };
}

// The model step every plan carries, worded per family so the numbers are
// never the only thing that differs.
function modelStep(c: PlanCtx, lead: string): string {
  return (
    lead +
    " the radar prices " +
    c.name +
    " at rank " +
    c.rank +
    " (" +
    c.value +
    " implied) from TVL " +
    c.tvl +
    " x " +
    c.mult +
    " category multiple x " +
    c.mom +
    " momentum x " +
    c.ageF +
    " age x " +
    c.earlyF +
    " early x " +
    c.breadthF +
    " breadth; TVL is " +
    c.change +
    ", so two weekly falls in a row means halving the position."
  );
}

type Steps = (c: PlanCtx) => string[];

const CURATOR: Steps = (c) => [
  "Open " + c.name + " on " + c.chain1 + " — the first of its " + c.chainCount + " chains — and connect a wallet holding USDC there; keep the wallet's " + c.chain1 + " gas balance above $5 so deposits never stall.",
  "Deposit a $" + c.size + " test into one " + c.name + " vault on " + c.chain1 + ": about " + c.sizePct + " of its " + c.tvl + " TVL, small enough that a mispriced vault costs little and large enough to see real yield and fees.",
  "Pick the vault whose strategy you understand — " + c.name + " curates the vaults it runs — and leave the test in for at least a full week, so one rebalance and fee cycle shows up in your balance.",
  "If the vault pays yield in USDC, compound it weekly: claim the yield on your $" + c.size + " test in " + c.name + " and redeposit it on " + c.chain1 + " for about " + c.gas + " in gas and five minutes, instead of letting rewards sit idle.",
  modelStep(c, "Track " + c.name + " every week:"),
  c.name + " has run " + c.months + " with no token recorded, so a launch would reward early depositors — but curator vaults carry smart-contract and curator risk, so cap any single vault at $" + c.cap + " and never put a farming budget's majority in one place.",
  "To exit, withdraw from the vault on " + c.chain1 + " in one transaction (about " + c.gas + " in gas, ten minutes); keep the deposit and withdrawal hashes, because if " + c.name + " launches a token, on-chain deposit history on " + c.chain1 + " is usually the record that counts.",
];

const DEX: Steps = (c) => [
  "Open " + c.name + " on " + c.chain1 + " — the first of its " + c.chainCount + " chains — with a wallet holding the pool's two tokens; keep " + c.chain1 + " gas above $5 before you touch a pool.",
  "Provide a $" + c.size + " test of liquidity to one " + c.name + " pool on " + c.chain1 + " (about " + c.sizePct + " of its " + c.tvl + " TVL); a two-token deposit this small limits impermanent loss while you learn the pool's fee behaviour.",
  "Choose the pool with the deepest liquidity and the pair you would hold anyway — " + c.name + " is a decentralised exchange, so the pool's fee tier and the pair's volatility are the whole trade.",
  "Collect " + c.name + "'s fees weekly and compound them back into the same pool on " + c.chain1 + " (about " + c.gas + " gas, five minutes); if the pair drifts more than 10% from your entry, rebalance instead of adding.",
  modelStep(c, "Watch the pool, not just the token:"),
  c.name + " has run " + c.months + " with no token recorded, so a launch would reward early liquidity providers — but a pool can drain through impermanent loss, so cap any single pool at $" + c.cap + " and never pair a token you would not hold alone.",
  "To exit, remove liquidity from the pool on " + c.chain1 + " in one transaction (about " + c.gas + " in gas, ten minutes); keep the add and remove hashes, because if " + c.name + " launches a token, on-chain liquidity history on " + c.chain1 + " is usually the record that counts.",
];

const LENDING: Steps = (c) => [
  "Open " + c.name + " on " + c.chain1 + " — the first of its " + c.chainCount + " chains — with a wallet holding USDC to supply and ETH to post as collateral; keep " + c.chain1 + " gas above $5.",
  "Supply a $" + c.size + " test of USDC to one " + c.name + " market on " + c.chain1 + " (about " + c.sizePct + " of its " + c.tvl + " TVL); supplying first, before any borrowing, shows you the real supply rate and the withdrawal speed.",
  "If you borrow, do it against ETH collateral at under 50% loan-to-value — " + c.name + " is a lending market, so the borrow rate and the liquidation threshold are the whole trade — and never borrow the same asset you supplied.",
  "Claim " + c.name + "'s supply interest weekly and, if the rate on " + c.chain1 + " beats the borrow cost, compound it back into the same market (about " + c.gas + " gas, five minutes); if the borrow rate jumps above the supply rate, repay first.",
  modelStep(c, "Mind the rates weekly:"),
  c.name + " has run " + c.months + " with no token recorded, so a launch would reward early suppliers — but lending carries liquidation and oracle risk, so cap any single market at $" + c.cap + " and keep a 2x buffer above the liquidation price.",
  "To exit, repay any borrow first, then withdraw the supply from the market on " + c.chain1 + " in one transaction each (about " + c.gas + " gas each, ten minutes); keep the supply and repay hashes, because if " + c.name + " launches a token, on-chain supply history on " + c.chain1 + " is usually the record that counts.",
];

const YIELD: Steps = (c) => [
  "Open " + c.name + " on " + c.chain1 + " — the first of its " + c.chainCount + " chains — with a wallet holding USDC; keep " + c.chain1 + " gas above $5 before you deposit.",
  "Deposit a $" + c.size + " test into one " + c.name + " vault on " + c.chain1 + " (about " + c.sizePct + " of its " + c.tvl + " TVL); a test this small shows the real yield, the deposit fee and the withdrawal speed before you scale it.",
  "Pick the vault whose underlying strategy you can name in one sentence — " + c.name + " is a yield vault, so the strategy behind the vault is the whole trade — and leave the test in for at least two weeks, so the yield curve settles.",
  "Compound weekly: claim " + c.name + "'s yield on your $" + c.size + " test and redeposit it on " + c.chain1 + " (about " + c.gas + " gas, five minutes); if the vault's yield drops below the chain's risk-free stablecoin rate for two weeks, move on.",
  modelStep(c, "Compare the vault to the market weekly:"),
  c.name + " has run " + c.months + " with no token recorded, so a launch would reward early vault depositors — but vaults carry strategy and smart-contract risk, so cap any single vault at $" + c.cap + " and never put a farming budget's majority in one strategy.",
  "To exit, withdraw from the vault on " + c.chain1 + " in one transaction (about " + c.gas + " in gas, ten minutes); keep the deposit and withdrawal hashes, because if " + c.name + " launches a token, on-chain vault history on " + c.chain1 + " is usually the record that counts.",
];

const RWA: Steps = (c) => [
  "Open " + c.name + " on " + c.chain1 + " — the first of its " + c.chainCount + " chains — with a wallet holding USDC; keep " + c.chain1 + " gas above $5, and expect a wallet check before the first deposit.",
  "Deposit a $" + c.size + " test into one " + c.name + " vault on " + c.chain1 + " (about " + c.sizePct + " of its " + c.tvl + " TVL); a test this small proves the deposit path and the redemption window before you scale it.",
  "Read what backs the vault — " + c.name + " is a real-world-asset vault, so the off-chain asset and its custodian are the whole trade — and only deposit into a vault whose backing you can name.",
  "Reinvest " + c.name + "'s distributions monthly rather than weekly: RWA vaults pay on a schedule, so collect each payout and redeposit it on " + c.chain1 + " (about " + c.gas + " gas, ten minutes) instead of letting it sit.",
  modelStep(c, "Check the backing, not just the yield:"),
  c.name + " has run " + c.months + " with no token recorded, so a launch would reward early vault depositors — but RWA vaults carry custodian and redemption risk, so cap any single vault at $" + c.cap + " and confirm the redemption window before you deposit.",
  "To exit, request redemption from the vault on " + c.chain1 + " and wait out its window (RWA redemptions are rarely instant); keep the deposit and redemption hashes, because if " + c.name + " launches a token, on-chain vault history on " + c.chain1 + " is usually the record that counts.",
];

const STAKING: Steps = (c) => [
  "Open " + c.name + " on " + c.chain1 + " — the first of its " + c.chainCount + " chains — with a wallet holding the chain's native token; keep " + c.chain1 + " gas above $5.",
  "Stake a $" + c.size + " test with one " + c.name + " pool on " + c.chain1 + " (about " + c.sizePct + " of its " + c.tvl + " TVL); a test this small shows the real staking yield and the unstaking delay before you scale it.",
  "Pick the pool whose validators you can name — " + c.name + " stakes the chain's token, so validator quality is the whole trade — and spread a larger position across at least two pools rather than one.",
  "Restake " + c.name + "'s rewards weekly where the pool allows it (about " + c.gas + " gas, five minutes); if the pool's yield falls below the chain's base staking rate for two weeks, move the stake.",
  modelStep(c, "Compare the pool to base staking weekly:"),
  c.name + " has run " + c.months + " with no token recorded, so a launch would reward early stakers — but staking carries slashing and unbonding risk, so cap any single pool at $" + c.cap + " and check the unbonding window before you stake.",
  "To exit, unstake from the pool on " + c.chain1 + " and wait out its unbonding window (staking exits are rarely instant); keep the stake and unstake hashes, because if " + c.name + " launches a token, on-chain staking history on " + c.chain1 + " is usually the record that counts.",
];

const BRIDGE: Steps = (c) => [
  "Open " + c.name + " on " + c.chain1 + " — the first of its " + c.chainCount + " chains — with a wallet holding USDC on the source chain; keep gas above $5 on both sides of the route.",
  "Bridge a $" + c.size + " test of USDC through one " + c.name + " route on " + c.chain1 + " (about " + c.sizePct + " of its " + c.tvl + " TVL); a test this small proves the route, the fee and the arrival time before you move size.",
  "Pick the route with the deepest liquidity and the shortest finality — " + c.name + " is a bridge, so the route's fee and its settlement time are the whole trade — and never bridge during a chain congestion spike.",
  "If you bridge regularly, batch it: one larger " + c.name + " bridge a week costs less in fees than daily small ones on " + c.chain1 + " (about " + c.gas + " gas per bridge, ten minutes), and each crossing is a use of the protocol.",
  modelStep(c, "Count crossings, not just volume:"),
  c.name + " has run " + c.months + " with no token recorded, so a launch would reward early bridge users — but bridges carry smart-contract and finality risk, so cap any single crossing at $" + c.cap + " and never bridge more than you can afford to wait a day for.",
  "To finish, confirm the arrival on the destination chain before you close the tab (about " + c.gas + " gas on the source chain, ten minutes); keep the bridge hashes on both chains, because if " + c.name + " launches a token, on-chain bridge history is usually the record that counts.",
];

const BASIS: Steps = (c) => [
  "Open " + c.name + " on " + c.chain1 + " — the first of its " + c.chainCount + " chains — with a wallet holding USDC; keep " + c.chain1 + " gas above $5 before you deposit.",
  "Deposit a $" + c.size + " test into one " + c.name + " vault on " + c.chain1 + " (about " + c.sizePct + " of its " + c.tvl + " TVL); a test this small shows the real basis yield and the funding-rate behaviour before you scale it.",
  "Understand the trade first — " + c.name + " earns the basis between spot and futures, so the funding rate is the whole trade — and only deposit while funding is positive on the venues it trades.",
  "Rebalance " + c.name + " weekly: if funding flips negative for two weeks, pull the test back to USDC on " + c.chain1 + " (about " + c.gas + " gas, ten minutes) rather than paying to hold the position.",
  modelStep(c, "Watch funding, not just TVL:"),
  c.name + " has run " + c.months + " with no token recorded, so a launch would reward early vault depositors — but basis vaults carry funding and counterparty risk, so cap any single vault at $" + c.cap + " and never deposit while funding is negative.",
  "To exit, withdraw from the vault on " + c.chain1 + " in one transaction (about " + c.gas + " in gas, ten minutes); keep the deposit and withdrawal hashes, because if " + c.name + " launches a token, on-chain vault history on " + c.chain1 + " is usually the record that counts.",
];

const OPTIONS: Steps = (c) => [
  "Open " + c.name + " on " + c.chain1 + " — the first of its " + c.chainCount + " chains — with a wallet holding USDC as collateral; keep " + c.chain1 + " gas above $5 before you write anything.",
  "Post a $" + c.size + " test of USDC collateral to one " + c.name + " vault on " + c.chain1 + " (about " + c.sizePct + " of its " + c.tvl + " TVL); a test this small shows the real premium and the settlement behaviour before you scale it.",
  "Write only options you would hold to expiry — " + c.name + " is an options market, so the strike, the expiry and the premium are the whole trade — and never write a naked position larger than the collateral you posted.",
  "Collect " + c.name + "'s premiums weekly and, if the vault settles in USDC, compound them back into the same vault on " + c.chain1 + " (about " + c.gas + " gas, five minutes); if implied volatility doubles from your entry, stop writing and wait.",
  modelStep(c, "Price the premium weekly:"),
  c.name + " has run " + c.months + " with no token recorded, so a launch would reward early options writers — but options carry assignment and volatility risk, so cap any single vault at $" + c.cap + " and never write more than the collateral you can lose.",
  "To exit, close the position before expiry on " + c.chain1 + " in one transaction (about " + c.gas + " in gas, ten minutes); keep the open and close hashes, because if " + c.name + " launches a token, on-chain options history on " + c.chain1 + " is usually the record that counts.",
];

const STABLE: Steps = (c) => [
  "Open " + c.name + " on " + c.chain1 + " — the first of its " + c.chainCount + " chains — with a wallet holding ETH to lock as collateral; keep " + c.chain1 + " gas above $5 before you mint.",
  "Mint a $" + c.size + " test of " + c.name + "'s stablecoin on " + c.chain1 + " against ETH collateral (about " + c.sizePct + " of its " + c.tvl + " TVL); minting a small amount first shows the real stability fee and the redemption path.",
  "Keep the collateral ratio above 200% — " + c.name + " is a stablecoin system, so the collateral ratio and the stability fee are the whole trade — and never mint against a token you would not hold.",
  "Check " + c.name + "'s peg weekly: if its stablecoin trades more than 1% off its peg for a week, repay the test on " + c.chain1 + " (about " + c.gas + " gas, ten minutes) rather than holding a depegged position.",
  modelStep(c, "Watch the peg and the TVL:"),
  c.name + " has run " + c.months + " with no token recorded, so a launch would reward early minters — but stablecoin systems carry depeg and liquidation risk, so cap any single mint at $" + c.cap + " and keep a 2x buffer above the liquidation ratio.",
  "To exit, repay the minted stablecoin and unlock the collateral on " + c.chain1 + " in one transaction each (about " + c.gas + " gas each, ten minutes); keep the mint and repay hashes, because if " + c.name + " launches a token, on-chain mint history on " + c.chain1 + " is usually the record that counts.",
];

const OTHER: Steps = (c) => [
  "Open " + c.name + " on " + c.chain1 + " — the first of its " + c.chainCount + " chains — with a wallet holding USDC; keep " + c.chain1 + " gas above $5 before you use it.",
  "Use " + c.name + " with a $" + c.size + " test on " + c.chain1 + " (about " + c.sizePct + " of its " + c.tvl + " TVL); a test this small proves the product, the fee and the withdrawal path before you scale it.",
  "Learn the product's core action first — " + c.name + " is a " + (c.category === "Chain" ? "blockchain network" : c.category + " protocol") + ", so the fee it charges and the asset it touches are the whole trade — and repeat that action weekly rather than once.",
  "Repeat " + c.name + "'s core action weekly on " + c.chain1 + " (about " + c.gas + " gas each time, ten minutes); regular use is what a future launch usually rewards, not one large deposit.",
  modelStep(c, "Use it weekly and watch the numbers:"),
  c.name + " has run " + c.months + " with no token recorded, so a launch would reward early users — but every protocol carries smart-contract risk, so cap any single position at $" + c.cap + " and never deposit more than you can afford to lose.",
  "To exit, unwind the position on " + c.chain1 + " in one transaction (about " + c.gas + " in gas, ten minutes); keep the deposit and withdrawal hashes, because if " + c.name + " launches a token, on-chain usage history on " + c.chain1 + " is usually the record that counts.",
];

function playbookFor(category: string | null): Steps {
  switch (category) {
    case "Risk Curators":
    case "Onchain Capital Allocator":
      return CURATOR;
    case "Dexs":
    case "Derivatives":
    case "Prediction Market":
    case "Indexes":
      return DEX;
    case "Lending":
    case "Uncollateralized Lending":
    case "Collateral Markets":
      return LENDING;
    case "Yield":
    case "Yield Aggregator":
    case "Farm":
    case "Leveraged Farming":
      return YIELD;
    case "RWA":
      return RWA;
    case "CDP":
    case "Stablecoin Wrapper":
    case "Dual-Token Stablecoin":
    case "Anchor BTC":
    case "Decentralized BTC":
      return STABLE;
    case "Liquid Staking":
    case "Liquid Restaking":
    case "Restaking":
    case "Staking Pool":
      return STAKING;
    case "Bridge":
    case "Canonical Bridge":
    case "Cross Chain Bridge":
      return BRIDGE;
    case "Basis Trading":
    case "Liquidity Manager":
      return BASIS;
    case "Options":
    case "Options Vault":
    case "Synthetics":
    case "Interest Rate Derivatives":
      return OPTIONS;
    default:
      return OTHER;
  }
}

function fitStep(step: string): string {
  const s = step.trim().replace(/\s+/g, " ");
  if (s.length <= 600) return s;
  const cut = s.slice(0, 597);
  const lastSpace = cut.lastIndexOf(" ");
  return cut.slice(0, lastSpace > 400 ? lastSpace : 597).trim() + "...";
}

export function buildFarmPlan(row: BoardRow): string[] {
  const ctx = planContext(row);
  return playbookFor(row.category)(ctx).map(fitStep);
}

// ---------------------------------------------------------------- board

export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const asOf = snapshot.as_of;
  const watch = new Set(snapshot.watchlist);
  const watchRows = snapshot.protocols.filter((p) => watch.has(p.slug) && isPreToken(p));
  const subFloor = snapshot.protocols
    .filter((p) => isPreToken(p) && !watch.has(p.slug) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  const picked = [...watchRows, ...subFloor.slice(0, BOARD_ROWS - watchRows.length)];
  const ranked = picked
    .map((p) => ({ p, value: impliedValue(p, asOf) }))
    .sort((a, b) => b.value - a.value || (a.p.slug < b.p.slug ? -1 : 1));
  return ranked.map(({ p, value }, i) => {
    const row: BoardRow = {
      slug: p.slug,
      name: p.name,
      category: p.category ?? "Uncategorised",
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      watchlist: watch.has(p.slug),
      rank: i + 1,
      implied_value_usd: value,
      factors: computeFactors(p, asOf),
      farm_steps: [],
    };
    row.farm_steps = buildFarmPlan(row);
    return row;
  });
}

// Category leaders outside the curator cluster, for the dashboard's
// diversity strip: the top protocol of each of the strongest non-curator
// categories, so the page surfaces more than vault curators.
export function diversityLeaders(rows: BoardRow[]): BoardRow[] {
  const skip = new Set(["Risk Curators", "Onchain Capital Allocator"]);
  const best = new Map<string, BoardRow>();
  for (const r of rows) {
    if (skip.has(r.category)) continue;
    const cur = best.get(r.category);
    if (!cur || r.implied_value_usd > cur.implied_value_usd) best.set(r.category, r);
  }
  return [...best.values()]
    .sort((a, b) => b.implied_value_usd - a.implied_value_usd)
    .slice(0, 8);
}

// The live tab: token-bearing protocols, biggest TVL first, for contrast
// with the pre-token board.
export function liveList(snapshot: Snapshot, count: number): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, count);
}
