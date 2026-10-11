/* ---------- site editor: a hidden edit mode for the site's owner ----------
   Text can be retyped and restyled, any text, card or block moved and resized, and notes pinned to a point on the page for an
   agent to act on later. Each note records the scroll position, the screen point, the camera and the 3D part under the cursor.
   An edit doc keeps the element's original text (`fp`, `origHtml`): if the source changes under it, the edit is skipped, not forced.
   Two parts, split at the "editor UI" marker line below:
   - the core indexes the page and applies saved edits. Every visitor runs it.
   - the UI is the panel, notes and saving. Where it runs and where it saves:
     · claude.ai artifact: inlined right after the core; edits and notes live in the artifact's db (collections `edits`, `notes`,
       `shots`), and only the owner and editors get the Edit button or can read the notes.
     · the hosted site (gabrielprice-deploy): visitors get only the core plus the baked edits (<script id="site-edits">). Three quick
       clicks in the top-left corner fetch /admin/session; once Cloudflare Access has signed the owner in, the Worker serves the UI
       at /admin/editor-ui.js and saves edits to a GitHub PR and notes as GitHub issues.
     · anywhere else (a local copy): only with #edit in the URL, saved in this browser, with JSON export.
   build.sh inlines this file at the EDITOR placeholder after main; it runs before the 3D module and reads window.__rig once that exists. */
