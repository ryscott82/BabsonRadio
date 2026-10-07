#!/usr/bin/env python3
"""Read-only: saves your AzuraCast media library to a CSV so song titles/artists can be cleaned.
Nothing is changed in AzuraCast.

  export AZURACAST_API_KEY="<id>:<secret>"      (AzuraCast > your profile > API Keys; needs media read access)
  python3 tools/azuracast_export.py
Optional: AZURACAST_URL (default https://a12.asurahosting.com), AZURACAST_STATION (default babson_radio)
"""
import csv, json, os, sys, urllib.request

base = os.environ.get("AZURACAST_URL", "https://a12.asurahosting.com").rstrip("/")
station = os.environ.get("AZURACAST_STATION", "babson_radio")
key = os.environ.get("AZURACAST_API_KEY", "")
if not key:
    sys.exit("Set AZURACAST_API_KEY first (see the top of this file).")

def get(url):
    req = urllib.request.Request(url, headers={"X-API-Key": key, "Accept": "application/json", "User-Agent": "babson-radio-export/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

items, page = [], 1
while True:
    data = get(f"{base}/api/station/{station}/files?page={page}&per_page=500")
    rows = data if isinstance(data, list) else data.get("rows") or data.get("data") or []
    items += rows
    if isinstance(data, list) or len(rows) < 500 or page > 200:
        break
    page += 1

with open("azuracast_library.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["id", "unique_id", "path", "title", "artist", "album", "genre", "art", "length"])
    for m in items:
        w.writerow([m.get("id"), m.get("unique_id"), m.get("path"), m.get("title"), m.get("artist"),
                    m.get("album"), m.get("genre"), m.get("art"), m.get("length")])
print(f"Saved {len(items)} songs to azuracast_library.csv")
