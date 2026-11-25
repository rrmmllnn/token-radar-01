// Token Radar — the entrypoint (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input
// <file|dir>), scores every pre-token protocol with the size-adjusted
// comparables model in lib/model.ts, writes the ranked board to
// /output/board.json, and copies this repository's dashboard/ and screenshots/
// to /output. Last, it writes /output/dossier.json, the summary the judge
// reads, with the vendored make.fun library (vendor/makefun-board.ts, from
// the kit). It also prints the fitted model and its held-out validation, so a
// run's numbers can be checked without opening the dashboard.
//
// The dashboard is a static page, no framework and no network:
// dashboard/index.html, dashboard/app.css and dashboard/app.js read
// /output/data.js, which this program writes from the same board.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.board_size - radar.watchlist_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);

/** The fitted model and its held-out validation, for the run log. */
const fit = radar.fit;
if (fit !== null) {
  const m = radar.model;
  const v = fit.validation;
  const lines = [
    `token radar: model ${radar.model_version}: log(mcap) = ${m.intercept.toFixed(3)} + ${m.slope.toFixed(3)}*log(TVL), shrink k=${m.shrink_k}, growth weight ${m.growth_weight} (${v.growth_kept ? 'kept' : 'dropped'}), age coef ${m.age_coef} (${v.age_kept ? 'kept' : 'dropped'})`,
    `token radar: live pool ${fit.live_pool_size} protocols, train median log error ${fit.train_log_error.toFixed(3)}`,
  ];
  for (const method of v.methods) {
    lines.push(
      `token radar: held-out ${method.name}: MAPE ${(method.mape * 100).toFixed(1)}%, median log error ${method.log_error.toFixed(3)}, mean log error ${method.mean_log_error.toFixed(3)}`,
    );
  }
  lines.push(
    `token radar: held-out mean log error keep-both ${v.log_error_keep_both.toFixed(3)}, drop-growth ${v.log_error_drop_growth.toFixed(3)}, drop-age ${v.log_error_drop_age.toFixed(3)}, drop-both ${v.log_error_drop_both.toFixed(3)}`,
    `token radar: peer-range held-out coverage ${(fit.range_coverage * 100).toFixed(1)}% (middle-half range)`,
    `token radar: coverage ${radar.coverage.board} board + ${radar.coverage.live} live + ${radar.coverage.excluded} excluded = ${radar.coverage.total} protocols`,
    `token radar: top row ${board[0]!.slug} implied $${board[0]!.implied_value_usd.toLocaleString('en-US')}, expected $${board[0]!.expected_value_usd.toLocaleString('en-US')}`,
  );
  process.stdout.write(`${lines.join('\n')}\n`);
}
