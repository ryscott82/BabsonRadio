"""Shared helpers for the library tools (azuracast_export, apply_metadata, fetch_album_art, analyze_beats, normalize_loudness).

- AzuraCast calls go through one throttle (about 1 per second, AZ_MIN_INTERVAL) and retry with back-off on 429 and 5xx.
- Worker mode (--json): the tool prints one JSON object per line on stdout and, before every song and every change, waits for the
  studio PC worker (tools/pc-worker) to answer on stdin: "go", "skip" or "stop". That is how the worker pauses for live shows,
  cancels jobs, and records each AzuraCast change in libraryChanges BEFORE the tool makes it.
- Without --json the tools keep their old, human-readable behaviour.
Nothing here reads WORKER_SECRET; the tools only ever see the AzuraCast settings.
"""
import json, os, re, sys, tempfile, time, unicodedata, urllib.error, urllib.parse, urllib.request

BASE = os.environ.get("AZURACAST_URL", "https://a12.asurahosting.com").rstrip("/")
STATION = os.environ.get("AZURACAST_STATION", "babson_radio")
MIN_INTERVAL = float(os.environ.get("AZ_MIN_INTERVAL", "1.0"))
MAX_TRIES = 6
STOP_AFTER_FAILURES = 20
UA = "babson-radio-tools/2"
ID_RE = re.compile(r"^[A-Za-z0-9-]{1,64}$")


def api_key():
    k = os.environ.get("AZURACAST_API_KEY") or os.environ.get("AZURACAST_KEY") or ""
    if not k:
        sys.exit("Set AZURACAST_API_KEY first (see the top of the tool you ran).")
    return k


class HttpFail(Exception):
    def __init__(self, code, msg):
        super().__init__(f"HTTP {code} {msg}".strip())
        self.code = code


_last_call = [0.0]


def _wait_turn():
    gap = MIN_INTERVAL - (time.monotonic() - _last_call[0])
    if gap > 0:
        time.sleep(gap)
    _last_call[0] = time.monotonic()


def request(method, path, body=None, raw=False, data=None, headers=None, timeout=120):
    """One AzuraCast call. path is relative to /api/station/<station>/ unless it starts with http or /api/.
    Retries 429 and 5xx (and network errors) with back-off, honouring Retry-After. Raises HttpFail when it gives up."""
    if path.startswith("http"):
        url = path
    elif path.startswith("/api/"):
        url = f"{BASE}{path}"
    else:
        url = f"{BASE}/api/station/{STATION}/{path}"
    if body is not None:
        data = json.dumps(body).encode()
        headers = {"Content-Type": "application/json", **(headers or {})}
    hdrs = {"X-API-Key": api_key(), "Accept": "application/json", "User-Agent": UA, **(headers or {})}
    delay = 2.0
    for attempt in range(1, MAX_TRIES + 1):
        _wait_turn()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, method=method, data=data, headers=hdrs), timeout=timeout) as r:
                out = r.read()
                return out if raw else (json.loads(out) if out else {})
        except urllib.error.HTTPError as e:
            msg = e.read()[:200].decode("utf-8", "replace")
            if e.code == 429 or e.code >= 500:
                if attempt == MAX_TRIES:
                    raise HttpFail(e.code, msg)
                ra = e.headers.get("Retry-After") if e.headers else None
                time.sleep(min(60.0, float(ra)) if ra and ra.isdigit() else delay)
                delay = min(60.0, delay * 2)
                continue
            raise HttpFail(e.code, msg)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if attempt == MAX_TRIES:
                raise HttpFail(0, str(e))
            time.sleep(delay)
            delay = min(60.0, delay * 2)


def list_songs():
    """Every media file in the station (500 per page)."""
    items, page = [], 1
    while True:
        data = request("GET", f"files?page={page}&per_page=500")
        rows = data if isinstance(data, list) else data.get("rows") or data.get("data") or []
        items += rows
        if isinstance(data, list) or len(rows) < 500 or page > 200:
            return items
        page += 1


def download_temp(m, suffix=".audio"):
    """Downloads a song to a temporary file and returns its path. The caller deletes it.
    (A file that is still open can't be read by ffmpeg on Windows, so the file is closed first.)"""
    links = m.get("links") or {}
    dl = links.get("download") or links.get("play") or f"file/{m['id']}/play"
    blob = request("GET", dl, raw=True, timeout=300)
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "wb") as f:
        f.write(blob)
    return path


