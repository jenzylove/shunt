# Spike results (2026-09-28), judged against PREREGISTRATION.md

## Spike A, Switchpoint: FAIL (1 of 6 measured facts pass; 5 needed)

| Fact | Result | Detail |
|---|---|---|
| F1 gap size | FAIL | no effect before mid 2021 (p=0.79); strong after (big gaps fade, -0.35% vs -0.04%) |
| F2 sector confirmation at open | FAIL | strong before mid 2021 (+0.22% vs -0.58%), gone after (-0.25% vs -0.27%, p=0.20) |
| F3 own earnings day | PASS | 4.7x a normal day, stable per stock (rho 0.68 across 1,497 stocks) |
| F4 Fed day | FAIL | per stock sensitivity unstable (rho 0.12) |
| F6 bellwether earnings | FAIL | per pair sensitivity unstable (rho 0.21) |
| F7 first sector reporter | FAIL | p=0.012 early vs 0.01 bar; real but small (1.78% vs 1.58% late) |
| F5 rToken vs perp before open | PASS | when they differ by >0.2% at 09:15 ET, the cash open lands closer to the rToken 62% (early) and 70% (late) of 3,409+ days, 216 names. Likely mechanical: rTokens route to real premarket from 04:00 ET, so the perp is the stale one. Verdict unchanged: 2 of 7 pass |

## Spike B, strict Blast Radius: FAIL

392 bellwether earnings days (2017 to 2026, 11 bellwethers; Exxon has no Item 2.02 filings), held out = 157 latest (from 2023-06-02).
Target: stocks with a residual move beyond 2 standard deviations (base rate 4.2%).

Held out precision@20 (of the top 20 named stocks, share that really moved unusually):

| Ranking | p@20 | Stocks out of 20 |
|---|---|---|
| Random (base rate) | 0.042 | 0.8 |
| Same sector (S) | 0.043 | 0.9 |
| Raw filing mention (F) | 0.040 | 0.8 |
| Correlation (C) | 0.068 | 1.4 |
| BLAST = filing + past reaction | 0.057 | 1.1 |
| Past reaction alone (P), exploratory | 0.081 | 1.6 |

BLAST vs correlation: -0.012, Wilcoxon p=0.28 -> FAIL.
Raw filing mentions carry no signal (equal to random). Past reaction alone beat correlation
(+0.013, p=0.034) but this was not the preregistered ranking, so it is a lead, not a result.

Caveat: universe SEC histories are truncated for heavy filers (recent 1,000 filings only), which removes some
own earnings exclusions and early earnings days; bellwethers were extended with full history.

## Spike C, confirmation on new bellwethers: PASS

495 earnings days across 15 new bellwethers (CAT dropped, too little history). Base rate 0.9 of 20.
Correlation names 1.3 of 20 real movers, past reaction names 1.5 of 20 (1.7x base rate).
P minus C = +0.009 precision, Wilcoxon p = 0.002. P wins on 10 of 15 bellwethers.
Honest size: real and repeatable, but modest (about 0.2 more real movers per 20 than correlation).
