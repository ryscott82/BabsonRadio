#!/usr/bin/env python3
"""Find album art for the cleaned songs and (optionally) upload it to AzuraCast.

Run on your own computer. Reads metadata_cleanup.csv (the reviewed file).
  export AZURACAST_KEY=...      # never paste this into chat
  python3 fetch_album_art.py                 # dry run: downloads art to ./art and writes art_report.csv
  python3 fetch_album_art.py --upload        # also uploads to AzuraCast (UNTESTED: try with --limit 3 first)
Art comes from the free iTunes Search API (no key). Songs in the 'Copyright Free' playlist are skipped.
"""
import argparse, csv, json, os, re, time, urllib.parse, urllib.request

BASE = 'https://a12.asurahosting.com'
STATION = 1  # numeric station id; the AzuraCast URL shows it. Change if yours differs.

def get(url, binary=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'BabsonRadio-art/1'}), timeout=20) as r:
        return r.read() if binary else json.load(r)

def find_art(artist, title):
    term = re.sub(r'\(.*?\)|\[.*?\]', '', f'{artist} {title}').strip()
    q = urllib.parse.urlencode({'term': term, 'media': 'music', 'entity': 'song', 'limit': 5})
    for hit in get(f'https://itunes.apple.com/search?{q}').get('results', []):
        a = hit.get('artistName', '').lower(); first = artist.split(',')[0].split('&')[0].strip().lower()
        if first and first in a and hit.get('artworkUrl100'):
            return hit['artworkUrl100'].replace('100x100bb', '600x600bb'), hit.get('collectionName', '')
    return None, ''

def upload(row, img):
    import base64
    key = os.environ['AZURACAST_KEY']
    body = json.dumps({'art': base64.b64encode(img).decode()}).encode()
    req = urllib.request.Request(f"{BASE}/api/station/{STATION}/file/{row['id']}", data=body, method='PUT',
        headers={'X-API-Key': key, 'Content-Type': 'application/json'})
    urllib.request.urlopen(req, timeout=30).read()

ap = argparse.ArgumentParser(); ap.add_argument('--upload', action='store_true'); ap.add_argument('--limit', type=int, default=0)
a = ap.parse_args()
os.makedirs('art', exist_ok=True)
rows = [r for r in csv.DictReader(open('metadata_cleanup.csv', encoding='utf-8')) if r['playlist'] != 'Copyright Free' and r['new_artist']]
if a.limit: rows = rows[:a.limit]
out = []
for r in rows:
    try:
        url, album = find_art(r['new_artist'], r['new_title'])
        status = 'no match'
        if url:
            img = get(url, binary=True)
            open(f"art/{r['id']}.jpg", 'wb').write(img)
            status = 'downloaded'
            if a.upload: upload(r, img); status = 'uploaded'
    except Exception as e:
        status, album = f'error: {e}', ''
    out.append({'id': r['id'], 'artist': r['new_artist'], 'title': r['new_title'], 'album': album, 'status': status})
    print(status, '-', r['new_artist'], '-', r['new_title']); time.sleep(3.2)  # iTunes allows ~20 requests/min
csv.DictWriter(open('art_report.csv', 'w', newline='', encoding='utf-8'), fieldnames=list(out[0])).writeheader() if False else None
with open('art_report.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
