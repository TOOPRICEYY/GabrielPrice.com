// The owner's analytics page, served by worker/flow.js at /admin/flow (behind the Access login). Self-contained HTML.
// Visits can be ticked (shift-click for a run) and deleted from the bucket with "Delete selected".
// Opening it also sets localStorage "flow-off" so the owner's own visits to the site aren't recorded.
export default `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Site flow</title>
<style>
:root{--bg:#f6f9fc;--panel:#fff;--ink:#14213d;--ink2:#4a5874;--muted:#8792a8;--line:#e3e9f2;--bar:#1aa6c9;--bar2:#9adcec}
@media (prefers-color-scheme:dark){:root{--bg:#0d1424;--panel:#141d31;--ink:#e8eefb;--ink2:#a9b5cc;--muted:#6f7c96;--line:#25314a;--bar:#3cc4e4;--bar2:#1f5f72}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:0 0 12px}
.sub{color:var(--ink2);margin:0 0 20px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:20px}
select,button{font:inherit;padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
.tile,.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.tile b{display:block;font-size:24px;font-variant-numeric:tabular-nums}.tile span{color:var(--ink2);font-size:13px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}@media (max-width:720px){.grid{grid-template-columns:1fr}}
.bars{display:grid;grid-template-columns:minmax(0,11em) 1fr 4.2em;gap:4px 10px;align-items:center;font-size:13px}
.bars .l{color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bars .v{text-align:right;font-variant-numeric:tabular-nums}
.track{height:14px;position:relative}.fill{position:absolute;left:0;top:1px;bottom:1px;background:var(--bar);border-radius:0 4px 4px 0;min-width:2px}
.bars>div:hover .fill,.track:hover .fill{background:var(--bar2)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--ink2);font-weight:600}td.n{text-align:right;font-variant-numeric:tabular-nums}a{color:var(--bar)}
td.ck,th.ck{width:1%;padding-right:0}input[type=checkbox]{width:16px;height:16px;margin:0;vertical-align:middle;accent-color:var(--bar)}
tr.on td{background:color-mix(in srgb,var(--bar) 10%,transparent)}.head{display:flex;align-items:center;gap:10px;margin-bottom:12px}.head h2{margin:0;flex:1}
button.del{border-color:#d9534f;color:#c9302c}button.del:disabled{opacity:.45;border-color:var(--line);color:var(--muted)}@media (prefers-color-scheme:dark){button.del{color:#ff8a85}}
.scroll{overflow-x:auto}.old{color:var(--muted)}.warn{color:#b26a00}@media (prefers-color-scheme:dark){.warn{color:#ffc46b}}.empty{color:var(--muted);padding:12px 0}
</style></head><body><main>
<h1>Site flow</h1><p class="sub">How visitors move through gabrielprice.com. Your own visits from this browser are not recorded.</p>
<div class="row"><label>Range <select id="days"><option value="1">Today</option><option value="7" selected>7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
<label>Device <select id="dev"><option value="">All</option><option>desktop</option><option>phone</option><option>tablet</option></select></label>
<label>OS <select id="os"><option value="">All</option></select></label>
<span id="status" class="sub" style="margin:0"></span></div>
<div class="tiles" id="tiles"></div>
<div class="grid"><div class="card"><h2>Reached each section (% of visits)</h2><div class="bars" id="funnel"></div></div>
<div class="card"><h2>Average seconds spent on each section</h2><div class="bars" id="dwell"></div></div></div>
<div class="card"><div class="head"><h2>Visits</h2><button class="del" id="del" disabled>Delete selected</button></div><div class="scroll"><table><thead><tr><th class="ck"><input type="checkbox" id="all" title="Select every visit shown" aria-label="Select every visit shown"></th><th>Started</th><th>Length</th><th>Furthest section</th><th>Device</th><th>OS</th><th>Browser</th><th>Size</th><th>Hardware</th><th>GPU</th><th>Network</th><th class="n">FPS</th><th class="n">Load (s)</th><th>From</th><th>Location</th><th>IP</th><th class="n">Clicks</th><th class="n">Drove (s)</th><th>Version</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>
</main><script>
try { localStorage.setItem('flow-off', '1'); } catch (e) {}
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (ms) => Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0');
let data = null, shown = [], last = -1;
const fam = (s) => String(s.os || '').split(' ')[0];
// "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "NVIDIA GeForce RTX 3060"
const gpuName = (g) => { const m = /^ANGLE \\([^,]*, (?:ANGLE Metal Renderer: )?(.+?)(?: \\(0x[0-9a-f]+\\))?(?: Direct3D.*?)?(?: OpenGL.*?)?(?:, [^,]*)?\\)$/i.exec(g || ''); return m ? m[1] : g || ''; };
const median = (a) => { a = a.filter((x) => x > 0).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
const picked = new Set();   // keys of the ticked visits
async function load() {
  $('status').textContent = 'Loading…';
  const r = await fetch('/admin/api/flow/sessions?days=' + $('days').value, { credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { $('status').textContent = j.error || ('Error ' + r.status); return; }
  data = j; $('status').textContent = '';
  // the OS filter lists the families in this range (iOS, Android, Windows …); visits from before OS capture have none
  const pick = $('os').value, fams = [...new Set(data.sessions.map(fam).filter(Boolean))].sort();
  $('os').innerHTML = '<option value="">All</option>' + fams.map((f) => '<option' + (f === pick ? ' selected' : '') + '>' + esc(f) + '</option>').join('');
  draw();
}
function bars(el, items, unit) {
  const max = Math.max(1e-9, ...items.map((x) => x.v));
  el.innerHTML = items.map((x) => '<div class="l" title="' + esc(x.l) + '">' + esc(x.l) + '</div><div class="track" title="' + esc(x.l) + ': ' + x.v.toFixed(unit === '%' ? 0 : 1) + unit + '"><div class="fill" style="width:' + (100 * x.v / max).toFixed(1) + '%"></div></div><div class="v">' + x.v.toFixed(unit === '%' ? 0 : 1) + unit + '</div>').join('');
}
// Visits recorded on another version are counted by section title, so a section that moved still lines up with today's page.
// key(list, i): the title plus how many times it appeared before, so two sections with the same heading stay distinct.
const key = (list, i) => list[i] + '#' + list.slice(0, i).filter((t) => t === list[i]).length;
function draw() {
  const dev = $('dev').value, os = $('os').value, V = data.sessions.filter((s) => (!dev || s.dev === dev) && (!os || fam(s) === os)), N = V.length;
  const cur = data.current.sections, L = (s) => data.layouts[s.layout] || cur;
  const curKeys = cur.map((_, i) => key(cur, i));
  const name = (list, i) => (list[i] ? i + '. ' + list[i] : 'Section ' + i);
  const total = V.reduce((a, s) => a + s.ms, 0), drove = V.filter((s) => s.drive > 0).length;
  const end = V.filter((s) => s.maxS >= L(s).length - 1.5).length, errs = V.filter((s) => s.err > 0).length;
  const older = V.filter((s) => s.layout !== data.current.layout).length;
  const tiles = [[N, 'visits'], [N ? fmt(total / N) : '0:00', 'average length'], [N ? Math.round(100 * end / N) + '%' : '–', 'reached the end'], [N ? Math.round(100 * drove / N) + '%' : '–', 'drove the couch or scooter']];
  const fps = median(V.map((s) => s.fps || 0)), load = median(V.map((s) => s.load || 0));
  if (fps) tiles.push([(fps < 30 ? '<span class="warn">' + fps.toFixed(0) + '</span>' : fps.toFixed(0)) + ' fps', 'median frame rate']);
  if (load) tiles.push([(load / 1000).toFixed(1) + ' s', 'median time until the 3D scene is up']);
  if (older) tiles.push([older, 'on an older version']);
  if (errs) tiles.push(['<span class="warn">' + errs + '</span>', 'stopped recording early (the page changed what the recorder reads)']);
  $('tiles').innerHTML = tiles.map(([b, s]) => '<div class="tile"><b>' + b + '</b><span>' + s + '</span></div>').join('');
  shown = V.slice(0, 300).map((s) => s.key);
  for (const k of [...picked]) if (!shown.includes(k)) picked.delete(k);   // only rows on screen stay ticked
  if (!N) { $('funnel').innerHTML = $('dwell').innerHTML = '<div class="empty">No visits in this range yet.</div>'; $('rows').innerHTML = ''; ticks(); return; }
  const reached = curKeys.map(() => 0), dwell = curKeys.map(() => 0);
  for (const s of V) {
    const list = L(s), keys = list.map((_, i) => key(list, i));
    const seen = new Set(keys.filter((_, i) => s.maxS >= i - 0.5));
    curKeys.forEach((k, j) => { if (seen.has(k)) reached[j]++; });
    for (const [i, t] of Object.entries(s.dwell)) { const j = curKeys.indexOf(keys[+i]); if (j >= 0) dwell[j] += t; }
  }
  bars($('funnel'), cur.map((_, i) => ({ l: name(cur, i), v: 100 * reached[i] / N })), '%');
  bars($('dwell'), cur.map((_, i) => ({ l: name(cur, i), v: dwell[i] / N })), 's');
  $('rows').innerHTML = V.slice(0, 300).map((s) => {
    const isOld = s.layout !== data.current.layout;
    const on = picked.has(s.key);
    return '<tr' + (on ? ' class="on"' : '') + '><td class="ck"><input type="checkbox" data-key="' + esc(s.key) + '"' + (on ? ' checked' : '') + ' aria-label="Select this visit"></td><td>' + esc(s.start ? new Date(s.start).toLocaleString() : s.day) + '</td><td class="n">' + fmt(s.ms) + '</td><td>' + esc(L(s)[Math.round(s.maxS)] || 'Section ' + Math.round(s.maxS)) + '</td><td>' + esc(s.dev || '?') + (s.model ? ' <span class="old">· ' + esc(s.model) + '</span>' : '') + '</td><td>' + esc(s.os || '') + '</td><td>' + esc(s.browser || '') + '</td><td title="' + esc(s.scr ? 'Screen ' + s.scr + (s.dpr ? ' at ' + s.dpr + 'x' : '') : '') + '">' + esc(s.size || '') + '</td><td>' + esc([s.cores ? s.cores + ' cores' : '', s.mem ? s.mem + ' GB' : ''].filter(Boolean).join(' · ')) + '</td><td title="' + esc(s.gpu || '') + '" style="max-width:14em;overflow:hidden;text-overflow:ellipsis">' + esc(gpuName(s.gpu)) + '</td><td title="' + esc(s.tz || '') + '">' + esc([s.net, s.isp].filter(Boolean).join(' · ')) + '</td><td class="n">' + (s.fps ? (s.fps < 30 ? '<span class="warn">' + s.fps.toFixed(0) + '</span>' : s.fps.toFixed(0)) : '') + '</td><td class="n" title="' + (s.full ? 'Every build loaded at ' + (s.full / 1000).toFixed(1) + ' s' : '') + '">' + (s.load ? (s.load / 1000).toFixed(1) : '') + '</td><td>' + esc(s.ref || 'direct') + '</td><td>' + esc([s.city, s.region, s.cc].filter(Boolean).join(', ')) + '</td><td>' + esc(s.ip || '') + '</td><td class="n">' + s.clicks + '</td><td class="n">' + s.drive.toFixed(0) + '</td><td class="' + (isOld ? 'old' : '') + '" title="' + (isOld ? 'Recorded on an older set of sections; counted by section title' : 'Current version') + '">' + esc(s.v || 'before versions') + (isOld ? ' (older)' : '') + (s.err ? ' <span class="warn">⚠</span>' : '') + '</td><td><a href="/admin/flow/replay?key=' + encodeURIComponent(s.key) + '" target="_blank" rel="noopener">Replay</a></td></tr>';
  }).join('');
  ticks();
}
// the button and the select-all box follow the ticks
function ticks() {
  const n = picked.size, all = $('all');
  $('del').disabled = !n; $('del').textContent = n ? 'Delete selected (' + n + ')' : 'Delete selected';
  all.checked = n > 0 && n === shown.length; all.indeterminate = n > 0 && n < shown.length; all.disabled = !shown.length;
}
function tick(key, on) {
  if (on) picked.add(key); else picked.delete(key);
  const box = $('rows').querySelector('input[data-key="' + CSS.escape(key) + '"]');
  if (box) { box.checked = on; box.closest('tr').classList.toggle('on', on); }
}
$('rows').addEventListener('click', (e) => {
  const box = e.target.closest('input[data-key]'); if (!box) return;
  const i = shown.indexOf(box.dataset.key);
  // shift-click ticks (or unticks) the whole run from the last box clicked
  if (e.shiftKey && last >= 0 && i >= 0) for (let j = Math.min(i, last); j <= Math.max(i, last); j++) tick(shown[j], box.checked);
  else tick(box.dataset.key, box.checked);
  last = i; ticks();
});
$('all').onchange = () => { const on = $('all').checked; for (const k of shown) tick(k, on); last = -1; ticks(); };
$('del').onclick = async () => {
  const keys = [...picked], n = keys.length;
  if (!n || !confirm('Delete ' + (n === 1 ? 'this visit' : 'these ' + n + ' visits') + ' for good? Their replays go too.')) return;
  $('del').disabled = true; $('status').textContent = 'Deleting…';
  let r = null, j = {};
  try {
    r = await fetch('/admin/api/flow/delete', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-editor': '1' }, body: JSON.stringify({ keys }) });
    j = await r.json().catch(() => ({}));
  } catch (e) {}
  if (!r || !r.ok) { $('status').textContent = 'Could not delete: ' + (j.error || (r ? 'error ' + r.status : 'offline')); ticks(); return; }
  const gone = new Set(keys);
  data.sessions = data.sessions.filter((s) => !gone.has(s.key));
  picked.clear(); last = -1;
  $('status').textContent = 'Deleted ' + j.deleted + (j.deleted === 1 ? ' visit.' : ' visits.');
  draw();
};
$('days').onchange = () => { picked.clear(); last = -1; load(); }; $('dev').onchange = $('os').onchange = () => { last = -1; if (data) draw(); };
load();
</script></body></html>`;
