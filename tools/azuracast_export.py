#!/usr/bin/env python3
"""Read-only: saves your AzuraCast media library so song titles/artists can be cleaned. Nothing is changed in AzuraCast.
  export AZURACAST_API_KEY="<id>:<secret>"      (AzuraCast > your profile > API Keys; needs media read access)
  python3 tools/azuracast_export.py                       writes azuracast_library.csv
  python3 tools/azuracast_export.py --json --out lib.json  worker mode (library.scan): saves a JSON snapshot, prints a summary
Optional: AZURACAST_URL (default https://a12.asurahosting.com), AZURACAST_STATION (default babson_radio)
"""
import argparse, csv, json, os
import azlib


def snapshot_row(m):
    links = m.get("links") or {}
    return {
        "id": str(m.get("id")), "uniqueId": m.get("unique_id") or "", "path": m.get("path") or "",
        **azlib.tags(m), "length": m.get("length") or 0,
        "hasArt": bool(m.get("art_updated_at")), "amplify": m.get("amplify"),
        "uploadedAt": m.get("uploaded_at") or m.get("mtime") or 0,
        "playlists": [p.get("name", "") for p in (m.get("playlists") or []) if isinstance(p, dict)],
        "download": links.get("download") or links.get("play") or "",
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", help="worker mode: where to save the JSON snapshot")
    azlib.add_worker_args(ap)
    a = ap.parse_args()
    run = azlib.Run(a)

    items = azlib.list_songs()
    if not run.json:
        with open("azuracast_library.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["id", "unique_id", "path", "title", "artist", "album", "genre", "art", "length"])
            for m in items:
                w.writerow([m.get("id"), m.get("unique_id"), m.get("path"), m.get("title"), m.get("artist"),
                            m.get("album"), m.get("genre"), m.get("art"), m.get("length")])
        print(f"Saved {len(items)} songs to azuracast_library.csv")
        return

    rows = [snapshot_row(m) for m in items]
    if run.limit:
        rows = rows[: run.limit]
    if a.out:
        tmp = a.out + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"songs": rows}, f, ensure_ascii=False)
        os.replace(tmp, a.out)
    run.progress(len(rows), len(rows), f"{len(rows)} songs")
    run.ok_count = len(rows)
    ids = [int(r["id"]) for r in rows if r["id"].isdigit()]
    run.finish(
        count=len(items), maxId=max(ids) if ids else 0,
        missingArt=sum(1 for r in rows if not r["hasArt"]),
        missingTags=sum(1 for r in rows if not r["artist"] or not r["title"]),
    )


main()
