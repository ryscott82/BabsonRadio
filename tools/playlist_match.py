#!/usr/bin/env python3
"""See which songs from an Apple Music playlist are already in AzuraCast, and which you still need.

Nothing is downloaded or changed. Run on your own computer.
1. In the Music app: click the playlist > File > Library > Export Playlist... > save as a Text file (.txt).
2. python3 tools/azuracast_export.py        (makes azuracast_library.csv; skip if you already have a recent one)
3. python3 tools/playlist_match.py "My Playlist.txt"
Writes playlist_match.csv (every song, with a status) and playlist_missing.csv (just the ones to get).
Optional: --folder ~/Music/ToUpload  also looks for the song in file names in that folder.
Several playlists at once:  python3 tools/playlist_match.py one.txt two.txt
"""
import argparse, csv, difflib, os, re, sys, unicodedata

SURE, MAYBE = 0.90, 0.75

def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)|\[.*?\]", " ", s)                                  # (feat. X), [Explicit]
    s = re.sub(r"\b(feat|ft|featuring)\b.*$", " ", s)
    s = re.sub(r"[-–]\s*(remaster(ed)?( \d{4})?|single version|album version|radio edit|\d{4} remaster).*$", " ", s)
    s = s.replace("&", " and ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()

def read_text(path):
    raw = open(path, "rb").read()
    for enc in (("utf-16",) if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else ()) + ("utf-8-sig", "latin-1"):
        try: return raw.decode(enc)
        except UnicodeDecodeError: pass
    return raw.decode("utf-8", "ignore")

def read_playlist(path):
    """Apple Music export (tab-separated) or a CSV with Name/Artist columns."""
    text = read_text(path)
    first = text.splitlines()[0] if text else ""
    delim = "\t" if "\t" in first else ","
    rows = list(csv.DictReader(text.splitlines(), delimiter=delim))
    out = []
    for r in rows:
        low = {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
        title = low.get("name") or low.get("title") or low.get("track name") or ""
        artist = low.get("artist") or low.get("album artist") or ""
        if title: out.append((artist, title, low.get("album", "")))
    return out

def best(cands, key):
    m, s = None, 0.0
    for c in cands:
        r = difflib.SequenceMatcher(None, key, c[0]).ratio()
        if r > s: m, s = c, r
    return m, s

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("playlists", nargs="+")
    ap.add_argument("--library", default="azuracast_library.csv")
    ap.add_argument("--folder")
    a = ap.parse_args()

    cands = []
    if os.path.exists(a.library):
        with open(a.library, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                cands.append((norm(f"{r.get('artist', '')} {r.get('title', '')}"), "AzuraCast", r.get("id", ""), r.get("path", "")))
    else:
        print(f"No {a.library} found. Run tools/azuracast_export.py first (or pass --library).", file=sys.stderr)
    if a.folder:
        for root, _, files in os.walk(os.path.expanduser(a.folder)):
            for fn in files:
                if fn.lower().endswith((".mp3", ".m4a", ".flac", ".aac", ".ogg", ".wav")):
                    cands.append((norm(os.path.splitext(fn)[0]), "folder", "", os.path.join(root, fn)))
    if not cands:
        sys.exit("Nothing to compare against.")

    results = []
    for p in a.playlists:
        for artist, title, album in read_playlist(p):
            key = norm(f"{artist} {title}")
            m, s = best(cands, key)
            if m and s >= SURE: status = f"have ({m[1]})"
            elif m and s >= MAYBE: status = f"maybe ({m[1]})"
            else: status = "missing"
            found = m is not None and status != "missing"
            results.append([os.path.basename(p), artist, title, album, status, round(s, 2) if m else "", m[2] if found else "", m[3] if found else ""])

    head = ["playlist", "artist", "title", "album", "status", "score", "azuracast_id", "found_at"]
    with open("playlist_match.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(head); w.writerows(results)
    miss = [r for r in results if r[4] == "missing"]
    with open("playlist_missing.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(head[:4]); w.writerows([r[:4] for r in miss])
    have = sum(r[4].startswith("have") for r in results); maybe = sum(r[4].startswith("maybe") for r in results)
    print(f"{len(results)} songs: {have} already there, {maybe} maybe (check these), {len(miss)} missing.")
    print("Wrote playlist_match.csv and playlist_missing.csv")

main()
