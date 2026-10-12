// User flow capture and replay for the hosted site. scripts/build.mjs inlines this file into dist/index.html only;
// the claude.ai artifact build doesn't include it.
//
// Capture: 10 times a second, read the state the page already computes (window.__rig: scroll position s, camera,
// pointer, drive keys) and keep a sample when anything changed. Batches go to POST /api/flow every 30 s and when the tab
// is hidden or closed. No listeners on scroll or pointer (the page tracks both already), no DOM observation, no cookies.
// Measured cost: about 4 µs per sample, so well under 0.001 ms per frame (see flow/README.md).
// The only listeners are a click, a video play, resizes, tab hiding, and a finger counter on touch start and end.
// Skipped for Global Privacy Control / Do Not Track, automated browsers, and the owner (opening /admin/flow sets
// localStorage "flow-off").
//
// Replay: /#replay=<day>/<sid> loads a recorded visit from /admin/api/flow/session (Access login needed) and plays it
// back in the live 3D scene through the same hooks the editor's notes use (__rig.setS, window.__cam). The dashboard opens it
// inside /admin/flow/replay (the Worker's flow-replay module), which frames the page at the visitor's own viewport size; there the
// page takes the visit from that frame host, answers the touch and dark-mode media queries the way the visitor's
// browser did, and puts its controls in the host's bar.
//
// Sample: [t ms, s, free 0|1, pointer x, pointer y (0..1 of the viewport, -1 when idle), keys bitmask,
//          camera x, y, z, look x, y, z]. Events: [t ms, type, ...]: c click (x, y, section, label), v video play,
//          h tab hidden, z resize (w, h), l stall (ms the page drew nothing), g the 3D view lost its GPU context (s), r it came back, e capture error (message). The first batch's meta carries the site version and its
//          section layout (window.__flowBuild, written by scripts/build.mjs), so visits stay readable after the page changes.
//          It also carries the phone model and OS version where the browser offers them (Chromium's user-agent client hints);
//          the Worker reads the device type, OS and browser from the user agent itself. And the device (hw): screen size and
//          orientation, CPU cores, memory, GPU, network, time zone, languages, reduced motion, and how long the 3D scene took
//          to appear (load) and to finish loading every build (full). All of it is read once, in the first batch; each batch adds only its average frame rate (fps).
(() => {
  const HZ = 10, FLUSH_MS = 30000, MAX_SEQ = 60, MAX_MS = 30 * 60 * 1000;
  const KEYS = ['w', 'a', 's', 'd', 'q', 'e', ' ', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
  const hash = location.hash;
  const BUILD = window.__flowBuild || { version: 'dev', layout: '', sections: [] };

  if (hash.startsWith('#replay=')) {
    const host = replayHost();
    if (host) emulate(host.meta || {});
    waitRig(() => replay(decodeURIComponent(hash.slice(8)), host));
    return;
  }

  let off = false;
  try { off = localStorage.getItem('flow-off') === '1'; } catch {}
  if (off || hash === '#edit' || navigator.globalPrivacyControl || navigator.doNotTrack === '1' || navigator.webdriver) return;

  const sid = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const day = new Date().toISOString().slice(0, 10);
  const t0 = performance.now();
  let samples = [], events = [], seq = 0, last = null, lastT = -1e9, lastFlush = t0, stopped = false, hw = null, hwSent = false, ready = 0, full = 0, fullSent = false;
  // frame rate: frames and visible time since the last batch. A freeze counts as the time it took (it is what the visitor
  // saw); hidden time doesn't, since visibilitychange resets prevT
  let frames = 0, frameMs = 0, prevT = 0, stalls = 0;
  const now = () => Math.round(performance.now() - t0);
  // model ('Pixel 8', '' on desktops) and OS version ('14.0.0'; Windows 11 reports 13+): Chromium only, and asynchronous,
  // but answered long before the first batch goes out
  let hints = null;
  try { navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion']).then((h) => { hints = { model: h.model || '', pv: h.platformVersion || '' }; }, () => {}); } catch {}

  waitRig((rig) => {
    const dir = new rig.THREE.Vector3();
    // read when the browser is idle, so it never lands in a frame
    ready = performance.now();
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 2000));
    idle(() => { try { hw = device(); } catch {} }, { timeout: 5000 });
    function tick(t) {
      if (stopped) return;
      if (prevT && document.visibilityState === 'visible') { frames++; frameMs += Math.min(60000, t - prevT); }
      // a stall: the page drew nothing for a quarter second or more while visible. The phone kept scrolling (it scrolls
      // off the main thread) but no sample could be taken, so the replay holds still there; this marks why.
      if (prevT && t - prevT >= 250 && stalls < 40 && document.visibilityState === 'visible') { stalls++; events.push([now(), 'l', Math.min(600000, Math.round(t - prevT))]); }
      prevT = t;
      try { sample(t); } catch (err) { fail(err); return; }
      requestAnimationFrame(tick);
    }
    function sample(t) {
      if (t - lastT >= 1000 / HZ) {
        lastT = t;
        if (!full && rig.rigs.ready) full = Math.round(performance.now());   // every build's model loaded
        const cam = rig.camera, p = cam.position, ui = rig.ui;
        cam.getWorldDirection(dir);
        // a mouse stays where it was left; a finger is only there while it touches (the page keeps the last touch point
        // for 4 s for its laser, which would read as a tap that never lifted). A pointer last moved before the last finger
        // lifted was that finger; one moved since is a mouse, stylus or trackpad, so hybrid devices get both right.
        const live = ui.ptr && performance.now() - ui.ptrT < 4000 && (fingers > 0 || ui.ptrT > liftT);
        let keys = 0;
        const held = [rig.rigs.couch && rig.rigs.couch.keys, rig.rigs.scooter && rig.rigs.scooter.keys];
        for (let i = 0; i < KEYS.length; i++) if (held.some((k) => k && k.has(KEYS[i]))) keys |= 1 << i;
        const x = [now(), r3(rig.s), rig.free.on ? 1 : 0, live ? r3(ui.ptr.x / innerWidth) : -1, live ? r3(ui.ptr.y / innerHeight) : -1, keys,
          r2(p.x), r2(p.y), r2(p.z), r2(p.x + dir.x * 100), r2(p.y + dir.y * 100), r2(p.z + dir.z * 100)];
        let same = !!last;
        for (let i = 1; same && i < x.length; i++) if (x[i] !== last[i]) same = false;
        if (!same) { samples.push(x); last = x; }
        if (t - lastFlush > FLUSH_MS) flush();
        if (t - t0 > MAX_MS) { flush(); stopped = true; }
      }
    }
    requestAnimationFrame(tick);
  }, () => fail(new Error('window.__rig never appeared')));

  // a page change that renames what the sampler reads lands here: report it once so the dashboard shows it, then stop
  function fail(err) {
    if (stopped) return;
    stopped = true;
    events.push([now(), 'e', String(err && err.message || err).slice(0, 80)]);
    flush();
  }

  // fingers on the screen, and when the last one lifted: set on touch start and end, nothing per move
  let fingers = 0, liftT = -1e9;
  const fingersNow = (e) => { fingers = e.touches.length; if (!fingers) liftT = performance.now(); };
  for (const t of ['touchstart', 'touchend', 'touchcancel']) document.addEventListener(t, fingersNow, { capture: true, passive: true });
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const hit = el && el.closest('button, a, summary, figure, [role=button], input, label');
    const sec = el && el.closest('section[data-s]');
    const label = hit ? (hit.getAttribute('aria-label') || hit.textContent || hit.tagName).trim().replace(/\s+/g, ' ').slice(0, 60) : '';
    events.push([now(), 'c', r3(e.clientX / innerWidth), r3(e.clientY / innerHeight), sec ? +sec.dataset.s : -1, label]);
  }, { capture: true, passive: true });
  document.addEventListener('play', (e) => {
    const v = e.target, sec = v.closest && v.closest('section[data-s]');
    events.push([now(), 'v', sec ? +sec.dataset.s : -1, (v.getAttribute('aria-label') || '').slice(0, 60)]);
  }, { capture: true, passive: true });
  // one z event per burst (a rotation or a URL bar sliding fires several), stamped when the burst began, with the final size
  let rz = 0, rzT = -1;
  addEventListener('resize', () => {
    if (rzT < 0) rzT = now();
    clearTimeout(rz); rz = setTimeout(() => { events.push([rzT, 'z', innerWidth, innerHeight]); rzT = -1; }, 500);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    prevT = 0;   // frames stop while hidden: the gap until the first frame back is not a freeze
    if (document.visibilityState === 'hidden') { events.push([now(), 'h']); flush(); }
  });
  addEventListener('pagehide', flush);
  // the phone dropped the page's WebGL context (out of GPU memory, usually): mark where, and send it now, since the tab
  // may be killed next. Often the context comes back (Android drops it in the background), so that is marked too, and
  // only a loss with no return counts as a crash. The events don't bubble, so they are caught on the way down; nothing
  // runs until one fires.
  let glLost = 0, glDown = false;
  const stage = (e) => e.target instanceof Element && e.target.id === 'stage';
  document.addEventListener('webglcontextlost', (e) => {
    if (!stage(e) || glDown) return;
    glDown = true;
    events.push([now(), 'g', window.__rig ? r3(window.__rig.s) : -1]);
    if (++glLost <= 5) flush();   // every loss is kept; only the first few go out on their own batch
  }, { capture: true, passive: true });
  document.addEventListener('webglcontextrestored', (e) => { if (stage(e) && glDown) { glDown = false; events.push([now(), 'r']); } }, { capture: true, passive: true });

  function flush() {
    lastFlush = performance.now();
    // a batch with nothing new still goes out to deliver a full-load time or device details that missed the first batch
    const late = seq > 0 && ((full && !fullSent) || (hw && !hwSent));
    if (seq >= MAX_SEQ || (!samples.length && !events.length && seq > 0 && !late)) return;
    const o = { sid, seq, day, samples, events };
    if (seq === 0 && !hw && ready) { try { hw = device(); } catch {} }   // leaving before the idle read: not in a frame either
    if (frameMs > 0) { o.fps = Math.round(frames * 10000 / frameMs) / 10; o.fms = Math.round(frameMs); }   // fms: the visible time it covers
    // every build loaded only after the first batch went out (a slow phone or connection): send it once, now
    if (seq > 0 && full && !fullSent) { o.full = full; fullSent = true; }
    // the first batch left before the scene was up (the tab hidden while it loaded): the device goes in the next one
    if (seq > 0 && hw && !hwSent) { o.hw = { ...hw, load: Math.round(ready), full }; hwSent = true; }
    frames = 0; frameMs = 0; stalls = 0;
    if (seq === 0) o.meta = { w: innerWidth, h: innerHeight, dpr: r2(devicePixelRatio || 1), touch: matchMedia('(pointer: coarse)').matches,
      fg: true, lang: (navigator.language || '').slice(0, 12), ref: refHost(), dark: matchMedia('(prefers-color-scheme: dark)').matches,
      v: BUILD.version, layout: BUILD.layout, sections: BUILD.sections, ...(hints ? { ch: hints } : {}), ...(hw ? { hw: { ...hw, load: Math.round(ready), full } } : {}) };
    if (o.meta && o.meta.hw) { hwSent = true; if (full) fullSent = true; }
    const body = JSON.stringify(o);
    samples = []; events = []; seq++;
    // text/plain keeps it a simple request (no CORS preflight); sendBeacon survives the page closing
    const blob = new Blob([body], { type: 'text/plain' });
    if (!(navigator.sendBeacon && navigator.sendBeacon('/api/flow', blob))) fetch('/api/flow', { method: 'POST', body: blob, keepalive: true }).catch(() => {});
  }
  // the visitor's device, read once when the scene is up: plain property reads, no new contexts or requests. The GPU name
  // comes from the page's own WebGL canvas (#stage), whose context already exists, so asking for it creates nothing.
  function device() {
    const n = navigator, c = n.connection || {}, sc = screen || {};
    let gpu = '';
    try {
      const cv = document.getElementById('stage'), gl = cv && (cv.getContext('webgl2') || cv.getContext('webgl'));
      // Firefox logs a deprecation warning for the extension, and its plain RENDERER already names the GPU
      if (gl) { const x = /Firefox/.test(n.userAgent) ? null : gl.getExtension('WEBGL_debug_renderer_info'); gpu = String(gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ''); }
    } catch {}
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
    return { sw: sc.width || 0, sh: sc.height || 0, orient: (sc.orientation && sc.orientation.type) || '', cores: n.hardwareConcurrency || 0,
      mem: n.deviceMemory || 0, tp: n.maxTouchPoints || 0, gpu: gpu.slice(0, 100), net: c.effectiveType || '', down: c.downlink || 0, rtt: c.rtt || 0,
      save: c.saveData === true, tz, langs: (n.languages || []).slice(0, 4).join(','), motion: matchMedia('(prefers-reduced-motion: reduce)').matches };
  }
  function refHost() { try { const u = new URL(document.referrer); return u.host === location.host ? '' : u.host.slice(0, 80); } catch { return ''; } }

  function waitRig(cb, onTimeout) {
    let n = 0;
    const iv = setInterval(() => {
      if (window.__rig) { clearInterval(iv); cb(window.__rig); } else if (++n > 240) { clearInterval(iv); if (onTimeout) onTimeout(); }
    }, 250);
  }

  // ---------- replay ----------
  // the /admin/flow/replay page framing this one, if any (same origin, so its window is readable)
  function replayHost() {
    try { return window.parent !== window && window.parent.__flowReplay || null; } catch { return null; }
  }

  // Inside the frame host the page already has the visitor's width and height. This makes the rest of the device match:
  // media queries on touch (hover/pointer) and dark mode get the visitor's answers, in the stylesheets and in matchMedia.
  // It runs before the page's module scripts, which read matchMedia once at start.
  function emulate(meta) {
    const want = { 'hover: none': !!meta.touch, 'pointer: coarse': !!meta.touch, 'hover: hover': !meta.touch, 'pointer: fine': !meta.touch,
      'prefers-color-scheme: dark': !!meta.dark, 'prefers-color-scheme: light': !meta.dark };
    const fix = (q) => q.replace(/\(\s*([a-z-]+)\s*:\s*([a-z-]+)\s*\)/g, (m, f, v) => {
      const k = f + ': ' + v;
      return k in want ? (want[k] ? '(min-width: 0px)' : '(max-width: 0.001px)') : m;
    });
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => mm(fix(String(q)));
    const walk = (rules) => {
      for (const r of rules) {
        if (r.media && r.cssRules) { const t = fix(r.media.mediaText); if (t !== r.media.mediaText) r.media.mediaText = t; }
        if (r.cssRules) walk(r.cssRules);
      }
    };
    const sheets = () => { for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch {} } };
    sheets(); document.addEventListener('DOMContentLoaded', sheets); addEventListener('load', sheets);
    // touch screens overlay their scrollbar
    if (meta.touch) document.head.appendChild(Object.assign(document.createElement('style'), { textContent: 'html{scrollbar-width:none}html::-webkit-scrollbar{display:none}' }));
    emulate.sheets = sheets;
  }

  async function replay(key, host) {
    const doc = host ? window.parent.document : document;
    const hud = doc.createElement('div');
    hud.style.cssText = (host ? '' : 'position:fixed;left:12px;bottom:12px;z-index:50;max-width:calc(100vw - 24px);')
      + 'font:13px/1.3 system-ui,sans-serif;background:rgba(10,20,40,.82);color:#fff;padding:8px 10px;border-radius:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    (host ? host.bar : document.body).appendChild(hud);
    if (host && emulate.sheets) emulate.sheets();   // styles the page added after loading
    let rec;
    if (host) rec = host.rec;
    else {
      let res;
      try { res = await fetch('/admin/api/flow/session?key=' + encodeURIComponent(key), { credentials: 'same-origin' }); } catch { res = null; }
      if (!res || !res.ok) {
        hud.innerHTML = res && res.status === 403
          ? 'Replays need you signed in. <a style="color:#7df" href="/admin/login?to=%2Fadmin%2Fflow">Sign in</a>'
          : 'Could not load that visit (' + (res ? res.status : 'offline') + ').';
        return;
      }
      rec = await res.json();
    }
    const S = rec.samples || [], E = (rec.events || []).slice().sort((x, y) => x[0] - y[0]);
    if (!S.length) { hud.textContent = 'That visit has no samples.'; return; }
    // to the last sample or event, whichever is later: a page that froze or crashed while still has its note at the end
    const rig = window.__rig, dur = Math.max(S[S.length - 1][0], E.length ? E[E.length - 1][0] : 0);
    // recorded on another set of sections: move each sample's section to the section with the same title on this page
    const old = rec.meta && rec.meta.layout && rec.meta.layout !== BUILD.layout ? rec.meta.sections || [] : null;
    const remap = old ? old.map((title, i) => { const j = BUILD.sections.indexOf(title); return j >= 0 ? j : Math.min(i, BUILD.sections.length - 1); }) : null;
    const mapS = (x) => { if (!remap || !remap.length) return x; const i = Math.max(0, Math.min(remap.length - 1, Math.floor(x))); return remap[i] + (x - Math.floor(x)); };
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:49;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#ff3d7f;'
      + 'box-shadow:0 0 0 3px rgba(255,61,127,.35);pointer-events:none;display:none';
    document.body.appendChild(dot);
    hud.innerHTML = '<button type="button" data-a="play">Pause</button><button type="button" data-a="speed">1×</button>'
      + '<input type="range" min="0" max="' + dur + '" value="0" style="width:min(320px,50vw)"><span data-a="time"></span><span data-a="stall" style="color:#ffd27d"></span>'
      + '<span style="opacity:.7">' + (rec.meta ? [rec.meta.model, rec.meta.os, rec.meta.browser].filter(Boolean).map((x) => String(x).replace(/[&<>"]/g, '')).concat((rec.meta.touch ? 'touch' : 'mouse') + ' · ' + rec.meta.w + '×' + rec.meta.h).join(' · ') : '') + '</span>'
      + (old || (rec.meta && !rec.meta.layout) ? '<span style="color:#ffd27d;flex-basis:100%">Recorded on an older version of the site'
        + (rec.meta && rec.meta.v ? ' (' + String(rec.meta.v).replace(/[^\w]/g, '') + ')' : '') + '. Sections are matched by title; scenes that changed may not line up.</span>' : '');
    const [bPlay, bSpeed] = hud.querySelectorAll('button'), range = hud.querySelector('input'), time = hud.querySelector('[data-a=time]'), stall = hud.querySelector('[data-a=stall]');
    let stallFrom = 0, stallUntil = 0;
    let playing = true, speed = 1, head = 0, prev = performance.now(), i = 0, ei = 0, lastP = [-1, -1], lastPT = -1e9;
    const touch = !!(rec.meta && rec.meta.touch), fg = !!(rec.meta && rec.meta.fg);
    bPlay.onclick = () => { playing = !playing; bPlay.textContent = playing ? 'Pause' : 'Play'; };
    bSpeed.onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; bSpeed.textContent = speed + '×'; };
    // the visit's own window size at the playhead: the first batch's, then each resize up to it
    const resizeTo = (w, h) => { if (host) host.resize(w, h); };
    range.oninput = () => { head = +range.value; i = 0; ei = 0; lastP = [-1, -1]; lastPT = -1e9; if (rec.meta) resizeTo(rec.meta.w, rec.meta.h); };
    const centers = () => [...document.querySelectorAll('section[data-s]')].map((el) => el.offsetTop + el.offsetHeight * .5);
    let C = centers();
    const fmt = (ms) => Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0');
    const lerp = (a, b, k) => a + (b - a) * k;
    function step(t) {
      const dt = t - prev; prev = t;
      if (playing) head = Math.min(dur, head + Math.max(0, dt) * speed);   // the first frame can start a touch before prev
      while (i < S.length - 1 && S[i + 1][0] <= head) i++;   // up to the last sample, so its state (a lifted finger) applies
      while (i > 0 && S[i][0] > head) i--;
      // a sample is kept only when something changed, so across a gap the state held still until the tick before b:
      // hold a until then and move only over that last tick (a fling after a pause is a jump, not a slow drift)
      const a = S[i], b = S[Math.min(i + 1, S.length - 1)], ta = Math.max(a[0], b[0] - 1000 / HZ);
      const k = b[0] > ta ? Math.max(0, Math.min(1, (head - ta) / (b[0] - ta))) : 0;
      C = centers();   // photos and clips loading move the sections; the page measures them on every scroll too
      const s = mapS(lerp(a[1], b[1], k)), fi = Math.min(C.length - 2, Math.max(0, Math.floor(s)));
      // scroll the page so the cards match, then pin s and the camera to the recording
      scrollTo(0, C[fi] + (s - fi) * (C[fi + 1] - C[fi]) - innerHeight * .5);
      rig.setS(s);
      window.__cam = [[lerp(a[6], b[6], k), lerp(a[7], b[7], k), lerp(a[8], b[8], k)], [lerp(a[9], b[9], k), lerp(a[10], b[10], k), lerp(a[11], b[11], k)]];
      // a finger: visits recorded since fg record it only while it touches; on older ones, show it only while it moves
      if (a[3] >= 0 && (a[3] !== lastP[0] || a[4] !== lastP[1])) { lastP = [a[3], a[4]]; lastPT = a[0]; }
      if (a[3] >= 0 && (!touch || fg || head - lastPT < 600)) {
        const x = a[3] * innerWidth, y = a[4] * innerHeight;
        rig.ui.ptr = { x, y }; rig.ui.ptrT = performance.now();
        dot.style.display = 'block'; dot.style.left = x + 'px'; dot.style.top = y + 'px';
      } else { dot.style.display = 'none'; rig.ui.ptr = null; }   // lifted or idle: the laser and the cat stop following it too
      for (const set of [rig.rigs.couch && rig.rigs.couch.keys, rig.rigs.scooter && rig.rigs.scooter.keys]) {
        if (!set) continue; set.clear();
        KEYS.forEach((key, j) => { if (a[5] & (1 << j)) set.add(key); });
      }
      while (ei < E.length && E[ei][0] <= head) {
        if (E[ei][1] === 'c') ping(E[ei][2] * innerWidth, E[ei][3] * innerHeight);
        else if (E[ei][1] === 'z') resizeTo(E[ei][2], E[ei][3]);
        else if (E[ei][1] === 'l') { stall.textContent = 'Their page froze ' + (E[ei][2] / 1000).toFixed(1) + ' s here'; stallFrom = E[ei][0]; stallUntil = stallFrom + 2500; }
        else if (E[ei][1] === 'g') { stall.textContent = 'Their 3D view dropped out here'; stallFrom = E[ei][0]; stallUntil = stallFrom + 4000; }
        else if (E[ei][1] === 'r') { stall.textContent = 'Their 3D view came back'; stallFrom = E[ei][0]; stallUntil = stallFrom + 2500; }
        ei++;
      }
      if (head > stallUntil || head < stallFrom) stall.textContent = '';
      range.value = head; time.textContent = fmt(head) + ' / ' + fmt(dur);
      requestAnimationFrame(step);
    }
    function ping(x, y) {
      const p = document.createElement('div');
      p.style.cssText = `position:fixed;z-index:49;left:${x}px;top:${y}px;width:36px;height:36px;margin:-18px 0 0 -18px;border:3px solid #ff3d7f;`
        + 'border-radius:50%;pointer-events:none;transition:transform .6s,opacity .6s';
      document.body.appendChild(p);
      requestAnimationFrame(() => { p.style.transform = 'scale(1.8)'; p.style.opacity = '0'; });
      setTimeout(() => p.remove(), 700);
    }
    requestAnimationFrame(step);
  }
})();
