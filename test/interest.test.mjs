// "Follow project" / "I want one!" sign-ups (worker/interest.js): POST /api/interest and the owner's /admin/api/interest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { checkSignup } from '../worker/interest.js';

const ORIGIN = 'https://gabrielprice.com';
function fakeR2() {
  const m = new Map();
  return {
    m,
    async get(key) { const v = m.get(key); return v ? { json: async () => JSON.parse(v) } : null; },
    async put(key, body) { m.set(key, String(body)); return {}; },
    async list({ prefix }) { return { objects: [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key })), truncated: false }; },
    async delete(keys) { for (const k of [].concat(keys)) m.delete(k); },
  };
}
const env = () => ({ FLOW: fakeR2(), ASSETS: { fetch: () => new Response('asset') }, DEV_NO_AUTH: '1' });
const post = (e, body, origin = ORIGIN) => worker.fetch(new Request(ORIGIN + '/api/interest', {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) } }), e);

test('a sign-up is checked: a build, a kind and a real-looking email; the comment is optional and capped', () => {
  assert.deepEqual(checkSignup({ p: 'exoleg', k: 'want', email: ' a@b.co ', note: ' size M ' }), { p: 'exoleg', k: 'want', email: 'a@b.co', note: 'size M' });
  assert.deepEqual(checkSignup({ p: 'catzoom', k: 'follow', email: 'x@y.org' }), { p: 'catzoom', k: 'follow', email: 'x@y.org', note: '' });
  assert.equal(checkSignup({ p: 'catzoom', k: 'follow', email: 'x@y.org', note: 'n'.repeat(5000) }).note.length, 1000);
  for (const bad of [{ p: 'exoleg', k: 'buy', email: 'a@b.co' }, { p: 'Exo Leg', k: 'want', email: 'a@b.co' }, { p: 'exoleg', k: 'want', email: 'nope' },
    { p: 'exoleg', k: 'want', email: 'a@b' }, { p: 'exoleg', k: 'want', email: '<a@b.co>' }, { p: 'exoleg', k: 'want' }, null, 'x']) assert.equal(checkSignup(bad), null, JSON.stringify(bad));
});

test('POST /api/interest stores one object per sign-up, only from the site itself', async () => {
  const e = env();
  assert.equal((await post(e, { p: 'water-break', k: 'want', email: 'a@b.co', note: 'two please' })).status, 204);
  assert.equal((await post(e, { p: 'water-break', k: 'follow', email: 'a@b.co' })).status, 204);
  assert.equal((await post(e, { p: 'water-break', k: 'want', email: 'a@b.co' }, 'https://evil.example')).status, 403);
  assert.equal((await post(e, { p: 'water-break', k: 'want', email: 'a@b.co' }, null)).status, 403);
  assert.equal((await post(e, { p: 'water-break', k: 'want', email: 'bad' })).status, 400);
  assert.equal((await post(e, '{nope')).status, 400);
  assert.equal((await post(e, 'x'.repeat(3000))).status, 413);
  const keys = [...e.FLOW.m.keys()];
  assert.equal(keys.length, 2);
  assert.ok(keys.every((k) => /^interest\/\d{4}-\d\d-\d\dT[\d:.]+Z-[a-z0-9]{6,12}\.json$/.test(k)), keys.join(' '));
  const want = keys.map((k) => JSON.parse(e.FLOW.m.get(k))).find((r) => r.k === 'want');
  assert.equal(want.note, 'two please'); assert.equal(want.email, 'a@b.co'); assert.ok(want.at > 0);
});

test('the owner lists sign-ups newest first and deletes them by key', async () => {
  const e = env();
  await post(e, { p: 'exoleg', k: 'want', email: 'first@b.co' });
  await new Promise((r) => setTimeout(r, 5));
  await post(e, { p: 'catzoom', k: 'follow', email: 'second@b.co' });
  const adm = (path, init) => worker.fetch(new Request('http://localhost' + path, init), e);
  const page = await adm('/admin/interest');
  assert.equal(page.status, 200); assert.match(await page.text(), /<title>Sign-ups<\/title>/);
  const { rows } = await (await adm('/admin/api/interest')).json();
  assert.deepEqual(rows.map((r) => r.email), ['second@b.co', 'first@b.co']);
  const del = (body, h = { 'x-editor': '1' }) => adm('/admin/api/interest', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) });
  assert.equal((await del({ delete: [rows[0].key] }, {})).status, 403, 'writes need the editor header');
  assert.equal((await del({ delete: ['flow/2026-10-14/abc/1.json'] })).status, 400, 'only sign-up keys');
  assert.deepEqual(await (await del({ delete: [rows[0].key] })).json(), { deleted: 1 });
  assert.deepEqual((await (await adm('/admin/api/interest')).json()).rows.map((r) => r.email), ['first@b.co']);
});
