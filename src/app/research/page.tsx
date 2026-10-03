import type { Metadata } from "next";
import s from "../doc.module.css";

export const metadata: Metadata = { title: "Shunt · Research", description: "What was tested before Shunt was built, including what failed." };

const SPIKES: { pass: boolean; title: string; body: string[] }[] = [
  {
    pass: false,
    title: "Can we name the one fact that would flip your trade?",
    body: [
      "Shunt started as a different idea: point to the upcoming fact (a sector move at the open, a Fed day, a bigger company's report) that would change a trade. We wrote the test down before running it: at least 5 of 7 such facts had to hold up on a later period they were not fitted to.",
      "Only 2 did. A stock's own earnings day is reliably big: 4.7 times an ordinary day, and stable per stock (rank correlation 0.68 between 2016 to 2021 and 2021 to 2026, 1,497 stocks). The sector signal at the open was strong before mid 2021 and gone after. Fed day sensitivity was not stable per stock.",
      "So Shunt measures how big scheduled events are for your stock. It does not claim to know which way they go.",
    ],
  },
  {
    pass: false,
    title: "Do a company's own filings tell you which stocks a story hits?",
    body: [
      "On 392 earnings days of 11 big companies, ranking other stocks by whether their SEC filings mention the company picked real movers no better than chance (0.8 in the top 20, chance 0.8). Plain correlation picked 1.4.",
      "Filing mentions were dropped as a signal.",
    ],
  },
  {
    pass: true,
    title: "Do past reactions to a company's reports predict who moves next time?",
    body: [
      "A lead from the test above, confirmed on 15 companies it had never seen (495 report days): ranking by past reactions picked 1.5 real movers in the top 20 against 1.3 for correlation and 0.9 by chance (p = 0.002).",
      "Real but modest. In Shunt, a bellwether's report is only flagged for your stock when that stock's report-day moves beat its own days in the same earnings season in a rank test, corrected for testing 26 companies. 45 of 2,218 stocks qualify, and the strongest make economic sense: chip equipment and memory makers on Micron's reports, Humana on UnitedHealth's.",
    ],
  },
  {
    pass: true,
    title: "Do the ranges hold up on days they never saw?",
    body: [
      "Built only from earlier events and scaled by each stock's volatility at the time, the 80% ranges caught 80.5% of ordinary days, 80.0% of overnight gaps and 80.7% of own earnings days, over hundreds of thousands of checks. Weekends caught 71%: published as it is, because the correction we tried overshot on newer data.",
      "Since 3 October 2026 the same ranges are also locked in before each session and graded after it, on the Proof page.",
    ],
  },
];

const LIMITS = [
  "Shunt measures the size of moves, not their direction, and never tells you to buy or sell.",
  "Ranges cover 4 in 5 (or 19 in 20) past cases. The rest is, by definition, outside.",
  "Weekend ranges are too narrow (71% caught against 80%).",
  "US CPI release days are not included: the official schedule could not be read reliably by a program.",
  "Bitget Agent Hub's public signal server answered but returned empty data on every check from 29 September to 3 October, so news and sentiment are not shown. Agent Hub's CLI is used for orders.",
  "Bitget rToken volume figures are unusable before 9 July 2026 and weekend rToken trading is thin, so Shunt does not use rToken volume.",
  "Costs are read from the live order book at your size; a fast market can differ from that snapshot.",
];

export default function Research() {
  return (
    <main className={s.main}>
      <section className={s.hero}>
        <p className="eyebrow">Research</p>
        <h1 className={s.title}>What we tested before building, including what failed.</h1>
        <p className={s.lede}>Each test was written down before it ran, with the bar it had to clear. Two ideas failed and changed what Shunt is.</p>
      </section>

      <section className={s.section}>
        {SPIKES.map((x) => (
          <div key={x.title} className={s.spike}>
            <span className={`${s.verdict} ${x.pass ? s.pass : s.fail}`}>{x.pass ? "Held" : "Failed"}</span>
            <div>
              <h3>{x.title}</h3>
              {x.body.map((b) => <p key={b}>{b}</p>)}
            </div>
          </div>
        ))}
      </section>

      <section className={s.section}>
        <h2>Scope and limits</h2>
        <ul>{LIMITS.map((l) => <li key={l} style={{ margin: "8px 0", maxWidth: "75ch" }}>{l}</li>)}</ul>
      </section>

      <section className={s.section}>
        <h2>How the numbers are made</h2>
        <p>Past earnings days come from the time each company filed its results with the SEC (8-K Item 2.02): after 4pm New York, the next session reacts. Fed decision days come from federalreserve.gov. Daily prices cover ten years for every US stock listed on Bitget as an rToken. Upcoming earnings come from the Nasdaq earnings calendar, live. Order books, fees, funding and margin tiers come from Bitget, live.</p>
        <p>A language model (Claude) only turns your words into the trade. Every number is computed by code: the dataset builder is <code>scripts/build_dataset.py</code>, the engine is <code>src/lib/engine</code>.</p>
      </section>
    </main>
  );
}
