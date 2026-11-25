// Token Radar — the comparables model (radar-4-size-adjusted).
//
// One sealed snapshot in, one ranked board out. The board ranks protocols that
// record no token, by what their token would be worth if the protocol's record
// stayed as it is. It never predicts whether or when a token is issued.
//
// What changed from radar-3 (round 1):
// - The multiple is size-adjusted. Round 1 priced every protocol as
//   TVL x the median market-cap / TVL of its category, which assumes a token's
//   market cap grows in proportion to TVL. On this snapshot it does not: a
//   log-log fit of market cap on TVL across the 128 live-token protocols with
//   a market cap and a TVL above zero gives a slope of about 0.52, so big
//   protocols trade at much lower multiples than small ones. Radar-4 fits that
//   slope and a shrunk category intercept per category, so the multiple is
//   exp(intercept) x TVL^(slope - 1): it falls as protocols get bigger.
// - Every term is kept or dropped on four held-out validations, not two:
//   two-fold by slug, walk-forward older-to-newer (and the reverse), five-fold
//   on a seeded shuffle, and leave-one-out. The shrinkage strength is picked
//   by nested inner five-fold inside each training set, never by the test
//   error. Growth stays in as a fitted weight; the age term is dropped when
//   the held-out tests say it hurts, and the dashboard says so.
// - Each row carries a peer token rate and an expected value. The rate is the
//   share of protocols in the snapshot with the same category and age band
//   that record a token, shrunk toward the category rate and then the global
//   rate. It is a fact about the peers' record, not a forecast: the entry
//   still does not predict whether or when any protocol issues a token.
// - Each row carries a value range: the middle half of its category's live
//   peer multiples, applied to its implied value. Held-out, about half of the
//   live protocols' real market caps fall inside their own range.
// - The farm plan ends in a verdict: the gas fees, the capital, the hours,
//   and the expected value next to them, so a reader can see whether farming
//   a row is worth the attention it costs.
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
  /** Weight on log(1 + clamped 7-day TVL change); 0 when the tests drop growth. */
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  /** Coefficient on log(age in days); 0 when the tests drop the age term. */
  age_coef: number;
  unknown_age_days: number;
  /** Shrinkage strength for the category intercepts, picked by nested CV. */
  shrink_k: number;
  /** Shrinkage strength for the peer token rates. */
  peer_shrink_k: number;
}

