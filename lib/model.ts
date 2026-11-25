// Token Radar — the comparables model (radar-2).
//
// One sealed snapshot in, one ranked board out. The board ranks protocols that
// record no token, by what their token would be worth if the protocol's record
// stayed as it is. It never predicts whether or when a token is issued.
//
// Implied value follows only from the snapshot's own figures:
//
//   multiple   = the median market-cap / TVL of the live-token protocols in the
//                same DefiLlama category (at least 3 peers with a market cap and
//                a TVL above zero); where a category has fewer than 3 such peers,
//                the median across every live-token protocol in the snapshot.
//                Clamped to [0.02, 1.5] so one outlier peer cannot set the price.
//   base       = tvl_usd x multiple
//   growthMult = 1 + clamp(change_7d, -60, 120) / 100 x 0.5
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age unknown: 365 days)
//   implied    = max(1, round(base x growthMult x maturity))
//
// No protocol name is ever special-cased: the same function scores every row.
// A protocol "records no token" when its DefiLlama record carries no market cap,
// no CoinGecko id and no symbol; that is a record, never proof it has no token.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_peers: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.02,
  multiple_cap: 1.5,
  min_peers: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3-fitted';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
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
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    multiple_source: string;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, farm plan included. */
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
  watchlist: boolean;
  implied_value_usd: number;
  category_multiple: number;
  multiple_source: string;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  global_multiple: number;
  rows: RadarRow[];
  live: LiveRow[];
  fit: FittedModel | null;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted-by-value list; the list must be non-empty. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking in a name. */
const WRAPPED = /\b(wrapped|staked|staking)\b/i;

/** Exchange names a protocol name must not begin with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/**
 * Whether a protocol is one the board may rank: pre-token, not an exchange, not a
 * versioned pool, and not a wrapped, staked or bridged product. The same hygiene
 * the watchlist's own rule applies, extended to the early rows below the floor.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/**
 * The comparables table: for each category, the median market-cap / TVL of its
 * live-token protocols (at least `min_peers` of them), plus the global median
 * every category without enough peers falls back to.
 */
export interface Comparables {
  byCategory: Map<string, { multiple: number; peers: number }>;
  global: number;
}

export function buildComparables(protocols: SnapshotProtocol[], model: ModelConstants): Comparables {
  const live = protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const global = median(live.map((p) => p.mcap_usd! / p.tvl_usd));
  const perCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorized';
    const list = perCategory.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    perCategory.set(key, list);
  }
  const byCategory = new Map<string, { multiple: number; peers: number }>();
  for (const [category, ratios] of perCategory) {
    if (ratios.length >= model.min_peers) {
      const raw = median(ratios);
      byCategory.set(category, { multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, raw)), peers: ratios.length });
    }
  }
  return { byCategory, global: Math.min(model.multiple_cap, Math.max(model.multiple_floor, global)) };
}

/** The multiple one protocol gets, and where it came from. */
export function multipleFor(p: SnapshotProtocol, comps: Comparables): { multiple: number; source: string } {
  const entry = p.category === null ? undefined : comps.byCategory.get(p.category);
  if (entry !== undefined) return { multiple: entry.multiple, source: `median of ${entry.peers} live ${p.category} peers` };
  return { multiple: comps.global, source: `global median (no ${p.category ?? 'category'} peers)` };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  comps: Comparables,
): { implied: number; multiple: number; source: string; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, source } = multipleFor(protocol, comps);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, multiple, source, growthPct, growthMult, maturityMult, age };
}

/**
 * One half of the live-token pool, held out while the other half trains the
 * value terms, so the error it reports is measured on protocols the fit never saw.
 */
export interface HeldOutFold {
  train_size: number;
  test_size: number;
  mape: number;
  log_error: number;
}

/** What the two held-out folds say about each value term, and whether it stays. */
export interface HeldOutValidation {
  folds: HeldOutFold[];
  mape_mean: number;
  log_error_mean: number;
  growth_kept: boolean;
  maturity_kept: boolean;
  mape_keep_both: number;
  mape_drop_growth: number;
  mape_drop_maturity: number;
  mape_drop_both: number;
}

