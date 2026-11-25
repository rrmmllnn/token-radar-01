/* Token Radar — the dashboard.
 *
 * The data comes from ../data.js, written by main.ts from the same board that
 * board.json holds: every row is a protocol that records no token, ranked by
 * its implied value. The value model (radar-3-fitted) is:
 *
 *   multiple   = median market-cap / TVL of the live-token protocols in the
 *                same category (at least 3 peers); else the global median.
 *                Clamped to [0.02, 1.5].
 *   implied    = TVL x multiple x growth x maturity
 *   growth     = 1 + clamp(change_7d, -60, 120) / 100 x growth weight
 *   maturity   = floor + min(age_days, 1095) / 1095 x range (unknown age: 365 days)
 *
 * The growth weight, maturity floor and maturity range are not hand-picked:
 * they are fitted on the snapshot's live-token protocols, and every term is
 * kept or dropped on two held-out halves the fit never saw (the model view
 * shows the fitted values and the held-out error). No name is special-cased:
 * the same function scores every row. The detail view shows each row's own
 * breakdown, so the number on the board can always be checked against the
 * figures behind it.
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
  '<div><dt>Snapshot</dt><dd>' + esc(D.as_of) + '</dd></div>';
document.getElementById('source').textContent =
  'Snapshot: ' + D.source + '. Floor for the watchlist: ' + fmtUsd(D.floor_usd) + ' TVL. Model ' + D.model_version + '.';

/* ------------------------------------------------------------ filter state */
const state = {
  q: params.get('q') || '',
  category: params.get('category') || '',
  chain: params.get('chain') || '',
  minTvl: Number(params.get('mintvl') || 0) || 0,
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
document.getElementById('watchlistOnly').checked = state.watchlistOnly;
document.getElementById('sort').value = state.sort;

/* ------------------------------------------------------------------ sorting */
const SORTERS = {
  implied: (a, b) => b.implied_value_usd - a.implied_value_usd,
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
      '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num ' + cls + '">' + fmtPct(g) + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td class="num implied">' + fmtUsd(r.implied_value_usd) + '</td>' +
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
    (r.watchlist ? '<span class="star">★ On the watchlist</span>' : '<span class="note">Below the watchlist floor — an early find</span>') +
    '</div>' +
    '<div class="detail-grid">' +
    '<div class="card"><h3>Implied value — the breakdown</h3>' +
    '<p class="formula">' + fmtUsd(r.tvl_usd) + ' TVL × ' + r.category_multiple.toFixed(3) + ' × ' +
    r.growth_multiplier.toFixed(3) + ' × ' + r.maturity_multiplier.toFixed(3) +
    ' = <b>' + fmtUsd(r.implied_value_usd) + '</b></p>' +
    '<dl class="kv">' +
    '<dt>TVL</dt><dd>' + fmtUsd(r.tvl_usd) + '</dd>' +
    '<dt>Category multiple</dt><dd>' + r.category_multiple.toFixed(3) + ' — ' + esc(r.multiple_source) + '</dd>' +
    '<dt>Base value (TVL × multiple)</dt><dd>' + fmtUsd(Math.round(base)) + '</dd>' +
    '<dt>7-day TVL change</dt><dd>' + fmtPct(g) + ' → growth ×' + r.growth_multiplier.toFixed(3) + '</dd>' +
    '<dt>Age</dt><dd>' + fmtAge(r.age_days) + (r.listed_at ? ' (tracked since ' + esc(r.listed_at) + ')' : ' (listing date unreported)') +
    ' → maturity ×' + r.maturity_multiplier.toFixed(3) + '</dd>' +
    '<dt>Chains</dt><dd>' + esc(r.chains.join(', ') || '—') + '</dd>' +
    '<dt>Rank on the board</dt><dd>#' + r.rank + ' of ' + rows.length + '</dd>' +
    '</dl></div>' +
    '<div class="card"><h3>What this means</h3>' +
    '<p>The multiple comes from the live-token protocols in the same category: their market cap divided by their TVL, median. ' +
    (r.category_multiple === D.global_multiple
      ? 'This category has fewer than 3 live peers in the snapshot, so the board falls back to the global median multiple of ' + D.global_multiple.toFixed(3) + ' across all live-token protocols.'
      : 'The category has enough live peers that its own median is used, not the global one.') +
    '</p><p>The growth multiplier rewards a protocol whose TVL is rising and discounts one whose TVL is falling; the maturity multiplier rewards a protocol that has run longer with no token. Both are capped, so no single week decides a rank.</p>' +
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
document.getElementById('liveRows').innerHTML = D.live.map((p) => {
  const ratio = p.mcap_tvl === null ? '—' : p.mcap_tvl.toFixed(3) + '×';
  return '<tr><td class="name"><b>' + esc(p.name) + '</b><br><span class="slug">' + esc(p.slug) + '</span></td>' +
    '<td><span class="pill">' + esc(p.category || 'Uncategorized') + '</span></td>' +
    '<td>' + esc(p.chains.slice(0, 3).join(', ')) + (p.chains.length > 3 ? ' +' + (p.chains.length - 3) : '') + '</td>' +
    '<td class="num">' + fmtUsd(p.tvl_usd) + '</td>' +
    '<td class="num">' + fmtUsd(p.mcap_usd) + '</td>' +
    '<td class="num">' + ratio + '</td></tr>';
}).join('');

/* --------------------------------------------------------------- model view */
const fit = D.fit;
const fitNote = fit === null
  ? '<p class="note">Too few live-token protocols in this snapshot to fit or test the value terms, so the model uses its stated constants.</p>'
  : '<p><b>Fitted, not hand-picked.</b> The growth weight (' + fit.constants.growth_weight.toFixed(2) +
    '), maturity floor (' + fit.constants.maturity_floor.toFixed(2) + ') and maturity range (' + fit.constants.maturity_range.toFixed(2) +
    ') were fitted on the ' + fit.live_pool_size + ' live-token protocols in this snapshot: the combination whose predicted market caps come closest to the real ones. ' +
    'Every term was then kept or dropped on two held-out halves the fit never saw — each half trained the model and the other half was predicted. ' +
    'Held-out error (median absolute percentage error): ' +
    fit.validation.folds.map((f, i) => 'fold ' + (i + 1) + ' ' + (f.mape * 100).toFixed(1) + '%').join(', ') +
    ', mean ' + (fit.validation.mape_mean * 100).toFixed(1) + '%. ' +
    'Two-fold average with growth dropped: ' + (fit.validation.mape_drop_growth * 100).toFixed(1) + '%; with maturity dropped: ' +
    (fit.validation.mape_drop_maturity * 100).toFixed(1) + '%; with both dropped: ' + (fit.validation.mape_drop_both * 100).toFixed(1) + '%. ' +
    (fit.validation.growth_kept ? 'Growth is kept. ' : 'Growth is dropped. ') +
    (fit.validation.maturity_kept ? 'Maturity is kept.' : 'Maturity is dropped.') + '</p>';
document.getElementById('modelCard').innerHTML =
  '<p><b>Model ' + esc(D.model_version) + '.</b> Every row’s implied value is computed from the snapshot alone, by the same function, with no name ever special-cased:</p>' +
  '<p class="formula">implied = TVL × <b>category multiple</b> × <b>growth</b> × <b>maturity</b></p>' +
  '<ul>' +
  '<li><b>Category multiple</b> — the median market-cap / TVL of the live-token protocols in the same DefiLlama category (at least 3 peers with a market cap and a TVL above zero). A category with fewer peers falls back to the global median, ' + D.global_multiple.toFixed(3) + ' on this snapshot. Clamped to [0.02, 1.5].</li>' +
  '<li><b>Growth</b> — 1 + clamp(7-day TVL change, −60%, +120%) / 100 × ' + D.model.growth_weight.toFixed(2) + '. A protocol growing 20% in a week scores ×' + (1 + 0.2 * D.model.growth_weight).toFixed(2) + '; one shrinking 20% scores ×' + (1 - 0.2 * D.model.growth_weight).toFixed(2) + '.</li>' +
  '<li><b>Maturity</b> — ' + D.model.maturity_floor.toFixed(2) + ' + min(age, 1095 days) / 1095 × ' + D.model.maturity_range.toFixed(2) + '. A protocol tracked for three years with no token scores ×' + (D.model.maturity_floor + D.model.maturity_range).toFixed(2) + '; a brand-new one scores ×' + D.model.maturity_floor.toFixed(2) + '. Unknown listing date counts as 365 days.</li>' +
  '</ul>' +
  fitNote +
  '<p>The board holds <b>' + rows.length + ' rows</b>: all ' + D.watchlist_size + ' watchlist protocols, plus every other rankable pre-token protocol — not an exchange, not a versioned pool, not a wrapped, staked or bridged product. The watchlist is the floor, never the ceiling.</p>' +
  '<p>Each row’s farm plan is generated from its own record — category, chains, TVL and age — with a cost and a time on every step. The “Already trading” tab lists the live-token protocols the multiples are priced from, kept apart from the ranked board.</p>' +
  '<p class="note">Data: ' + esc(D.source) + '. Snapshot date ' + esc(D.as_of) + '. Implied value is this entry’s own claim about what a token would be worth if the protocol’s record stayed as it is.</p>';

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
document.getElementById('watchlistOnly').addEventListener('change', (e) => { state.watchlistOnly = e.target.checked; renderBoard(); });
document.getElementById('sort').addEventListener('change', (e) => { state.sort = e.target.value; renderBoard(); });
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
