#!/usr/bin/env python3
"""Apply the cleaned artist / title / album from metadata_cleanup.csv to AzuraCast.

Run on your own computer. Default is a DRY RUN: it only prints what would change (no key, no network).
  python3 apply_metadata.py                      # dry run: shows every change
  export AZURACAST_API_KEY="<id>:<secret>"       # never paste this into chat (AZURACAST_KEY also works)
  python3 apply_metadata.py --apply --limit 3    # change 3 songs, then check them in AzuraCast
  python3 apply_metadata.py --apply              # change them all

Before any change it saves each song's CURRENT values to metadata_backup.csv, so you can undo with:
  python3 apply_metadata.py --restore metadata_backup.csv --apply
Rows marked needs_review in the CSV are skipped unless you pass --include-review.
Optional: AZURACAST_URL (default https://a12.asurahosting.com), AZURACAST_STATION (default babson_radio)
"""
import argparse, csv, json, os, sys, time, urllib.request

BASE = os.environ.get("AZURACAST_URL", "https://a12.asurahosting.com").rstrip("/")
STATION = os.environ.get("AZURACAST_STATION", "babson_radio")
FIELDS = ("artist", "title", "album")

def call(method, path, body=None):
    key = os.environ.get("AZURACAST_API_KEY") or os.environ.get("AZURACAST_KEY") or ""
    if not key:
        sys.exit("Set AZURACAST_API_KEY first (see the top of this file).")
    req = urllib.request.Request(f"{BASE}/api/station/{STATION}/file/{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"X-API-Key": key, "Accept": "application/json", "Content-Type": "application/json", "User-Agent": "babson-radio-metadata/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def planned(rows, include_review):
    out = []
    for r in rows:
        if r.get("needs_review", "").strip() and not include_review:
            continue
        change = {}
        for f in FIELDS:
            new, old = (r.get(f"new_{f}") or "").strip(), (r.get(f"old_{f}") or "").strip()
            if new and new != old:
                change[f] = new
        if change:
            out.append((r, change))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "metadata_cleanup.csv"))
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--include-review", action="store_true")
    ap.add_argument("--restore", help="a metadata_backup.csv to put back")
    a = ap.parse_args()

    if a.restore:
        with open(a.restore, newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        print(f"{len(rows)} songs in the backup.")
        if not a.apply:
            print("Dry run. Add --apply to put them back."); return
        for r in rows:
            call("PUT", r["id"], {f: r[f] for f in FIELDS}); time.sleep(0.2)
        print("Restored."); return

    with open(a.csv, newline="", encoding="utf-8") as f:
        todo = planned(list(csv.DictReader(f)), a.include_review)
    if a.limit:
        todo = todo[:a.limit]
    print(f"{len(todo)} songs would change.\n")
    for r, ch in todo:
        print(f"[{r['id']}] {r['path']}")
        for f, v in ch.items():
            print(f"    {f}: {(r.get('old_' + f) or '(empty)')!r} -> {v!r}")
    if not a.apply:
        print("\nDry run only. Nothing was changed. Add --apply (try --limit 3 first)."); return

    import urllib.error
    new_file = not os.path.exists("metadata_backup.csv")
    done = skipped = 0
    failed = []
    with open("metadata_backup.csv", "a", newline="", encoding="utf-8") as bf:
        w = csv.writer(bf)
        if new_file:
            w.writerow(["id", "path", *FIELDS])
        for n, (r, ch) in enumerate(todo, 1):
            try:
                cur = call("GET", r["id"])
                if all((cur.get(f) or "") == v for f, v in ch.items()):
                    skipped += 1; continue
                w.writerow([r["id"], r["path"], *[cur.get(f) or "" for f in FIELDS]]); bf.flush()
                call("PUT", r["id"], ch)
                chk = call("GET", r["id"])
                if all((chk.get(f) or "") == v for f, v in ch.items()):
                    done += 1
                else:
                    failed.append((r["path"], "not changed"))
                    print(f"  AzuraCast said OK but did not change: {r['path']}")
            except urllib.error.HTTPError as e:
                msg = e.read().decode("utf-8", "replace")[:300]
                failed.append((r["path"], f"HTTP {e.code} {msg}"))
                print(f"  failed: {r['path']} -> HTTP {e.code} {msg}")
            except Exception as e:
                failed.append((r["path"], str(e)))
                print(f"  failed: {r['path']} -> {e}")
            if n % 10 == 0:
                print(f"  ...{n}/{len(todo)}")
            time.sleep(0.2)
    print(f"\nChanged {done} songs, {skipped} already done, {len(failed)} failed. Old values are in metadata_backup.csv.")

main()
