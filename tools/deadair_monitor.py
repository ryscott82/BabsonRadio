#!/usr/bin/env python3
"""Dead-air monitor. Run it on the always-on streaming PC. It listens to the public stream and tells the website when it goes silent.

  export STREAM_URL="https://a12.asurahosting.com:xxxx/radio.mp3"   # the public listen URL
  export SITE_URL="https://babsonradio.com"
  export MONITOR_SECRET="..."          # same value as MONITOR_SECRET (or CRON_SECRET) in Vercel
  python3 tools/deadair_monitor.py

Needs ffmpeg (brew install ffmpeg / apt install ffmpeg). It reports every minute ("ok") so the admin page can tell if the monitor itself
stops. Silence = nothing louder than SILENCE_DB for DEAD_AIR_SECONDS. If ffmpeg cannot open the stream it reports "down".
Keep it running with launchd (macOS), a systemd service (Linux) or Task Scheduler (Windows) set to restart on exit.
"""
import json, os, re, subprocess, sys, threading, time, urllib.request

STREAM = os.environ.get("STREAM_URL", "")
SITE = os.environ.get("SITE_URL", "https://babsonradio.com").rstrip("/")
KEY = os.environ.get("MONITOR_SECRET", "")
SILENCE_DB = os.environ.get("SILENCE_DB", "-50dB")
DEAD_AIR_SECONDS = int(os.environ.get("DEAD_AIR_SECONDS", "20"))
HEARTBEAT = 60

if not STREAM or not KEY:
    sys.exit("Set STREAM_URL and MONITOR_SECRET first (see the top of this file).")

state = {"value": "ok", "since": time.time(), "detail": ""}
lock = threading.Lock()

def post(st, seconds=0, detail=""):
    body = json.dumps({"state": st, "seconds": int(seconds), "detail": detail}).encode()
    req = urllib.request.Request(f"{SITE}/api/cron/deadair", data=body, method="POST",
                                 headers={"Content-Type": "application/json", "x-monitor-key": KEY})
    try:
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as e:  # never crash the monitor because the website was briefly unreachable
        print("report failed:", e, flush=True)

def heartbeat():
    while True:
        with lock:
            st, since, detail = state["value"], state["since"], state["detail"]
        post(st, time.time() - since if st != "ok" else 0, detail)
        time.sleep(HEARTBEAT)

def set_state(v, detail=""):
    with lock:
        if state["value"] != v:
            state.update(value=v, since=time.time(), detail=detail)
            print(time.strftime("%H:%M:%S"), v, detail, flush=True)
    post(v, 0, detail)

threading.Thread(target=heartbeat, daemon=True).start()
rx_start = re.compile(r"silence_start")
rx_end = re.compile(r"silence_end")
while True:
    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "info", "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
           "-i", STREAM, "-vn", "-af", f"silencedetect=noise={SILENCE_DB}:d={DEAD_AIR_SECONDS}", "-f", "null", "-"]
    p = subprocess.Popen(cmd, stderr=subprocess.PIPE, text=True, bufsize=1)
    set_state("ok") if state["value"] == "down" else None
    for line in p.stderr:
        if rx_start.search(line):
            set_state("silent", f"No sound for {DEAD_AIR_SECONDS}+ seconds.")
        elif rx_end.search(line):
            set_state("ok")
    p.wait()
    set_state("down", "Could not open the stream. Check AzuraCast and the stream URL.")
    time.sleep(10)
