"""Build Shunt's measured stock profiles from public data.

For every US stock that trades on Bitget as an rToken, this measures from real history:
  - normal day moves, and moves over 1 to 20 trading days
  - overnight and weekend gaps
  - moves on the stock's own earnings reaction days (SEC 8-K Item 2.02 acceptance times)
  - moves on Fed decision days (Federal Reserve calendar)
  - moves on the earnings days of bellwethers it historically reacts to
It also checks the bands against history (point in time calibration).

Outputs: public/data/index.json, public/data/stocks/<TICKER>.json, public/data/calibration.json
Usage: python scripts/build_dataset.py [--limit N]
"""
import json, sys, time, datetime as dt, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np, pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "cache"
OUT = ROOT / "public" / "data"
UA = {"User-Agent": "Shunt research jennifereze12@gmail.com"}
YEARS_BACK = 3          # window for normal, gap, Fed and k-day distributions
MIN_EVENTS = 8          # below this an event type is "cannot measure"
HUBS = ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "AMD", "MU", "JPM",
        "NFLX", "ORCL", "COST", "WMT", "LLY", "UNH", "CRM", "ADBE", "INTC", "QCOM", "BA", "GS", "HD", "DIS", "NKE"]


def fetch(url, headers=None, pause=0.0, tries=4):
    for i in range(tries):
        try:
            time.sleep(pause)
            req = urllib.request.Request(url, headers=headers or {"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(1.5 * (i + 1))


# ---------- universe ----------
def universe():
    p = CACHE / "universe.json"
    if p.exists():
        return json.loads(p.read_text())
    sec = json.loads(fetch("https://www.sec.gov/files/company_tickers.json", UA))
    t2c = {v["ticker"].upper(): v["cik_str"] for v in sec.values()}
    spot = json.loads(fetch("https://api.bitget.com/api/v2/spot/public/symbols"))["data"]
    rt = sorted({s["symbol"][1:-4] for s in spot if s["symbol"].startswith("R") and s["symbol"].endswith("USDT")
                 and s.get("status") == "online"})
    perps = json.loads(fetch("https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES"))["data"]
    perp = {x["symbol"][:-4] for x in perps if x["symbol"].endswith("USDT")}
    u = {t: {"cik": t2c[t], "perp": t in perp} for t in rt if t in t2c}
    p.write_text(json.dumps(u))
    return u


def names_by_cik():
    sec = json.loads((CACHE / "sec_tickers.json").read_text())
    return {v["cik_str"]: v["title"] for v in sec.values()}


def daily(t):
    p = CACHE / "daily" / f"{t}.json"
    if not p.exists():
        u = f"https://query1.finance.yahoo.com/v8/finance/chart/{t.replace('.', '-')}?range=10y&interval=1d"
        out = {}
        try:
            r = json.loads(fetch(u))["chart"]["result"][0]
            q = r["indicators"]["quote"][0]
            adj = r["indicators"].get("adjclose", [{}])[0].get("adjclose") or q["close"]
            for i, ts in enumerate(r["timestamp"]):
                o, c, a = q["open"][i], q["close"][i], adj[i]
                if o and c and a:
                    out[dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%d")] = (o * a / c, a)
        except Exception:
            pass
        p.parent.mkdir(exist_ok=True)
        p.write_text(json.dumps(out))
    j = json.loads(p.read_text())
    if len(j) < 750:
        return None
    s = pd.DataFrame(j, index=["o", "c"]).T
    s.index = pd.to_datetime(s.index)
    return s.astype(float).sort_index()


def submissions(cik, extend=False):
    """SEC filing history: SIC code and every 8-K Item 2.02 acceptance time. extend=True reads older pages."""
    p = CACHE / "subs" / f"{cik}.json"
    keep = json.loads(p.read_text()) if p.exists() else None
    if keep and (keep.get("extended") or not extend):
        return keep
    j = json.loads(fetch(f"https://data.sec.gov/submissions/CIK{int(cik):010d}.json", UA, pause=0.12))
    rec = j["filings"]["recent"]
    ev = {rec["acceptanceDateTime"][i] for i in range(len(rec["form"]))
          if rec["form"][i] == "8-K" and "2.02" in (rec["items"][i] or "")}
    if extend:
        for f in j["filings"].get("files", []):
            if f["filingTo"] < "2014-01-01":
                continue
            o = json.loads(fetch("https://data.sec.gov/submissions/" + f["name"], UA, pause=0.12))
            ev |= {o["acceptanceDateTime"][i] for i in range(len(o["form"]))
                   if o["form"][i] == "8-K" and "2.02" in (o["items"][i] or "")}
    keep = {"sic": j.get("sic"), "sicDescription": j.get("sicDescription"), "name": j.get("name"),
            "earnings": sorted(ev, reverse=True), "extended": extend}
    p.parent.mkdir(exist_ok=True)
    p.write_text(json.dumps(keep))
    return keep


# ---------- measurement helpers ----------
def reaction_day(ts, days):
    """SEC acceptance time (US Eastern) to the first trading day whose close reflects it."""
    t = dt.datetime.fromisoformat(ts.replace("Z", ""))
    d = pd.Timestamp(t.date())
    if t.hour * 60 + t.minute >= 16 * 60:
        d += pd.Timedelta(days=1)
    pos = days.searchsorted(d)
    return days[pos] if pos < len(days) else None


def timing(ts):
    t = dt.datetime.fromisoformat(ts.replace("Z", ""))
    m = t.hour * 60 + t.minute
    return "after close" if m >= 16 * 60 else ("before open" if m < 9 * 60 + 30 else "during session")


def pct(x, q):
    return float(np.percentile(np.asarray(x, float), q)) if len(x) else None


def cq(a, level):
    """small sample safe quantile: the ceil((n+1)*level)-th smallest value"""
    a = np.sort(np.asarray(a, float))
    k = int(np.ceil((len(a) + 1) * level)) - 1
    return float(a[min(max(k, 0), len(a) - 1)])


def summary(moves, zs=None):
    """band sizes of absolute moves. zs = the same moves divided by the stock's volatility at the time."""
    a = np.abs(np.asarray(moves, float))
    a = a[~np.isnan(a)]
    if len(a) == 0:
        return {"n": 0}
    out = {"n": int(len(a)), "p50": round(pct(a, 50), 5), "p80": round(cq(a, .8), 5),
           "p95": round(cq(a, .95), 5), "max": round(float(a.max()), 5)}
    if zs is not None:
        z = np.abs(np.asarray(zs, float))
        z = z[~np.isnan(z)]
        if len(z):
            out.update({"z50": round(pct(z, 50), 4), "z80": round(cq(z, .8), 4), "z95": round(cq(z, .95), 4)})
    return out


def r5(x):
    return None if x is None or np.isnan(x) else round(float(x), 5)


def main(limit=None):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "stocks").mkdir(exist_ok=True)
    U = universe()
    cikname = names_by_cik()
    tick = sorted(U)[:limit] if limit else sorted(U)
    print("universe", len(tick), flush=True)
    for t in HUBS:
        if t in U:
            submissions(U[t]["cik"], extend=True)
    with ThreadPoolExecutor(8) as ex:
        px = dict(zip(tick + ["SPY"], ex.map(daily, tick + ["SPY"])))
    liquid = [t for t in tick if px.get(t) is not None and px[t]["c"].tail(250).median() > 5]
    print("liquid", len(liquid), flush=True)

    C = pd.DataFrame({t: px[t]["c"] for t in liquid + ["SPY"]}).sort_index()
    O = pd.DataFrame({t: px[t]["o"] for t in liquid + ["SPY"]}).reindex(C.index)
    C = C[C.index >= "2016-01-01"]
    O = O.reindex(C.index)
    days = C.index
    R = C.pct_change()
    G = O / C.shift(1) - 1
    last = days[-1]
    since = last - pd.DateOffset(years=YEARS_BACK)
    recent = days[days > since]
    gapdays = [d for i, d in enumerate(days[1:], 1) if (d - days[i - 1]).days >= 3]
    fomc = [pd.Timestamp(x) for x in json.loads((CACHE / "fomc.json").read_text())]

    subs = {}
    with ThreadPoolExecutor(4) as ex:
        for t, s in zip(liquid, ex.map(lambda t: submissions(U[t]["cik"]), liquid)):
            subs[t] = s
    # companies whose recent filing list holds too few earnings get their older pages
    short = [t for t in liquid if len(subs[t]["earnings"]) < 16 and not subs[t].get("extended")]
    print("extending SEC history for", len(short), flush=True)
    with ThreadPoolExecutor(4) as ex:
        for t, s in zip(short, ex.map(lambda t: submissions(U[t]["cik"], extend=True), short)):
            subs[t] = s

    earn = {}
    for t in liquid:
        seen = {}
        for a in subs[t]["earnings"]:
            d = reaction_day(a, days)
            if d is not None and d not in seen:
                seen[d] = timing(a)
        earn[t] = seen

    # ---------- bellwether reactions (method confirmed in docs/spikes/results.md, spike C) ----------
    print("bellwether reactions...", flush=True)
    sic = {t: str(subs[t].get("sic") or "") for t in liquid}
    names = [t for t in liquid if sic[t]]
    col = {t: i for i, t in enumerate(names)}
    A = R[names].values
    spy = R["SPY"].values
    S2 = pd.Series({t: sic[t][:2] for t in names})
    PEER = np.tile(spy[:, None], (1, len(names)))
    for g, m in S2.groupby(S2).groups.items():
        idx = [col[x] for x in m]
        if len(idx) < 4:
            continue
        sub = A[:, idx]
        s, c = np.nansum(sub, 1, keepdims=True), np.sum(~np.isnan(sub), 1, keepdims=True)
        PEER[:, idx] = (s - np.nan_to_num(sub)) / np.maximum(c - (~np.isnan(sub)), 1)
    bell = {}   # stock -> hub -> list of (date, raw move, |z|)
    for h in HUBS:
        if h not in col:
            continue
        for d in sorted(earn[h]):
            pos = days.get_loc(d)
            if pos < 260:
                continue
            w = slice(pos - 250, pos)
            Y, P_, M = A[w], PEER[w], spy[w]
            for t in names:
                if t == h or d in earn[t]:
                    continue
                i = col[t]
                y, pe = Y[:, i], P_[:, i]
                ok = ~np.isnan(y) & ~np.isnan(pe) & ~np.isnan(M)
                if ok.sum() < 200 or np.isnan(A[pos, i]) or np.isnan(PEER[pos, i]):
                    continue
                X = np.column_stack([np.ones(ok.sum()), M[ok], pe[ok]])
                b, *_ = np.linalg.lstsq(X, y[ok], rcond=None)
                sd = (y[ok] - X @ b).std()
                if sd > 0:
                    z = abs((A[pos, i] - b @ [1, spy[pos], PEER[pos, i]]) / sd)
                    bell.setdefault(t, {}).setdefault(h, []).append((d, A[pos, i], z))
        print("  ", h, flush=True)

    # ---------- per stock profiles ----------
    METHODS = ("raw", "smallSample", "volScaled")
    calib = {k: {m: [0, 0] for m in METHODS} for k in
             ["earnings", "fed", "bellwether", "overnight", "weekend", "day"]}
    ratios = {k: [] for k in calib}   # (date, move / volScaled band) for the learned correction factor
    index = []
    for t in liquid:
        r, g = R[t], G[t]
        sd = r.rolling(60).std().shift(1)          # the stock's volatility just before each day
        sd_now = float(r.dropna().tail(60).std())
        ed = earn[t]
        normal = r.loc[recent].drop([d for d in ed if d in recent], errors="ignore").dropna()
        kday = {}
        c = C[t].loc[recent].dropna()
        for k in (1, 2, 3, 5, 10, 15, 20):
            mv = (c.shift(-k) / c - 1).dropna()
            kday[str(k)] = summary(mv, mv / (sd.reindex(mv.index) * np.sqrt(k)))
        ov = g.loc[recent].dropna()
        wk = g.loc[[d for d in gapdays if d in recent]].dropna()

        def ev(d, extra=None):
            m, s_ = r.get(d), sd.get(d)
            e = {"d": d.strftime("%Y-%m-%d"), "move": r5(m), "z": r5(m / s_) if s_ and s_ > 0 else None}
            return {**e, **(extra or {})}
        earn_ev = [ev(d, {"timing": tm}) for d, tm in sorted(ed.items())
                   if d in r.index and not np.isnan(r.get(d))]
        fed_ev = [ev(d) for d in fomc if d in r.index and d > since and not np.isnan(r.get(d))]
        bw = []
        for h, evs in bell.get(t, {}).items():
            if len(evs) >= MIN_EVENTS and np.mean([z for _, _, z in evs]) >= 1.5:
                bw.append({"hub": h, "n": len(evs), "meanZ": round(float(np.mean([z for _, _, z in evs])), 2),
                           "events": [ev(d) for d, _, _ in evs]})
        bw.sort(key=lambda x: -x["meanZ"])

        # point in time calibration of the 80% band, three methods, using only earlier observations
        def score(kind, a, z, s_at, idx, lo, dates):
            for i in idx:
                prev_a, prev_z = a[lo(i):i], z[lo(i):i]
                ok = ~np.isnan(prev_z)
                bands = {"raw": np.percentile(prev_a, 80), "smallSample": cq(prev_a, .8),
                         "volScaled": cq(prev_z[ok], .8) * s_at[i] if ok.sum() >= MIN_EVENTS and s_at[i] > 0 else None}
                for m, b in bands.items():
                    if b is not None:
                        calib[kind][m][0] += int(a[i] <= b)
                        calib[kind][m][1] += 1
                if bands["volScaled"]:
                    ratios[kind].append((dates[i], a[i] / bands["volScaled"]))

        def check_events(kind, evs):
            evs = [e for e in evs if e["z"] is not None]
            a = np.abs([e["move"] for e in evs]); z = np.abs([e["z"] for e in evs])
            s_at = np.array([e["move"] / e["z"] if e["z"] else 0 for e in evs], float)
            s_at = np.abs(s_at)
            score(kind, a, z, s_at, range(MIN_EVENTS, len(a)), lambda i: 0, [e["d"] for e in evs])

        def check_series(kind, ser):
            s_at = sd.reindex(ser.index).values
            a, z = np.abs(ser.values), np.abs(ser.values / s_at)
            if len(a) > 60:
                score(kind, a, z, s_at, range(60, len(a), 5), lambda i: max(0, i - 250),
                      [d.strftime("%Y-%m-%d") for d in ser.index])
        check_events("earnings", earn_ev)
        check_events("fed", fed_ev)
        for b in bw:
            check_events("bellwether", b["events"])
        for kind, ser in (("overnight", ov), ("weekend", wk), ("day", normal)):
            check_series(kind, ser)

        def zs(ser):
            return ser / sd.reindex(ser.index)
        prof = {"ticker": t, "name": cikname.get(U[t]["cik"], t), "sic": sic[t],
                "sector": subs[t].get("sicDescription"), "perp": U[t]["perp"],
                "asOf": last.strftime("%Y-%m-%d"), "lastClose": r5(C[t].dropna().iloc[-1]),
                "volNow": round(sd_now, 5),
                "normalDay": summary(normal, zs(normal)), "kDay": kday,
                "overnight": summary(ov, zs(ov)), "weekend": summary(wk, zs(wk)),
                "earnings": {"events": earn_ev, **summary([e["move"] for e in earn_ev],
                                                          [e["z"] for e in earn_ev if e["z"] is not None])},
                "fed": {"events": fed_ev, **summary([e["move"] for e in fed_ev],
                                                    [e["z"] for e in fed_ev if e["z"] is not None])},
                "bellwethers": bw}
        (OUT / "stocks" / f"{t}.json").write_text(json.dumps(prof, separators=(",", ":")))
        index.append({"t": t, "n": prof["name"], "perp": U[t]["perp"]})

    (OUT / "index.json").write_text(json.dumps({"asOf": last.strftime("%Y-%m-%d"), "stocks": index},
                                               separators=(",", ":")))
    cal = {k: {m: {"inside": v[0], "checked": v[1], "rate": round(v[0] / v[1], 4) if v[1] else None}
               for m, v in ms.items()} for k, ms in calib.items()}
    # learned correction: factor fitted on the earlier half of checks, verified on the later half it never saw
    for k, rs in ratios.items():
        if len(rs) < 40:
            continue
        rs.sort()
        cut = rs[len(rs) // 2][0]
        early = np.array([x for d, x in rs if d < cut]); late = np.array([x for d, x in rs if d >= cut])
        f = float(np.quantile(early, 0.8))
        cal[k]["corrected"] = {"factor": round(f, 3), "fittedBefore": cut, "checkedAfter": int(len(late)),
                               "rateAfter": round(float(np.mean(late <= f)), 4),
                               "uncorrectedRateAfter": round(float(np.mean(late <= 1.0)), 4)}
        c_ = cal[k]["corrected"]
        # use the factor only if it moved unseen data closer to the 80% target
        c_["apply"] = bool(abs(c_["rateAfter"] - 0.8) < abs(c_["uncorrectedRateAfter"] - 0.8))
    (OUT / "calibration.json").write_text(json.dumps({"asOf": last.strftime("%Y-%m-%d"), "target": 0.8,
                                                      "types": cal}, indent=1))
    print("calibration: share of later moves inside the 80% band (target 0.80)")
    print(f"  {'type':11s} " + " ".join(f"{m:>12s}" for m in METHODS))
    for k, ms in cal.items():
        c_ = ms.get("corrected")
        print(f"  {k:11s} " + " ".join(f"{str(ms[m]['rate']):>12s}" for m in METHODS) +
              f"   ({ms['raw']['checked']} checks)" +
              (f"  corrected x{c_['factor']} -> {c_['rateAfter']} on unseen later half (was {c_['uncorrectedRateAfter']})" if c_ else ""))
    print("profiles written:", len(index))


if __name__ == "__main__":
    lim = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    main(lim)
