#!/usr/bin/env python3
"""
Babson Radio Booth PC - faceplate and sprite generator, pass 3.

The panel is 960 x 540 (ES2 scale) and is shown doubled on the 1920 x 1080 booth screen.
Each view is ONE baked faceplate bitmap: brushed metal, inset panels, the raised smooth-grey
centre panel, LCD windows, knobs and shadows. Only parts that change state are separate sprites.

This file is also the single source of the layout: the tables below place things in the bitmaps
AND are written to assets/layout.css, so the picture and the page cannot drift apart.

    pip install numpy scipy pillow qrcode
    python3 tools/make_assets.py     # writes assets/day, assets/night, assets/common, layout.css, tokens.json

Rules baked in here:
  * one hard light at the top left (LIGHT); shadows run down-right, are long, and fade out
  * metal is brushed (GRAIN is 90% of the first version); the raised centre panel is the same grey, unbrushed
  * inset panels: hard bevel along the top and bottom, which are mirrored arcs; the left and right ends
    rise gradually until they are flush with the surface
  * LCDs: near-black green glass in a thin bezel; lit pixels are drawn by the page, never baked
  * buttons are rounded rectangles or circles
  * green is the main accent; ORANGE (red-leaning) is for knob value arcs, alerts and anything live
"""
import json, math, os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

# ================================================================ tokens
SS = 2
W, H = 960, 540
LIGHT = np.array([-1.0, -1.0]) / np.sqrt(2)
ORANGE = (246, 100, 40)
GREEN = (112, 238, 134)
YELLOW = (232, 224, 84)
GRAIN = 0.90                              # brushing strength relative to version 1

THEMES = {
    "day": dict(metal=(198, 201, 205), grain=6.5 * GRAIN, hi=1.0, tint=0.21, lcd=(7, 16, 11), lcd2=(12, 25, 17),
                btn=(212, 215, 219), cap=(152, 157, 164), flange=(218, 222, 226), slot=(34, 37, 40),
                led_off=(96, 108, 100), emis=1.0, ink=(26, 28, 32)),
    "night": dict(metal=(40, 42, 46), grain=3.0 * GRAIN, hi=0.30, tint=0.40, lcd=(3, 8, 5), lcd2=(6, 13, 9),
                  btn=(62, 65, 70), cap=(58, 62, 68), flange=(80, 84, 90), slot=(11, 12, 14),
                  led_off=(40, 48, 44), emis=0.72, ink=(150, 157, 166)),
}
T = THEMES["day"]

# ================================================================ layout (960 x 540), also written to layout.css
HDR = {
    "full": dict(icon=(14, 13, 28, 28), onair=(168, 11, 72, 28), clock=(250, 10, 184, 30),
                 lk=[(454, 6), (498, 6), (542, 6), (586, 6), (630, 6)], help=(686, 9, 72, 28, "metal"), set=(764, 9, 72, 28, "metal"),
                 asw=(864, 12), aled=(936, 18)),
    "split": dict(onair=(10, 11, 56, 28), clock=(72, 10, 76, 30), bfull=(166, 11), bclose=(200, 11),
                  help=(296, 11, 28, 28, "round"), set=(328, 11, 28, 28, "round"), asw=(372, 12), aled=(430, 18)),
}
HERO = (12, 55, 580, 196)                                                  # welcome: raised smooth-grey panel
P_NOW, P_NEXT, P_SIGN, P_NET = (12, 259, 286, 248), (306, 259, 286, 248), (600, 55, 348, 336), (600, 399, 348, 108)
WEL = dict(qr=(612, 80, 204, 204), steps=(824, 80, 112, 204), signhere=(612, 296, 324, 34), wb=[(612, 338), (722, 338), (832, 338)],
           radio=(222, 263, 68, 20), radioled=(206, 267), case=(22, 281), nowlcd=(24, 456, 262, 40), nextlcd=(316, 282, 266, 216),
           netbig=(612, 424, 150, 66), nl=[(772, 424), (858, 424), (772, 462), (858, 462)])
P_LEFT, P_RIGHT = (12, 55, 184, 452), (628, 55, 320, 452)
MID = {"full": (204, 55, 416, 452), "split": (32, 55, 416, 452)}           # booth: raised smooth-grey panel
MIDC = dict(timebox=(12, 12, 392, 140), f_show=(78, 172, 326, 22), f_track=(78, 198, 326, 22), f_host=(78, 224, 326, 22),
            hostlist=(78, 262, 214, 24), signout=(300, 262, 104, 24), modelive=(12, 296, 100, 22), moderec=(118, 296, 100, 22),
            stay=(300, 292, 104, 20), adsbtn=(300, 296, 104, 22), micsw=(12, 324), micled=(58, 328), cleansw=(160, 324), cleanled=(206, 328),
            golive=(12, 352, 392, 88))
METER = dict(box=(22, 80, 60, 300), canvas=(4, 5, 52, 290), cells=32, pitch=9)
BL = dict(fb=(22, 390, 164, 58), autosw=(78, 456), autoled=(124, 460), autolcd=(140, 455, 46, 22))
ZONE_ROWS = [(87, 114), (114, 195), (195, 222), (222, 375)]      # too loud, sweet spot, good, too quiet (against the 32 cells)
BR = dict(beds=(762, 61), all=(806, 61), playled=(926, 64), search=(638, 84, 300, 20), tr=(638, 108, 300, 100), kmu=(684, 252),
          tplay=(744, 238), tfade=(778, 238, 62, 28), bysign=(713, 238, 150, 28), ksf=(892, 252), padstrip=(638, 328, 300, 170))
POP = (520, 330)
HELP = dict(doc=[(24, 58 + i * 32) for i in range(5)], docview=(168, 56, 328, 252))
SETP = dict(info=(24, 56, 472, 60), b=[(24, 132), (186, 132), (348, 132), (24, 172), (186, 172), (348, 172)])
NOTE = dict(size=(500, 56), led=(16, 22), lcd=(38, 9, 334, 38), b=[(380, 14), (438, 14)])
RAIL = dict(w=130, onair=(10, 12, 110, 28), clock=(10, 48, 110, 30), status=(10, 86, 110, 60), b=[(10, 300), (10, 336), (10, 400), (10, 436), (10, 486)])
KNOB = {"lg": (25.0, 14.0), "sm": (19.0, 10.5)}                 # flange radius, cap radius
KV = (68, 16)                                                   # value window under a knob
BM = (6, 12)                                                    # button sprite margin: left/top, right/bottom
SWITCH = {"sm": (42, 20), "lg": (52, 24)}

