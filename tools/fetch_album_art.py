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
"""
import argparse, csv, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get('AZURACAST_URL', 'https://a12.asurahosting.com').rstrip('/')
STATION = os.environ.get('AZURACAST_STATION', 'babson_radio')
ART = os.path.join(HERE, 'art')
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
    req = urllib.request.Request(f'{BASE}/api/station/{STATION}/{path}', method=method, data=data,
                                 headers={'X-API-Key': key(), 'Accept': 'application/json', **UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
        return body if raw else (json.loads(body) if body else {})


def has_art_map():
    """id -> True when AzuraCast already shows art for the song."""
    out, page = {}, 1
    while True:
        data = az('GET', f'files?page={page}&per_page=500')
        rows = data if isinstance(data, list) else data.get('rows') or data.get('data') or []
        for m in rows:
            out[str(m.get('id'))] = bool(m.get('art_updated_at')) or ('/art/' in str(m.get('art', '')) and 'default' not in str(m.get('art', '')))
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
        except urllib.error.HTTPError as e:
            last = f'HTTP {e.code} {e.read()[:200].decode("utf-8", "ignore")}'
    raise RuntimeError(last or 'no id')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--upload', action='store_true', help='upload the covers in art/ to AzuraCast (default: just find them)')
    ap.add_argument('--limit', type=int, default=0, help='only this many songs')
    ap.add_argument('--redo', action='store_true', help='also songs that already have art in AzuraCast')
    ap.add_argument('--include-review', action='store_true', help='also songs still marked needs_review')
    a = ap.parse_args()

    os.makedirs(ART, exist_ok=True)
    rows = [r for r in csv.DictReader(open(os.path.join(HERE, 'metadata_cleanup.csv'), encoding='utf-8'))
            if r['playlist'] != 'Copyright Free' and r['new_artist'] and (a.include_review or not r.get('needs_review'))]
    have = {} if a.redo else has_art_map() if os.environ.get('AZURACAST_API_KEY') or os.environ.get('AZURACAST_KEY') else {}
    rows = [r for r in rows if not have.get(r['id'])]
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


main()
