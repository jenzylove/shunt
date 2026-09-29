# Shunt: build plan

Deadline: 7 October 2026. Every phase ends with a check that proves it is done.

## Stack
Next.js (TypeScript) on Vercel. The measurement engine is pure TypeScript functions with unit tests.
Language model behind one provider interface: Qwen through Bitget's endpoint when credits arrive, otherwise the
key the user provides. The model only parses and explains; every number comes from code.

## Phases

| # | Date | Phase | Done when |
|---|---|---|---|
| 1 | 29 Sep | Repo, PRD, plan; spikes on the unknowns below | You approve PRD and plan; spike notes in docs/spikes |
| 2 | 30 Sep | Measurement engine: event history, bands, switchpoint maths, calibration | Unit tests pass; calibration table printed for 50+ stocks |
| 3 | 1 Oct | Live data layer: Bitget books, fees, funding, candles; Nasdaq calendar; SEC; Fed and BLS dates | One real trade checked end to end from the command line with every source live |
| 4 | 2 Oct | Language layer: parse to schema, editable chips, follow ups, one sentence answer | Twenty varied trade sentences parse correctly in a test file |
| 5 | 3 Oct | The app: the rail, the switchpoint, cost panel, journal, /demo, /proof, /research | Real buttons pressed in a headless browser, dark and light, phone width |
| 6 | 4 Oct | Agent Hub: signal skills as context, order ticket, Demo proof orders tagged shunt; forward journal running | Real Bitget Demo order ids on the proof page; journal entries recorded |
| 7 | 5 Oct | Design pass and release readiness audit; fixes | Audit findings fixed or listed in Scope and limits |
| 8 | 5 to 6 Oct | Your review of the live product | Your approval |
| 9 | 6 Oct | README, demo video, X post, form answers | Repo public, video uploaded, text ready to paste |
| 10 | 7 Oct | Submit | Form submitted, memory updated to SUBMITTED |

## Risks and unknowns

| Item | Status |
|---|---|
| Nasdaq earnings calendar reachable and gives timing | Known: tested 29 Sep, returns before open or after close per row |
| SEC 8-K Item 2.02 history per company | Known: used in spikes; heavy filers need older pages (handled in spike code) |
| Daily price history source that works from Vercel | Needs a spike: Yahoo worked locally; check from a serverless function, else cache per stock |
| Agent Hub signal skills callable from a web server | Needs a spike: the package is `@bitget-ai/bitget-signal`, public and keyless, but the endpoint is undocumented |
| Agent Hub Demo orders | Reuse an existing Demo key locally only, orders tagged `shunt`; no key on the public site |
| Which rTokens trade at weekends | Known approach: read last weekend's Bitget candles per symbol |
| Language model access | Needs your decision: Qwen credits not arrived; which key to use meanwhile |
| Calibration may show the bands are too narrow | Known risk: if so, widen by the measured miss rate and publish that, do not hide it |

## Questions for you at this checkpoint
1. Approve the PRD and plan, or tell me what to change.
2. Which language model key can I use until the Qwen credits arrive (Anthropic, OpenAI, other)?
3. None needed: we reuse an existing Demo key locally, tag orders `shunt`, and keep keys off the public site.
