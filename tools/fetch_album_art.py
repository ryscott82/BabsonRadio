#!/usr/bin/env python3
"""Find album covers for the cleaned songs, let you check them, then upload them to AzuraCast.

Run on your own computer from anywhere (it finds metadata_cleanup.csv next to itself):
  export AZURACAST_API_KEY="<id>:<secret>"        # never paste this into chat

  python3 tools/fetch_album_art.py                 STEP 1  find covers: saves them to tools/art/, writes tools/art_report.csv. Uploads nothing.
  (open tools/art/ and delete any cover that looks wrong; the file name is the song's id)
  python3 tools/fetch_album_art.py --upload --limit 3      STEP 2  upload 3 to test, then look at them in AzuraCast
  python3 tools/fetch_album_art.py --upload                STEP 3  upload every cover left in tools/art/

Covers come from the iTunes Search API, then Deezer if iTunes has nothing (both free, no key).
Skipped: the Copyright Free playlist, songs still marked needs_review (add --include-review to include them),
and songs that already have art in AzuraCast (add --redo to replace it).
Step 3 uses the pictures already in tools/art/, so whatever you deleted stays skipped.

Worker mode (tools/pc-worker runs these; dry run unless --apply):
  python3 tools/fetch_album_art.py --json --find [--ids f.json] [--tags f.json] [--only-missing] [--limit N] [--resume f.json]
      library.fetch_art: looks up a cover for each song and prints its link as a proposal. Uploads nothing.
  python3 tools/fetch_album_art.py --json --plan plan.json [--apply]
      library.apply / library.undo: plan = [{"songId": "12", "artUrl": "https://...", "undoOf"?: "..."}] or {"restore": "backup:<file>" | null}.
      The current cover is saved to tools/art_backup/ first, so the change can be undone.
"""
import argparse, csv, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request, uuid
import azlib

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get('AZURACAST_URL', 'https://a12.asurahosting.com').rstrip('/')
STATION = os.environ.get('AZURACAST_STATION', 'babson_radio')
ART = os.path.join(HERE, 'art')
BACKUP = os.environ.get('ART_BACKUP_DIR') or os.path.join(HERE, 'art_backup')
BACKUP_RE = re.compile(r'^backup:([A-Za-z0-9-]{1,64}-\d{10,14}\.jpg)$')
MAX_ART_BYTES = 8 * 1024 * 1024
UA = {'User-Agent': 'BabsonRadio-art/2'}


def key():
    k = os.environ.get('AZURACAST_API_KEY') or os.environ.get('AZURACAST_KEY') or ''
    if not k:
        sys.exit('Set AZURACAST_API_KEY first (see the top of this file).')
    return k


