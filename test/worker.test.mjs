// The Worker against the fakes in fake-github.mjs. Run `npm run build` first: the Worker imports the generated editor UI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startFakes } from './fake-github.mjs';
import worker from '../worker/index.js';
import { noteBody, parseNote } from '../worker/github.js';

let F, env, token;
const ORIGIN = 'https://gabrielprice.com';
const call = (path, { method = 'GET', body, auth = token, headers = {} } = {}) => worker.fetch(new Request(ORIGIN + path, {
  method, body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
  headers: { ...(auth ? { 'cf-access-jwt-assertion': auth } : {}), ...(method !== 'GET' ? { 'x-editor': '1', origin: ORIGIN } : {}), ...headers },
}), env);
const json = async (r) => ({ status: r.status, body: await r.json() });

before(async () => {
  F = await startFakes();
  env = { ...F.env, ASSETS: { fetch: (req) => new Response('asset ' + new URL(req.url).pathname) } };
  token = await F.sign({});
});
after(() => F.close());

test('the public site comes from the assets, www goes to the bare domain', async () => {
  assert.equal(await (await call('/', { auth: null })).text(), 'asset /');
  assert.equal(await (await call('/photos/a.webp', { auth: null })).text(), 'asset /photos/a.webp');
  const r = await worker.fetch(new Request('https://www.gabrielprice.com/x?y=1'), env);
  assert.equal(r.status, 301); assert.equal(r.headers.get('location'), 'https://gabrielprice.com/x?y=1');
});

test('/admin needs a valid Access login for an allowed email', async () => {
  assert.equal((await call('/admin/session', { auth: null })).status, 403);
  assert.equal((await call('/admin/editor-ui.js', { auth: null })).status, 403);
  assert.equal((await call('/admin/session', { auth: 'not.a.jwt' })).status, 403);
  assert.equal((await call('/admin/session', { auth: await F.sign({ aud: ['another-app'] }) })).status, 403, 'wrong audience');
  assert.equal((await call('/admin/session', { auth: await F.sign({ iss: 'https://evil.cloudflareaccess.com' }) })).status, 403, 'wrong issuer');
  assert.equal((await call('/admin/session', { auth: await F.sign({ exp: Math.floor(Date.now() / 1000) - 120 }) })).status, 403, 'expired');
  assert.equal((await call('/admin/session', { auth: await F.sign({ email: 'someone@else.com' }) })).status, 403, 'not on the list');
  assert.equal((await call('/admin/session', { auth: await F.sign({}, { kid: 'unknown' }) })).status, 403, 'unknown key');
  const t = token.split('.'); t[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(t[1], 'base64url')), email: 'other@example.com' })).toString('base64url');
  assert.equal((await call('/admin/session', { auth: t.join('.') })).status, 403, 'tampered payload');
  const ok = await json(await call('/admin/session'));
  assert.deepEqual(ok, { status: 200, body: { ok: true, email: 'owner@example.com' } });
  const viaCookie = await call('/admin/session', { auth: null, headers: { cookie: 'a=b; CF_Authorization=' + token } });
  assert.equal(viaCookie.status, 200);
  assert.equal((await worker.fetch(new Request(ORIGIN + '/admin/session'), { ...env, ALLOWED_EMAILS: '' })).status, 403, 'unconfigured = closed');
});

test('the dev bypass only works on localhost', async () => {
  const dev = { ...env, DEV_NO_AUTH: '1' };
  assert.equal((await worker.fetch(new Request('https://gabrielprice.com/admin/session'), dev)).status, 403);
  assert.equal((await worker.fetch(new Request('http://127.0.0.1:8787/admin/session'), dev)).status, 200);
});

test('login sends you back to the page with #edit, never off-site', async () => {
  let r = await call('/admin/login?to=%2Fprojects');
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/projects#edit');
  for (const to of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)']) {
    r = await call('/admin/login?to=' + encodeURIComponent(to));
    assert.equal(r.headers.get('location'), '/#edit', to);
  }
});

test('the editor UI is served only to the owner, and never cached', async () => {
  const r = await call('/admin/editor-ui.js');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(await r.text(), /editor UI/);
});

test('writes refuse cross-site requests', async () => {
  const body = { edits: {} };
  assert.equal((await call('/admin/api/edits', { method: 'PUT', body, headers: { 'x-editor': '' } })).status, 403);
  assert.equal((await call('/admin/api/edits', { method: 'PUT', body, headers: { origin: 'https://evil.com' } })).status, 403);
});