(() => {
'use strict';
if (window.__siteEditor) return;

// ---------- helpers ----------
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
const num = (v, lo = -1e4, hi = 1e4) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0; };
const phoneMQ = matchMedia('(max-width: 720px)');
const layoutNow = () => phoneMQ.matches ? 'phone' : 'desktop';
const ID_OK = /^[\w.:@+~-]{1,200}$/;
const COLOR_OK = /^(#[0-9a-f]{3,8}|var\(--[a-z0-9-]+\))$/i;

// ---------- the editable elements, indexed before any edit touches them ----------
const TEXT_SEL = ['h1', 'h2', 'p', '.eyebrow', '.scrollhint', '.spec dt', '.spec dd', '.formula', 'figcaption', '.chain span', '.alsolist li', '.links span']
  .map((s) => 'main ' + s).join(',');
const BLOCK_SEL = ['.card', '.hero-wrap', '.media', '.media figure', '.strip', '.strip li', '.spec', '.chain', '.ctl', '.btnrow', '#gait', '.bom', '.modtable', '.alsolist', '.links']
  .map((s) => 'main ' + s).join(',') + ',.titleblock';
const NAMES = [['h1', 'Title'], ['h2', 'Heading'], ['.eyebrow', 'Eyebrow'], ['.note', 'Small print'], ['.more', 'Extra paragraph'], ['p', 'Paragraph'],
  ['.scrollhint', 'Scroll hint'], ['dt', 'Spec label'], ['dd', 'Spec value'], ['.formula', 'Formula'], ['figcaption', 'Caption'], ['.chain span', 'Chain step'],
  ['.alsolist li', 'List item'], ['.links span', 'Link'], ['.card', 'Card'], ['.hero-wrap', 'Hero block'], ['.titleblock', 'Title block'], ['.media figure', 'Photo'],
  ['.media', 'Media'], ['.strip li', 'Photo'], ['.strip', 'Photo strip'], ['.spec', 'Spec table'], ['.chain', 'Drive chain'], ['.ctl', 'Sliders'],
  ['.btnrow', 'Buttons'], ['#gait', 'Gait plot'], ['.bom', 'Parts list'], ['.modtable', 'Module table'], ['.alsolist', 'List'], ['.links', 'Links']];
const nameOf = (el) => (NAMES.find(([s]) => el.matches(s)) || [0, el.tagName.toLowerCase()])[1];
const items = new Map();          // key → item
const byEl = new WeakMap();       // element → item
// key: section number, then tag + index among same-tag siblings down to the element, e.g. s7.div1.p2 (section data-s=7, first div, second p)
function keyFor(el, sec) {
  if (el.matches('.titleblock')) return 'page.titleblock';
  const parts = [];
  for (let n = el; n && n !== sec; n = n.parentElement) {
    let i = 1;
    for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) i++;
    parts.unshift(n.tagName.toLowerCase() + i);
  }
  return 's' + sec.dataset.s + '.' + parts.join('.');
}
function indexAll() {
  const add = (el, kind) => {
    if (byEl.has(el)) return;
    const sec = el.closest('section[data-s]');
    if (!sec && !el.matches('.titleblock')) return;
    const it = {
      el, kind, key: keyFor(el, sec), sec: sec ? +sec.dataset.s : null, name: nameOf(el),
      section: sec ? norm(sec.querySelector('.eyebrow')?.textContent) || 'Section ' + sec.dataset.s : 'Fixed overlay',
      fp: norm(el.textContent).slice(0, 160), orig: el.innerHTML,
    };
    items.set(it.key, it); byEl.set(el, it);
  };
  document.querySelectorAll(TEXT_SEL).forEach((el) => add(el, 'text'));
  document.querySelectorAll(BLOCK_SEL).forEach((el) => add(el, el.matches('.card, .hero-wrap, .titleblock') ? 'card' : 'block'));
}
indexAll();

const edits = new Map();   // doc id → edit doc
const where = new Map();   // edit id → the item it resolved to this load

// an edit finds its element by key; if the text there is not what the edit was made on, by its original text; else it is left out
function resolve(id, d) {
  const it = items.get(d.key || id);
  if (it && (!d.fp || it.fp === d.fp)) return it;
  if (!d.fp) return null;
  const c = [...items.values()].filter((x) => x.fp === d.fp && x.el.tagName.toLowerCase() === d.tag);
  return c.length === 1 ? c[0] : null;
}

// ---------- sanitising and CSS ----------
const OK_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'SUB', 'SUP', 'SMALL', 'KBD', 'SPAN', 'A', 'CODE']);
function sanitize(html) {
  const t = document.createElement('template'); t.innerHTML = String(html || '');
  const walk = (n) => {
    for (const c of [...n.childNodes]) {
      if (c.nodeType === 1) {
        walk(c);
        if (!OK_TAGS.has(c.tagName)) { c.replaceWith(...c.childNodes); continue; }
        for (const a of [...c.attributes]) if (!(c.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:|#)/i.test(a.value))) c.removeAttribute(a.name);
      } else if (c.nodeType !== 3) c.remove();
    }
  };
  walk(t.content);
  return t.innerHTML.replace(/ |&nbsp;/g, ' ').replace(/(<br>)+$/, '').trim();
}
const FONT = { display: 'var(--f-display)', body: 'var(--f-body)', mono: 'var(--f-mono)' };
function styleDecl(st) {
  if (!st) return '';
  const o = [];
  if (FONT[st.font]) o.push('font-family:' + FONT[st.font]);
  if (st.size) o.push(`font-size:${num(st.size, 4, 400)}px`);
  if (st.weight) o.push(`font-weight:${num(st.weight, 100, 900)}`);
  if (st.italic != null) o.push('font-style:' + (st.italic ? 'italic' : 'normal'));
  if (st.color && COLOR_OK.test(st.color)) o.push('color:' + st.color);
  if (['left', 'center', 'right', 'justify'].includes(st.align)) o.push('text-align:' + st.align);
  if (st.lh) o.push('line-height:' + num(st.lh, .5, 4));
  if (st.ls != null) o.push(`letter-spacing:${num(st.ls, -1, 2)}em`);
  if (['none', 'uppercase', 'lowercase', 'capitalize'].includes(st.tt)) o.push('text-transform:' + st.tt);
  if (st.op != null) o.push('opacity:' + num(st.op, 0, 1));
  return o.map((x) => x + '!important').join(';');
}
function layoutDecl(L) {
  if (!L) return '';
  const o = [], x = num(L.x), y = num(L.y);
  if (x || y) o.push(`translate:${x}px ${y}px`);
  if (L.w) o.push(`width:min(${num(L.w, 40, 4000)}px,100%)`, 'max-width:none');
  if (L.side === 'left') o.push('margin-left:0', 'margin-right:auto');
  else if (L.side === 'center') o.push('margin-left:auto', 'margin-right:auto');
  else if (L.side === 'right') o.push('margin-left:auto', 'margin-right:0');
  return o.map((x) => x + '!important').join(';');
}
const styleEl = document.createElement('style'); styleEl.id = 'ed-overrides'; document.head.appendChild(styleEl);

// ---------- apply every edit to the page ----------
function applyAll() {
  where.clear();
  document.querySelectorAll('[data-ed]').forEach((el) => el.removeAttribute('data-ed'));
  const want = new Map();
  let all = '', desk = '', phone = '';
  for (const [id, d] of edits) {
    if (!ID_OK.test(id) || !d) continue;
    const it = resolve(id, d); if (!it) continue;
    where.set(id, it); it.el.setAttribute('data-ed', id);
    const s = `[data-ed="${id}"]`;
    if (typeof d.html === 'string' && it.kind === 'text') want.set(it.el, sanitize(d.html));
    const st = styleDecl(d.style); if (st) all += `${s}{${st}}`;
    if (d.hidden) all += `html:not(.ed-on) ${s}{display:none!important}html.ed-on ${s}{opacity:.3!important;outline:1px dashed var(--sun)!important}`;
    const L = d.layout || {};
    const a = layoutDecl(L.desktop), b = layoutDecl(L.phone);
    if (a) desk += `${s}{${a}}`;
    if (b) phone += `${s}{${b}}`;
  }
  for (const it of items.values()) {
    if (it.kind !== 'text' || E.editingEl === it.el) continue;
    const h = want.has(it.el) ? want.get(it.el) : it.orig;
    if (it.el.innerHTML !== h) it.el.innerHTML = h;
  }
  styleEl.textContent = all + (desk ? `@media (min-width:721px){${desk}}` : '') + (phone ? `@media (max-width:720px){${phone}}` : '');
  if (E.afterApply) E.afterApply();
}

// the UI part reads these; render checks read items and edits
const E = window.__siteEditor = { items, byEl, edits, where, norm, num, phoneMQ, layoutNow, ID_OK, resolve, sanitize, applyAll, editingEl: null, afterApply: null };

// ---------- the hosted site: baked edits, and the hidden door to the editor ----------
const seed = document.getElementById('site-edits');
if (seed) {
  try { for (const [k, v] of Object.entries(JSON.parse(seed.textContent).edits || {})) if (ID_OK.test(k)) edits.set(k, v); } catch {}
  applyAll();
  E.hosted = true;
  const editHash = () => /(^|[#&?])edit\b/.test(location.hash);
  let opening = false;
  // three quick clicks in the top-left corner; the page's own handlers still see them
  async function openDoor(viaHash) {
    if (E.toggle) return E.toggle();
    if (opening) return; opening = true;
    let ok = false;
    try { ok = (await fetch('/admin/session', { credentials: 'same-origin', redirect: 'manual', cache: 'no-store' })).ok; } catch {}
    opening = false;
    if (ok) {
      E.server = true;
      if (viaHash) history.replaceState(null, '', location.pathname + location.search);
      const s = document.createElement('script'); s.src = '/admin/editor-ui.js'; document.head.appendChild(s);
    } else if (!viaHash) location.assign('/admin/login?to=' + encodeURIComponent(location.pathname));     // Cloudflare Access asks who you are, then sends you back here with #edit
  }
  let taps = [];
  E.inDoor = (e) => e.clientX <= 44 && e.clientY <= 44;
  addEventListener('pointerdown', (e) => {
    if (!E.inDoor(e) || e.button > 0) { taps = []; return; }
    const now = e.timeStamp || performance.now();        // when the click happened, even if the page was busy
    taps = taps.filter((t) => now - t < 1000).concat(now).slice(-3);
    if (taps.length >= 3 && taps[2] - taps[1] < 500 && taps[1] - taps[0] < 500) { taps = []; openDoor(false); }
  }, { capture: true, passive: true });
  if (editHash()) openDoor(true);
  addEventListener('hashchange', () => { if (editHash()) openDoor(true); });
}
})();

/* ===== editor UI ===== */
(() => {
'use strict';
const E = window.__siteEditor;
if (!E || E.ui) return;
E.ui = true;
const { items, byEl, edits, where, norm, num, phoneMQ, layoutNow, ID_OK, sanitize, applyAll } = E;
const clone = (o) => o == null ? null : JSON.parse(JSON.stringify(o));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rnd = (v, k = 100) => Math.round(v * k) / k;
const arr = (v, k = 10) => [rnd(v.x, k), rnd(v.y, k), rnd(v.z, k)];
const store = { mode: 'none', db: null, canEdit: false, pr: null };
const LS_DATA = 'gp-site-editor-data', LS_ON = 'gp-site-editor-on', LS_DOCK = 'gp-site-editor-dock';
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};

// ---------- state ----------
const notes = new Map();   // doc id → note doc
const shots = new Map();   // note id → {jpeg, w, h} (local mode, and a cache in db mode)
let on = false, mode = 'select', sel = null, hovered = null, editing = null, draft = null, popId = null;
let tab = 'changes', noteFilter = 'open';
const undoStack = []; let lastUndo = null;
Object.assign(E, { notes, shots, store });
E.afterApply = () => { if (on) { syncInspector(); renderList(); syncPins(); } };

// ---------- saving ----------
const dirty = new Set(), busy = new Set(), again = new Set(), timers = new Map();
let lsTimer = 0, statusEl = null, lastErr = '';
function setStatus(kind, err) {
  if (err) lastErr = err.code || err.message || String(err);
  if (!statusEl) return;
  const txt = store.mode === 'local' ? 'This browser only'
    : kind === 'saving' ? 'Saving…' : kind === 'error' ? 'Not saved' : store.mode === 'server' ? 'Saved to GitHub' : 'Saved to the page';
  statusEl.textContent = txt; statusEl.dataset.k = store.mode === 'local' ? 'local' : kind;
  statusEl.title = kind === 'error' ? 'Error: ' + lastErr : store.mode === 'local' ? 'Kept in this browser. Use Export to hand it to Claude.'
    : store.mode === 'server' ? 'Edits wait in a pull request until you merge it; notes are GitHub issues Claude works through.' : 'Stored in this artifact; Claude can read it.';
  if (prBtn) prBtn.hidden = !(store.mode === 'server' && store.pr);
}
function save(col, id) {
  if (store.mode === 'local') { clearTimeout(lsTimer); lsTimer = setTimeout(saveLocal, 250); return; }
  if (store.mode !== 'db' && store.mode !== 'server') return;
  if (store.mode === 'server' && col === 'edits') id = '*';      // the hosted site saves every edit as one file
  const k = col + '/' + id; dirty.add(k); setStatus('saving');
  clearTimeout(timers.get(k)); timers.set(k, setTimeout(() => flush(col, id), col !== 'edits' ? 0 : store.mode === 'server' ? 1500 : 450));
}
async function flush(col, id, retry = 1) {
  const k = col + '/' + id;
  if (busy.has(k)) { again.add(k); return; }
  busy.add(k);
  let ok = true;
  try {
    if (store.mode === 'server') await writeServer(col, id);
    else {
      const d = (col === 'edits' ? edits : notes).get(id), ref = store.db.collection(col).doc(id);
      if (d) await ref.set(d); else await ref.delete();
    }
  } catch (e) {
    ok = false;
    if (e && e.code === 'unavailable' && retry) { busy.delete(k); await new Promise((r) => setTimeout(r, 400 + Math.random() * 800)); return flush(col, id, 0); }
    setStatus('error', e);
  }
  busy.delete(k);
  if (again.delete(k)) return flush(col, id);
  dirty.delete(k);
  if (ok && !dirty.size) setStatus('saved');
}
async function saveShot(id, shot) {
  shots.set(id, shot);
  if (store.mode === 'local') { saveLocal(); return; }
  if (store.mode === 'server') return;            // it goes up with the note
  try { await store.db.collection('shots').doc(id).set({ note: id, ...shot }); } catch (e) { setStatus('error', e); }
}
async function loadShot(id) {
  if (store.mode === 'server' && !shots.has(id)) return notes.get(id)?.hasShot ? { url: '/admin/api/shots/' + encodeURIComponent(id) } : null;
  if (shots.has(id) || store.mode !== 'db') return shots.get(id) || null;
  try { const s = await store.db.collection('shots').doc(id).get(); if (s.exists) shots.set(id, s.data()); } catch {}
  return shots.get(id) || null;
}
function saveLocal() {
  const o = { v: 1, edits: Object.fromEntries(edits), notes: Object.fromEntries(notes), shots: Object.fromEntries(shots) };
  if (!ls.set(LS_DATA, JSON.stringify(o))) {      // over quota: drop the screenshots before giving up
    o.shots = {};
    if (!ls.set(LS_DATA, JSON.stringify(o))) setStatus('error', { message: 'browser storage is full' });
  }
}
function loadLocal(raw) {
  try {
    const o = JSON.parse(raw || 'null'); if (!o) return false;
    for (const [k, v] of Object.entries(o.edits || {})) edits.set(k, v);
    for (const [k, v] of Object.entries(o.notes || {})) notes.set(k, v);
    for (const [k, v] of Object.entries(o.shots || {})) shots.set(k, v);
    return true;
  } catch { return false; }
}
const onSnap = (col, snap) => onDocs(col, snap.docs.map((d) => [d.id, d.data()]));
function onDocs(col, docs) {
  const map = col === 'edits' ? edits : notes, seen = new Set(), held = (id) => dirty.has(col + '/' + id) || dirty.has(col + '/*');
  for (const [id, d] of docs) { seen.add(id); if (!held(id)) map.set(id, clone(d)); }
  for (const id of [...map.keys()]) if (!seen.has(id) && !held(id)) map.delete(id);
  applyAll();
  if (col === 'notes' && popId && !notes.has(popId)) closePop();
}

// ---------- the hosted site: the Worker behind Cloudflare Access (worker/index.js in gabrielprice-deploy) ----------
const removed = new Map();      // note id → its issue number, for notes deleted here
async function api(method, path, body) {
  let r;
  try {
    r = await fetch('/admin/api/' + path, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'manual',
      headers: body ? { 'x-editor': '1', 'content-type': 'application/json' } : { 'x-editor': '1' }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw Object.assign(new Error('offline'), { code: 'unavailable' }); }
  if (r.type === 'opaqueredirect' || r.status === 401 || r.status === 403) throw Object.assign(new Error('signed out: click the top-left corner three times to sign in again'), { code: 'signed-out' });
  const o = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(o.error || 'HTTP ' + r.status), { code: r.status >= 500 ? 'unavailable' : 'http-' + r.status });
  return o;
}
async function writeServer(col, id) {
  if (col === 'edits') {
    const o = await api('PUT', 'edits', { edits: Object.fromEntries(edits) });
    store.pr = o.pr || null; return;
  }
  const d = notes.get(id);
  if (!d) { const iss = removed.get(id); if (iss) await api('PATCH', 'notes/' + iss, { remove: true }); removed.delete(id); return; }
  if (!d.issue) {
    const o = await api('POST', 'notes', { id, note: d, shot: shots.get(id) || null });
    const cur = notes.get(id);
    if (cur) { Object.assign(cur, { issue: o.issue, url: o.url, n: o.issue }); renderList(); syncPins(); }      // on the hosted site a note's number is its issue number
    else removed.set(id, o.issue);      // deleted while it was being filed
    return;
  }
  await api('PATCH', 'notes/' + d.issue, { text: d.text, status: d.status });
}
async function loadServer(which = ['edits', 'notes']) {
  try {
    if (which.includes('edits')) { const o = await api('GET', 'edits'); store.pr = o.pr || null; onDocs('edits', Object.entries(o.edits || {}).filter(([k]) => ID_OK.test(k))); }
    if (which.includes('notes')) { const o = await api('GET', 'notes'); onDocs('notes', Object.entries(o.notes || {}).filter(([k]) => ID_OK.test(k))); }
    if (!dirty.size) setStatus('saved');
  } catch (e) { setStatus('error', e); }
}

// ---------- changing an edit (with undo) ----------
function docIdFor(it) {
  for (const [id, x] of where) if (x === it) return id;
  return it.key;
}
function baseDoc(it) {
  const d = { key: it.key, tag: it.el.tagName.toLowerCase(), kind: it.kind, name: it.name, sec: it.sec, section: it.section, fp: it.fp };
  if (it.kind === 'text') d.origHtml = it.orig.trim();
  return d;
}
function tidy(d) {
  if (d.style) { for (const k of Object.keys(d.style)) if (d.style[k] === '' || d.style[k] == null) delete d.style[k]; if (!Object.keys(d.style).length) delete d.style; }
  if (d.layout) {
    for (const k of Object.keys(d.layout)) {
      const L = d.layout[k] || {};
      for (const f of Object.keys(L)) if (L[f] === '' || L[f] == null || ((f === 'x' || f === 'y') && !L[f])) delete L[f];
      if (!Object.keys(L).length) delete d.layout[k];
    }
    if (!Object.keys(d.layout).length) delete d.layout;
  }
  if (!d.hidden) delete d.hidden;
  if (d.html == null) delete d.html;
}
function mutate(it, fn, tag) {
  const id = docIdFor(it);
  const before = clone(edits.get(id));
  const d = clone(edits.get(id)) || baseDoc(it);
  fn(d); tidy(d);
  const now = Date.now();
  if (!(tag && lastUndo && lastUndo.tag === tag && lastUndo.id === id && now - lastUndo.t < 1500)) undoStack.push({ id, before });
  if (undoStack.length > 200) undoStack.shift();
  lastUndo = { tag, id, t: now };
  if (d.html == null && !d.hidden && !d.style && !d.layout) edits.delete(id);
  else { d.updatedAt = new Date().toISOString(); edits.set(id, d); }
  applyAll(); save('edits', id);
}
function undo() {
  const u = undoStack.pop(); if (!u) return;
  if (u.before) edits.set(u.id, u.before); else edits.delete(u.id);
  lastUndo = null; applyAll(); save('edits', u.id);
}
const layoutOf = (it) => (edits.get(docIdFor(it))?.layout || {})[layoutNow()] || {};

// ---------- the 3D side: what is under a screen point, the camera, a snapshot ----------
const R = () => (window.__rig && window.__rig.scene ? window.__rig : null);
const RIG_NAMES = { crutch: 'Crutch + Water Break', scooter: 'Knee scooter', couch: 'Swerve couch', street: 'Street', course: 'Drift course', hearth: 'Hearth + Assym Restore', cat: 'Cat' };
function partMap(r) {
  const m = new Map();
  const put = (o, label) => { if (o && o.isObject3D && !m.has(o)) m.set(o, label); };
  for (const [k, v] of Object.entries(r.rigs || {})) {
    if (!v || typeof v !== 'object' || !v.g || !v.g.isObject3D) continue;
    const base = RIG_NAMES[k] || k;
    for (const [p, w] of Object.entries(v)) {
      if (p === 'g') continue;
      if (w && w.isObject3D) put(w, base + ' › ' + p);
      else if (Array.isArray(w)) w.slice(0, 64).forEach((x, i) => put(x && x.isObject3D ? x : x && x.m, `${base} › ${p}[${i}]`));
      else if (w && Object.getPrototypeOf(w) === Object.prototype) for (const [q, x] of Object.entries(w).slice(0, 64)) put(x && x.isObject3D ? x : x && x.m, `${base} › ${p}.${q}`);
    }
    put(v.g, base);
  }
  for (const [k, p] of Object.entries((r.kicker && r.kicker.parts) || {})) put(p.m, 'Brace (Kicker) › ' + k);
  put(r.figure, 'Figure');
  return m;
}
function probe(x, y) {
  const r = R(); if (!r) return null;
  const { THREE, camera, scene } = r;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const seen = (m) => [].concat(m).some((q) => q && q.visible !== false && q.colorWrite !== false && !(q.transparent && q.opacity < .06));
  const meshes = [];
  scene.traverseVisible((o) => { if (o.isMesh && seen(o.material)) meshes.push(o); });
  let h = null;
  try { h = ray.intersectObjects(meshes, false)[0]; } catch {}
  if (!h) return null;
  const pm = partMap(r);
  let label = '';
  for (let o = h.object; o; o = o.parent) { if (pm.has(o)) { label = pm.get(o); break; } if (!label && o.name) label = o.name; }
  const out = { point: arr(h.point), distance: rnd(h.distance, 10), object: label || (h.object.material && h.object.material.isShadowMaterial ? 'Floor' : 'Unnamed mesh') };
  if (out.object === 'Floor') out.floor = true;
  if (h.object.isSkinnedMesh && h.object.skeleton) {      // the figure: name the nearest bone
    let best = Infinity; const w = new THREE.Vector3();
    for (const b of h.object.skeleton.bones) { b.getWorldPosition(w); const dd = w.distanceToSquared(h.point); if (dd < best) { best = dd; out.bone = b.name; } }
  }
  return out;
}
function camInfo(dist) {
  const r = R(); if (!r) return null;
  const { camera, THREE } = r;
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const free = !!(r.free && r.free.on && !r.free.back);
  const look = free && r.controls ? r.controls.target.clone() : camera.position.clone().addScaledVector(dir, dist || 200);
  return { pos: arr(camera.position), dir: arr(dir, 1000), look: arr(look), fov: rnd(camera.fov, 10), free };
}
function capture(x, y) {
  const r = R(); if (!r || !r.renderer) return null;
  try {
    r.renderer.render(r.scene, r.camera);          // read back in the same task, before the buffer is presented
    const src = r.renderer.domElement, W = 640, H = Math.max(1, Math.round(W * src.height / src.width));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = getComputedStyle(document.body).backgroundColor || '#eeeef3'; g.fillRect(0, 0, W, H);
    g.drawImage(src, 0, 0, W, H);
    const px = x / innerWidth * W, py = y / innerHeight * H;
    g.lineWidth = 3; g.strokeStyle = '#ff2d6f'; g.beginPath(); g.arc(px, py, 14, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(px, py, 17, 0, Math.PI * 2); g.stroke();
    return { jpeg: c.toDataURL('image/jpeg', .72), w: W, h: H };
  } catch { return null; }
}
const sectionsNow = () => [...document.querySelectorAll('section[data-s]')];
function sNow() {
  const r = R(); if (r && typeof r.s === 'number') return r.s;
  const secs = sectionsNow(), mid = scrollY + innerHeight * .5, c = secs.map((el) => el.offsetTop + el.offsetHeight * .5);
  if (!c.length || mid <= c[0]) return 0;
  for (let i = 0; i < c.length - 1; i++) if (mid <= c[i + 1]) return i + (mid - c[i]) / (c[i + 1] - c[i]);
  return c.length - 1;
}
function scrollToS(s) {     // the inverse of main.html's readScroll
  const c = sectionsNow().map((el) => el.offsetTop + el.offsetHeight * .5); if (!c.length) return;
  const i = Math.max(0, Math.min(c.length - 2, Math.floor(s))), f = s - i;
  const mid = s <= 0 ? c[0] : s >= c.length - 1 ? c[c.length - 1] : c[i] + f * (c[i + 1] - c[i]);
  scrollTo({ top: Math.max(0, mid - innerHeight * .5), behavior: 'auto' });
}
let camHold = null;
function holdCam(cam) {
  releaseCam();
  if (!cam || !cam.free) return;
  camHold = setTimeout(() => {
    window.__cam = [cam.pos, cam.look];       // main.html's render-check hook: holds this camera until the visitor moves
    const off = () => { releaseCam(); ['wheel', 'keydown', 'touchstart', 'scroll'].forEach((t) => removeEventListener(t, off, true)); document.getElementById('stage')?.removeEventListener('pointerdown', off); };
    ['wheel', 'keydown', 'touchstart', 'scroll'].forEach((t) => addEventListener(t, off, { capture: true, passive: true }));
    document.getElementById('stage')?.addEventListener('pointerdown', off);
  }, 900);
}
function releaseCam() { clearTimeout(camHold); if (Array.isArray(window.__cam)) window.__cam = undefined; }

// ---------- UI ----------
const CSS = `
html.ed-on main, html.ed-on .titleblock { -webkit-user-select: none; user-select: none; }
html.ed-on [data-ed-sel] { touch-action: none; }
html.ed-on [contenteditable="true"] { -webkit-user-select: text; user-select: text; cursor: text; outline: 2px solid var(--neon) !important; outline-offset: 3px; }
html.ed-on.ed-note, html.ed-on.ed-note main *, html.ed-on.ed-note #stage, html.ed-on.ed-note .titleblock { cursor: crosshair !important; }
html.ed-on.ed-select main .card, html.ed-on.ed-select main .hero-wrap { cursor: default; }
.ed-ui { font-family: var(--f-mono); font-size: 11px; line-height: 1.45; color: var(--graphite); letter-spacing: .02em; text-transform: none; }
.ed-ui *, .ed-ui *::before { box-sizing: border-box; }
.ed-ui button { font: inherit; color: var(--graphite); background: var(--vellum); border: 1px solid var(--graphite); padding: 4px 8px; cursor: pointer; letter-spacing: .06em; text-transform: uppercase; }
.ed-ui button:hover, .ed-ui button[aria-pressed="true"] { background: var(--graphite); color: var(--vellum); }
.ed-ui button:disabled { opacity: .4; cursor: default; background: var(--vellum); color: var(--graphite); }
.ed-ui button:focus-visible, .ed-ui input:focus-visible, .ed-ui select:focus-visible, .ed-ui textarea:focus-visible { outline: 2px solid var(--cobalt); outline-offset: 1px; }
.ed-ui input, .ed-ui select, .ed-ui textarea { font: inherit; color: var(--graphite); background: var(--vellum); border: 1px solid color-mix(in srgb, var(--graphite) 35%, transparent); padding: 4px 6px; width: 100%; min-width: 0; border-radius: 0; }
.ed-ui input::placeholder, .ed-ui textarea::placeholder { color: color-mix(in srgb, var(--graphite-2) 75%, transparent); }
.ed-ui textarea { resize: vertical; font-family: var(--f-body); font-size: 14px; line-height: 1.4; }
#ed-panel { position: fixed; z-index: 60; left: 16px; bottom: 16px; width: 330px; max-height: calc(100vh - 92px); display: flex; flex-direction: column;
  background: var(--vellum); border: 1px solid var(--graphite); box-shadow: 0 12px 40px rgba(23, 21, 31, .24); }
#ed-panel.dock-right { left: auto; right: 16px; bottom: 100px; max-height: calc(100vh - 176px); }
#ed-panel[hidden] { display: none; }
#ed-panel > header { display: flex; align-items: center; gap: 6px; padding: 7px 8px 7px 10px; border-bottom: 1px solid var(--graphite); }
#ed-panel > header b { font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: var(--cobalt); margin-right: auto; }
#ed-panel > header button { padding: 2px 7px; }
#ed-status { color: var(--graphite-2); display: flex; align-items: center; gap: 5px; white-space: nowrap; }
#ed-status::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #27b36a; }
#ed-status[data-k="saving"]::before { background: #e0a400; }
#ed-status[data-k="error"]::before { background: #e5243b; }
#ed-status[data-k="local"]::before { background: var(--graphite-2); }
#ed-panel .ed-body { overflow: auto; padding: 10px; display: grid; gap: 10px; align-content: start; }
#ed-panel.min .ed-body { display: none; }
.ed-seg { display: grid; grid-template-columns: 1fr 1fr; }
.ed-seg button + button { border-left: 0; }
.ed-hint { color: var(--graphite-2); }
#ed-panel.has-sel .ed-body > .ed-hint { display: none; }
.ed-insp[hidden] { display: none; }
.ed-insp { display: grid; gap: 8px; border: 1px solid color-mix(in srgb, var(--graphite) 20%, transparent); padding: 8px; }
.ed-insp h3 { margin: 0; font: inherit; display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.ed-insp h3 b { font-weight: 500; color: var(--cobalt); text-transform: uppercase; letter-spacing: .1em; }
.ed-insp h3 span { color: var(--graphite-2); }
.ed-row { display: flex; flex-wrap: wrap; gap: 4px; }
.ed-row button { padding: 3px 7px; }
.ed-sub { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--graphite-2); margin-top: 2px; display: flex; justify-content: space-between; gap: 6px; }
.ed-sub button { padding: 0 5px; font-size: 10px; }
.ed-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
.ed-f { display: grid; gap: 2px; min-width: 0; }
.ed-f > span { font-size: 10px; color: var(--graphite-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ed-sw { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.ed-sw button { width: 22px; height: 22px; padding: 0; border-color: color-mix(in srgb, var(--graphite) 40%, transparent); }
.ed-sw button[aria-pressed="true"] { outline: 2px solid var(--cobalt); outline-offset: 1px; }
.ed-sw input[type=color] { width: 30px; height: 22px; padding: 0 2px; }
.ed-sw .ed-clr { width: auto; padding: 0 6px; font-size: 10px; }
.ed-tabs { display: grid; grid-template-columns: 1fr 1fr; }
.ed-tabs button + button { border-left: 0; }
.ed-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ed-list li { display: flex; gap: 4px; align-items: stretch; }
.ed-list li > button:first-child { flex: 1; text-align: left; text-transform: none; letter-spacing: .02em; display: flex; gap: 8px; align-items: flex-start; min-width: 0; }
.ed-list li > button:first-child span { min-width: 0; overflow-wrap: anywhere; }
.ed-list li > button:first-child small { display: block; color: var(--graphite-2); font-size: 10px; }
.ed-list li > button:first-child:hover small { color: inherit; }
.ed-list li.stale > button:first-child { border-style: dashed; }
.ed-list .ed-n { flex: none; width: 20px; height: 20px; border-radius: 50%; background: var(--sun); color: #fff; display: grid; place-items: center; font-size: 10px; }
.ed-list .done .ed-n { background: var(--graphite-2); }
.ed-empty { color: var(--graphite-2); }
.ed-foot { display: flex; flex-wrap: wrap; gap: 4px; }
.ed-box { position: fixed; z-index: 55; pointer-events: none; display: none; }
#ed-hov { outline: 1px dashed var(--cobalt); outline-offset: 3px; }
#ed-sel { outline: 1.5px solid var(--cobalt); outline-offset: 3px; }
#ed-sel .ed-tag { position: absolute; left: -4px; bottom: 100%; margin-bottom: 6px; background: var(--cobalt); color: var(--vellum); padding: 1px 6px; white-space: nowrap;
  font: 10px/1.6 var(--f-mono); letter-spacing: .08em; text-transform: uppercase; }
#ed-sel .ed-wh { position: absolute; right: -9px; top: 50%; width: 10px; height: 30px; margin-top: -15px; background: var(--vellum); border: 1.5px solid var(--cobalt); pointer-events: auto; cursor: ew-resize; touch-action: none; }
#ed-pins { position: fixed; inset: 0; z-index: 57; pointer-events: none; overflow: hidden; }
#ed-pins .ed-pin { position: absolute; left: 0; top: 0; width: 22px; height: 22px; margin: -11px 0 0 -11px; padding: 0; border-radius: 50%; border: 2px solid #fff;
  background: var(--sun); color: #fff; font: 500 10px/18px var(--f-mono); text-align: center; pointer-events: auto; cursor: pointer; box-shadow: 0 1px 6px rgba(0, 0, 0, .35); }
#ed-pins .ed-pin.done { background: var(--graphite-2); color: #fff; }
#ed-pins .ed-pin.draft { background: var(--cobalt); }
#ed-pins .ed-pin:hover { background: var(--cobalt); color: #fff; }
#ed-pop { position: fixed; z-index: 70; width: min(330px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto; background: var(--vellum); border: 1px solid var(--graphite); box-shadow: 0 12px 40px rgba(23, 21, 31, .28);
  display: grid; gap: 8px; padding: 10px; }
#ed-pop[hidden] { display: none; }
#ed-pop header { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
#ed-pop header b { font-weight: 500; color: var(--cobalt); letter-spacing: .1em; text-transform: uppercase; }
#ed-pop header span, #ed-pop .ed-ctx { color: var(--graphite-2); }
#ed-pop img { width: 100%; max-height: 24vh; object-fit: contain; background: var(--vellum-2); display: block; border: 1px solid color-mix(in srgb, var(--graphite) 20%, transparent); }
#ed-pop .ed-reply { border-left: 2px solid var(--cobalt); padding-left: 8px; font-family: var(--f-body); font-size: 13px; }
#ed-pop .ed-reply b { display: block; font: 500 10px/1.4 var(--f-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--cobalt); }
#ed-brief { position: fixed; z-index: 80; inset: 0; display: grid; place-items: center; background: color-mix(in srgb, var(--vellum) 60%, transparent); padding: 16px; }
#ed-brief[hidden] { display: none; }
#ed-brief > div { width: min(640px, 100%); max-height: calc(100vh - 32px); display: grid; grid-template-rows: auto 1fr auto; gap: 8px; background: var(--vellum);
  border: 1px solid var(--graphite); padding: 12px; box-shadow: 0 12px 40px rgba(23, 21, 31, .28); }
#ed-brief textarea { font-family: var(--f-mono); font-size: 11px; min-height: 40vh; }
@media (max-width: 720px) {
  #ed-panel, #ed-panel.dock-right { left: 8px; right: 8px; top: calc(8px + env(safe-area-inset-top, 0px)); bottom: auto; width: auto; max-height: 44vh; }   /* cards sit low on a phone */
  .ed-grid { grid-template-columns: 1fr 1fr; }
}`;

let panel, bodyEl, hintEl, inspEl, listEl, ncEl, nnEl, hovBox, selBox, selTag, pinsEl, popEl, briefEl, toggleBtn, fileIn, prBtn;
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
function buildUI() {
  if (panel) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  panel = el(`<div id="ed-panel" class="ed-ui" role="dialog" aria-label="Site editor">
    <header><b>Editor</b><span id="ed-status"></span>
      <button type="button" data-act="dock" title="Move the panel to the other side (it stays there)">⇆</button>
      <button type="button" data-act="min" title="Fold the panel">–</button>
      <button type="button" data-act="close" title="Leave edit mode (Esc)">✕</button></header>
    <div class="ed-body">
      <div class="ed-seg" role="group" aria-label="Tool"><button type="button" data-mode="select">Select · move</button><button type="button" data-mode="note">Annotate</button></div>
      <div class="ed-hint"></div>
      <div class="ed-insp" hidden></div>
      <div class="ed-tabs" role="group" aria-label="Lists"><button type="button" data-tab="changes">Changes <span></span></button><button type="button" data-tab="notes">Notes <span></span></button></div>
      <div class="ed-listwrap"></div>
      <div class="ed-foot">
        <button type="button" data-act="undo" title="Undo (Ctrl/⌘ Z)">Undo</button>
        <button type="button" data-act="brief">Summary for Claude</button>
        <button type="button" data-act="export" data-local>Export</button>
        <button type="button" data-act="import" data-local>Import</button>
        <button type="button" data-act="pr" hidden title="Your edits wait in this pull request: check its preview link, then merge it to publish">Review PR</button>
      </div>
    </div></div>`);
  document.body.appendChild(panel);
  bodyEl = panel.querySelector('.ed-body'); hintEl = panel.querySelector('.ed-hint'); inspEl = panel.querySelector('.ed-insp');
  listEl = panel.querySelector('.ed-listwrap'); statusEl = panel.querySelector('#ed-status');
  [ncEl, nnEl] = panel.querySelectorAll('.ed-tabs span');
  prBtn = panel.querySelector('[data-act="pr"]');
  panel.querySelectorAll('[data-local]').forEach((b) => { b.hidden = store.mode !== 'local'; });
  dockPin = ls.get(LS_DOCK);            // 'left' / 'right' once ⇆ is used; otherwise the panel keeps to the side away from the card
  hovBox = el('<div id="ed-hov" class="ed-box ed-ui"></div>');
  selBox = el('<div id="ed-sel" class="ed-box ed-ui"><span class="ed-tag"></span><i class="ed-wh" title="Drag to change the width"></i></div>');
  selTag = selBox.querySelector('.ed-tag');
  pinsEl = el('<div id="ed-pins" class="ed-ui" aria-label="Notes on the page"></div>');
  popEl = el('<div id="ed-pop" class="ed-ui" role="dialog" aria-label="Note" hidden></div>');
  briefEl = el(`<div id="ed-brief" class="ed-ui" hidden><div><header class="ed-sub"><span>Summary for Claude</span><button type="button" data-act="briefclose">Close</button></header>
    <textarea readonly></textarea><div class="ed-row"><button type="button" data-act="copy">Copy</button><span class="ed-hint"></span></div></div></div>`);
  fileIn = el('<input type="file" accept="application/json,.json" hidden>');
  document.body.append(hovBox, selBox, pinsEl, popEl, briefEl, fileIn);

  panel.addEventListener('click', onPanelClick);
  panel.addEventListener('input', onInspInput);
  panel.addEventListener('change', onInspInput);
  briefEl.addEventListener('click', onBriefClick);
  popEl.addEventListener('click', onPopClick);
  pinsEl.addEventListener('click', (e) => { const b = e.target.closest('.ed-pin'); if (b && b.dataset.id) openNote(b.dataset.id); });
  selBox.querySelector('.ed-wh').addEventListener('pointerdown', startWidthDrag);
  fileIn.addEventListener('change', importFile);
  setStatus('saved');
  setMode(mode);
}
function addToggle() {
  const bar = document.querySelector('.viewbar'); if (!bar || toggleBtn) return;
  toggleBtn = document.createElement('button'); toggleBtn.type = 'button'; toggleBtn.id = 'ed-toggle'; toggleBtn.textContent = 'Edit';
  toggleBtn.title = 'Edit the page and leave notes for Claude (only you see this)';
  toggleBtn.setAttribute('aria-pressed', 'false');
  toggleBtn.addEventListener('click', () => setOn(!on));
  bar.appendChild(toggleBtn);
}
function setOn(v) {
  if (v === on) return;
  if (!v) { if (editing) commitText(); closePop(); select(null); hovered = null; releaseCam(); }
  on = v;
  document.documentElement.classList.toggle('ed-on', v);
  if (v) { buildUI(); panel.hidden = false; setMode(mode); requestAnimationFrame(tick); applyAll(); if (store.mode === 'server') loadServer(); }     // the hosted site: Claude's replies and the open PR
  else if (panel) { panel.hidden = true; pinsEl.replaceChildren(); hovBox.style.display = selBox.style.display = 'none'; document.documentElement.classList.remove('ed-select', 'ed-note'); }
  if (toggleBtn) { toggleBtn.textContent = v ? 'Done editing' : 'Edit'; toggleBtn.setAttribute('aria-pressed', String(v)); }
  ls.set(LS_ON, v ? '1' : '0');
}
const HINTS = {
  select: 'Click any text or block to select it. Drag it to move it, double-click to retype it (Enter keeps it, Esc undoes), Alt-click for the block around it. Arrow keys nudge it, Shift for 10 px.',
  note: 'Click anywhere, on a card or on the model, to pin a note there for Claude. It records the scroll position, the camera and the part you clicked. Dragging still turns the view.',
};
function setMode(m) {
  mode = m;
  if (!panel) return;
  panel.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  document.documentElement.classList.toggle('ed-select', on && m === 'select');
  document.documentElement.classList.toggle('ed-note', on && m === 'note');
  hintEl.textContent = HINTS[m];
  if (m === 'note') { select(null); if (tab !== 'notes') { tab = 'notes'; renderList(); } }
}

// ---------- inspector ----------
const COLORS = [['--graphite', 'Ink'], ['--graphite-2', 'Grey ink'], ['--cobalt', 'Violet'], ['--neon', 'Cyan'], ['--sun', 'Pink'], ['--red', 'Red']];
const TYPE = [
  ['font', 'Font', 'select', [['', 'Default'], ['display', 'Display'], ['body', 'Body'], ['mono', 'Mono']]],
  ['size', 'Size px', 'number', '1'],
  ['weight', 'Weight', 'select', [['', 'Default'], ['300', '300 light'], ['400', '400'], ['500', '500'], ['600', '600'], ['700', '700 bold'], ['800', '800']]],
  ['italic', 'Style', 'select', [['', 'Default'], ['1', 'Italic'], ['0', 'Upright']]],
  ['tt', 'Case', 'select', [['', 'Default'], ['none', 'As typed'], ['uppercase', 'UPPER'], ['lowercase', 'lower'], ['capitalize', 'Title']]],
  ['align', 'Align', 'select', [['', 'Default'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['justify', 'Justify']]],
  ['lh', 'Line height', 'number', '0.05'],
  ['ls', 'Spacing em', 'number', '0.01'],
  ['op', 'Opacity', 'number', '0.05'],
];
function field([k, label, type, opt], scope) {
  const inner = type === 'select'
    ? `<select data-k="${k}" data-scope="${scope}">${opt.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`
    : `<input data-k="${k}" data-scope="${scope}" type="number" step="${opt}" inputmode="decimal">`;
  return `<label class="ed-f"><span>${label}</span>${inner}</label>`;
}
function renderInspector() {
  if (!panel) return;
  panel.classList.toggle('has-sel', !!sel);
  if (!sel) { inspEl.hidden = true; inspEl.innerHTML = ''; return; }
  const it = sel, d = edits.get(docIdFor(it)) || {};
  inspEl.hidden = false;
  inspEl.innerHTML = `<h3><b>${esc(it.name)}</b><span>${esc(it.section)}</span></h3>
    <div class="ed-row">
      ${it.kind === 'text' ? '<button type="button" data-act="text">Retype</button>' : ''}
      <button type="button" data-act="parent" title="Select the block around this">Parent ↑</button>
      <button type="button" data-act="hide" aria-pressed="${!!d.hidden}">${d.hidden ? 'Hidden' : 'Hide'}</button>
      <button type="button" data-act="reset" title="Undo every change to this element">Reset</button>
      <button type="button" data-act="notehere" title="Pin a note to this element">Note</button>
    </div>
    <div class="ed-sub"><span>Type · every screen size</span><button type="button" data-act="resettype">clear</button></div>
    <div class="ed-grid">${TYPE.map((f) => field(f, 'style')).join('')}</div>
    <div class="ed-sw" role="group" aria-label="Colour">${COLORS.map(([v, t]) => `<button type="button" data-color="var(${v})" title="${t}" style="background:var(${v})"></button>`).join('')}
      <input type="color" data-k="color" data-scope="style" title="Any colour"><button type="button" class="ed-clr" data-color="">Default</button></div>
    <div class="ed-sub"><span>Position · <span class="ed-lay"></span> only</span><button type="button" data-act="resetpos">clear</button></div>
    <div class="ed-grid">
      ${field(['x', 'Move x px', 'number', '1'], 'layout')}${field(['y', 'Move y px', 'number', '1'], 'layout')}${field(['w', 'Width px', 'number', '1'], 'layout')}
    </div>
    ${it.kind === 'card' && it.sec != null ? `<div class="ed-row" role="group" aria-label="Side"><span class="ed-hint" style="align-self:center">Side</span>
      ${['left', 'center', 'right'].map((s) => `<button type="button" data-side="${s}">${s === 'center' ? 'Centre' : s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div>` : ''}`;
  syncInspector(true);
}
function syncInspector(force) {
  if (!panel || !sel || inspEl.hidden) return;
  const it = sel, d = edits.get(docIdFor(it)) || {}, st = d.style || {}, L = layoutOf(it);
  const cs = getComputedStyle(it.el), fs = parseFloat(cs.fontSize) || 16;
  const ph = {
    size: Math.round(fs), lh: cs.lineHeight === 'normal' ? 'normal' : rnd(parseFloat(cs.lineHeight) / fs), ls: cs.letterSpacing === 'normal' ? 0 : rnd(parseFloat(cs.letterSpacing) / fs, 1000),
    op: rnd(+cs.opacity), x: 0, y: 0, w: Math.round(it.el.getBoundingClientRect().width),
  };
  inspEl.querySelectorAll('[data-k]').forEach((inp) => {
    if (!force && inp === document.activeElement) return;
    const k = inp.dataset.k, src = inp.dataset.scope === 'layout' ? L : st;
    let v = src[k];
    if (k === 'italic' && v != null) v = v ? '1' : '0';
    if (inp.type === 'color') { if (v && /^#[0-9a-f]{6}$/i.test(v)) inp.value = v; return; }
    inp.value = v == null ? '' : String(v);
    if (ph[k] != null && inp.tagName === 'INPUT') inp.placeholder = String(ph[k]);
  });
  inspEl.querySelectorAll('[data-color]').forEach((b) => b.setAttribute('aria-pressed', String((st.color || '') === b.dataset.color)));
  inspEl.querySelectorAll('[data-side]').forEach((b) => b.setAttribute('aria-pressed', String(L.side === b.dataset.side)));
  const hb = inspEl.querySelector('[data-act="hide"]'); if (hb) { hb.setAttribute('aria-pressed', String(!!d.hidden)); hb.textContent = d.hidden ? 'Hidden' : 'Hide'; }
  const lay = inspEl.querySelector('.ed-lay'); if (lay) lay.textContent = layoutNow() === 'phone' ? 'phone width' : 'desktop width';
}
function onInspInput(e) {
  const inp = e.target; if (!sel || !inp.dataset || !inp.dataset.k) return;
  if ((inp.tagName === 'SELECT') !== (e.type === 'change')) return;       // selects save on change, number and colour inputs as you type
  const k = inp.dataset.k, scope = inp.dataset.scope, raw = inp.value;
  let v = raw === '' ? null : raw;
  if (v != null && inp.type === 'number') { v = Number(v); if (!Number.isFinite(v)) return; }
  if (k === 'italic' && v != null) v = v === '1';
  if (k === 'weight' && v != null) v = Number(v);
  mutate(sel, (d) => {
    if (scope === 'style') { d.style = d.style || {}; d.style[k] = v; }
    else { d.layout = d.layout || {}; const L = (d.layout[layoutNow()] = d.layout[layoutNow()] || {}); L[k] = v; }
  }, scope + ':' + k);
}

// ---------- lists ----------
function editSummary(d) {
  const o = [];
  if (d.html != null) o.push('text');
  const st = d.style || {};
  if (st.font) o.push(st.font + ' font'); if (st.size) o.push(st.size + ' px'); if (st.weight) o.push('weight ' + st.weight);
  if (st.italic != null) o.push(st.italic ? 'italic' : 'upright'); if (st.color) o.push('colour'); if (st.align) o.push(st.align);
  if (st.lh) o.push('line ' + st.lh); if (st.ls != null) o.push('spacing ' + st.ls); if (st.tt) o.push(st.tt); if (st.op != null) o.push('opacity ' + st.op);
  for (const [k, L] of Object.entries(d.layout || {})) {
    const p = [];
    if (L.x || L.y) p.push(`moved ${L.x || 0}, ${L.y || 0}`); if (L.w) p.push(`width ${L.w}`); if (L.side) p.push(L.side + ' side');
    if (p.length) o.push(p.join(', ') + ` (${k})`);
  }
  if (d.hidden) o.push('hidden');
  return o.join(' · ') || 'no change';
}
function noteWhere(n) {
  const t = n.target || {};
  if (t.kind === 'text' || t.kind === 'block') return `${t.name || 'Element'} “${(t.fp || '').slice(0, 48)}${(t.fp || '').length > 48 ? '…' : ''}”`;
  if (t.kind === 'floor') return `Floor at x ${t.point[0]}, z ${t.point[2]}`;
  if (t.kind === '3d') return `${t.object}${t.bone ? ', near ' + t.bone : ''}`;
  return 'Background';
}
const sortedNotes = () => [...notes.entries()].sort((a, b) => (a[1].n || 0) - (b[1].n || 0));
function renderList() {
  if (!panel) return;
  panel.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  const open = [...notes.values()].filter((n) => n.status !== 'done').length;
  ncEl.textContent = edits.size ? `(${edits.size})` : ''; nnEl.textContent = notes.size ? `(${open} open)` : '';
  panel.querySelector('[data-act="undo"]').disabled = !undoStack.length;
  if (tab === 'changes') {
    const rows = [...edits.entries()].map(([id, d]) => {
      const ok = where.has(id);
      return `<li data-id="${esc(id)}" class="${ok ? '' : 'stale'}"><button type="button" data-act="goedit"><span>${esc(d.name || 'Element')} · ${esc(d.section || '')}
        <small>${ok ? esc(editSummary(d)) : 'Not on the page any more: the source changed since this edit. Reset it, or ask Claude to redo it.'}</small></span></button>
        <button type="button" data-act="deledit" title="Reset this element">↺</button></li>`;
    });
    listEl.innerHTML = rows.length ? `<ul class="ed-list">${rows.join('')}</ul>` : '<p class="ed-empty">No changes yet. Select some text or a card to start.</p>';
  } else {
    const all = sortedNotes(), done = all.filter(([, n]) => n.status === 'done');
    const shown = all.filter(([, n]) => (noteFilter === 'done') === (n.status === 'done'));
    listEl.innerHTML = `<div class="ed-row" role="group" aria-label="Filter"><button type="button" data-f="open" aria-pressed="${noteFilter === 'open'}">Open ${all.length - done.length}</button>
      <button type="button" data-f="done" aria-pressed="${noteFilter === 'done'}">Done ${done.length}</button></div>` +
      (shown.length ? `<ul class="ed-list">${shown.map(([id, n]) => `<li data-id="${esc(id)}" class="${n.status === 'done' ? 'done' : ''}"><button type="button" data-act="gonote">
        <i class="ed-n">${esc(n.n)}</i><span>${esc((n.section && n.section.eyebrow) || '')}<small>${esc(noteWhere(n))}</small>${esc((n.text || '').slice(0, 140))}${n.reply ? '<small>Claude replied</small>' : ''}</span></button></li>`).join('')}</ul>`
        : `<p class="ed-empty">${noteFilter === 'done' ? 'Nothing marked done yet.' : 'No open notes. Switch to Annotate and click on the page.'}</p>`);
  }
}
function onPanelClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  const act = b.dataset.act, li = b.closest('li'), id = li && li.dataset.id;
  if (b.dataset.mode) return setMode(b.dataset.mode);
  if (b.dataset.tab) { tab = b.dataset.tab; if (tab === 'notes' && store.mode === 'server') loadServer(['notes']); return renderList(); }
  if (b.dataset.f) { noteFilter = b.dataset.f; return renderList(); }
  if (b.dataset.side && sel) { const s = b.dataset.side; return mutate(sel, (d) => { d.layout = d.layout || {}; const L = (d.layout[layoutNow()] = d.layout[layoutNow()] || {}); L.side = L.side === s ? null : s; }); }
  if (b.hasAttribute('data-color') && sel) { const c = b.dataset.color || null; return mutate(sel, (d) => { d.style = d.style || {}; d.style.color = c; }); }
  switch (act) {
    case 'close': return setOn(false);
    case 'min': panel.classList.toggle('min'); b.textContent = panel.classList.contains('min') ? '+' : '–'; return;
    case 'dock': dockPin = panel.classList.contains('dock-right') ? 'left' : 'right'; ls.set(LS_DOCK, dockPin); return autoDock();
    case 'undo': return undo();
    case 'brief': return openBrief();
    case 'pr': return store.pr && /^https:\/\/github\.com\//.test(store.pr.url) && window.open(store.pr.url, '_blank', 'noopener');
    case 'export': return exportFile();
    case 'import': return fileIn.click();
    case 'text': return sel && startText(sel);
    case 'parent': { if (!sel) return; const p = sel.el.parentElement && pick(sel.el.parentElement, false); return p && select(p); }
    case 'hide': return sel && mutate(sel, (d) => { d.hidden = !d.hidden; });
    case 'reset': return sel && mutate(sel, (d) => { d.html = null; d.style = null; d.layout = null; d.hidden = false; });
    case 'resettype': return sel && mutate(sel, (d) => { d.style = null; });
    case 'resetpos': return sel && mutate(sel, (d) => { if (d.layout) delete d.layout[layoutNow()]; });
    case 'notehere': { if (!sel) return; const r = sel.el.getBoundingClientRect(); return draftAt(r.left + Math.min(24, r.width / 2), r.top + Math.min(16, r.height / 2), sel.el); }
    case 'goedit': { const it = where.get(id); if (!it) return; if (it.sec != null) it.el.scrollIntoView({ block: 'center' }); select(it); return; }
    case 'deledit': { const it = where.get(id); if (it) return mutate(it, (d) => { d.html = null; d.style = null; d.layout = null; d.hidden = false; }); undoStack.push({ id, before: clone(edits.get(id)) }); edits.delete(id); applyAll(); save('edits', id); return; }
    case 'gonote': return goNote(id);
  }
}

// ---------- selecting, moving, resizing ----------
function pick(t, alt) {
  for (let n = t && t.nodeType === 1 ? t : t && t.parentElement; n && n !== document.body; n = n.parentElement) {
    if (n.classList && n.classList.contains('ed-ui')) return null;
    const it = byEl.get(n);
    if (it && (!alt || it.kind !== 'text')) return it;
  }
  return null;
}
function select(it) {
  if (sel === it) return;
  if (editing && (!it || editing.it !== it)) commitText();
  if (sel) sel.el.removeAttribute('data-ed-sel');
  sel = it;
  if (sel) sel.el.setAttribute('data-ed-sel', '');
  renderInspector();
}
let drag = null, lastDown = { it: null, t: 0 };
function onPointerDown(e) {
  if (!on || e.button > 0) return;
  if (E.inDoor && E.inDoor(e)) return;            // the hosted site keeps the top-left corner for the door
  const t = e.target;
  if (t.closest && t.closest('.ed-ui')) return;
  if (editing && editing.it.el.contains(t)) return;              // caret placement inside the text being typed
  if (editing) commitText();
  if (popEl && !popEl.hidden) {
    const ta = popEl.querySelector('textarea');
    if (draft && ta && ta.value.trim()) { e.preventDefault(); e.stopPropagation(); ta.focus(); return; }   // keep a half-written note
    closePop();
  }
  if (mode === 'note') {
    noteDown = { x: e.clientX, y: e.clientY, t: performance.now(), target: t, free: !!(R() && R().free && R().free.on && !R().free.back) };
    if (t.id !== 'stage') { e.preventDefault(); e.stopPropagation(); }
    return;
  }
  const it = pick(t, e.altKey);
  if (!it) { if (t.id === 'stage') select(null); return; }
  e.preventDefault(); e.stopPropagation();
  const now = performance.now();
  if (lastDown.it === it && now - lastDown.t < 380 && it.kind === 'text') { lastDown.it = null; select(it); startText(it, e.clientX, e.clientY); return; }
  lastDown = { it, t: now };
  select(it);
  const L = layoutOf(it);
  drag = { it, x0: e.clientX, y0: e.clientY, bx: L.x || 0, by: L.y || 0, moved: false, id: e.pointerId };
  addEventListener('pointermove', onDragMove, true); addEventListener('pointerup', onDragEnd, true); addEventListener('pointercancel', onDragEnd, true);
}
function onDragMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  let dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true; lastDown.it = null;
  if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
  drag.x = Math.round(drag.bx + dx); drag.y = Math.round(drag.by + dy);
  drag.it.el.style.setProperty('translate', `${drag.x}px ${drag.y}px`, 'important');
  selTag.textContent = `${drag.it.name} · ${drag.x}, ${drag.y}`;
  e.preventDefault();
}
function onDragEnd(e) {
  if (!drag || e.pointerId !== drag.id) return;
  removeEventListener('pointermove', onDragMove, true); removeEventListener('pointerup', onDragEnd, true); removeEventListener('pointercancel', onDragEnd, true);
  const g = drag; drag = null;
  g.it.el.style.removeProperty('translate');
  if (g.moved) mutate(g.it, (d) => { d.layout = d.layout || {}; const L = (d.layout[layoutNow()] = d.layout[layoutNow()] || {}); L.x = g.x; L.y = g.y; });
}
function startWidthDrag(e) {
  if (!sel) return;
  e.preventDefault(); e.stopPropagation();
  const it = sel, w0 = it.el.getBoundingClientRect().width, x0 = e.clientX, h = e.currentTarget;
  h.setPointerCapture(e.pointerId);
  let w = w0;
  const move = (ev) => { w = Math.max(60, Math.round(w0 + ev.clientX - x0)); it.el.style.setProperty('width', w + 'px', 'important'); it.el.style.setProperty('max-width', 'none', 'important'); selTag.textContent = `${it.name} · width ${w}`; };
  const up = () => {
    h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
    it.el.style.removeProperty('width'); it.el.style.removeProperty('max-width');
    if (Math.abs(w - w0) >= 1) mutate(it, (d) => { d.layout = d.layout || {}; const L = (d.layout[layoutNow()] = d.layout[layoutNow()] || {}); L.w = w; });
  };
  h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
}
function nudge(dx, dy) {
  if (!sel) return;
  mutate(sel, (d) => { d.layout = d.layout || {}; const L = (d.layout[layoutNow()] = d.layout[layoutNow()] || {}); L.x = (L.x || 0) + dx; L.y = (L.y || 0) + dy; }, 'nudge');
}

// ---------- retyping ----------
function caretAt(x, y) {
  let r = null;
  if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(x, y);
  else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) { r = document.createRange(); r.setStart(p.offsetNode, p.offset); } }
  return r;
}
function startText(it, x, y) {
  if (it.kind !== 'text' || editing) return;
  editing = { it, before: it.el.innerHTML }; E.editingEl = it.el;
  const t = it.el;
  t.setAttribute('contenteditable', 'true'); t.spellcheck = true;
  t.focus({ preventScroll: true });
  const s = getSelection(), r = x != null ? caretAt(x, y) : null;
  if (r && t.contains(r.startContainer)) { s.removeAllRanges(); s.addRange(r); }
  else { const q = document.createRange(); q.selectNodeContents(t); q.collapse(false); s.removeAllRanges(); s.addRange(q); }
  t.addEventListener('blur', commitText, { once: true });
  t.addEventListener('paste', onPaste);
  if (selTag) selTag.textContent = it.name + ' · typing (Enter keeps, Esc undoes)';
}
function onPaste(e) { e.preventDefault(); const txt = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, txt.replace(/\s*\n\s*/g, ' ')); }
function endText() {
  const g = editing; editing = null; E.editingEl = null;
  g.it.el.removeAttribute('contenteditable'); g.it.el.removeEventListener('paste', onPaste); g.it.el.removeEventListener('blur', commitText);
  return g;
}
function commitText() {
  if (!editing) return;
  const g = endText(), t = g.it.el;
  const html = sanitize(t.innerHTML);
  if (html === sanitize(g.before)) { t.innerHTML = g.before; return; }
  mutate(g.it, (d) => { d.html = html === sanitize(g.it.orig) ? null : html; });
}
function cancelText() { if (!editing) return; const g = endText(); g.it.el.innerHTML = g.before; g.it.el.blur(); }

// ---------- notes ----------
let noteDown = null;
function onPointerUp(e) {
  if (!on || mode !== 'note' || !noteDown) return;
  const d = noteDown; noteDown = null;
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 700) return;   // a drag turned the view
  if (e.target.closest && e.target.closest('.ed-ui')) return;
  draftAt(d.x, d.y, d.target, d.free);
}
function draftAt(x, y, target, wasFree) {
  const it = target && target.id !== 'stage' ? pick(target, false) : null;
  const s = sNow(), secs = sectionsNow();
  const sec = (it && it.el.closest('section[data-s]')) || secs[Math.max(0, Math.min(secs.length - 1, Math.round(s)))];
  const n = {
    n: 0, text: '', status: 'open', reply: '',
    s: rnd(s, 1000), section: { index: sec ? +sec.dataset.s : Math.round(s), eyebrow: sec ? norm(sec.querySelector('.eyebrow')?.textContent) : '', title: sec ? norm(sec.querySelector('h1, h2')?.textContent) : '' },
    layout: layoutNow(), viewport: { w: innerWidth, h: innerHeight }, scrollY: Math.round(scrollY),
    screen: { x: Math.round(x), y: Math.round(y), fx: rnd(x / innerWidth, 1000), fy: rnd(y / innerHeight, 1000) },
  };
  let hit = null;
  if (it) {
    const r = it.el.getBoundingClientRect();
    n.target = { kind: it.kind === 'text' ? 'text' : 'block', key: it.key, name: it.name, fp: it.fp.slice(0, 120), rel: [rnd((x - r.left) / (r.width || 1)), rnd((y - r.top) / (r.height || 1))] };
  } else {
    hit = probe(x, y);
    n.target = hit ? { kind: hit.floor ? 'floor' : '3d', object: hit.object, point: hit.point, distance: hit.distance, ...(hit.bone ? { bone: hit.bone } : {}) } : { kind: 'empty' };
  }
  n.camera = camInfo(hit && hit.distance);
  if (n.camera && wasFree === false) n.camera.free = false;
  draft = { n, shot: capture(x, y) };
  popId = null;
  showPop(n, true, x, y);
}
function nextN() { let m = 0; for (const n of notes.values()) m = Math.max(m, n.n || 0); return m + 1; }
function showPop(n, isDraft, x, y) {
  const issue = !isDraft && n.issue && /^https:\/\/github\.com\//.test(n.url || '') ? ` · <a href="${esc(n.url)}" target="_blank" rel="noopener">issue #${esc(n.issue)}</a>` : '';
  popEl.innerHTML = `<header><b>${isDraft ? 'New note' : 'Note ' + esc(n.n)}</b><span>${esc((n.section && n.section.eyebrow) || '')} · scroll ${esc(n.s)}${issue}</span></header>
    <div class="ed-ctx">On: ${esc(noteWhere(n))}${n.camera && n.camera.free ? ' · your own camera angle' : ''}</div>
    <textarea rows="4" aria-label="Note for Claude" placeholder="What should change here? Rough is fine; Claude reads this later."></textarea>
    ${n.reply ? `<div class="ed-reply"><b>Claude</b><span></span></div>` : ''}
    <div class="ed-shotwrap"></div>
    <div class="ed-row">${isDraft
      ? '<button type="button" data-act="psave">Save note</button><button type="button" data-act="pcancel">Cancel</button>'
      : `<button type="button" data-act="psave">Save</button><button type="button" data-act="pstatus">${n.status === 'done' ? 'Reopen' : 'Mark done'}</button>
         <button type="button" data-act="pgo">Go to view</button><button type="button" data-act="pdel">Delete</button><button type="button" data-act="pcancel">Close</button>`}</div>`;
  const ta = popEl.querySelector('textarea'); ta.value = n.text || '';
  if (n.reply) popEl.querySelector('.ed-reply span').textContent = n.reply;
  const shot = isDraft ? draft.shot : null;
  const wrap = popEl.querySelector('.ed-shotwrap');
  const putShot = (s) => {
    const src = s && (typeof s.jpeg === 'string' && s.jpeg.startsWith('data:image/jpeg;base64,') ? s.jpeg : typeof s.url === 'string' && s.url.startsWith('/admin/api/shots/') ? s.url : '');
    if (src) { const im = new Image(); im.alt = 'The view when the note was made'; im.onload = () => fitPop(); im.src = src; wrap.replaceChildren(im); }
  };
  if (shot) putShot(shot); else if (!isDraft && popId) loadShot(popId).then((s) => { if (popEl && !popEl.hidden && popId) putShot(s); });
  popEl.hidden = false; popEl.dataset.x = x; popEl.dataset.y = y;
  fitPop();
  ta.focus({ preventScroll: true });
  syncPins();
}
function fitPop() {          // beside the point, flipped and clamped so the whole card stays on screen
  if (!popEl || popEl.hidden) return;
  const x = +popEl.dataset.x, y = +popEl.dataset.y, W = popEl.offsetWidth || 330, H = popEl.offsetHeight || 220;
  let px = x + 18, py = y - 20;
  if (px + W > innerWidth - 12) px = x - W - 18;
  px = Math.max(12, Math.min(innerWidth - W - 12, px)); py = Math.max(12, Math.min(innerHeight - H - 12, py));
  popEl.style.left = px + 'px'; popEl.style.top = py + 'px';
}
function closePop() { if (!popEl) return; popEl.hidden = true; popEl.innerHTML = ''; draft = null; popId = null; syncPins(); }
function openNote(id) {
  const n = notes.get(id); if (!n) return;
  draft = null; popId = id;
  const p = pinPos(n) || [innerWidth / 2, innerHeight / 3];
  showPop(n, false, p[0], p[1]);
}
function goNote(id) {
  const n = notes.get(id); if (!n) return;
  closePop();
  const t = n.target || {}, it = t.key ? noteItem(t) : null;
  if (it && it.sec != null) it.el.scrollIntoView({ block: 'center' }); else scrollToS(n.s);
  holdCam(n.camera);
  setTimeout(() => openNote(id), (n.camera && n.camera.free) ? 1000 : 500);
}
function onPopClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  const act = b.dataset.act, ta = popEl.querySelector('textarea'), text = ta ? ta.value.trim() : '';
  if (act === 'pcancel') return closePop();
  if (act === 'psave') {
    if (!text) { ta.focus(); ta.placeholder = 'Write something first, or press Cancel.'; return; }
    if (draft) {
      const n = draft.n, shot = draft.shot;
      n.n = nextN(); n.text = text; n.createdAt = n.updatedAt = new Date().toISOString(); n.hasShot = !!shot;
      const id = store.mode === 'db' ? store.db.collection('notes').doc().id : 'n' + Date.now().toString(36);
      notes.set(id, n); save('notes', id);
      if (shot) saveShot(id, shot);
      closePop(); renderList(); syncPins();
      return;
    }
    const n = notes.get(popId); if (!n) return closePop();
    const m = clone(n); m.text = text; m.updatedAt = new Date().toISOString();
    notes.set(popId, m); save('notes', popId); closePop(); renderList();
    return;
  }
  if (act === 'pstatus' && popId) {
    const m = clone(notes.get(popId)); if (!m) return;
    if (text) m.text = text;
    m.status = m.status === 'done' ? 'open' : 'done'; m.updatedAt = new Date().toISOString();
    notes.set(popId, m); save('notes', popId); closePop(); renderList();
    return;
  }
  if (act === 'pgo' && popId) return goNote(popId);
  if (act === 'pdel' && popId) {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Sure? Delete'; return; }
    const id = popId;
    if (notes.get(id)?.issue) removed.set(id, notes.get(id).issue);
    notes.delete(id); save('notes', id);
    if (store.mode === 'db' && notes.get(id) == null) store.db.collection('shots').doc(id).delete().catch(() => {});
    shots.delete(id); if (store.mode === 'local') saveLocal();
    closePop(); renderList();
  }
}

// ---------- pins ----------
function noteItem(t) {        // the element a note is pinned to: by key while its text still matches, else by its text
  const it = items.get(t.key);
  if (it && (!t.fp || it.fp.startsWith(t.fp))) return it;
  return t.fp ? [...items.values()].find((x) => x.fp.startsWith(t.fp)) || null : null;
}
function pinPos(n) {
  const t = n.target || {};
  if (t.key) {
    const it = noteItem(t);
    if (!it) return null;
    const r = it.el.getBoundingClientRect(); if (!r.width && !r.height) return null;
    return [r.left + (t.rel ? t.rel[0] : .5) * r.width, r.top + (t.rel ? t.rel[1] : .5) * r.height];
  }
  if (Math.abs(sNow() - n.s) > .35) return null;
  const r = R();
  if (t.point && r) {
    const v = new r.THREE.Vector3().fromArray(t.point).project(r.camera);
    if (v.z > 1 || v.z < -1) return null;
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
  }
  return n.screen ? [n.screen.fx * innerWidth, n.screen.fy * innerHeight] : null;
}
const pinEls = new Map();
function syncPins() {
  if (!pinsEl) return;
  const want = new Set();
  if (on) for (const [id, n] of notes) if (n.status !== 'done' || noteFilter === 'done' || popId === id) want.add(id);
  for (const [id, b] of pinEls) if (!want.has(id)) { b.remove(); pinEls.delete(id); }
  for (const id of want) {
    const n = notes.get(id);
    let b = pinEls.get(id);
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'ed-pin'; b.dataset.id = id; pinsEl.appendChild(b); pinEls.set(id, b); }
    b.textContent = String(n.n || '•'); b.classList.toggle('done', n.status === 'done');
    b.title = (n.text || '').slice(0, 200);
  }
  let dp = pinsEl.querySelector('.ed-pin.draft');
  if (draft && on) {
    if (!dp) { dp = document.createElement('i'); dp.className = 'ed-pin draft'; dp.textContent = '+'; pinsEl.appendChild(dp); }
    dp.style.transform = `translate(${draft.n.screen.x}px, ${draft.n.screen.y}px)`;
  } else if (dp) dp.remove();
}
function placePins() {
  for (const [id, b] of pinEls) {
    const p = pinPos(notes.get(id) || {});
    if (!p || p[0] < -20 || p[1] < -20 || p[0] > innerWidth + 20 || p[1] > innerHeight + 20) { b.style.display = 'none'; continue; }
    b.style.display = ''; b.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`;
  }
}

// ---------- per-frame: boxes and pins ----------
let dockPin = null, dockT = 0;
function autoDock() {     // cards alternate sides, so by default the panel sits opposite the card nearest the middle of the screen
  if (!panel) return;
  let right = dockPin === 'right';
  if (!dockPin) {
    const ref = sel && sel.el.isConnected ? sel.el.getBoundingClientRect() : null;
    if (ref && ref.width) right = ref.left + ref.width / 2 < innerWidth / 2;
    else {
      let best = null, bd = Infinity;
      for (const sec of sectionsNow()) { const r = sec.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - innerHeight / 2); if (d < bd) { bd = d; best = sec; } }
      right = !(best && best.classList.contains('right'));
    }
  }
  panel.classList.toggle('dock-right', right);
}
function place(box, it) {
  if (!it || !it.el.isConnected) { box.style.display = 'none'; return; }
  const r = it.el.getBoundingClientRect();
  if (!r.width && !r.height) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
}
function tick() {
  if (!on) return;
  place(hovBox, mode === 'select' && hovered !== sel && !drag ? hovered : null);
  place(selBox, mode === 'select' ? sel : null);
  if (sel && !drag && !editing && selTag.dataset.for !== sel.key + layoutNow()) { selTag.textContent = sel.name + (sel.kind === 'text' ? ' · drag to move, double-click to retype' : ' · drag to move'); selTag.dataset.for = sel.key + layoutNow(); }
  if (editing || drag) selTag.dataset.for = '';
  placePins();
  const now = performance.now(); if (now - dockT > 300 && !drag) { dockT = now; autoDock(); }
  requestAnimationFrame(tick);
}

// ---------- summary, export, import ----------
function briefText() {
  const L = [], all = sortedNotes(), open = all.filter(([, n]) => n.status !== 'done');
  L.push(`GabrielPrice.com site editor: ${open.length} open note${open.length === 1 ? '' : 's'}, ${edits.size} edit${edits.size === 1 ? '' : 's'}.`);
  L.push(store.mode === 'db' ? 'Stored in this artifact\'s db: collections notes, edits and shots (read them with ArtifactData).'
    : store.mode === 'server' ? 'Notes are GitHub issues labelled site-note; edits are site-edits/edits.json in the open site-edits pull request.' : 'Stored in this browser only; the exported JSON carries everything.');
  if (open.length) { L.push('', 'OPEN NOTES'); for (const [id, n] of open) L.push(`#${n.n} [${id}] ${n.section && n.section.eyebrow} · scroll ${n.s} · ${n.layout} ${n.viewport && n.viewport.w}×${n.viewport && n.viewport.h} · on ${noteWhere(n)}${n.camera && n.camera.free ? ' · custom camera' : ''}`, '   ' + (n.text || '').replace(/\n/g, '\n   ')); }
  if (edits.size) { L.push('', store.mode === 'server' ? 'EDITS (published when the site-edits PR merges)' : 'EDITS (applied live; bake into src/main.html, then delete the doc)'); for (const [id, d] of edits) L.push(`- ${id} · ${d.name} in ${d.section}: ${where.has(id) ? editSummary(d) : 'STALE, source changed'}`); }
  const dn = all.filter(([, n]) => n.status === 'done');
  if (dn.length) L.push('', `${dn.length} note${dn.length === 1 ? '' : 's'} marked done.`);
  return L.join('\n');
}
function openBrief() { briefEl.querySelector('textarea').value = briefText(); briefEl.querySelector('.ed-hint').textContent = ''; briefEl.hidden = false; }
async function onBriefClick(e) {
  const b = e.target.closest('button');
  if (e.target === briefEl || (b && b.dataset.act === 'briefclose')) { briefEl.hidden = true; return; }
  if (b && b.dataset.act === 'copy') {
    const ta = briefEl.querySelector('textarea'), hint = briefEl.querySelector('.ed-hint');
    try { await navigator.clipboard.writeText(ta.value); hint.textContent = 'Copied.'; }
    catch { ta.focus(); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} hint.textContent = ok ? 'Copied.' : 'Selected: press Ctrl/⌘ C to copy.'; }
  }
}
function exportFile() {
  const o = { kind: 'gabrielprice-site-editor', v: 1, exportedAt: new Date().toISOString(), edits: Object.fromEntries(edits), notes: Object.fromEntries(notes), shots: Object.fromEntries(shots) };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' }));
  a.download = `site-edits-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function importFile() {
  const f = fileIn.files && fileIn.files[0]; if (!f) return;
  f.text().then((txt) => {
    const o = JSON.parse(txt);
    for (const [k, v] of Object.entries(o.edits || {})) if (ID_OK.test(k)) edits.set(k, v);
    for (const [k, v] of Object.entries(o.notes || {})) if (ID_OK.test(k)) notes.set(k, v);
    for (const [k, v] of Object.entries(o.shots || {})) if (ID_OK.test(k)) shots.set(k, v);
    saveLocal(); applyAll();
  }).catch(() => setStatus('error', { message: 'that file is not an editor export' })).finally(() => { fileIn.value = ''; });
}

// ---------- page-wide listeners (capture phase, so the page's own handlers never see edit-mode input) ----------
addEventListener('pointerdown', onPointerDown, true);
addEventListener('pointerup', onPointerUp, true);
addEventListener('pointermove', (e) => { if (on && mode === 'select' && !drag) hovered = pick(e.target, e.altKey); }, { capture: true, passive: true });
addEventListener('click', (e) => {
  if (!on) return;
  const t = e.target;
  if (t.closest && t.closest('.ed-ui')) return;
  if (editing && editing.it.el.contains(t)) return;
  if (t.closest && t.closest('main, .titleblock')) { e.preventDefault(); e.stopPropagation(); }
}, true);
addEventListener('dblclick', (e) => { if (on && !(e.target.closest && e.target.closest('.ed-ui'))) e.preventDefault(); }, true);
const keyGuard = (e) => {
  const t = e.target, inUi = t && t.closest && t.closest('.ed-ui'), inText = editing && t === editing.it.el;
  if (inUi || inText) {
    e.stopPropagation();                                  // the couch and the scooter must not drive while you type
    if (e.type !== 'keydown') return;
    if (inText) { if (e.key === 'Escape') { e.preventDefault(); cancelText(); } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); } return; }
    if (popEl && popEl.contains(t)) {
      if (e.key === 'Escape') { e.preventDefault(); closePop(); }
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); popEl.querySelector('[data-act="psave"]')?.click(); }
    } else if (briefEl && briefEl.contains(t) && e.key === 'Escape') briefEl.hidden = true;
    return;
  }
  if (!on || e.type !== 'keydown') return;
  const k = e.key;
  if (k === 'Escape') { e.stopPropagation(); if (briefEl && !briefEl.hidden) briefEl.hidden = true; else if (popEl && !popEl.hidden) closePop(); else if (sel) select(null); else setOn(false); return; }
  if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); undo(); return; }
  if (sel && mode === 'select' && k.startsWith('Arrow')) {
    e.preventDefault(); e.stopPropagation();
    const s = e.shiftKey ? 10 : 1;
    nudge(k === 'ArrowLeft' ? -s : k === 'ArrowRight' ? s : 0, k === 'ArrowUp' ? -s : k === 'ArrowDown' ? s : 0);
  }
};
addEventListener('keydown', keyGuard, true);
addEventListener('keyup', keyGuard, true);
phoneMQ.addEventListener('change', () => { if (on) syncInspector(true); });

// ---------- start: claude.ai's db if this view has it, else this browser ----------
async function init() {
  if (E.hosted) {          // the hosted site loads this file only after /admin/session said yes
    if (!E.server) return;
    store.mode = 'server'; store.canEdit = true;
    E.toggle = () => setOn(!on);
    addToggle(); setOn(true);
    return;
  }
  const wantEdit = /(^|[#&?])edit\b/.test(location.hash);
  let db = null, user = null;
  if (window.claude && typeof window.claude.use === 'function') {
    try { [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]); } catch {}
  }
  if (db) {
    store.mode = 'db'; store.db = db;
    db.collection('edits').onSnapshot((s) => onSnap('edits', s), (e) => setStatus('error', e));
    store.canEdit = user ? !!(await user.canEdit().catch(() => false)) : false;
    if (store.canEdit) db.collection('notes').onSnapshot((s) => onSnap('notes', s), (e) => setStatus('error', e));
  } else {
    store.mode = 'local';
    const had = loadLocal(ls.get(LS_DATA));
    store.canEdit = wantEdit || had;
    applyAll();
  }
  if (!store.canEdit) return;
  addToggle();
  if (wantEdit || ls.get(LS_ON) === '1') setOn(true);
}
init();      // with no claude.ai runtime this runs straight through, so local edits land before first paint
})();
