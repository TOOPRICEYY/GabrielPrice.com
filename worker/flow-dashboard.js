// The owner's analytics page, served by worker/flow.js at /admin/flow (behind the Access login). Self-contained HTML.
// Visits can be ticked (shift-click for a run) and deleted from the bucket with "Delete selected".
// Opening it also sets localStorage "flow-off" so the owner's own visits to the site aren't recorded.
// The visits table's columns can be shown, hidden and moved, sorted by clicking a heading, and grouped; this browser remembers how.
// Above it: visits over time, when people visit, where visits end, how long they last, where visitors come from and how the page ran.
// Clicking a bar in any of those narrows the whole page to it (the chips at the top undo that).
// Under the totals: the newest "Follow project" / "I want one!" sign-ups (worker/interest.js); /admin/interest has them all, with CSV and delete.
export default `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Site flow</title>
<style>
:root{--bg:#f6f9fc;--panel:#fff;--ink:#14213d;--ink2:#4a5874;--muted:#8792a8;--line:#e3e9f2;--bar:#1aa6c9;--bar2:#9adcec;
--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s0:#a3abbb;--h1:#cde2fb;--h2:#9ec5f4;--h3:#6da7ec;--h4:#3987e5;--h5:#256abf;--h6:#104281}
@media (prefers-color-scheme:dark){:root{--bg:#0d1424;--panel:#141d31;--ink:#e8eefb;--ink2:#a9b5cc;--muted:#6f7c96;--line:#25314a;--bar:#3cc4e4;--bar2:#1f5f72;
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s0:#56607a;--h1:#184f95;--h2:#256abf;--h3:#3987e5;--h4:#6da7ec;--h5:#9ec5f4;--h6:#cde2fb}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:0 0 12px}
.sub{color:var(--ink2);margin:0 0 20px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:20px}
select,button{font:inherit;padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
.tile,.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.tile b{display:block;font-size:24px;font-variant-numeric:tabular-nums}.tile span{color:var(--ink2);font-size:13px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}@media (max-width:720px){.grid{grid-template-columns:1fr}}
.bars{display:grid;grid-template-columns:minmax(0,11em) 1fr minmax(4.2em,auto);gap:4px 10px;align-items:center;font-size:13px}
.bars .l{color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bars .v{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.track{height:14px;position:relative}.fill{position:absolute;left:0;top:1px;bottom:1px;background:var(--bar);border-radius:0 4px 4px 0;min-width:2px}
.bars>div:hover .fill,.track:hover .fill{background:var(--bar2)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--ink2);font-weight:600}td.n{text-align:right;font-variant-numeric:tabular-nums}a{color:var(--bar)}
td.ck,th.ck{width:1%;padding-right:0}input[type=checkbox]{width:16px;height:16px;margin:0;vertical-align:middle;accent-color:var(--bar)}
tr.on td{background:color-mix(in srgb,var(--bar) 10%,transparent)}.head{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}.head h2{margin:0;flex:1}
button.who{font:inherit;font-size:12px;padding:1px 6px;white-space:nowrap}
th[data-col]{cursor:pointer;user-select:none}th[data-col]:hover{color:var(--ink)}th.drop{box-shadow:inset 2px 0 0 var(--bar)}
tr.grp td{background:color-mix(in srgb,var(--line) 45%,transparent)}button.fold{font:inherit;font-weight:600;border:0;background:none;padding:0 4px 0 0;color:var(--ink)}
.colsP{columns:190px;column-gap:24px;padding:10px 0 14px;border-bottom:1px solid var(--line);margin-bottom:8px;font-size:13px}
.colsP .ci{display:flex;align-items:center;gap:6px;break-inside:avoid;padding:1px 0}.colsP .ci label{flex:1;display:flex;gap:6px;align-items:center}.colsP .ci button{padding:0 6px;font-size:12px}
.colsP .foot{column-span:all;display:flex;gap:10px;align-items:center;margin-top:8px;color:var(--ink2)}
button.del{border-color:#d9534f;color:#c9302c}button.del:disabled{opacity:.45;border-color:var(--line);color:var(--muted)}@media (prefers-color-scheme:dark){button.del{color:#ff8a85}}
.scroll{overflow-x:auto}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}@media (max-width:900px){.grid3{grid-template-columns:1fr 1fr}}@media (max-width:600px){.grid3{grid-template-columns:1fr}}
.card{margin-bottom:0}.full{margin-bottom:20px}.hint{color:var(--muted);font-size:12px;font-weight:400;margin-left:6px}
.bars [data-f]{cursor:pointer}.bars [data-f]:hover~.v,.bars .l[data-f]:hover{color:var(--ink)}.bars .v .old{font-size:11px}
svg .grid{stroke:var(--line);stroke-width:1}svg .base{stroke:var(--muted);stroke-width:1}svg .ax{fill:var(--muted);font-size:11px}
.legend{display:flex;gap:12px;font-size:12px;color:var(--ink2)}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.heat{display:grid;grid-template-columns:2.6em repeat(24,1fr);gap:2px;font-size:11px;color:var(--muted)}.heat .hc{height:16px;border-radius:3px;background:var(--line)}
.heat .hx{text-align:left}.heat .hy{line-height:16px}.heat .l1{background:var(--h1)}.heat .l2{background:var(--h2)}.heat .l3{background:var(--h3)}.heat .l4{background:var(--h4)}.heat .l5{background:var(--h5)}
.heatkey{display:flex;align-items:center;gap:3px;font-size:11px;color:var(--muted);margin-top:8px}.heatkey .hc{width:14px;height:10px;border-radius:2px}
.chips{display:contents}.chip{font-size:13px;padding:3px 10px;border-radius:999px;background:color-mix(in srgb,var(--bar) 12%,var(--panel))}
.tip{position:fixed;z-index:10;pointer-events:none;max-width:320px;padding:6px 9px;border-radius:8px;background:var(--ink);color:var(--panel);font-size:12px;line-height:1.35;box-shadow:0 4px 14px rgba(0,0,0,.18)}.old{color:var(--muted)}.warn{color:#b26a00}@media (prefers-color-scheme:dark){.warn{color:#ffc46b}}.empty{color:var(--muted);padding:12px 0}
td.note{white-space:normal;min-width:16em;max-width:28em}
</style></head><body><main>
<h1>Site flow</h1><p class="sub">How visitors move through gabrielprice.com. Your own visits from this browser are not recorded.</p>
<div class="row"><label>Range <select id="days"><option value="1">Today</option><option value="7" selected>7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
<label>Device <select id="dev"><option value="">All</option><option>desktop</option><option>phone</option><option>tablet</option></select></label>
<label>OS <select id="os"><option value="">All</option></select></label>
<span id="chips" class="chips"></span>
<span id="status" class="sub" style="margin:0"></span></div>
<div class="tiles" id="tiles"></div>
<div class="card full"><div class="head"><h2>Sign-ups <span class="hint" id="signN"></span></h2><a href="/admin/interest">All sign-ups, CSV, delete</a></div>
<div class="scroll"><table><thead><tr><th>When</th><th>Build</th><th>Kind</th><th>Email</th><th>Comment</th><th>Country</th></tr></thead><tbody id="signRows"><tr><td colspan="6" class="empty">Loading…</td></tr></tbody></table></div></div>
<div class="card full"><div class="head"><h2 id="trendT">Visits per day</h2><div class="legend" id="trendKey"></div></div><div id="trend"></div></div>
<div class="grid"><div class="card"><h2>Reached each section (% of visits)</h2><div class="bars" id="funnel"></div></div>
<div class="card"><h2>Average seconds spent on each section</h2><div class="bars" id="dwell"></div></div></div>
<div class="grid"><div class="card"><h2>Where visits ended <span class="hint">furthest section</span></h2><div class="bars" id="exits"></div></div>
<div class="card"><h2>How long visits last</h2><div class="bars" id="lengths"></div></div></div>
<div class="card full"><h2 id="heatT">When people visit <span class="hint">your time zone</span></h2><div class="heat" id="heat"></div>
<div class="heatkey">Fewer <div class="hc" style="background:var(--line)"></div><div class="hc" style="background:var(--h1)"></div><div class="hc" style="background:var(--h2)"></div><div class="hc" style="background:var(--h3)"></div><div class="hc" style="background:var(--h4)"></div><div class="hc" style="background:var(--h5)"></div> More</div></div>
<h2 style="margin:4px 0 10px">Where visitors come from <span class="hint">click a bar to show only those visits</span></h2>
<div class="grid3"><div class="card"><h2>From</h2><div class="bars" id="bRef"></div></div><div class="card"><h2>Country</h2><div class="bars" id="bCountry"></div></div><div class="card"><h2>City</h2><div class="bars" id="bCity"></div></div>
<div class="card"><h2>Browser</h2><div class="bars" id="bBrowser"></div></div><div class="card"><h2>Window size</h2><div class="bars" id="bSize"></div></div><div class="card"><h2>Language</h2><div class="bars" id="bLang"></div></div></div>
<div class="grid"><div class="card"><h2>Frame rate by graphics chip <span class="hint">median, visits</span></h2><div class="bars" id="pGpu"></div></div>
<div class="card"><h2>Time until the 3D scene is up <span class="hint">median, visits</span></h2><div class="bars" id="pLoad"></div></div></div>
<div class="card"><div class="head"><h2>Visits</h2><label>Group by <select id="grp"></select></label><button type="button" id="colsB" aria-expanded="false" aria-controls="colsP">Columns</button><button type="button" id="csv" title="Every visit shown, with every column">Download CSV</button><button class="del" id="del" disabled>Delete selected</button></div>
<div class="colsP" id="colsP" hidden></div><div class="scroll"><table><thead id="thead"></thead><tbody id="rows"></tbody></table></div></div>
</main><script>
try { localStorage.setItem('flow-off', '1'); } catch (e) {}
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (ms) => Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0');
let data = null, shown = [], last = -1;
const fam = (s) => String(s.os || '').split(' ')[0];
// "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "NVIDIA GeForce RTX 3060"
const gpuName = (g) => { const m = /^ANGLE \\([^,]*, (?:ANGLE Metal Renderer: )?(.+?)(?: \\(0x[0-9a-f]+\\))?(?: Direct3D.*?)?(?: OpenGL.*?)?(?:, [^,]*)?\\)$/i.exec(g || ''); return m ? m[1] : g || ''; };
const median = (a) => { a = a.filter((x) => x > 0).sort((x, y) => x - y); const h = a.length >> 1; return !a.length ? 0 : a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
const picked = new Set();   // keys of the ticked visits
let busy = false;   // a delete is under way: the minute refresh waits
let loads = 0, failed = false;   // only the latest request counts (a range change can overtake a refresh)
async function load(quiet) {
  const n = ++loads;
  if (!quiet) $('status').textContent = 'Loading…';
  const r = await fetch('/admin/api/flow/sessions?days=' + $('days').value, { credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (n !== loads) return;
  if (!r.ok) { $('status').textContent = j.error || ('Error ' + r.status); failed = true; return; }
  data = j; if (!quiet || failed) $('status').textContent = ''; failed = false;
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
// the visits the page is about: the range, the Device and OS selects, and any filters picked from the charts
const view = () => { const dev = $('dev').value, os = $('os').value;
  return data.sessions.filter((s) => (!dev || s.dev === dev) && (!os || fam(s) === os) && [...filters].every(([id, v]) => String(C[id].group(s) || '') === v)); };
function draw() {
  const V = view(), N = V.length;
  chips();
  const cur = data.current.sections;
  const curKeys = cur.map((_, i) => key(cur, i));
  const name = (list, i) => (list[i] ? i + '. ' + list[i] : 'Section ' + i);
  const total = V.reduce((a, s) => a + s.ms, 0), drove = V.filter((s) => s.drive > 0).length;
  const end = V.filter((s) => s.maxS >= L(s).length - 1.5).length, errs = V.filter((s) => s.err > 0).length;
  const older = V.filter((s) => s.layout !== data.current.layout).length;
  const devices = new Set(V.map((s) => s.vid).filter(Boolean)).size, quick = V.filter((s) => s.ms < 10e3).length;
  const live = V.filter((s) => Date.now() - Date.parse(s.start || 0) - s.ms < 120e3).length;   // a batch in the last 2 minutes
  const tiles = [[N, 'visits'], [N ? fmt(total / N) : '0:00', 'average length'], [N ? fmt(median(V.map((s) => s.ms))) : '0:00', 'median length'],
    [N ? Math.round(100 * quick / N) + '%' : '–', 'left within 10 seconds'], [N ? Math.round(100 * end / N) + '%' : '–', 'reached the end'], [N ? Math.round(100 * drove / N) + '%' : '–', 'drove the couch or scooter']];
  if (live) tiles.unshift([live, 'on the site now']);
  if (devices) tiles.push([devices, devices === 1 ? 'remembered device' : 'remembered devices']);
  const fps = median(V.map((s) => s.fps || 0)), load = median(V.map((s) => s.load || 0));
  if (fps) tiles.push([(fps < 30 ? '<span class="warn">' + fps.toFixed(0) + '</span>' : fps.toFixed(0)) + ' fps', 'median frame rate']);
  if (load) tiles.push([(load / 1000).toFixed(1) + ' s', 'median time until the 3D scene is up']);
  const gl = V.filter((s) => s.gl > 0).length;
  if (gl) tiles.push(['<span class="warn">' + gl + '</span>', 'had the 3D view crash']);
  const back = V.filter((s) => s.vn > 1).length;
  if (back) tiles.push([back, 'by a returning visitor']);
  if (older) tiles.push([older, 'on an older version']);
  if (errs) tiles.push(['<span class="warn">' + errs + '</span>', 'stopped recording early (the page changed what the recorder reads)']);
  $('tiles').innerHTML = tiles.map(([b, s]) => '<div class="tile"><b>' + b + '</b><span>' + s + '</span></div>').join('');
  table(V); insights(V);
  if (!N) { $('funnel').innerHTML = $('dwell').innerHTML = '<div class="empty">No visits in this range yet.</div>'; return; }
  const reached = curKeys.map(() => 0), dwell = curKeys.map(() => 0);
  for (const s of V) {
    const list = L(s), keys = list.map((_, i) => key(list, i));
    const seen = new Set(keys.filter((_, i) => s.maxS >= i - 0.5));
    curKeys.forEach((k, j) => { if (seen.has(k)) reached[j]++; });
    for (const [i, t] of Object.entries(s.dwell)) { const j = curKeys.indexOf(keys[+i]); if (j >= 0) dwell[j] += t; }
  }
  bars($('funnel'), cur.map((_, i) => ({ l: name(cur, i), v: 100 * reached[i] / N })), '%');
  bars($('dwell'), cur.map((_, i) => ({ l: name(cur, i), v: dwell[i] / N })), 's');
}
// ---------- the visits table ----------
const L = (s) => data.layouts[s.layout] || data.current.sections;   // the section titles of the version the visit saw
const far = (s) => L(s)[Math.round(s.maxS)] || 'Section ' + Math.round(s.maxS);
// the same, as the funnel's key (title#occurrence), so two sections with one title stay apart
const farKey = (s) => { const list = L(s), i = Math.round(s.maxS); return list[i] ? key(list, i) : 'Section ' + i; };
const area = (x) => { const m = /(\\d+)\\D+(\\d+)/.exec(x || ''); return m ? m[1] * m[2] : null; };
const pos = (x) => (x > 0 ? x : null);   // 0 means not measured: sorts last, like an empty cell
const hw = (s) => [s.cores ? s.cores + ' cores' : '', s.mem ? s.mem + ' GB' : ''].filter(Boolean).join(' · ');
const loc = (s) => [s.city, s.region, s.cc].filter(Boolean).join(', ');
const fpsTip = (s) => [s.stalls ? 'Froze ' + s.stalls + (s.stalls === 1 ? ' time, ' : ' times, ') + (s.stallMs / 1000).toFixed(1) + ' s in all' : '', s.gl > 0 ? 'The 3D view crashed' + (s.gl > 1 ? ' ' + s.gl + ' times' : '') : ''].filter(Boolean).join('. ');
const isOld = (s) => s.layout !== data.current.layout;
// Each column: heading h (gh names it in "Group by"), cell html, the value it sorts by, and the group a visit falls in (name: how a group is labelled).
// n: numbers, right-aligned, first click sorts largest first. off: hidden until switched on in Columns.
const COLS = [
  { id: 'start', h: 'Started', gh: 'Day', down: 1, cell: (s) => esc(s.start ? new Date(s.start).toLocaleString() : s.day), sort: (s) => s.start || s.day, group: (s) => s.day },
  { id: 'vid', h: 'Visitor', gh: 'Visitor (device)', tip: () => 'Returning visitors: the device keeps an id (asked first in the EU, EEA, UK and Switzerland)',
    cell: (s) => (s.vid ? '<button type="button" class="who" data-vid="' + esc(s.vid) + '" title="Show only visits from this device">' + (s.vn > 1 ? 'Visit ' + s.vn : 'First visit') + '</button>' : ''),
    sort: (s) => (s.vid ? s.vid + String(s.vn || 0).padStart(4, '0') : null), group: (s) => s.vid, name: (l) => (l === '(none)' ? 'Not remembered' : 'Device ' + l.slice(0, 8)) },
  { id: 'len', h: 'Length', n: 1, cell: (s) => fmt(s.ms), sort: (s) => s.ms },
  { id: 'far', h: 'Furthest section', down: 1, cell: (s) => esc(far(s)), sort: (s) => s.maxS, group: farKey,
    name: (g) => { const cur = data.current.sections, i = cur.findIndex((_, j) => key(cur, j) === g); return i >= 0 ? i + '. ' + cur[i] : g.slice(0, g.lastIndexOf('#')) || g; } },
  { id: 'dev', h: 'Device', cell: (s) => esc(s.dev || '?') + (s.model ? ' <span class="old">· ' + esc(s.model) + '</span>' : ''), sort: (s) => s.dev || null, group: (s) => s.dev },
  { id: 'model', h: 'Model', off: 1, cell: (s) => esc(s.model), sort: (s) => s.model || null, group: (s) => s.model },
  { id: 'os', h: 'OS', cell: (s) => esc(s.os), sort: (s) => s.os || null, group: fam },
  { id: 'browser', h: 'Browser', cell: (s) => esc(s.browser), sort: (s) => s.browser || null, group: (s) => String(s.browser || '').split(' ')[0] },
  { id: 'size', h: 'Size', n: 1, tip: (s) => (s.scr ? 'Screen ' + s.scr + (s.dpr ? ' at ' + s.dpr + 'x' : '') : ''), cell: (s) => esc(s.size), sort: (s) => area(s.size), group: (s) => s.size },
  { id: 'scr', h: 'Screen', n: 1, off: 1, cell: (s) => esc(s.scr), sort: (s) => area(s.scr), group: (s) => s.scr },
  { id: 'dpr', h: 'Pixel ratio', n: 1, off: 1, cell: (s) => (s.dpr ? esc(s.dpr) + 'x' : ''), sort: (s) => pos(+s.dpr), group: (s) => (s.dpr ? s.dpr + 'x' : '') },
  { id: 'hw', h: 'Hardware', n: 1, cell: (s) => esc(hw(s)), sort: (s) => pos((s.cores || 0) * 1000 + (s.mem || 0)), group: hw },
  { id: 'gpu', h: 'GPU', tip: (s) => s.gpu || '', at: ' style="max-width:14em;overflow:hidden;text-overflow:ellipsis"', cell: (s) => esc(gpuName(s.gpu)), sort: (s) => gpuName(s.gpu) || null, group: (s) => gpuName(s.gpu) },
  { id: 'net', h: 'Network', tip: (s) => s.tz || '', cell: (s) => esc([s.net, s.isp].filter(Boolean).join(' · ')), sort: (s) => [s.net, s.isp].filter(Boolean).join(' ') || null, group: (s) => s.net },
  { id: 'isp', h: 'Provider', off: 1, cell: (s) => esc(s.isp), sort: (s) => s.isp || null, group: (s) => s.isp },
  { id: 'fps', h: 'FPS', n: 1, tip: fpsTip, sort: (s) => pos(s.fps),
    cell: (s) => (s.gl > 0 ? '<span class="warn">✕3D</span> ' : '') + (s.stalls ? '<span class="warn">⏸' + s.stalls + '</span> ' : '') + (s.fps ? (s.fps < 30 ? '<span class="warn">' + s.fps.toFixed(0) + '</span>' : s.fps.toFixed(0)) : '') },
  { id: 'stalls', h: 'Freezes', n: 1, off: 1, tip: fpsTip, cell: (s) => (s.stalls ? s.stalls + ' · ' + (s.stallMs / 1000).toFixed(1) + ' s' : ''), sort: (s) => pos(s.stallMs) },
  { id: 'load', h: 'Load (s)', n: 1, tip: (s) => (s.full ? 'Page fully loaded at ' + (s.full / 1000).toFixed(1) + ' s' : ''), cell: (s) => (s.load ? (s.load / 1000).toFixed(1) : ''), sort: (s) => pos(s.load) },
  { id: 'ref', h: 'From', cell: (s) => esc(s.ref || 'direct'), sort: (s) => s.ref || 'direct', group: (s) => s.ref || 'direct' },
  { id: 'loc', h: 'Location', gh: 'Country', name: (l) => { try { return new Intl.DisplayNames(undefined, { type: 'region' }).of(l) || l; } catch (e) { return l; } }, cell: (s) => esc(loc(s)), sort: (s) => [s.cc, s.region, s.city].filter(Boolean).join(' ') || null, group: (s) => s.cc },
  { id: 'city', h: 'City', off: 1, cell: (s) => esc(s.city), sort: (s) => s.city || null, group: (s) => [s.city, s.cc].filter(Boolean).join(', ') },
  { id: 'tz', h: 'Time zone', off: 1, cell: (s) => esc(s.tz), sort: (s) => s.tz || null, group: (s) => s.tz },
  { id: 'lang', h: 'Language', off: 1, cell: (s) => esc(s.lang), sort: (s) => (s.lang ? String(s.lang) : null), group: (s) => s.lang },
  { id: 'ip', h: 'IP', cell: (s) => esc(s.ip), sort: (s) => s.ip || null, group: (s) => s.ip },
  { id: 'clicks', h: 'Clicks', n: 1, cell: (s) => s.clicks, sort: (s) => s.clicks },
  { id: 'drive', h: 'Drove (s)', n: 1, cell: (s) => s.drive.toFixed(0), sort: (s) => s.drive },
  { id: 'v', h: 'Version', cls: (s) => (isOld(s) ? 'old' : ''), tip: (s) => (isOld(s) ? 'Recorded on an older set of sections; counted by section title' : 'Current version'),
    cell: (s) => esc(s.v || 'before versions') + (isOld(s) ? ' (older)' : '') + (s.err ? ' <span class="warn">⚠</span>' : ''), sort: (s) => s.v || null, group: (s) => s.v || 'before versions' },
];
const C = Object.fromEntries(COLS.map((c) => [c.id, c]));
// how the table is set up, kept per browser; columns added since it was saved take their default place and visibility
const PREF = 'flow-table';
let pref = {}; try { pref = JSON.parse(localStorage.getItem(PREF) || '{}') || {}; } catch (e) {}
let order = [], hide = new Set(), sort = { id: 'start', dir: -1 }, group = '';
function setup(p) {
  const known = new Set(p.known || []);
  order = (p.order || []).filter((id) => C[id]);
  COLS.forEach((c, i) => { if (!order.includes(c.id)) order.splice(Math.min(i, order.length), 0, c.id); });
  hide = new Set([...(p.hide || []).filter((id) => C[id]), ...COLS.filter((c) => c.off && !known.has(c.id)).map((c) => c.id)]);
  sort = p.sort && C[p.sort.id] ? p.sort : { id: 'start', dir: -1 };
  group = C[p.group] && C[p.group].group ? p.group : '';
}
setup(pref);
const save = () => { try { localStorage.setItem(PREF, JSON.stringify({ order, hide: [...hide], sort, group, known: COLS.map((c) => c.id) })); } catch (e) {} };
let groups = [], opened = new Set(), sorted = [];   // the groups on screen, and the ones unfolded
const blank = (x) => x == null || x === '';
function table(V) {
  const cols = order.filter((id) => !hide.has(id)).map((id) => C[id]), by = C[sort.id];
  const inV = new Set(V.map((s) => s.key));
  for (const k of [...picked]) if (!inV.has(k)) picked.delete(k);   // ticks follow the filters
  $('thead').innerHTML = '<tr><th class="ck"><input type="checkbox" id="all" title="Select every visit shown" aria-label="Select every visit shown"></th>' + cols.map((c) => {
    const on = c.id === sort.id;
    return '<th draggable="true" data-col="' + c.id + '"' + (c.n ? ' class="n"' : '') + ' aria-sort="' + (on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none') + '" title="' + esc((c.tip && c.id === 'vid' ? c.tip() + '. ' : '') + 'Click to sort, drag to move') + '">' + esc(c.h) + (on ? (sort.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>';
  }).join('') + '<th></th></tr>';
  const cmp = (a, b) => {
    const x = by.sort(a), y = by.sort(b);
    if (blank(x) || blank(y)) return blank(x) - blank(y);   // empty cells last, either way round
    return sort.dir * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }));
  };
  const rows = sorted = V.slice().sort((a, b) => cmp(a, b) || String(b.start || b.day).localeCompare(String(a.start || a.day)));
  const row = (s) => '<tr' + (picked.has(s.key) ? ' class="on"' : '') + '><td class="ck"><input type="checkbox" data-key="' + esc(s.key) + '"' + (picked.has(s.key) ? ' checked' : '') + ' aria-label="Select this visit"></td>'
    + cols.map((c) => { const t = c.tip && c.tip(s), k = [c.n ? 'n' : '', c.cls ? c.cls(s) : ''].filter(Boolean).join(' ');
      return '<td' + (k ? ' class="' + k + '"' : '') + (t ? ' title="' + esc(t) + '"' : '') + (c.at || '') + '>' + c.cell(s) + '</td>'; }).join('')
    + '<td><a href="/admin/flow/replay?key=' + encodeURIComponent(s.key) + '" target="_blank" rel="noopener">Replay</a></td></tr>';
  let html = ''; shown = [];
  if (!group) for (const s of rows.slice(0, 300)) { html += row(s); shown.push(s.key); }
  else {
    // one line per group, largest first (visits without the value last), with its own tick box and averages; click it to see its visits
    const g = new Map();
    for (const s of rows) { const l = String(C[group].group(s) || '') || '(none)'; if (!g.has(l)) g.set(l, []); g.get(l).push(s); }
    groups = [...g].sort((a, b) => (a[0] === '(none)') - (b[0] === '(none)') || b[1].length - a[1].length || a[0].localeCompare(b[0], undefined, { numeric: true }));
    groups.forEach(([l, list], i) => {
      const open = opened.has(l), n = list.length, on = list.filter((s) => picked.has(s.key)).length;
      const end = list.filter((s) => s.maxS >= L(s).length - 1.5).length, avg = list.reduce((a, s) => a + s.ms, 0) / n;
      html += '<tr class="grp"><td class="ck"><input type="checkbox" data-grp="' + i + '"' + (on && on === n ? ' checked' : '') + (on && on < n ? ' data-some="1"' : '') + ' aria-label="Select every visit in this group"></td>'
        + '<td colspan="' + (cols.length + 1) + '"><button type="button" class="fold" data-grp="' + i + '" aria-expanded="' + open + '">' + (open ? '▾ ' : '▸ ') + esc(C[group].name ? C[group].name(l) : l) + '</button> <span class="old">'
        + n + (n === 1 ? ' visit' : ' visits') + ' · average ' + fmt(avg) + ' · ' + Math.round(100 * end / n) + '% reached the end</span></td></tr>';
      if (open) for (const s of list.slice(0, 300)) { html += row(s); shown.push(s.key); }   // each open group shows up to 300
      if (open && n > 300) html += '<tr><td></td><td colspan="' + (cols.length + 1) + '" class="old">Showing the first 300 of ' + n + '. Its tick box still selects all of them.</td></tr>';
    });
  }
  $('rows').innerHTML = html;
  for (const b of $('rows').querySelectorAll('input[data-some]')) b.indeterminate = true;
  ticks();
}
function panel() {
  $('colsP').innerHTML = order.map((id, i) => '<div class="ci"><label><input type="checkbox" data-show="' + id + '"' + (hide.has(id) ? '' : ' checked') + '> ' + esc(C[id].h) + '</label>'
    + '<button type="button" data-mv="' + id + '" data-d="-1"' + (i ? '' : ' disabled') + ' aria-label="Move ' + esc(C[id].h) + ' left">↑</button><button type="button" data-mv="' + id + '" data-d="1"' + (i < order.length - 1 ? '' : ' disabled') + ' aria-label="Move ' + esc(C[id].h) + ' right">↓</button></div>').join('')
    + '<div class="foot"><button type="button" id="colsR">Reset table</button><span>Click a heading to sort, drag it to move it.</span></div>';
}
$('grp').innerHTML = '<option value="">Nothing</option>' + COLS.filter((c) => c.group).map((c) => '<option value="' + c.id + '">' + esc(c.gh || c.h) + '</option>').join('');
$('grp').value = group;
const redraw = () => { save(); if (data) draw(); if (!$('colsP').hidden) panel(); };
$('grp').onchange = () => { group = $('grp').value; opened = new Set(); last = -1; redraw(); };
$('colsB').onclick = () => { const p = $('colsP'); p.hidden = !p.hidden; $('colsB').setAttribute('aria-expanded', String(!p.hidden)); if (!p.hidden) panel(); };
$('colsP').addEventListener('change', (e) => { const id = e.target.dataset.show; if (!id) return; if (e.target.checked) hide.delete(id); else hide.add(id); redraw(); });
$('colsP').addEventListener('click', (e) => {
  if (e.target.id === 'colsR') { setup({}); $('grp').value = ''; opened = new Set(); redraw(); return; }
  const b = e.target.closest('button[data-mv]'); if (!b) return;
  const i = order.indexOf(b.dataset.mv), j = i + Number(b.dataset.d);
  if (j < 0 || j >= order.length) return;
  order.splice(i, 1); order.splice(j, 0, b.dataset.mv); redraw();
  const again = $('colsP').querySelector('button[data-mv="' + b.dataset.mv + '"][data-d="' + b.dataset.d + '"]'); if (again && !again.disabled) again.focus();
});
$('thead').addEventListener('click', (e) => {
  const th = e.target.closest('th[data-col]'); if (!th) return;
  const c = C[th.dataset.col];
  sort = sort.id === c.id ? { id: c.id, dir: -sort.dir } : { id: c.id, dir: c.n || c.down ? -1 : 1 };
  redraw();
});
$('thead').addEventListener('change', (e) => { if (e.target.id !== 'all') return; const on = e.target.checked; for (const k of shown) tick(k, on); last = -1; ticks(); });
// drag a heading onto another to put it there
let dragging = '';
$('thead').addEventListener('dragstart', (e) => { const th = e.target.closest('th[data-col]'); if (!th) return; dragging = th.dataset.col; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragging); });
$('thead').addEventListener('dragover', (e) => { const th = e.target.closest('th[data-col]'); if (!dragging || !th) return; e.preventDefault(); for (const x of $('thead').querySelectorAll('th.drop')) if (x !== th) x.classList.remove('drop'); th.classList.add('drop'); });
$('thead').addEventListener('dragend', () => { dragging = ''; for (const x of $('thead').querySelectorAll('th.drop')) x.classList.remove('drop'); });
$('thead').addEventListener('drop', (e) => {
  const th = e.target.closest('th[data-col]'); if (!dragging || !th) return; e.preventDefault();
  const to = th.dataset.col; if (to !== dragging) { order.splice(order.indexOf(dragging), 1); order.splice(order.indexOf(to), 0, dragging); }
  dragging = ''; redraw();
});
// ---------- charts ----------
// a tooltip for anything with data-tip (chart columns, heat cells, breakdown bars)
const tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.hidden = true; document.body.appendChild(tipEl);
document.addEventListener('pointermove', (e) => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t) { tipEl.hidden = true; return; }
  tipEl.textContent = t.dataset.tip; tipEl.hidden = false;
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  tipEl.style.left = Math.max(4, Math.min(innerWidth - w - 4, e.clientX + 12)) + 'px';
  tipEl.style.top = (e.clientY - h - 12 < 4 ? e.clientY + 16 : e.clientY - h - 12) + 'px';
});
const DEVS = [['desktop', 'Desktop', 'var(--s1)'], ['phone', 'Phone', 'var(--s2)'], ['tablet', 'Tablet', 'var(--s3)'], ['', 'Unknown', 'var(--s0)']];
const devOf = (s) => (DEVS.some((d) => d[0] && d[0] === s.dev) ? s.dev : '');
// an hour of day is only known when the visit's upload time is; the hourly charts leave the rest out and say how many
const when = (s) => new Date(s.start);
const timed = (V) => V.filter((s) => s.start && !isNaN(Date.parse(s.start)));
const untimed = (n) => n ? ' <span class="hint">' + n + (n === 1 ? ' visit' : ' visits') + ' without a time left out</span>' : '';
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const nice = (m) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, m)))), f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
// a column with its top corners rounded, standing on the baseline
const colPath = (x, y, w, h, r) => { r = Math.min(r, w / 2, h); return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z'; };
// visits per day (per hour for Today), stacked by device type; in UTC, like the days the range is made of
function trend(V) {
  const el = $('trend'), W = Math.max(280, el.clientWidth), H = 190, top = 10, bot = 22, left = 30;
  const hourly = $('days').value === '1', buckets = [];
  if (hourly) for (let h = 0; h < 24; h++) buckets.push({ k: String(h), l: String(h).padStart(2, '0') + ':00' });
  else for (let i = +$('days').value - 1; i >= 0; i--) { const k = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); buckets.push({ k, l: new Date(k + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) }); }
  const at = new Map(buckets.map((b, i) => [b.k, i])), counts = buckets.map(() => DEVS.map(() => 0));
  const T = hourly ? timed(V) : V;
  for (const s of T) { const i = at.get(hourly ? String(when(s).getUTCHours()) : s.day); if (i != null) counts[i][DEVS.findIndex((x) => x[0] === devOf(s))]++; }
  const max = nice(Math.max(1, ...counts.map((c) => c.reduce((a, b) => a + b, 0)))), y = (v) => top + (H - top - bot) * (1 - v / max);
  const n = buckets.length, step = (W - left) / n, bw = Math.max(2, Math.min(28, step - 2));
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="Visits per ' + (hourly ? 'hour today' : 'day') + ', by device">';
  for (const t of [0, max / 2, max]) svg += '<line x1="' + left + '" x2="' + W + '" y1="' + y(t) + '" y2="' + y(t) + '" class="grid"/><text x="' + (left - 6) + '" y="' + (y(t) + 4) + '" text-anchor="end" class="ax">' + t + '</text>';
  const every = Math.ceil(n / Math.max(1, Math.floor((W - left) / 56)));
  buckets.forEach((b, i) => {
    const x = left + i * step + (step - bw) / 2, c = counts[i], tot = c.reduce((a, v) => a + v, 0);
    let base = H - bot;
    const segs = DEVS.map((d, j) => [d, c[j]]).filter(([, v]) => v);
    segs.forEach(([d, v], j) => {
      const h = (H - top - bot) * v / max, gap = j ? Math.min(2, h / 2) : 0;   // a 2px surface gap between stacked segments, never more than half a thin one
      svg += j === segs.length - 1 ? '<path d="' + colPath(x, base - h + gap, bw, h - gap, 3) + '" fill="' + d[2] + '"/>' : '<rect x="' + x + '" y="' + (base - h + gap) + '" width="' + bw + '" height="' + (h - gap) + '" fill="' + d[2] + '"/>';
      base -= h;
    });
    const tip = b.l + ': ' + tot + (tot === 1 ? ' visit' : ' visits') + (tot ? ' (' + segs.map(([d, v]) => d[1].toLowerCase() + ' ' + v).join(', ') + ')' : '');
    svg += '<rect x="' + (left + i * step) + '" y="' + top + '" width="' + step + '" height="' + (H - top - bot) + '" fill="transparent" data-tip="' + esc(tip) + '"/>';
    if (i % every === 0) svg += '<text x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" class="ax">' + esc(hourly ? b.l.slice(0, 2) : b.l) + '</text>';
  });
  el.innerHTML = svg + '<line x1="' + left + '" x2="' + W + '" y1="' + (H - bot) + '" y2="' + (H - bot) + '" class="base"/></svg>';
  $('trendT').innerHTML = (hourly ? 'Visits per hour today' : 'Visits per day') + ' <span class="hint">UTC</span>' + untimed(V.length - T.length);
  $('trendKey').innerHTML = DEVS.filter((d) => V.some((s) => devOf(s) === d[0])).map((d) => '<span><i style="background:' + d[2] + '"></i>' + d[1] + '</span>').join('');
}
// day of week × hour, in this browser's time zone
function heat(V) {
  const c = Array.from({ length: 7 }, () => Array(24).fill(0));
  const T = timed(V);
  for (const s of T) { const d = when(s); c[(d.getDay() + 6) % 7][d.getHours()]++; }
  const max = Math.max(0, ...c.flat()), days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const lvl = (v) => (!v ? 0 : Math.min(5, 1 + Math.floor(5 * (v - 1) / Math.max(1, max))));
  let h = '<div></div>' + Array.from({ length: 24 }, (_, i) => '<div class="hx">' + (i % 3 ? '' : String(i).padStart(2, '0')) + '</div>').join('');
  c.forEach((row, d) => { h += '<div class="hy">' + days[d] + '</div>' + row.map((v, i) => '<div class="hc l' + lvl(v) + '" data-tip="' + days[d] + ' ' + String(i).padStart(2, '0') + ':00–' + String(i + 1).padStart(2, '0') + ':00: ' + v + (v === 1 ? ' visit' : ' visits') + '"></div>').join(''); });
  $('heat').innerHTML = h;
  $('heatT').innerHTML = 'When people visit <span class="hint">your time zone</span>' + untimed(V.length - T.length);
}
// counts by a column's group, largest first; the rest folds into Other. Clicking a bar narrows the page to it.
function breakdown(el, V, id, top) {
  const c = C[id], m = new Map();
  for (const s of V) { const g = String(c.group(s) || ''); m.set(g, (m.get(g) || 0) + 1); }
  let items = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const rest = items.slice(top || 8).reduce((a, x) => a + x[1], 0); items = items.slice(0, top || 8);
  const N = V.length, max = Math.max(1, ...items.map((x) => x[1]), rest);
  const label = (g) => (g ? (c.name ? c.name(g) : g) : '(none)');
  el.innerHTML = !N ? '<div class="empty">No visits.</div>' : items.concat(rest ? [[null, rest]] : []).map(([g, n]) => {
    const l = g === null ? 'Other' : label(g), pct = Math.round(100 * n / N), tip = l + ': ' + n + (n === 1 ? ' visit' : ' visits') + ' (' + pct + '%)';
    return '<div class="l"' + (g === null ? '' : ' data-f="' + id + '" data-v="' + esc(g) + '" role="button" tabindex="0"') + ' data-tip="' + esc(tip) + '">' + esc(l) + '</div><div class="track" data-tip="' + esc(tip) + '"' + (g === null ? '' : ' data-f="' + id + '" data-v="' + esc(g) + '"') + '><div class="fill" style="width:' + (100 * n / max).toFixed(1) + '%"></div></div><div class="v">' + n + ' <span class="old">' + pct + '%</span></div>';
  }).join('');
}
// a median per group (frame rate by GPU, load time by device), groups with the most visits first
function medians(el, V, id, val, fmtV, top) {
  const c = C[id], m = new Map();
  for (const s of V) { const v = val(s), g = String(c.group(s) || ''); if (!(v > 0) || !g) continue; if (!m.has(g)) m.set(g, []); m.get(g).push(v); }
  const items = [...m].sort((a, b) => b[1].length - a[1].length).slice(0, top || 8).map(([g, a]) => [g, median(a), a.length]);
  const max = Math.max(1e-9, ...items.map((x) => x[1]));
  el.innerHTML = !items.length ? '<div class="empty">Nothing measured yet.</div>' : items.map(([g, v, n]) => {
    const l = c.name ? c.name(g) : g, tip = l + ': ' + fmtV(v) + ' median over ' + n + (n === 1 ? ' visit' : ' visits');
    return '<div class="l" data-f="' + id + '" data-v="' + esc(g) + '" role="button" tabindex="0" data-tip="' + esc(tip) + '">' + esc(l) + '</div><div class="track" data-tip="' + esc(tip) + '" data-f="' + id + '" data-v="' + esc(g) + '"><div class="fill" style="width:' + (100 * v / max).toFixed(1) + '%"></div></div><div class="v">' + fmtV(v) + ' <span class="old">' + n + '</span></div>';
  }).join('');
}
const LENGTHS = [[0, 10e3, 'Under 10 s'], [10e3, 30e3, '10–30 s'], [30e3, 60e3, '30 s–1 min'], [60e3, 120e3, '1–2 min'], [120e3, 300e3, '2–5 min'], [300e3, 600e3, '5–10 min'], [600e3, Infinity, '10 min or more']];
function insights(V) {
  const N = V.length, cur = data.current.sections;
  trend(V); heat(V);
  // where visits ended: the furthest section, by today's section titles
  const curKeys = cur.map((_, i) => key(cur, i)), ends = cur.map(() => 0);
  for (const s of V) { const i = curKeys.indexOf(farKey(s)); if (i >= 0) ends[i]++; }
  $('exits').innerHTML = !N ? '<div class="empty">No visits.</div>' : cur.map((t, i) => ({ t, i, k: curKeys[i], n: ends[i] })).filter((x) => x.n).map((x) => {
    const pct = Math.round(100 * x.n / N), tip = x.i + '. ' + x.t + ': ' + x.n + ' visits ended here (' + pct + '%)';
    return '<div class="l" data-f="far" data-v="' + esc(x.k) + '" role="button" tabindex="0" data-tip="' + esc(tip) + '">' + esc(x.i + '. ' + x.t) + '</div><div class="track" data-tip="' + esc(tip) + '" data-f="far" data-v="' + esc(x.k) + '"><div class="fill" style="width:' + (100 * x.n / Math.max(...ends)).toFixed(1) + '%"></div></div><div class="v">' + x.n + ' <span class="old">' + pct + '%</span></div>';
  }).join('');
  const lens = LENGTHS.map(([a, b, l]) => ({ l, n: V.filter((s) => s.ms >= a && s.ms < b).length }));
  $('lengths').innerHTML = !N ? '<div class="empty">No visits.</div>' : lens.map((x) => { const pct = Math.round(100 * x.n / N), tip = x.l + ': ' + x.n + ' visits (' + pct + '%)';
    return '<div class="l" data-tip="' + esc(tip) + '">' + x.l + '</div><div class="track" data-tip="' + esc(tip) + '"><div class="fill" style="width:' + (100 * x.n / Math.max(1, ...lens.map((y) => y.n))).toFixed(1) + '%"></div></div><div class="v">' + x.n + ' <span class="old">' + pct + '%</span></div>'; }).join('');
  for (const [el, id] of [['bRef', 'ref'], ['bCountry', 'loc'], ['bCity', 'city'], ['bBrowser', 'browser'], ['bSize', 'size'], ['bLang', 'lang']]) breakdown($(el), V, id);
  medians($('pGpu'), V, 'gpu', (s) => s.fps, (v) => v.toFixed(0) + ' fps');
  medians($('pLoad'), V, 'dev', (s) => s.load, (v) => (v / 1000).toFixed(1) + ' s');
}
// filters picked from the charts (and the Visitor buttons), shown as removable chips
const filters = new Map();
function chips() {
  $('chips').innerHTML = [...filters].map(([id, v]) => { const c = C[id], l = (c.gh || c.h) + ': ' + (v ? (c.name ? c.name(v) : v) : '(none)');
    return '<button type="button" class="chip" data-unf="' + id + '" title="Remove this filter">' + esc(l) + ' <span aria-hidden="true">×</span></button>'; }).join('')
    + (filters.size > 1 ? '<button type="button" class="chip" data-unf="*">Clear all</button>' : '');
}
const narrow = (id, v) => { filters.set(id, v); picked.clear(); last = -1; draw(); scrollTo({ top: 0, behavior: 'smooth' }); };
document.addEventListener('click', (e) => {
  const f = e.target.closest('[data-f]'); if (f) { narrow(f.dataset.f, f.dataset.v); return; }
  const u = e.target.closest('[data-unf]'); if (u) { if (u.dataset.unf === '*') filters.clear(); else filters.delete(u.dataset.unf); picked.clear(); last = -1; draw(); }
});
document.addEventListener('keydown', (e) => { const f = (e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-f]'); if (f) { e.preventDefault(); narrow(f.dataset.f, f.dataset.v); } });
let resizeT = 0; addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (data) trend(view()); }, 150); });
// every visit shown, as a spreadsheet: all columns, in the table's order
function csv() {
  const tmp = document.createElement('div'), txt = (h) => { tmp.innerHTML = h; return tmp.textContent.trim(); };
  // visitors' own values (GPU, language …) could start like a formula; a leading apostrophe keeps a spreadsheet from running it
  const q = (v) => { v = String(v == null ? '' : v); if (/^[=+@\\t\\r-]/.test(v)) v = "'" + v; return /[",\\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const cols = order.map((id) => C[id]);
  const lines = [['key'].concat(cols.map((c) => c.h), ['visitor id', 'replay']).map(q).join(',')];
  for (const s of sorted) lines.push([s.key].concat(cols.map((c) => txt(c.cell(s))), [s.vid || '', location.origin + '/admin/flow/replay?key=' + encodeURIComponent(s.key)]).map(q).join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\\n')], { type: 'text/csv' }));
  a.download = 'site-visits-' + ymd(new Date()) + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('csv').onclick = csv;
// the button and the select-all box follow the ticks
function ticks() {
  const n = picked.size, all = $('all');
  $('del').disabled = !n; $('del').textContent = n ? 'Delete selected (' + n + ')' : 'Delete selected';
  const every = shown.length > 0 && shown.every((k) => picked.has(k));
  all.checked = every; all.indeterminate = n > 0 && !every; all.disabled = !shown.length;
}
function tick(key, on) {
  if (on) picked.add(key); else picked.delete(key);
  const box = $('rows').querySelector('input[data-key="' + CSS.escape(key) + '"]');
  if (box) { box.checked = on; box.closest('tr').classList.toggle('on', on); }
}
$('rows').addEventListener('click', (e) => {
  const w = e.target.closest('button[data-vid]'); if (w) { filters.set('vid', w.dataset.vid); picked.clear(); last = -1; draw(); return; }
  const f = e.target.closest('button.fold'); if (f) { const l = groups[+f.dataset.grp][0]; if (opened.has(l)) opened.delete(l); else opened.add(l); last = -1; draw(); return; }
  const gb = e.target.closest('input[data-grp]'); if (gb) { for (const s of groups[+gb.dataset.grp][1]) tick(s.key, gb.checked); last = -1; draw(); return; }
  const box = e.target.closest('input[data-key]'); if (!box) return;
  const i = shown.indexOf(box.dataset.key);
  // shift-click ticks (or unticks) the whole run from the last box clicked
  if (e.shiftKey && last >= 0 && i >= 0) for (let j = Math.min(i, last); j <= Math.max(i, last); j++) tick(shown[j], box.checked);
  else tick(box.dataset.key, box.checked);
  last = i; ticks();
});
$('del').onclick = async () => {
  const keys = [...picked], n = keys.length;
  if (!n || !confirm('Delete ' + (n === 1 ? 'this visit' : 'these ' + n + ' visits') + ' for good? Their replays go too.')) return;
  $('del').disabled = true; $('status').textContent = 'Deleting…'; busy = true; loads++;   // a refresh already on its way would bring the deleted visits back
  // the Worker takes up to 500 visits a request, so a big selection (a whole group) goes in parts
  let done = 0, fail = '';
  for (let i = 0; i < n && !fail; i += 500) {
    const part = keys.slice(i, i + 500);
    let r = null, j = {};
    try {
      r = await fetch('/admin/api/flow/delete', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-editor': '1' }, body: JSON.stringify({ keys: part }) });
      j = await r.json().catch(() => ({}));
    } catch (e) {}
    if (!r || !r.ok) { fail = j.error || (r ? 'error ' + r.status : 'offline'); break; }
    const gone = new Set(part);
    data.sessions = data.sessions.filter((s) => !gone.has(s.key));
    for (const k of part) picked.delete(k);
    done += j.deleted;
  }
  last = -1; busy = false;
  $('status').textContent = (done ? 'Deleted ' + done + (done === 1 ? ' visit.' : ' visits.') : '') + (fail ? (done ? ' ' : '') + 'Could not delete ' + (done ? 'the rest' : 'them') + ': ' + fail : '');
  draw();
};
$('days').onchange = () => { picked.clear(); last = -1; load(); }; $('dev').onchange = $('os').onchange = () => { last = -1; if (data) draw(); };
// sign-ups: all builds, newest first, whatever the range and filters above
const SIGN_SHOW = 25, SIGN_KIND = { follow: 'Follow', want: 'Wants one' };
const BUILD = { exoleg: 'ExoLeg', quadfather: 'QuadFather', catzoom: 'CatZoom' };   // the rest title-case from their slug
const buildName = (p) => BUILD[p] || String(p || '').split('-').map((w) => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
async function loadSignups() {
  try {
    const r = await fetch('/admin/api/interest?limit=' + SIGN_SHOW, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json(), rows = j.rows || [], total = j.total || rows.length;
    $('signN').textContent = total ? total + ' in all' + (total > rows.length ? ', newest ' + rows.length + ' here' : '') : '';
    $('signRows').innerHTML = rows.length ? rows.map((x) => '<tr><td>' + esc(new Date(x.at).toLocaleString()) + '</td><td>' + esc(buildName(x.p)) + '</td><td>' + esc(SIGN_KIND[x.k] || x.k) +
      '</td><td><a href="mailto:' + esc(x.email) + '">' + esc(x.email) + '</a></td><td class="note">' + esc(x.note) + '</td><td>' + esc(x.country) + '</td></tr>').join('')
      : '<tr><td colspan="6" class="empty">No sign-ups yet.</td></tr>';
  } catch (e) { $('signRows').innerHTML = '<tr><td colspan="6" class="empty">Couldn’t load sign-ups.</td></tr>'; }
}
load(); loadSignups();
// refresh every minute while the page is in view, so "on the site now" and today's numbers keep up
setInterval(() => { if (!document.hidden && !busy && data) load(true).catch(() => {}); if (!document.hidden) loadSignups(); }, 60e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy && data) load(true).catch(() => {}); if (!document.hidden) loadSignups(); });
</script></body></html>`;
