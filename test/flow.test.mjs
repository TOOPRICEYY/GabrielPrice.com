// Visitor flow analytics: the build injects the capture script, /api/flow validates and stores batches in R2, and the
// owner routes summarise and merge them. R2 is an in-memory fake with the binding's put/get/list shape.
// Run `npm run build` first: the Worker imports the generated editor UI and section titles.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { startFakes } from './fake-github.mjs';
import worker from '../worker/index.js';
import { checkBatch, summarise, legacyFor } from '../worker/flow.js';

const ORIGIN = 'https://gabrielprice.com';
const DAY = new Date().toISOString().slice(0, 10);
const SID = '0123456789abcdef';
let F, env, token;

function fakeR2() {
  const m = new Map();
  return {
    m,
    async put(key, body, o = {}) { m.set(key, { body: String(body), customMetadata: o.customMetadata || {}, uploaded: new Date() }); },
    async head(key) { return m.has(key) ? {} : null; },
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
const SECTIONS = ['Old hero', 'Old kicker', 'Old couch'];
const LAYOUT = createHash('sha256').update(JSON.stringify(SECTIONS)).digest('hex').slice(0, 12);
const batch = (o = {}) => ({ sid: SID, seq: 0, day: DAY, samples: [sample(0, 0), sample(100, 0.4), sample(200, 1.2, 1)], events: [[150, 'c', 0.1, 0.2, 1, 'Reset view']],
  meta: { w: 1280, h: 800, dpr: 2, touch: false, lang: 'en-US', ref: 'news.ycombinator.com', dark: false, extra: 'dropped', v: 'abc1234', layout: LAYOUT, sections: SECTIONS }, ...o });
// like the runtime, finish the background writes (ctx.waitUntil) before the next step looks at the bucket
async function post(body, { origin = ORIGIN, e = env } = {}) {
  const pending = [];
  const req = new Request(ORIGIN + '/api/flow', {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'text/plain', 'cf-connecting-ip': '203.0.113.7', ...(origin ? { origin } : {}) },
  });
  Object.defineProperty(req, 'cf', { value: { country: 'US', region: 'Michigan', city: 'Detroit' } });   // what Cloudflare's edge attaches
  const r = await worker.fetch(req, e, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return r;
}
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
  const { default: B } = await import('../worker/sections.gen.js');
  assert.ok(B.sections.length > 10 && B.sections[0].length > 0);
  assert.match(B.layout, /^[0-9a-f]{12}$/);
  assert.equal(B.layout, createHash('sha256').update(JSON.stringify(B.sections)).digest('hex').slice(0, 12));
  assert.ok(html.includes('window.__flowBuild={"version":'), 'the page names its version and layout');
});

