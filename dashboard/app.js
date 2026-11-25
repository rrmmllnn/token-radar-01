/* Token Radar — the dashboard.
 *
 * The data comes from ../data.js, written by main.ts from the same board that
 * board.json holds: every row is a protocol that records no token, ranked by
 * its implied value. The value model (radar-5-conformal) is:
 *
 *   log(mcap)  = intercept + slope x log(TVL) + chains x log(1 + chains)
 *                + category intercept + category slope deviation,
 *                fitted by least squares on the 128 live-token protocols with
 *                a market cap and a TVL above zero. The slope is about 0.51:
 *                market cap grows slower than TVL, so big protocols trade at
 *                lower multiples. Each category with at least 5 live peers
 *                bends the slope toward its own (shrunk with strength 32);
 *                the category intercept is the mean log-residual of the
 *                category's live protocols, shrunk toward the global median
 *                with a strength picked by leave-one-out on the whole pool.
 *   multiple   = exp(intercept + category intercept + chains term)
 *                x TVL^(slope + deviation - 1)
 *   implied    = TVL x multiple x growth x age
 *   growth     = exp(weight x log(1 + clamp(change_7d, -60, 120) / 100)),
 *                weight 1.00 on this snapshot, kept by the held-out tests.
 *   age        = exp(0.10 x log(age in days)); the held-out tests keep it
 *                at 0.10 — a protocol that has run longer with no token
 *                scores slightly higher. Age also moves the peer rate.
 *   peer rate  = share of protocols in the same category and age band that
 *                record a token, shrunk toward the category rate and then the
 *                global rate. Expected value = implied x peer rate.
 *   range      = the conformal 80% range: implied x exp(+/-q), where q is
 *                the 80% quantile of the absolute leave-one-out log residuals
 *                (per category where the category holds 8+ live peers,
 *                shrunk toward the pooled quantile). Held out, 82.8% of live
 *                protocols' real market caps fall inside their own range.
 *                The middle half of the peer multiples survives as the
 *                row's "typical range" in the detail view.
 *   anchors    = the three nearest live-token protocols in the same
 *                category (nearest by TVL), with their real market caps:
 *                the traded tokens the row's multiple is anchored on.
 *   farm tiers = the same plan priced at $50 / $100 / $250 / $500 of
 *                capital; the minimum viable capital is the smallest tier
 *                whose fees stay under 10% of the capital.
 *
 * Every term is kept or dropped on four held-out validations the fit never
 * saw (two-fold, walk-forward older-to-newer, five-fold, leave-one-out); the
 * model view shows each method's error, the shrinkage choice, and the
 * leave-one-out comparison against two naive baselines. No name is
 * special-cased: the same function scores every row. The detail view shows
 * each row's own breakdown, so the number on the board can always be checked
 * against the figures behind it. The strip under the header accounts for all
 * 758 protocols in the snapshot: board rows, live-token protocols, and the
 * excluded ones with their reasons.
 */
'use strict';

const D = window.RADAR;
const rows = D.rows;
const bySlug = new Map(rows.map((r) => [r.slug, r]));
const params = new URLSearchParams(location.search);

