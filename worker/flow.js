// User flow analytics: the public ingest route and the owner's dashboard and replay API (see flow/client.js for the page side).
//
//   POST /api/flow                     one batch from a visitor's page: validated, trimmed to known fields, stored in R2
//   GET  /admin/flow                   the dashboard (section funnel, time per section, visits with replay links)
//   GET  /admin/api/flow/sessions?days=N   visits from the last N days, summarised from R2 object metadata
//   GET  /admin/api/flow/session?key=<day>/<sid>   one visit, all batches merged, for /#replay=
//   POST /admin/api/flow/delete {keys: ['<day>/<sid>', …]}   remove those visits for good (every batch of each)
//
// Storage is the R2 bucket bound as FLOW (wrangler.jsonc): flow/<day>/<sid>/<seq>.json. Each object's custom metadata holds
// that batch's summary, so listing a day gives the dashboard everything without reading the traces. Visitor data never goes
// to GitHub: the repo is public. Without the binding, ingest quietly accepts and drops, and the admin routes say what's missing.
//
// Page versions: each visit's first batch names the site version and its layout, a hash of the page's section titles. The
// first visit on a new layout also stores that title list at layout/<hash>.json (checked against the hash), so the dashboard
// can label and count every visit by its own sections, whatever the page looks like now.
import CURRENT from './sections.gen.js';
import dashboard from './flow-dashboard.js';
import replayPage from './flow-replay.js';

// event types (flow/client.js): c click, v video, h hidden, z resize, e error, l stall, g/r 3D context lost/back, b photo popup,
// p project page, k scooter hazard, x scooter hit, t scooter tip, o couch boost
const EVENTS = ['c', 'v', 'h', 'z', 'e', 'l', 'g', 'r', 'b', 'p', 'k', 'x', 't', 'o', 's', 'f'];
const MAX_BODY = 64 * 1024, MAX_SEQ = 150, MAX_SAMPLES = 2000, MAX_EVENTS = 500;
// crawlers and test rigs by their own tokens ("Googlebot/2.1", "bingbot", "HeadlessChrome"), not any "bot", which phone
// models such as the CUBOT X30 contain
const BOT = /HeadlessChrome|Lighthouse|PageSpeed|[a-z]bot[\/-]|\bbot\b|crawler|spider|slurp/i;
const SID = /^[0-9a-f]{16}$/, DAY = /^\d{4}-\d{2}-\d{2}$/, LAYOUT = /^[0-9a-f]{12}$/;
// layouts live before visits carried one, by when they went live: PR #6's 18 sections, then from #7 (deployed 02:24:13Z) the
// couch drive section at 14. An unversioned visit is read against the one live when its first batch arrived.
const T18 = ['Gabriel Price', 'Start from the body.', 'The Kicker', 'Built around one leg.', 'Motor to ankle, in four steps.',
  'Every part, apart.', 'Then I built it.', 'Then it has to walk.', 'Water, on crutches.', 'A knee scooter with a belt drive.',
  'Fast motor, slow wheel.', 'Twelve parts, pulled apart.', 'Take the bars.', 'A couch that drives sideways.'];
export const LEGACY = [
  { layout: 'legacy-18', until: Date.parse('2026-10-12T02:24:13Z'),
    sections: [...T18, 'A lamp that plays with the cat.', 'CatZoom, at play.', 'Thirteen parts, seen through.', 'Still on the bench.'] },
  { layout: 'legacy-19', until: Infinity,
    sections: [...T18, 'Drive the couch', 'A lamp that plays with the cat.', 'CatZoom, at play.', 'Thirteen parts, seen through.', 'More from the bench.'] },
];
// a legacy list identical to today's page is today's layout, so those visits don't show as "older"
for (const l of LEGACY) if (JSON.stringify(l.sections) === JSON.stringify(CURRENT.sections)) l.layout = CURRENT.layout;
export function legacyFor(uploaded) {
  const t = uploaded ? new Date(uploaded).getTime() : 0;
  return LEGACY.find((l) => t < l.until) || LEGACY[LEGACY.length - 1];
}
const NO_STORE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff' };
const send = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...NO_STORE, 'content-type': 'application/json; charset=utf-8' } });
const empty = (status) => new Response(null, { status, headers: NO_STORE });
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '');

