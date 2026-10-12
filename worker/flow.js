// User flow analytics: the public ingest route and the owner's dashboard and replay API (see flow/client.js for the page side).
//
//   POST /api/flow                     one batch from a visitor's page: validated, trimmed to known fields, stored in R2
//   GET  /admin/flow                   the dashboard (section funnel, time per section, visits with replay links)
//   GET  /admin/api/flow/sessions?days=N   visits from the last N days, summarised from R2 object metadata
//   GET  /admin/api/flow/session?key=<day>/<sid>   one visit, all batches merged, for /#replay=
//
// Storage is the R2 bucket bound as FLOW (wrangler.jsonc): flow/<day>/<sid>/<seq>.json. Each object's custom metadata holds
// that batch's summary, so listing a day gives the dashboard everything without reading the traces. Visitor data never goes
// to GitHub: the repo is public. Without the binding, ingest quietly accepts and drops, and the admin routes say what's missing.
import SECTIONS from './sections.gen.js';
import dashboard from './flow-dashboard.js';

const MAX_BODY = 64 * 1024, MAX_SEQ = 60, MAX_SAMPLES = 2000, MAX_EVENTS = 500;
const SID = /^[0-9a-f]{16}$/, DAY = /^\d{4}-\d{2}-\d{2}$/;
const NO_STORE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff' };
const send = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...NO_STORE, 'content-type': 'application/json; charset=utf-8' } });
const empty = (status) => new Response(null, { status, headers: NO_STORE });
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '');

// ---------- ingest ----------
export async function flowIngest(request, env, ctx, url) {
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
  if (!env.FLOW) return empty(204);
  if (clean.meta) {
    clean.meta.cc = str(request.cf && request.cf.country, 2);
    clean.meta.mobile = /Mobi|Android|iPhone|iPad/.test(request.headers.get('user-agent') || '');
  }
  const key = `flow/${clean.day}/${clean.sid}/${String(clean.seq).padStart(3, '0')}.json`;
  const put = env.FLOW.put(key, JSON.stringify(clean), { httpMetadata: { contentType: 'application/json' }, customMetadata: summarise(clean) });
  if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
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
    if (!Array.isArray(x) || x.length !== 12 || !x.every(num)) return null;
    samples.push(x);
  }
  const events = [];
  for (const e of b.events) {
    if (!Array.isArray(e) || e.length < 2 || e.length > 6 || !num(e[0]) || !['c', 'v', 'h', 'z'].includes(e[1])) return null;
    events.push(e.map((v, i) => (i < 2 ? v : num(v) ? v : str(v, 80))));
  }
  const out = { sid: b.sid, seq: b.seq, day: b.day, samples, events };
  if (b.seq === 0) {
    const m = b.meta && typeof b.meta === 'object' ? b.meta : {};
    out.meta = { w: num(m.w) ? m.w : 0, h: num(m.h) ? m.h : 0, dpr: num(m.dpr) ? m.dpr : 1, touch: m.touch === true,
      lang: str(m.lang, 12), ref: str(m.ref, 80), dark: m.dark === true };
  }
  return out;
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
  const m = { n: String(S.length), t0: String(S.length ? S[0][0] : 0), t1: String(S.length ? S[S.length - 1][0] : 0),
    maxS: maxS.toFixed(2), free: free.toFixed(1), drive: drive.toFixed(1), ptr: ptr.toFixed(1),
    dwell: Object.entries(dwell).map(([k, v]) => k + ':' + v.toFixed(1)).join(','), clicks: String(c.events.filter((e) => e[1] === 'c').length) };
  if (c.meta) {
    m.dev = c.meta.mobile ? 'phone' : c.meta.touch ? 'tablet' : 'desktop';
    m.size = c.meta.w + 'x' + c.meta.h; m.cc = c.meta.cc || ''; m.ref = c.meta.ref; m.lang = c.meta.lang;
  }
  return m;
}

// ---------- owner routes (index.js has already checked the Access login) ----------
export async function flowAdmin(request, env, url) {
  const p = url.pathname;
  if (request.method !== 'GET') return send({ error: 'GET' }, 405);
  if (p === '/admin/flow' || p === '/admin/flow/') {
    return new Response(dashboard, { headers: { ...NO_STORE, 'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'" } });
  }
  if (!env.FLOW) return send({ error: 'The R2 bucket for analytics is not set up yet (DEPLOY.md, section 6).' }, 503);
  if (p === '/admin/api/flow/sessions') {
    const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 7));
    return send({ sections: SECTIONS, sessions: await listSessions(env, days) });
  }
  if (p === '/admin/api/flow/session') {
    const [day, sid] = String(url.searchParams.get('key') || '').split('/');
    if (!DAY.test(day || '') || !SID.test(sid || '')) return send({ error: 'bad key' }, 400);
    const keys = (await listAll(env, `flow/${day}/${sid}/`, false)).map((o) => o.key).sort();
    if (!keys.length) return send({ error: 'no such visit' }, 404);
    const parts = await Promise.all(keys.map(async (k) => { const o = await env.FLOW.get(k); return o ? o.json() : null; }));
    const rec = { sid, day, meta: null, samples: [], events: [] };
    for (const b of parts) {
      if (!b) continue;
      if (b.meta) rec.meta = b.meta;
      rec.samples.push(...b.samples); rec.events.push(...b.events);
    }
    return send(rec);
  }
  return send({ error: 'not found' }, 404);
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
      v.free += Number(m.free) || 0; v.drive += Number(m.drive) || 0; v.ptr += Number(m.ptr) || 0; v.clicks += Number(m.clicks) || 0;
      for (const kv of (m.dwell || '').split(',')) { const [s, t] = kv.split(':'); if (t) v.dwell[s] = (v.dwell[s] || 0) + Number(t); }
      if (m.dev) { v.dev = m.dev; v.size = m.size; v.cc = m.cc; v.ref = m.ref; v.lang = m.lang; v.start = o.uploaded; }
      byId.set(k, v);
    }
  }
  return [...byId.values()].sort((a, b) => String(b.start || b.day).localeCompare(String(a.start || a.day)));
}
