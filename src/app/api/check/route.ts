import { NextResponse } from "next/server";
import { checkTrade } from "@/lib/check";
import { hasModel, modelParse } from "@/lib/llm";
import { ruleParse, validate, type Draft } from "@/lib/parse";
import { clientKey, limited } from "@/lib/ratelimit";
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
  const who = clientKey(req);
  if (limited("req:" + who, 40, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many checks from one place in a short time. Wait a few minutes and try again." }, { status: 429 });
  }
  const raw = await req.text();
  if (raw.length > 20_000) return NextResponse.json({ error: "That request is too large." }, { status: 413 });
  let body: { text?: string; draft?: Draft };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Send JSON: { text } or { draft }." }, { status: 400 });
  }
  // the model is the only metered part: a smaller allowance of its own, with the rules as the fallback
  const modelOk = !limited("model:" + who, 12, 10 * 60_000);
  const readWithModel: typeof modelParse = async (...a) =>
    modelOk ? modelParse(...a) : { draft: null, error: "model allowance used up for now, rules only" };
  const u = await universe();
  const known = (t: string) => u.set.has(t);
  const text = body.text ? String(body.text).slice(0, 500) : "";
  const cur = body.draft;
  let draft: Draft = cur ?? {};
  let readBy: "rules" | "model" | "edit" = "edit";
  let intent: "new" | "change" | "edit" = "edit";
  let modelNote: string | undefined;

  if (text) {
    const rules = ruleParse(text, known);
    const namesNewStock = Boolean(rules.ticker && (!cur || rules.ticker !== cur.ticker));
    const startFresh = async () => {
      // a new trade starts clean: only what the words say, never the previous trade's size, limit or leverage
      intent = "new";
      draft = rules; readBy = "rules";
      const r = validate(rules);
      if (r.missing.length || (r.trade && !known(r.trade.ticker))) {
        const m = await readWithModel(text, null);
        if (m.draft) { draft = { ...defined(rules), ...defined(m.draft) }; readBy = "model"; }
        else modelNote = m.error;
      }
    };
    if (!cur || namesNewStock) {
      await startFresh();
    } else {
      // the same stock, or none named: a change to the current trade, read by the model
      const m = await readWithModel(text, cur);
      if (m.draft && m.intent === "new") {
        intent = "new"; readBy = "model"; draft = { ...defined(rules), ...defined(m.draft) };
      } else if (m.draft) {
        intent = "change"; readBy = "model"; draft = { ...cur, ...defined(m.draft) };
      } else {
        intent = "change"; readBy = "rules"; modelNote = m.error; draft = { ...cur, ...defined(rules) };
      }
      // safety net: if the result is a different stock, it is a new trade after all
      if (intent === "change" && draft.ticker && cur.ticker && draft.ticker !== cur.ticker) await startFresh();
    }
  }

  const parsed = validate(draft);
  const meta = { readBy, intent, asked: text || undefined, model: hasModel() ? "claude-opus-5-5" : null, modelNote };
  if (parsed.trade && !known(parsed.trade.ticker)) {
    return NextResponse.json({ parsed, meta, error: `${parsed.trade.ticker} is not a US stock listed on Bitget as an rToken.` });
  }
  if (!parsed.trade) return NextResponse.json({ parsed, meta });
  const result = await checkTrade(parsed.trade);
  if ("error" in result) return NextResponse.json({ parsed, meta, error: result.error });
  return NextResponse.json({ parsed, meta, result });
}