def remove(path):
    try:
        os.remove(path)
    except OSError:
        pass


def tags(m):
    return {"title": (m.get("title") or "").strip(), "artist": (m.get("artist") or "").strip(), "album": (m.get("album") or "").strip()}


def norm(x):
    """Letters and digits only, lowercase, accents dropped (same recipe as lib/worker.ts and lib/server/beats.ts)."""
    x = unicodedata.normalize("NFKD", x or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", x)


def song_key(artist, title):
    return f"{norm(artist)}|{norm(title)}"


# ── outside lookups (iTunes, then Deezer; both free, no key). iTunes allows about 20 searches a minute. ──
_last_lookup = [0.0]


def web_json(url, binary=False, timeout=25):
    gap = 3.2 - (time.monotonic() - _last_lookup[0])
    if gap > 0:
        time.sleep(gap)
    _last_lookup[0] = time.monotonic()
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout) as r:
        return r.read() if binary else json.load(r)


def first_artist(artist):
    return re.split(r",|&| feat\.? | ft\.? | x | with ", artist or "", maxsplit=1, flags=re.I)[0].strip().lower()


def clean_title(t):
    return re.sub(r"\(.*?\)|\[.*?\]", "", t or "").strip()


# ── worker protocol ──
class Run:
    """Common flags and the JSON-line conversation with the worker.
    --json        talk to the worker (one JSON object per line out, "go"/"skip"/"stop" lines in)
    --limit N     only this many songs
    --resume F    a JSON file of song ids already done; they are skipped and new ones are added as they finish
    --ids F       a JSON list of song ids to limit the run to
    --plan F      a JSON list of changes to make (apply and undo)
    --apply       actually change AzuraCast (default: dry run, nothing changes)"""

    def __init__(self, args):
        self.json = bool(getattr(args, "json", False))
        self.limit = int(getattr(args, "limit", 0) or 0)
        self.apply = bool(getattr(args, "apply", False))
        self.resume_path = getattr(args, "resume", None)
        self.done_ids = set()
        if self.resume_path and os.path.exists(self.resume_path):
            try:
                self.done_ids = set(map(str, json.load(open(self.resume_path, encoding="utf-8"))))
            except Exception:
                self.done_ids = set()
        self.only_ids = None
        ids_path = getattr(args, "ids", None)
        if ids_path:
            ids = json.load(open(ids_path, encoding="utf-8"))
            self.only_ids = {str(i) for i in ids if ID_RE.match(str(i))}
        self.plan_path = getattr(args, "plan", None)
        self.failures_in_a_row = 0
        self.ok_count = 0
        self.fail_count = 0

    # output
    def emit(self, obj):
        if self.json:
            sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
            sys.stdout.flush()

    def say(self, text):
        """Human text: printed normally, or sent as a log line in worker mode."""
        if self.json:
            self.emit({"t": "log", "msg": str(text)[:500]})
        else:
            print(text, flush=True)

    def _ask(self):
        line = sys.stdin.readline()
        if not line:          # the worker went away: stop cleanly
            self.finish(stopped=True)
        return line.strip()

    def next(self, i, total, song_id, name=""):
        """Before each song. In worker mode, waits for permission (the worker holds it during live shows)."""
        if not self.json:
            return True
        self.emit({"t": "next", "i": i, "total": total, "id": str(song_id), "name": str(name)[:200]})
        a = self._ask()
        if a == "stop":
            self.finish(stopped=True)
        return a == "go"

    def change(self, song_id, changes, **extra):
        """Before each AzuraCast change. In worker mode the worker records it in libraryChanges and answers go/skip/stop.
        changes: [{field, old, new}]. Returns True when the change may be made."""
        if not self.apply:
            self.emit({"t": "would", "id": str(song_id), "changes": changes, **extra})
            return False
        if not self.json:
            return True
        self.emit({"t": "change", "id": str(song_id), "changes": changes, **extra})
        a = self._ask()
        if a == "stop":
            self.finish(stopped=True)
        return a == "go"

    def result(self, obj):
        self.emit({"t": "result", **obj})

    def progress(self, done, total, note=""):
        self.emit({"t": "progress", "done": done, "total": total, "note": note})

    # bookkeeping
    def wanted(self, song_id):
        s = str(song_id)
        return (self.only_ids is None or s in self.only_ids) and s not in self.done_ids

    def ok(self, song_id):
        self.failures_in_a_row = 0
        self.ok_count += 1
        self.mark(song_id)

    def mark(self, song_id):
        self.done_ids.add(str(song_id))
        if self.resume_path:
            tmp = self.resume_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(sorted(self.done_ids), f)
            os.replace(tmp, self.resume_path)

    def fail(self, song_id, err):
        self.failures_in_a_row += 1
        self.fail_count += 1
        self.emit({"t": "error", "id": str(song_id), "msg": str(err)[:300]})
        if not self.json:
            print(f"  failed: {song_id} -> {err}", flush=True)
        if self.failures_in_a_row >= STOP_AFTER_FAILURES:
            self.emit({"t": "abort", "msg": f"{STOP_AFTER_FAILURES} failures in a row"})
            if not self.json:
                print(f"Stopping: {STOP_AFTER_FAILURES} failures in a row.")
            sys.exit(3)

    def plan(self):
        if not self.plan_path:
            sys.exit("--plan is required for this mode.")
        items = json.load(open(self.plan_path, encoding="utf-8"))
        out = [p for p in items if isinstance(p, dict) and ID_RE.match(str(p.get("songId", "")))]
        return out[: self.limit] if self.limit else out

    def finish(self, stopped=False, **summary):
        self.emit({"t": "done", "ok": self.ok_count, "failed": self.fail_count, "stopped": stopped, "dryRun": not self.apply, **summary})
        sys.exit(0)


