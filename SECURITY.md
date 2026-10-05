# Security

- The public site holds no exchange key. Orders in the proof were placed from the builder's machine on Bitget Demo
  (`bgc --paper-trading`) and the site only displays the recorded ids.
- The only secret the server holds is an Anthropic API key, used to read the user's sentence. The model never produces
  a number the user sees. The API route has a body cap, rate limits per IP (best effort on serverless), timeouts and
  security headers.
- Shunt does not predict prices or give trading advice. It measures past event sizes. You decide.

Report problems by opening a private security advisory on this repository.
