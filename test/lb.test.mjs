// The scooter and couch leaderboards (worker/lb.js): GET /api/lb and POST /api/lb against an in-memory R2 bucket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { checkPost, merge } from '../worker/lb.js';

const ORIGIN = 'https://gabrielprice.com';
function fakeR2() {
  const m = new Map(); let n = 0;
  return {
    m,
    async get(key) { const v = m.get(key); return v ? { etag: v.etag, json: async () => JSON.parse(v.body) } : null; },
    async put(key, body, o = {}) {
      const cur = m.get(key);
      if (o.onlyIf && o.onlyIf.etagMatches && (!cur || cur.etag !== o.onlyIf.etagMatches)) return null;
      const etag = 'e' + ++n; m.set(key, { body: String(body), etag }); return { etag };
    },
  };
}
const env = () => ({ FLOW: fakeR2(), ASSETS: { fetch: () => new Response('asset') } });
const post = (e, body, origin = ORIGIN) => worker.fetch(new Request(ORIGIN + '/api/lb', {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) } }), e);
const get = async (e, id = '') => (await worker.fetch(new Request(ORIGIN + '/api/lb' + (id ? '?id=' + id : '')), e)).json();

test('a post lands on its board, a player keeps their best, and only the asker sees which row is theirs', async () => {
  const e = env();
  assert.equal((await post(e, { game: 'sc', id: 'aaaaaaaa1', tag: 'GAB', score: 120 })).status, 204);
  await post(e, { game: 'sc', id: 'bbbbbbbb2', tag: 'ZED', score: 300 });
  assert.equal((await post(e, { game: 'sc', id: 'eeeeeeee5', tag: 'Gabriel P.', score: 7 })).status, 204, 'ten characters, mixed case and a space are fine');
  await post(e, { game: 'sc', id: 'aaaaaaaa1', tag: 'GAB', score: 90 });     // worse: ignored
  await post(e, { game: 'lap', id: 'aaaaaaaa1', tag: 'GAB', score: 41300 });
  await post(e, { game: 'lap', id: 'bbbbbbbb2', tag: 'ZED', score: 38900 });
  await post(e, { game: 'lap', id: 'aaaaaaaa1', tag: 'GAB', score: 52000 });   // slower: ignored
  const b = await get(e, 'aaaaaaaa1');
  assert.deepEqual(b.sc, [{ tag: 'ZED', score: 300 }, { tag: 'GAB', score: 120, you: true }, { tag: 'Gabriel P.', score: 7 }]);
  assert.deepEqual(b.lap, [{ tag: 'ZED', score: 38900 }, { tag: 'GAB', score: 41300, you: true }], 'fastest lap first');
  assert.ok(!JSON.stringify(await get(e)).includes('aaaaaaaa1'), 'ids never go back out');
});

test('posts from elsewhere, junk and impossible scores are refused', async () => {
  const e = env();
  assert.equal((await post(e, { game: 'sc', id: 'aaaaaaaa1', tag: 'GAB', score: 5 }, 'https://evil.example')).status, 403);
  assert.equal((await post(e, { game: 'sc', id: 'aaaaaaaa1', tag: 'GAB', score: 5 }, null)).status, 403);
  assert.equal((await post(e, 'not json')).status, 400);
  for (const bad of [{ game: 'xx', id: 'aaaaaaaa1', tag: 'GAB', score: 5 }, { game: 'sc', id: 'short', tag: 'GAB', score: 5 }, { game: 'sc', id: 'aaaaaaaa1', tag: '<b>', score: 5 }, { game: 'sc', id: 'aaaaaaaa1', tag: 'ElevenChars', score: 5 },
    { game: 'sc', id: 'aaaaaaaa1', tag: 'GAB', score: 1e9 }, { game: 'sc', id: 'aaaaaaaa1', tag: 'GAB', score: 1.5 }, { game: 'lap', id: 'aaaaaaaa1', tag: 'GAB', score: -3 },
    { game: 'lap', id: 'aaaaaaaa1', tag: 'GAB', score: 900 }, { game: 'co', id: 'aaaaaaaa1', tag: 'GAB', score: 5400 }, { game: 'toString', id: 'aaaaaaaa1', tag: 'GAB', score: 5 }])
    assert.equal(checkPost(bad), null, JSON.stringify(bad));
  assert.deepEqual(await get(e), { sc: [], lap: [] });
});

test('a write that loses the race retries on the fresh board', async () => {
  const e = env(); await post(e, { game: 'lap', id: 'dddddddd4', tag: 'DOG', score: 60000 });   // the board exists
  const real = e.FLOW.put.bind(e.FLOW); let first = true;
  e.FLOW.put = async (k, body, o) => {   // someone else writes between our read and our write, once
    if (first) { first = false; await real(k, JSON.stringify({ sc: [{ id: 'cccccccc3', tag: 'CAT', score: 50, at: 1 }], lap: [] })); }
    return real(k, body, o);
  };
  await post(e, { game: 'sc', id: 'aaaaaaaa1', tag: 'GAB', score: 120 });
  assert.deepEqual((await get(e)).sc.map((r) => r.tag), ['GAB', 'CAT']);
});

test('each board keeps its top 50, one row per player', () => {
  let rows = [];
  for (let i = 0; i < 60; i++) rows = merge(rows, { id: 'player' + String(i).padStart(4, '0'), tag: 'P', score: i + 1 }, i) || rows;
  assert.equal(rows.length, 50); assert.equal(rows[0].score, 60); assert.equal(rows.at(-1).score, 11);
  assert.equal(merge(rows, { id: 'player0000', tag: 'P', score: 5 }), null, 'off the bottom: no change');
  let laps = [];
  for (let i = 0; i < 60; i++) laps = merge(laps, { id: 'player' + String(i).padStart(4, '0'), tag: 'P', score: 30000 + i }, i, 'lap') || laps;
  assert.equal(laps.length, 50); assert.equal(laps[0].score, 30000); assert.equal(laps.at(-1).score, 30049, 'laps: the fastest 50 stay');
  assert.equal(merge(laps, { id: 'player0000', tag: 'P', score: 31000 }, 0, 'lap'), null, 'a slower lap than your best: no change');
});

test('without a bucket the boards read empty and posts are accepted quietly', async () => {
  const e = { ASSETS: { fetch: () => new Response('asset') } };
  assert.deepEqual(await get(e), { sc: [], lap: [] });
  assert.equal((await post(e, { game: 'sc', id: 'aaaaaaaa1', tag: 'GAB', score: 5 })).status, 204);
});