test('edits: saved to one PR, merged, then a fresh PR starts from what is live', async () => {
  let r = await json(await call('/admin/api/edits'));
  assert.deepEqual(r.body, { edits: {}, pr: null });

  const e1 = { 's2.div1.h21': { key: 's2.div1.h21', tag: 'h2', fp: 'The Kicker', html: 'The Kicker, worn' } };
  r = await json(await call('/admin/api/edits', { method: 'PUT', body: { edits: e1 } }));
  assert.equal(r.status, 200); assert.ok(r.body.pr && r.body.pr.number);
  const pr1 = r.body.pr.number;
  assert.deepEqual(JSON.parse(F.file('site-edits', 'site-edits/edits.json')).edits, e1);
  assert.equal(F.file('main', 'site-edits/edits.json'), null, 'nothing touches main before the merge');

  r = await json(await call('/admin/api/edits'));
  assert.deepEqual(r.body.edits, e1); assert.equal(r.body.pr.number, pr1);

  const e2 = { ...e1, 's2.div1': { key: 's2.div1', tag: 'div', layout: { desktop: { x: 60, y: 30 } } } };
  r = await json(await call('/admin/api/edits', { method: 'PUT', body: { edits: e2 } }));
  assert.equal(r.body.pr.number, pr1, 'same PR');
  const before = F.calls.length;
  r = await json(await call('/admin/api/edits', { method: 'PUT', body: { edits: e2 } }));
  assert.equal(r.body.changed, false, 'an unchanged save makes no commit');
  assert.ok(!F.calls.slice(before).some((c) => c.m === 'PUT'));

  F.merge(pr1);
  r = await json(await call('/admin/api/edits'));
  assert.deepEqual(r.body.edits, e2); assert.equal(r.body.pr, null, 'after the merge the live file is the base');

  const e3 = { 's2.div1': e2['s2.div1'] };
  r = await json(await call('/admin/api/edits', { method: 'PUT', body: { edits: e3 } }));
  assert.ok(r.body.pr.number > pr1, 'a new PR');
  assert.deepEqual(JSON.parse(F.file('site-edits', 'site-edits/edits.json')).edits, e3);
});

test('edits: Publish merges the open PR, and does nothing without one', async () => {
  const e = { 's4.div1.h21': { key: 's4.div1.h21', tag: 'h2', fp: 'x', html: 'Published' } };
  let r = await json(await call('/admin/api/edits', { method: 'PUT', body: { edits: e } }));
  const n = r.body.pr.number;
  assert.equal((await call('/admin/api/edits/publish')).status, 405, 'GET is refused');
  assert.equal((await call('/admin/api/edits/publish', { method: 'POST', headers: { 'x-editor': '' } })).status, 403, 'cross-site is refused');
  r = await json(await call('/admin/api/edits/publish', { method: 'POST' }));
  assert.equal(r.status, 200); assert.equal(r.body.published, true); assert.equal(r.body.number, n);
  assert.ok(F.issues.get(n).merged); assert.match(F.issues.get(n).mergeTitle, /^Publish site edits/);
  assert.deepEqual(JSON.parse(F.file('main', 'site-edits/edits.json')).edits, e, 'the edits are on main');
  r = await json(await call('/admin/api/edits'));
  assert.equal(r.body.pr, null); assert.deepEqual(r.body.edits, e);
  r = await json(await call('/admin/api/edits/publish', { method: 'POST' }));
  assert.deepEqual(r.body, { published: false, pr: null }, 'nothing open, nothing merged');
});

test('edits: bad input is refused', async () => {
  for (const edits of [null, [], { 'bad id!': {} }, { ok: 'string' }]) {
    const r = await call('/admin/api/edits', { method: 'PUT', body: { edits } });
    assert.equal(r.status, 400, JSON.stringify(edits));
  }
});

