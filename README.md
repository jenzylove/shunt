<p align="center">
  <img src="docs/media/brand/mark.svg" alt="Shunt" width="300">
</p>

<p align="center">
  <b>See what could break your trade before you place it.</b><br>
  Say your trade in plain words. Shunt finds every earnings report, Fed decision and weekend inside your hold, measures how
  big each one has been for that exact stock, and tells you whether the trade still fits the loss you can take, with live Bitget costs.
</p>

<p align="center">
  <a href="https://shunt-eight.vercel.app"><b>Live app</b></a> ·
  <a href="https://youtu.be/3WRGlZvOSGw"><b>Demo video</b></a> ·
  <a href="https://shunt-eight.vercel.app/proof"><b>Proof</b></a> ·
  <a href="https://shunt-eight.vercel.app/research"><b>Research</b></a> ·
  <a href="https://github.com/jenzylove/shunt/actions/workflows/ci.yml"><img src="https://github.com/jenzylove/shunt/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/built%20for-Bitget%20AI%20Base%20Camp%20S2-1f35d9" alt="Built for Bitget AI Base Camp S2">
  <img src="https://img.shields.io/badge/license-MIT-0a0a0b" alt="MIT license">
</p>

<p align="center">
  <img src="docs/media/hero.png" alt="Shunt landing page" width="100%">
</p>

Built for the **Bitget AI Base Camp S2, Track 3 (AI Trading Desk)**: a personalised research workbench that stress tests one
trader's own decision. No sign up.

## Start here