# ================================================================ drawing core
def cov(d):
    return np.clip(0.5 - d * SS / 1.3, 0, 1)

def smax(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0) / k
    return np.maximum(a, b) + h * h * k * 0.25

def sd_bow(X, Y, x0, y0, x1, y1, r, bow=(0, 0, 0, 0)):
    """Rounded box whose four edges are arcs. bow = (top, right, bottom, left) bulge in px (negative = concave)."""
    def side(perp, par, edge, half, b, sign):
        if abs(b) < 1e-6:
            return sign * (perp - edge)
        R = (half * half + b * b) / (2 * abs(b))
        if b > 0:
            cp = edge + sign * (b - R)
            return np.where(sign * (perp - cp) > 0, np.hypot(perp - cp, par) - R, sign * (perp - edge))
        return R - np.hypot(perp - (edge + sign * (b + R)), par)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    bt, br, bb, bl = bow
    dT = side(Y, X - cx, y0, (x1 - x0) / 2, bt, -1)
    dB = side(Y, X - cx, y1, (x1 - x0) / 2, bb, +1)
    dL = side(X, Y - cy, x0, (y1 - y0) / 2, bl, -1)
    dR = side(X, Y - cy, x1, (y1 - y0) / 2, br, +1)
    k = max(r, 0.01) * 2.2
    return np.maximum(smax(smax(dT, dL, k), smax(dB, dR, k), 0.01), smax(smax(dT, dR, k), smax(dB, dL, k), 0.01))

def sd_circle(X, Y, cx, cy, r):
    return np.hypot(X - cx, Y - cy) - r

def sd_segment(X, Y, ax, ay, bx, by, r):
    px, py, vx, vy = X - ax, Y - ay, bx - ax, by - ay
    h = np.clip((px * vx + py * vy) / (vx * vx + vy * vy), 0, 1)
    return np.hypot(px - vx * h, py - vy * h) - r

def lit(d):
    gy, gx = np.gradient(d)
    n = np.hypot(gx, gy) + 1e-9
    return np.clip((gx / n * LIGHT[0] + gy / n * LIGHT[1]) / 0.7071, -1, 1)

def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)

class Canvas:
    def __init__(self, w, h, alpha=False):
        self.w, self.h = w, h
        self.rgb = np.zeros((h * SS, w * SS, 3), np.float32)
        self.a = np.zeros((h * SS, w * SS), np.float32) if alpha else None

    def sub(self, x0=0, y0=0, x1=None, y1=None):
        x0 = max(0, int(math.floor(x0))); y0 = max(0, int(math.floor(y0)))
        x1 = self.w if x1 is None else min(self.w, int(math.ceil(x1)))
        y1 = self.h if y1 is None else min(self.h, int(math.ceil(y1)))
        yy, xx = np.mgrid[y0 * SS:y1 * SS, x0 * SS:x1 * SS]
        return (slice(y0 * SS, y1 * SS), slice(x0 * SS, x1 * SS)), ((xx + 0.5) / SS).astype(np.float32), ((yy + 0.5) / SS).astype(np.float32)

    def paint(self, sl, color, alpha):
        c = np.asarray(color, np.float32)
        if c.ndim == 1:
            c = c[None, None, :]
        a = np.clip(alpha, 0, 1).astype(np.float32)[..., None]
        if self.a is None:
            self.rgb[sl] = self.rgb[sl] * (1 - a) + c * a
        else:
            A = self.a[sl][..., None]
            out = a + A * (1 - a)
            self.rgb[sl] = (c * a + self.rgb[sl] * A * (1 - a)) / np.maximum(out, 1e-6)
            self.a[sl] = out[..., 0]

    def img(self):
        h, w = self.h, self.w
        if self.a is None:
            rgb = self.rgb.reshape(h, SS, w, SS, 3).mean(axis=(1, 3))
            return Image.fromarray(np.clip(rgb, 0, 255).round().astype(np.uint8), "RGB")
        pm = np.dstack([self.rgb * self.a[..., None], self.a]).reshape(h, SS, w, SS, 4).mean(axis=(1, 3))
        a = pm[..., 3:4]
        return Image.fromarray(np.clip(np.dstack([pm[..., :3] / np.maximum(a, 1e-6), a * 255]), 0, 255).round().astype(np.uint8), "RGBA")

def long_shadow(c, sdf, box, L, strength=0.5, soft=None, clip=None):
    """Shadow of a raised part: runs down-right for L px, darkest at the part, fading to nothing, soft edged."""
    x0, y0, x1, y1 = box
    sl, X, Y = c.sub(x0 - 3, y0 - 3, x1 + L + 6, y1 + L + 6)
    acc = np.zeros_like(X)
    for t in np.linspace(0, L, max(3, int(L * SS))):
        acc = np.maximum(acc, cov(sdf(X - t, Y - t)) * (1 - t / L) ** 1.4)
    acc = gaussian_filter(acc, (0.55 + L * 0.055 if soft is None else soft) * SS)
    if clip is not None:
        acc = acc * clip(X, Y)
    c.paint(sl, (0, 0, 0), acc * strength)

def light_gradient(X, Y, w, h):
    g = (X / w + Y / h) / 2                                   # 0 at the light, 1 at the far corner
    return (0.42 - g) * 30 * (0.35 + 0.65 * T["hi"])

def metal_base(c, seed=3, ox=0, oy=0, ref=(W, H)):
    """Brushed aluminium: long horizontal streaks plus fine grain, lit from the top left."""
    rng = np.random.default_rng(seed)
    h, w = c.h, c.w
    n = gaussian_filter(rng.normal(size=(h, w)), (0.45, 36), mode="wrap"); n /= n.std()
    f = gaussian_filter(rng.normal(size=(h, w)), (0.3, 5), mode="wrap"); f /= f.std()
    g = rng.normal(size=(h, w)) * 0.25
    v = np.kron((n * 0.75 + f * 0.5 + g) * T["grain"], np.ones((SS, SS))).astype(np.float32)
    sl, X, Y = c.sub()
    c.rgb[:] = np.asarray(T["metal"], np.float32)[None, None, :] + (v + light_gradient(X + ox, Y + oy, *ref))[..., None]
    if c.a is not None:
        c.a[:] = 1

