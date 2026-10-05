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
- Full dataset: 2,218 Bitget stocks. Calibration of the volatility scaled 80% band over real history: ordinary days
  80.5% (302,656 checks), overnight gaps 80.0% (308,297), own earnings 80.7% (50,306), Fed days 83.4% (37,694),
  weekends 70.6% overall and 77.5% in the recent half (44,360). The weekend correction factor overshot on unseen
  data (90%), so by the rule it is not applied; the weekend number is published as it is.
- Bellwether links, three passes. (1) Residual method picked noisy small caps and missed AMD when NVIDIA reports:
  it answers "who moves unusually", not "who loses money". (2) Actual moves vs ordinary days linked 2,018 stocks,
  mostly earnings season noise. (3) Now: report days must beat the same stock's days 3 to 7 sessions either side
  (same season) in a rank test, Bonferroni corrected across 26 bellwethers. 45 stocks qualify, the strongest ones
  make economic sense (chip equipment and memory names on Micron's reports, Humana on UnitedHealth's).
  Finding: sympathy moves exist on average, but for most single stocks a bellwether's report day is not reliably
  bigger than the rest of earnings season.
- Desk page, rail, API; "over the weekend" now holds through the next Monday open; perp liquidation check and
  the highest leverage that clears the biggest measured move.
- First deploy: https://shunt-eight.vercel.app. Nasdaq calendar, Bitget and the profiles all answer from Vercel.

## 3 to 4 October 2026

- Language layer: rules read ordinary sentences instantly; Claude Opus 5.5 (structured output, low effort) reads the rest
  and follow ups ("what if I hold till Wednesday?", "use the perp at 3x and the worst case"), through the same validator.
  Prompt injection attempt resolved to a missing ticker; nothing leaked.
- Agent Hub: `bgc --paper-trading` places Shunt-sized orders on Bitget Demo with a `shunt` client id; two round trips
  recorded with order ids on /proof. Account is in hedge mode, so `--posSide` is required (found by a rejected order).
  The Desk shows an order ticket to copy; the public site holds no exchange key.
- Forward journal: 30 stocks locked before each session, graded after it; GitHub Action runs after every US close.
- /proof and /research pages. Production deploy failed twice on build errors; fixed, and every push is now built
  locally before it ships. A `.vercelignore` rule `data/` also matched `public/data` on git builds; anchored to the root.
- 4 Oct release readiness audit (repo, history, clean clone, live site, hostile inputs). Fixed: empty or thin order
  book priced as $0 (now an explicit "illiquid" verdict, no rail, no ticket); public API had no limits (rate limit,
  body cap, timeouts, security headers); phone hero overflowed (no-break space); no visible keyboard focus; proof page
  said "ten years" for rows that use three; dataset builder crashed on a fresh clone. Proved each fix locally and live.

## 4 to 5 October 2026

- Redesign (merged to master 5 Oct): plain headline, black workbench panel below the hero, ultramarine accent, Satoshi and
  JetBrains Mono, scroll motion, accordion "How it works" that advances itself. Checked headless at 1518x730 at 125 percent,
  1280, 1366, 1920, 2560, tablet and phone.
- Desk fixes found by hand testing: a typed new stock no longer inherits the old trade's numbers (intent logic in
  /api/check); missing size, hold or limit now triggers a short question form instead of a dead end; the form reads
  "2.5k", "2 weeks" and "3%". The panel opens with the question in plain words, and the chart was rebuilt (responsive,
  limit line, switchpoint, hover).
- Agent Hub proof: 57 round trips (118 orders) on Bitget Demo across 8 stocks, predicted cost against realized fill
  versus the pre-order mid: median 15.7 bps predicted, 16.8 charged, 54 of 57 within 5 bps. Demo lists only 4 of the stock
  perps Shunt checks plus RESIDUAL's five, so 31 could not be ordered. Failures: AAPL quantity cap, TSLA no cost
  comparison, one lookup error. Account left flat.
- Answer key: 24 sentences, field by field. First run: rules alone 14 of 24, rules plus Claude 22 of 24. Misses (bare
  numbers, number words, "cap loss at", percent before "limit", "can take X loss", "until Friday") fixed in the parser;
  now 24 of 24 both ways, published as not unbiased. Two spots in the key were corrected for session counting.
- Proof page: year strips for NVDA, TSLA, AAPL (77, 76, 82 percent inside), captions for every percentage, order table.
- 5 Oct audit on the live site: security headers present, 413 on oversize body, 400 on bad JSON, prompt injection
  resolved to missing fields, no keys in the client bundle or git history, all 31 commits authored by jenzylove.

## 5 October 2026, audit fixes (second pass, from the owner's audit)

- Calendar: "over the weekend" resolved from New York dates (Friday before and after the close, Saturday, Sunday, Monday, holidays);
  a weekend that has already ended is no longer listed as an event; the resolved hold is printed under the question.
- Costs: the loss limit now counts the whole round trip: entry and exit slippage and fees, plus perp funding counted from the
  settlements actually crossed to the close of the last day (a funding credit is never counted). Max size is found by
  re-walking the order book at each candidate size.
- Liquidation: side specific estimate, labelled as an estimate; when Bitget's margin tiers cannot be read, no liquidation
  distance or safe leverage is shown.
- Shorts: an rToken is spot, so a short is checked as the perp (and the Short button switches to it); no order ticket is
  generated for an rToken short.
- Overlapping events on one day are added into one cautious range and flagged.
- Leverage: the size is stated as position value with the user's own money beside it; "with $2k margin" is read as margin.
- API: every failure has the success shape, the page shows it and stays usable (400, 413, 429, 5xx, timeout, offline);
  strict schema on drafts (finite, bounded, known fields only); trusted client address; shared limiter and daily model
  budget when a store is configured; rules only switch; privacy and terms page.
- Evidence: Proof shows all 113 attempts, failure reasons, and how often the charge exceeded the prediction; FOMC dates relabelled
  with the notation vote called out; data manifest with hashes (docs/DATA_MANIFEST.json); CI on every push.
- Accessibility and hygiene: toggle buttons instead of half built tabs, parallax and auto advance off under reduced motion,
  44 px touch targets, aria-busy, full CSP, no X-Powered-By, robots, sitemap, security.txt.
- 22 regression tests added from the audit (60 total).

## 5 October 2026, audit fixes (third pass)

- Funding settlements now come from Bitget's own schedule (`/mix/market/funding-time`: next settlement and period), not an
  assumed 00:00 UTC grid. Funding policy is one tested function: a long pays positive funding, a short pays negative, and a
  credit is never counted.
- "$10k at 5x" typed in words now asks once: position value or your own money, both read back in dollars. The example uses
  "$10k position" so it never needs to ask.
- Source times: the header shows when Bitget stamped the book; the full check lists the book time, the newest funding
  settlement, the next settlement, and when Nasdaq actually answered (the calendar is cached up to six hours).
- Chart: focusable; arrow keys, Home and End read any day, Escape clears.
- Accessibility: axe WCAG 2 A and AA with no violations in light or dark after making the command blocks focusable; two light
  mode colours (go, caution) darkened to pass 4.5:1, every colour pair sampled by hand.
- Tests: funding sign, Bitget schedule counting, Good Friday long weekend, the margin question, and one test that the headline
  loss, the chart's cost and the ticket's size all come from the same cost function (65 total). Answer key rerun: 24 of 24.