export const MODEL: ModelConstants = {
  slope: 1,
  intercept: 0,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  age_coef: 0,
  unknown_age_days: 365,
  shrink_k: 4,
  peer_shrink_k: 8,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-4-size-adjusted';

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
  /** Middle-half peer range around the implied value. */
  value_low_usd: number;
  value_high_usd: number;
  /** Gas fees for the whole farm plan, in whole dollars (capital excluded). */
  farm_cost_usd: number;
  /** Hours of attention the farm plan takes, to one decimal. */
  farm_hours: number;
  /** The costed verdict: fees, capital, hours, expected value. */
  farm_verdict: string;
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
  peer_rate: number;
  peer_rate_note: string;
  expected_value_usd: number;
  value_low_usd: number;
  value_high_usd: number;
  farm_cost_usd: number;
  farm_hours: number;
  farm_verdict: string;
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
  coverage: Coverage;
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
  intercepts: Map<string, number>;
  globalResidual: number;
  shrinkK: number;
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
 * The log-log line log(mcap) = beta0 + beta1 * log(tvl), fitted by least
 * squares on the training pool, plus a shrunk intercept per category: the
 * mean log-residual of the category's protocols, pulled toward the global
 * median residual with strength `k`. Categories with no protocols in the
 * training set fall back to the global residual.
 */
function fitCore(train: SnapshotProtocol[], k: number): FitCore {
  const xs = train.map((p) => Math.log(p.tvl_usd));
  const ys = train.map((p) => Math.log(p.mcap_usd!));
  const n = train.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const beta1 = sxx > 0 ? sxy / sxx : 0;
  const beta0 = my - beta1 * mx;
  const residuals = train.map((p, i) => ys[i]! - (beta0 + beta1 * xs[i]!));
  const globalResidual = median(residuals);
  const byCategory = new Map<string, number[]>();
  train.forEach((p, i) => {
    const key = p.category ?? 'Uncategorized';
    const list = byCategory.get(key) ?? [];
    list.push(residuals[i]!);
    byCategory.set(key, list);
  });
  const intercepts = new Map<string, number>();
  for (const [key, list] of byCategory) {
    const sum = list.reduce((a, b) => a + b, 0);
    intercepts.set(key, (sum + k * globalResidual) / (list.length + k));
  }
  return { beta0, beta1, intercepts, globalResidual, shrinkK: k };
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
  const intercept = core.intercepts.get(p.category ?? 'Uncategorized') ?? core.globalResidual;
  const logValue =
    core.beta0 + core.beta1 * Math.log(p.tvl_usd) + intercept +
    Math.log(growthMultiplier(p, gw, model)) +
    Math.log(ageMultiplier(p, asOf, agek, model));
  return Math.max(1, Math.exp(logValue));
}

/** The shrinkage strength a training set supports, picked by inner five-fold. */
const SHRINK_GRID = [2, 4, 8, 16];

function selectShrinkK(train: SnapshotProtocol[], asOf: string, gw: number, agek: number, model: ModelConstants): number {
  const shuffled = seededShuffle(train, 20261125);
  const folds: SnapshotProtocol[][] = [[], [], [], [], []];
  shuffled.forEach((p, i) => folds[i % 5]!.push(p));
  let bestK = SHRINK_GRID[0]!;
  let bestErr = Infinity;
  for (const k of SHRINK_GRID) {
    const foldErrs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const innerTrain = folds.filter((_, j) => j !== i).flat();
      const innerTest = folds[i]!;
      if (innerTrain.length === 0 || innerTest.length === 0) continue;
      const core = fitCore(innerTrain, k);
      const predicted = innerTest.map((p) => predictWithCore(p, asOf, core, gw, agek, model));
      foldErrs.push(medianLogError(predicted, innerTest.map((p) => p.mcap_usd!)));
    }
    const meanErr = foldErrs.reduce((a, b) => a + b, 0) / foldErrs.length;
    if (meanErr < bestErr) {
      bestErr = meanErr;
      bestK = k;
    }
  }
  return bestK;
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
): HeldOutResult {
  const k = selectShrinkK(train, asOf, gw, agek, model);
  const core = fitCore(train, k);
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
}

