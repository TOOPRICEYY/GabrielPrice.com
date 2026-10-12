// User flow capture and replay for the hosted site. scripts/build.mjs inlines this file into dist/index.html only;
// the claude.ai artifact build doesn't include it.
//
// Capture: 10 times a second, read the state the page already computes (window.__rig: scroll position s, camera,
// pointer, drive keys) and keep a sample when anything changed. Batches go to POST /api/flow every 30 s and when the tab
// is hidden or closed. No listeners on scroll or pointer (the page tracks both already), no DOM observation, no cookies.
// Measured cost: about 4 µs per sample, so well under 0.001 ms per frame (see flow/README.md).
// Skipped for Global Privacy Control / Do Not Track, automated browsers, and the owner (opening /admin/flow sets
// localStorage "flow-off").
//
// Replay: /#replay=<day>/<sid> loads a recorded visit from /admin/api/flow/session (Access login needed) and plays it
// back in the live 3D scene through the same hooks the editor's notes use (__rig.setS, window.__cam).
//
// Sample: [t ms, s, free 0|1, pointer x, pointer y (0..1 of the viewport, -1 when idle), keys bitmask,
//          camera x, y, z, look x, y, z]. Events: [t ms, type, ...]: c click (x, y, section, label), v video play,
//          h tab hidden, z resize (w, h), e capture error (message). The first batch's meta carries the site version and its
//          section layout (window.__flowBuild, written by scripts/build.mjs), so visits stay readable after the page changes.
(() => {
  const HZ = 10, FLUSH_MS = 30000, MAX_SEQ = 60, MAX_MS = 30 * 60 * 1000;
  const KEYS = ['w', 'a', 's', 'd', 'q', 'e', ' ', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
  const hash = location.hash;
  const BUILD = window.__flowBuild || { version: 'dev', layout: '', sections: [] };

  if (hash.startsWith('#replay=')) { waitRig(() => replay(decodeURIComponent(hash.slice(8)))); return; }

  let off = false;
  try { off = localStorage.getItem('flow-off') === '1'; } catch {}
  if (off || hash === '#edit' || navigator.globalPrivacyControl || navigator.doNotTrack === '1' || navigator.webdriver) return;

  const sid = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const day = new Date().toISOString().slice(0, 10);
  const t0 = performance.now();
  let samples = [], events = [], seq = 0, last = null, lastT = -1e9, lastFlush = t0, stopped = false;
  const now = () => Math.round(performance.now() - t0);

  waitRig((rig) => {
    const dir = new rig.THREE.Vector3();
    function tick(t) {
      if (stopped) return;
      try { sample(t); } catch (err) { fail(err); return; }
      requestAnimationFrame(tick);
    }
    function sample(t) {
      if (t - lastT >= 1000 / HZ) {
        lastT = t;
        const cam = rig.camera, p = cam.position, ui = rig.ui;
        cam.getWorldDirection(dir);
        const live = ui.ptr && performance.now() - ui.ptrT < 4000;
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
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => events.push([now(), 'z', innerWidth, innerHeight]), 500); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { events.push([now(), 'h']); flush(); } });
  addEventListener('pagehide', flush);

  function flush() {
    lastFlush = performance.now();
    if (seq >= MAX_SEQ || (!samples.length && !events.length && seq > 0)) return;
    const o = { sid, seq, day, samples, events };
    if (seq === 0) o.meta = { w: innerWidth, h: innerHeight, dpr: r2(devicePixelRatio || 1), touch: matchMedia('(pointer: coarse)').matches,
      lang: (navigator.language || '').slice(0, 12), ref: refHost(), dark: matchMedia('(prefers-color-scheme: dark)').matches,
      v: BUILD.version, layout: BUILD.layout, sections: BUILD.sections };
    const body = JSON.stringify(o);
    samples = []; events = []; seq++;
    // text/plain keeps it a simple request (no CORS preflight); sendBeacon survives the page closing
    const blob = new Blob([body], { type: 'text/plain' });
    if (!(navigator.sendBeacon && navigator.sendBeacon('/api/flow', blob))) fetch('/api/flow', { method: 'POST', body: blob, keepalive: true }).catch(() => {});
  }
  function refHost() { try { const u = new URL(document.referrer); return u.host === location.host ? '' : u.host.slice(0, 80); } catch { return ''; } }

  function waitRig(cb, onTimeout) {
    let n = 0;
    const iv = setInterval(() => {
      if (window.__rig) { clearInterval(iv); cb(window.__rig); } else if (++n > 240) { clearInterval(iv); if (onTimeout) onTimeout(); }
    }, 250);
  }

  // ---------- replay ----------
  async function replay(key) {
    const hud = document.createElement('div');
    hud.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:50;font:13px/1.3 system-ui,sans-serif;background:rgba(10,20,40,.82);color:#fff;'
      + 'padding:8px 10px;border-radius:10px;display:flex;gap:8px;align-items:center;max-width:calc(100vw - 24px);flex-wrap:wrap';
    document.body.appendChild(hud);
    let res;
    try { res = await fetch('/admin/api/flow/session?key=' + encodeURIComponent(key), { credentials: 'same-origin' }); } catch { res = null; }
    if (!res || !res.ok) {
      hud.innerHTML = res && res.status === 403
        ? 'Replays need you signed in. <a style="color:#7df" href="/admin/login?to=%2Fadmin%2Fflow">Sign in</a>'
        : 'Could not load that visit (' + (res ? res.status : 'offline') + ').';
      return;
    }
    const rec = await res.json(), S = rec.samples || [], E = rec.events || [];
    if (!S.length) { hud.textContent = 'That visit has no samples.'; return; }
    const rig = window.__rig, dur = S[S.length - 1][0];
    // recorded on another set of sections: move each sample's section to the section with the same title on this page
    const old = rec.meta && rec.meta.layout && rec.meta.layout !== BUILD.layout ? rec.meta.sections || [] : null;
    const remap = old ? old.map((title, i) => { const j = BUILD.sections.indexOf(title); return j >= 0 ? j : Math.min(i, BUILD.sections.length - 1); }) : null;
    const mapS = (x) => { if (!remap || !remap.length) return x; const i = Math.max(0, Math.min(remap.length - 1, Math.floor(x))); return remap[i] + (x - Math.floor(x)); };
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:49;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#ff3d7f;'
      + 'box-shadow:0 0 0 3px rgba(255,61,127,.35);pointer-events:none;display:none';
    document.body.appendChild(dot);
    hud.innerHTML = '<button type="button" data-a="play">Pause</button><button type="button" data-a="speed">1×</button>'
      + '<input type="range" min="0" max="' + dur + '" value="0" style="width:min(320px,50vw)"><span data-a="time"></span>'
      + '<span style="opacity:.7">' + (rec.meta ? (rec.meta.touch ? 'touch' : 'mouse') + ' · ' + rec.meta.w + '×' + rec.meta.h : '') + '</span>'
      + (old || (rec.meta && !rec.meta.layout) ? '<span style="color:#ffd27d;flex-basis:100%">Recorded on an older version of the site'
        + (rec.meta && rec.meta.v ? ' (' + String(rec.meta.v).replace(/[^\w]/g, '') + ')' : '') + '. Sections are matched by title; scenes that changed may not line up.</span>' : '');
    const [bPlay, bSpeed] = hud.querySelectorAll('button'), range = hud.querySelector('input'), time = hud.querySelector('[data-a=time]');
    let playing = true, speed = 1, head = 0, prev = performance.now(), i = 0, ei = 0;
    bPlay.onclick = () => { playing = !playing; bPlay.textContent = playing ? 'Pause' : 'Play'; };
    bSpeed.onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; bSpeed.textContent = speed + '×'; };
    range.oninput = () => { head = +range.value; i = 0; ei = 0; };
    const centers = () => [...document.querySelectorAll('section[data-s]')].map((el) => el.offsetTop + el.offsetHeight * .5);
    let C = centers(); addEventListener('resize', () => { C = centers(); });
    const fmt = (ms) => Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0');
    const lerp = (a, b, k) => a + (b - a) * k;
    function step(t) {
      const dt = t - prev; prev = t;
      if (playing) head = Math.min(dur, head + dt * speed);
      while (i < S.length - 2 && S[i + 1][0] <= head) i++;
      while (i > 0 && S[i][0] > head) i--;
      const a = S[i], b = S[Math.min(i + 1, S.length - 1)], k = b[0] > a[0] ? Math.max(0, Math.min(1, (head - a[0]) / (b[0] - a[0]))) : 0;
      const s = mapS(lerp(a[1], b[1], k)), fi = Math.min(C.length - 2, Math.max(0, Math.floor(s)));
      // scroll the page so the cards match, then pin s and the camera to the recording
      scrollTo(0, C[fi] + (s - fi) * (C[fi + 1] - C[fi]) - innerHeight * .5);
      rig.setS(s);
      window.__cam = [[lerp(a[6], b[6], k), lerp(a[7], b[7], k), lerp(a[8], b[8], k)], [lerp(a[9], b[9], k), lerp(a[10], b[10], k), lerp(a[11], b[11], k)]];
      if (a[3] >= 0) {
        const x = a[3] * innerWidth, y = a[4] * innerHeight;
        rig.ui.ptr = { x, y }; rig.ui.ptrT = performance.now();
        dot.style.display = 'block'; dot.style.left = x + 'px'; dot.style.top = y + 'px';
      } else dot.style.display = 'none';
      for (const set of [rig.rigs.couch && rig.rigs.couch.keys, rig.rigs.scooter && rig.rigs.scooter.keys]) {
        if (!set) continue; set.clear();
        KEYS.forEach((key, j) => { if (a[5] & (1 << j)) set.add(key); });
      }
      while (ei < E.length && E[ei][0] <= head) { if (E[ei][1] === 'c') ping(E[ei][2] * innerWidth, E[ei][3] * innerHeight); ei++; }
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
