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
| 12 | how far down an open project page the visitor is (0 to 1), or -1 when none is open. While one is open, 6–11 are that page's camera |
| 13… | while the scooter or the couch can be driven: 1 and `rigs.scKeys`, or 2 and `rigs.coKeys` (src/rigs.js): its pose, speed and steering, and for the scooter run its seed, distance, stars, health and damage per body part |

Visits recorded before October 13, 2026 have only fields 0–11.

Events are `[ms, type, …]`:
- `c`: a click, with x and y as fractions of the viewport, the section, and the label of the button, link or figure that was clicked;
- `v`: a video starting;
- `h`: the tab being hidden;
- `z`: the window being resized;
- `l`: a freeze, the ms the page drew nothing while visible (a quarter second or more). Phones keep scrolling off the main thread during one, so the replay holds still and then jumps; the player says so, and the dashboard counts them beside the frame rate;
- `g`: the browser dropped the 3D view's WebGL context (usually out of GPU memory), with the scroll position. It is sent at once, since the tab may be killed next;
- `r`: that context came back. Android often drops it in the background and restores it, so the dashboard flags a visit as a 3D crash only for a `g` with no `r` after it. The player shows both;
- `e`: the sampler hit an error and stopped (the message);
- `b`: a photo or clip opened in the popup (its file), or `''` when it closed;
- `p`: a project page opened (the project's id), or `''` when it closed;
- `k`: a scooter hazard appeared, as `hazRec()` in src/rigs.js lists it (kind, side, position, size, speed);
- `x`: the rider was hit (body part, health lost, the label shown, whether he fell, and the ragdoll's side when it ended the run);
- `t`: a first-run scooter tip showed (`''` when it went);
- `o`: the couch's boost fired;
- `s`: a scooter star was taken (its number), so a seek just after it keeps the star away until it comes back;
- `f`: a crutch began to fall as the rider neared it (its position), so a seek past it shows it already down.

The games are recorded as state, not replayed from the keys: their hazards are random and their physics depend on the frame rate, so the same keys would play a different game. The player holds the scooter and the couch to the recorded state (`rigs.pin` in src/rigs.js), spawns the recorded hazards and plays the recorded hits, and moves the page's clock with the playhead (stopped while paused, faster at 2× and 4×, still across a seek) so hazards and lap timers keep pace. A replay never posts to the leaderboards or keeps a best score, since it runs in your own browser. Photo popups and project pages open and close as they did, and a project page follows the visitor's scroll and camera.

Key presses are recorded only as the drive-key bitmask, so nothing a visitor types is captured. The first batch also carries viewport size, pixel ratio, touch, language, referring site, dark mode, the page's version and section layout, and, in Chromium browsers, the phone model and OS version (`navigator.userAgentData` client hints). The Worker adds the visitor's IP address and the country, region and city Cloudflare places it in. It also reads the device type (phone, tablet or desktop), model, OS and browser from the user agent and those hints (`device()` in `worker/flow.js`), keeps those four and drops the raw hints. Safari and Firefox never name a phone model, so an iPhone shows only as "iPhone". Chrome on Android sends a frozen "Android 10; K", so without the hints the OS shows only as "Android". Visits recorded before this was added have no OS or browser. No cookies are set (the returning-visitor id below is in localStorage). The first batch also carries the device, read once when the browser is idle (`device()` in `client.js`): screen size and orientation, CPU core count, memory (GB, as the browser rounds it), touch points, graphics chip (WebGL's renderer name), connection type, downlink and round-trip time, data saver, time zone, languages, reduced motion, and how long the 3D scene took to appear and how long until the page's load event (every file it asks for up front). Each batch adds its frame rate. The Worker adds the network provider (ISP, from Cloudflare). DEPLOY.md's privacy note summarises all of this; update both when a field is added.

Returning visitors: once the scene is up and the browser is idle, the recorder reads localStorage `gp.vid` ({id, n, ok, exp}). A live id goes into every batch as `vid` with the visit count `vn`. Without one, it asks `GET /api/flow`, which answers `{ask}` from the visitor's country (`mustAsk()` in `worker/flow.js`: the EU, EEA, UK, Switzerland, or no country). Without `ask` it stores a new id for 13 months (never renewed). With `ask` it shows a small note in the bottom-left corner once the reader is past the opening; Yes stores the id with `ok`, and No or letting the note fade (20 s) stores the refusal for the same time. Batches whose id was kept with a yes carry `vc: 1`; the Worker drops `vid` from a batch that comes from an ask country without it, and never stores `vc`. The dashboard's Visitor column shows the visit number and filters to one device. The hosted page also gets a quiet Privacy link at the end of the gallery, to `/privacy` (`flow/privacy.html`, copied to `dist/` by the build), whose button sets `flow-off` and forgets `gp.vid`. Visits are deleted 90 days after the day they were recorded by a daily cron (`prune()`).

Batches are sent every 30 s, and when the tab is hidden or closed, through `navigator.sendBeacon` as `text/plain` (no CORS preflight). A batch also goes out early at 200 samples or 400 events, since a driven vehicle's state makes each sample longer and the Worker takes at most 64 KB. A visit is capped at 30 minutes and 150 batches. Recording is skipped for Global Privacy Control, Do Not Track, automated browsers, `#edit`, and any browser that has opened `/admin/flow` (that page sets localStorage `flow-off`). The Worker also drops batches from headless Chrome, Lighthouse and crawlers, which covers test rigs that hide `navigator.webdriver`. A test that overrides `navigator.webdriver` to record a visit must capture `/api/flow` in the page (wrap `navigator.sendBeacon`) or run against a local server, so its visits never reach the live bucket.

## New versions of the page

A recording holds numbers, not the page, so it is read against whatever version is live when you open it. Two things keep old visits meaningful:

- **Layouts.** `scripts/build.mjs` stamps the page with `window.__flowBuild`: the commit, the section titles (each section's first heading, or its `aria-label`), and `layout`, the first 12 hex digits of the SHA-256 of that title list. Every visit's first batch carries all three. The first visit on a layout also stores its title list at `layout/<hash>.json` in the bucket, but only when the titles really hash to that name. The dashboard counts and labels each visit by its own titles, so a section that moved or got renumbered still lines up. A section that was removed simply stops counting. Visits from before versions existed are read against the layout that was live when their first batch arrived (`LEGACY` in `worker/flow.js`: PR #6's 18 sections, then 19 from #7). Replays of those visits get the same title list from `/admin/api/flow/session`.
- **Replays.** When a visit's layout differs from the live page, the player moves each sample to the section with the same title and shows a note that the visit came from an older version. Inside a section the scene is today's: a changed camera key or model shows as it is now.

Capture can also break if the page stops exposing what the sampler reads. `test/flow.test.mjs` checks the built page for each of those hooks, so such a change fails CI instead of silently stopping capture. At runtime the sampler catches any error, records one `e` event and stops. The dashboard then counts and flags those visits.

## Why not a session-replay service

Measured on the fork in headless Chromium (2.1 GHz Xeon, software GL, a scripted 20 s scroll through the page with the mouse moving), timing the capture code itself:

- **This client:** 4 µs per sample. At 10 samples a second that's about 0.0007 ms per 60 fps frame, and roughly 20–40 KB of JSON per minute of activity.
- **rrweb** (what PostHog, Highlight and similar tools use) took a 30 ms snapshot at the start, then ran a DOM-mutation callback every frame, because the render loop rewrites the part-label SVG and opacity each frame. That was about 0.2 ms per frame and 700 KB per minute. Its replays show the HTML cards over an empty canvas, because it doesn't record WebGL.

## Storage and the dashboard

Each batch is stored as `flow/<UTC day>/<sid>/<seq>.json` in the bucket bound as `FLOW`. Its R2 custom metadata holds a summary: furthest `s`, seconds per section, seconds orbiting, driving and aiming, clicks, and device. Listing a day therefore gives the dashboard everything it needs without reading the traces. This works comfortably up to a few thousand visits per range. Beyond that, write the same summaries to Workers Analytics Engine and query it with SQL.

Above the table the dashboard shows, for the visits in range: tiles (visits on the site in the last 2 minutes, average and median length, the share that left within 10 seconds, reached the end or drove, remembered devices, frame rate, load time, returning visitors); visits per day (per hour for Today) stacked by device type; how far each section was reached and how long it held people; where visits ended; a visit-length histogram; a weekday × hour heatmap in the viewer's time zone; where visitors come from (referrer, country, city, browser, window size, language); and the median frame rate by graphics chip and load time by device. Clicking a bar in any of the breakdowns, or a Visitor button in the table, narrows the whole page to those visits; the chips by the filters undo it. Download CSV saves every visit shown with every column. All of it comes from the per-batch summaries, so none of it needs anything new from the visitor.

The Visits table is set up per browser and kept in localStorage `flow-table`: click a heading to sort by it (again to reverse; empty cells stay last), drag a heading to move the column, and use Columns to show, hide or reorder them (some, like Model, Screen, Provider, City and Time zone, start hidden). Group by folds the visits into one line per value (OS, country, device id, version and so on) with its count, average length and how many reached the end; click a group to see its visits, or tick its box to select them all. The columns live in `COLS` in `worker/flow-dashboard.js`.

To delete visits, tick their boxes in the Visits table (shift-click ticks a run, the header box ticks every row shown) and press Delete selected. The dashboard posts the keys to `/admin/api/flow/delete`, which needs the Access login and the editor's `x-editor` header like every other admin write, and removes every batch of each visit from the bucket. Deletion is permanent. A visit that is still in progress can post again afterwards, which brings back only its later batches.

The dashboard's Replay link opens `/admin/flow/replay?key=<day>/<sid>` (`worker/flow-replay.js`), which shows the visit in the visitor's own format. It loads the site in an iframe sized to the visit's recorded width and height and scales it to fit the window, so a phone visit gets the phone layout on any screen. The page in the frame answers the touch (`hover`/`pointer`) and dark-mode media queries the way the visitor's browser did, in the stylesheets and in `matchMedia`, and follows the visit's own resizes (`z` events). Its controls sit in the host page's bar.

The player itself runs in the page at `/#replay=<day>/<sid>`, which also works on its own at the viewer's window size. It gets the merged visit from the frame host, or on its own from `/admin/api/flow/session` (Access login needed), and drives the page:
- it scrolls the window to match `s` and pins it with `__rig.setS`;
- it sets the camera through `window.__cam`;
- it feeds the pointer into `ui.ptr`, so the laser follows it, and lights the drive keys that were held;
- it holds the scooter and the couch to their recorded state and plays the game events (see above).

Visits recorded before October 13, 2026 carry no vehicle state, so their drives run on the live physics from the recorded keys and come out close to what the visitor did but not exact.
