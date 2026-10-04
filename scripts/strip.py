"""A picture of the calibration claim for the Proof page: for three stocks, every trading day of the last year, the
4 in 5 range as it stood BEFORE that day (from earlier data only) and the move that then happened.
Writes public/data/strip.json. Needs data/cache/daily/*.json from build_dataset.py."""
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = {"note": "range for each day uses only closes before that day: 60 day volatility times the 80th percentile of earlier |move| / volatility", "stocks": {}}
for t in ["NVDA", "TSLA", "AAPL"]:
    raw = json.loads((ROOT / "data/cache/daily" / f"{t}.json").read_text())
    days = sorted(raw)
    c = np.array([raw[d][1] for d in days])
    r = np.diff(np.log(c))
    rd = days[1:]
    z, rows = [], []
    for i in range(61, len(r)):
        vol = r[i - 60:i].std(ddof=1)
        zz = np.abs(r[i - 60:i]) / vol  # earlier moves in earlier-vol units
        z_hist = np.array(z) if len(z) > 120 else zz
        q = float(np.quantile(z_hist, 0.8))
        band = q * vol
        rows.append((rd[i], band, float(r[i])))
        z.append(abs(r[i]) / vol)
    last = rows[-250:]
    inside = sum(abs(x[2]) <= x[1] for x in last)
    OUT["stocks"][t] = {"days": [{"d": d, "band": round(b, 5), "move": round(m, 5)} for d, b, m in last],
                        "inside": int(inside), "checked": len(last)}
    print(t, inside, len(last))
(ROOT / "public/data/strip.json").write_text(json.dumps(OUT))
