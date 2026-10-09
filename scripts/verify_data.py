"""Recomputes the data hashes from public/data and compares them with docs/DATA_MANIFEST.json.
Exits non-zero with a clear message on any difference. Standard library only.
usage: python scripts/verify_data.py [data_dir]   (data_dir defaults to public/data)

Hashing rules (must match scripts/manifest.py):
  stock profile: parse the JSON, drop the keys in DAILY_FIELDS, serialize with sorted keys and compact separators, sha256.
  stockProfilesSha256: sha256 over, for each profile in filename order, the filename followed by that profile hash.
  calibrationSha256: same canonical serialization of calibration.json.
"""
import hashlib, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA = ROOT / "public" / "data"
MANIFEST = ROOT / "docs" / "DATA_MANIFEST.json"
# refresh_vol.py rewrites these in every profile each day, so they are not part of the fingerprint
DAILY_FIELDS = ("volNow", "volAsOf", "lastClose")


def canon_sha(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def profile_sha(path: Path) -> str:
    p = json.loads(path.read_text(encoding="utf-8"))
    for k in DAILY_FIELDS:
        p.pop(k, None)
    return canon_sha(p)


def compute(data: Path) -> dict:
    stocks = sorted((data / "stocks").glob("*.json"))
    combined = hashlib.sha256(b"".join(p.name.encode() + profile_sha(p).encode() for p in stocks)).hexdigest()
    cal = canon_sha(json.loads((data / "calibration.json").read_text(encoding="utf-8")))
    return {"stockProfiles": len(stocks), "stockProfilesSha256": combined, "calibrationSha256": cal}


def main() -> int:
    data = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DATA
    want = json.loads(MANIFEST.read_text(encoding="utf-8"))["outputs"]
    got = compute(data)
    bad = [k for k in got if want.get(k) != got[k]]
    if bad:
        print("DATA VERIFY FAILED: public/data does not match docs/DATA_MANIFEST.json", file=sys.stderr)
        for k in bad:
            print(f"  {k}: manifest {want.get(k)} but recomputed {got[k]}", file=sys.stderr)
        print("If the change is intended, run: python scripts/manifest.py", file=sys.stderr)
        return 1
    print(f"data verify OK: {got['stockProfiles']} profiles, stockProfilesSha256 {got['stockProfilesSha256'][:16]}..., calibrationSha256 {got['calibrationSha256'][:16]}...")
    return 0


if __name__ == "__main__":
    sys.exit(main())
