"""Daily: refresh each profile's current volatility (last 60 daily moves) and last close from Yahoo.
The measured history in each profile does not change day to day; the volatility it is scaled by does.
usage: python scripts/refresh_vol.py
"""
import json, datetime as dt, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np

STOCKS = Path(__file__).resolve().parent.parent / "public" / "data" / "stocks"


def closes(t):
    u = f"https://query1.finance.yahoo.com/v8/finance/chart/{t.replace('.', '-')}?range=6mo&interval=1d"
    try:
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
        r = json.loads(urllib.request.urlopen(req, timeout=20).read())["chart"]["result"][0]
        adj = r["indicators"].get("adjclose", [{}])[0].get("adjclose") or r["indicators"]["quote"][0]["close"]
        days = [dt.datetime.fromtimestamp(x, dt.timezone.utc).strftime("%Y-%m-%d") for x in r["timestamp"]]
        return [(d, c) for d, c in zip(days, adj) if c]
    except Exception:
        return None


def refresh(path):
    p = json.loads(path.read_text())
    c = closes(p["ticker"])
    if not c or len(c) < 62:
        return False
    v = np.array([x for _, x in c], float)
    r = v[1:] / v[:-1] - 1
    p["volNow"] = round(float(np.std(r[-60:], ddof=1)), 5)
    p["lastClose"] = round(float(v[-1]), 5)
    p["volAsOf"] = c[-1][0]
    path.write_text(json.dumps(p, separators=(",", ":")))
    return True


if __name__ == "__main__":
    files = sorted(STOCKS.glob("*.json"))
    with ThreadPoolExecutor(12) as ex:
        ok = sum(ex.map(refresh, files))
    print(f"refreshed {ok} of {len(files)} profiles")
