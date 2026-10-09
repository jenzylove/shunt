"""Writes docs/DATA_MANIFEST.json: what the committed data was built from, and hashes to check it against.
The raw price and filing responses are cached outside git (data/cache); this records where they came from and fingerprints the
data the app ships that does not change daily. Run after build_dataset.py. Check with: npm run data:verify"""
import json, datetime as dt
from pathlib import Path
from verify_data import compute, DAILY_FIELDS

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"

man = {
    "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    "sources": [
        {"what": "daily prices, 10 years, adjusted close", "from": "https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?range=10y&interval=1d", "cached": "data/cache/daily/{TICKER}.json"},
        {"what": "earnings release times (8-K Item 2.02 acceptance times) and SIC codes", "from": "https://data.sec.gov/submissions/CIK{cik}.json", "cached": "data/cache/subs/{cik}.json"},
        {"what": "company to CIK map", "from": "https://www.sec.gov/files/company_tickers.json"},
        {"what": "which stocks Bitget lists as rTokens and as stock perps", "from": "https://api.bitget.com/api/v2/spot/public/symbols and /api/v2/mix/market/contracts?productType=USDT-FUTURES"},
        {"what": "FOMC statement dates", "from": "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", "file": "scripts/fomc_dates.json", "note": "includes one notation vote, 2025-08-22"},
    ],
    "rules": "stocks with fewer than 750 daily prices are excluded; see scripts/build_dataset.py for the exclusion and event definitions. "
             "Hashes: each stock profile is parsed as JSON, the fields " + ", ".join(DAILY_FIELDS) + " are removed (scripts/refresh_vol.py rewrites them in every profile each day), "
             "and the rest is serialized with sorted keys and compact separators before sha256. stockProfilesSha256 is sha256 over each filename followed by its profile hash, in filename order. "
             "calibrationSha256 uses the same serialization of calibration.json. Recompute and compare with: npm run data:verify. "
             "The code commit is not recorded here because it goes stale on every commit; the live app reports it at /api/version.",
    "outputs": compute(DATA),
    "journal": "public/data/journal.json is deliberately not hashed. It is append only and graded daily by a GitHub Action, and its full history is in git (git log -p public/data/journal.json).",
    "limits": "Raw responses are not committed, so a rebuild fetches today's data and will differ slightly; the hashes above fingerprint what this release shipped.",
}
(ROOT / "docs" / "DATA_MANIFEST.json").write_text(json.dumps(man, indent=2))
print("wrote docs/DATA_MANIFEST.json", man["outputs"]["stockProfiles"], "profiles")
