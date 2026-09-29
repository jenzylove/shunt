# Spike preregistration (written 2026-09-28, before any result was computed)

## Spike A, Switchpoint: can we measure enough "flip facts"?

A flip fact is something a trader can observe before their decision resolves, whose outcome
historically changes what happens next to the position.

Candidate facts (decided now, none added after results):
- F1 Overnight gap size: does the size of the overnight gap change the chance the gap holds by the close? (open/gap class)
- F2 Sector confirmation at the open: does the stock's gap hold more often when its sector gapped the same way? (open/gap class)
- F3 Own earnings inside the horizon: is a stock's move on its own earnings day much larger than a normal day, stably per stock? (non gap)
- F4 Fed decision day: are moves on FOMC statement days larger than normal days, stably per stock? (non gap)
- F5 rToken vs perp gap: when rToken and perp prices diverge overnight, which one does the US open side with? (non gap)
- F6 Bellwether earnings: when a bellwether (NVDA, AAPL, MSFT, AMZN, GOOGL, META, TSLA, AVGO, AMD, MU, JPM, XOM) reports, is a given stock's sensitivity stable across time? (non gap)
- F7 First sector reporter: when the first company in a sector reports, do same sector stocks react abnormally the same day? (non gap)

A fact PASSES if: n >= 30 events, the effect is significant at p < 0.01 in the earlier half of the data,
and in the later (held out) half it has the same sign with p < 0.05.
For per stock stability facts (F3, F4, F6) the test is the rank correlation of the per stock measure between
the two halves (p < 0.01 early is replaced by: Spearman rho > 0.3 with p < 0.01 across stocks).

Spike A PASSES if at least 5 facts pass AND at least 3 of the passing facts are non gap facts (F3 to F7).

## Spike B, strict Blast Radius: does filings + past reactions beat simple baselines?

Events, chosen by rule: every earnings reaction day of the 12 bellwethers above, from SEC 8-K Item 2.02
acceptance times (after 16:00 ET -> next trading day, before 09:30 ET -> same day). No event is picked by outcome.

Target on each event day, for every other universe stock with full data: |z|, the absolute residual return after
removing market (SPY) and sector (same SIC 2 digit peers) with betas from the prior 250 trading days, divided by the
residual standard deviation. Stocks with their own earnings that day are excluded.

Rankings, all point in time (only information before the event):
- Baseline S: same SIC 4 digit as the bellwether = 2, same SIC 2 = 1, else 0
- Baseline C: correlation of daily returns with the bellwether over the prior 250 days
- Blast: rank average of (filing link: company filed a 10-K before the event mentioning the bellwether's name) and
  (past reaction: mean |z| on the bellwether's earlier events, needs >= 4 earlier events)

Metric: per event precision@20 (share of the top 20 ranked stocks with |z| > 2) and Spearman rho with |z|.
Held out set: the latest 40% of events by date. Development set: the earlier 60%.

Spike B PASSES if on held out events Blast's mean precision@20 beats BOTH baselines and the paired
difference against the stronger baseline has p < 0.05 (Wilcoxon signed rank).
Note: the filing link here is a raw name mention; the product would type each mention with the AI. If raw
mentions add nothing, that is reported, not hidden.

## Spike C, confirmation of the Spike B lead (written 2026-09-28, after Spike B, before running C)

Lead from Spike B (exploratory): past reaction (P) beat correlation (C) on held out bellwether earnings days.
Confirmation uses NEW bellwethers never used in Spike B: NFLX, ORCL, COST, WMT, LLY, UNH, CRM, ADBE, INTC,
QCOM, BA, CAT, GS, HD, DIS, NKE (any without enough SEC earnings history are dropped and reported).
Same event rule, target, residual method, universe and metric as Spike B. Every event from 2017 on where
P is available (>= 4 earlier events of that bellwether) counts; there is no tuning step.

Spike C PASSES if mean precision@20 of P > C and the paired Wilcoxon p < 0.05, AND P's mean
precision@20 is at least 1.5x the base rate.
