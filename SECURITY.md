# Security

- The public site holds no exchange key. Orders in the proof were placed from the builder's machine on Bitget Demo
  (`bgc --paper-trading`) and the site only displays the recorded ids.
- The only secret the server holds is an Anthropic API key, used to read the user's sentence. The model never produces
  a number the user sees. The API route has a body cap, rate limits per IP (best effort on serverless), timeouts and
  security headers.
- Shunt does not predict prices or give trading advice. It measures past event sizes. You decide.

Report problems by opening a private security advisory on this repository.

## Known and accepted

- `npm audit` reports a denial of service advisory in `braces`, reached only through the ESLint toolchain (development).
  No fixed release exists upstream, the code never runs on the server, and CI audits production dependencies at high severity.
- Rate limits are per server instance unless `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, which makes the
  per client limits and the daily model budget (`MODEL_DAILY_CALLS`, default 1500) shared across instances. Set a spend limit on the
  Anthropic key as well.
