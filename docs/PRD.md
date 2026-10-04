# Shunt: product requirements

Bitget AI Base Camp Hackathon S2, Track 3 (AI Trading Desk). Working deadline: 7 October 2026.

## One line

Tell Shunt your trade in plain words. It finds everything scheduled inside your holding period that could
break it, measures how big each of those events has been for that exact stock, and shows the point where your
trade stops fitting your own loss limit. You decide.

## The problem

A trader on Bitget types "buy $20k of rNVDA, hold five days". Three things are usually missing from that decision:

1. **What is scheduled inside the five days.** The stock's own earnings, a bigger company's earnings that it tends
   to move with, a Fed decision, a weekend while Wall Street is shut. Most traders check the price, not the calendar.
2. **How big those events are for this stock.** Measured on 1,497 US stocks in our spike, a stock's own earnings
   day moves on median 4.7 times a normal day, and the size is stable per stock (rank correlation 0.68 between
   2016 to 2021 and 2021 to 2026). A position sized for normal days is not sized for earnings day.
   Source: docs/spikes/results.md, fact F3.
3. **What that means in money against their own limit.** "NVDA moves a lot on earnings" is not a decision.
   "At $20k, a normal NVDA earnings day costs about $X, more than your $600 limit" is.

Every AI desk in this track answers "tell me about this stock". None answers "does my trade survive what is
scheduled, at my size, within my limit".

## The user

A self directed trader holding or opening US stock positions on Bitget (rTokens or stock perps), often outside
the US, often trading at night or at weekends, often used to crypto sized leverage. They know their thesis and
their pain threshold. They do not have a Bloomberg terminal.

## Front door (first ten seconds)

One line: "What's your trade?" with ready made example trades a visitor can press before writing their own
(for example: holding rNVDA through its earnings, a 5x TSLA perp over a weekend, a small cap rToken with a thin
book, a trade that fits cleanly). Each example is a real, live check, not a recording. The visitor types their own:

> buy $20k rNVDA, holding 5 days, max loss $600

Within seconds they see **the rail**: their holding period as a horizontal track, each scheduled event as a marker
on it, each marker's measured size as a band, and their loss limit as a line. Where a band crosses the line, the
track switches colour. Above it, one sentence: the switchpoint.

## What Shunt does (full scope, nothing deferred)

### 1. Understand the trade (language model, then validated by code)
- Parse plain words into a fixed schema: instrument (rToken or perp), side, size, entry time, horizon,
  loss limit, leverage if perp, optional thesis text.
- Show the parse as editable chips. Nothing is computed until the user can see what was understood.
- Follow ups in plain words recompute everything: "what if I hold till Tuesday", "make the limit $1,000",
  "use the perp at 5x".

### 2. Find what is scheduled inside the horizon (code, real sources)
| Event | Source |
|---|---|
| The stock's own earnings, with before open or after close | Nasdaq earnings calendar (public API) |
| Bellwether earnings the stock historically moves with | Nasdaq calendar for dates; past reactions measured by Shunt (see 3) |
| Fed decisions | Federal Reserve FOMC calendar |
| US CPI releases | BLS release schedule |
| Weekends and overnight closures | exchange calendar; whether this rToken actually traded last weekend, read from Bitget candles |

### 3. Measure each event for this exact stock (code, point in time)
- Own earnings: every past earnings reaction day, from SEC 8-K Item 2.02 acceptance times (after 16:00 ET means next
  trading day). Move = close to close, market adjusted.
- Bellwether earnings: the stock's past residual reactions on that bellwether's earnings days. This is the method
  that beat plain correlation on 15 new bellwethers in our confirmation test (docs/spikes/results.md, spike C).
  Shown only when there are at least 8 past events and the median reaction is at least 1.5 times a normal day,
  and labelled as a modest, measured tendency.
- Fed and CPI days: the stock's moves on those days over the last three years, labelled "varies over time"
  (our spike found this sensitivity is not stable per stock over longer periods).
- Weekends and overnight: the stock's Friday close to Monday open and close to open gap distribution.
- For each event: median, 80th and 95th percentile move, the worst case, and the sample size. Below 8 past
  events the event is shown as **cannot measure**, never guessed.

### 4. The switchpoint (code only)
- Money at risk per event = size times the event's move band, plus the live cost to exit on Bitget.
  For perps: leverage, liquidation price and whether the 95th percentile move reaches it.
- The user picks a confidence level (default: the 80th percentile band).
- Output states:
  - **Fits**: no scheduled event's band breaches the limit inside the horizon.
  - **Fits if**: the largest size that fits, or the latest exit before the first breaching event.
  - **Does not fit**: even a normal day at this size breaches the limit.
  - **Cannot measure**: an event inside the horizon lacks enough history; shown with what is known.
- "Not in the boundary": news and sentiment (from Agent Hub skills) are shown for context and clearly marked
  as having no measured history in Shunt. They never move the switchpoint.

### 5. Bitget execution context
- Live cost to enter and exit at this size on the rToken and on the perp, walked through the real order book,
  with Bitget's live fee rates (rNVDA currently shows 0.1% maker and taker).
