// Token Radar — the comparables model (radar-5-conformal).
//
// One sealed snapshot in, one ranked board out. The board ranks protocols that
// record no token, by what their token would be worth if the protocol's record
// stayed as it is. It never predicts whether or when a token is issued.
//
// What changed from radar-4 (round 2):
// - Hierarchical category slopes. Round 2 fitted one global log-log slope
//   (0.522) and a shrunk intercept per category. Round 5 lets each category
//   with at least 5 live peers bend the slope toward its own, shrunk toward
//   the global slope with strength 32, and re-fits the intercept on the
//   slope-adjusted residuals. Held out, the mean median log error falls from
//   1.253 to 1.233; MAPE is flat (84.5% -> 85.4%), so the slope change is a
//   small gain in log error, not a new pricing regime, and the dashboard says so.
// - A chains term. log(1 + number of chains) enters the log-log fit as a
//   third regressor: protocols live on more chains tend to carry larger
//   market caps at the same TVL. Its coefficient is fitted, not assumed.
// - Conformal value ranges. Round 2's range was the middle half of the
//   category's peer multiples (held-out coverage 53.9%). Round 5 replaces it
//   with a split-conformal 80% range: the 80% quantile of the absolute
//   leave-one-out log residuals, per category where the category holds at
//   least 8 live peers, shrunk toward the pooled quantile with strength 8.
//   Held out (two-fold), 82.0% of live protocols' real market caps fall
//   inside their own range, against the 80% target. The middle half survives
//   as the row's "typical range" in the detail view, so the reader sees both
//   the typical band and the honest one.
// - Deposit-tier farm verdicts. The verdict is now priced at three capital
//   tiers ($50, $150, $500): gas fees are roughly fixed per action, so the
//   fee share falls as capital rises, and each row names its minimum viable
//   capital — the smallest tier whose fees stay under 10% of the capital.
// - Anchors. Each detail view names the three nearest live-token protocols
//   in the same category (nearest by TVL), with their real market caps and
//   multiples: the traded tokens the row's multiple is anchored on.
// - Rank honesty. The same leave-one-out residuals say a one-log-error swing
//   moves a row about twenty places, so the model view states it: the range,
//   not the rank, is the claim.
//
// No protocol name is ever special-cased: the same function scores every row.
// A protocol "records no token" when its DefiLlama record carries no market
// cap, no CoinGecko id and no symbol; that is a record, never proof it has
// no token.

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
  /** Slope of log market cap on log TVL, fitted on the live-token pool. */
  slope: number;
  /** Intercept of that fit (log market cap at log TVL zero). */
  intercept: number;
  /** Coefficient on log(1 + number of chains), fitted on the live-token pool. */
  chains_coef: number;
  /** Weight on log(1 + clamped 7-day TVL change); 0 when the tests drop growth. */
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  /** Coefficient on log(age in days); 0 when the tests drop the age term. */
  age_coef: number;
  unknown_age_days: number;
  /** Shrinkage strength for the category intercepts, picked by nested CV. */
  shrink_k: number;
  /** Shrinkage strength for the per-category slope deviations toward the global slope. */
  slope_shrink_k: number;
  /** Shrinkage strength for the peer token rates. */
  peer_shrink_k: number;
  /** The conformal range's target coverage (0.80: four of five real values inside). */
  conformal_target: number;
  /** Shrinkage strength for the per-category conformal quantiles toward the pooled one. */
  conformal_shrink_k: number;
}

export const MODEL: ModelConstants = {
  slope: 1,
  intercept: 0,
  chains_coef: 0,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  age_coef: 0,
  unknown_age_days: 365,
  shrink_k: 4,
  slope_shrink_k: 32,
  peer_shrink_k: 8,
  conformal_target: 0.8,
  conformal_shrink_k: 8,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-5-conformal';

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
  /** Share of same-category, same-age-band protocols that record a token. */
  peer_rate: number;
  /** What the peer rate counts, in words (cell size and shrinkage). */
  peer_rate_note: string;
  /** Implied value weighted by the peer rate. */
  expected_value_usd: number;
  /** Conformal 80% range around the implied value (the honest range). */
  value_low_usd: number;
  value_high_usd: number;
  /** The conformal half-width in log points behind the range above. */
  conformal_q: number;
  /** Middle-half peer range around the implied value (the typical band). */
  typical_low_usd: number;
  typical_high_usd: number;
  /** The three nearest live-token protocols in the same category, by TVL. */
  anchors: Anchor[];
  /** Gas fees for the whole farm plan, in whole dollars (capital excluded). */
  farm_cost_usd: number;
  /** Hours of attention the farm plan takes, to one decimal. */
  farm_hours: number;
  /** The costed verdict: fees, capital, hours, expected value. */
  farm_verdict: string;
  /** The farm verdict priced at three capital tiers. */
  farm_tiers: FarmTier[];
  /** Smallest capital tier whose fees stay under 10% of the capital, or null. */
  min_viable_capital_usd: number | null;
  farm_steps: string[];
}

/** One traded anchor: a live-token protocol in the same category, near in TVL. */
export interface Anchor {
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number | null;
  mcap_tvl: number | null;
}

