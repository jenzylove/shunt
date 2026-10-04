// The body of the home page. Server component: every number here is read from the real data files or computed
// by the same engine the desk uses, so nothing on this page is typed in by hand.
import Link from "next/link";
import calData from "../../public/data/calibration.json";
import journalData from "../../public/data/journal.json";
import nvda from "../../public/data/stocks/NVDA.json";
import { dayBand, eventBand, horizonBand } from "@/lib/engine/bands";
import { assess } from "@/lib/engine/switchpoint";
import type { CheckResult } from "@/lib/check";
import type { Calibration, Profile, Trade } from "@/lib/engine/types";
import { explain, pct, usd } from "@/lib/explain";
import Icon, { type IconName } from "./Icon";
import s from "./sections.module.css";

const cal = calData as unknown as Calibration;
const profile = nvda as unknown as Profile;
const journal = journalData as unknown as { summary: { graded: number; inside: number; rate: number | null; pending: number } };

// the worked example: a 10k NVDA trade, imagining NVDA reports during the hold; sizes come from NVDA's own measured history
const trade: Trade = { ticker: "NVDA", venue: "rtoken", side: "long", sizeUsd: 10_000, horizonDays: 5, lossLimitUsd: 600, confidence: 0.8 };
const earnings = eventBand(profile, "earnings", 0.8, cal, { label: "NVDA earnings" });
const weekend = eventBand(profile, "weekend", 0.8, cal, { label: "Wall Street closed over the weekend" });
const fed = eventBand(profile, "fed", 0.8, cal, { label: "Fed decision" });
const assessment = assess(trade, dayBand(profile, 0.8, cal), horizonBand(profile, 5, 0.8), [earnings, weekend], 0);
const verdict = explain({ trade, assessment, profile } as unknown as CheckResult);

const rate = (k: string) => cal.types[k]?.volScaled?.rate ?? null;