| Want to | Go to |
| --- | --- |
| Watch it in under two minutes | [Demo video on YouTube](https://youtu.be/3WRGlZvOSGw) |
| Try it in ten seconds | [shunt-eight.vercel.app](https://shunt-eight.vercel.app): four live example trades, or type your own |
| See whether the numbers hold up | [/proof](https://shunt-eight.vercel.app/proof): calibration on unseen history, a live journal, 118 Bitget Demo orders through Agent Hub, a 24 sentence answer key |
| See what failed before this | [/research](https://shunt-eight.vercel.app/research): two ideas that failed their tests, and the limits |
| Read the plan and the story | [docs/PRD.md](docs/PRD.md), [docs/BUILD_LOG.md](docs/BUILD_LOG.md) |
| Check the data | [docs/DATA_MANIFEST.json](docs/DATA_MANIFEST.json), [scripts/](scripts) |
| Submission copy | [docs/SUBMISSION_TEXT.md](docs/SUBMISSION_TEXT.md), [docs/SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md) |

## The problem

A trader types "buy $20k of rNVDA, hold five days, I can lose $600". They checked the price. They did not check the calendar.
Inside those five days there may be the stock's own earnings, a bigger company's report it tends to move with, a Fed
decision, or a weekend with Wall Street shut. A stock's own earnings day moves about 4.7 times an ordinary day (1,497 stocks,
2016 to 2026), so a position sized for normal days is not sized for that one.

Shunt answers one question: **does my trade, at my size, survive what is scheduled while I hold it, within my own limit?**
It measures. It does not predict direction, and you decide.

## One check

<p align="center">
  <img src="docs/media/desk.png" alt="A Shunt check: the question, the verdict, the loss over the hold against the limit" width="100%">
</p>

$20,000 of NVDA for five trading days with a $600 limit. On an ordinary day alone NVDA can move far enough to pass the limit,
so Shunt says it doesn't fit, gives the largest size whose loss on every measured risk in the hold fits, and draws where the
loss crosses the line. The full check lists every scheduled event with its own measured move, the live Bitget costs, and an
Agent Hub order ticket sized to fit. (Numbers change with live volatility and order books, so this README does not quote them.)

## Ask it about the trade

Once a trade is checked, keep talking to it. Every answer is built by code from the same numbers as the check.

| You type | Shunt answers with |
| --- | --- |
| "what about the upside?" | the same measured range both ways, at the same odds, with costs counted against you both ways |
| "what's the worst that could happen?" | the check rerun at 19 in 20 |
| "why doesn't it fit?" / "what size would fit?" | the event that breaks the limit and by how much; the largest size that fits every measured risk |
| "when does it report next?" | the next date on the Nasdaq calendar, inside or outside your hold, and the stock's typical earnings move |
| "compare nvda and amd" | both checked side by side with the same size, hold and limit |
| "...because I think earnings will beat" | your reason held against the record: whether the event is even inside your hold, and how often the stock went your way |

Under every check: what this exact trade would have made or lost on the stock's last twelve earnings (or Fed, or bellwether)
days, and a button that checks the same trade smaller, shorter, without leverage and at 19 in 20, each as a full check.
If a sentence can't be read, Shunt says so instead of repeating the last answer; two different loss limits, a currency other
than dollars, or an unlisted symbol get a question or a plain refusal, never a guess.

## How it works

```mermaid
flowchart LR
    A[Your sentence] --> B[Rule parser]
    B -->|cannot read it, or a follow up| C[Claude reads words only<br/>structured output]
    B --> D[Validator<br/>strict schema]
    C --> D
    D -->|leverage and a dollar amount| Q[Ask: position or your money?]
    D --> E[Calendar<br/>Nasdaq earnings, FOMC, weekends<br/>New York dates]
    E --> F[Measured ranges<br/>each stock's own history<br/>scaled to today's volatility]
    D --> G[Bitget live<br/>order book walked at your size<br/>fees, funding schedule, margin tiers]
    F --> H[Verdict<br/>fits, fits if, does not fit, cannot fill]
    G --> H
    H --> I[Chart, full check,<br/>Agent Hub order ticket]

    style H fill:#1f35d9,color:#fff
```

- **Words.** A rule parser reads ordinary sentences on the server. Only when it cannot, or for a follow up such as "what if I
  hold till Friday", Claude (`claude-opus-5-5`) turns the words into a trade through a closed schema. Claude never produces a
  number the user sees, and a "Rules only" switch keeps the sentence off the model entirely.
- **Ranges.** Every range is the size a stock stayed within 4 times in 5 (or 19 in 20) on past events of that kind, scaled to
  its volatility now. Events on the same day are added, a cautious upper bound, and flagged.
- **Costs.** Your size is walked through the live Bitget book both ways. Your loss limit covers the market move plus fees and
  slippage in and out, plus perp funding over the settlements Bitget will actually charge (a credit is never counted). The
  largest size that fits is found by re-pricing the book at each candidate size.
- **Honesty rules.** A thin book gives "can't fill", never a cost of zero. A missing source is named, never filled in. The
  liquidation distance is a labelled estimate and is hidden when Bitget's margin tiers cannot be read.

## Evidence

<p align="center">
  <img src="docs/media/proof.png" alt="A year of NVDA, TSLA and AAPL: the range drawn the evening before and the move that followed" width="100%">
</p>

| Check | Result |
| --- | --- |
| Ranges built only from earlier data, on unseen days | ordinary days 80.5%, overnight gaps 80.0%, own earnings 80.7%, Fed statement days 83.4%; weekends fall short at 70.6% and the page says so |
| Bitget Demo through Agent Hub (`bgc --paper-trading`) | 113 trades tried, 57 round trips (118 orders) on 8 stocks; median cost predicted 15.7 bps, charged 16.8 bps; every failure listed by reason |
| Range usefulness, not just coverage | for each kind of event: typical width today, distance from 80% and a 95% interval, so a range that is merely wide shows up |
| Sealed language test, 42 cases | written and committed before the question layer was built; same cases on the live site before and after: 30 of 42, then 41 of 42 (questions 0 of 10, then 10 of 10); the miss is published |
| Earlier answer key, 24 sentences | first run 14 of 24 with rules alone, 22 of 24 with Claude; fixed after the misses were seen, so not counted again |
| Forward journal | 30 ranges locked before each session, graded after it, never edited; running totals on /proof |
| Release checks | CI on every push: tests, typecheck, lint, build, production dependency audit, and a data fingerprint check; `/api/version` reports the deployed commit |

Demo fills are simulated matching, so the orders test the fee and order book arithmetic, not live liquidity.

## Run it

```bash
npm install
cp .env.example .env.local   # optional ANTHROPIC_API_KEY; without it the rule parser still works
npm run dev                  # http://localhost:3000
npm test
```

Node 20 or newer. Data scripts live in `scripts/`: `build_dataset.py` (profiles for 2,218 stocks), `journal.mts` (the daily
forward journal, run by a GitHub Action), `proof-batch.mts` (the Demo orders), `answer-key.mts`, `manifest.py`.

## Limits

Shunt measures how big moves have been, not which way the next one goes. US CPI days are not included. Weekend ranges are
too narrow. Costs are a live snapshot. The full list is on [/research](https://shunt-eight.vercel.app/research#limits).
Security notes are in [SECURITY.md](SECURITY.md). MIT licensed.