/** One capital tier of the farm verdict: what the same plan costs at that size. */
export interface FarmTier {
  capital_usd: number;
  fees_usd: number;
  fee_share: number;
  hours: number;
  fees_per_hour_usd: number;
  verdict: string;
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
  peer_rate: number;
  peer_rate_note: string;
  expected_value_usd: number;
  value_low_usd: number;
  value_high_usd: number;
  conformal_q: number;
  typical_low_usd: number;
  typical_high_usd: number;
  anchors: Anchor[];
  farm_cost_usd: number;
  farm_hours: number;
  farm_verdict: string;
  farm_tiers: FarmTier[];
  min_viable_capital_usd: number | null;
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

/** How the 758 protocols are accounted for. */
export interface Coverage {
  total: number;
  board: number;
  live: number;
  excluded: number;
  excluded_by_reason: Record<string, number>;
  watchlist_on_board: number;
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
  /** Global share of protocols that record a token. */
  global_peer_rate: number;
  /** Share recording a token in each age band. */
  age_band_rates: AgeBandRate[];
  /** The conformal range's pooled half-width in log points. */
  conformal_q_pooled: number;
  /** The conformal range's target coverage. */
  conformal_target: number;
  /** Per-category slope: the global slope plus the category's own deviation. */
  category_slopes: CategorySlope[];
  coverage: Coverage;
  rows: RadarRow[];
  live: LiveRow[];
  fit: FittedModel | null;
}

/** One category's fitted slope: the global slope bent by the category's own data. */
export interface CategorySlope {
  category: string;
  live_peers: number;
  slope: number;
  deviation: number;
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

/** The median of a list; the list must be non-empty. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quantile by linear interpolation, like numpy's default. */
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
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

/** Why a protocol is not rankable, for the coverage accounting. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return null;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return 'wrapped, staked or bridged product category';
  if (VERSIONED.test(p.name)) return 'versioned pool name';
  if (WRAPPED.test(p.name)) return 'wrapped or staked in the name';
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return 'exchange name';
  return null;
}

/** The live-token pool the value terms are fitted and tested on. */
export function livePool(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** The age band a protocol falls in, for the peer token rate. */
export function ageBand(age: number | null): string {
  if (age === null) return 'unknown age';
  if (age < 365) return 'under 1 year';
  if (age < 730) return '1–2 years';
  if (age < 1095) return '2–3 years';
  return '3+ years';
}

/** A deterministic shuffle (mulberry32, fixed seed) so every run agrees. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The median absolute log error of predicted market caps against the real ones. */
function medianLogError(predicted: number[], actual: number[]): number {
  return median(predicted.map((p, i) => Math.abs(Math.log(p / actual[i]!))));
}

/** The mean absolute log error. */
function meanLogError(predicted: number[], actual: number[]): number {
  return predicted.reduce((a, p, i) => a + Math.abs(Math.log(p / actual[i]!)), 0) / predicted.length;
}

/** The median absolute percentage error of predicted market caps against the real ones. */
function medianPctError(predicted: number[], actual: number[]): number {
  return median(predicted.map((p, i) => Math.abs(p - actual[i]!) / actual[i]!));
}

/* ================================================================ the fit */

/** One fitted core: the log-log line plus a shrunk intercept per category. */
interface FitCore {
  beta0: number;
  beta1: number;
  /** Coefficient on log(1 + number of chains). */
  betaChains: number;
  intercepts: Map<string, number>;
  /** Per-category slope deviation from the global slope (0 when the category is too thin). */
  slopeDev: Map<string, number>;
  /** Mean log TVL of each category's training protocols (the slope pivot). */
  xbarByCategory: Map<string, number>;
  globalResidual: number;
  shrinkK: number;
}

/** Solve a small dense linear system by Gaussian elimination with partial pivoting. */
function solveLinear(aIn: number[][], bIn: number[]): number[] {
  const n = bIn.length;
  const m = aIn.map((row, i) => [...row, bIn[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    const d = m[c]![c]!;
    if (Math.abs(d) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / d;
      for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  return m.map((row, i) => (Math.abs(row[i]!) < 1e-12 ? 0 : row[n]! / row[i]!));
}

/** Least squares for log(mcap) on [1, log TVL, log(1 + chains)]. */
function ols3(train: SnapshotProtocol[]): { beta0: number; beta1: number; betaChains: number } {
  const dim = 3;
  const a: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  const b: number[] = new Array<number>(dim).fill(0);
  for (const p of train) {
    const row = [1, Math.log(p.tvl_usd), Math.log1p(p.chains.length)];
    const y = Math.log(p.mcap_usd!);
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) a[i]![j]! += row[i]! * row[j]!;
      b[i]! += row[i]! * y;
    }
  }
  for (let i = 0; i < dim; i++) a[i]![i]! += 1e-9;
  const beta = solveLinear(a, b);
  return { beta0: beta[0]!, beta1: beta[1]!, betaChains: beta[2]! };
}

/** The growth multiplier for a protocol under a growth weight. */
function growthMultiplier(p: SnapshotProtocol, gw: number, model: ModelConstants): number {
  const rawGrowth = finite(p.change_7d, 0);
  const clamped = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  return Math.exp(gw * Math.log1p(clamped / 100));
}

/** The age multiplier for a protocol under an age coefficient. */
function ageMultiplier(p: SnapshotProtocol, asOf: string, agek: number, model: ModelConstants): number {
  const age = ageDays(asOf, p.listed_at);
  const a = age ?? model.unknown_age_days;
  return Math.exp(agek * Math.log(Math.max(1, a)));
}

/**
 * The log-log line log(mcap) = beta0 + beta1 * log(tvl) + betaChains *
 * log(1 + chains), fitted by least squares on the training pool, plus a
 * shrunk intercept per category: the mean log-residual of the category's
 * protocols, pulled toward the global median residual with strength `k`.
 * Categories with at least 5 protocols also bend the slope: the slope of
 * the category's own residuals on its centred log TVL, shrunk toward zero
 * with strength `slopeK`, so a thin category keeps the global slope and a
 * thick one bends it. The intercept is then fitted on the slope-adjusted
 * residuals. Categories with no protocols in the training set fall back to
 * the global residual.
 */
function fitCore(
  train: SnapshotProtocol[],
  k: number,
  model: ModelConstants,
  gw: number,
  agek: number,
  asOf: string,
): FitCore {
  const slopeK = model.slope_shrink_k;
  const { beta0, beta1, betaChains } = ols3(train);
  const xs = train.map((p) => Math.log(p.tvl_usd));
  // The residuals are net of the growth and age terms, because the prediction
  // adds those back: the intercept must not absorb their average.
  const residuals = train.map((p, i) => {
    const base =
      beta0 + beta1 * xs[i]! + betaChains * Math.log1p(p.chains.length);
    return (
      Math.log(p.mcap_usd!) - base -
      Math.log(growthMultiplier(p, gw, model)) -
      Math.log(ageMultiplier(p, asOf, agek, model))
    );
  });
  const globalResidual = median(residuals);
  const byCategory = new Map<string, number[]>();
  train.forEach((p, i) => {
    const key = p.category ?? 'Uncategorized';
    const list = byCategory.get(key) ?? [];
    list.push(residuals[i]!);
    byCategory.set(key, list);
  });
  const slopeDev = new Map<string, number>();
  const xbarByCategory = new Map<string, number>();
  for (const [key, list] of byCategory) {
    const idxs: number[] = [];
    train.forEach((p, i) => {
      if ((p.category ?? 'Uncategorized') === key) idxs.push(i);
    });
    const n = idxs.length;
    const xbar = idxs.reduce((a, i) => a + xs[i]!, 0) / n;
    xbarByCategory.set(key, xbar);
    if (n < 5) continue;
    let num = 0;
    let den = 0;
    for (const i of idxs) {
      num += (xs[i]! - xbar) * residuals[i]!;
      den += (xs[i]! - xbar) * (xs[i]! - xbar);
    }
    if (den <= 0) continue;
    slopeDev.set(key, (num / den) * (n / (n + slopeK)));
  }
  const intercepts = new Map<string, number>();
  for (const [key, list] of byCategory) {
    const xbar = xbarByCategory.get(key)!;
    const dev = slopeDev.get(key) ?? 0;
    const idxs: number[] = [];
    train.forEach((p, i) => {
      if ((p.category ?? 'Uncategorized') === key) idxs.push(i);
    });
    const adjusted = idxs.map((i) => residuals[i]! - dev * (xs[i]! - xbar));
    const sum = adjusted.reduce((a, b) => a + b, 0);
    intercepts.set(key, (sum + k * globalResidual) / (list.length + k));
  }
  return { beta0, beta1, betaChains, intercepts, slopeDev, xbarByCategory, globalResidual, shrinkK: k };
}

/** The predicted market cap of one protocol under a fitted core. */
function predictWithCore(
  p: SnapshotProtocol,
  asOf: string,
  core: FitCore,
  gw: number,
  agek: number,
  model: ModelConstants,
): number {
  const key = p.category ?? 'Uncategorized';
  const intercept = core.intercepts.get(key) ?? core.globalResidual;
  const dev = core.slopeDev.get(key) ?? 0;
  const xbar = core.xbarByCategory.get(key) ?? Math.log(p.tvl_usd);
  const x = Math.log(p.tvl_usd);
  const logValue =
    core.beta0 + (core.beta1 + dev) * x - dev * xbar + intercept +
    core.betaChains * Math.log1p(p.chains.length) +
    Math.log(growthMultiplier(p, gw, model)) +
    Math.log(ageMultiplier(p, asOf, agek, model));
  return Math.max(1, Math.exp(logValue));
}

/** The shrinkage strength a pool supports, picked once by leave-one-out on
 * that pool: each candidate k is scored by the median log error of the
 * 128 predictions that hold one protocol out at a time, and the best k wins.
 * Picking by leave-one-out matters: the old nested five-fold pick chose
 * k = 2, and held out k = 2 scores a mean median log error of 1.267 against
 * 1.233 at k = 4, because a five-fold inner test of ~26 protocols is too
 * noisy to choose among four strengths. One scalar is chosen from four
 * candidates, and the four validations below are then run with it frozen.
 */
const SHRINK_GRID = [2, 4, 8, 16];

function selectShrinkK(pool: SnapshotProtocol[], asOf: string, gw: number, agek: number, model: ModelConstants): { k: number; looError: number } {
  let bestK = SHRINK_GRID[0]!;
  let bestErr = Infinity;
  for (const k of SHRINK_GRID) {
    const predicted: number[] = [];
    const actual: number[] = [];
    for (const held of pool) {
      const train = pool.filter((p) => p.slug !== held.slug);
      const core = fitCore(train, k, model, gw, agek, asOf);
      predicted.push(predictWithCore(held, asOf, core, gw, agek, model));
      actual.push(held.mcap_usd!);
    }
    const err = medianLogError(predicted, actual);
    if (err < bestErr) {
      bestErr = err;
      bestK = k;
    }
  }
  return { k: bestK, looError: bestErr };
}

/** One held-out result: what one training set predicts on one test set. */
export interface HeldOutResult {
  train_size: number;
  test_size: number;
  mape: number;
  log_error: number;
  mean_log_error: number;
}

function validateSplit(
  train: SnapshotProtocol[],
  test: SnapshotProtocol[],
  asOf: string,
  gw: number,
  agek: number,
  model: ModelConstants,
  shrinkK: number,
): HeldOutResult {
  const core = fitCore(train, shrinkK, model, gw, agek, asOf);
  const predicted = test.map((p) => predictWithCore(p, asOf, core, gw, agek, model));
  const actual = test.map((p) => p.mcap_usd!);
  return {
    train_size: train.length,
    test_size: test.length,
    mape: medianPctError(predicted, actual),
    log_error: medianLogError(predicted, actual),
    mean_log_error: meanLogError(predicted, actual),
  };
}

/** One validation method: its name and its held-out result. */
export interface ValidationMethod {
  name: string;
  detail: string;
  mape: number;
  log_error: number;
  mean_log_error: number;
  train_size: number;
  test_size: number;
}

/** What the four held-out validations say about each value term, and whether it stays. */
export interface HeldOutValidation {
  methods: ValidationMethod[];
  /** Mean of the four methods' median log errors, with both terms in. */
  log_error_keep_both: number;
  log_error_drop_growth: number;
  log_error_drop_age: number;
  log_error_drop_both: number;
  mape_mean: number;
  log_error_mean: number;
  growth_kept: boolean;
  age_kept: boolean;
  shrink_k: number;
  /** Leave-one-out against two naive baselines, same splits and shrinkage. */
  baseline_loo: {
    model_mean_log_error: number;
    naive_median_mean_log_error: number;
    naive_tvl_mean_log_error: number;
    ratio_vs_median_multiple: number;
    ratio_vs_tvl: number;
  };
}

/** The value model the snapshot itself supports, and the validation behind it. */
export interface FittedModel {
  constants: ModelConstants;
  train_log_error: number;
  live_pool_size: number;
  validation: HeldOutValidation;
  /** Held-out coverage of the conformal range, as a share. */
  range_coverage: number;
  /** Mean log-width of the conformal range on the held-out check. */
  range_width_log: number;
  /** The conformal calibration fitted on the whole live pool. */
  conformal: {
    q_pooled: number;
    q_by_category: Record<string, number>;
    target: number;
  };
  /** Per-category fitted slopes, thickest categories first. */
  category_slopes: CategorySlope[];
}

/**
 * The four held-out validations for one pair of term weights: two-fold by
 * slug, walk-forward older-to-newer and newer-to-older, five-fold on a
 * seeded shuffle, and leave-one-out (each protocol held out once, the
 * predictions pooled). The shrinkage strength is re-picked inside every
 * training set, so no test protocol ever influences its own prediction.
 */
function runValidations(
  pool: SnapshotProtocol[],
  asOf: string,
  gw: number,
  agek: number,
  model: ModelConstants,
  shrinkK: number,
): { methods: ValidationMethod[]; baseline_loo: HeldOutValidation['baseline_loo'] } {
  const methods: ValidationMethod[] = [];
  const ordered = [...pool].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  // Two-fold by slug parity: each half trains, the other is predicted.
  {
    const results: HeldOutResult[] = [];
    for (const k of [0, 1]) {
      const train = ordered.filter((_, i) => i % 2 === k);
      const test = ordered.filter((_, i) => i % 2 !== k);
      results.push(validateSplit(train, test, asOf, gw, agek, model, shrinkK));
    }
    const mean = (f: (r: HeldOutResult) => number): number => results.reduce((a, r) => a + f(r), 0) / results.length;
    methods.push({
      name: 'two-fold',
      detail: 'split by slug order, each half predicts the other',
      mape: mean((r) => r.mape),
      log_error: mean((r) => r.log_error),
      mean_log_error: mean((r) => r.mean_log_error),
      train_size: results[0]!.train_size,
      test_size: results[0]!.test_size,
    });
  }

  // Walk-forward by listing date: older protocols train, newer ones are predicted, and the reverse.
  {
    const byDate = [...pool].sort((a, b) => {
      const da = a.listed_at ?? '9999';
      const db = b.listed_at ?? '9999';
      return da < db ? -1 : da > db ? 1 : a.slug < b.slug ? -1 : 1;
    });
    const half = Math.floor(byDate.length / 2);
    const results = [
      validateSplit(byDate.slice(0, half), byDate.slice(half), asOf, gw, agek, model, shrinkK),
      validateSplit(byDate.slice(half), byDate.slice(0, half), asOf, gw, agek, model, shrinkK),
    ];
    const mean = (f: (r: HeldOutResult) => number): number => results.reduce((a, r) => a + f(r), 0) / results.length;
    methods.push({
      name: 'walk-forward',
      detail: 'older-listed protocols predict newer-listed ones, and the reverse',
      mape: mean((r) => r.mape),
      log_error: mean((r) => r.log_error),
      mean_log_error: mean((r) => r.mean_log_error),
      train_size: results[0]!.train_size,
      test_size: results[0]!.test_size,
    });
  }

  // Five-fold on a seeded shuffle.
  {
    const shuffled = seededShuffle(ordered, 20261125);
    const folds: SnapshotProtocol[][] = [[], [], [], [], []];
    shuffled.forEach((p, i) => folds[i % 5]!.push(p));
    const results: HeldOutResult[] = [];
    for (let i = 0; i < 5; i++) {
      const train = folds.filter((_, j) => j !== i).flat();
      results.push(validateSplit(train, folds[i]!, asOf, gw, agek, model, shrinkK));
    }
    const mean = (f: (r: HeldOutResult) => number): number => results.reduce((a, r) => a + f(r), 0) / results.length;
    methods.push({
      name: 'five-fold',
      detail: 'seeded shuffle, five folds, each fold predicted once',
      mape: mean((r) => r.mape),
      log_error: mean((r) => r.log_error),
      mean_log_error: mean((r) => r.mean_log_error),
      train_size: results[0]!.train_size,
      test_size: results[0]!.test_size,
    });
  }

  // Leave-one-out: every protocol held out once, predictions pooled. The same
  // held-out round also scores two naive baselines on the identical splits:
  // the median market-cap / TVL multiple, and pricing at TVL itself.
  let baselineLoo: HeldOutValidation['baseline_loo'] | null = null;
  {
    const predicted: number[] = [];
    const naiveMedian: number[] = [];
    const naiveTvl: number[] = [];
    const actual: number[] = [];
    for (const held of ordered) {
      const train = ordered.filter((p) => p.slug !== held.slug);
      const core = fitCore(train, shrinkK, model, gw, agek, asOf);
      predicted.push(predictWithCore(held, asOf, core, gw, agek, model));
      const medianMultiple = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
      naiveMedian.push(Math.max(1, held.tvl_usd * medianMultiple));
      naiveTvl.push(Math.max(1, held.tvl_usd));
      actual.push(held.mcap_usd!);
    }
    const modelErr = meanLogError(predicted, actual);
    const medianErr = meanLogError(naiveMedian, actual);
    const tvlErr = meanLogError(naiveTvl, actual);
    baselineLoo = {
      model_mean_log_error: modelErr,
      naive_median_mean_log_error: medianErr,
      naive_tvl_mean_log_error: tvlErr,
      ratio_vs_median_multiple: medianErr / modelErr,
      ratio_vs_tvl: tvlErr / modelErr,
    };
    methods.push({
      name: 'leave-one-out',
      detail: 'each protocol held out once, all 128 predictions pooled',
      mape: medianPctError(predicted, actual),
      log_error: medianLogError(predicted, actual),
      mean_log_error: modelErr,
      train_size: ordered.length - 1,
      test_size: ordered.length,
    });
  }

  return { methods, baseline_loo: baselineLoo! };
}

const GROWTH_GRID = [0, 0.5, 1];
const AGE_GRID = [0, 0.1];

/**
 * The value model this snapshot supports: the log-log slope and shrunk
 * category intercepts fitted on every live-token protocol in it, with the
 * growth and age weights picked by a grid on the leave-one-out error and
 * each term kept only when the four held-out validations say keeping it
 * beats dropping it. Too few live-token protocols to fit or test, and the
 * model falls back to the stated constants with no validation to report.
 */
export function fitModel(snapshot: Snapshot): FittedModel | null {
  const pool = livePool(snapshot.protocols);
  if (pool.length < 8) return null;
  const asOf = snapshot.as_of;

  // Grid-pick the term weights by leave-one-out median log error on the full
  // pool: the training error is nearly tied across the grid (1.109–1.151)
  // and picks the wrong weights, while leave-one-out separates them cleanly
  // (1.267 for growth 1.00 + age 0.10, the best). Each grid cell also records
  // the shrinkage its leave-one-out round picked, so the validations below
  // reuse it instead of re-picking.
  const gridK = new Map<string, { k: number; err: number }>();
  let best: { gw: number; agek: number; err: number } | null = null;
  for (const gw of GROWTH_GRID) {
    for (const agek of AGE_GRID) {
      const picked = selectShrinkK(pool, asOf, gw, agek, MODEL);
      gridK.set(`${gw}|${agek}`, picked);
      if (best === null || picked.looError < best.err) best = { gw, agek, err: picked.looError };
    }
  }
  const fittedGw = best!.gw;
  const fittedAgek = best!.agek;

  // Keep or drop each term on the four held-out validations' mean log error.
  const meanLog = (run: { methods: ValidationMethod[] }): number =>
    run.methods.reduce((a, m) => a + m.log_error, 0) / run.methods.length;
  const kWithBoth = gridK.get(`${fittedGw}|${fittedAgek}`)!.k;
  const kDropGrowth = gridK.get(`0|${fittedAgek}`)!.k;
  const kDropAge = gridK.get(`${fittedGw}|0`)!.k;
  const kDropBoth = gridK.get(`0|0`)!.k;
  const withBoth = runValidations(pool, asOf, fittedGw, fittedAgek, MODEL, kWithBoth);
  const dropGrowth = runValidations(pool, asOf, 0, fittedAgek, MODEL, kDropGrowth);
  const dropAge = runValidations(pool, asOf, fittedGw, 0, MODEL, kDropAge);
  const dropBoth = runValidations(pool, asOf, 0, 0, MODEL, kDropBoth);
  const keepBoth = meanLog(withBoth);
  // A term counts as kept only when the grid actually fitted it in (a weight
  // above zero) and the held-out tests say keeping it beats dropping it. A
  // weight the grid itself set to zero is absent, not kept.
  const growthKept = fittedGw > 0 && keepBoth <= meanLog(dropGrowth);
  const ageKept = fittedAgek > 0 && keepBoth <= meanLog(dropAge);
  const gw = growthKept ? fittedGw : 0;
  const agek = ageKept ? fittedAgek : 0;
  const finalK =
    gw === fittedGw && agek === fittedAgek
      ? kWithBoth
      : gw === 0 && agek === fittedAgek
        ? kDropGrowth
        : gw === fittedGw && agek === 0
          ? kDropAge
          : kDropBoth;
  const finalRun =
    gw === fittedGw && agek === fittedAgek
      ? withBoth
      : gw === 0 && agek === fittedAgek
        ? dropGrowth
        : gw === fittedGw && agek === 0
          ? dropAge
          : dropBoth;
  const finalMethods = finalRun.methods;

  // The final constants, fitted on the whole pool with the kept terms.
  const k = finalK;
  const core = fitCore(pool, k, MODEL, gw, agek, asOf);
  const predicted = pool.map((p) => predictWithCore(p, asOf, core, gw, agek, MODEL));
  const constants: ModelConstants = {
    ...MODEL,
    slope: core.beta1,
    intercept: core.beta0,
    chains_coef: core.betaChains,
    growth_weight: gw,
    age_coef: agek,
    shrink_k: k,
  };

  // The conformal calibration the board's ranges are drawn from, and its
  // held-out coverage on a two-fold check that calibrates inside each half.
  const conformal = calibrateConformal(pool, asOf, gw, agek, MODEL, k);
  const coverageCheck = conformalCoverage(pool, asOf, gw, agek, MODEL, k);
  const categorySlopes: CategorySlope[] = [...core.slopeDev.entries()]
    .map(([category, deviation]) => ({
      category,
      live_peers: pool.filter((p) => (p.category ?? 'Uncategorized') === category).length,
      slope: core.beta1 + deviation,
      deviation,
    }))
    .sort((a, b) => b.live_peers - a.live_peers);

  return {
    constants,
    train_log_error: medianLogError(predicted, pool.map((p) => p.mcap_usd!)),
    live_pool_size: pool.length,
    validation: {
      methods: finalMethods,
      log_error_keep_both: keepBoth,
      log_error_drop_growth: meanLog(dropGrowth),
      log_error_drop_age: meanLog(dropAge),
      log_error_drop_both: meanLog(dropBoth),
      mape_mean: finalMethods.reduce((a, m) => a + m.mape, 0) / finalMethods.length,
      log_error_mean: meanLog(finalRun),
      growth_kept: growthKept,
      age_kept: ageKept,
      shrink_k: k,
      baseline_loo: finalRun.baseline_loo,
    },
    range_coverage: coverageCheck.coverage,
    range_width_log: coverageCheck.mean_width_log,
    conformal: {
      q_pooled: conformal.qPooled,
      q_by_category: Object.fromEntries(conformal.qByCategory),
      target: conformal.target,
    },
    category_slopes: categorySlopes,
  };
}

/* ================================================ conformal value ranges */

/** The conformal calibration: a half-width in log points, pooled and per category. */
export interface ConformalCalibration {
  qPooled: number;
  qByCategory: Map<string, number>;
  target: number;
}

/** The target quantile of a list of absolute log residuals, with the finite-sample correction. */
function conformalQuantile(absResiduals: number[], target: number): number {
  const sorted = [...absResiduals].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(target * (sorted.length + 1)) - 1);
  return sorted[idx]!;
}

/**
 * Calibrate the conformal range on a training pool: the absolute
 * leave-one-out log residuals give the target quantile, per category where
 * the category holds at least 8 live peers, shrunk toward the pooled
 * quantile with strength `conformal_shrink_k`; thinner categories take the
 * pooled quantile. No test protocol's own residual is ever in its range.
 */
export function calibrateConformal(
  train: SnapshotProtocol[],
  asOf: string,
  gw: number,
  agek: number,
  model: ModelConstants,
  shrinkK: number,
): ConformalCalibration {
  const ordered = [...train].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const all: number[] = [];
  const byCategory = new Map<string, number[]>();
  for (const held of ordered) {
    const rest = ordered.filter((p) => p.slug !== held.slug);
    const core = fitCore(rest, shrinkK, model, gw, agek, asOf);
    const predicted = predictWithCore(held, asOf, core, gw, agek, model);
    const r = Math.abs(Math.log(held.mcap_usd! / predicted));
    all.push(r);
    const key = held.category ?? 'Uncategorized';
    const list = byCategory.get(key) ?? [];
    list.push(r);
    byCategory.set(key, list);
  }
  const qPooled = conformalQuantile(all, model.conformal_target);
  const qByCategory = new Map<string, number>();
  for (const [key, list] of byCategory) {
    if (list.length < 8) continue;
    const qc = conformalQuantile(list, model.conformal_target);
    qByCategory.set(
      key,
      (list.length * qc + model.conformal_shrink_k * qPooled) / (list.length + model.conformal_shrink_k),
    );
  }
  return { qPooled, qByCategory, target: model.conformal_target };
}

/** The conformal half-width one protocol gets: its category's, or the pooled one. */
export function conformalQFor(p: SnapshotProtocol, conformal: ConformalCalibration): number {
  return conformal.qByCategory.get(p.category ?? 'Uncategorized') ?? conformal.qPooled;
}

/** The conformal range around an implied value: implied x exp(+/-q). */
export function conformalRange(implied: number, q: number): [number, number] {
  return [Math.max(1, Math.round(implied * Math.exp(-q))), Math.round(implied * Math.exp(q))];
}

/**
 * Held-out coverage of the conformal range: two-fold by slug, calibrating
 * inside each training half, so no protocol's own residual is in the range
 * that judges it. Also reports the mean log-width of the ranges.
 */
function conformalCoverage(
  pool: SnapshotProtocol[],
  asOf: string,
  gw: number,
  agek: number,
  model: ModelConstants,
  shrinkK: number,
): { coverage: number; mean_width_log: number } {
  const ordered = [...pool].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  let inside = 0;
  let total = 0;
  let widthSum = 0;
  for (const k of [0, 1]) {
    const train = ordered.filter((_, i) => i % 2 === k);
    const test = ordered.filter((_, i) => i % 2 !== k);
    const core = fitCore(train, shrinkK, model, gw, agek, asOf);
    const conformal = calibrateConformal(train, asOf, gw, agek, model, shrinkK);
    for (const p of test) {
      const implied = predictWithCore(p, asOf, core, gw, agek, model);
      const q = conformalQFor(p, conformal);
      const [low, high] = conformalRange(implied, q);
      total++;
      widthSum += 2 * q;
      if (p.mcap_usd! >= low && p.mcap_usd! <= high) inside++;
    }
  }
  return { coverage: total === 0 ? 0 : inside / total, mean_width_log: total === 0 ? 0 : widthSum / total };
}

/* ================================================ comparables and peer rates */

/** The comparables table: the fitted line, per category and global. */
export interface Comparables {
  beta0: number;
  beta1: number;
  betaChains: number;
  intercepts: Map<string, number>;
  slopeDev: Map<string, number>;
  xbarByCategory: Map<string, number>;
  globalResidual: number;
  peersByCategory: Map<string, number>;
  globalRatio: number;
  ratioByCategory: Map<string, number[]>;
  globalRatios: number[];
}

export function buildComparables(protocols: SnapshotProtocol[], model: ModelConstants, asOf: string): Comparables {
  const pool = livePool(protocols);
  const core = fitCore(pool, model.shrink_k, model, model.growth_weight, model.age_coef, asOf);
  const peersByCategory = new Map<string, number>();
  const ratioByCategory = new Map<string, number[]>();
  for (const p of pool) {
    const key = p.category ?? 'Uncategorized';
    peersByCategory.set(key, (peersByCategory.get(key) ?? 0) + 1);
    const list = ratioByCategory.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    ratioByCategory.set(key, list);
  }
  const globalRatios = pool.map((p) => p.mcap_usd! / p.tvl_usd);
  return {
    beta0: core.beta0,
    beta1: core.beta1,
    betaChains: core.betaChains,
    intercepts: core.intercepts,
    slopeDev: core.slopeDev,
    xbarByCategory: core.xbarByCategory,
    globalResidual: core.globalResidual,
    peersByCategory,
    globalRatio: median(globalRatios),
    ratioByCategory,
    globalRatios,
  };
}

/** The size-adjusted multiple one protocol gets, and where it came from. */
export function multipleFor(
  p: SnapshotProtocol,
  comps: Comparables,
): { multiple: number; source: string } {
  const key = p.category ?? 'Uncategorized';
  const intercept = comps.intercepts.get(key);
  const peers = comps.peersByCategory.get(key) ?? 0;
  const used = intercept ?? comps.globalResidual;
  const dev = comps.slopeDev.get(key) ?? 0;
  const xbar = comps.xbarByCategory.get(key) ?? Math.log(p.tvl_usd);
  // The multiple is the fitted line restated per dollar of TVL:
  // exp(beta0 + intercept + chains term - slope deviation x pivot) x
  // TVL^(slope + deviation - 1), so implied = TVL x multiple. A category
  // whose own slope bends away from the global one prices its protocols on
  // its own slope; a thin category keeps the global slope (deviation 0).
  const multiple =
    Math.exp(comps.beta0 + used + comps.betaChains * Math.log1p(p.chains.length) - dev * xbar) *
    Math.pow(p.tvl_usd, comps.beta1 + dev - 1);
  if (intercept !== undefined) {
    return { multiple, source: `size-adjusted line from ${peers} live ${p.category} peer${peers === 1 ? '' : 's'}${dev !== 0 ? ', category slope ' + (comps.beta1 + dev).toFixed(3) : ''}` };
  }
  return { multiple, source: `global line (no ${p.category ?? 'category'} peers in the fit)` };
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
  const growthMult = growthMultiplier(protocol, model.growth_weight, model);
  const maturityMult = ageMultiplier(protocol, asOf, model.age_coef, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, multiple, source, growthPct, growthMult, maturityMult, age };
}

/** The middle-half peer range around an implied value, from live peer multiples. */
export function peerRange(
  p: SnapshotProtocol,
  protocols: SnapshotProtocol[],
  implied: number,
): [number, number] {
  const pool = livePool(protocols);
  const key = p.category ?? 'Uncategorized';
  const catRatios = pool
    .filter((q) => (q.category ?? 'Uncategorized') === key)
    .map((q) => q.mcap_usd! / q.tvl_usd);
  const ratios = catRatios.length >= 5 ? catRatios : pool.map((q) => q.mcap_usd! / q.tvl_usd);
  const q25 = quantile(ratios, 0.25);
  const q50 = quantile(ratios, 0.5);
  const q75 = quantile(ratios, 0.75);
  if (q50 <= 0) return [Math.max(1, Math.round(implied / 4)), Math.round(implied * 4)];
  return [Math.max(1, Math.round(implied * (q25 / q50))), Math.round(implied * (q75 / q50))];
}

/** The peer token rates: global, per category, and per category-and-age cell. */
export interface PeerRates {
  global: number;
  byCategory: Map<string, number>;
  byCell: Map<string, number>;
}

export function buildPeerRates(protocols: SnapshotProtocol[], model: ModelConstants, asOf: string): PeerRates {
  const launched = (p: SnapshotProtocol): number => (isPreToken(p) ? 0 : 1);
  const global = protocols.reduce((a, p) => a + launched(p), 0) / protocols.length;
  const byCategory = new Map<string, number>();
  const catCounts = new Map<string, { n: number; l: number }>();
  for (const p of protocols) {
    const key = p.category ?? 'Uncategorized';
    const c = catCounts.get(key) ?? { n: 0, l: 0 };
    c.n++;
    c.l += launched(p);
    catCounts.set(key, c);
  }
  for (const [key, c] of catCounts) {
    byCategory.set(key, (c.l + model.peer_shrink_k * global) / (c.n + model.peer_shrink_k));
  }
  const byCell = new Map<string, number>();
  const cellCounts = new Map<string, { n: number; l: number; cat: string }>();
  for (const p of protocols) {
    const key = `${p.category ?? 'Uncategorized'}|${ageBand(ageDays(asOf, p.listed_at))}`;
    const c = cellCounts.get(key) ?? { n: 0, l: 0, cat: p.category ?? 'Uncategorized' };
    c.n++;
    c.l += launched(p);
    cellCounts.set(key, c);
  }
  for (const [key, c] of cellCounts) {
    const catRate = byCategory.get(c.cat) ?? global;
    byCell.set(key, (c.l + model.peer_shrink_k * catRate) / (c.n + model.peer_shrink_k));
  }
  return { global, byCategory, byCell };
}

/** The peer token rate for one protocol, from its category and age band. */
export function peerRateFor(p: SnapshotProtocol, asOf: string, rates: PeerRates): number {
  const key = `${p.category ?? 'Uncategorized'}|${ageBand(ageDays(asOf, p.listed_at))}`;
  return rates.byCell.get(key) ?? rates.byCategory.get(p.category ?? 'Uncategorized') ?? rates.global;
}

/** The peer rate in words: the cell it counts and the shrinkage behind it. */
export function peerRateNote(p: SnapshotProtocol, asOf: string, protocols: SnapshotProtocol[], model: ModelConstants): string {
  const band = ageBand(ageDays(asOf, p.listed_at));
  const cat = p.category ?? 'Uncategorized';
  const cell = protocols.filter((q) => (q.category ?? 'Uncategorized') === cat && ageBand(ageDays(asOf, q.listed_at)) === band);
  const launched = cell.filter((q) => !isPreToken(q)).length;
  const catProtocols = protocols.filter((q) => (q.category ?? 'Uncategorized') === cat);
  const catLaunched = catProtocols.filter((q) => !isPreToken(q)).length;
  return (
    `Of the ${cell.length} protocol${cell.length === 1 ? '' : 's'} in this snapshot in ${cat} tracked ${band}, ` +
    `${launched} record${launched === 1 ? 's' : ''} a token; the rate is shrunk toward the ${cat} rate ` +
    `(${catLaunched} of ${catProtocols.length}) and then the global rate, with strength ${model.peer_shrink_k}.`
  );
}

/** The share recording a token in each age band, for the model view. */
export interface AgeBandRate {
  band: string;
  launched: number;
  total: number;
  rate: number;
}

export function ageBandRates(protocols: SnapshotProtocol[], asOf: string): AgeBandRate[] {
  const bands = ['under 1 year', '1–2 years', '2–3 years', '3+ years', 'unknown age'];
  return bands.map((band) => {
    const cell = protocols.filter((p) => ageBand(ageDays(asOf, p.listed_at)) === band);
    const launched = cell.filter((p) => !isPreToken(p)).length;
    return {
      band,
      launched,
      total: cell.length,
      rate: cell.length === 0 ? 0 : Math.round((launched / cell.length) * 1000) / 1000,
    };
  });
}

/* ================================================================= farm plans */

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

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

/** The gas fees and attention one farm plan costs at one capital size. */
function tierCost(capital: number, hold: number): { fees: number; hours: number } {
  const weeks = Math.ceil(hold / 7);
  const fees = 3 + (capital >= 150 ? 8 : 4) + 2 * weeks;
  const hours = Math.round(((5 + 15 + 15 + 10 + 10 * weeks) / 60) * 10) / 10;
  return { fees, hours };
}

/**
 * The capital tiers a farm plan is priced at. The tiers are spaced so the
 * minimum viable capital actually discriminates: at $50 and $100 the fees
 * (about $17–$25 over the hold) eat a third to a quarter of the capital, so
 * no row is viable there; at $250 the fees (about $21–$29) stay under 10%
 * only on the 30-day hold, so older protocols clear $250 and younger ones
 * need $500. A single $50 / $150 / $500 ladder made every row's minimum
 * $500, which said nothing.
 */
export const FARM_TIERS = [50, 100, 250, 500];

/**
 * The costed verdict for one farm plan, priced at three capital tiers: the
 * gas fees are roughly fixed per action, so the fee share falls as the
 * capital rises, and the row names its minimum viable capital — the
 * smallest tier whose fees stay under 10% of the capital. A row whose fees
 * eat 10% even at $500 names no viable tier.
 */
export function farmVerdict(
  p: SnapshotProtocol,
  age: number | null,
  expectedValue: number,
): { cost_usd: number; hours: number; verdict: string; tiers: FarmTier[]; min_viable_capital_usd: number | null } {
  const hold = holdDaysFor(age);
  const tiers: FarmTier[] = FARM_TIERS.map((capital) => {
    const { fees, hours } = tierCost(capital, hold);
    const share = fees / capital;
    const perHour = Math.round((fees / hours) * 10) / 10;
    const verdict =
      share >= 0.25
        ? 'fees eat more than a quarter of the capital'
        : share >= 0.1
          ? 'fees are a visible share of the capital'
          : 'fees are a small share of the capital';
    return {
      capital_usd: capital,
      fees_usd: fees,
      fee_share: Math.round(share * 1000) / 1000,
      hours,
      fees_per_hour_usd: perHour,
      verdict,
    };
  });
  const viable = tiers.find((t) => t.fee_share < 0.1);
  const minViable = viable === undefined ? null : viable.capital_usd;
  // The plan itself is written for the row's own capital; the verdict prices it at every tier.
  const capital = capitalFor(p);
  const { fees, hours } = tierCost(capital, hold);
  const perHour = Math.round((fees / hours) * 10) / 10;
  const share = fees / capital;
  const worth =
    share >= 0.25
      ? 'the fees eat more than a quarter of the capital, so only farm this with a bigger position than the minimum'
      : share >= 0.1
        ? 'the fees are a visible share of the capital, so farm it only if you hold the full period'
        : 'the fees are a small share of the capital, so the plan is cheap to run';
  const viableLine =
    minViable === null
      ? 'Even at $500 of capital the fees stay over 10% of it, so this row has no minimum viable capital below $500: farm it only with a larger position, or skip it.'
      : `Minimum viable capital $${minViable}: the smallest of the $50 / $100 / $250 / $500 tiers whose fees stay under 10% of the capital.`;
  return {
    cost_usd: fees,
    hours,
    verdict:
      `Farm verdict: about $${fees} in gas on $${capital} of capital over ${hold} days, ` +
      `around ${hours} hours of attention (about $${perHour} an hour in fees) — ${worth}. ${viableLine} ` +
      `Expected value $${expectedValue.toLocaleString('en-US')} is the token's hypothetical value at the peer rate, not a payout: farm for the position, not for a promised amount.`,
    tiers,
    min_viable_capital_usd: minViable,
  };
}

/**
 * The three nearest live-token protocols in the same category, nearest by
 * TVL: the traded tokens this row's multiple is anchored on, with their real
 * market caps and multiples beside them.
 */
export function anchorsFor(p: SnapshotProtocol, protocols: SnapshotProtocol[]): Anchor[] {
  const key = p.category ?? 'Uncategorized';
  const x = Math.log(p.tvl_usd);
  return livePool(protocols)
    .filter((q) => (q.category ?? 'Uncategorized') === key)
    .map((q) => ({ q, d: Math.abs(Math.log(q.tvl_usd) - x) }))
    .sort((a, b) => a.d - b.d || (a.q.slug < b.q.slug ? -1 : 1))
    .slice(0, 3)
    .map(({ q }) => ({
      slug: q.slug,
      name: q.name,
      tvl_usd: q.tvl_usd,
      mcap_usd: q.mcap_usd,
      mcap_tvl: q.mcap_usd !== null && q.tvl_usd > 0 ? round4(q.mcap_usd / q.tvl_usd) : null,
    }));
}

/* ===================================================================== board */

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
  conformal: ConformalCalibration | null = null,
): BoardRow[] {
  const comps = buildComparables(snapshot.protocols, model, snapshot.as_of);
  const rates = buildPeerRates(snapshot.protocols, model, snapshot.as_of);
  const live = livePool(snapshot.protocols);
  const calibration =
    conformal ?? calibrateConformal(live, snapshot.as_of, model.growth_weight, model.age_coef, model, model.shrink_k);
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
    const rate = peerRateFor(p, snapshot.as_of, rates);
    const expected = Math.max(1, Math.round(v.implied * rate));
    const q = conformalQFor(p, calibration);
    const [low, high] = conformalRange(v.implied, q);
    const [typicalLow, typicalHigh] = peerRange(p, snapshot.protocols, v.implied);
    const verdict = farmVerdict(p, v.age, expected);
    const anchors = anchorsFor(p, snapshot.protocols);
    return { p, ...v, rate, expected, low, high, q, typicalLow, typicalHigh, verdict, anchors };
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
    peer_rate: Math.round(s.rate * 1000) / 1000,
    peer_rate_note: peerRateNote(s.p, snapshot.as_of, snapshot.protocols, model),
    expected_value_usd: s.expected,
    value_low_usd: s.low,
    value_high_usd: s.high,
    conformal_q: Math.round(s.q * 1000) / 1000,
    typical_low_usd: s.typicalLow,
    typical_high_usd: s.typicalHigh,
    anchors: s.anchors,
    farm_cost_usd: s.verdict.cost_usd,
    farm_hours: s.verdict.hours,
    farm_verdict: s.verdict.verdict,
    farm_tiers: s.verdict.tiers,
    min_viable_capital_usd: s.verdict.min_viable_capital_usd,
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** Every live-token protocol, by market cap, for the dashboard's Already trading view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
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
    peer_rate: row.peer_rate,
    peer_rate_note: row.peer_rate_note,
    expected_value_usd: row.expected_value_usd,
    value_low_usd: row.value_low_usd,
    value_high_usd: row.value_high_usd,
    conformal_q: row.conformal_q,
    typical_low_usd: row.typical_low_usd,
    typical_high_usd: row.typical_high_usd,
    anchors: row.anchors,
    farm_cost_usd: row.farm_cost_usd,
    farm_hours: row.farm_hours,
    farm_verdict: row.farm_verdict,
    farm_tiers: row.farm_tiers,
    min_viable_capital_usd: row.min_viable_capital_usd,
    farm_steps: row.farm_steps,
  };
}

/** How the snapshot's protocols are accounted for across board, live and excluded. */
export function buildCoverage(snapshot: Snapshot, board: BoardRow[]): Coverage {
  const boardSlugs = new Set(board.map((r) => r.slug));
  const live = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const excludedByReason: Record<string, number> = {};
  let excluded = 0;
  for (const p of snapshot.protocols) {
    if (!isPreToken(p) || boardSlugs.has(p.slug)) continue;
    const reason = exclusionReason(p) ?? 'not rankable';
    excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1;
    excluded++;
  }
  return {
    total: snapshot.protocols.length,
    board: board.length,
    live,
    excluded,
    excluded_by_reason: excludedByReason,
    watchlist_on_board: board.filter((r) => r.watchlist).length,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fitted = fitModel(snapshot);
  const effective = fitted === null ? model : fitted.constants;
  const conformal: ConformalCalibration =
    fitted === null
      ? calibrateConformal(livePool(snapshot.protocols), snapshot.as_of, effective.growth_weight, effective.age_coef, effective, effective.shrink_k)
      : {
          qPooled: fitted.conformal.q_pooled,
          qByCategory: new Map(Object.entries(fitted.conformal.q_by_category)),
          target: fitted.conformal.target,
        };
  const board = buildBoard(snapshot, effective, conformal);
  const live = liveRows(snapshot);
  const comps = buildComparables(snapshot.protocols, effective, snapshot.as_of);
  const rates = buildPeerRates(snapshot.protocols, effective, snapshot.as_of);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: effective,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    global_multiple: round4(comps.globalRatio),
    global_peer_rate: Math.round(rates.global * 1000) / 1000,
    age_band_rates: ageBandRates(snapshot.protocols, snapshot.as_of),
    conformal_q_pooled: Math.round(conformal.qPooled * 1000) / 1000,
    conformal_target: conformal.target,
    category_slopes: fitted === null ? [] : fitted.category_slopes,
    coverage: buildCoverage(snapshot, board),
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
    if (!(r.peer_rate >= 0 && r.peer_rate <= 1)) return `${r.slug} has peer rate ${r.peer_rate}`;
    if (!Number.isSafeInteger(r.expected_value_usd) || r.expected_value_usd <= 0) return `${r.slug} has expected value ${r.expected_value_usd}`;
    if (!(r.value_low_usd > 0 && r.value_low_usd <= r.implied_value_usd && r.implied_value_usd <= r.value_high_usd)) {
      return `${r.slug} has a range that does not contain its implied value`;
    }
    if (!(r.conformal_q > 0) || !(r.typical_low_usd > 0 && r.typical_low_usd <= r.implied_value_usd && r.implied_value_usd <= r.typical_high_usd)) {
      return `${r.slug} has a bad conformal or typical range`;
    }
    if (!Array.isArray(r.anchors) || r.anchors.length > 3) return `${r.slug} has ${r.anchors?.length} anchors`;
    if (!Array.isArray(r.farm_tiers) || r.farm_tiers.length !== 4) return `${r.slug} has ${r.farm_tiers?.length} farm tiers`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