def inset_panel(c, x, y, w, h, bow=5.0, taper=22.0):
    """A pocket milled into the plate. Top and bottom edges are mirrored arcs with a hard bevel;
    the left and right ends ramp up until they are flush with the surface (no side walls)."""
    sl, X, Y = c.sub(x - 2, y - 3, x + w + 2, y + h + 3)
    cx, hw = x + w / 2, w / 2
    q = ((X - cx) / hw) ** 2
    slope = 2 * bow * (X - cx) / (hw * hw)
    nrm = np.sqrt(1 + slope ** 2)
    dt = ((y + bow * q) - Y) / nrm                             # negative below the top arc
    db = (Y - (y + h - bow * q)) / nrm                         # negative above the bottom arc
    d = np.maximum(dt, db)
    a = cov(d) * ((X > x) & (X < x + w))
    t = smooth((X - x) / taper) * smooth((x + w - X) / taper)  # depth: 0 at the ends, 1 in the middle
    c.paint(sl, (0, 0, 0), a * t * T["tint"])                                        # floor, a little darker
    c.paint(sl, (0, 0, 0), a * t * np.clip(1 + dt / 10.0, 0, 1) ** 1.5 * 0.40)        # shadow of the top wall
    bw = 3.0
    c.paint(sl, (0, 0, 0), a * t * (1 - cov(dt + bw)) * 0.50)                        # hard bevel, top: turned from the light
    c.paint(sl, (255, 255, 255), a * t * (1 - cov(db + bw)) * 0.72 * T["hi"])        # hard bevel, bottom: catches it
    inx = (X > x) & (X < x + w)
    c.paint(sl, (255, 255, 255), np.clip(1 - np.abs(dt - 0.7) / 0.8, 0, 1) * t * inx * 0.55 * T["hi"])
    c.paint(sl, (0, 0, 0), np.clip(1 - np.abs(db - 0.7) / 0.8, 0, 1) * t * inx * 0.25)

def raised_panel(c, x, y, w, h, r=9.0, bow=2.5, L=12.0):
    """The centre panel: the same grey as the plate but smooth (no brushing), standing proud of it."""
    sdf = lambda X, Y: sd_bow(X, Y, x, y, x + w, y + h, r, (bow, bow, bow, bow))
    long_shadow(c, sdf, (x - 4, y - 4, x + w + 4, y + h + 4), L, 0.55)
    sl, X, Y = c.sub(x - 6, y - 6, x + w + 6, y + h + 6)
    d = sdf(X, Y)
    a = cov(d)
    col = np.asarray(T["metal"], np.float32)[None, None, :] + (light_gradient(X, Y, W, H) + 5 * T["hi"])[..., None]
    c.paint(sl, col, a)
    l = lit(d)
    band = a * (1 - cov(d + 2.6))
    c.paint(sl, (255, 255, 255), band * np.clip(l, 0, 1) * 0.80 * T["hi"])
    c.paint(sl, (0, 0, 0), band * np.clip(-l, 0, 1) * 0.36)
    c.paint(sl, (0, 0, 0), np.clip(1 - np.abs(d) / 0.7, 0, 1) * 0.24)

def lcd_window(c, x, y, w, h, r=3.0, bow=0.6):
    """An LCD: near-black green glass set a little below a thin bezel. Lit pixels come from the page."""
    b = (bow, bow * 0.6, bow, bow * 0.6)
    sdf = lambda X, Y: sd_bow(X, Y, x, y, x + w, y + h, r, b)
    sl, X, Y = c.sub(x - 4, y - 4, x + w + 4, y + h + 4)
    d = sdf(X, Y)
    a = cov(d)
    g = np.clip((Y - y) / h, 0, 1)[..., None]
    c.paint(sl, np.asarray(T["lcd"], np.float32) * (1 - g) + np.asarray(T["lcd2"], np.float32) * g, a)
    dm = d.copy()
    for t in (0.8, 1.6, 2.4):
        dm = np.maximum(dm, sdf(X - t, Y - t))
    c.paint(sl, (0, 0, 0), gaussian_filter(a * (1 - cov(dm)), 0.5 * SS) * a * 0.6)
    l = -lit(d)
    lip = np.clip(1 - np.abs(d - 0.7) / 0.9, 0, 1)
    c.paint(sl, (255, 255, 255), lip * np.clip(l, 0, 1) * 0.75 * T["hi"])
    c.paint(sl, (0, 0, 0), lip * np.clip(-l, 0, 1) * 0.45)

