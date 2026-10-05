# Submission text (drafts, no dashes)

## X post (long form, quote https://x.com/Bitget_AI/status/2100519318824055159)

I trade US stocks on Bitget and kept getting caught by things I could have seen coming: an earnings report inside my hold, a Fed day, a weekend with Wall Street shut.

So I built Shunt for #BitgetHackathon, @Bitget_AI Track 3.

You say your trade in plain words: "buy $20k rNVDA, hold 5 days, max loss $600". Shunt finds everything scheduled inside the hold, measures how big each event has been for that exact stock, and shows the day your trade stops fitting your own loss limit. Live Bitget order book costs at your size sit next to it. If the book cannot fill you, it says so.

It measures. It does not predict, and you decide.

I tried to break my own claims before shipping them:
1. Ranges built only from earlier data caught 80.5% of ordinary days, 80.0% of overnight gaps and 80.7% of earnings days. Weekends fall short at 70.6%, and the page shows that.
2. 57 round trips, 118 orders, placed on Bitget Demo through Agent Hub. Median cost predicted 15.7 bps, charged 16.8 bps. Demo fills are simulated, and the page says so.
3. 24 typed sentences as an answer key. First run: 14 right with rules alone, 22 with Claude. I published the misses and the fixes.

Two ideas failed in research before this one, and they are on the research page too.

No sign up: https://shunt-eight.vercel.app

## Form: project description

What it is: Shunt checks whether a trade survives what is scheduled inside its holding period, at your size, within your loss limit.
Problem: traders check price, not the calendar, and size for normal days.
How: rule parser plus Claude read the sentence; code measures event sizes per stock from history, walks the live Bitget book, and returns one verdict and a chart.
Evidence: calibration on unseen history, a forward journal graded after each session, Agent Hub orders, a published answer key.
Limits: move size not direction; weekends too narrow; CPI days not included; Demo fills simulated.

## LLM role field

Claude (claude-opus-5-5) turns the user's sentence and follow ups into a structured trade. All numbers, ranges and verdicts are computed by code. Qwen was not used because the credits never arrived.

## Track and theme

Track 3, Personalized Research Workbench (also covers Decision Stress Testing).