// ---------- ingest ----------
// Where a returning-visitor id needs the visitor's consent before the page stores it: the EU, the rest of the EEA, the UK
// and Switzerland. An unknown country asks too: none, Tor (T1), XX (Cloudflare couldn't tell) or EU (just the region).
// EU-27, EEA and the UK and Switzerland; then the parts of them with their own country code (Åland, the French
// overseas regions, Saint-Martin, Canaries, Ceuta and Melilla) and the territories with GDPR-style law (Gibraltar,
// the Channel Islands, Isle of Man); XX and EU are what Cloudflare reports when it can't tell
const CONSENT = new Set(('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH '
  + 'AX GF GP MQ RE YT MF IC EA GI GG JE IM XX EU').split(' '));
export const mustAsk = (cc) => !/^[A-Z]{2}$/.test(cc || '') || CONSENT.has(cc);

export async function flowIngest(request, env, ctx, url) {
  // the page asks once, before it would keep a visitor id, whether it has to ask the visitor first
  if (request.method === 'GET') return new Response(JSON.stringify({ ask: mustAsk((request.cf || {}).country) }), { headers: { ...NO_STORE, 'content-type': 'application/json' } });
  if (request.method !== 'POST') return empty(405);
  // only this site's own pages: browsers always send Origin on a POST, and a page elsewhere can't fake it
  if (request.headers.get('origin') !== url.origin) return empty(403);
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return empty(413);
  const text = await request.text();
  if (text.length > MAX_BODY) return empty(413);
  let b;
  try { b = JSON.parse(text); } catch { return empty(400); }
  const clean = checkBatch(b);
  if (!clean) return empty(400);
  // test rigs and crawlers: the page already skips automated browsers (navigator.webdriver); this catches the ones that hide it
  if (BOT.test(request.headers.get('user-agent') || '')) return empty(204);
  if (!env.FLOW) return empty(204);
  // an id kept without a yes, arriving from where a yes is needed (a visitor who travelled): don't link this visit
  if (clean.vid && !clean.vc && mustAsk((request.cf || {}).country)) { delete clean.vid; delete clean.vn; }
  delete clean.vc;
  if (clean.meta) {
    // where the visit came from, as Cloudflare sees it at the edge: country, region, city and the connecting IP
    const cf = request.cf || {};
    clean.meta.cc = str(cf.country, 2); clean.meta.region = str(cf.region, 40); clean.meta.city = str(cf.city, 40);
    clean.meta.ip = str(request.headers.get('cf-connecting-ip'), 45);
    clean.meta.isp = str(cf.asOrganization, 60);   // the network: a mobile carrier, a home ISP, a university
    const ua = request.headers.get('user-agent') || '';
    clean.meta.mobile = /Mobi|Android|iPhone|iPad/.test(ua);
    Object.assign(clean.meta, device(ua, clean.meta.ch, clean.meta.touch));
    delete clean.meta.ch;
  }
  const key = `flow/${clean.day}/${clean.sid}/${String(clean.seq).padStart(3, '0')}.json`;
  const work = [env.FLOW.put(key, JSON.stringify(clean), { httpMetadata: { contentType: 'application/json' }, customMetadata: summarise(clean) })];
  if (clean.meta && clean.meta.layout && clean.meta.sections) work.push(saveLayout(env, clean.meta.layout, clean.meta.sections));
  const all = Promise.all(work);
  if (ctx && ctx.waitUntil) ctx.waitUntil(all); else await all;
  return empty(204);
}

