// "Follow project" and "I want one!" sign-ups from the end of each build (the .ask forms that src/main.html adds to the last
// card of every chapter).
//
//   POST /api/interest       public, from this site's own pages: { p: <build>, k: 'follow'|'want', email, note? } → 204
//   /admin/interest          the owner's list (index.js has checked the Access login): newest first, CSV, delete
//   /admin/api/interest      GET every sign-up as JSON; POST { delete: [keys] } removes some
//
// One small JSON object per sign-up, interest/<ISO time>-<random>.json in the FLOW bucket beside flow/, layout/ and lb/.
// prune() in flow.js only walks flow/, so sign-ups stay until they are deleted here. Emails never go to GitHub (the repo is public).

import listPage from './interest-page.js';

const NO_STORE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex' };
const send = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...NO_STORE, 'content-type': 'application/json; charset=utf-8' } });
const empty = (status) => new Response(null, { status, headers: NO_STORE });
const PREFIX = 'interest/', KEY = /^interest\/\d{4}-\d\d-\d\dT[\d:.]+Z-[a-z0-9]{6,12}\.json$/;
const PROJECT = /^[a-z0-9][a-z0-9-]{0,39}$/, EMAIL = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
export const KINDS = ['follow', 'want'];

// a sign-up as accepted, or null
export function checkSignup(b) {
  if (!b || typeof b !== 'object') return null;
  const email = typeof b.email === 'string' ? b.email.trim() : '', note = typeof b.note === 'string' ? b.note.trim().slice(0, 1000) : '';
  if (typeof b.p !== 'string' || !PROJECT.test(b.p) || !KINDS.includes(b.k) || email.length > 254 || !EMAIL.test(email)) return null;
  return { p: b.p, k: b.k, email, note };
}

export async function interestIngest(request, env, url) {
  if (request.method !== 'POST') return empty(405);
  if (request.headers.get('origin') !== url.origin) return empty(403);   // only this site's own pages
  const text = await request.text();
  if (text.length > 2000) return empty(413);
  let b; try { b = JSON.parse(text); } catch { return empty(400); }
  const s = checkSignup(b);
  if (!s) return empty(400);
  if (!env.FLOW) return empty(503);
  const at = new Date(), key = PREFIX + at.toISOString() + '-' + Math.random().toString(36).slice(2, 10).padEnd(6, '0') + '.json';
  await env.FLOW.put(key, JSON.stringify({ ...s, at: at.getTime(), country: (request.cf && request.cf.country) || '' }), { httpMetadata: { contentType: 'application/json' } });
  return empty(204);
}

export async function interestAdmin(request, env, url) {
  const p = url.pathname;
  if (p === '/admin/interest' || p === '/admin/interest/') {
    if (request.method !== 'GET') return send({ error: 'GET' }, 405);
    return new Response(listPage, { headers: { ...NO_STORE, 'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'" } });
  }
  if (p !== '/admin/api/interest') return send({ error: 'not found' }, 404);
  if (!env.FLOW) return send({ error: 'The R2 bucket is not set up yet (DEPLOY.md, section 6).' }, 503);
  if (request.method === 'GET') {
    const keys = [];
    let cursor;
    for (let i = 0; i < 20; i++) {
      const r = await env.FLOW.list({ prefix: PREFIX, cursor });
      keys.push(...r.objects.map((o) => o.key));
      if (!r.truncated) break;
      cursor = r.cursor;
    }
    const rows = await Promise.all(keys.map(async (key) => { const o = await env.FLOW.get(key); if (!o) return null; try { return { key, ...(await o.json()) }; } catch { return null; } }));
    return send({ rows: rows.filter(Boolean).sort((a, b) => b.at - a.at) });
  }
  if (request.method === 'POST') {
    const text = await request.text();
    if (text.length > 100_000) return send({ error: 'request too large' }, 413);
    let b; try { b = JSON.parse(text); } catch { return send({ error: 'body is not JSON' }, 400); }
    const keys = Array.isArray(b && b.delete) ? b.delete : null;
    if (!keys || !keys.length || keys.length > 1000 || !keys.every((k) => typeof k === 'string' && KEY.test(k))) return send({ error: 'delete: 1 to 1000 sign-up keys' }, 400);
    await env.FLOW.delete(keys);
    return send({ deleted: keys.length });
  }
  return send({ error: 'GET or POST' }, 405);
}
