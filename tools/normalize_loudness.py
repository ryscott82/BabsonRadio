#!/usr/bin/env python3
"""Evens out song loudness at the source, so every song comes out of the stream at about the same volume.

Why here and not in the app: listeners hear ONE continuous stream, so the apps can't tell where a song starts or how loud
it was recorded. The fix that works for every listener (website, iOS, anyone's own player) is to set a gain per song in
AzuraCast. This script measures each song's loudness (EBU R128, the broadcast standard) and sets AzuraCast's per-song
"Amplify" value to bring it to the target, without letting the peaks clip.

One-time setup:
  1. brew install ffmpeg          (if you don't have it)
  2. export AZURACAST_API_KEY="<id>:<secret>"

Run:
  python3 tools/normalize_loudness.py                 dry run on 5 songs: shows each song's loudness and the gain it would get
  python3 tools/normalize_loudness.py --limit 1 --apply   change ONE song, then check it in AzuraCast (Media > the song > Amplify)
  python3 tools/normalize_loudness.py --apply         measure and set every song (saves progress in tools/loudness.json, safe to stop and rerun)
  python3 tools/normalize_loudness.py --target -16    pick a different target (default -14 LUFS, like most streaming)
  python3 tools/normalize_loudness.py --apply --redo  measure again and re-set songs that were already done
Optional: AZURACAST_URL (default https://a12.asurahosting.com), AZURACAST_STATION (default babson_radio)

Do not also turn on ReplayGain in AzuraCast: the two would add up.
"""
import argparse, json, os, re, subprocess, sys, tempfile, time, urllib.request

BASE = os.environ.get("AZURACAST_URL", "https://a12.asurahosting.com").rstrip("/")
STATION = os.environ.get("AZURACAST_STATION", "babson_radio")
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "loudness.json")
TP_CEILING = -1.5      # dBTP: after the gain, no peak may go above this (leaves room for MP3 encoding)
MAX_GAIN = 12.0        # never move a song by more than this many dB


def api(method, path, body=None, raw=False):
    key = os.environ.get("AZURACAST_API_KEY") or os.environ.get("AZURACAST_KEY") or ""
    if not key:
        sys.exit("Set AZURACAST_API_KEY first (see the top of this file).")
    url = path if path.startswith("http") else f"{BASE}/api/station/{STATION}/{path}"
    req = urllib.request.Request(url, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"X-API-Key": key, "Accept": "application/json", "Content-Type": "application/json",
                 "User-Agent": "babson-radio-loudness/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read() if raw else json.load(r)


def list_songs():
    items, page = [], 1
    while True:
        data = api("GET", f"files?page={page}&per_page=500")
        rows = data if isinstance(data, list) else data.get("rows") or data.get("data") or []
        items += rows
        if isinstance(data, list) or len(rows) < 500 or page > 200:
            return items
        page += 1


def measure(path):
    """Integrated loudness (LUFS) and true peak (dBTP) of an audio file, with ffmpeg's EBU R128 meter."""
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "loudnorm=print_format=json", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", out, re.S)
    if not m:
        return None
    d = json.loads(m.group(0))
    lufs, tp = float(d["input_i"]), float(d["input_tp"])
    if lufs == float("-inf") or lufs < -69:   # silence
        return None
    return lufs, tp


def gain_for(lufs, tp, target):
    """dB to add: reach the target, but never push the loudest peak above the ceiling."""
    g = min(target - lufs, TP_CEILING - tp)
    return round(max(-MAX_GAIN, min(MAX_GAIN, g)), 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="set the gain in AzuraCast")
    ap.add_argument("--limit", type=int, default=0, help="only do this many songs (default 5 on a dry run)")
    ap.add_argument("--redo", action="store_true", help="measure and set songs that are already done too")
    ap.add_argument("--target", type=float, default=-14.0, help="loudness to aim for, in LUFS (default -14)")
    a = ap.parse_args()
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    except Exception:
        sys.exit("ffmpeg is missing. See the setup lines at the top of this file.")
    try:
        cache = json.load(open(CACHE))
    except Exception:
        cache = {}

    songs = list_songs()
    todo = [m for m in songs if a.redo or str(m["id"]) not in cache or (a.apply and not cache[str(m["id"])].get("applied"))]
    limit = a.limit or (0 if a.apply else 5)
    if limit:
        todo = todo[:limit]
    print(f"{len(songs)} songs in the library, {len(cache)} measured, {len(todo)} to do. Target {a.target} LUFS.\n")

    done = failed = 0
    for n, m in enumerate(todo, 1):
        sid, name = str(m["id"]), m.get("path") or m.get("id")
        try:
            rec = cache.get(sid)
            if not rec or a.redo:
                dl = (m.get("links") or {}).get("download") or (m.get("links") or {}).get("play") or f"file/{m['id']}/play"
                with tempfile.NamedTemporaryFile(suffix=".audio") as tmp:
                    tmp.write(api("GET", dl, raw=True)); tmp.flush()
                    res = measure(tmp.name)
                if not res:
                    print(f"[{n}/{len(todo)}] {name}: could not measure (silent or unreadable), skipped"); continue
                rec = {"lufs": res[0], "tp": res[1]}
            rec["gain"] = gain_for(rec["lufs"], rec["tp"], a.target)
            note = " (limited by peaks)" if a.target - rec["lufs"] > rec["gain"] + 0.01 else ""
            print(f"[{n}/{len(todo)}] {name}: {rec['lufs']:.1f} LUFS, peak {rec['tp']:.1f} dBTP -> gain {rec['gain']:+.2f} dB{note}")
            if a.apply:
                api("PUT", f"file/{m['id']}", {"amplify": rec["gain"]})
                rec["applied"] = True
            cache[sid] = rec
            done += 1
            if a.apply and done % 5 == 0:
                json.dump(cache, open(CACHE, "w"), indent=0)
        except Exception as e:
            failed += 1
            print(f"[{n}/{len(todo)}] {name}: failed -> {e}")
        time.sleep(0.2)
    if a.apply or cache:
        json.dump(cache, open(CACHE, "w"), indent=0)
    print(f"\nDone {done}, failed {failed}." + ("" if a.apply else " Dry run: nothing changed in AzuraCast. Add --apply to set the gains."))


main()
