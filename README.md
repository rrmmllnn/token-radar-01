# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rrmmllnn/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rrmmllnn/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every protocol that records no token by what its token would be worth, and shows how to farm each one. Round 3's value model (radar-5-conformal) prices each protocol from the snapshot alone: a log-log fit of market cap on TVL over the 128 live-token protocols with a market cap and a TVL above zero — the fitted slope is 0.51, so market cap grows slower than TVL and big protocols trade at lower multiples — plus a shrunk intercept per category, a slope that bends by category where the category holds enough peers, and a fitted chains term (protocols live on more chains carry larger market caps at the same TVL). The board covers all 40 watchlist protocols plus every other rankable pre-token protocol in the snapshot — 198 rows — each with a six-step farm plan carrying a cost and a time, a peer token rate, an expected value, a conformal 80% value range, three traded anchors in the same category, and a farm verdict priced at four capital tiers with a minimum viable capital. The dashboard is a static page with no network: a sortable, filterable board, a detail view for every protocol with its value breakdown, all 416 live-token protocols kept apart as the comparables the multiples are priced from, and an integrity strip accounting for all 758 protocols in the snapshot.

Every value term is fitted on the snapshot's own live-token protocols and tested four ways it never saw: two-fold by slug, walk-forward older-to-newer (and the reverse), five-fold on a seeded shuffle, and leave-one-out. The shrinkage strength and the growth/age weights are picked by leave-one-out on the whole live pool and frozen before the four validations run. On this snapshot the four methods' median absolute percentage errors are 85.3%, 84.9%, 82.6% and 87.5% (mean 85.1%), against round 2's 84.9% and round 1's two-fold 92.9%; the median log error falls from 1.270 (round 2) to 1.227. Growth is kept at weight 1.00 and the age term at 0.10 — the held-out mean log error with both is 1.227, without growth 1.256, without age 1.248, without either 1.261. The conformal 80% range covers 82.8% of live protocols' real market caps when held out, against the 80% target (round 2's middle-half range covered 53.9%). Against two naive baselines on the same leave-one-out round, the model is 1.10× tighter than the median market-cap / TVL multiple and 1.30× tighter than pricing at TVL.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=5hwq4sqk&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