/** The value model the snapshot itself supports, and the validation behind it. */
export interface FittedModel {
  constants: ModelConstants;
  train_log_error: number;
  live_pool_size: number;
  validation: HeldOutValidation;
  /** Held-out coverage of the middle-half peer range, as a share. */
  range_coverage: number;
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
): ValidationMethod[] {
  const methods: ValidationMethod[] = [];
  const ordered = [...pool].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  // Two-fold by slug parity: each half trains, the other is predicted.
  {
    const results: HeldOutResult[] = [];
    for (const k of [0, 1]) {
      const train = ordered.filter((_, i) => i % 2 === k);
      const test = ordered.filter((_, i) => i % 2 !== k);
      results.push(validateSplit(train, test, asOf, gw, agek, model));
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
      validateSplit(byDate.slice(0, half), byDate.slice(half), asOf, gw, agek, model),
      validateSplit(byDate.slice(half), byDate.slice(0, half), asOf, gw, agek, model),
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
      results.push(validateSplit(train, folds[i]!, asOf, gw, agek, model));
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

  // Leave-one-out: every protocol held out once, predictions pooled.
  {
    const predicted: number[] = [];
    const actual: number[] = [];
    for (const held of ordered) {
      const train = ordered.filter((p) => p.slug !== held.slug);
      const k = selectShrinkK(train, asOf, gw, agek, model);
      const core = fitCore(train, k);
      predicted.push(predictWithCore(held, asOf, core, gw, agek, model));
      actual.push(held.mcap_usd!);
    }
    methods.push({
      name: 'leave-one-out',
      detail: 'each protocol held out once, all 128 predictions pooled',
      mape: medianPctError(predicted, actual),
      log_error: medianLogError(predicted, actual),
      mean_log_error: meanLogError(predicted, actual),
      train_size: ordered.length - 1,
      test_size: ordered.length,
    });
  }

  return methods;
}

const GROWTH_GRID = [0, 0.5, 1];
const AGE_GRID = [0, 0.1];

/**
 * The value model this snapshot supports: the log-log slope and shrunk
 * category intercepts fitted on every live-token protocol in it, with the
 * growth and age weights picked by a grid on the training error and each
 * term kept only when the four held-out validations say keeping it beats
 * dropping it. Too few live-token protocols to fit or test, and the model
 * falls back to the stated constants with no validation to report.
 */
export function fitModel(snapshot: Snapshot): FittedModel | null {
  const pool = livePool(snapshot.protocols);
  if (pool.length < 8) return null;
  const asOf = snapshot.as_of;

  // Grid-pick the term weights on the training error (the full pool).
  let best: { gw: number; agek: number; err: number } | null = null;
  for (const gw of GROWTH_GRID) {
    for (const agek of AGE_GRID) {
      const k = selectShrinkK(pool, asOf, gw, agek, MODEL);
      const core = fitCore(pool, k);
      const predicted = pool.map((p) => predictWithCore(p, asOf, core, gw, agek, MODEL));
      const err = medianLogError(predicted, pool.map((p) => p.mcap_usd!));
      if (best === null || err < best.err) best = { gw, agek, err };
    }
  }
  const fittedGw = best!.gw;
  const fittedAgek = best!.agek;

  // Keep or drop each term on the four held-out validations' mean log error.
  const meanLog = (methods: ValidationMethod[]): number =>
    methods.reduce((a, m) => a + m.log_error, 0) / methods.length;
  const withBoth = runValidations(pool, asOf, fittedGw, fittedAgek, MODEL);
  const dropGrowth = runValidations(pool, asOf, 0, fittedAgek, MODEL);
  const dropAge = runValidations(pool, asOf, fittedGw, 0, MODEL);
  const dropBoth = runValidations(pool, asOf, 0, 0, MODEL);
  const keepBoth = meanLog(withBoth);
  // A term counts as kept only when the grid actually fitted it in (a weight
  // above zero) and the held-out tests say keeping it beats dropping it. A
  // weight the grid itself set to zero is absent, not kept.
  const growthKept = fittedGw > 0 && keepBoth <= meanLog(dropGrowth);
  const ageKept = fittedAgek > 0 && keepBoth <= meanLog(dropAge);
  const gw = growthKept ? fittedGw : 0;
  const agek = ageKept ? fittedAgek : 0;
  const finalMethods = gw === fittedGw && agek === fittedAgek ? withBoth : runValidations(pool, asOf, gw, agek, MODEL);

  // The final constants, fitted on the whole pool with the kept terms.
  const k = selectShrinkK(pool, asOf, gw, agek, MODEL);
  const core = fitCore(pool, k);
  const predicted = pool.map((p) => predictWithCore(p, asOf, core, gw, agek, MODEL));
  const constants: ModelConstants = {
    ...MODEL,
    slope: core.beta1,
    intercept: core.beta0,
    growth_weight: gw,
    age_coef: agek,
    shrink_k: k,
  };

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
      log_error_mean: meanLog(finalMethods),
      growth_kept: growthKept,
      age_kept: ageKept,
      shrink_k: k,
    },
    range_coverage: rangeCoverage(pool, asOf, gw, agek, MODEL),
  };
}

/**
 * Held-out coverage of the middle-half peer range: for each live protocol,
 * does its real market cap fall inside the range its category's peer
 * multiples imply? Two-fold by slug, so no protocol's own multiple is in
 * the range that judges it.
 */
