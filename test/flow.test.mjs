// Visitor flow analytics: the build injects the capture script, /api/flow validates and stores batches in R2, and the
// owner routes summarise and merge them. R2 is an in-memory fake with the binding's put/get/list shape.
// Run `npm run build` first: the Worker imports the generated editor UI and section titles.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startFakes } from './fake-github.mjs';
import worker from '../worker/index.js';
import { checkBatch, summarise } from '../worker/flow.js';

const ORIGIN = 'https://gabrielprice.com';
const DAY = new Date().toISOString().slice(0, 10);
const SID = '0123456789abcdef';
let F, env, token;

function fakeR2() {
  const m = new Map();
  return {
    m,
    async put(key, body, o = {}) { m.set(key, { body: String(body), customMetadata: o.customMetadata || {}, uploaded: new Date() }); },
    async get(key) { const v = m.get(key); return v ? { json: async () => JSON.parse(v.body) } : null; },
    async list({ prefix = '', include = [] } = {}) {
      const objects = [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => {
        const v = m.get(key);
        return { key, size: v.body.length, uploaded: v.uploaded, ...(include.includes('customMetadata') ? { customMetadata: v.customMetadata } : {}) };
      });
      return { objects, truncated: false };
    },
  };
}
const sample = (t, s, keys = 0) => [t, s, 0, 0.5, 0.5, keys, 10, 120, 400, 10, 110, 300];
const batch = (o = {}) => ({ sid: SID, seq: 0, day: DAY, samples: [sample(0, 0), sample(100, 0.4), sample(200, 1.2, 1)], events: [[150, 'c', 0.1, 0.2, 1, 'Reset view']],
  meta: { w: 1280, h: 800, dpr: 2, touch: false, lang: 'en-US', ref: 'news.ycombinator.com', dark: false, extra: 'dropped' }, ...o });
const post = (body, { origin = ORIGIN, e = env } = {}) => worker.fetch(new Request(ORIGIN + '/api/flow', {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'text/plain', ...(origin ? { origin } : {}) },
}), e, { waitUntil: () => {} });
const get = (path, auth = token) => worker.fetch(new Request(ORIGIN + path, { headers: auth ? { 'cf-access-jwt-assertion': auth } : {} }), env);

before(async () => {
  F = await startFakes();
  token = await F.sign({});
  env = { ...F.env, ASSETS: { fetch: (req) => new Response('asset ' + new URL(req.url).pathname) }, FLOW: fakeR2() };
});
after(() => F.close());

test('the hosted page carries the capture script; section titles are generated', async () => {
  const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes("'/api/flow'"), 'flow/client.js is inlined');
  assert.ok(html.lastIndexOf('/api/flow') > html.lastIndexOf('__rig = {'), 'after the page script');
  const { default: S } = await import('../worker/sections.gen.js');
  assert.ok(S.length > 10 && S[0].length > 0);
});

test('a valid batch is stored under flow/<day>/<sid>/<seq> with a summary, unknown fields dropped', async () => {
  const r = await post(batch());
  assert.equal(r.status, 204);
  const v = env.FLOW.m.get(`flow/${DAY}/${SID}/000.json`);
  assert.ok(v);
  const stored = JSON.parse(v.body);
  assert.equal(stored.meta.extra, undefined);
  assert.equal(stored.meta.ref, 'news.ycombinator.com');
  assert.equal(v.customMetadata.dev, 'desktop');
  assert.equal(v.customMetadata.maxS, '1.20');
  assert.equal(v.customMetadata.clicks, '1');
});

test('ingest refuses other origins, junk and oversize bodies, and accepts quietly without a bucket', async () => {
  assert.equal((await post(batch(), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(batch(), { origin: null })).status, 403);
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post(batch({ sid: 'X' }))).status, 400);
  assert.equal((await post(batch({ seq: 999 }))).status, 400);
  assert.equal((await post(batch({ day: '2001-01-01' }))).status, 400, 'stale day');
  assert.equal((await post(batch({ samples: [[1, 2, 3]] }))).status, 400, 'short sample');
  assert.equal((await post(batch({ events: [[1, 'x']] }))).status, 400, 'unknown event');
  assert.equal((await post('x'.repeat(70000))).status, 413);
  assert.equal((await worker.fetch(new Request(ORIGIN + '/api/flow'), env)).status, 405);
  const noBucket = { ...env, FLOW: undefined };
  assert.equal((await post(batch(), { e: noBucket })).status, 204);
});

test('event strings are trimmed and samples must be finite numbers', () => {
  const c = checkBatch(batch({ events: [[1, 'c', 0.1, 0.2, 3, 'y'.repeat(500)]] }));
  assert.equal(c.events[0][5].length, 80);
  assert.equal(checkBatch(batch({ samples: [[0, NaN, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]] })), null);
});

test('dwell counts each sample until the next, capped at 2 s', () => {
  const m = summarise({ samples: [sample(0, 0), sample(1000, 0), sample(60000, 2)], events: [] });
  assert.equal(m.dwell, '0:3.0,2:0.1');
});

test('the owner routes need the login, then list visits and merge a visit for replay', async () => {
  await post(batch({ seq: 1, meta: undefined, samples: [sample(30000, 3)], events: [] }));
  assert.equal((await get('/admin/flow', null)).status, 403);
  assert.equal((await get('/admin/api/flow/sessions', null)).status, 403);
  const page = await get('/admin/flow');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Site flow/);
  const list = await (await get('/admin/api/flow/sessions?days=1')).json();
  assert.equal(list.sessions.length, 1);
  const v = list.sessions[0];
  assert.equal(v.key, `${DAY}/${SID}`); assert.equal(v.batches, 2); assert.equal(v.maxS, 3); assert.equal(v.ms, 30000);
  assert.ok(list.sections.length > 10);
  const rec = await (await get('/admin/api/flow/session?key=' + encodeURIComponent(v.key))).json();
  assert.equal(rec.samples.length, 4); assert.equal(rec.meta.w, 1280);
  assert.equal((await get('/admin/api/flow/session?key=../../x')).status, 400);
  assert.equal((await get('/admin/api/flow/session?key=' + DAY + '/ffffffffffffffff')).status, 404);
  const noBucket = await worker.fetch(new Request(ORIGIN + '/admin/api/flow/sessions', { headers: { 'cf-access-jwt-assertion': token } }), { ...env, FLOW: undefined });
  assert.equal(noBucket.status, 503);
});
