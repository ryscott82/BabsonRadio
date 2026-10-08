#!/usr/bin/env python3
"""Finds each song's tempo (BPM) and where its first beat lands, so the iOS app can pulse in time.

Results go into babsonsound-web/data/beats.json (keyed by artist + title). Commit and push it and the site
passes the tempo to the app. Nothing is written to AzuraCast, so no custom field is needed.
Run it AFTER the metadata fix, so artist and title match what AzuraCast reports on air.

One-time setup:
  1. brew install ffmpeg          (if you don't have it)
  2. pip3 install numpy librosa   (use: pip3 install --break-system-packages numpy librosa  if pip complains)
  3. export AZURACAST_API_KEY="<id>:<secret>"

Run:
  python3 tools/analyze_beats.py                  dry run on 3 songs: shows tempos, saves nothing
  python3 tools/analyze_beats.py --apply          analyze every song not in beats.json yet and save it
  python3 tools/analyze_beats.py --apply --redo   re-analyze songs that are already saved
  python3 tools/analyze_beats.py --apply --limit 10   only the first 10
Safe to stop and run again: songs already saved are skipped. Add --apply, then git add / commit / push beats.json.
Optional: AZURACAST_URL (default https://a12.asurahosting.com), AZURACAST_STATION (default babson_radio)
"""
import argparse, csv, json, os, re, subprocess, sys, tempfile, time, unicodedata, urllib.request

BASE = os.environ.get("AZURACAST_URL", "https://a12.asurahosting.com").rstrip("/")
STATION = os.environ.get("AZURACAST_STATION", "babson_radio")
SR = 22050
SECONDS = 180          # analyze the first 3 minutes of each song
BEATS_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "babsonsound-web", "data", "beats.json")


def song_key(artist, title):
    """Same recipe as lib/server/beats.ts: lowercase letters and digits only, accents dropped."""
    def n(x):
        x = unicodedata.normalize("NFKD", x or "").encode("ascii", "ignore").decode().lower()
        return re.sub(r"[^a-z0-9]+", "", x)
    return f"{n(artist)}|{n(title)}"


def api(method, path, body=None, raw=False):
    key = os.environ.get("AZURACAST_API_KEY") or os.environ.get("AZURACAST_KEY") or ""
    if not key:
        sys.exit("Set AZURACAST_API_KEY first (see the top of this file).")
    url = path if path.startswith("http") else f"{BASE}/api/station/{STATION}/{path}"
    req = urllib.request.Request(url, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"X-API-Key": key, "Accept": "application/json", "Content-Type": "application/json",
                 "User-Agent": "babson-radio-beats/1.0"})
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


def decode(audio_bytes):
    import numpy as np
    with tempfile.NamedTemporaryFile(suffix=".audio") as tmp:
        tmp.write(audio_bytes); tmp.flush()
        out = subprocess.run(["ffmpeg", "-v", "error", "-t", str(SECONDS), "-i", tmp.name,
                              "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                             capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype="float32")


def analyze(y):
    """Returns (bpm, first_beat_seconds) or None when there is no steady beat."""
    import numpy as np, librosa
    if len(y) < SR * 8:
        return None
    HOP = 256   # finer time resolution than the default
    onset = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    fps = SR / HOP
    env = (onset - onset.mean()) / (onset.std() + 1e-9)
    tgrid = np.arange(len(env)) / fps
    end = tgrid[-1] - 1.0

    def score(b, ph):
        pos = np.arange(ph, end, 60.0 / b)
        return float(np.interp(pos, tgrid, env).mean()) if len(pos) > 8 else -9

    def refine(b0):
        # A 1% tempo error would drift half a beat in 25 seconds, so search finely around the guess for the
        # tempo + first-beat position whose beat grid lines up best with the onsets.
        best = (-9, b0, 0.0)
        for b in np.arange(b0 * 0.97, b0 * 1.03, 0.02):
            per = 60.0 / b
            for ph in np.arange(0, per, per / 24):
                sc = score(b, ph)
                if sc > best[0]: best = (sc, b, ph)
        _, b, first = best
        per = 60.0 / b
        for ph in np.arange(first - per / 24, first + per / 24, per / 240):   # polish the position
            sc = score(b, ph % per)
            if sc > best[0]: best = (sc, b, ph % per)
        return best

    results = []
    for start in (90, 120, 150):   # different starting guesses so one bad guess can't win
        tempo, frames = librosa.beat.beat_track(onset_envelope=onset, sr=SR, hop_length=HOP, start_bpm=start, tightness=120)
        b0 = float(np.atleast_1d(tempo)[0])
        if b0 <= 0 or len(frames) < 8:
            continue
        while b0 < 70: b0 *= 2          # fold half/double-time guesses into a danceable range
        while b0 > 175: b0 /= 2
        results.append(refine(b0))
    if not results:
        return None
    sc, bpm, first = max(results)
    if sc < 1.0:                       # onsets do not line up with any steady grid (talk, ambient, noise)
        return None
    return round(float(bpm), 2), round(float(first), 3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="save results to AzuraCast")
    ap.add_argument("--limit", type=int, default=0, help="only do this many songs (default 3 on a dry run)")
    ap.add_argument("--redo", action="store_true", help="also re-analyze songs that already have a beat")
    a = ap.parse_args()
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        import numpy, librosa  # noqa: F401
    except Exception as e:
        sys.exit(f"Missing a tool ({e}). See the setup lines at the top of this file.")

    try:
        beats = json.load(open(BEATS_JSON))
    except Exception:
        beats = {}
    songs = list_songs()
    todo = []
    for m in songs:
        k = song_key(m.get("artist"), m.get("title"))
        if k.endswith("|"):
            continue
        if a.redo or k not in beats:
            todo.append((k, m))
    limit = a.limit or (0 if a.apply else 3)
    if limit:
        todo = todo[:limit]
    print(f"{len(songs)} songs in the library, {len(beats)} already saved, {len(todo)} to analyze.\n")

    done = failed = 0
    for n, (k, m) in enumerate(todo, 1):
        name = m.get("path") or m.get("id")
        try:
            dl = (m.get("links") or {}).get("download") or (m.get("links") or {}).get("play") or f"file/{m['id']}/play"
            res = analyze(decode(api("GET", dl, raw=True)))
            if not res:
                print(f"[{n}/{len(todo)}] {name}: no steady beat found, skipped"); continue
            bpm, first = res
            print(f"[{n}/{len(todo)}] {name}: {bpm} BPM, first beat at {first}s")
            beats[k] = [bpm, first]
            done += 1
            if a.apply and done % 5 == 0:
                save(beats)
        except Exception as e:
            failed += 1
            print(f"[{n}/{len(todo)}] {name}: failed -> {e}")
        time.sleep(0.2)
    if a.apply:
        save(beats)
    print(f"\nAnalyzed {done}, failed {failed}." + (f" Saved to {os.path.normpath(BEATS_JSON)}. Commit and push it." if a.apply else " Dry run: nothing saved. Add --apply to save."))


def save(beats):
    os.makedirs(os.path.dirname(BEATS_JSON), exist_ok=True)
    with open(BEATS_JSON, "w") as f:
        json.dump(dict(sorted(beats.items())), f, indent=0)


main()