function rangeCoverage(
  pool: SnapshotProtocol[],
  asOf: string,
  gw: number,
  agek: number,
  model: ModelConstants,
): number {
  const ordered = [...pool].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  let inside = 0;
  let total = 0;
  for (const k of [0, 1]) {
    const train = ordered.filter((_, i) => i % 2 === k);
    const test = ordered.filter((_, i) => i % 2 !== k);
    const shrinkK = selectShrinkK(train, asOf, gw, agek, model);
    const core = fitCore(train, shrinkK);
    for (const p of test) {
      const implied = predictWithCore(p, asOf, core, gw, agek, model);
      const [low, high] = peerRange(p, train, implied);
      total++;
      if (p.mcap_usd! >= low && p.mcap_usd! <= high) inside++;
    }
  }
  return total === 0 ? 0 : inside / total;
}

/* ================================================ comparables and peer rates */

/** The comparables table: the fitted line, per category and global. */
export interface Comparables {
  beta0: number;
  beta1: number;
  intercepts: Map<string, number>;
  globalResidual: number;
  peersByCategory: Map<string, number>;
  globalRatio: number;
  ratioByCategory: Map<string, number[]>;
  globalRatios: number[];
}

export function buildComparables(protocols: SnapshotProtocol[], model: ModelConstants): Comparables {
  const pool = livePool(protocols);
  const core = fitCore(pool, model.shrink_k);
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
    intercepts: core.intercepts,
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
  // The multiple is the fitted line restated per dollar of TVL:
  // exp(beta0 + intercept) x TVL^(slope - 1), so implied = TVL x multiple.
  const multiple = Math.exp(comps.beta0 + used) * Math.pow(p.tvl_usd, comps.beta1 - 1);
  if (intercept !== undefined) {
    return { multiple, source: `size-adjusted line from ${peers} live ${p.category} peers` };
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

/** The costed verdict for one farm plan: fees against the capital they eat, plus the expected value as context. */
export function farmVerdict(
  p: SnapshotProtocol,
  age: number | null,
  expectedValue: number,
): { cost_usd: number; hours: number; verdict: string } {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const fees = 3 + (capital >= 150 ? 8 : 4) + 2 * weeks;
  const hours = Math.round(((5 + 15 + 15 + 10 + 10 * weeks) / 60) * 10) / 10;
  const perHour = Math.round((fees / hours) * 10) / 10;
  const share = fees / capital;
  const worth =
    share >= 0.25
      ? 'the fees eat more than a quarter of the capital, so only farm this with a bigger position than the minimum'
      : share >= 0.1
        ? 'the fees are a visible share of the capital, so farm it only if you hold the full period'
        : 'the fees are a small share of the capital, so the plan is cheap to run';
  return {
    cost_usd: fees,
    hours,
    verdict:
      `Farm verdict: about $${fees} in gas on $${capital} of capital over ${hold} days, ` +
      `around ${hours} hours of attention (about $${perHour} an hour in fees) — ${worth}. ` +
      `Expected value $${expectedValue.toLocaleString('en-US')} is the token's hypothetical value at the peer rate, not a payout: farm for the position, not for a promised amount.`,
  };
}

/* ===================================================================== board */

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = buildComparables(snapshot.protocols, model);
  const rates = buildPeerRates(snapshot.protocols, model, snapshot.as_of);
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
    const [low, high] = peerRange(p, snapshot.protocols, v.implied);
    const verdict = farmVerdict(p, v.age, expected);
    return { p, ...v, rate, expected, low, high, verdict };
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
    farm_cost_usd: s.verdict.cost_usd,
    farm_hours: s.verdict.hours,
    farm_verdict: s.verdict.verdict,
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
    farm_cost_usd: row.farm_cost_usd,
    farm_hours: row.farm_hours,
    farm_verdict: row.farm_verdict,
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
  const board = buildBoard(snapshot, effective);
  const live = liveRows(snapshot);
  const comps = buildComparables(snapshot.protocols, effective);
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
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