- Perp funding over the horizon from Bitget's funding history.
- Weekend tradability of this rToken.
- An order ticket prefilled at the switchpoint size, ready for the trader's own Bitget account (the exact
  Agent Hub command and the order details to copy). The public site holds no exchange key, so no visitor can
  place orders through it. Shunt never places an order by itself.
- Proof of the Agent Hub order path: a small number of Demo orders placed from our side through Agent Hub, tagged
  with a `shunt` client order id so they are separable from any other project on the same Demo account, and
  listed on the proof page with their order ids.

### 6. Review and calibration (research quality, measurable)
- **Backtest calibration:** for every past event, build the band using only earlier events, then check whether the
  real move landed inside it. Published per event type: "our 80% band contained N% of later moves".
- **Forward journal:** each checked trade is saved; after its horizon Shunt records what actually happened against
  the bands. Misses are published, not hidden.
- **Research page:** the preregistered spikes, including the ideas that failed (filing mentions, gap signals).

## Judging criteria and how each is met

| Criterion (handbook, verbatim) | How Shunt meets it |
|---|---|
| Feature depth (data sources / Skill integration count and effectiveness) | Bitget spot and perp order books, candles, funding and fees; Agent Hub signal skills; Agent Hub Demo orders; SEC EDGAR; Nasdaq earnings calendar; Fed and BLS calendars; daily price history. Each one changes a number the user sees. |
| Research quality | Measured per stock history, point in time, with sample sizes; calibration published; preregistered spikes with failures shown. |
| LUI fluency | Trade in plain words, editable parse, follow ups that recompute, answer in one plain sentence. |
| Personalized thesis | The user's own trade, horizon and loss limit drive every output; optional thesis text is kept with the journal entry. |

## Claims Shunt will make, and how each is proven

| Claim | Proof |
|---|---|
| Earnings days are several times a normal day, stably per stock | Spike F3 (1,497 stocks, rho 0.68) and live per stock numbers on screen |
| Some stocks move with a bellwether's earnings more than correlation predicts | Spike C, 495 events, 15 new bellwethers, p = 0.002; shown as modest |
| The bands are honest | Published backtest calibration per event type |
| Costs and tradability are live | Every Bitget number shows its timestamp and source |

## What Shunt does not do
- It does not predict direction or tell the user to buy or sell.
- It does not trade on its own. Demo orders need an explicit press.
- It does not price news or sentiment.
- It does not use rToken volume (unreliable before 9 July 2026) or claim a weekend edge.

## Cut or constrained, with why
- Weekend rToken timing analysis: weekend rToken trading is sparse (1 to 10 minutes per hour), so Shunt only states
  whether a rToken traded, not how it will behave.
- rToken versus perp "which to trust" before the open: passed our spike but is likely mechanical and has few large
  cases; shown as context only, not as a claim.

## Sponsor and submission checklist (becomes docs/SUBMISSION_CHECKLIST.md, ticked only from the live app)
- [ ] Accessible demo interface (public URL, no sign up)
- [ ] One complete research task from question to actionable insight, runnable by a judge
- [ ] Optional screen recording
- [ ] Project description in the form's six parts (confirm exact parts on the form): scenario, conclusions,
      target user value, validation approach, and the rest
- [ ] LLM role field filled accurately (parsing and explanation only; all numbers from code)
- [ ] Materials link (repo, demo, video)
- [ ] Track and sub theme selected (Track 3, Personalized Research Workbench; also Decision Stress Testing)
- [ ] X post introducing the product, with #BitgetHackathon and @Bitget_AI, quoting https://x.com/Bitget_AI/status/2100519318824055159
- [ ] Qwen used through Bitget's endpoint once credits arrive (K3 subsidy field)
- [ ] Agent Hub used: signal skills and Demo orders, visible in the product
- [ ] Separate project from RESIDUAL (Track 1): own repo, own code


## What changed after the spikes and the build (kept honest, 4 Oct 2026)

| PRD said | What shipped | Why |
|---|---|---|
| Agent Hub signal skills (news, sentiment, macro) shown as context | Not used | The public signal MCP server (datahub.noxiaohao.com/mcp) answered but returned empty data on every check from 29 Sep to 3 Oct. Shunt does not depend on it for any number. Listed on the Research page under Scope and limits. |
| Qwen through Bitget's endpoint | Claude Opus 5.5 for reading the sentence | The hackathon's Qwen credits never arrived. The model only turns words into the trade; every number is computed by code. |
| Optional Demo order sent on a button press from the site | An order ticket to copy, plus Demo orders placed by the builder through Agent Hub's CLI and listed on the Proof page | The public site must hold no exchange key. |
| Fed and CPI days | Fed days only | bls.gov blocks programs and a summarised date list contained wrong dates, so CPI is not used until dates come from a verified source. |
| An exit cost for every trade | An explicit "illiquid" verdict when the live book cannot fill the size | Found in the 4 Oct audit: an empty book was priced at $0. |
