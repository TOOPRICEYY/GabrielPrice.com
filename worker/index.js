// gabrielprice.com: serves the built site (dist/, the ASSETS binding) and, under /admin, the owner's editor.
// Nothing under /admin is a static file, so every /admin request reaches this code, and each one must carry a valid
// Cloudflare Access login for an email on ALLOWED_EMAILS (see access.js). The editor's code is bundled into this Worker
// (editor-ui.gen.js, written by scripts/build.mjs) rather than published as an asset, so it is only ever sent after that check.
//
//   /admin/login?to=/path   Access shows its sign-in first; then back to /path#edit, which opens the editor
//   /admin/session          200 when signed in; the page's hidden door asks this before loading the editor
//   /admin/editor-ui.js     the editor panel
//   /admin/api/edits        GET / PUT the edits file (site-edits/edits.json on the site-edits PR)
//   /admin/api/edits/publish  POST: merge that PR, which puts the edits on the live site after Cloudflare rebuilds
//   /admin/api/notes        GET all, POST one (files a GitHub issue); PATCH /admin/api/notes/<issue> to edit, finish or remove
//   /admin/api/shots/<id>   a note's snapshot
//   /admin/flow, /admin/flow/replay, /admin/api/flow/*   visitor flow dashboard and replays (worker/flow.js)
//   /api/flow               public: visitors' pages post flow batches here (worker/flow.js)

import { accessEmail } from './access.js';
import { getEdits, putEdits, checkEdits, publishEdits, listNotes, createNote, updateNote, checkNote, getShot, GitHubError, ID_OK } from './github.js';
import editorUi from './editor-ui.gen.js';
import { flowIngest, flowAdmin } from './flow.js';

const NO_STORE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff' };
const send = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...NO_STORE, 'content-type': 'application/json; charset=utf-8' } });
const fail = (status, error) => send({ error }, status);
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

async function body(request, limit = 2_000_000) {
  const t = await request.text();
  if (t.length > limit) throw new GitHubError(413, 'request too large');
  try { return JSON.parse(t || '{}'); } catch { throw new GitHubError(400, 'body is not JSON'); }
}

async function admin(request, env, url) {
  const email = env.DEV_NO_AUTH === '1' && LOCAL.has(url.hostname) ? 'dev@localhost' : await accessEmail(request, env);
  if (!email) return fail(403, 'not signed in');
  const p = url.pathname, m = request.method;

  // writes must come from this site's own pages: a custom header, which a cross-site form or link cannot add
  if (m !== 'GET' && m !== 'HEAD') {
    const origin = request.headers.get('origin');
    if (request.headers.get('x-editor') !== '1' || (origin && origin !== url.origin)) return fail(403, 'cross-site request refused');
  }

  if (p === '/admin/login' || p === '/admin' || p === '/admin/') {
    const to = url.searchParams.get('to') || '/';
    const safe = /^\/(?!\/)[^\s\\#]*$/.test(to) ? to : '/';
    return new Response(null, { status: 302, headers: { ...NO_STORE, location: safe + '#edit' } });
  }
  if (p === '/admin/session') return send({ ok: true, email });
  if (p === '/admin/flow' || p === '/admin/flow/' || p === '/admin/flow/replay' || p.startsWith('/admin/api/flow/')) return flowAdmin(request, env, url);
  if (p === '/admin/editor-ui.js') return new Response(editorUi, { headers: { ...NO_STORE, 'content-type': 'text/javascript; charset=utf-8' } });

  if (p === '/admin/api/edits') {
    if (m === 'GET') return send(await getEdits(env));
    if (m === 'PUT') {
      const b = await body(request);
      const bad = checkEdits(b.edits); if (bad) return fail(400, bad);
      return send(await putEdits(env, b.edits, email.split('@')[0]));
    }
    return fail(405, 'GET or PUT');
  }
  if (p === '/admin/api/edits/publish') {
    if (m !== 'POST') return fail(405, 'POST');
    return send(await publishEdits(env, email.split('@')[0]));
  }
  if (p === '/admin/api/notes') {
    if (m === 'GET') return send(await listNotes(env));
    if (m === 'POST') {
      const b = await body(request);
      const bad = checkNote(b.id, b.note, b.shot); if (bad) return fail(400, bad);
      return send(await createNote(env, b.id, b.note, b.shot || null));
    }
    return fail(405, 'GET or POST');
  }
  let r = /^\/admin\/api\/notes\/(\d{1,9})$/.exec(p);
  if (r) {
    if (m !== 'PATCH') return fail(405, 'PATCH');
    const b = await body(request, 20_000);
    return send(await updateNote(env, Number(r[1]), { text: b.text, status: b.status, remove: b.remove === true }));
  }
  r = /^\/admin\/api\/shots\/([^/]+)$/.exec(p);
  if (r && m === 'GET') {
    const id = decodeURIComponent(r[1]);
    if (!ID_OK.test(id)) return fail(400, 'bad id');
    const img = await getShot(env, id);
    return img ? new Response(img, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400', 'x-robots-tag': 'noindex' } }) : fail(404, 'no snapshot');
  }
  return fail(404, 'not found');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) return Response.redirect(url.protocol + '//' + url.hostname.slice(4) + url.pathname + url.search, 301);
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      try {
        return await admin(request, env, url);
      } catch (e) {
        const status = e instanceof GitHubError ? (e.status >= 400 && e.status < 600 ? e.status : 502) : 500;
        if (status >= 500) console.error(e);
        return fail(status === 401 || status === 403 ? 502 : status, e.message || 'error');   // a GitHub 401/403 means the token, not the visitor
      }
    }
    if (url.pathname === '/api/flow') {
      try { return await flowIngest(request, env, ctx, url); } catch (e) { console.error(e); return new Response(null, { status: 500 }); }
    }
    return env.ASSETS.fetch(request);
  },
};
