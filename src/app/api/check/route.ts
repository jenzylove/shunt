import { NextResponse } from "next/server";
import { checkTrade } from "@/lib/check";
import { hasModel, modelParse } from "@/lib/llm";
import { cleanDraft, ruleParse, tickersIn, validate, type Draft } from "@/lib/parse";
import { answer, detectQuestion, type CompareRow, type Question, type QuestionKind } from "@/lib/questions";
import { day as dayLabel, explain } from "@/lib/explain";
import { newYork } from "@/lib/engine/calendar";
import { nextEarnings } from "@/lib/live/calendar";
import * as rl from "@/lib/ratelimit";
import { clientKey, limitedShared, modelBudgetSpent, withModelSlot } from "@/lib/ratelimit";
import { universe } from "@/lib/universe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// capitalised words traders type that are not stocks
const NOT_STOCKS = new Set(("USD USDT ETF ETFS CEO CFO IPO FED FOMC CPI PCE NFP GDP EPS SEC ATH EOD EOW YOLO OK US USA UK EU AM PM ET EST UTC " +
  "MON TUE TUES WED THU THUR FRI SAT SUN JAN FEB MAR APR MAY JUN JUL AUG SEP SEPT OCT NOV DEC AI ASAP FYI IMO TBH LOL").split(" "));

const defined =(d: Draft) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined && v !== null)) as Draft;

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
  const res = await handle(req);
  // says whether limits were counted in the shared store or only on this instance; no secret in it
  res.headers.set("x-shunt-limits", rl.lastStoreAnswered ? "shared" : "instance");
  return res;
}

