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
    ap.add_argument("--csv", default="metadata_cleanup.csv")
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

    with open("metadata_backup.csv", "w", newline="", encoding="utf-8") as bf:
        w = csv.writer(bf); w.writerow(["id", "path", *FIELDS])
        done = 0
        for r, ch in todo:
            cur = call("GET", r["id"])
            w.writerow([r["id"], r["path"], *[cur.get(f) or "" for f in FIELDS]]); bf.flush()
            call("PUT", r["id"], ch)
            done += 1; time.sleep(0.2)
    print(f"\nChanged {done} songs. Old values are in metadata_backup.csv.")

main()
