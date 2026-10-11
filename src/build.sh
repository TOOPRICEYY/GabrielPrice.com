#!/bin/sh
# Inlines the mesh data and the device rigs into main.html and writes ../index.html (standalone) and ../artifact.html (body-only, for publishing).
cd "$(dirname "$0")"
python3 - <<'PY'
s = open('main.html').read()
s = s.replace('<script>/*KICKER_DATA*/</script>', '<script>' + open('kicker_data.js').read() + '</script>')
s = s.replace('<script>/*WORKSHOP_DATA*/</script>', '<script>' + open('workshop_data.js').read() + '</script>')
s = s.replace('<script>/*FIGURE_DATA*/</script>', '<script>' + open('figure_data.js').read() + '</script>')
s = s.replace('/*RIGS*/', open('rigs.js').read())
import os
if os.path.exists('gallery.js'):    # project gallery + project pages, after the last section
    s = s.replace('<script>/*GALLERY_DATA*/</script>', '<script>' + open('gallery_data.js').read() + '</script>')
    s = s.replace('<script type="module">/*GALLERY*/</script>', '<script type="module">' + open('gallery.js').read() + '</script>')
if os.path.exists('editor.js'): s = s.replace('<script>/*EDITOR*/</script>', '<script>' + open('editor.js').read() + '</script>')   # owner-only edit mode
open('../artifact.html', 'w').write(s)
open('../index.html', 'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}</style></head><body>' + s + '</body></html>')
PY