def button(kind, w, h, state):
    """Rounded rectangle, or a circle for kind 'round'. state 0 = up / off, 1 = down / on."""
    ml, mr = BM
    c = Canvas(w + ml + mr, h + ml + mr, alpha=True)
    x, y = ml, ml
    r = h / 2 if kind == "round" else (7.0 if kind == "live" else min(5.0, h / 2 - 1))
    sl, X, Y = c.sub()
    if kind == "live":                                         # backlit glass key: dark until it is on air
        sdf = lambda X, Y: sd_bow(X, Y, x, y, x + w, y + h, r)
        d = sdf(X, Y)
        a = cov(d)
        g = np.clip((Y - y) / h, 0, 1)[..., None]
        e = T["emis"]
        edge = np.asarray(ORANGE, np.float32)
        if state:
            c.paint(sl, edge * e, gaussian_filter(a, 2.4 * SS) * 0.6 * (1 - a))
            c.paint(sl, (np.asarray((255, 132, 64), np.float32) * (1 - g) + np.asarray((226, 76, 28), np.float32) * g) * e, a)
            c.paint(sl, (255, 255, 255), np.clip(1 - np.abs(d + 1.2) / 1.0, 0, 1) * np.clip(lit(d), 0, 1) * 0.55)
        else:
            c.paint(sl, np.asarray(T["lcd"], np.float32) * (1 - g) + np.asarray(T["lcd2"], np.float32) * g, a)
            dm = np.maximum(d, np.maximum(sdf(X - 1.2, Y - 1.2), sdf(X - 2.4, Y - 2.4)))
            c.paint(sl, (0, 0, 0), gaussian_filter(a * (1 - cov(dm)), 0.5 * SS) * a * 0.6)
            c.paint(sl, edge * (0.55 + 0.45 * e), np.clip(1 - np.abs(d + 3.2) / 1.1, 0, 1) * 0.95)
            c.paint(sl, edge, gaussian_filter(np.clip(1 - np.abs(d + 3.2) / 1.6, 0, 1), 1.8 * SS) * 0.30 * e * a)
        l = -lit(d)
        lip = np.clip(1 - np.abs(d - 0.7) / 0.9, 0, 1)
        c.paint(sl, (255, 255, 255), lip * np.clip(l, 0, 1) * 0.75 * T["hi"])
        c.paint(sl, (0, 0, 0), lip * np.clip(-l, 0, 1) * 0.45)
        return c.img()
    o = 1.0 if state else 0.0
    if kind == "round":
        sdf = lambda X, Y: sd_circle(X, Y, x + w / 2 + o, y + h / 2 + o, h / 2)
    else:
        sdf = lambda X, Y: sd_bow(X, Y, x + o, y + o, x + w + o, y + h + o, r)
    long_shadow(c, sdf, (x, y, x + w, y + h), 2.0 if state else 8.0, 0.5)
    d = sdf(X, Y)
    base = np.asarray(T["btn"] if kind != "green" else (96, 214, 128), np.float32)
    if kind == "green":
        base = base * (0.55 + 0.45 * T["emis"])
    g = np.clip((Y - y) / h, 0, 1)[..., None]
    col = base[None, None, :] * (1.05 - 0.13 * g) * (0.9 if state else 1.0)
    l = lit(d)
    band = cov(d) * (1 - cov(d + 2.0))                         # hard chamfer
    col = col + (np.clip(l, 0, 1) * band * 58 * T["hi"])[..., None]
    col = col * (1 + np.clip(l, -1, 0) * band * 0.40)[..., None]
    c.paint(sl, np.clip(col, 0, 255), cov(d))
    c.paint(sl, (0, 0, 0), np.clip(1 - np.abs(d) / 0.7, 0, 1) * 0.28)
    return c.img()

def switch_sprite(w, h):
    """Slide switch, two frames stacked: off, on. Frame is (w + 8) x (h + 8)."""
    frames = []
    for on in (False, True):
        c = Canvas(w + 8, h + 8, alpha=True)
        sl, X, Y = c.sub()
        slot = lambda X, Y: sd_bow(X, Y, 1, 2, w - 1, h - 2, (h - 4) / 2 - 0.5)
        d = slot(X, Y)
        a = cov(d)
        c.paint(sl, T["slot"], a)
        if on:
            c.paint(sl, np.asarray(GREEN, np.float32) * T["emis"], cov(sd_bow(X, Y, 4, 5, w * 0.5, h - 5, (h - 10) / 2 - 0.3)))
        dm = np.maximum(d, np.maximum(slot(X - 1.2, Y - 1.2), slot(X - 2.4, Y - 2.4)))
        c.paint(sl, (0, 0, 0), gaussian_filter(a * (1 - cov(dm)), 0.6 * SS) * a * 0.5)
        l = -lit(d)
        lip = np.clip(1 - np.abs(d - 0.6) / 0.8, 0, 1)
        c.paint(sl, (255, 255, 255), lip * np.clip(l, 0, 1) * 0.7 * T["hi"])
        c.paint(sl, (0, 0, 0), lip * np.clip(-l, 0, 1) * 0.4)
        cw = w * 0.44
        x0 = (w - 3 - cw) if on else 3
        cap = lambda X, Y: sd_bow(X, Y, x0, 3.5, x0 + cw, h - 3.5, 3.0)
        long_shadow(c, cap, (x0, 3.5, x0 + cw, h - 3.5), 6, 0.6)
        d = cap(X, Y)
        l = lit(d)
        band = cov(d) * (1 - cov(d + 1.8))
        base = np.asarray(T["btn"], np.float32)
        col = base[None, None, :] * (1 + np.clip(l, -1, 0) * band * 0.45)[..., None] + (np.clip(l, 0, 1) * band * 55 * T["hi"])[..., None]
        c.paint(sl, np.clip(col, 0, 255), cov(d))
        for k in (-1, 0, 1):
            gx = x0 + cw / 2 + k * 3.0
            c.paint(sl, tuple(v * 0.5 for v in T["btn"]), cov(sd_segment(X, Y, gx, 7.2, gx, h - 7.2, 0.45)) * 0.9)
        c.paint(sl, (0, 0, 0), np.clip(1 - np.abs(d) / 0.7, 0, 1) * 0.28)
        frames.append(c.img())
    return stack(frames)

