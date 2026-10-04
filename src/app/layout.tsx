import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import FocusLink from "./FocusLink";
import Reveal from "./Reveal";
import "./globals.css";

const mono = JetBrains_Mono({ variable: "--font-jbmono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Shunt",
  description: "Shunt finds what is scheduled while you hold a trade, measures each event for that stock, and shows where the trade stops fitting your loss limit.",
};

const Mark = () => (
  <svg viewBox="0 0 40 24" aria-hidden="true"><path d="M2 18 H16 C22 18 24 6 30 6 H38" /><path d="M16 18 H38" /></svg>
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" />
      </head>
      <body>
        <header className="site-head">
          <Link href="/" className="wordmark" aria-label="Shunt home"><Mark />shunt</Link>
          <nav aria-label="Main">
            <Link href="/#desk">Desk</Link>
            <Link href="/#how">How it works</Link>
            <Link href="/proof">Proof</Link>
            <Link href="/research">Research</Link>
          </nav>
          <FocusLink className="head-cta">Check a trade</FocusLink>
        </header>
        {children}
        <div className="site-foot-wrap">
          <footer className="site-foot">
            <div className="foot-brand">
              <Link href="/" className="wordmark"><Mark />shunt</Link>
              <p>Shunt measures. It does not predict prices or tell you to buy or sell. You decide.</p>
            </div>
            <div className="foot-col">
              <h4>Product</h4>
              <ul>
                <li><Link href="/#desk">Check a trade</Link></li>
                <li><Link href="/#how">How it works</Link></li>
                <li><Link href="/#measures">What it measures</Link></li>
              </ul>
            </div>
            <div className="foot-col">
              <h4>Evidence</h4>
              <ul>
                <li><Link href="/proof">Proof</Link></li>
                <li><Link href="/research">Research</Link></li>
                <li><Link href="/research#limits">Scope and limits</Link></li>
              </ul>
            </div>
            <div className="foot-col">
              <h4>Data</h4>
              <ul>
                <li>Bitget order books and fees</li>
                <li>Nasdaq earnings calendar</li>
                <li>SEC EDGAR filings</li>
                <li>Federal Reserve calendar</li>
              </ul>
            </div>
            <div className="foot-base">
              <p>Built for Bitget AI Base Camp S2, AI Trading Desk.</p>
              <p>Orders shown on the Proof page were placed on Bitget Demo through Agent Hub.</p>
            </div>
          </footer>
        </div>
        <Reveal />
      </body>
    </html>
  );
}
