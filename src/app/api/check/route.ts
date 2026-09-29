import { NextResponse } from "next/server";
import { checkTrade } from "@/lib/check";
import { ruleParse, validate, type Draft } from "@/lib/parse";
import { universe } from "@/lib/universe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { text } to parse plain words, or { trade } with an edited draft.
 * Returns the parse (so the user sees what was understood) and, when complete, the measured check.
 */
export async function POST(req: Request) {
  let body: { text?: string; draft?: Draft };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON: { text } or { draft }." }, { status: 400 });
  }
  const u = await universe();
  const known = (t: string) => u.set.has(t);
  const draft: Draft = body.draft ?? (body.text ? ruleParse(String(body.text).slice(0, 500), known) : {});
  const parsed = validate(draft);
  if (parsed.trade && !known(parsed.trade.ticker)) {
    return NextResponse.json({ parsed, error: `${parsed.trade.ticker} is not a US stock listed on Bitget as an rToken.` });
  }
  if (!parsed.trade) return NextResponse.json({ parsed });
  const result = await checkTrade(parsed.trade);
  if ("error" in result) return NextResponse.json({ parsed, error: result.error });
  return NextResponse.json({ parsed, result });
}
