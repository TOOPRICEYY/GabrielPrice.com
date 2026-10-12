// The owner's analytics page, served by worker/flow.js at /admin/flow (behind the Access login). Self-contained HTML.
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
.scroll{overflow-x:auto}.old{color:var(--muted)}.warn{color:#b26a00}@media (prefers-color-scheme:dark){.warn{color:#ffc46b}}.empty{color:var(--muted);padding:12px 0}
</style></head><body><main>
<h1>Site flow</h1><p class="sub">How visitors move through gabrielprice.com. Your own visits from this browser are not recorded.</p>
<div class="row"><label>Range <select id="days"><option value="1">Today</option><option value="7" selected>7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
<label>Device <select id="dev"><option value="">All</option><option>desktop</option><option>phone</option><option>tablet</option></select></label>
<span id="status" class="sub" style="margin:0"></span></div>
<div class="tiles" id="tiles"></div>
<div class="grid"><div class="card"><h2>Reached each section (% of visits)</h2><div class="bars" id="funnel"></div></div>
<div class="card"><h2>Average seconds spent on each section</h2><div class="bars" id="dwell"></div></div></div>
<div class="card"><h2>Visits</h2><div class="scroll"><table><thead><tr><th>Started</th><th>Length</th><th>Furthest section</th><th>Device</th><th>Size</th><th>From</th><th>Country</th><th class="n">Clicks</th><th class="n">Drove (s)</th><th>Version</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>
</main><script>
try { localStorage.setItem('flow-off', '1'); } catch (e) {}
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (ms) => Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0');
let data = null;
async function load() {
  $('status').textContent = 'Loading…';
  const r = await fetch('/admin/api/flow/sessions?days=' + $('days').value, { credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { $('status').textContent = j.error || ('Error ' + r.status); return; }
  data = j; $('status').textContent = ''; draw();
}
function bars(el, items, unit) {
  const max = Math.max(1e-9, ...items.map((x) => x.v));
  el.innerHTML = items.map((x) => '<div class="l" title="' + esc(x.l) + '">' + esc(x.l) + '</div><div class="track" title="' + esc(x.l) + ': ' + x.v.toFixed(unit === '%' ? 0 : 1) + unit + '"><div class="fill" style="width:' + (100 * x.v / max).toFixed(1) + '%"></div></div><div class="v">' + x.v.toFixed(unit === '%' ? 0 : 1) + unit + '</div>').join('');
}
// Visits recorded on another version are counted by section title, so a section that moved still lines up with today's page.
// key(list, i): the title plus how many times it appeared before, so two sections with the same heading stay distinct.
const key = (list, i) => list[i] + '#' + list.slice(0, i).filter((t) => t === list[i]).length;
function draw() {
  const dev = $('dev').value, V = data.sessions.filter((s) => !dev || s.dev === dev), N = V.length;
  const cur = data.current.sections, L = (s) => data.layouts[s.layout] || data.layouts.legacy || cur;
  const curKeys = cur.map((_, i) => key(cur, i));
  const name = (list, i) => (list[i] ? i + '. ' + list[i] : 'Section ' + i);
  const total = V.reduce((a, s) => a + s.ms, 0), drove = V.filter((s) => s.drive > 0).length;
  const end = V.filter((s) => s.maxS >= L(s).length - 1.5).length, errs = V.filter((s) => s.err > 0).length;
  const older = V.filter((s) => s.layout !== data.current.layout).length;
  const tiles = [[N, 'visits'], [N ? fmt(total / N) : '0:00', 'average length'], [N ? Math.round(100 * end / N) + '%' : '–', 'reached the end'], [N ? Math.round(100 * drove / N) + '%' : '–', 'drove the couch or scooter']];
  if (older) tiles.push([older, 'on an older version']);
  if (errs) tiles.push(['<span class="warn">' + errs + '</span>', 'stopped recording early (the page changed what the recorder reads)']);
  $('tiles').innerHTML = tiles.map(([b, s]) => '<div class="tile"><b>' + b + '</b><span>' + s + '</span></div>').join('');
  if (!N) { $('funnel').innerHTML = $('dwell').innerHTML = '<div class="empty">No visits in this range yet.</div>'; $('rows').innerHTML = ''; return; }
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
    return '<tr><td>' + esc(s.start ? new Date(s.start).toLocaleString() : s.day) + '</td><td class="n">' + fmt(s.ms) + '</td><td>' + esc(L(s)[Math.round(s.maxS)] || 'Section ' + Math.round(s.maxS)) + '</td><td>' + esc(s.dev || '?') + '</td><td>' + esc(s.size || '') + '</td><td>' + esc(s.ref || 'direct') + '</td><td>' + esc(s.cc || '') + '</td><td class="n">' + s.clicks + '</td><td class="n">' + s.drive.toFixed(0) + '</td><td class="' + (isOld ? 'old' : '') + '" title="' + (isOld ? 'Recorded on an older set of sections; counted by section title' : 'Current version') + '">' + esc(s.v || 'before versions') + (isOld ? ' (older)' : '') + (s.err ? ' <span class="warn">⚠</span>' : '') + '</td><td><a href="/#replay=' + encodeURIComponent(s.key) + '" target="_blank" rel="noopener">Replay</a></td></tr>';
  }).join('');
}
$('days').onchange = load; $('dev').onchange = () => data && draw();
load();
</script></body></html>`;
