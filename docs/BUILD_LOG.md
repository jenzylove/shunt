# Build log

## 29 September 2026

- **fe42e2b** PRD, plan and the spike record. Two finalist ideas failed preregistered spikes; what survived shaped Shunt:
  own earnings days move about 4.7x a normal day, stably per stock; a stock's past reactions to a bellwether's
  earnings beat plain correlation on 15 bellwethers it was never tuned on. See docs/spikes/.
- **a93f62d** Measurement engine: event bands scaled by the stock's current volatility, small sample safe
  percentiles, verdicts (fits, fits if, does not fit, cannot measure), NYSE trading calendar. Dataset builder turns
  SEC 8-K Item 2.02 history, the Fed calendar and ten years of prices into one measured profile per Bitget stock.
- Calibration, first pass on 53 stocks: the 80% band caught 79% of ordinary days, 79% of overnight gaps, 79% of
  earnings (after volatility scaling, up from 73%), but only 67% of weekends. A correction factor learned on older
  weekends caught 85% of newer weekends it never saw (uncorrected: 71%), so it is applied. The same trick made
  earnings worse on unseen data (67% vs 74%), so it is not applied there. Rule: a correction is used only where
  it helps on data it was not fitted on.
- Live layer: Bitget order books walked at the trade's size, live fee rates, funding history, perp maintenance
  margin tiers, and whether the rToken actually traded last weekend; Nasdaq earnings calendar; Fed statement dates.
  First end to end check (AAPL, $20k, 20 days, $600 limit) ran against live sources.
- Found while testing: a hold opened before 4pm New York is exposed to today's close. Fixed and tested.
- Agent Hub signal server (datahub.noxiaohao.com/mcp): reachable, lists 14 tools, but its data tools returned empty
  errors on 29 Sep. Shunt does not depend on it for any number; rechecked later.
- CPI dates: bls.gov blocks scripts and a summarised date list contained wrong dates, so CPI is not used until
  dates come from a verified source.
