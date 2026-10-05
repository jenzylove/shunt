// The language model reads words; it never computes a number Shunt shows.
// It turns a sentence (or a follow up against the current trade) into the trade schema; code validates the rest.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { tradingDaysAfter } from "./engine/calendar";
import type { Draft } from "./parse";

export const MODEL = "claude-opus-5-5";

const TradeSchema = z.object({
  intent: z.enum(["change", "new"]).describe("change: the message adjusts the current trade (same stock). new: it names a different stock or describes a whole new trade. With no current trade, always new."),
  ticker: z.string().nullable().describe("US stock ticker in capitals, e.g. NVDA. Map company names to tickers. Null if no stock is named."),
  venue: z.enum(["rtoken", "perp"]).nullable().describe("rtoken for spot/tokenised stock (rNVDA), perp for perpetual futures or any leverage"),
  side: z.enum(["long", "short"]).nullable(),
  sizeUsd: z.number().nullable().describe("Position size in US dollars (notional). 20k = 20000"),
  horizonDays: z.number().int().nullable().describe("How many trading days the position is held, if given as a count"),
  holdUntil: z.string().nullable().describe("If the user names an exit date or weekday instead of a count, that date as YYYY-MM-DD"),
  lossLimitUsd: z.number().nullable().describe("Largest loss the user accepts, in dollars"),
  lossLimitPct: z.number().nullable().describe("Largest loss as a percent of the position, e.g. 3 for 3%"),
  leverage: z.number().nullable(),
  confidence: z.enum(["0.8", "0.95"]).nullable().describe("0.95 only if the user asks for a worst case or 19 in 20; otherwise null"),
  thesis: z.string().nullable().describe("The user's reason for the trade in their own words, if given"),
});

const SYSTEM = `You turn a trader's message into a structured trade for a risk checking tool.
Only extract what the user said. Never invent a size, holding period or loss limit: leave a field null if it is not stated or clearly implied.
If a current trade is given and the message adjusts it ("what if I hold till Friday", "make it 10k", "use the perp at 3x"), set intent to change and return the full trade with only the changed fields updated.
If the message names a DIFFERENT stock or describes a whole new trade, set intent to new, and fill ONLY what the message states. Never copy size, loss limit, holding period, leverage or venue from the current trade into a new one: leave them null.
"Over the weekend" means hold through the next Monday open. "Till Friday" or "until the 9th" means holdUntil that date.
Today in New York is {today} ({weekday}).`;

let client: Anthropic | null = null;
export const hasModel = () => Boolean(process.env.ANTHROPIC_API_KEY);

export type ModelRead = { draft: Draft | null; intent?: "change" | "new"; error?: string };

export async function modelParse(text: string, current: Draft | null, now = new Date()): Promise<ModelRead> {
  if (!hasModel()) return { draft: null, error: "no model key" };
  client ??= new Anthropic();
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const weekday = now.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long" });
  const user = current
    ? `Current trade: ${JSON.stringify(current)}\nChange requested: ${text}`
    : `Message: ${text}`;
  try {
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM.replace("{today}", today).replace("{weekday}", weekday),
      output_config: { effort: "low", format: zodOutputFormat(TradeSchema) },
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") return { draft: null, error: "the model declined" };
    const o = res.parsed_output;
    if (!o) return { draft: null, error: "could not read the reply" };
    const d: Draft = {
      ticker: o.ticker?.toUpperCase().replace(/^R(?=[A-Z]{2,5}$)/, "") ?? undefined,
      venue: o.venue ?? undefined, side: o.side ?? undefined,
      sizeUsd: o.sizeUsd ?? undefined, horizonDays: o.horizonDays ?? undefined,
      lossLimitUsd: o.lossLimitUsd ?? undefined, leverage: o.leverage ?? undefined,
      confidence: o.confidence === "0.95" ? 0.95 : 0.8, thesis: o.thesis ?? undefined,
    };
    if (o.lossLimitPct != null && d.sizeUsd && !d.lossLimitUsd) d.lossLimitUsd = (o.lossLimitPct / 100) * d.sizeUsd;
    if (o.holdUntil && !d.horizonDays && /^\d{4}-\d{2}-\d{2}$/.test(o.holdUntil)) {
      const days = tradingDaysAfter(now, 25);
      const i = days.findIndex((x) => x >= o.holdUntil!);
      if (i >= 0) d.horizonDays = i + 1;
    }
    return { draft: d, intent: current ? o.intent : "new" };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { draft: null, error: "busy, try again" };
    if (e instanceof Anthropic.AuthenticationError) return { draft: null, error: "model key rejected" };
    if (e instanceof Anthropic.APIError) return { draft: null, error: `model error ${e.status}` };
    return { draft: null, error: "model unreachable" };
  }
}