def knob(c, cx, cy, size="lg"):
    """ES2 knob: a wide pale flange, a tall matte cap, and the cap's long fading shadow. No pointer:
    the orange arc drawn in the channel around the flange shows the value."""
    R, r = KNOB[size]
    sl, X, Y = c.sub(cx - R - 12, cy - R - 12, cx + R + 26, cy + R + 26)
    ang = np.degrees(np.arctan2(X - cx, -(Y - cy)))
    rad = np.hypot(X - cx, Y - cy)
    # channel for the value arc (270 degrees) + seven engraved ticks
    rc, hw = R + 3.6, 1.7
    ex, ey = np.sin(np.radians(135)) * rc, -np.cos(np.radians(135)) * rc
    dch = np.where(np.abs(ang) <= 135, np.abs(rad - rc),
                   np.minimum(np.hypot(X - cx - ex, Y - cy - ey), np.hypot(X - cx + ex, Y - cy - ey))) - hw
    c.paint(sl, T["lcd"], cov(dch))
    c.paint(sl, (255, 255, 255), np.clip(1 - np.abs(dch - 0.6) / 0.8, 0, 1) * np.clip(-lit(dch), 0, 1) * 0.6 * T["hi"])
    for tdeg in (-135, -90, -45, 0, 45, 90, 135):
        s_, c_ = np.sin(np.radians(tdeg)), -np.cos(np.radians(tdeg))
        c.paint(sl, T["ink"], cov(sd_segment(X, Y, cx + s_ * (R + 7.2), cy + c_ * (R + 7.2), cx + s_ * (R + 9.6), cy + c_ * (R + 9.6), 0.42)) * 0.8)
    # flange and its own short shadow
    fl = lambda X, Y: sd_circle(X, Y, cx, cy, R)
    long_shadow(c, fl, (cx - R, cy - R, cx + R, cy + R), 5, 0.42)
    d = fl(X, Y)
    u = ((X - cx) * LIGHT[0] + (Y - cy) * LIGHT[1]) / R              # +1 toward the light
    base = np.asarray(T["flange"], np.float32)
    col = base[None, None, :] * (1 + 0.20 * u[..., None] - 0.10) + (22 * T["hi"]) * np.clip(u, 0, 1)[..., None]
    c.paint(sl, np.clip(col, 0, 255), cov(d))
    rim = np.clip(1 + d / 2.2, 0, 1) * cov(d)
    l = lit(d)
    c.paint(sl, (255, 255, 255), rim * np.clip(l, 0, 1) * 0.6 * T["hi"])
    c.paint(sl, (0, 0, 0), rim * np.clip(-l, 0, 1) * 0.38)
    c.paint(sl, (0, 0, 0), np.clip(1 - np.abs(d) / 0.7, 0, 1) * 0.30)
    # the cap's shadow: long, soft, dying away (falls across the flange and on past it)
    cap = lambda X, Y: sd_circle(X, Y, cx, cy, r)
    long_shadow(c, cap, (cx - r, cy - r, cx + r, cy + r), r * 2.4, 0.72, soft=1.0 + r * 0.06)
    d = cap(X, Y)
    l = lit(d)
    capc = np.asarray(T["cap"], np.float32)
    bw = max(1.6, r * 0.16)
    band = 1 - cov(d + bw)
    col = capc[None, None, :] * (1 + np.clip(l, -1, 0)[..., None] * 0.5 * band[..., None]) + (np.clip(l, 0, 1) * 70 * T["hi"] * band)[..., None]
    top = cov(d + bw)
    col = col + ((u * R / r) * 12 * (0.4 + 0.6 * T["hi"]) * top)[..., None]
    gx, gy = cx + LIGHT[0] * r * 0.38, cy + LIGHT[1] * r * 0.38
    col = col + (np.exp(-((X - gx) ** 2 + (Y - gy) ** 2) / (2 * (r * 0.34) ** 2)) * 30 * (0.4 + 0.6 * T["hi"]) * top)[..., None]
    col = col + (np.clip(l, 0, 1) ** 8 * band * 70 * (0.4 + 0.6 * T["hi"]))[..., None]
    c.paint(sl, np.clip(col, 0, 255), cov(d))
    c.paint(sl, (0, 0, 0), np.clip(1 - np.abs(d) / 0.7, 0, 1) * 0.32)

def brace(c, x, y0, y1):
    """Engraved shallow arc marking one loudness zone (no straight brackets)."""
    sl, X, Y = c.sub(x - 4, y0, x + 8, y1)
    v = (Y - (y0 + y1) / 2) / ((y1 - y0) / 2 - 1.5)
    xx = x + 2.5 * v ** 2
    ok = np.abs(v) <= 1
    c.paint(sl, (255, 255, 255), np.clip(1 - np.abs(X - xx - 0.9) / 0.8, 0, 1) * ok * 0.5 * T["hi"])
    c.paint(sl, T["ink"], np.clip(1 - np.abs(X - xx) / 0.95, 0, 1) * ok * 0.95)

def icon_slot(c, x, y, w, h):
    sdf = lambda X, Y: sd_bow(X, Y, x, y, x + w, y + h, 6, (1, 1, 1, 1))
    sl, X, Y = c.sub(x - 3, y - 3, x + w + 3, y + h + 3)
    d = sdf(X, Y)
    c.paint(sl, (0, 0, 0), cov(d) * 0.10)
    l = -lit(d)
    b = np.clip(1 + d / 2.5, 0, 1) * cov(d)
    c.paint(sl, (0, 0, 0), b * np.clip(-l, 0, 1) * 0.4)
    c.paint(sl, (255, 255, 255), b * np.clip(l, 0, 1) * 0.5 * T["hi"])

def stack(frames):
    out = Image.new("RGBA", (max(f.width for f in frames), sum(f.height for f in frames)))
    y = 0
    for f in frames:
        out.paste(f, (0, y)); y += f.height
    return out

def led_sprite():
    frames = []
    for col in (None, GREEN, ORANGE):
        c = Canvas(12, 12, alpha=True)
        sl, X, Y = c.sub()
        if col:
            c.paint(sl, col, np.exp(-((X - 6) ** 2 + (Y - 6) ** 2) / (2 * 2.9 ** 2)) * 0.6 * T["emis"])
        d = sd_circle(X, Y, 6, 6, 3.3)
        c.paint(sl, T["slot"], cov(d - 1.0))
        base = np.asarray(col if col else T["led_off"], np.float32) * (T["emis"] if col else 1)
        k = np.clip(1 - np.hypot(X - 5.1, Y - 5.1) / 3.6, 0, 1)[..., None]
        c.paint(sl, np.clip(base[None, None, :] * 0.85 + 255 * (0.42 if col else 0.2) * k, 0, 255), cov(d))
        frames.append(c.img())
    return stack(frames)

def cell_sprite():
    frames = []
    for col in (None, GREEN, YELLOW, ORANGE):
        c = Canvas(26, 9, alpha=True)
        sl, X, Y = c.sub()
        d = sd_bow(X, Y, 1.5, 2, 24.5, 7, 1.4, (0.5, 0, 0.5, 0))
        if col:
            c.paint(sl, col, gaussian_filter(cov(d), 1.3 * SS) * 0.45 * T["emis"])
            k = np.clip(1 - np.abs(Y - 4.5) / 3.0, 0, 1)[..., None]
            c.paint(sl, np.clip(np.asarray(col, np.float32) * 0.85 * T["emis"] + 60 * k, 0, 255), cov(d))
        else:
            c.paint(sl, T["lcd2"], cov(d))
        frames.append(c.img())
    return stack(frames)

