import { NextResponse } from "next/server";
import { checkTrade } from "@/lib/check";
import { hasModel, modelParse } from "@/lib/llm";
import { cleanDraft, ruleParse, validate, type Draft } from "@/lib/parse";
import { clientKey, limitedShared, modelBudgetSpent, withModelSlot } from "@/lib/ratelimit";
import { universe } from "@/lib/universe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defined = (d: Draft) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined && v !== null)) as Draft;

// every failure has the same shape as a success, so the page can always show it instead of breaking
const empty = { trade: null, draft: {}, missing: [], notes: [] };
const fail = (error: string, status: number) => NextResponse.json({ error, parsed: empty }, { status });

/**
 * POST { text }                 a new trade in plain words
 * POST { text, draft }          a follow up that changes the current trade ("what if I hold till Friday")
 * POST { draft }                an edited trade from the chips
 * POST { ..., rulesOnly: true } never send the sentence to a language model
 * Returns what was understood (and by what), plus the measured check when the trade is complete.
 */
export async function POST(req: Request) {
  const who = clientKey(req);
  if (await limitedShared("req:" + who, 40, 10 * 60_000)) {
    return fail("Too many checks from one place in a short time. Wait a few minutes and try again.", 429);
  }
  const raw = await req.text();
  if (raw.length > 20_000) return fail("That request is too large.", 413);
  let body: { text?: unknown; draft?: unknown; rulesOnly?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("Send JSON: { text } or { draft }.", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return fail("Send JSON: { text } or { draft }.", 400);
  if (body.text !== undefined && typeof body.text !== "string") return fail("text must be a string.", 400);
  const cur = body.draft === undefined ? undefined : cleanDraft(body.draft);
  if (cur === null) return fail("That trade has a value Shunt cannot use. Check the numbers.", 400);

  // the model is the only metered part. It is used only when the rules cannot read the words (or for a follow up),
  // never when the user chose rules only, and never past a per client allowance, a concurrency cap or the daily budget.
  const rulesOnly = body.rulesOnly === true;
  const modelOk = !rulesOnly && !(await limitedShared("model:" + who, 12, 10 * 60_000)) && !(await modelBudgetSpent());
  const readWithModel: typeof modelParse = async (...a) => {
    if (rulesOnly) return { draft: null, error: "rules only, as you chose" };
    if (!modelOk) return { draft: null, error: "model allowance used up for now, rules only" };
    return withModelSlot(() => modelParse(...a), { draft: null, error: "model busy, rules only" });
  };
  const u = await universe();
  const known = (t: string) => u.set.has(t);
  const text = typeof body.text === "string" ? body.text.slice(0, 500) : "";
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
        const clean = m.draft ? cleanDraft(m.draft) : null;
        if (clean) { draft = { ...defined(rules), ...defined(clean) }; readBy = "model"; }
        else modelNote = m.error ?? "the model's reply was not usable";
      }
    };
    if (!cur || namesNewStock) {
      await startFresh();
    } else {
      // the same stock, or none named: a change to the current trade, read by the model when allowed
      const m = await readWithModel(text, cur);
      const clean = m.draft ? cleanDraft(m.draft) : null;
      if (clean && m.intent === "new") {
        intent = "new"; readBy = "model"; draft = { ...defined(rules), ...defined(clean) };
      } else if (clean) {
        intent = "change"; readBy = "model"; draft = { ...cur, ...defined(clean) };
      } else {
        intent = "change"; readBy = "rules"; modelNote = m.error; draft = { ...cur, ...defined(rules) };
      }
      // safety net: if the result is a different stock, it is a new trade after all
      if (intent === "change" && draft.ticker && cur.ticker && draft.ticker !== cur.ticker) await startFresh();
    }
  }
  const finalDraft = cleanDraft(draft);
  if (finalDraft === null) return fail("That trade has a value Shunt cannot use. Check the numbers.", 400);

  const parsed = validate(finalDraft);
  const meta = { readBy, intent, asked: text || undefined, model: hasModel() && !rulesOnly ? "claude-opus-5-5" : null, modelNote };
  if (parsed.trade && !known(parsed.trade.ticker)) {
    return NextResponse.json({ parsed, meta, error: `${parsed.trade.ticker} is not a US stock listed on Bitget as an rToken.` });
  }
  if (!parsed.trade) return NextResponse.json({ parsed, meta });
  const result = await checkTrade(parsed.trade);
  if ("error" in result) return NextResponse.json({ parsed, meta, error: result.error });
  return NextResponse.json({ parsed, meta, result });
}
