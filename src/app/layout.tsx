import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Shunt",
  description: "Tell it your trade. Shunt finds what is scheduled that could break it, measured for that stock, against your own loss limit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${mono.variable}`}>
      <body>
        <header className="site-head">
          <Link href="/" className="wordmark" aria-label="Shunt home">
            <svg viewBox="0 0 40 24" aria-hidden="true"><path d="M2 18 H16 C22 18 24 6 30 6 H38" /><path d="M16 18 H38" /></svg>
            shunt
          </Link>
          <nav>
            <Link href="/">Desk</Link>
            <Link href="/proof">Proof</Link>
            <Link href="/research">Research</Link>
          </nav>
        </header>
        {children}
        <footer className="site-foot">
          <p>Shunt measures. It does not predict prices or tell you to buy or sell. You decide.</p>
          <p>Built for Bitget AI Base Camp S2, AI Trading Desk.</p>
        </footer>
      </body>
    </html>
  );
}