def plate(w, h, draw, L=22):
    """A raised metal plate (pop-ups, notification) with its own long shadow. Sprite margin: 10 / 34."""
    c = Canvas(w + 44, h + 44, alpha=True)
    sdf = lambda X, Y: sd_bow(X, Y, 10, 10, 10 + w, 10 + h, 13, (3, 3, 3, 3))
    long_shadow(c, sdf, (10, 10, 10 + w, 10 + h), L, 0.6)
    m = Canvas(w + 44, h + 44)
    metal_base(m, seed=9)
    sl, X, Y = c.sub()
    d = sdf(X, Y)
    c.paint(sl, m.rgb, cov(d))
    l = lit(d)
    band = np.clip(1 + d / 3.0, 0, 1) * cov(d)
    c.paint(sl, (255, 255, 255), band * np.clip(l, 0, 1) * 0.7 * T["hi"])
    c.paint(sl, (0, 0, 0), band * np.clip(-l, 0, 1) * 0.4)
    c.paint(sl, (0, 0, 0), np.clip(1 - np.abs(d) / 0.7, 0, 1) * 0.25)
    draw(c, 10, 10)
    return c.img()

def cd_img():
    F, R = 300, 138
    c = Canvas(F + 30, F + 30, alpha=True)
    sl, X, Y = c.sub()
    cx = cy = F / 2
    r = np.hypot(X - cx, Y - cy)
    ang = np.arctan2(Y - cy, X - cx)
    ring = lambda r0, r1: cov(r - r1) * (1 - cov(r - r0))
    long_shadow(c, lambda X, Y: sd_circle(X, Y, cx, cy, R), (cx - R, cy - R, cx + R, cy + R), 24, 0.5)
    la = math.atan2(LIGHT[1], LIGHT[0])
    fan = np.cos(ang - la) ** 2
    silver = 168 + 62 * fan ** 4
    hue = np.cos(ang - la) * np.sin(ang - la)
    rgb = np.dstack([silver + 46 * np.clip(hue, 0, 1) * 2 - 20 * np.clip(-hue, 0, 1) * 2, silver + 34 * np.sin(4 * (ang - la)) * np.abs(hue) * 2,
                     silver + 50 * np.clip(-hue, 0, 1) * 2 - 24 * np.clip(hue, 0, 1) * 2])
    c.paint(sl, np.clip(rgb * (1 + 0.035 * np.sin(r * 2.4))[..., None], 0, 255), ring(30, R - 1.5))
    c.paint(sl, (235, 238, 242), ring(R - 1.5, R) * 0.9)
    c.paint(sl, (226, 229, 233), ring(22, 30))
    c.paint(sl, (120, 124, 130), ring(21.3, 22.3) * 0.7)
    c.paint(sl, (205, 210, 216), ring(9, 22) * 0.55)
    c.paint(sl, (90, 94, 100), ring(8.4, 9.6) * 0.8)
    return c.img()

def jewel_img():
    Wd, Hd = 372, 334
    c = Canvas(Wd, Hd, alpha=True)
    sl, X, Y = c.sub()
    x0, y0, x1, y1 = 8, 8, 348, 308
    body = lambda X, Y: sd_bow(X, Y, x0, y0, x1, y1, 5, (1.5, 1.5, 1.5, 1.5))
    long_shadow(c, body, (x0, y0, x1, y1), 22, 0.55, clip=lambda X, Y: 1 - cov(body(X, Y)))
    d = body(X, Y)
    sp = cov(sd_bow(X, Y, x0, y0, x0 + 38, y1, 5, (0, 0, 0, 1.5))) * cov(d)
    rib = 0.5 + 0.5 * np.sin((Y - y0) * 1.9)
    c.paint(sl, np.dstack([58 + 34 * rib] * 3), sp * 0.94)
    c.paint(sl, (255, 255, 255), sp * np.clip(1 - np.abs(X - x0 - 4) / 3, 0, 1) * 0.5)
    c.paint(sl, (0, 0, 0), sp * np.clip(1 - np.abs(X - x0 - 36) / 3, 0, 1) * 0.55)
    for yy in (y0 + 26, y1 - 26):
        c.paint(sl, (40, 44, 48), cov(sd_bow(X, Y, x0 + 9, yy - 9, x0 + 29, yy + 9, 3)))
    win = sd_bow(X, Y, x0 + 46, y0 + 8, x1 - 8, y1 - 8, 2)
    lid = cov(sd_bow(X, Y, x0 + 38, y0, x1 + 4, y1, 1)) * cov(d)
    c.paint(sl, (228, 233, 240), lid * (1 - cov(win)) * 0.62)
    l = lit(d)
    edge = np.clip(1 + d / 3.0, 0, 1) * cov(d)
    c.paint(sl, (255, 255, 255), edge * np.clip(l, 0, 1) * 0.9)
    c.paint(sl, (0, 0, 0), edge * np.clip(-l, 0, 1) * 0.45)
    wl = -lit(win)
    wb = np.clip(1 + win / 2.5, 0, 1) * cov(win)
    c.paint(sl, (0, 0, 0), wb * np.clip(-wl, 0, 1) * 0.5)
    c.paint(sl, (255, 255, 255), wb * np.clip(wl, 0, 1) * 0.35)
    tt = ((X - x0 - 46) + (Y - y0 - 8)) / 2
    streak = np.clip(1 - np.abs(tt - 62) / 26, 0, 1) * 0.16 + np.clip(1 - np.abs(tt - 104) / 8, 0, 1) * 0.10
    c.paint(sl, (255, 255, 255), streak * cov(win) * np.clip(1.25 - (X - x0) / 330, 0, 1))
    return c.img()

def album_art(seed):
    rng = np.random.default_rng(seed)
    S = 284
    y, x = np.mgrid[0:S, 0:S] / S
    pal = [((18, 46, 38), (240, 196, 84), (226, 92, 60)), ((28, 30, 70), (240, 120, 150), (120, 210, 230)),
           ((238, 228, 204), (40, 96, 72), (214, 88, 44))][seed % 3]
    img = np.zeros((S, S, 3)) + np.asarray(pal[0], float) + (y[..., None] - 0.5) * 30
    for k in range(7):
        cx, cy, r = rng.uniform(0.1, 0.9), rng.uniform(0.1, 0.9), rng.uniform(0.08, 0.34)
        m = np.clip((r - np.hypot(x - cx, y - cy)) * S / 1.5, 0, 1)[..., None]
        img = img * (1 - m * 0.85) + np.asarray(pal[1 + k % 2], float) * m * 0.85
    band = (np.abs(((x + y) * 9) % 2 - 1) < 0.12) & (y > 0.62)
    img[band] = img[band] * 0.4 + np.asarray(pal[2], float) * 0.6
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").resize((142, 142), Image.LANCZOS)

