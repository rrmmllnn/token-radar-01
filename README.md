# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rrmmllnn/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rrmmllnn/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every protocol that records no token by what its token would be worth, and shows how to farm each one. Round 2's value model (radar-4-size-adjusted) prices each protocol from the snapshot alone: a log-log fit of market cap on TVL over the 128 live-token protocols with a market cap and a TVL above zero — the fitted slope is 0.52, so market cap grows slower than TVL and big protocols trade at lower multiples — plus a shrunk intercept per category. The board covers all 40 watchlist protocols plus every other rankable pre-token protocol in the snapshot — 198 rows — each with a six-step farm plan carrying a cost and a time, a peer token rate, an expected value, a value range, and a costed farm verdict. The dashboard is a static page with no network: a sortable, filterable board, a detail view for every protocol with its value breakdown, all 416 live-token protocols kept apart as the comparables the multiples are priced from, and an integrity strip accounting for all 758 protocols in the snapshot.

Every value term is fitted on the snapshot's own live-token protocols and tested four ways it never saw: two-fold by slug, walk-forward older-to-newer (and the reverse), five-fold on a seeded shuffle, and leave-one-out. The shrinkage strength is picked by nested five-fold inside each training set. On this snapshot the four methods' median absolute percentage errors are 85.5%, 82.9%, 85.6% and 85.8% (mean 84.9%), against round 1's two-fold 92.9%; the median log error falls from 1.75 to 1.27. Growth is kept at weight 1.00 — the held-out mean log error with it is 1.270, without it 1.321. The age term is dropped — the grid set it to zero, because how long a protocol has run with no token does not predict its peers' market caps; age moves the peer rate instead, which rises from 32% for protocols tracked under a year to 79% for those tracked three years or more. The middle-half peer range covers 53.9% of live protocols' real market caps when held out.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=5hwq4sqk&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
