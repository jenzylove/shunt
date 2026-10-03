import { NextResponse } from "next/server";
import { checkTrade } from "@/lib/check";
import { hasModel, modelParse } from "@/lib/llm";
import { ruleParse, validate, type Draft } from "@/lib/parse";
import { universe } from "@/lib/universe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defined = (d: Draft) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined && v !== null)) as Draft;

/**
 * POST { text }            a new trade in plain words
 * POST { text, draft }     a follow up that changes the current trade ("what if I hold till Friday")
 * POST { draft }           an edited trade from the chips
 * Returns what was understood (and by what), plus the measured check when the trade is complete.
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
  const text = body.text ? String(body.text).slice(0, 500) : "";
  let draft: Draft = body.draft ?? {};
  let readBy: "rules" | "model" | "edit" = "edit";
  let modelNote: string | undefined;

  if (text && body.draft) {
    // follow up: the model applies the change; without a model, the rules overlay what they can read
    const m = await modelParse(text, body.draft);
    if (m.draft) { draft = { ...body.draft, ...defined(m.draft) }; readBy = "model"; }
    else { draft = { ...body.draft, ...defined(ruleParse(text, known)) }; readBy = "rules"; modelNote = m.error; }
  } else if (text) {
    const rules = ruleParse(text, known);
    draft = rules;
    readBy = "rules";
    const r = validate(rules);
    if (r.missing.length || (r.trade && !known(r.trade.ticker))) {
      const m = await modelParse(text, null);
      if (m.draft) { draft = { ...defined(rules), ...defined(m.draft) }; readBy = "model"; }
      else modelNote = m.error;
    }
  }

  const parsed = validate(draft);
  const meta = { readBy, model: hasModel() ? "claude-opus-5-5" : null, modelNote };
  if (parsed.trade && !known(parsed.trade.ticker)) {
    return NextResponse.json({ parsed, meta, error: `${parsed.trade.ticker} is not a US stock listed on Bitget as an rToken.` });
  }
  if (!parsed.trade) return NextResponse.json({ parsed, meta });
  const result = await checkTrade(parsed.trade);
  if ("error" in result) return NextResponse.json({ parsed, meta, error: result.error });
  return NextResponse.json({ parsed, meta, result });
}