# ================================================================ faceplates
def header(c, mode):
    h = HDR[mode]
    if mode == "full":
        icon_slot(c, *h["icon"])
    lcd_window(c, *h["onair"])
    lcd_window(c, *h["clock"])

def knob_with_value(c, kx, ky, size):
    knob(c, kx, ky, size)
    lcd_window(c, kx - KV[0] / 2, ky + (32 if size == "lg" else 27), *KV)

def hero_lcd():
    x, y, w, h = HERO
    return (x + 10, y + 10, w - 20, h - 20)

def face_welcome():
    c = Canvas(W, H)
    metal_base(c)
    for p in (P_NOW, P_NEXT, P_SIGN, P_NET):
        inset_panel(c, *p)
    header(c, "full")
    raised_panel(c, *HERO)
    lcd_window(c, *hero_lcd(), r=4)
    for k in ("qr", "steps", "nowlcd", "nextlcd"):
        lcd_window(c, *WEL[k])
    return c.img()

def mid_panel(c, mode):
    x, y, w, h = MID[mode]
    raised_panel(c, x, y, w, h)
    for k in ("timebox", "f_show", "f_track", "f_host", "hostlist"):
        rx, ry, rw, rh = MIDC[k]
        lcd_window(c, x + rx, y + ry, rw, rh, r=4 if k == "timebox" else 3)

def face_booth(split=False):
    mode = "split" if split else "full"
    c = Canvas(480 if split else W, H)
    metal_base(c)
    if not split:
        inset_panel(c, *P_LEFT); inset_panel(c, *P_RIGHT)
        for (y0, y1) in ZONE_ROWS:
            brace(c, 92, y0 + 3, y1 - 3)
        lcd_window(c, *METER["box"]); lcd_window(c, *BL["fb"]); lcd_window(c, *BL["autolcd"])
        lcd_window(c, *BR["search"]); lcd_window(c, *BR["tr"])
        knob_with_value(c, *BR["kmu"], "lg"); knob_with_value(c, *BR["ksf"], "lg")
        lcd_window(c, *BR["padstrip"])
    header(c, mode)
    mid_panel(c, mode)
    return c.img()

def face_rail():
    c = Canvas(RAIL["w"], H)
    metal_base(c)
    for k in ("onair", "clock", "status"):
        lcd_window(c, *RAIL[k])
    return c.img()

def pop_help(c, ox, oy):
    x, y, w, h = HELP["docview"]; lcd_window(c, ox + x, oy + y, w, h)

def pop_set(c, ox, oy):
    x, y, w, h = SETP["info"]; lcd_window(c, ox + x, oy + y, w, h)

def note_plate(c, ox, oy):
    x, y, w, h = NOTE["lcd"]; lcd_window(c, ox + x, oy + y, w, h)

# ================================================================ layout.css
CSS, BTNS = [], set()

def box(sel, x, y, w=None, h=None):
    CSS.append(f"{sel}{{left:{x:g}px;top:{y:g}px" + (f";width:{w:g}px;height:{h:g}px" if w is not None else "") + "}")

def btn(sel, kind, x, y, w, h):
    BTNS.add((kind, w, h))
    k = f"{kind}-{w}x{h}"
    box(sel, x, y, w, h)
    CSS.append(f"{sel}::before{{width:{w + sum(BM)}px;height:{h + sum(BM)}px;background-image:var(--k-{k}-0)}}")
    CSS.append(f"{sel}:active:not(:disabled)::before,{sel}.on::before{{background-image:var(--k-{k}-1)}}")

def write_layout(root):
    S = "#stage[data-split=split] "
    for mode, pre in (("full", ""), ("split", S)):
        h = HDR[mode]
        box(pre + "#onair", *h["onair"]); box(pre + "#clock", *h["clock"])
        btn(pre + "#helpbtn", h["help"][4], *h["help"][:4]); btn(pre + "#setbtn", h["set"][4], *h["set"][:4])
        box(pre + "#audiosw", *h["asw"]); box(pre + "#audioled", *h["aled"])
        box(pre + "#mid", *MID[mode])
    for i, (x, y) in enumerate(HDR["full"]["lk"]):
        btn(f"#lk{i}", "metal", x, y, 38, 28)
    btn("#bfull", "round", *HDR["split"]["bfull"], 28, 28); btn("#bclose", "round", *HDR["split"]["bclose"], 28, 28)
    box("#icon", *HDR["full"]["icon"]); box("#hero", *hero_lcd())
    for k in ("qr", "steps", "nowlcd", "nextlcd", "radioled"):
        box("#" + k, *WEL[k])
    btn("#signhere", "green", *WEL["signhere"]); btn("#radio", "metal", *WEL["radio"])
    for i, (x, y) in enumerate(WEL["wb"]):
        btn(f"#wb{i}", "metal", x, y, 104, 28)
    box("#case", *WEL["case"]); btn("#netbig", "metal", *WEL["netbig"])
    for i, (x, y) in enumerate(WEL["nl"]):
        btn(f"#nl{i}", "metal", x, y, 78, 30)
    for k in ("timebox", "f_show", "f_track", "f_host", "hostlist", "micsw", "micled", "cleansw", "cleanled"):
        box("#" + k, *MIDC[k])
    for k in ("signout", "modelive", "moderec", "stay", "adsbtn"):
        btn("#" + k, "metal", *MIDC[k])
    btn("#golive", "live", *MIDC["golive"])
    box("#meterbox", *METER["box"]); box("#meter", *METER["canvas"]); box("#fb", *BL["fb"])
    box("#autosw", *BL["autosw"]); box("#autoled", *BL["autoled"]); box("#autolcd", *BL["autolcd"])
    for i, (y0, y1) in enumerate(ZONE_ROWS):
        box(f"#zone{i}", 102, y0, 86, min(y1 - y0, 60))
    btn("#bedsbtn", "metal", *BR["beds"], 40, 20); btn("#allbtn", "metal", *BR["all"], 40, 20)
    box("#playled", *BR["playled"]); box("#search", *BR["search"]); box("#tracks", *BR["tr"]); box("#pads", *BR["padstrip"])
    btn("#tplay", "round", *BR["tplay"], 28, 28); btn("#tfade", "metal", *BR["tfade"]); btn("#bysign", "green", *BR["bysign"])
    for name, (kx, ky) in (("music", BR["kmu"]), ("sfx", BR["ksf"])):
        box(f"#k-{name}", kx - 34, ky - 34, 68, 68)
        box(f"#kv-{name}", kx - KV[0] / 2, ky + 32, *KV)
        o = (KNOB["lg"][0] + 17) * 0.7071
        box(f"#kl-{name}", round(kx - o, 1), round(ky - o, 1))
    for i, (x, y) in enumerate(HELP["doc"]):
        btn(f"#doc{i}", "metal", x, y, 130, 24)
    box("#docview", *HELP["docview"]); box("#setinfo", *SETP["info"])
    for i, (x, y) in enumerate(SETP["b"]):
        btn(f"#sb{i}", "metal", x, y, 150, 28)
    btn(".pop .x", "round", POP[0] - 40, 12, 24, 24)
    box("#noteled", *NOTE["led"]); box("#notetxt", *NOTE["lcd"])
    for i, (x, y) in enumerate(NOTE["b"]):
        btn(f"#noteb{i}", "metal", x, y, 52, 28)
    for k in ("onair", "clock", "status"):
        box("#rail-" + k, *RAIL[k])
    for i, (x, y) in enumerate(RAIL["b"]):
        btn(f"#rail-b{i}", "metal", x, y, 110, 28)
    CSS.append(".led{background-image:var(--s-led)}")
    CSS.append(".sw::before{background-image:var(--s-switch)}")
    CSS.append(".sw.lg::before{background-image:var(--s-switch-lg)}")
    CSS.append("#rail{background-image:var(--s-face-rail)}")
    CSS.append("#note::before{background-image:var(--s-note)}")
    CSS.append("#pop-help::before{background-image:var(--s-pop-help)}")
    CSS.append("#pop-set::before{background-image:var(--s-pop-set)}")
    for th in THEMES:
        v = [f"--k-{k}-{w}x{h}-{s}:url({th}/k-{k}-{w}x{h}-{s}.png)" for (k, w, h) in sorted(BTNS) for s in (0, 1)]
        v += [f"--s-{n}:url({th}/{n}.png)" for n in ("switch", "switch-lg", "led", "cells", "pop-help", "pop-set", "note", "face-rail")]
        CSS.append(f"#stage[data-theme={th}]{{" + ";".join(v) + "}")
        CSS.append(f"#stage[data-theme={th}][data-view=welcome] #face{{background-image:url({th}/face-welcome.png)}}")
        CSS.append(f"#stage[data-theme={th}][data-view=booth] #face{{background-image:url({th}/face-booth.png)}}")
        CSS.append(f"#stage[data-theme={th}][data-view=booth][data-split=split] #face{{background-image:url({th}/face-booth-split.png)}}")
    with open(os.path.join(root, "layout.css"), "w") as f:
        f.write("/* generated by make_assets.py - do not edit */\n" + "\n".join(CSS) + "\n")