/** The value model the snapshot itself supports, and the validation behind it. */
export interface FittedModel {
  constants: ModelConstants;
  train_log_error: number;
  live_pool_size: number;
  validation: HeldOutValidation;
}

/** The median absolute log error of predicted market caps against the real ones. */
function medianLogError(predicted: number[], actual: number[]): number {
  return median(predicted.map((p, i) => Math.abs(Math.log(p / actual[i]!))));
}

/** The median absolute percentage error of predicted market caps against the real ones. */
function medianPctError(predicted: number[], actual: number[]): number {
  return median(predicted.map((p, i) => Math.abs(p - actual[i]!) / actual[i]!));
}

/** The growth weights and maturity shapes the fit tries, in the order it tries them. */
const GROWTH_GRID = [0, 0.25, 0.5, 0.75, 1];
const MATURITY_FLOOR_GRID = [0.4, 0.6, 0.8];
const MATURITY_RANGE_GRID = [0, 0.2, 0.4];

/**
 * The constants that best predict market cap on one set of live-token protocols:
 * the growth weight and maturity shape whose median absolute log error is lowest,
 * with the category multiples fitted on the same set. The other constants stay as
 * the model states them.
 */
export function fitConstants(
  train: SnapshotProtocol[],
  asOf: string,
): { constants: ModelConstants; log_error: number } {
  const comps = buildComparables(train, MODEL);
  let best: { constants: ModelConstants; log_error: number } | null = null;
  for (const gw of GROWTH_GRID) {
    for (const mf of MATURITY_FLOOR_GRID) {
      for (const mr of MATURITY_RANGE_GRID) {
        const trial: ModelConstants = { ...MODEL, growth_weight: gw, maturity_floor: mf, maturity_range: mr };
        const predicted = train.map((p) => impliedValue(p, asOf, trial, comps).implied);
        const actual = train.map((p) => p.mcap_usd!);
        const err = medianLogError(predicted, actual);
        if (best === null || err < best.log_error) best = { constants: trial, log_error: err };
      }
    }
  }
  return best!;
}

/**
 * The two-fold held-out validation: the live-token pool is split in two by slug
 * order, each half trains the model and the other half is predicted, and the same
 * is done with each value term dropped, so every term is kept or dropped on what
 * the held-out halves say, not on what the training halves say.
 */
export function heldOutValidation(pool: SnapshotProtocol[], asOf: string): HeldOutValidation {
  const ordered = [...pool].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const splits: Array<[SnapshotProtocol[], SnapshotProtocol[]]> = [
    [ordered.filter((_, i) => i % 2 === 0), ordered.filter((_, i) => i % 2 === 1)],
    [ordered.filter((_, i) => i % 2 === 1), ordered.filter((_, i) => i % 2 === 0)],
  ];
  const folds: HeldOutFold[] = [];
  const keepBoth: number[] = [];
  const dropGrowth: number[] = [];
  const dropMaturity: number[] = [];
  const dropBoth: number[] = [];
  for (const [train, test] of splits) {
    const fitted = fitConstants(train, asOf);
    const comps = buildComparables(train, MODEL);
    const actual = test.map((p) => p.mcap_usd!);
    const score = (gw: number, mf: number, mr: number): number => {
      const trial: ModelConstants = { ...MODEL, growth_weight: gw, maturity_floor: mf, maturity_range: mr };
      const predicted = test.map((p) => impliedValue(p, asOf, trial, comps).implied);
      return medianPctError(predicted, actual);
    };
    const f = fitted.constants;
    const both = score(f.growth_weight, f.maturity_floor, f.maturity_range);
    keepBoth.push(both);
    dropGrowth.push(score(0, f.maturity_floor, f.maturity_range));
    dropMaturity.push(score(f.growth_weight, 1, 0));
    dropBoth.push(score(0, 1, 0));
    const predicted = test.map((p) => impliedValue(p, asOf, f, comps).implied);
    folds.push({
      train_size: train.length,
      test_size: test.length,
      mape: both,
      log_error: medianLogError(predicted, actual),
    });
  }
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  const mapeKeepBoth = mean(keepBoth);
  return {
    folds,
    mape_mean: mapeKeepBoth,
    log_error_mean: mean(folds.map((f) => f.log_error)),
    growth_kept: mapeKeepBoth <= mean(dropGrowth),
    maturity_kept: mapeKeepBoth <= mean(dropMaturity),
    mape_keep_both: mapeKeepBoth,
    mape_drop_growth: mean(dropGrowth),
    mape_drop_maturity: mean(dropMaturity),
    mape_drop_both: mean(dropBoth),
  };
}

