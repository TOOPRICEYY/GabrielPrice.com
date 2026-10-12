// The replay page, served by worker/flow.js at /admin/flow/replay?key=<day>/<sid> (behind the Access login).
// It shows the visit at the visitor's own viewport: the site loads in an iframe sized to the recorded width and height,
// scaled to fit this window, so a phone visit gets the phone layout whatever device the owner watches on. The page in
// the frame (flow/client.js, #replay=) finds window.__flowReplay here: the visit, its meta (it answers the touch and
// dark-mode media queries the way the visitor's browser did), resize() for the visit's own resizes, and the bar for its
// controls.
export default `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Visit replay</title>
<style>
html,body{margin:0;height:100%;background:#0b1220;color:#e8eefb;font:14px/1.4 system-ui,-apple-system,sans-serif}
body{display:flex;flex-direction:column;overflow:hidden}
#stage{flex:1;min-height:0;display:grid;place-items:center;padding:12px}
#dev{overflow:hidden;background:#fff;box-shadow:0 0 0 2px #2a3550,0 12px 40px rgba(0,0,0,.5);border-radius:6px}
#dev.touch{border-radius:22px;box-shadow:0 0 0 8px #1c2438,0 0 0 10px #2a3550,0 12px 40px rgba(0,0,0,.5)}
#dev iframe{border:0;display:block;transform-origin:0 0}
#bar{padding:0 12px 12px}#bar:empty{display:none}
#bar button{font:inherit}
#msg{padding:16px}
</style></head><body>
<div id="stage"><div id="msg">Loading the visit…</div></div>
<div id="bar"></div>
<script>
(async () => {
  const key = new URLSearchParams(location.search).get('key') || '';
  const stage = document.getElementById('stage'), msg = document.getElementById('msg');
  let res;
  try { res = await fetch('/admin/api/flow/session?key=' + encodeURIComponent(key), { credentials: 'same-origin' }); } catch { res = null; }
  if (!res || !res.ok) { msg.textContent = 'Could not load that visit (' + (res ? res.status : 'offline') + ').'; return; }
  const rec = await res.json(), meta = rec.meta || {};
  const dev = document.createElement('div'), frame = document.createElement('iframe');
  dev.id = 'dev'; dev.className = meta.touch ? 'touch' : ''; frame.title = 'The visit, at the visitor\\'s screen size';
  dev.appendChild(frame); msg.replaceWith(dev);
  // sizes come from the visitor's batch, which anyone can post: keep them to real screen sizes so a forged one can't ask
  // the page for a giant WebGL canvas
  const dim = (v, d) => (v > 0 ? Math.min(4096, Math.max(240, Math.round(v))) : d);
  let w = dim(meta.w, stage.clientWidth - 24), h = dim(meta.h, stage.clientHeight - 24), k = 1;
  function fit() {
    const pad = meta.touch ? 44 : 24; k = Math.min(1.5, (stage.clientWidth - pad) / w, (stage.clientHeight - pad) / h);
    frame.style.width = w + 'px'; frame.style.height = h + 'px'; frame.style.transform = 'scale(' + k + ')';
    dev.style.width = Math.round(w * k) + 'px'; dev.style.height = Math.round(h * k) + 'px';
  }
  // scale: how much the frame is shrunk on this screen, so the page renders only the pixels that show (a desktop visit
  // watched on a phone would otherwise draw a full desktop-sized 3D view at the phone's 3x, more than iOS allows a tab)
  window.__flowReplay = { rec, meta, bar: document.getElementById('bar'), get scale() { return k; }, resize(nw, nh) { if (nw > 0 && nh > 0) { nw = dim(nw, w); nh = dim(nh, h); if (nw !== w || nh !== h) { w = nw; h = nh; fit(); } } } };
  new ResizeObserver(fit).observe(stage);
  fit();
  frame.src = '/#replay=' + encodeURIComponent(key);
})();
</script></body></html>`;