def get(url, binary=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
        return r.read() if binary else json.load(r)


def first_artist(artist):
    return re.split(r',|&| feat\.? | ft\.? | x | with ', artist, maxsplit=1, flags=re.I)[0].strip().lower()


def clean_title(t):
    return re.sub(r'\(.*?\)|\[.*?\]', '', t).strip()


def from_itunes(artist, title):
    q = urllib.parse.urlencode({'term': f'{artist} {clean_title(title)}', 'media': 'music', 'entity': 'song', 'limit': 8})
    fa = first_artist(artist)
    for hit in get(f'https://itunes.apple.com/search?{q}').get('results', []):
        if fa and fa in hit.get('artistName', '').lower() and hit.get('artworkUrl100'):
            return hit['artworkUrl100'].replace('100x100bb', '600x600bb'), hit.get('collectionName', '')
    return None, ''


def from_deezer(artist, title):
    q = urllib.parse.urlencode({'q': f'artist:"{first_artist(artist)}" track:"{clean_title(title)}"', 'limit': 5})
    fa = first_artist(artist)
    for hit in get(f'https://api.deezer.com/search?{q}').get('data', []):
        alb = hit.get('album') or {}
        if fa in (hit.get('artist') or {}).get('name', '').lower() and alb.get('cover_xl'):
            return alb['cover_xl'], alb.get('title', '')
    return None, ''


def find_art(artist, title):
    for finder in (from_itunes, from_deezer):
        try:
            url, album = finder(artist, title)
        except Exception:
            continue
        if url:
            return url, album, finder.__name__.replace('from_', '')
    return None, '', ''


def az(method, path, data=None, headers=None, raw=False):
    return azlib.request(method, path, data=data, headers=headers, raw=raw, timeout=60)


def has_art_map():
    """id -> True when AzuraCast already shows art for the song."""
    out, page = {}, 1
    while True:
        data = az('GET', f'files?page={page}&per_page=500')
        rows = data if isinstance(data, list) else data.get('rows') or data.get('data') or []
        for m in rows:
            # AzuraCast always fills in an "art" link (it serves a default picture), so only art_updated_at tells us real art exists.
            out[str(m.get('id'))] = bool(m.get('art_updated_at'))
        if isinstance(data, list) or len(rows) < 500 or page > 100:
            return out
        page += 1


def upload(row, img):
    """AzuraCast's dedicated art endpoint takes a multipart form with the picture in a field called "art"."""
    boundary = '----br' + uuid.uuid4().hex
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="art"; filename="cover.jpg"\r\nContent-Type: image/jpeg\r\n\r\n').encode() \
        + img + f'\r\n--{boundary}--\r\n'.encode()
    last = None
    for ident in (row['id'], row.get('unique_id')):
        if not ident:
            continue
        try:
            az('POST', f'art/{ident}', body, {'Content-Type': f'multipart/form-data; boundary={boundary}'})
            return
        except azlib.HttpFail as e:
            last = str(e)
    raise RuntimeError(last or 'no id')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--upload', action='store_true', help='upload the covers in art/ to AzuraCast (default: just find them)')
    ap.add_argument('--limit', type=int, default=0, help='only this many songs')
    ap.add_argument('--redo', action='store_true', help='also songs that already have art in AzuraCast')
    ap.add_argument('--include-review', action='store_true', help='also songs still marked needs_review')
    ap.add_argument('--find', action='store_true', help='worker mode: look up covers and print them as proposals')
    ap.add_argument('--only-missing', action='store_true', help='worker mode: only songs without art')
    ap.add_argument('--tags', help='worker mode: JSON {songId: {artist, title}} to search with (e.g. approved metadata)')
    ap.add_argument('--apply', action='store_true', help='worker mode: really upload (default: dry run)')
    azlib.add_worker_args(ap)
    a = ap.parse_args()
    if a.json:
        return worker(a)

    os.makedirs(ART, exist_ok=True)
    rows = [r for r in csv.DictReader(open(os.path.join(HERE, 'metadata_cleanup.csv'), encoding='utf-8'))
            if r['playlist'] != 'Copyright Free' and r['new_artist'] and (a.include_review or not r.get('needs_review'))]
    have = {} if a.redo else has_art_map() if os.environ.get('AZURACAST_API_KEY') or os.environ.get('AZURACAST_KEY') else {}
    skipped = sum(1 for r in rows if have.get(r['id']))
    rows = [r for r in rows if not have.get(r['id'])]
    if skipped:
        print(f'Skipping {skipped} songs that already have art in AzuraCast (use --redo to replace them).')
    if a.limit:
        rows = rows[:a.limit]
    print(f'{len(rows)} songs to do.\n')

    out, ok = [], 0
    for n, r in enumerate(rows, 1):
        path = os.path.join(ART, f"{r['id']}.jpg")
        status, album, source = 'no match', '', ''
        try:
            if a.upload:
                # Upload step: use the picture you already approved; never search again.
                if not os.path.exists(path):
                    status = 'skipped (no picture in art/)'
                else:
                    upload(r, open(path, 'rb').read()); status = 'uploaded'; ok += 1
            else:
                if os.path.exists(path):
                    status = 'already downloaded'
                else:
                    url, album, source = find_art(r['new_artist'], r['new_title'])
                    if url:
                        open(path, 'wb').write(get(url, binary=True)); status = f'downloaded ({source})'; ok += 1
                    time.sleep(3.2)  # iTunes allows about 20 requests a minute
        except Exception as e:
            status = f'error: {e}'
        out.append({'id': r['id'], 'artist': r['new_artist'], 'title': r['new_title'], 'album': album, 'status': status})
        print(f'[{n}/{len(rows)}] {status} - {r["new_artist"]} - {r["new_title"]}', flush=True)

    if out:
        with open(os.path.join(HERE, 'art_report.csv'), 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
    misses = sum(1 for o in out if o['status'] == 'no match')
    print(f'\nDone: {ok} {"uploaded" if a.upload else "downloaded"}, {misses} with no match. Report: tools/art_report.csv')
    if not a.upload:
        print('Look through tools/art/ and delete any wrong cover. Then: python3 tools/fetch_album_art.py --upload --limit 3')


# ── worker mode ──
def worker(a):
    run = azlib.Run(a)
    if a.find:
        return find(run, a)
    if a.plan:
        return apply_plan(run)
    sys.exit('Worker mode needs --find or --plan.')


def find(run, a):
    overrides = json.load(open(a.tags, encoding='utf-8')) if a.tags else {}
    songs = [m for m in azlib.list_songs() if run.wanted(m.get('id'))]
    if a.only_missing:
        songs = [m for m in songs if not m.get('art_updated_at')]
    if run.limit:
        songs = songs[: run.limit]
    total = len(songs)
    run.progress(0, total, f'{total} songs to look up')
    for n, m in enumerate(songs, 1):
        sid = str(m.get('id'))
        cur = azlib.tags(m)
        o = overrides.get(sid) if isinstance(overrides.get(sid), dict) else {}
        artist, title = str(o.get('artist') or cur['artist']), str(o.get('title') or cur['title'])
        if not run.next(n, total, sid, f'{artist} - {title}'):
            continue
        try:
            if artist and title:
                url, album, source = find_art(artist, title)
                time.sleep(3.2)  # iTunes allows about 20 requests a minute
                if url and url.startswith('https://'):
                    run.result({'id': sid, 'current': cur, 'artUrl': url, 'album': album, 'source': source,
                                'confidence': 0.8 if source == 'itunes' else 0.7})
            run.ok(sid)
        except Exception as e:
            run.fail(sid, e)
        run.progress(n, total)
    run.finish()


def fetch_image(url):
    if not url.startswith('https://'):
        raise RuntimeError('cover link must be https')
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        if not (r.headers.get('Content-Type') or '').startswith('image/'):
            raise RuntimeError('that link is not a picture')
        blob = r.read(MAX_ART_BYTES + 1)
    if len(blob) > MAX_ART_BYTES:
        raise RuntimeError('picture is too big')
    return blob


def backup_current(m):
    """Saves the song's current cover (if it has one) and returns how to get it back: "backup:<file>" or None."""
    if not m.get('art_updated_at'):
        return None
    link = m.get('art') or ''
    blob = az('GET', link if link.startswith('http') else f"art/{m.get('unique_id') or m['id']}", raw=True)
    os.makedirs(BACKUP, exist_ok=True)
    name = f"{m['id']}-{int(time.time() * 1000)}.jpg"
    with open(os.path.join(BACKUP, name), 'wb') as f:
        f.write(blob)
    return f'backup:{name}'


def apply_plan(run):
    items = run.plan()
    total = len(items)
    for n, item in enumerate(items, 1):
        sid = str(item['songId'])
        key = str(item.get('undoOf') or sid)
        if not run.wanted(key) or not run.next(n, total, sid):
            continue
        try:
            m = az('GET', f'file/{sid}')
            restoring = 'restore' in item
            if restoring:
                target = item.get('restore')
                if target is not None and not BACKUP_RE.match(str(target)):
                    raise RuntimeError('bad backup reference')
            else:
                target = str(item.get('artUrl') or '')
                if not target.startswith('https://'):
                    raise RuntimeError('cover link must be https')
            # Get the new picture first, so a change is only recorded when it can really be made.
            img = None
            if run.apply and target is not None:
                img = open(os.path.join(BACKUP, BACKUP_RE.match(target).group(1)), 'rb').read() if restoring else fetch_image(target)
            old = backup_current(m) if run.apply else ('backup:(made when applied)' if m.get('art_updated_at') else None)
            change = {'field': 'art', 'old': old, 'new': target, **({'undoOf': item['undoOf']} if item.get('undoOf') else {})}
            if run.change(sid, [change]):
                if img is None:
                    az('DELETE', f'art/{sid}')
                else:
                    upload({'id': sid, 'unique_id': m.get('unique_id')}, img)
                run.emit({'t': 'applied', 'id': sid})
            run.ok(key)
        except Exception as e:
            run.fail(sid, e)
        run.progress(n, total)
    run.finish()


main()