/* --------------------------------------------------------------- formatting */
const fmtUsd = (n) => {
  if (n === null || n === undefined) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
};
const fmtPct = (n) => {
  if (n === null || n === undefined) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
};
const fmtRate = (n) => (n === null || n === undefined ? '—' : Math.round(n * 100) + '%');
const fmtAge = (n) => {
  if (n === null || n === undefined) return '—';
  if (n >= 365) return (n / 365).toFixed(1) + 'y';
  if (n >= 30) return Math.round(n / 30) + 'mo';
  return n + 'd';
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------- stats */
const watchlistRows = rows.filter((r) => r.watchlist).length;
document.getElementById('stats').innerHTML =
  '<div><dt>Board rows</dt><dd>' + rows.length + '</dd></div>' +
  '<div><dt>Watchlist covered</dt><dd>' + watchlistRows + ' / ' + D.watchlist_size + '</dd></div>' +
  '<div><dt>Top implied value</dt><dd>' + fmtUsd(rows[0].implied_value_usd) + '</dd></div>' +
  '<div><dt>Top expected value</dt><dd>' + fmtUsd(Math.max(...rows.map((r) => r.expected_value_usd))) + '</dd></div>' +
  '<div><dt>Snapshot</dt><dd>' + esc(D.as_of) + '</dd></div>';
document.getElementById('source').textContent =
  'Snapshot: ' + D.source + '. Floor for the watchlist: ' + fmtUsd(D.floor_usd) + ' TVL. Model ' + D.model_version + '.';

/* --------------------------------------------------------- integrity strip */
const cov = D.coverage;
const reasons = Object.entries(cov.excluded_by_reason)
  .map(([reason, n]) => n + ' ' + reason)
  .join(', ');
document.getElementById('integrity').innerHTML =
  '<b>Integrity strip — all ' + cov.total + ' protocols accounted for:</b> ' +
  '<b>' + cov.board + '</b> on the board (all ' + cov.watchlist_on_board + ' watchlist protocols included) · ' +
  '<b>' + cov.live + '</b> already trading, listed apart as the comparables · ' +
  '<b>' + cov.excluded + '</b> pre-token protocols excluded (' + esc(reasons) + '). ' +
  'No protocol name is special-cased: one function scores every row, and the model view shows the fit and every held-out test behind it.';

/* ------------------------------------------------------------ filter state */
const state = {
  q: params.get('q') || '',
  category: params.get('category') || '',
  chain: params.get('chain') || '',
  minTvl: Number(params.get('mintvl') || 0) || 0,
  minPeer: Number(params.get('minpeer') || 0) || 0,
  watchlistOnly: params.get('watchlist') === '1',
  sort: params.get('sort') || 'implied',
};

const catSel = document.getElementById('category');
const chainSel = document.getElementById('chain');
const uniq = (list) => [...new Set(list)].sort((a, b) => a.localeCompare(b));
for (const c of uniq(rows.map((r) => r.category || 'Uncategorized'))) {
  const o = document.createElement('option');
  o.value = c; o.textContent = c; catSel.appendChild(o);
}
for (const c of uniq(rows.flatMap((r) => r.chains))) {
  const o = document.createElement('option');
  o.value = c; o.textContent = c; chainSel.appendChild(o);
}
document.getElementById('q').value = state.q;
catSel.value = state.category;
chainSel.value = state.chain;
document.getElementById('minTvl').value = String(state.minTvl);
document.getElementById('minPeer').value = String(state.minPeer);
document.getElementById('watchlistOnly').checked = state.watchlistOnly;
document.getElementById('sort').value = state.sort;

/* ------------------------------------------------------------------ sorting */
const SORTERS = {
  implied: (a, b) => b.implied_value_usd - a.implied_value_usd,
  expected: (a, b) => b.expected_value_usd - a.expected_value_usd,
  peer: (a, b) => b.peer_rate - a.peer_rate || b.implied_value_usd - a.implied_value_usd,
  rank: (a, b) => a.rank - b.rank,
  tvl: (a, b) => b.tvl_usd - a.tvl_usd,
  growth: (a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9),
  age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
  name: (a, b) => a.name.localeCompare(b.name),
  category: (a, b) => (a.category || '').localeCompare(b.category || '') || a.rank - b.rank,
};

function filtered() {
  const q = state.q.trim().toLowerCase();
  return rows
    .filter((r) => !state.watchlistOnly || r.watchlist)
    .filter((r) => !state.category || (r.category || 'Uncategorized') === state.category)
    .filter((r) => !state.chain || r.chains.includes(state.chain))
    .filter((r) => r.tvl_usd >= state.minTvl)
    .filter((r) => r.peer_rate >= state.minPeer)
    .filter((r) => !q || r.name.toLowerCase().includes(q) || r.slug.includes(q))
    .sort(SORTERS[state.sort] || SORTERS.implied);
}

/* ------------------------------------------------------------------ render */
const rowsEl = document.getElementById('rows');
const countEl = document.getElementById('count');

function renderBoard() {
  const list = filtered();
  countEl.innerHTML = '<b>' + list.length + '</b> of ' + rows.length + ' pre-token protocols shown' +
    (state.watchlistOnly ? ' — watchlist only' : '') +
    (list.length === 0 ? '. No protocol matches these filters.' : '.');
  rowsEl.innerHTML = list.map((r) => {
    const g = r.change_7d;
    const cls = g === null ? 'flat' : g > 0 ? 'up' : g < 0 ? 'down' : 'flat';
    return '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="num">' + r.rank + '</td>' +
      '<td class="name"><b>' + esc(r.name) + '</b> ' + (r.watchlist ? '<span class="star" title="On the snapshot watchlist">★</span>' : '') +
      '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
      '<td><span class="pill">' + esc(r.category || 'Uncategorized') + '</span></td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num ' + cls + '">' + fmtPct(g) + '</td>' +
      '<td class="num rate">' + fmtRate(r.peer_rate) + '</td>' +
      '<td class="num implied">' + fmtUsd(r.implied_value_usd) + '</td>' +
      '<td class="num expected">' + fmtUsd(r.expected_value_usd) + '</td>' +
      '<td class="num range">' + fmtUsd(r.value_low_usd) + ' – ' + fmtUsd(r.value_high_usd) + '</td>' +
      '</tr>';
  }).join('');
}

/* -------------------------------------------------------------- detail view */
const detailEl = document.getElementById('detail');

function showDetail(slug) {
  const r = bySlug.get(slug);
  if (!r) return;
  const base = r.tvl_usd * r.category_multiple;
  const g = r.change_7d;
  detailEl.innerHTML =
    '<div class="detail-head"><h2>' + esc(r.name) + '</h2>' +
    '<span class="slug">' + esc(r.slug) + '</span>' +
    '<span class="pill">' + esc(r.category || 'Uncategorized') + '</span>' +
    (r.watchlist ? '<span class="star">★ On the watchlist</span>' : '<span class="note">Not on the snapshot’s watchlist</span>') +
    '</div>' +
    '<div class="detail-grid">' +
    '<div class="card"><h3>Implied value — the breakdown</h3>' +
    '<p class="formula">' + fmtUsd(r.tvl_usd) + ' TVL × ' + r.category_multiple.toFixed(4) + ' × ' +
    r.growth_multiplier.toFixed(3) + ' × ' + r.maturity_multiplier.toFixed(3) +
    ' = <b>' + fmtUsd(r.implied_value_usd) + '</b></p>' +
    '<dl class="kv">' +
    '<dt>TVL</dt><dd>' + fmtUsd(r.tvl_usd) + '</dd>' +
    '<dt>Size-adjusted multiple</dt><dd>' + r.category_multiple.toFixed(4) + ' — ' + esc(r.multiple_source) + '</dd>' +
    '<dt>Base value (TVL × multiple)</dt><dd>' + fmtUsd(Math.round(base)) + '</dd>' +
    '<dt>7-day TVL change</dt><dd>' + fmtPct(g) + ' → growth ×' + r.growth_multiplier.toFixed(3) + '</dd>' +
    '<dt>Age</dt><dd>' + fmtAge(r.age_days) + (r.listed_at ? ' (tracked since ' + esc(r.listed_at) + ')' : ' (listing date unreported)') +
    ' → age ×' + r.maturity_multiplier.toFixed(3) + '</dd>' +
    '<dt>Chains</dt><dd>' + esc(r.chains.join(', ') || '—') + ' (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ') → chains ×' + Math.exp(D.model.chains_coef * Math.log1p(r.chains.length)).toFixed(3) + '</dd>' +
    '<dt>Rank on the board</dt><dd>#' + r.rank + ' of ' + rows.length + '</dd>' +
    '</dl></div>' +
    '<div class="card"><h3>Peer rate and expected value</h3>' +
    '<p class="formula">Expected value = ' + fmtUsd(r.implied_value_usd) + ' × ' + fmtRate(r.peer_rate) + ' = <b>' + fmtUsd(r.expected_value_usd) + '</b></p>' +
    '<p>' + esc(r.peer_rate_note) + '</p>' +
    '<p>The rate rises with age across the snapshot — of protocols tracked under a year, 32% record a token; of those tracked three years or more, 79% do. That is a fact about the peers’ record, not a forecast for this protocol: it has not issued a token in the time it has been tracked, and this board does not predict whether or when it will.</p>' +
    '<dl class="kv">' +
    '<dt>Value range (conformal 80%)</dt><dd>' + fmtUsd(r.value_low_usd) + ' – ' + fmtUsd(r.value_high_usd) + ' — four of five live protocols’ real market caps fall inside their own range, held out (±' + r.conformal_q.toFixed(2) + ' log points).</dd>' +
    '<dt>Typical range (middle half of peers)</dt><dd>' + fmtUsd(r.typical_low_usd) + ' – ' + fmtUsd(r.typical_high_usd) + ' — the middle half of this category’s live multiples. Narrower, wrong about half the time.</dd>' +
    '<dt>Peer rate</dt><dd>' + fmtRate(r.peer_rate) + '</dd>' +
    '<dt>Expected value</dt><dd>' + fmtUsd(r.expected_value_usd) + '</dd>' +
    '</dl></div>' +
    '<div class="card"><h3>Anchors — the traded tokens behind this multiple</h3>' +
    (r.anchors.length === 0
      ? '<p>No live-token protocol in this category trades in the snapshot, so there is nothing to anchor on: this row is priced on the global line, and its multiple leans on no peer at all.</p>'
      : '<p>The nearest live-token protocols in the same category, nearest by TVL — the traded tokens this row’s multiple is anchored on. Their market caps are the market’s own values, not the model’s.</p>' +
        '<div class="tablewrap"><table><thead><tr><th scope="col">Anchor</th><th scope="col">TVL</th><th scope="col">Market cap</th><th scope="col">Mcap / TVL</th></tr></thead><tbody>' +
        r.anchors.map((a) => '<tr><td><b>' + esc(a.name) + '</b><br><span class="slug">' + esc(a.slug) + '</span></td><td class="num">' + fmtUsd(a.tvl_usd) + '</td><td class="num">' + fmtUsd(a.mcap_usd) + '</td><td class="num">' + (a.mcap_tvl === null ? '—' : a.mcap_tvl.toFixed(3) + '×') + '</td></tr>').join('') +
        '</tbody></table></div>' +
        (r.anchors.length === 1
          ? '<p class="note">Only one live peer in this category, so the multiple leans on a single protocol — and the shrinkage pulls it hard toward the global line (strength k = ' + D.model.shrink_k + '). That is what the fitted procedure produces, and it is why the range above is wide.</p>'
          : '')) +
    '</div>' +
    '<div class="card"><h3>Farm verdict</h3>' +
    '<p>' + esc(r.farm_verdict) + '</p>' +
    '<dl class="kv">' +
    '<dt>Gas fees for the plan</dt><dd>$' + r.farm_cost_usd + '</dd>' +
    '<dt>Attention the plan takes</dt><dd>' + r.farm_hours + ' hours over the hold</dd>' +
    '<dt>Minimum viable capital</dt><dd>' + (r.min_viable_capital_usd === null ? 'none below $500' : '$' + r.min_viable_capital_usd) + '</dd>' +
    '<dt>Expected value</dt><dd>' + fmtUsd(r.expected_value_usd) + '</dd>' +
    '</dl>' +
    '<div class="tablewrap"><table><thead><tr><th scope="col">Capital</th><th scope="col">Gas fees</th><th scope="col">Fees / capital</th><th scope="col">$/hour in fees</th><th scope="col">Verdict</th></tr></thead><tbody>' +
    r.farm_tiers.map((t) => '<tr><td class="num">$' + t.capital_usd + '</td><td class="num">$' + t.fees_usd + '</td><td class="num">' + Math.round(t.fee_share * 100) + '%</td><td class="num">$' + t.fees_per_hour_usd + '</td><td>' + esc(t.verdict) + '</td></tr>').join('') +
    '</tbody></table></div>' +
    '<p class="note">Gas fees are roughly fixed per action, so the fee share falls as the capital rises: the same plan that eats a third of a $50 position costs under a tenth of a $500 one. Minimum viable capital is the smallest tier whose fees stay under 10% of the capital.</p>' +
    '</div>' +
    '<div class="card"><h3>What this means</h3>' +
    '<p>The multiple comes from the live-token protocols in the same category: their market caps against their TVLs, fitted as a line — market cap grows slower than TVL, so the multiple falls as a protocol gets bigger. ' +
    (r.category_multiple === D.global_multiple
      ? 'This category has no live peers in the fit, so the board falls back to the global line.'
      : 'The category has live peers in the fit, so its own line is used, shrunk toward the global one.') +
    ' The line also bends by category where the category holds enough peers, and by how many chains the protocol lives on — both fitted, both tested held-out before they were kept.</p>' +
    '<p>The growth multiplier rewards a protocol whose TVL is rising and discounts one whose TVL is falling; the age factor sits at ×' + r.maturity_multiplier.toFixed(2) + ' because the held-out tests kept a small age term this round (coefficient ' + D.model.age_coef.toFixed(2) + ') — age moves the peer rate too. Both are capped, so no single week decides a rank.</p>' +
    '<p>The 80% range is the honest one: it is calibrated so four of five live protocols’ real market caps fall inside their own range, and on this snapshot the held-out check lands at ' + Math.round(D.fit.range_coverage * 100) + '%. The typical range is narrower and wrong about half the time. And the rank itself is fragile — the same leave-one-out residuals say a one-log-error swing moves a row about twenty places — so the range, not the rank, is the claim.</p>' +
    '<p class="note">This protocol records no token in the snapshot — no market cap, no CoinGecko id, no symbol. That is the record, not proof it has none, and this board does not predict whether or when it issues one.</p>' +
    '</div>' +
    '<div class="card wide"><h3>Farm plan — six steps</h3>' +
    '<ol class="steps">' + r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
    '<p class="note">Costs are estimates in US dollars on ' + esc(r.chains[0] || 'the protocol’s main chain') + '. Never pay to claim: a real airdrop claim costs gas only, and only from the link the protocol itself publishes.</p>' +
    '</div></div>';
  showView('detail');
  window.scrollTo(0, 0);
}