# ================================================================ build
def beaver_img(src, size=28, pad=1):
    """The beaver for the header slot: cropped to the drawing, then reduced to panel size (size x size), so it is as low-res as the rest."""
    im = Image.open(src).convert("RGBA")
    im = im.crop(im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox())
    box = size - 2 * pad
    k = min(box / im.width, box / im.height)
    w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
    # reduce in two steps and in premultiplied colour, so the dark outline does not fringe
    big = im.resize((w * 4, h * 4), Image.LANCZOS).resize((w, h), Image.BOX)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(big, ((size - w) // 2, size - pad - h))
    return out


def build(root):
    global T
    write_layout(root)
    for name in THEMES:
        T = THEMES[name]
        out = os.path.join(root, name); os.makedirs(out, exist_ok=True)
        save = lambda im, fn: im.save(os.path.join(out, fn), optimize=True)
        save(face_welcome(), "face-welcome.png")
        save(face_booth(), "face-booth.png"); save(face_booth(True), "face-booth-split.png")
        save(face_rail(), "face-rail.png")
        save(plate(*POP, pop_help), "pop-help.png"); save(plate(*POP, pop_set), "pop-set.png")
        save(plate(*NOTE["size"], note_plate, L=18), "note.png")
        for (k, w, h) in sorted(BTNS):
            for s in (0, 1):
                save(button(k, w, h, s), f"k-{k}-{w}x{h}-{s}.png")
        save(switch_sprite(*SWITCH["sm"]), "switch.png"); save(switch_sprite(*SWITCH["lg"]), "switch-lg.png")
        save(led_sprite(), "led.png"); save(cell_sprite(), "cells.png")
        print("theme", name, "done")
    T = THEMES["day"]
    common = os.path.join(root, "common"); os.makedirs(common, exist_ok=True)
    cd_img().resize((165, 165), Image.LANCZOS).save(os.path.join(common, "cd.png"), optimize=True)
    jewel_img().resize((186, 167), Image.LANCZOS).save(os.path.join(common, "jewelcase.png"), optimize=True)
    for i in range(3):
        album_art(i).save(os.path.join(common, f"art-{i + 1}.png"), optimize=True)
    logo = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logo-source.png")
    if os.path.exists(logo):
        beaver_img(logo).save(os.path.join(common, "beaver.png"), optimize=True)
    with open(os.path.join(root, "tokens.json"), "w") as f:
        json.dump({"panel": [W, H], "shown_at": "2x on 1920x1080", "light": "top-left, 45 degrees", "orange": ORANGE, "green": GREEN,
                   "grain_vs_v1": GRAIN, "themes": THEMES, "button_margin": BM, "knob": KNOB, "knob_value_window": KV, "switch": SWITCH,
                   "layout": {"header": HDR, "hero": HERO, "panels": {"now": P_NOW, "next": P_NEXT, "signin": P_SIGN, "net": P_NET,
                              "booth_left": P_LEFT, "booth_right": P_RIGHT}, "welcome": WEL, "mid": MID, "mid_children": MIDC, "meter": METER,
                              "booth_left": BL, "booth_right": BR, "zone_rows": ZONE_ROWS, "popup": POP, "help": HELP, "settings": SETP,
                              "note": NOTE, "rail": RAIL},
                   "frames": {"switch": "frame (w+8) x (h+8): off, on", "led": [12, 12, ["off", "green", "orange"]],
                              "cells": [26, 9, ["off", "green", "yellow", "orange"]], "k-*": ["-0 = up/off", "-1 = down/on"]}}, f, indent=1)

if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    build(sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "..", "..", "babsonsound-web", "public", "booth-es2"))
