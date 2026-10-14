// /admin/interest: the "Follow project" and "I want one!" sign-ups (worker/interest.js), newest first.
export default `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Sign-ups</title>
<style>
:root{--bg:#f6f4ff;--panel:#fff;--ink:#1b1830;--ink2:#5b5674;--line:rgba(27,24,48,.12);--acc:#6a2cff;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#110e1c;--panel:#1a1530;--ink:#ece8ff;--ink2:#a9a3c4;--line:rgba(177,140,255,.2);--acc:#b18cff;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}.sub{color:var(--ink2);margin:0 0 16px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
select,button{font:inherit;padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink);cursor:pointer}
button:disabled{opacity:.5;cursor:default}
.tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}.tile{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px}
.tile b{font-variant-numeric:tabular-nums;margin-right:6px}
.wrap{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:12px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--ink2);font-weight:600;white-space:nowrap}td.w{white-space:nowrap;color:var(--ink2)}td.c{min-width:16em;white-space:pre-wrap}
a{color:var(--acc)}.k{font-size:12px;padding:1px 7px;border-radius:99px;border:1px solid var(--line);white-space:nowrap}.k.want{border-color:var(--acc);color:var(--acc)}
input[type=checkbox]{width:16px;height:16px;margin:0;accent-color:var(--acc)}#msg{color:var(--ink2)}
</style></head><body><main>
<h1>Sign-ups</h1>
<p class="sub">"Follow project" and "I want one!" from the end of each build on the site. <a href="/admin/flow">Site flow</a></p>
<div class="tiles" id="tiles"></div>
<div class="row"><select id="fp"><option value="">All builds</option></select><select id="fk"><option value="">Both kinds</option><option value="follow">Follow</option><option value="want">I want one</option></select>
<button id="csv" type="button">Download CSV</button><button id="del" type="button" disabled>Delete selected</button><span id="msg" role="status"></span></div>
<div class="wrap"><table><thead><tr><th><input type="checkbox" id="all" aria-label="Select all"></th><th>When</th><th>Build</th><th>Kind</th><th>Email</th><th>Comment</th><th>Country</th></tr></thead><tbody id="rows"><tr><td colspan="7">Loading…</td></tr></tbody></table></div>
</main>
<script>
(() => {
  const $ = (id) => document.getElementById(id), esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const KIND = { follow: 'Follow', want: 'I want one' }, name = (p) => p.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  let rows = [], sel = new Set();
  const shown = () => rows.filter((r) => (!$('fp').value || r.p === $('fp').value) && (!$('fk').value || r.k === $('fk').value));
  function draw() {
    const v = shown();
    $('rows').innerHTML = v.length ? v.map((r) => '<tr><td><input type="checkbox" data-k="' + esc(r.key) + '"' + (sel.has(r.key) ? ' checked' : '') + ' aria-label="Select"></td><td class="w">' + esc(new Date(r.at).toLocaleString()) + '</td><td>' + esc(name(r.p)) +
      '</td><td><span class="k ' + esc(r.k) + '">' + esc(KIND[r.k] || r.k) + '</span></td><td><a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a></td><td class="c">' + esc(r.note) + '</td><td>' + esc(r.country) + '</td></tr>').join('')
      : '<tr><td colspan="7">No sign-ups' + (rows.length ? ' match' : ' yet') + '.</td></tr>';
    $('del').disabled = !sel.size; $('del').textContent = sel.size ? 'Delete ' + sel.size + ' selected' : 'Delete selected';
    const by = {}; for (const r of rows) { const t = by[r.p] || (by[r.p] = { follow: 0, want: 0 }); t[r.k] = (t[r.k] || 0) + 1; }
    $('tiles').innerHTML = Object.keys(by).sort().map((p) => '<div class="tile"><b>' + esc(name(p)) + '</b>' + by[p].follow + ' following · ' + by[p].want + ' want one</div>').join('');
    const ps = Object.keys(by).sort(), cur = $('fp').value;
    $('fp').innerHTML = '<option value="">All builds</option>' + ps.map((p) => '<option value="' + esc(p) + '"' + (p === cur ? ' selected' : '') + '>' + esc(name(p)) + '</option>').join('');
  }
  async function load() {
    try { const r = await fetch('/admin/api/interest', { cache: 'no-store' }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); rows = j.rows; sel = new Set([...sel].filter((k) => rows.some((r) => r.key === k))); draw(); }
    catch (e) { $('rows').innerHTML = '<tr><td colspan="7">Could not load: ' + esc(e.message) + '</td></tr>'; }
  }
  $('rows').addEventListener('change', (e) => { const k = e.target.dataset.k; if (!k) return; e.target.checked ? sel.add(k) : sel.delete(k); draw(); });
  $('all').addEventListener('change', (e) => { for (const r of shown()) e.target.checked ? sel.add(r.key) : sel.delete(r.key); draw(); });
  $('fp').addEventListener('change', draw); $('fk').addEventListener('change', draw);
  $('csv').addEventListener('click', () => {
    const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const csv = ['when,build,kind,email,comment,country', ...shown().map((r) => [new Date(r.at).toISOString(), r.p, r.k, r.email, r.note, r.country].map(q).join(','))].join('\\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'signups.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('del').addEventListener('click', async () => {
    if (!sel.size || !confirm('Delete ' + sel.size + ' sign-up' + (sel.size > 1 ? 's' : '') + ' for good?')) return;
    $('del').disabled = true; $('msg').textContent = 'Deleting…';
    try {
      const r = await fetch('/admin/api/interest', { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor': '1' }, body: JSON.stringify({ delete: [...sel] }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
      $('msg').textContent = 'Deleted ' + j.deleted + '.'; sel.clear(); await load();
    } catch (e) { $('msg').textContent = 'Delete failed: ' + e.message; draw(); }
  });
  load();
})();
</script></body></html>`;