async function handle(req: Request): Promise<NextResponse> {
  const who = clientKey(req);
  if (await limitedShared("req:" + who, 40, 10 * 60_000)) {
    return fail("Too many checks from one place in a short time. Wait a few minutes and try again.", 429);
  }
  const raw = await req.text();
  if (raw.length > 20_000) return fail("That request is too large.", 413);
  let body: { text?: unknown; draft?: unknown; rulesOnly?: unknown; sizeConfirmed?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("Send JSON: { text } or { draft }.", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return fail("Send JSON: { text } or { draft }.", 400);
  if (body.text !== undefined && typeof body.text !== "string") return fail("text must be a string.", 400);
  const cur = body.draft === undefined ? undefined : cleanDraft(body.draft);
  if (cur === null) return fail("That trade has a value Shunt cannot use. Check the numbers.", 400);
  // these flags belong to one sentence; a trade sent back from the page never carries them forward
  if (cur) { delete cur.currency; delete cur.lossConflict; }

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
  let intent: "new" | "change" | "edit" | "question" = "edit";
  let modelNote: string | undefined;
  let question: Question | null = null;
  let statedTrade = false;   // the words themselves name a stock, size, hold, limit or leverage

  if (text) {
    const rules = ruleParse(text, known);
    const mentioned = tickersIn(text, known);
    const namesNewStock = Boolean(rules.ticker && (!cur || rules.ticker !== cur.ticker));
    // does the sentence change the trade at all? (venue, side and confidence always get a default, so they don't count)
    const changes = namesNewStock || rules.sizeUsd != null || rules.horizonDays != null || rules.lossLimitUsd != null || rules.leverage != null;
    statedTrade = changes || Boolean(rules.ticker);
    question = detectQuestion(text, mentioned, changes);
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
        if (!question && m.question) question = { kind: m.question as QuestionKind, tickers: m.tickers };
      }
    };
    if (question && question.kind !== "compare" && cur && !changes) {
      // a question about the current trade: answered from the check, the trade itself is not touched
      intent = "question"; readBy = "rules";
    } else if (question?.kind === "compare") {
      intent = "question"; readBy = "rules";
      draft = { ...(cur && !namesNewStock ? cur : {}), ...defined(rules), ticker: question.tickers![0] };
    } else if (cur && namesNewStock && /\binstead\b|\bsame (trade|thing|size|numbers)\b|\bsame for\b/i.test(text)) {
      // "how does this look for AMD instead?": the same trade on another stock
      intent = "new"; readBy = "rules";
      draft = { ...cur, ...defined(rules), ticker: rules.ticker, venue: cur.venue, side: cur.side, confidence: cur.confidence };
    } else if (!cur || namesNewStock) {
      await startFresh();
    } else {
      // the same stock, or none named: a change to the current trade, read by the model when allowed
      const m = await readWithModel(text, cur);
      const clean = m.draft ? cleanDraft(m.draft) : null;
      if (m.question && !question) question = { kind: m.question as QuestionKind, tickers: m.tickers };
      if (question && question.kind !== "compare") {
        intent = "question"; readBy = m.draft ? "model" : "rules"; draft = cur;
      } else if (clean && m.intent === "new") {
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
  let finalDraft = cleanDraft(draft);
  if (finalDraft === null && cur) {
    // a follow up asked for a value Shunt cannot use: keep the trade as it was and say so
    finalDraft = cur; modelNote = "that change is not a value Shunt can use, so your trade is unchanged";
  }
  if (finalDraft === null) return fail("That trade has a value Shunt cannot use. Check the numbers.", 400);

  const parsed = validate(finalDraft);
  // a sentence that changed nothing and asked nothing was not understood: say so instead of repeating the answer
  const same = cur && ["ticker", "venue", "side", "sizeUsd", "horizonDays", "lossLimitUsd", "leverage", "confidence"].every((k) => (cur as Record<string, unknown>)[k] === (finalDraft as Record<string, unknown>)[k]);
  // (a sentence that restates the same trade was read fine; it just changed nothing)
  const unread = Boolean(text && cur && !question && same && !statedTrade);
  const meta = { readBy, intent, asked: text || undefined, model: hasModel() && !rulesOnly ? "claude-opus-5-5" : null, modelNote,
    question: question ?? undefined, unread: unread || undefined };
  if (finalDraft.currency) {
    return NextResponse.json({ parsed, meta, error: `Shunt prices everything in US dollars, and that read as ${finalDraft.currency}. Say the amounts in dollars.` });
  }
  if (finalDraft.lossConflict) {
    return NextResponse.json({ parsed, meta, ask: { kind: "conflict", field: "lossLimitUsd", options: finalDraft.lossConflict } });
  }
  // a symbol written in capitals that Bitget does not list: say so, instead of asking which stock
  // checked whenever the words name no known stock, including in a follow up ("same for ZZZQ")
  const unknownSymbol = text && !tickersIn(text, known).length ? text.match(/\b(?:r)?([A-Z]{2,5})\b/g)?.map((x) => x.replace(/^r/, "")).find((x) => !known(x) && !NOT_STOCKS.has(x)) : undefined;
  if (unknownSymbol) return NextResponse.json({ parsed, meta, error: `${unknownSymbol} is not a US stock listed on Bitget as an rToken.` });
  if (parsed.trade && !known(parsed.trade.ticker)) {
    return NextResponse.json({ parsed, meta, error: `${parsed.trade.ticker} is not a US stock listed on Bitget as an rToken.` });
  }
  if (!parsed.trade) {
    // "when does nvidia report?" needs only the stock
    if (question?.kind === "next-earnings" && finalDraft.ticker && known(finalDraft.ticker)) {
      const n = await nextEarnings(finalDraft.ticker, newYork(new Date()).date).catch(() => null);
      return NextResponse.json({ parsed, meta, answer: { kind: "next-earnings", title: `${finalDraft.ticker}'s next earnings`,
        lines: [n ? `${finalDraft.ticker} next reports on ${dayLabel(n.date)} (${n.timing === "unknown" ? "time not given" : n.timing}), per the Nasdaq calendar.` : `${finalDraft.ticker} has no report on the Nasdaq calendar in the next six weeks.`,
          "Tell me the size, the hold and the most you can lose, and Shunt will check whether your trade survives it."] } });
    }
    return NextResponse.json({ parsed, meta });
  }
  // "$10k at 5x" is read two ways by traders: $10k of exposure, or $10k of your own money. Ask once instead of guessing.
  const lev = parsed.trade.leverage ?? 1;
  const saidWhich = /\b(margin|collateral|own money|position|notional|exposure|value)\b/i.test(text);
  const fromWords = text && (readBy === "rules" || readBy === "model") && finalDraft.sizeUsd !== cur?.sizeUsd;
  if (parsed.trade.venue === "perp" && lev > 1 && fromWords && !saidWhich && body.sizeConfirmed !== true) {
    return NextResponse.json({ parsed, meta, ask: { kind: "sizeMeaning", sizeUsd: parsed.trade.sizeUsd, leverage: lev } });
  }
  const result = await checkTrade(parsed.trade);
  if ("error" in result) return NextResponse.json({ parsed, meta, error: result.error });
  if (!question) return NextResponse.json({ parsed, meta, result });

  // answer the question from this check, plus whatever extra the question needs
  const extra: Parameters<typeof answer>[2] = {};
  if (question.kind === "worst") {
    const w = await checkTrade({ ...parsed.trade, confidence: 0.95 });
    if (!("error" in w)) extra.worst = w;
  }
  if (question.kind === "next-earnings") extra.nextEarnings = await nextEarnings(parsed.trade.ticker, newYork(new Date()).date).catch(() => null);
  if (question.kind === "compare") {
    extra.compare = await Promise.all((question.tickers ?? []).map(async (tk): Promise<CompareRow> => {
      if (!known(tk)) return { ticker: tk, error: "not listed on Bitget as an rToken" };
      const c = tk === parsed.trade!.ticker ? result : await checkTrade({ ...parsed.trade!, ticker: tk });
      if ("error" in c) return { ticker: tk, error: c.error };
      return { ticker: tk, state: c.assessment.verdict.state, headline: explain(c).headline, worstLossUsd: (c.assessment.worst ?? c.assessment.horizon).lossUsd, costUsd: c.assessment.costUsd };
    }));
  }
  return NextResponse.json({ parsed, meta, result, answer: answer(question, result, extra) });
}
