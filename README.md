# Shunt

**See what could break your trade before you place it.**

Say your trade in plain words: the stock, the size, how long you hold, the most you can lose. Shunt finds what is
scheduled inside your hold (the stock's own earnings, a bigger company's earnings it tends to move with, Fed
decisions, weekends), measures how big each has been for that exact stock, and shows the day your trade stops fitting
your own loss limit, with live Bitget costs at your size. It measures. It does not predict, and you decide.

Live: https://shunt-eight.vercel.app. No sign up. Built for Bitget AI Base Camp S2, Track 3 (AI Trading Desk).

## Start here

| Want to | Go to |
| --- | --- |
| Try it | https://shunt-eight.vercel.app (four ready examples, or type your own) |
| See the evidence | /proof: calibration on history, a live journal, Agent Hub orders, a 24 sentence answer key |
| See what failed first | /research |
| Read the plan | docs/PRD.md, docs/BUILD_LOG.md |

## How it works

1. A rule parser reads ordinary sentences instantly. Claude (claude-opus-5-5, structured output) reads the rest and
   follow ups. It only turns words into a trade; code validates it.
2. Every number comes from code: volatility scaled ranges built from each stock's own history, Bitget order books walked
   at your size, fees, funding, liquidation distance for perps.
3. One sentence says whether the trade fits, and the chart shows where it stops fitting.

## Evidence

- Ranges built only from earlier data caught 80.5 percent of ordinary days, 80.0 percent of overnight gaps and 80.7 percent of
  earnings days. Weekends fall short (70.6 percent) and the page says so.
- 57 round trips (118 orders) on Bitget Demo through Agent Hub: median 15.7 bps predicted, 16.8 bps charged.
  Demo fills are simulated, so this tests fee and book arithmetic.
- Answer key: first run 14 of 24 right with rules alone and 22 of 24 with Claude; misses and fixes are published.

## Run it

```
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY (optional: without it the rule parser still works)
npm run dev
npm test
```

Data scripts are in `scripts/` (dataset build, daily journal, proof orders, answer key). Needs Node 20 or newer.

## Limits

Shunt measures move size, not direction. US CPI days are not included. Weekend ranges are too narrow. Costs are a live
snapshot. See /research for the full list.

MIT licensed.
