import { checkTrade } from "@/lib/check";
import type { CheckResult } from "@/lib/check";
import type { Trade } from "@/lib/engine/types";
import Desk from "./Desk";
import Sections from "./Sections";

// Rebuilt at most once a minute, so the answer on screen is a real, recent read of the live market.
export const revalidate = 60;

const FIRST: Trade = { ticker: "NVDA", venue: "rtoken", side: "long", sizeUsd: 20_000, horizonDays: 5, lossLimitUsd: 600, confidence: 0.8 };

export default async function Home() {
  let initial: CheckResult | null = null;
  try {
    const r = await checkTrade(FIRST);
    if (!("error" in r)) initial = r;
  } catch {
    // the desk fetches it in the browser if the server could not
  }
  return (
    <>
      <Desk initial={initial} />
      <Sections />
    </>
  );
}