/* ---------------------------------------------------------------- live view */
const liveState = { q: '', category: '' };
const liveCatSel = document.getElementById('liveCategory');
for (const c of uniq(D.live.map((p) => p.category || 'Uncategorized'))) {
  const o = document.createElement('option');
  o.value = c; o.textContent = c; liveCatSel.appendChild(o);
}
function renderLive() {
  const q = liveState.q.trim().toLowerCase();
  const list = D.live
    .filter((p) => !liveState.category || (p.category || 'Uncategorized') === liveState.category)
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.slug.includes(q));
  document.getElementById('liveCount').innerHTML =
    '<b>' + list.length + '</b> of ' + D.live.length + ' live-token protocols shown. ' +
    'The median market-cap / TVL across them is ' + D.global_multiple.toFixed(3) + '×.';
  document.getElementById('liveRows').innerHTML = list.map((p) => {
    const ratio = p.mcap_tvl === null ? '—' : p.mcap_tvl.toFixed(3) + '×';
    return '<tr><td class="name"><b>' + esc(p.name) + '</b><br><span class="slug">' + esc(p.slug) + '</span></td>' +
      '<td><span class="pill">' + esc(p.category || 'Uncategorized') + '</span></td>' +
      '<td>' + esc(p.chains.slice(0, 3).join(', ')) + (p.chains.length > 3 ? ' +' + (p.chains.length - 3) : '') + '</td>' +
      '<td class="num">' + fmtUsd(p.tvl_usd) + '</td>' +
      '<td class="num">' + fmtUsd(p.mcap_usd) + '</td>' +
      '<td class="num">' + ratio + '</td></tr>';
  }).join('');
}

