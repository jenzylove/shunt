"""Writes docs/DATA_MANIFEST.json: what the committed data was built from, and hashes to check it against.
The raw price and filing responses are cached outside git (data/cache); this records where they came from and fingerprints the
aggregates the app actually ships. Run after build_dataset.py."""
import hashlib, json, subprocess, datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"

def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()

stocks = sorted((DATA / "stocks").glob("*.json"))
combined = hashlib.sha256(b"".join(p.name.encode() + sha(p).encode() for p in stocks)).hexdigest()
commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
man = {
    "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    "codeCommit": commit,
    "sources": [
        {"what": "daily prices, 10 years, adjusted close", "from": "https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?range=10y&interval=1d", "cached": "data/cache/daily/{TICKER}.json"},
        {"what": "earnings release times (8-K Item 2.02 acceptance times) and SIC codes", "from": "https://data.sec.gov/submissions/CIK{cik}.json", "cached": "data/cache/subs/{cik}.json"},
        {"what": "company to CIK map", "from": "https://www.sec.gov/files/company_tickers.json"},
        {"what": "which stocks Bitget lists as rTokens and as stock perps", "from": "https://api.bitget.com/api/v2/spot/public/symbols and /api/v2/mix/market/contracts?productType=USDT-FUTURES"},
        {"what": "FOMC statement dates", "from": "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", "file": "scripts/fomc_dates.json", "note": "includes one notation vote, 2025-08-22"},
    ],
    "rules": "stocks with fewer than 750 daily prices are excluded; see scripts/build_dataset.py for the exclusion and event definitions",
    "outputs": {"stockProfiles": len(stocks), "stockProfilesSha256": combined,
                "calibrationSha256": sha(DATA / "calibration.json"), "journalSha256": sha(DATA / "journal.json") if (DATA / "journal.json").exists() else None},
    "limits": "Raw responses are not committed, so a rebuild fetches today's data and will differ slightly; the hashes above fingerprint what this release shipped.",
}
(ROOT / "docs" / "DATA_MANIFEST.json").write_text(json.dumps(man, indent=2))
print("wrote docs/DATA_MANIFEST.json", len(stocks), "profiles")