// returns only the fields we know, or null when anything is malformed
export function checkBatch(b) {
  if (!b || typeof b !== 'object' || !SID.test(b.sid) || !DAY.test(b.day)) return null;
  if (!Number.isInteger(b.seq) || b.seq < 0 || b.seq >= MAX_SEQ) return null;
  const d = Date.parse(b.day + 'T12:00:00Z');
  if (!(Math.abs(d - Date.now()) < 36 * 3600e3)) return null;     // today, give or take a time zone
  if (!Array.isArray(b.samples) || b.samples.length > MAX_SAMPLES || !Array.isArray(b.events) || b.events.length > MAX_EVENTS) return null;
  const samples = [];
  for (const x of b.samples) {
    if (!Array.isArray(x) || x.length < 12 || x.length > 40 || !x.every(num)) return null;   // 12, then a project page's scroll and a driven vehicle's state (flow/client.js)
    samples.push(x);
  }
  const events = [];
  for (const e of b.events) {
    if (!Array.isArray(e) || e.length < 2 || e.length > 16 || !num(e[0]) || !EVENTS.includes(e[1])) return null;
    events.push(e.map((v, i) => (i < 2 ? v : num(v) ? v : str(v, 80))));
  }
  const out = { sid: b.sid, seq: b.seq, day: b.day, samples, events };
  if (num(b.fps) && b.fps >= 0 && b.fps <= 1000) { out.fps = Math.round(b.fps * 10) / 10; if (num(b.fms) && b.fms > 0 && b.fms <= 3600000) out.fms = Math.round(b.fms); }
  if (num(b.full) && b.full > 0 && b.full <= 3600000) out.full = Math.round(b.full);
  if (/^[0-9a-f]{16}$/.test(b.vid)) { out.vid = b.vid; out.vn = Number.isInteger(b.vn) && b.vn > 0 && b.vn < 1e6 ? b.vn : 0; if (b.vc === 1) out.vc = 1; }   // returning visitor
  if (b.seq > 0) { const hw = checkHw(b.hw); if (hw) out.hw = hw; }   // the device, when the first batch left before it was read
  if (b.seq === 0) {
    const m = b.meta && typeof b.meta === 'object' ? b.meta : {};
    out.meta = { w: num(m.w) ? m.w : 0, h: num(m.h) ? m.h : 0, dpr: num(m.dpr) ? m.dpr : 1, touch: m.touch === true, fg: m.fg === true,
      lang: str(m.lang, 12), ref: str(m.ref, 80), dark: m.dark === true,
      v: /^\w{1,12}$/.test(m.v) ? m.v : '', layout: LAYOUT.test(m.layout) ? m.layout : '' };
    const hw = checkHw(m.hw); if (hw) out.meta.hw = hw;
    if (m.ch && typeof m.ch === 'object') out.meta.ch = { model: str(m.ch.model, 40), pv: str(m.ch.pv, 20) };
    if (out.meta.layout && Array.isArray(m.sections) && m.sections.length <= 80 && m.sections.every((x) => typeof x === 'string' && x.length <= 80)) out.meta.sections = m.sections;
  }
  return out;
}

// the device details the page reads once (flow/client.js device()): known fields only, numbers in range, strings trimmed
function checkHw(h) {
  if (!h || typeof h !== 'object') return null;
  const n = (x, max) => (num(x) && x >= 0 && x <= max ? Math.round(x * 100) / 100 : 0);
  return { sw: n(h.sw, 20000), sh: n(h.sh, 20000), orient: str(h.orient, 20), cores: n(h.cores, 1024), mem: n(h.mem, 1024), tp: n(h.tp, 64),
    gpu: str(h.gpu, 100), net: str(h.net, 8), down: n(h.down, 10000), rtt: n(h.rtt, 60000), save: h.save === true, tz: str(h.tz, 40),
    langs: str(h.langs, 60), motion: h.motion === true, load: n(h.load, 600000), full: n(h.full, 3600000) };
}