/**
 * The value model this snapshot supports: the constants fitted on every live-token
 * protocol in it, with each term kept only when the two held-out folds say keeping
 * it beats dropping it. Too few live-token protocols to fit or test, and the model
 * falls back to the stated constants with no validation to report.
 */
export function fitModel(snapshot: Snapshot): FittedModel | null {
  const pool = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  if (pool.length < 8) return null;
  const validation = heldOutValidation(pool, snapshot.as_of);
  const fitted = fitConstants(pool, snapshot.as_of);
  const constants: ModelConstants = {
    ...fitted.constants,
    growth_weight: validation.growth_kept ? fitted.constants.growth_weight : 0,
    maturity_floor: validation.maturity_kept ? fitted.constants.maturity_floor : 1,
    maturity_range: validation.maturity_kept ? fitted.constants.maturity_range : 0,
  };
  return { constants, train_log_error: fitted.log_error, live_pool_size: pool.length, validation };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = buildComparables(snapshot.protocols, model);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = snapshot.protocols.find((q) => q.slug === slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, floor or not. The
  // watchlist is never the whole board: at least 60 rows must come from below it.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, comps);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
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
    token_status: 'pre-token' as const,
    watchlist: watchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: round4(s.multiple),
      multiple_source: s.source,
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The gas token of a chain, for the cost notes. */
function gasToken(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'solana') return 'SOL';
  if (c === 'tron') return 'TRX';
  if (c === 'bitcoin' || c === 'bittensor') return 'the chain token';
  if (c === 'sui' || c === 'aptos' || c === 'movement') return 'SUI';
  if (c === 'near') return 'NEAR';
  if (c === 'cosmos' || c === 'osmosis') return 'ATOM';
  return 'ETH';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('borrow')) {
    return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow a small amount against it so both sides of the position are active.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager')) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} in a narrow range and keep the position open.`;
  }
  if (c.includes('yield') || c.includes('farm')) {
    return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and leave the yield compounding.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds in its app instead of bridging straight back.`;
  }
  if (c.includes('staking') || c.includes('restak') || c.includes('staking pool')) {
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the same wallet.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position, then close it after a week.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} on ${name} and take one position in a market that settles after at least a week.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares for the full hold period.`;
  }
  if (c.includes('stable') || c.includes('cdp manager')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the same wallet.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it so the balance is visible on chain.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the full hold period.`;
  }
  if (c.includes('payment') || c.includes('card')) {
    return `Move $${capital} through ${name} on ${chain} for a real payment, then keep the wallet funded for the next one.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a
 * hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasToken(chain);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'nothing to set up',
      time: '5 minutes',
    },
    {
      text: `Buy about $10 of ${gas} on ${chain} for gas, then bridge or send $${capital} of USDC to the same wallet.`,
      cost: `$${capital + 10} moved, about $3 of gas`,
      time: '15 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Repeat one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and never let the position sit empty.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and do not withdraw early.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page from its own site and claim only from the link it publishes, never from a link in a message.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
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
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan included. */
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
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    multiple_source: row.model.multiple_source,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fitted = fitModel(snapshot);
  const effective = fitted === null ? model : fitted.constants;
  const board = buildBoard(snapshot, effective);
  const live = liveRows(snapshot);
  const comps = buildComparables(snapshot.protocols, effective);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: effective,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    global_multiple: round4(comps.global),
    rows: board.map(radarRow),
    live,
    fit: fitted,
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
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