def add_worker_args(ap):
    ap.add_argument("--json", action="store_true", help="worker mode: JSON lines out, go/skip/stop in")
    ap.add_argument("--resume", help="JSON file of finished song ids (skipped, and updated as songs finish)")
    ap.add_argument("--ids", help="JSON file with the song ids to do")
    ap.add_argument("--plan", help="JSON file with the changes to make")


# ── metadata clean-up and matching ──
import difflib

JUNK = re.compile(r"\s*[\(\[](?:official\s*(?:music\s*)?(?:video|audio|visuali[sz]er|lyric video)|lyrics?(?:\s*video)?|audio|hd|hq|4k|"
                  r"visuali[sz]er|explicit|clean(?:\s*version)?|radio edit)[\)\]]\s*", re.I)


def tidy(s):
    return re.sub(r"\s+", " ", (s or "").replace("’", "'")).strip()


def clean_tags(t):
    """Rule-based clean-up: junk like "(Official Video)" off titles, " - Topic" off artists, "Artist - Title" split when artist is empty."""
    title, artist, album = tidy(t["title"]), tidy(t["artist"]), tidy(t["album"])
    if not artist and " - " in title:
        artist, title = [x.strip() for x in title.split(" - ", 1)]
    artist = re.sub(r"\s+-\s+topic$", "", artist, flags=re.I)
    title = tidy(JUNK.sub(" ", title))
    return {"title": title, "artist": artist, "album": album}


def has_junk(t):
    return bool(JUNK.search(t["title"] or "")) or not t["artist"] or not t["title"] or re.search(r"-\s*topic$", t["artist"] or "", re.I) is not None


def sim(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def itunes_match(artist, title):
    """Best iTunes song for artist + title: (tags, confidence 0..1, artUrl) or None."""
    q = urllib.parse.urlencode({"term": f"{artist} {clean_title(title)}", "media": "music", "entity": "song", "limit": 8})
    best = None
    for hit in web_json(f"https://itunes.apple.com/search?{q}").get("results", []):
        a, t = hit.get("artistName", ""), hit.get("trackName", "")
        score = 0.45 * sim(first_artist(artist), first_artist(a)) + 0.55 * sim(clean_title(title), clean_title(t))
        if not best or score > best[1]:
            art = (hit.get("artworkUrl100") or "").replace("100x100bb", "600x600bb")
            best = ({"title": t, "artist": a, "album": hit.get("collectionName", "")}, round(score, 3), art)
    return best
