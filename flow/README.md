# Visitor flow analytics

`client.js` records how a visit moves through the page. `../worker/flow.js` stores the visits in R2 and serves the owner's dashboard at `/admin/flow`. DEPLOY.md section 6 covers the one-time setup.

## What is recorded

The 3D view depends on a few numbers the page already computes every frame, so the client records those numbers instead of the page itself. Ten times a second it reads `window.__rig`, and it keeps a sample only when something changed. Each sample is:

| index | field |
|---|---|
| 0 | ms since load |
| 1 | `s`, the scroll position in sections (main.html's `sNow`) |
| 2 | 1 while the visitor is orbiting the view (`free.on`) |
| 3, 4 | pointer as a fraction of the viewport, or -1 after 4 s idle (the laser aims at it) |
| 5 | bitmask of held drive keys: w a s d q e space shift ↑ ↓ ← → (bits 0–11) |
| 6–8 | camera position |
| 9–11 | a point 100 units ahead of the camera |

Events are `[ms, type, …]`:
- `c`: a click, with x and y as fractions of the viewport, the section, and the label of the button, link or figure that was clicked;
- `v`: a video starting;
- `h`: the tab being hidden;
- `z`: the window being resized.

Key presses are recorded only as the drive-key bitmask, so nothing a visitor types is captured. The first batch also carries viewport size, pixel ratio, touch, language, referring site and dark mode. The Worker adds the country and whether the device is a phone. No cookies are set and no IP addresses are stored.

Batches are sent every 30 s, and when the tab is hidden or closed, through `navigator.sendBeacon` as `text/plain` (no CORS preflight). A visit is capped at 30 minutes and 60 batches. Recording is skipped for Global Privacy Control, Do Not Track, automated browsers, `#edit`, and any browser that has opened `/admin/flow` (that page sets localStorage `flow-off`).

## Why not a session-replay service

Measured on the fork in headless Chromium (2.1 GHz Xeon, software GL, a scripted 20 s scroll through the page with the mouse moving), timing the capture code itself:

- **This client:** 4 µs per sample. At 10 samples a second that's about 0.0007 ms per 60 fps frame, and roughly 20–40 KB of JSON per minute of activity.
- **rrweb** (what PostHog, Highlight and similar tools use) took a 30 ms snapshot at the start, then ran a DOM-mutation callback every frame, because the render loop rewrites the part-label SVG and opacity each frame. That was about 0.2 ms per frame and 700 KB per minute. Its replays show the HTML cards over an empty canvas, because it doesn't record WebGL.

## Storage and the dashboard

Each batch is stored as `flow/<UTC day>/<sid>/<seq>.json` in the bucket bound as `FLOW`. Its R2 custom metadata holds a summary: furthest `s`, seconds per section, seconds orbiting, driving and aiming, clicks, and device. Listing a day therefore gives the dashboard everything it needs without reading the traces. This works comfortably up to a few thousand visits per range. Beyond that, write the same summaries to Workers Analytics Engine and query it with SQL.

Replays open `/#replay=<day>/<sid>`. The client then fetches the merged visit from `/admin/api/flow/session` (Access login needed) and drives the page:
- it scrolls the window to match `s` and pins it with `__rig.setS`;
- it sets the camera through `window.__cam`;
- it feeds the pointer into `ui.ptr`, so the laser follows it, and replays the drive keys.

The couch and scooter physics run live, so a replay of driving is close to what the visitor did but not exact.