// flow/client.js reads these; a page change that drops one would stop capture, so it can't merge
test('the page still exposes everything the flow recorder and replayer use', () => {
  const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const rig = /window\.__rig = \{([\s\S]*?)\};/.exec(html);
  assert.ok(rig, 'window.__rig is defined');
  for (const name of ['THREE', 'rigs', 'camera', 'ui', 'free', 'setS(', 'get s()']) assert.ok(rig[1].includes(name), `__rig exposes ${name}`);
  assert.match(html, /ui\.ptr = \{ x: e\.clientX, y: e\.clientY \}; ui\.ptrT = performance\.now\(\)/, 'pointer kept in ui.ptr / ui.ptrT');
  assert.match(html, /rigs\.couch = \{[^\n]*keys: new Set\(\)/, 'couch keys are a Set');
  assert.match(html, /keys: new Set\(\), last: -1e9, knock/, 'scooter keys are a Set');
  assert.match(html, /Array\.isArray\(window\.__cam\)/, 'window.__cam camera override');
  assert.match(html, /const free = \{ on: false/, 'free.on flag');
  assert.match(html, /section[^>]*data-s="0"/, 'sections carry data-s');
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
  assert.equal(v.customMetadata.v, 'abc1234');
  assert.equal(v.customMetadata.ip, '203.0.113.7');
  assert.equal(v.customMetadata.city, 'Detroit'); assert.equal(v.customMetadata.region, 'Michigan'); assert.equal(v.customMetadata.cc, 'US');
  assert.equal(v.customMetadata.layout, LAYOUT);
  assert.deepEqual(JSON.parse(env.FLOW.m.get(`layout/${LAYOUT}.json`).body), SECTIONS, 'the layout is kept for later');
});

test('a layout whose titles do not match its hash is not stored', async () => {
  const sid = 'aaaaaaaaaaaaaaaa', bad = 'ffffffffffff';
  await post(batch({ sid, meta: { ...batch().meta, layout: bad, sections: ['forged'] } }));
  assert.ok(env.FLOW.m.has(`flow/${DAY}/${sid}/000.json`));
  assert.ok(!env.FLOW.m.has(`layout/${bad}.json`));
  env.FLOW.m.delete(`flow/${DAY}/${sid}/000.json`);
});

test('a capture error is kept as an event and counted', async () => {
  const sid = 'bbbbbbbbbbbbbbbb';
  await post(batch({ sid, samples: [], events: [[10, 'e', 'window.__rig never appeared']] }));
  assert.equal(env.FLOW.m.get(`flow/${DAY}/${sid}/000.json`).customMetadata.err, '1');
  env.FLOW.m.delete(`flow/${DAY}/${sid}/000.json`);
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
  assert.ok(list.current.sections.length > 10);
  assert.equal(v.layout, LAYOUT); assert.equal(v.v, 'abc1234');
  assert.equal(v.ip, '203.0.113.7'); assert.equal(v.city, 'Detroit');
  assert.deepEqual(list.layouts[LAYOUT], SECTIONS, 'older layouts come back with the list');
  assert.equal(list.layouts['legacy-18'].length, 18);
  // a visit from before versions: read against the layout live when it arrived (here: now, the last legacy layout, which is
  // today's page only until a section heading changes in the source)
  const sid = 'cccccccccccccccc', { v: _v, layout: _l, sections: _s, ...plain } = batch().meta;
  await post(batch({ sid, meta: plain }));
  const old = (await (await get('/admin/api/flow/sessions?days=1')).json()).sessions.find((x) => x.key.endsWith(sid));
  const L = legacyFor(new Date().toISOString());
  assert.equal(old.layout, L.layout);
  const oldRec = await (await get('/admin/api/flow/session?key=' + encodeURIComponent(old.key))).json();
  assert.deepEqual(oldRec.meta.sections, L.sections, 'the replayer gets the legacy titles');
  const rec = await (await get('/admin/api/flow/session?key=' + encodeURIComponent(v.key))).json();
  assert.equal(rec.samples.length, 4); assert.equal(rec.meta.w, 1280);
  assert.deepEqual(rec.meta.sections, SECTIONS, 'the replayer gets the visit\'s own section titles');
  assert.equal((await get('/admin/api/flow/session?key=../../x')).status, 400);
  assert.equal((await get('/admin/api/flow/session?key=' + DAY + '/ffffffffffffffff')).status, 404);
  const noBucket = await worker.fetch(new Request(ORIGIN + '/admin/api/flow/sessions', { headers: { 'cf-access-jwt-assertion': token } }), { ...env, FLOW: undefined });
  assert.equal(noBucket.status, 503);
});

test('replays open in a frame sized to the visit, and the dashboard links there', async () => {
  assert.equal((await get('/admin/flow/replay?key=' + DAY + '/' + SID, null)).status, 403);
  const page = await get('/admin/flow/replay?key=' + DAY + '/' + SID);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const html = await page.text();
  assert.match(html, /__flowReplay/); assert.match(html, /Math\.min\(4096/, 'recorded sizes are clamped before they size the frame'); assert.match(html, /<iframe|createElement\('iframe'\)/);
  assert.match(fs.readFileSync(new URL('../worker/flow-dashboard.js', import.meta.url), 'utf8'), /\/admin\/flow\/replay\?key=/);
  assert.match(fs.readFileSync(new URL('../flow/client.js', import.meta.url), 'utf8'), /__flowReplay/, 'the player looks for the frame host');
});

test('unversioned visits are read against the layout live when they arrived', () => {
  assert.equal(legacyFor('2026-10-12T02:10:00Z').layout, 'legacy-18');
  assert.equal(legacyFor('2026-10-12T02:10:00Z').sections[14], 'A lamp that plays with the cat.');
  assert.equal(legacyFor('2026-10-12T02:30:00Z').sections[14], 'Drive the couch');
});