export default function Sections() {
  return (
    <>
      <section id="how" className={`${s.sec} reveal`}>
        <p className="pill">How it works</p>
        <h2 className={s.h2}>A trade check in <span className={s.hl}>three steps</span></h2>
        <div className={s.steps}>
          <article className={s.step}>
            <span className={`${s.n} num`}>/01</span>
            <h3>Say your trade</h3>
            <p>Type it the way you would say it: the stock, how much, how long, and the most you can lose. Shunt shows what it understood, and you can fix any value before it measures anything.</p>
            <div className={s.mini} aria-label="Example of what Shunt understood">
              <p className={`${s.miniInput} num`}>buy $10k rNVDA, holding 5 days, max loss $600</p>
              <div className={s.miniChips}>
                <span><b>Stock</b>NVDA</span><span><b>Size</b>$10,000</span><span><b>Hold</b>5 days</span><span><b>Max loss</b>$600</span>
              </div>
            </div>
          </article>

          <article className={s.step}>
            <span className={`${s.n} num`}>/02</span>
            <h3>Shunt reads the calendar</h3>
            <p>It finds every earnings report, Fed decision and weekend inside your hold, then measures how big each one has been for that exact stock.</p>
            <div className={s.mini} aria-label="Measured events for NVDA">
              {[["earnings", "NVDA earnings", earnings], ["weekend", "Weekend closure", weekend], ["fed", "Fed decision", fed]].map(([ic, label, b]) => {
                const band = b as typeof earnings;
                return (
                  <div key={label as string} className={s.miniRow}>
                    <span className={s.miniIcon}><Icon name={ic as IconName} size={18} /></span>
                    <span>{label as string}</span>
                    <span className={`${s.miniVal} num`}>up to {pct(band.pct)}</span>
                    <span className={`${s.miniSub} num`}>{band.n} past</span>
                  </div>
                );
              })}
            </div>
          </article>

          <article className={s.step}>
            <span className={`${s.n} num`}>/03</span>
            <h3>See where it stops fitting</h3>
            <p>One sentence tells you if the trade fits your limit, and the rail shows which event breaks it. Live Bitget costs sit right next to it.</p>
            <div className={s.mini} aria-label="Example verdict">
              <span className={s.miniStatus} data-tone={verdict.tone}><i />{assessment.verdict.state === "fits" ? "Fits" : assessment.verdict.state === "does-not-fit" ? "Doesn't fit" : "Fits with a change"}</span>
              <p className={s.miniHead}>{verdict.headline}</p>
              <p className={s.miniFoot}>Worked example: {usd(trade.sizeUsd)} for {trade.horizonDays} days with a {usd(trade.lossLimitUsd)} limit, if NVDA reported during the hold. Sizes come from NVDA&apos;s own history, without live costs.</p>
            </div>
          </article>
        </div>
      </section>

      <section id="measures" className={`${s.sec} reveal`}>
        <p className="pill">What it measures</p>
        <h2 className={s.h2}>Four things, each <span className={s.hl}>measured</span>, none guessed</h2>
        <div className={s.items}>
          <article className={s.item}>
            <span className={s.tile}><Icon name="earnings" /></span>
            <div>
              <h3>Earnings days</h3>
              <p>A stock&apos;s own report day moves about 4.7 times an ordinary day, and the size holds steady stock by stock.</p>
              <p className={`${s.ev} num`}>1,497 stocks, 2016 to 2026</p>
            </div>
          </article>
          <article className={s.item}>
            <span className={s.tile}><Icon name="bellwether" /></span>
            <div>
              <h3>Other companies&apos; reports</h3>
              <p>Some stocks move with a bigger company&apos;s report. Shunt flags a link only when it passes a corrected test, and 45 of 2,218 stocks do.</p>
              <p className={`${s.ev} num`}>495 report days on 15 companies the test never saw</p>
            </div>
          </article>
          <article className={s.item}>
            <span className={s.tile}><Icon name="weekend" /></span>
            <div>
              <h3>Fed days and weekends</h3>
              <p>Fed decision days and Wall Street&apos;s weekend close, each measured for that stock. Weekends are the weakest part: the range catches {pct(rate("weekend"), 0)} of them.</p>
              <p className={`${s.ev} num`}>{pct(rate("weekend"), 0)} against a target of 80%</p>
            </div>
          </article>
          <article className={s.item}>
            <span className={s.tile}><Icon name="liquidity" /></span>
            <div>
              <h3>Your costs on Bitget</h3>
              <p>Your size is walked through the live order book, with fees, funding and the move that would liquidate a perp. If the book cannot fill your size, Shunt says so instead of guessing.</p>
              <p className={`${s.ev} num`}>Read live at every check</p>
            </div>
          </article>
        </div>
        <p className={s.note}>Shunt does not predict direction, read news or score sentiment.</p>
      </section>

      <section id="proof" className={`${s.sec} reveal`}>
        <p className="pill">Proof</p>
        <h2 className={s.h2}>Every range is <span className={s.hl}>checked</span> against what happened</h2>
        <dl className={s.stats}>
          <div><dt>Ordinary days</dt><dd className="num">{pct(rate("day"))}</dd></div>
          <div><dt>Overnight gaps</dt><dd className="num">{pct(rate("overnight"))}</dd></div>
          <div><dt>Own earnings days</dt><dd className="num">{pct(rate("earnings"))}</dd></div>
          <div><dt>Weekends</dt><dd className="num">{pct(rate("weekend"))}</dd></div>
        </dl>
        <p className={s.statNote}>
          The share of later moves that stayed inside the 4 in 5 range, checked on data the range had never seen. The target is 80%.
          {" "}Live, {journal.summary.graded} locked ranges have been graded and {journal.summary.pending} are waiting for their session.{" "}
          <Link href="/proof">See the proof</Link>
        </p>
      </section>

      <section className={`${s.sec} ${s.split} reveal`}>
        <div>
          <p className="pill">Who does what</p>
          <h2 className={s.h2}>Claude reads your words. <span className={s.hl}>Code</span> does the maths.</h2>
        </div>
        <div className={s.twoCol}>
          <div>
            <h3>Claude reads</h3>
            <ul>
              <li>Plain sentences, including &ldquo;till Wednesday&rdquo; or &ldquo;use the worst case&rdquo;</li>
              <li>Changes to your trade as you ask them</li>
              <li>Nothing else. It never produces a number you see.</li>
            </ul>
          </div>
          <div>
            <h3>Code computes</h3>
            <ul>
              <li>Every event move and range, from each stock&apos;s own history</li>
              <li>The order book cost at your size</li>
              <li>The verdict and the switchpoint</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={`${s.cta} reveal`}>
        <h2>Ready to check your next trade?</h2>
        <p>Type it in plain words. It takes a few seconds.</p>
        <div className={s.ctaRow}>
          <Link href="/#desk" className={s.ctaMain}>Check a trade</Link>
          <Link href="/proof" className={s.ctaAlt}>See the proof</Link>
        </div>
      </section>
    </>
  );
}