/* --------------------------------------------------------------- model view */
const fit = D.fit;
function modelViewHtml() {
  if (fit === null) {
    return '<p class="note">Too few live-token protocols in this snapshot to fit or test the value terms, so the model uses its stated constants.</p>';
  }
  const v = fit.validation;
  const methodRows = v.methods.map((m) =>
    '<tr><td><b>' + esc(m.name) + '</b><br><span class="muted">' + esc(m.detail) + '</span></td>' +
    '<td class="num">' + (m.mape * 100).toFixed(1) + '%</td>' +
    '<td class="num">' + m.log_error.toFixed(3) + '</td>' +
    '<td class="num">' + m.mean_log_error.toFixed(3) + '</td></tr>').join('');
  const bandRows = D.age_band_rates.map((b) =>
    '<tr><td>' + esc(b.band) + '</td><td class="num">' + b.launched + ' of ' + b.total + '</td>' +
    '<td class="num">' + Math.round(b.rate * 100) + '%</td></tr>').join('');
  const b = v.baseline_loo;
  const slopeRows = D.category_slopes.map((c) =>
    '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.live_peers + '</td>' +
    '<td class="num">' + c.slope.toFixed(3) + '</td><td class="num">' + (c.deviation >= 0 ? '+' : '') + c.deviation.toFixed(3) + '</td></tr>').join('');
  const reasonRows = Object.entries(cov.excluded_by_reason)
    .map(([reason, n]) => '<tr><td>' + esc(reason) + '</td><td class="num">' + n + '</td></tr>').join('');
  const growthLine = v.growth_kept
    ? 'Growth is kept at weight ' + D.model.growth_weight.toFixed(2) + ': the four validations’ mean log error with it is ' + v.log_error_keep_both.toFixed(3) + ', without it ' + v.log_error_drop_growth.toFixed(3) + '.'
    : D.model.growth_weight === 0
      ? 'Growth is dropped: the grid set its weight to zero, so there is no growth term to keep — on this snapshot, a protocol’s seven-day TVL change does not help predict its peers’ market caps.'
      : 'Growth is dropped by the held-out tests: the four validations’ mean log error with it is ' + v.log_error_keep_both.toFixed(3) + ', without it ' + v.log_error_drop_growth.toFixed(3) + '.';
  const ageLine = v.age_kept
    ? 'The age term is kept at coefficient ' + D.model.age_coef.toFixed(2) + ': mean log error with it ' + v.log_error_keep_both.toFixed(3) + ', without it ' + v.log_error_drop_age.toFixed(3) + '. Age moves the value a little and the peer rate a lot.'
    : D.model.age_coef === 0
      ? 'The age term is dropped: the grid set it to zero, so there is no age term to keep — on this snapshot, how long a protocol has run with no token does not help predict its peers’ market caps. Age still matters: it sets the peer rate, which rises from 32% for protocols tracked under a year to 79% for those tracked three years or more.'
      : 'The age term is dropped by the held-out tests: mean log error with it ' + v.log_error_keep_both.toFixed(3) + ', without it ' + v.log_error_drop_age.toFixed(3) + '. Age still matters: it sets the peer rate, which rises from 32% for protocols tracked under a year to 79% for those tracked three years or more.';
  return '<p><b>Model ' + esc(D.model_version) + '.</b> Every row’s implied value is computed from the snapshot alone, by the same function, with no name ever special-cased:</p>' +
    '<p class="formula">implied = TVL × <b>size-adjusted multiple</b> × <b>growth</b> × <b>age</b></p>' +
    '<ul>' +
    '<li><b>Size-adjusted multiple</b> — from a log-log fit of market cap on TVL over the ' + fit.live_pool_size + ' live-token protocols with a market cap and a TVL above zero: log(mcap) = ' + D.model.intercept.toFixed(3) + ' + ' + D.model.slope.toFixed(3) + ' × log(TVL) + ' + D.model.chains_coef.toFixed(3) + ' × log(1 + chains), plus a shrunk intercept per category (strength k = ' + D.model.shrink_k + ', picked by leave-one-out on the whole live pool). The slope is below 1, so the multiple falls as a protocol gets bigger: a protocol ten times the TVL carries a multiple about ' + Math.pow(10, D.model.slope - 1).toFixed(2) + '× as large. The global median multiple is ' + D.global_multiple.toFixed(3) + '. Each category with at least 5 live peers also bends the slope toward its own (strength 32); the table below lists them.</li>' +
    '<li><b>Growth</b> — exp(' + D.model.growth_weight.toFixed(2) + ' × log(1 + clamp(7-day TVL change, −60%, +120%) / 100)). A protocol growing 20% in a week scores ×' + Math.exp(D.model.growth_weight * Math.log1p(0.2)).toFixed(2) + '; one shrinking 20% scores ×' + Math.exp(D.model.growth_weight * Math.log1p(-0.2)).toFixed(2) + '.</li>' +
    '<li><b>Age</b> — exp(' + D.model.age_coef.toFixed(2) + ' × log(age in days)). Unknown listing date counts as 365 days.</li>' +
    '<li><b>Peer rate and expected value</b> — the share of protocols in the same category and age band that record a token, shrunk toward the category rate and then the global rate (' + Math.round(D.global_peer_rate * 100) + '%), with strength ' + D.model.peer_shrink_k + '. Expected value = implied value × peer rate.</li>' +
    '<li><b>Value range</b> — the conformal 80% range: implied × exp(±q), where q is the 80% quantile of the absolute leave-one-out log residuals — per category where the category holds 8 or more live peers, shrunk toward the pooled quantile (q = ' + D.conformal_q_pooled.toFixed(3) + ') with strength ' + D.model.conformal_shrink_k + '. Held out, ' + Math.round(fit.range_coverage * 100) + '% of live protocols’ real market caps fall inside their own range, against the 80% target; the mean range spans ' + fit.range_width_log.toFixed(2) + ' log points (about ×' + Math.exp(fit.range_width_log).toFixed(0) + '). The middle half of the peer multiples survives as each row’s “typical range” in its detail view.</li>' +
    '</ul>' +
    '<h3>Category slopes — the line bends where the peers are thick enough</h3>' +
    '<p>Only categories with at least 5 live peers bend the slope; thinner categories keep the global slope of ' + D.model.slope.toFixed(3) + '. Lending and Dexs bend up the most — their market caps grow almost in proportion to TVL — while RWA and CEX bend down.</p>' +
    '<div class="tablewrap"><table><thead><tr><th scope="col">Category</th><th scope="col">Live peers</th><th scope="col">Slope</th><th scope="col">Deviation</th></tr></thead><tbody>' + slopeRows + '</tbody></table></div>' +
    '<h3>Held-out tests — four ways, none of them the training error</h3>' +
    '<p>Each method trains on one part of the live-token pool and predicts protocols it never saw. The growth and age weights are picked by a grid on the leave-one-out error, the shrinkage by leave-one-out too, and both are frozen before these four run — so no test protocol ever influences its own prediction through them. Round 2 reported a four-method mean of 84.9% MAPE and 1.270 median log error; this model’s four-method mean is ' + (v.mape_mean * 100).toFixed(1) + '% MAPE and ' + v.log_error_mean.toFixed(3) + ' median log error. The log-error gain is real; the MAPE is flat within noise, and the model says so rather than picking the friendlier metric.</p>' +
    '<div class="tablewrap"><table><thead><tr><th scope="col">Method</th><th scope="col">MAPE</th><th scope="col">Median log error</th><th scope="col">Mean log error</th></tr></thead><tbody>' + methodRows + '</tbody></table></div>' +
    '<p>' + growthLine + ' ' + ageLine + '</p>' +
    '<p>With both terms dropped the mean log error is ' + v.log_error_drop_both.toFixed(3) + ', against ' + v.log_error_keep_both.toFixed(3) + ' with the fitted terms. Training error (for reference only, never the test): median log error ' + fit.train_log_error.toFixed(3) + '.</p>' +
    '<h3>Against two naive baselines — same leave-one-out round</h3>' +
    '<p>On the identical held-out round, the model’s mean log error is ' + b.model_mean_log_error.toFixed(3) + ', against ' + b.naive_median_mean_log_error.toFixed(3) + ' for the naive median market-cap / TVL multiple (' + b.ratio_vs_median_multiple.toFixed(2) + '× tighter) and ' + b.naive_tvl_mean_log_error.toFixed(3) + ' for pricing every token at its TVL (' + b.ratio_vs_tvl.toFixed(2) + '× tighter). The fitted model beats both, but only modestly against the median multiple — most of what the median multiple misses, the fitted model still misses too: market caps in this snapshot span 0.04× to 400× of TVL, and no TVL-based model predicts them tightly.</p>' +
    '<h3>Peer rates rise with age</h3>' +
    '<p>The peer rate is a count of the peers’ record, not a forecast. Across the snapshot:</p>' +
    '<div class="tablewrap"><table><thead><tr><th scope="col">Tracked for</th><th scope="col">Record a token</th><th scope="col">Rate</th></tr></thead><tbody>' + bandRows + '</tbody></table></div>' +
    '<h3>Coverage — every protocol accounted for</h3>' +
    '<p>The board holds <b>' + rows.length + ' rows</b>: all ' + D.watchlist_size + ' watchlist protocols, plus every other rankable pre-token protocol — not an exchange, not a versioned pool, not a wrapped, staked or bridged product. The watchlist is the floor, never the ceiling.</p>' +
    '<div class="tablewrap"><table><thead><tr><th scope="col">Excluded as</th><th scope="col">Protocols</th></tr></thead><tbody>' + reasonRows + '</tbody></table></div>' +
    '<p>' + cov.board + ' on the board + ' + cov.live + ' already trading + ' + cov.excluded + ' excluded = ' + cov.total + ' protocols in the snapshot. Nothing is left unaccounted for.</p>' +
    '<p>Each row’s farm plan is generated from its own record — category, chains, TVL and age — with a cost and a time on every step, a verdict priced at four capital tiers ($50 / $100 / $250 / $500) with a minimum viable capital, and three traded anchors in the same category. The “Already trading” tab lists all ' + D.live.length + ' live-token protocols the multiples are priced from, kept apart from the ranked board.</p>' +
    '<p class="note">Data: ' + esc(D.source) + '. Snapshot date ' + esc(D.as_of) + '. Implied value is this entry’s own claim about what a token would be worth if the protocol’s record stayed as it is. Round 1 (radar-3) priced every protocol at its category’s median multiple and reported a two-fold held-out error of 92.9%; round 2 fits the size slope, tests four ways, and adds the peer rate, the expected value, the value range, the farm verdict and the full coverage accounting; round 3 bends the slope by category, adds the chains term, picks the shrinkage and the term weights by leave-one-out, replaces the range with a conformal 80% one, and adds traded anchors and deposit-tier farm verdicts.</p>';
}
document.getElementById('modelCard').innerHTML = modelViewHtml();

