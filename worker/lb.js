// Live leaderboards for the two drive games: the QuadFather scooter run (sc: metres + 10 per star) and the couch drift
// score (co). The page (src/rigs.js, LB) posts a player's new personal best and polls the boards while a game is open.
//
//   GET  /api/lb?id=<player>   { sc: [{tag, score, you?}], co: [...] }, the top 10 of each; `you` marks that player's row
//   POST /api/lb               { game: 'sc'|'co', id, tag, score } from this site's own pages; keeps each player's best
//
// Both boards live in one object, lb/board.json, in the FLOW bucket (beside the flow/ and layout/ prefixes). Each board keeps
// its top 50, one row per player id. Writes are conditional on the object's etag and retried, so two posts at once don't
// drop one. Player ids are random strings the page keeps in localStorage; they are never sent back out.

const KEY = 'lb/board.json';
const KEEP = 50, SHOW = 10;
const MAX = { sc: 100000, co: 5000000 };   // well above any honest run, so a doctored post can't sit on top forever
const NO_STORE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const send = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...NO_STORE, 'content-type': 'application/json; charset=utf-8' } });
const empty = (status) => new Response(null, { status, headers: NO_STORE });
const ID = /^[a-z0-9]{8,40}$/, TAG = /^[A-Za-z0-9?][A-Za-z0-9 ?._-]{0,9}$/;   // a tag: up to 10 letters, digits, spaces and . _ -

async function load(env) {
  const o = await env.FLOW.get(KEY);
  if (!o) return { board: { sc: [], co: [] }, etag: null };
  let board; try { board = await o.json(); } catch { board = {}; }
  return { board: { sc: Array.isArray(board.sc) ? board.sc : [], co: Array.isArray(board.co) ? board.co : [] }, etag: o.etag || null };
}

// a post as accepted, or null
export function checkPost(b) {
  if (!b || typeof b !== 'object') return null;
  const { game, id, score } = b, tag = typeof b.tag === 'string' ? b.tag.trim() : '';
  if (!(game in MAX) || typeof id !== 'string' || !ID.test(id) || !TAG.test(tag)) return null;
  if (!Number.isInteger(score) || score <= 0 || score > MAX[game]) return null;
  return { game, id, tag, score };
}

// the board with this post merged in (a player keeps their best; the tag follows their latest post), or null if unchanged
export function merge(rows, p, now = Date.now()) {
  const i = rows.findIndex((r) => r.id === p.id), old = rows[i];
  if (old && old.score >= p.score && old.tag === p.tag) return null;
  const row = { id: p.id, tag: p.tag, score: Math.max(p.score, old ? old.score : 0), at: old && old.score >= p.score ? old.at : now };
  const next = rows.filter((r) => r.id !== p.id).concat(row).sort((a, b) => b.score - a.score || a.at - b.at).slice(0, KEEP);
  return next.some((r) => r.id === p.id) || old ? next : null;
}

export async function lb(request, env, url) {
  if (request.method === 'GET') {
    if (!env.FLOW) return send({ sc: [], co: [] });
    const me = url.searchParams.get('id') || '', { board } = await load(env);
    const out = (rows) => rows.slice(0, SHOW).map((r) => (r.id === me ? { tag: r.tag, score: r.score, you: true } : { tag: r.tag, score: r.score }));
    return send({ sc: out(board.sc), co: out(board.co) });
  }
  if (request.method !== 'POST') return empty(405);
  if (request.headers.get('origin') !== url.origin) return empty(403);   // only this site's own pages
  const text = await request.text();
  if (text.length > 400) return empty(413);
  let b; try { b = JSON.parse(text); } catch { return empty(400); }
  const p = checkPost(b);
  if (!p) return empty(400);
  if (!env.FLOW) return empty(204);
  for (let tries = 0; tries < 4; tries++) {
    const { board, etag } = await load(env);
    const next = merge(board[p.game], p);
    if (!next) return empty(204);
    board[p.game] = next;
    // the very first post creates the object unconditionally; every later write is conditional on the etag it read
    const put = await env.FLOW.put(KEY, JSON.stringify(board), { httpMetadata: { contentType: 'application/json' }, ...(etag ? { onlyIf: { etagMatches: etag } } : {}) });
    if (put) return empty(204);   // R2 resolves null when the etag no longer matches: someone else wrote first, so try again
  }
  return empty(409);
}
