# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rrmmllnn/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rrmmllnn/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every protocol that records no token by what its token would be worth, and shows how to farm each one. The value model (radar-3-fitted) prices each protocol from the snapshot alone: its TVL times the median market-cap / TVL of the live-token protocols in its own category (global median where a category has too few peers), adjusted for seven-day TVL growth and for how long it has run with no token. The board covers all 40 watchlist protocols plus every other rankable pre-token protocol in the snapshot — 198 rows — each with a six-step farm plan carrying a cost and a time. The dashboard is a static page with no network: a sortable, filterable board, a detail view for every protocol with its value breakdown, and the live-token protocols kept apart as the comparables the multiples are priced from.

Every value term is fitted on the snapshot's own live-token protocols and tested on held-out halves it never saw. The growth weight, maturity floor and maturity range are chosen by how well they predict market caps, and each term is kept only when keeping it beats dropping it on two held-out folds — on this snapshot the fitted model predicts held-out market caps with a median absolute percentage error of about 93%, and both terms are kept.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=5hwq4sqk&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
