// Live leaderboards for the two drive games: the QuadFather scooter run (sc: metres + 10 per star, higher wins) and the
// couch's full-course lap time (lap: milliseconds, lower wins). The page (src/rigs.js, LB) posts a player's new personal
// best and polls the boards while a game is open. (The couch used to post a drift score as `co`; that board is gone.)
//
//   GET  /api/lb?id=<player>   { sc: [{tag, score, you?}], lap: [...] }, the top 10 of each; `you` marks that player's row
//   POST /api/lb               { game: 'sc'|'lap', id, tag, score } from this site's own pages; keeps each player's best
//
// Both boards live in one object, lb/board.json, in the FLOW bucket (beside the flow/ and layout/ prefixes). Each board keeps
// its top 50, one row per player id. Writes are conditional on the object's etag and retried, so two posts at once don't
// drop one. Player ids are random strings the page keeps in localStorage; they are never sent back out.

import { lbBad } from './lbname.js';

const KEY = 'lb/board.json';
const KEEP = 50, SHOW = 10;
// the range a score may take: well past any honest run either way, so a doctored post can't sit on top forever
const GAMES = { sc: { min: 1, max: 100000, asc: false }, lap: { min: 5000, max: 3600000, asc: true } };
const better = (g, a, b) => (GAMES[g].asc ? a < b : a > b);
const NO_STORE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const send = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...NO_STORE, 'content-type': 'application/json; charset=utf-8' } });
const empty = (status) => new Response(null, { status, headers: NO_STORE });
const ID = /^[a-z0-9]{8,40}$/, TAG = /^[A-Za-z0-9?][A-Za-z0-9 ?._-]{0,9}$/;   // a tag: up to 10 letters, digits, spaces and . _ -

async function load(env) {
  const o = await env.FLOW.get(KEY);
  if (!o) return { board: { sc: [], lap: [] }, etag: null };
  let board; try { board = await o.json(); } catch { board = {}; }
  return { board: { sc: Array.isArray(board.sc) ? board.sc : [], lap: Array.isArray(board.lap) ? board.lap : [] }, etag: o.etag || null };
}

// a post as accepted, or null
export function checkPost(b) {
  if (!b || typeof b !== 'object') return null;
  const { game, id, score } = b, tag = typeof b.tag === 'string' ? b.tag.trim() : '';
  if (!Object.hasOwn(GAMES, game) || typeof id !== 'string' || !ID.test(id) || !TAG.test(tag)) return null;
  if (!Number.isInteger(score) || score < GAMES[game].min || score > GAMES[game].max) return null;
  return { game, id, tag: lbBad(tag) ? '???' : tag, score };   // a refused name still counts, as ???
}

// the board with this post merged in (a player keeps their best; the tag follows their latest post), or null if unchanged.
// `game` picks the order: higher scores first for sc, faster laps first for lap.
export function merge(rows, p, now = Date.now(), game = 'sc') {
  const old = rows.find((r) => r.id === p.id), keep = old && !better(game, p.score, old.score);
  if (keep && old.tag === p.tag) return null;
  const row = { id: p.id, tag: p.tag, score: keep ? old.score : p.score, at: keep ? old.at : now };
  const next = rows.filter((r) => r.id !== p.id).concat(row)
    .sort((a, b) => (GAMES[game].asc ? a.score - b.score : b.score - a.score) || a.at - b.at).slice(0, KEEP);
  return next.some((r) => r.id === p.id) || old ? next : null;
}

export async function lb(request, env, url) {
  if (request.method === 'GET') {
    if (!env.FLOW) return send({ sc: [], lap: [] });
    const me = url.searchParams.get('id') || '', { board } = await load(env);
    const tag = (t) => (lbBad(t) ? '???' : t);   // rows stored before the filter existed are cleaned on the way out
    const out = (rows) => rows.slice(0, SHOW).map((r) => (r.id === me ? { tag: tag(r.tag), score: r.score, you: true } : { tag: tag(r.tag), score: r.score }));
    return send({ sc: out(board.sc), lap: out(board.lap) });
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
    const next = merge(board[p.game], p, Date.now(), p.game);
    if (!next) return empty(204);
    board[p.game] = next;
    // the very first post creates the object unconditionally; every later write is conditional on the etag it read
    const put = await env.FLOW.put(KEY, JSON.stringify(board), { httpMetadata: { contentType: 'application/json' }, ...(etag ? { onlyIf: { etagMatches: etag } } : {}) });
    if (put) return empty(204);   // R2 resolves null when the etag no longer matches: someone else wrote first, so try again
  }
  return empty(409);
}