// What the visitor was on, from the user agent plus the page's client hints (ch: model and OS version, Chromium only):
//   dev 'phone' | 'tablet' | 'desktop', os 'iOS 18.1' | 'Android 14' | 'Windows 11' | 'macOS 15.1' …, browser 'Safari 18' …,
//   model 'iPhone' | 'Pixel 8' | 'SM-S918B' | 'Mac' | '' (Apple and desktop browsers don't name the model)
export function device(ua, ch, touch) {
  ua = String(ua || ''); ch = ch || {};
  const v = (re) => { const m = re.exec(ua); return m ? m[1].replace(/_/g, '.') : ''; };
  const major = (x) => String(x || '').split('.')[0];
  const two = (x) => String(x || '').split('.').slice(0, 2).join('.').replace(/\.0$/, '');
  let os = '', model = '', dev = '';
  // Safari 26 froze the iOS version in its user agent at 18.6; its own Version/ token carries the real one
  const safariV = v(/Version\/(\d+(?:\.\d+)?)/);
  const appleV = (x) => (Number(major(safariV)) >= 26 ? two(safariV) : two(x));
  if (/iPhone/.test(ua)) { os = 'iOS ' + appleV(v(/iPhone OS (\d+(?:_\d+)?)/)); model = 'iPhone'; dev = 'phone'; }
  else if (/iPad/.test(ua)) { os = 'iPadOS ' + appleV(v(/CPU OS (\d+(?:_\d+)?)/)); model = 'iPad'; dev = 'tablet'; }
  else if (/Macintosh/.test(ua) && touch) { os = 'iPadOS' + (safariV ? ' ' + two(safariV) : ''); model = 'iPad'; dev = 'tablet'; }   // iPads ask for the desktop site
  else if (/Android/.test(ua)) {
    // the parts after "Android NN;" up to ")": locale, model (with " Build/…"), "wv" for in-app views, "Mobile", "rv:…"
    const parts = (/Android[^;)]*;([^)]*)\)/.exec(ua) || [, ''])[1].split(';').map((x) => x.trim().replace(/\s+Build\/.*$/, '').replace(/^SAMSUNG\s+/i, ''));
    const named = parts.find((x) => x && !/^(K|wv|Mobile|Tablet|U|[a-z]{2}(?:[-_][a-z]{2})?|rv:.*)$/i.test(x)) || '';
    // Chrome now sends "Android 10; K" whatever the phone: the version and model then only come from the page's hints
    const frozen = parts[0] === 'K';
    os = 'Android' + (two(ch.pv) ? ' ' + two(ch.pv) : frozen ? '' : ' ' + v(/Android (\d+(?:\.\d+)?)/));
    model = ch.model || named;
    dev = /Mobile/.test(ua) ? 'phone' : 'tablet';
  }
  else if (/CrOS/.test(ua)) { os = 'ChromeOS'; model = 'Chromebook'; }
  else if (/Windows NT/.test(ua)) {
    const nt = v(/Windows NT (\d+\.\d+)/);
    os = nt === '10.0' ? (ch.pv ? (Number(major(ch.pv)) >= 13 ? 'Windows 11' : 'Windows 10') : 'Windows 10/11') : ({ '6.3': 'Windows 8.1', '6.2': 'Windows 8', '6.1': 'Windows 7' }[nt] || 'Windows');
    model = 'PC';
  }
  else if (/Macintosh/.test(ua)) { os = 'macOS' + (ch.pv ? ' ' + two(ch.pv) : ''); model = 'Mac'; }   // Safari and Firefox freeze it at 10.15
  else if (/Linux/.test(ua)) { os = 'Linux'; model = 'PC'; }
  if (!dev) dev = /Mobi/.test(ua) ? 'phone' : touch && !model ? 'tablet' : 'desktop';
  const b = (name, re) => { const x = v(re); return x !== '' ? name + ' ' + major(x) : null; };
  const browser = (BOT.test(ua) ? 'bot' : null)
    || (/Instagram/.test(ua) ? 'Instagram app' : null) || (/FBAN|FBAV/.test(ua) ? 'Facebook app' : null) || (/LinkedInApp/.test(ua) ? 'LinkedIn app' : null)
    || (/; wv\)/.test(ua) ? 'in-app browser' : null)
    || b('Edge', /Edg(?:e|A|iOS)?\/(\d+)/) || b('Opera', /(?:OPR|OPT)\/(\d+)/) || b('Samsung Internet', /SamsungBrowser\/(\d+)/)
    || b('Firefox', /(?:Firefox|FxiOS)\/(\d+)/) || b('Headless Chrome', /HeadlessChrome\/(\d+)/) || b('Chrome', /(?:CriOS|Chrome)\/(\d+)/)
    || (/Safari\//.test(ua) && safariV ? 'Safari ' + major(safariV) : null) || '';
  return { dev, os: os.trim().slice(0, 40), browser: browser.slice(0, 40), model: model.trim().slice(0, 40) };
}