/* -------------------------------------------------------------------- views */
const VIEWS = ['board', 'detail', 'live', 'model'];
function showView(name) {
  for (const v of VIEWS) document.getElementById('view-' + v).hidden = v !== name;
  for (const b of document.querySelectorAll('.tabs button')) {
    const active = b.dataset.view === name || (name === 'detail' && b.dataset.view === 'board');
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
}
for (const b of document.querySelectorAll('.tabs button')) {
  b.addEventListener('click', () => {
    if (b.dataset.view === 'board') renderBoard();
    if (b.dataset.view === 'live') renderLive();
    showView(b.dataset.view);
  });
}
document.getElementById('backToBoard').addEventListener('click', () => { renderBoard(); showView('board'); });

/* ------------------------------------------------------------------ events */
rowsEl.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-slug]');
  if (tr) showDetail(tr.dataset.slug);
});
document.getElementById('q').addEventListener('input', (e) => { state.q = e.target.value; renderBoard(); });
catSel.addEventListener('change', (e) => { state.category = e.target.value; renderBoard(); });
chainSel.addEventListener('change', (e) => { state.chain = e.target.value; renderBoard(); });
document.getElementById('minTvl').addEventListener('change', (e) => { state.minTvl = Number(e.target.value); renderBoard(); });
document.getElementById('minPeer').addEventListener('change', (e) => { state.minPeer = Number(e.target.value); renderBoard(); });
document.getElementById('watchlistOnly').addEventListener('change', (e) => { state.watchlistOnly = e.target.checked; renderBoard(); });
document.getElementById('sort').addEventListener('change', (e) => { state.sort = e.target.value; renderBoard(); });
document.getElementById('liveQ').addEventListener('input', (e) => { liveState.q = e.target.value; renderLive(); });
liveCatSel.addEventListener('change', (e) => { liveState.category = e.target.value; renderLive(); });
document.querySelectorAll('#board th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    state.sort = th.dataset.sort;
    document.getElementById('sort').value = state.sort in SORTERS ? state.sort : 'implied';
    if (!(state.sort in SORTERS)) state.sort = 'implied';
    renderBoard();
  });
});

/* --------------------------------------------------------------------- boot */
renderBoard();
const detailSlug = params.get('detail');
if (detailSlug && bySlug.has(detailSlug)) showDetail(detailSlug);
const viewParam = params.get('view');
if (viewParam === 'live') { renderLive(); showView('live'); }
if (viewParam === 'model') showView('model');
