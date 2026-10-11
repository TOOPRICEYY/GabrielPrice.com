# gabrielprice.com

Gabriel Price's portfolio: a scroll-driven three.js page with his builds worn or used by a central figure. This repo is the live site. DEPLOY.md explains the hosting and the one-time setup. README.md is the build log for the page itself.

## Layout

- `src/`: the page. `main.html` plus inlined data (`kicker_data.js`, `figure_data.js`, `workshop_data.js`, `gallery_data.js`), `rigs.js`, `gallery.js` and `editor.js`. `src/build.sh` inlines all of these into `artifact.html` (for a claude.ai artifact) and `index.html` at the repo root. Both outputs are gitignored.
- `photos/`, `holdfast/`, `mittenmade/`: files the page loads by relative path. A new folder of these must be added to `STATIC_DIRS` in `scripts/build.mjs`; `test/build.test.mjs` fails if a referenced file is missing from `dist/`.
- `scripts/build.mjs`: runs `src/build.sh`, then swaps the full editor for its core plus the baked `site-edits/edits.json`, writes `dist/`, and writes the editor UI to `worker/editor-ui.gen.js`.
- `worker/`: the Cloudflare Worker. It serves `dist/` and handles `/admin` (Access login check, the edits PR, notes as issues). Each `/admin` route is one branch in `admin()` in `index.js`.
- `site-edits/edits.json`: edits made in the live editor. It reaches `main` only when Gabriel merges the "Site edits from the editor" PR.

## Commands

`npm ci`, `npm run build`, `npm test`. The tests need no network. For a headless browser check of the page, note that cloud containers can't reach jsdelivr: route `cdn.jsdelivr.net/npm/three@0.160.0/**` to a local `npm install three@0.160.0`, and stub fonts.googleapis.com.

## editor.js has two parts

Everything above the line `/* ===== editor UI ===== */` is the core. Every visitor runs it: it indexes the page, applies edits, and runs the hidden door (three clicks in the top-left 44 px). Keep it small, and never put a closing script tag in it. Everything below the marker is the UI. The artifact build inlines both parts; the hosted build serves the UI only from `/admin/editor-ui.js`, after login.

## Working through site notes

Gabriel's notes are GitHub issues labelled `site-note`. Each issue body ends with a fenced `json site-note` block holding the whole note:

- `s`: scroll position, the same `s` as main.html, so `__rig.setS(s)` reproduces it;
- `camera` {pos, look, fov, free}: if `free` is set he had turned the view himself, and `window.__cam = [pos, look]` reproduces it;
- `target`: an element key such as `s2.div1.h21` with its text `fp`, or a 3D part name, point and bone;
- `screen` and `viewport`: where he clicked, at what size;
- a snapshot at `site-notes/<id>.jpg` on the `site-notes` branch.

For each open note:

1. Make the change on a branch, then open a PR whose body says `Closes #<issue>`. The Actions run comments a preview link on the PR.
2. Comment one plain line on the issue saying what changed. The editor shows the latest issue comment to Gabriel as Claude's reply, with the Claude Code footer stripped.
3. When a note needs his decision instead, ask in the issue comment and leave the issue open.

Never close a note as "not planned". That state means Gabriel deleted it, and the editor hides it.

## Edits from the editor

The page applies edits at load from the baked JSON, so they need no source change. To bake one into the source (when the file gets long, or when an edit has gone stale because its source text changed), apply it to `src/main.html` and remove its entry from `site-edits/edits.json` in the same PR. Each entry's `fp`/`origHtml` is the element's original text and `html` is the new text. `style` and `layout.desktop|phone` become CSS, with phone meaning ≤ 720 px.

## Where the page is developed

Claude threads in the project build the page in `/mnt/project-files/gabrielprice-site-photos`, which is also published as a claude.ai artifact for preview. To ship that work to the live site:

1. Copy its `src/`, `photos/`, `holdfast/`, `mittenmade/` and `README.md` into this repo.
2. Run the build and the tests.
3. Open a PR.

Keep `src/editor.js` identical in both places.