// per-batch summary kept in R2 custom metadata (strings, well under its 2 KB limit)
export function summarise(c) {
  const S = c.samples;
  let maxS = 0, free = 0, drive = 0, ptr = 0;
  const dwell = {};
  for (let i = 0; i < S.length; i++) {
    const x = S[i];
    maxS = Math.max(maxS, x[1]);
    // a sample holds until the next one, capped at 2 s so an idle gap or a hidden tab doesn't count as reading
    const dt = Math.min(2000, i + 1 < S.length ? S[i + 1][0] - x[0] : 100) / 1000;
    const sec = Math.round(x[1]);
    dwell[sec] = (dwell[sec] || 0) + dt;
    if (x[2]) free += dt;
    if (x[5]) drive += dt;
    if (x[3] >= 0) ptr += dt;
  }
  const m = { n: String(S.length), t0: String(S.length ? S[0][0] : 0), t1: String(Math.max(S.length ? S[S.length - 1][0] : 0, ...c.events.map((e) => e[0]))),   // a freeze or crash after the page went still still counts
    maxS: maxS.toFixed(2), free: free.toFixed(1), drive: drive.toFixed(1), ptr: ptr.toFixed(1),
    dwell: Object.entries(dwell).map(([k, v]) => k + ':' + v.toFixed(1)).join(','), clicks: String(c.events.filter((e) => e[1] === 'c').length),
    err: String(c.events.filter((e) => e[1] === 'e').length), ...(num(c.fps) ? { fps: String(c.fps) } : {}), ...(num(c.fms) ? { fms: String(c.fms) } : {}), ...(num(c.full) ? { full: String(c.full) } : {}) };
  const st = c.events.filter((e) => e[1] === 'l' && num(e[2]));
  if (st.length) m.stall = st.length + ':' + st.reduce((a, e) => a + e[2], 0);   // how often and for how long (ms) the page froze
  // losses of the 3D view's WebGL context less the ones that came back; a loss and its return can land in different
  // batches (the loss is sent at once), so a batch can count -1 and the visit's sum is what matters
  const gl = c.events.filter((e) => e[1] === 'g').length - c.events.filter((e) => e[1] === 'r').length;
  if (gl) m.gl = String(gl);
  if (c.vid) { m.vid = c.vid; m.vn = String(c.vn || 0); }
  const h = c.meta ? c.meta.hw : c.hw;
  if (h) Object.assign(m, { scr: h.sw + 'x' + h.sh, cores: String(h.cores), mem: String(h.mem), gpu: h.gpu, net: h.net, tz: h.tz, load: String(h.load), full: String(Math.max(h.full, c.full || 0)) });
  if (c.meta) {
    m.v = c.meta.v || ''; m.layout = c.meta.layout || '';
    m.dev = c.meta.dev || (c.meta.mobile ? 'phone' : c.meta.touch ? 'tablet' : 'desktop');
    m.os = c.meta.os || ''; m.br = c.meta.browser || ''; m.model = c.meta.model || ''; m.isp = c.meta.isp || '';
    m.size = c.meta.w + 'x' + c.meta.h; m.dpr = String(c.meta.dpr); m.cc = c.meta.cc || ''; m.region = c.meta.region || ''; m.city = c.meta.city || ''; m.ip = c.meta.ip || ''; m.ref = c.meta.ref; m.lang = c.meta.lang;
  }
  return m;
}

