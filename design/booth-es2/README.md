# Booth panel (ES2 look)

The studio PC's booth page (`babsonsound-web/app/booth`) is one hardware panel, 960 x 540, shown doubled on the 1920 x 1080 studio screen.

- `make_assets.py` draws every bitmap (faceplates, keys, switches, lights, meter cells, CD and case) for day and night, and writes
  `layout.css` from the same tables, into `babsonsound-web/public/booth-es2/`. Needs Python with numpy, scipy and Pillow.
  Run it from this folder: `python3 make_assets.py`.
- To move or resize anything, change the layout tables at the top of `make_assets.py` and run it again. Do not edit `layout.css` by hand.
  The ids in the tables are the ids in the React code (`components/booth`).
- `public/booth-es2/es2.css` (type, LCD windows, key text) and `public/booth-es2/fonts/` are written by hand and are not touched by the script.
- `components/booth/es2/painter.ts` paints all live text, icons and dial arcs into 960 x 540 canvases, so everything on the panel is low-res.
- The beaver in the top left is `public/booth/logo.png`, drawn at 28 x 28.
