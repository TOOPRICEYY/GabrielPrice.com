// The owner's analytics page, served by worker/flow.js at /admin/flow (behind the Access login). Self-contained HTML.
// Visits can be ticked (shift-click for a run) and deleted from the bucket with "Delete selected".
// Opening it also sets localStorage "flow-off" so the owner's own visits to the site aren't recorded.
// The visits table's columns can be shown, hidden and moved, sorted by clicking a heading, and grouped; this browser remembers how.
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
tr.on td{background:color-mix(in srgb,var(--bar) 10%,transparent)}.head{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}.head h2{margin:0;flex:1}
button.who{font:inherit;font-size:12px;padding:1px 6px;white-space:nowrap}
th[data-col]{cursor:pointer;user-select:none}th[data-col]:hover{color:var(--ink)}th.drop{box-shadow:inset 2px 0 0 var(--bar)}
tr.grp td{background:color-mix(in srgb,var(--line) 45%,transparent)}button.fold{font:inherit;font-weight:600;border:0;background:none;padding:0 4px 0 0;color:var(--ink)}
.colsP{columns:190px;column-gap:24px;padding:10px 0 14px;border-bottom:1px solid var(--line);margin-bottom:8px;font-size:13px}
.colsP .ci{display:flex;align-items:center;gap:6px;break-inside:avoid;padding:1px 0}.colsP .ci label{flex:1;display:flex;gap:6px;align-items:center}.colsP .ci button{padding:0 6px;font-size:12px}
.colsP .foot{column-span:all;display:flex;gap:10px;align-items:center;margin-top:8px;color:var(--ink2)}
button.del{border-color:#d9534f;color:#c9302c}button.del:disabled{opacity:.45;border-color:var(--line);color:var(--muted)}@media (prefers-color-scheme:dark){button.del{color:#ff8a85}}
.scroll{overflow-x:auto}.old{color:var(--muted)}.warn{color:#b26a00}@media (prefers-color-scheme:dark){.warn{color:#ffc46b}}.empty{color:var(--muted);padding:12px 0}
</style></head><body><main>
<h1>Site flow</h1><p class="sub">How visitors move through gabrielprice.com. Your own visits from this browser are not recorded.</p>
<div class="row"><label>Range <select id="days"><option value="1">Today</option><option value="7" selected>7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
<label>Device <select id="dev"><option value="">All</option><option>desktop</option><option>phone</option><option>tablet</option></select></label>
<label>OS <select id="os"><option value="">All</option></select></label>
<span id="who" hidden>Visits from one device <button type="button" id="whoX">Show all</button></span>
<span id="status" class="sub" style="margin:0"></span></div>
<div class="tiles" id="tiles"></div>
<div class="grid"><div class="card"><h2>Reached each section (% of visits)</h2><div class="bars" id="funnel"></div></div>
<div class="card"><h2>Average seconds spent on each section</h2><div class="bars" id="dwell"></div></div></div>
<div class="card"><div class="head"><h2>Visits</h2><label>Group by <select id="grp"></select></label><button type="button" id="colsB" aria-expanded="false" aria-controls="colsP">Columns</button><button class="del" id="del" disabled>Delete selected</button></div>
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
let who = '';   // a returning visitor's id: show only their visits
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
  const dev = $('dev').value, os = $('os').value, V = data.sessions.filter((s) => (!dev || s.dev === dev) && (!os || fam(s) === os) && (!who || s.vid === who)), N = V.length;
  $('who').hidden = !who;
  const cur = data.current.sections;
  const curKeys = cur.map((_, i) => key(cur, i));
  const name = (list, i) => (list[i] ? i + '. ' + list[i] : 'Section ' + i);
  const total = V.reduce((a, s) => a + s.ms, 0), drove = V.filter((s) => s.drive > 0).length;
  const end = V.filter((s) => s.maxS >= L(s).length - 1.5).length, errs = V.filter((s) => s.err > 0).length;
  const older = V.filter((s) => s.layout !== data.current.layout).length;
  const tiles = [[N, 'visits'], [N ? fmt(total / N) : '0:00', 'average length'], [N ? Math.round(100 * end / N) + '%' : '–', 'reached the end'], [N ? Math.round(100 * drove / N) + '%' : '–', 'drove the couch or scooter']];
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
  table(V);
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
  { id: 'far', h: 'Furthest section', down: 1, cell: (s) => esc(far(s)), sort: (s) => s.maxS, group: far },
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
  { id: 'loc', h: 'Location', gh: 'Country', cell: (s) => esc(loc(s)), sort: (s) => [s.cc, s.region, s.city].filter(Boolean).join(' ') || null, group: (s) => s.cc },
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
let groups = [], opened = new Set();   // the groups on screen, and the ones unfolded
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
  const rows = V.slice().sort((a, b) => cmp(a, b) || String(b.start || b.day).localeCompare(String(a.start || a.day)));
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
  const w = e.target.closest('button[data-vid]'); if (w) { who = w.dataset.vid; picked.clear(); last = -1; draw(); return; }
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
  $('del').disabled = true; $('status').textContent = 'Deleting…';
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
  last = -1;
  $('status').textContent = (done ? 'Deleted ' + done + (done === 1 ? ' visit.' : ' visits.') : '') + (fail ? (done ? ' ' : '') + 'Could not delete ' + (done ? 'the rest' : 'them') + ': ' + fail : '');
  draw();
};
$('whoX').onclick = () => { who = ''; picked.clear(); last = -1; draw(); };
$('days').onchange = () => { picked.clear(); last = -1; load(); }; $('dev').onchange = $('os').onchange = () => { last = -1; if (data) draw(); };
load();
</script></body></html>`;