// ---------- owner routes (index.js has already checked the Access login) ----------
export async function flowAdmin(request, env, url) {
  const p = url.pathname;
  if (p === '/admin/api/flow/delete') {
    if (request.method !== 'POST') return send({ error: 'POST' }, 405);
    if (!env.FLOW) return send({ error: 'The R2 bucket for analytics is not set up yet (DEPLOY.md, section 6).' }, 503);
    return deleteVisits(env, request);
  }
  if (request.method !== 'GET') return send({ error: 'GET' }, 405);
  if (p === '/admin/flow' || p === '/admin/flow/') {
    return new Response(dashboard, { headers: { ...NO_STORE, 'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'" } });
  }
  if (p === '/admin/flow/replay') {
    return new Response(replayPage, { headers: { ...NO_STORE, 'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'" } });
  }
  if (!env.FLOW) return send({ error: 'The R2 bucket for analytics is not set up yet (DEPLOY.md, section 6).' }, 503);
  if (p === '/admin/api/flow/sessions') {
    const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 7));
    const sessions = await listSessions(env, days);
    return send({ current: CURRENT, sessions, layouts: await loadLayouts(env, sessions) });
  }
  if (p === '/admin/api/flow/session') {
    const [day, sid] = String(url.searchParams.get('key') || '').split('/');
    if (!DAY.test(day || '') || !SID.test(sid || '')) return send({ error: 'bad key' }, 400);
    const objs = (await listAll(env, `flow/${day}/${sid}/`, false)).sort((x, y) => (x.key < y.key ? -1 : 1)), keys = objs.map((o) => o.key);
    if (!keys.length) return send({ error: 'no such visit' }, 404);
    const parts = await Promise.all(keys.map(async (k) => { const o = await env.FLOW.get(k); return o ? o.json() : null; }));
    const rec = { sid, day, meta: null, samples: [], events: [] };
    for (const b of parts) {
      if (!b) continue;
      if (b.meta) rec.meta = b.meta;
      rec.samples.push(...b.samples); rec.events.push(...b.events);
    }
    // recorded before visits named their layout: hand the replayer the titles that were live then
    if (rec.meta && !rec.meta.layout) { const l = legacyFor(objs[0].uploaded); rec.meta.layout = l.layout; rec.meta.sections = l.sections; }
    return send(rec);
  }
  return send({ error: 'not found' }, 404);
}

// the dashboard's "Delete selected": every batch of each named visit. A visit still in progress can post again afterwards,
// which brings back only its later batches.
async function deleteVisits(env, request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return send({ error: 'request too large' }, 413);
  let b;
  try { b = JSON.parse(text); } catch { return send({ error: 'body is not JSON' }, 400); }
  const keys = Array.isArray(b && b.keys) ? b.keys : null;
  if (!keys || !keys.length || keys.length > 500) return send({ error: 'keys: 1 to 500 visits' }, 400);
  const prefixes = [];
  for (const k of keys) {
    const [day, sid, more] = String(k).split('/');
    if (more !== undefined || !DAY.test(day || '') || !SID.test(sid || '')) return send({ error: 'bad key: ' + String(k).slice(0, 40) }, 400);
    prefixes.push(`flow/${day}/${sid}/`);
  }
  const objs = (await Promise.all([...new Set(prefixes)].map((pre) => listAll(env, pre, false)))).flat().map((o) => o.key);
  for (let i = 0; i < objs.length; i += 1000) await env.FLOW.delete(objs.slice(i, i + 1000));   // R2 takes up to 1000 keys a call
  return send({ deleted: new Set(objs.map((k) => k.split('/').slice(1, 3).join('/'))).size, batches: objs.length });
}

async function listAll(env, prefix, meta, cap = 20) {
  const out = [];
  let cursor;
  for (let i = 0; i < cap; i++) {
    const r = await env.FLOW.list({ prefix, cursor, ...(meta ? { include: ['customMetadata'] } : {}) });
    out.push(...r.objects);
    if (!r.truncated) break;
    cursor = r.cursor;
  }
  return out;
}

// Visits are kept 90 days (the privacy page says so): a daily cron drops each day's folder once it is older than that.
// Day folders only, so section layouts (layout/) and the leaderboards (lb/) stay.
export const KEEP_DAYS = 90;
export async function prune(env, now = Date.now()) {
  if (!env.FLOW) return 0;
  const cut = new Date(now - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  let n = 0, cursor;
  for (let i = 0; i < 20; i++) {
    const r = await env.FLOW.list({ prefix: 'flow/', delimiter: '/', cursor });
    for (const pre of r.delimitedPrefixes || []) {
      const day = pre.slice(5, -1);
      if (!DAY.test(day) || day > cut) continue;
      // older days go whole; on the cutoff day only what is past 90 days by its upload time, so nothing is kept longer
      // than 90 days plus a day (between runs) and nothing goes early
      const objs = (await listAll(env, pre, false, Infinity)).filter((o) => day < cut || +new Date(o.uploaded) <= now - KEEP_DAYS * 864e5).map((o) => o.key);
      for (let j = 0; j < objs.length; j += 1000) await env.FLOW.delete(objs.slice(j, j + 1000));
      n += objs.length;
    }
    if (!r.truncated) break;
    cursor = r.cursor;
  }
  return n;
}

export async function listSessions(env, days) {
  const today = Date.now(), byId = new Map();
  const dayList = Array.from({ length: days }, (_, i) => new Date(today - i * 864e5).toISOString().slice(0, 10));
  const lists = await Promise.all(dayList.map((d) => listAll(env, `flow/${d}/`, true)));
  for (const objs of lists) {
    for (const o of objs) {
      const [, day, sid] = o.key.split('/');
      const m = o.customMetadata || {};
      const k = day + '/' + sid;
      const v = byId.get(k) || { key: k, day, start: null, ms: 0, maxS: 0, free: 0, drive: 0, ptr: 0, clicks: 0, dwell: {}, batches: 0, bytes: 0 };
      v.batches++; v.bytes += o.size || 0;
      v.ms = Math.max(v.ms, Number(m.t1) || 0);
      v.maxS = Math.max(v.maxS, Number(m.maxS) || 0);
      v.err = (v.err || 0) + (Number(m.err) || 0);
      // weighted by the visible time each batch's frame rate covers (older batches: their sample span)
      if (m.full) v.full = Math.max(v.full || 0, Number(m.full) || 0);
      // the device's details, from the first batch or, when that left before they were read, a later one
      if (m.scr) { v.scr = m.scr; v.cores = Number(m.cores) || 0; v.mem = Number(m.mem) || 0; v.gpu = m.gpu || ''; v.net = m.net || ''; v.tz = m.tz || ''; v.load = Number(m.load) || 0; }
      if (m.fps) { const w = Math.max(1, Number(m.fms) || (Number(m.t1) || 0) - (Number(m.t0) || 0)); v.fpsW = (v.fpsW || 0) + w; v.fpsSum = (v.fpsSum || 0) + Number(m.fps) * w; v.fps = Math.round(10 * v.fpsSum / v.fpsW) / 10; }
      if (m.gl) v.gl = (v.gl || 0) + (Number(m.gl) || 0);
      if (m.vid) { v.vid = m.vid; v.vn = Math.max(v.vn || 0, Number(m.vn) || 0); }
      if (m.stall) { const [k, ms] = m.stall.split(':').map(Number); v.stalls = (v.stalls || 0) + (k || 0); v.stallMs = (v.stallMs || 0) + (ms || 0); }
      v.free += Number(m.free) || 0; v.drive += Number(m.drive) || 0; v.ptr += Number(m.ptr) || 0; v.clicks += Number(m.clicks) || 0;
      for (const kv of (m.dwell || '').split(',')) { const [s, t] = kv.split(':'); if (t) v.dwell[s] = (v.dwell[s] || 0) + Number(t); }
      if (m.dev) { v.v = m.v || ''; v.layout = m.layout || legacyFor(o.uploaded).layout; v.dev = m.dev; v.isp = m.isp || ''; v.dpr = m.dpr || ''; v.os = m.os || ''; v.browser = m.br || ''; v.model = m.model || ''; v.size = m.size; v.cc = m.cc; v.region = m.region || ''; v.city = m.city || ''; v.ip = m.ip || ''; v.ref = m.ref; v.lang = m.lang; v.start = o.uploaded; }
      byId.set(k, v);
    }
  }
  return [...byId.values()].map(({ fpsSum, fpsW, ...v }) => v).sort((a, b) => String(b.start || b.day).localeCompare(String(a.start || a.day)));
}

// store a layout's section titles once, only if they hash to the name the page gave them
async function saveLayout(env, layout, sections) {
  if (!LAYOUT.test(layout)) return;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(sections)));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
  if (hex !== layout) return;
  const key = `layout/${layout}.json`;
  if (await env.FLOW.head(key)) return;
  await env.FLOW.put(key, JSON.stringify(sections), { httpMetadata: { contentType: 'application/json' } });
}

// the title list of every layout the listed visits were recorded on
async function loadLayouts(env, sessions) {
  const out = { ...Object.fromEntries(LEGACY.map((l) => [l.layout, l.sections])), [CURRENT.layout]: CURRENT.sections };
  const want = [...new Set(sessions.map((v) => v.layout).filter((l) => l && !out[l] && LAYOUT.test(l)))];
  await Promise.all(want.map(async (l) => { const o = await env.FLOW.get(`layout/${l}.json`); if (o) out[l] = await o.json(); }));
  return out;
}
