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

Worker mode (tools/pc-worker runs these; dry run unless --apply):
  python3 apply_metadata.py --json --propose [--ids f.json] [--only-missing] [--limit N] [--resume f.json]
      library.fetch_metadata: cleans titles/artists and checks iTunes, prints one proposal per song. Changes nothing.
  python3 apply_metadata.py --json --plan plan.json [--apply]
      library.apply / library.undo: plan = [{"songId": "12", "fields": [{"field": "title", "new": "...", "undoOf"?: "..."}]}].
      Before each change it asks the worker, which records it in libraryChanges first.
"""
import argparse, csv, json, os, sys, time, urllib.request
import azlib

BASE = os.environ.get("AZURACAST_URL", "https://a12.asurahosting.com").rstrip("/")
STATION = os.environ.get("AZURACAST_STATION", "babson_radio")
FIELDS = ("artist", "title", "album")

def call(method, path, body=None):
    return azlib.request(method, f"file/{path}", body)


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
    ap.add_argument("--propose", action="store_true", help="worker mode: propose cleaned tags (changes nothing)")
    ap.add_argument("--only-missing", action="store_true", help="worker mode: only songs with missing or messy tags")
    azlib.add_worker_args(ap)
    a = ap.parse_args()
    if a.json:
        return worker(a)

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
            except Exception as e:
                failed.append((r["path"], str(e)))
                print(f"  failed: {r['path']} -> {e}")
            if n % 10 == 0:
                print(f"  ...{n}/{len(todo)}")
            time.sleep(0.2)
    print(f"\nChanged {done} songs, {skipped} already done, {len(failed)} failed. Old values are in metadata_backup.csv.")


# ── worker mode ──
def worker(a):
    run = azlib.Run(a)
    if a.propose:
        return propose(run, a.only_missing)
    if a.plan:
        return apply_plan(run)
    sys.exit("Worker mode needs --propose or --plan.")


def propose(run, only_missing):
    songs = [m for m in azlib.list_songs() if run.wanted(m.get("id"))]
    if only_missing:
        songs = [m for m in songs if azlib.has_junk(azlib.tags(m)) or not (m.get("album") or "").strip()]
    if run.limit:
        songs = songs[: run.limit]
    total = len(songs)
    run.progress(0, total, f"{total} songs to check")
    for n, m in enumerate(songs, 1):
        sid = str(m.get("id"))
        cur = azlib.tags(m)
        if not run.next(n, total, sid, f"{cur['artist']} - {cur['title']}"):
            continue
        try:
            rules = azlib.clean_tags(cur)
            proposed, confidence, source = dict(rules), 0.5, "rules"
            if rules["artist"] and rules["title"]:
                try:
                    hit = azlib.itunes_match(rules["artist"], rules["title"])
                except Exception as e:      # lookup down or offline: the clean-up rules alone still help
                    run.say(f"iTunes lookup failed for {sid}: {e}")
                    hit = None
                if hit and hit[1] >= 0.75:
                    proposed, confidence, source = hit[0], hit[1], "itunes"
                    if not proposed.get("album"):
                        proposed["album"] = rules["album"]
            changed = any(proposed[f] != cur[f] for f in FIELDS if proposed.get(f))
            if changed:
                run.result({"id": sid, "current": cur, "proposed": {**proposed, "confidence": confidence, "source": source}})
            run.ok(sid)
        except Exception as e:
            run.fail(sid, e)
        run.progress(n, total)
    run.finish()


def apply_plan(run):
    items = run.plan()
    total = len(items)
    for n, item in enumerate(items, 1):
        sid = str(item["songId"])
        # resume key: an undo item by the change it reverses (one song can have several), an apply item by its song
        key = str(next((f.get("undoOf") for f in item.get("fields") or [] if isinstance(f, dict) and f.get("undoOf")), None) or sid)
        if not run.wanted(key):
            continue
        if not run.next(n, total, sid):
            continue
        try:
            cur = azlib.tags(call("GET", sid))
            changes = []
            for f in item.get("fields") or []:
                field = f.get("field")
                if field not in FIELDS or not isinstance(f.get("new"), str):
                    continue
                if cur[field] != f["new"]:
                    changes.append({"field": field, "old": cur[field], "new": f["new"], **({"undoOf": f["undoOf"]} if f.get("undoOf") else {})})
            if not changes:
                run.ok(key); continue
            if run.change(sid, changes):
                call("PUT", sid, {c["field"]: c["new"] for c in changes})
                chk = azlib.tags(call("GET", sid))
                if any(chk[c["field"]] != c["new"] for c in changes):
                    raise RuntimeError("AzuraCast said OK but did not change it")
                run.emit({"t": "applied", "id": sid})
            run.ok(key)
        except Exception as e:
            run.fail(sid, e)
        run.progress(n, total)
    run.finish()


main()