test('notes: filed as issues with a snapshot, replies and state come back', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const note = { n: 1, text: 'Make the knee bend read more clearly.\nSecond line with ``` backticks', status: 'open', s: 5.744, layout: 'desktop', viewport: { w: 1440, h: 900 },
    section: { index: 6, eyebrow: '07 Built', title: 'Leg exo' }, screen: { x: 317, y: 373, fx: .22, fy: .41 },
    target: { kind: '3d', object: 'Figure', point: [1, 2, 3], distance: 200, bone: 'lowerleg01.L' }, camera: { pos: [1, 2, 3], look: [0, 1, 0], fov: 30, free: false } };
  let r = await json(await call('/admin/api/notes', { method: 'POST', body: { id: 'nabc', note, shot: { jpeg: 'data:image/jpeg;base64,' + jpeg.toString('base64'), w: 640, h: 400 } } }));
  assert.equal(r.status, 200); const num = r.body.issue;
  assert.match(r.body.url, /\/issues\/\d+$/);
  const iss = F.issues.get(num);
  assert.deepEqual(iss.labels, ['site-note']);
  assert.match(iss.title, /^Site note: Make the knee bend/);
  assert.match(iss.body, /^> Make the knee bend/);
  assert.match(iss.body, /blob\/site-notes\/site-notes\/nabc\.jpg\?raw=true/);
  assert.equal(parseNote(iss.body).text, note.text, 'the JSON block survives backticks in the text');
  assert.deepEqual(F.file('site-notes', 'site-notes/nabc.jpg'), jpeg);
  assert.equal(F.file('main', 'site-notes/nabc.jpg'), null);

  const img = await call('/admin/api/shots/nabc');
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), jpeg);
  assert.equal((await call('/admin/api/shots/nope')).status, 404);

  r = await json(await call('/admin/api/notes'));
  let n = r.body.notes.nabc;
  assert.equal(n.issue, num); assert.equal(n.n, num); assert.equal(n.status, 'open'); assert.equal(n.reply, ''); assert.equal(n.hasShot, true);
  assert.equal(n.target.bone, 'lowerleg01.L');

  // Claude answers on the issue and its PR closes it
  F.comment(num, 'Bent the knee 12° more in the walk cycle.\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_');
  iss.state = 'closed'; iss.state_reason = 'completed';
  n = (await json(await call('/admin/api/notes'))).body.notes.nabc;
  assert.equal(n.status, 'done'); assert.equal(n.reply, 'Bent the knee 12° more in the walk cycle.');

  r = await json(await call('/admin/api/notes/' + num, { method: 'PATCH', body: { text: 'Bend it even more', status: 'open' } }));
  assert.equal(r.status, 200);
  assert.equal(iss.state, 'open'); assert.match(iss.title, /Bend it even more/); assert.equal(parseNote(iss.body).text, 'Bend it even more');
  assert.match(iss.body, /nabc\.jpg\?raw=true/, 'the snapshot link is kept');

  await call('/admin/api/notes/' + num, { method: 'PATCH', body: { status: 'done' } });
  assert.equal(iss.state, 'closed'); assert.equal(iss.state_reason, 'completed');

  await call('/admin/api/notes/' + num, { method: 'PATCH', body: { remove: true } });
  assert.equal(iss.state_reason, 'not_planned');
  assert.equal((await json(await call('/admin/api/notes'))).body.notes.nabc, undefined, 'removed notes drop out');
});

test('notes: only site-note issues can be changed, and input is checked', async () => {
  const other = (await json(await call('/admin/api/notes', { method: 'POST', body: { id: 'nx', note: { text: 'x' } } }))).body.issue;
  F.issues.get(other).labels = [];
  assert.equal((await call('/admin/api/notes/' + other, { method: 'PATCH', body: { status: 'done' } })).status, 404);
  for (const b of [{ id: 'bad id', note: { text: 'x' } }, { id: 'n1', note: { text: '' } }, { id: 'n1', note: { text: 'x' }, shot: { jpeg: 'data:image/png;base64,AAAA' } }]) {
    assert.equal((await call('/admin/api/notes', { method: 'POST', body: b })).status, 400, JSON.stringify(b));
  }
});

test('a GitHub token problem reports as a server error, not as signed out', async () => {
  const r = await worker.fetch(new Request(ORIGIN + '/admin/api/notes', { headers: { 'cf-access-jwt-assertion': token } }), { ...env, GITHUB_TOKEN: 'wrong' });
  assert.equal(r.status, 502);
});

test('note bodies round-trip', () => {
  const n = { text: 'a | b\n> c', s: 1, target: { kind: 'text', name: 'Heading', fp: 'The Kicker', key: 's2.div1.h21' } };
  assert.deepEqual(parseNote(noteBody('n1', n, '')), { id: 'n1', ...n });
});
