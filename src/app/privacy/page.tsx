import type { Metadata } from "next";
import s from "../doc.module.css";

export const metadata: Metadata = { title: "Shunt · Privacy and terms", description: "What Shunt sends where, what it keeps, and what it is not." };

export default function Privacy() {
  return (
    <main className={s.main}>
      <section className={s.hero}>
        <p className="pill">Privacy and terms</p>
        <h1 className={s.title}>What leaves your <span className={s.hl}>browser</span>, and what does not.</h1>
        <p className={s.lede}>Shunt has no accounts, no database and no analytics. Here is everything that is sent anywhere.</p>
      </section>

      <section className={s.section}>
        <h2>What Shunt receives</h2>
        <p>
          When you check a trade, your browser sends Shunt the sentence you typed and the trade fields on screen: stock, side, size, hold, loss limit and
          leverage. Shunt reads them, answers, and does not store them. It sets no cookies and has no sign in.
        </p>
      </section>

      <section className={s.section}>
        <h2>When Anthropic sees it</h2>
        <p>
          Ordinary sentences are read by Shunt&apos;s own rules, on Shunt&apos;s server. Only when the rules cannot read a sentence, or when you ask a follow up
          such as &ldquo;what if I hold till Friday&rdquo;, the sentence and your current trade fields are sent to Anthropic&apos;s Claude API to turn the words into a
          trade. Claude never produces a number you see; every figure is computed by code.
        </p>
        <p>
          Tick <b>Rules only</b> under the input to stop this: nothing is sent to Anthropic, and Shunt tells you when a sentence needs the model. How Anthropic
          handles API data is set out in its own privacy and data retention policies, which apply to that step.
        </p>
      </section>

      <section className={s.section}>
        <h2>Other services Shunt calls</h2>
        <p>
          Bitget (public order books, fees and funding), Nasdaq (the earnings calendar) and, when it runs, the Federal Reserve calendar. These calls carry the stock
          symbol, not your size, limit or sentence. The site is hosted on Vercel, which keeps ordinary request logs such as IP address and page, under its own policy.
        </p>
      </section>

      <section className={s.section}>
        <h2>Terms</h2>
        <p>
          Shunt is an experimental research tool built for a hackathon. It measures how large past events were for a stock and what a trade would cost on Bitget
          today. It does not predict prices, does not give investment advice, does not place orders and never holds an exchange key. Figures can be wrong or out
          of date, and the proof page lists where they have been. You decide, and you are responsible for any trade you place.
        </p>
        <p className={s.muted}>The code is MIT licensed. Report a security problem through the repository&apos;s private advisory form.</p>
      </section>
    </main>
  );
}
