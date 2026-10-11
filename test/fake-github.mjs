// A small in-memory GitHub (just the REST calls worker/github.js makes) plus a Cloudflare Access key endpoint and a token
// signer, so the Worker can be tested without a network, a GitHub account or a Cloudflare account.
import http from 'node:http';
import { webcrypto as crypto } from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export async function startFakes({ owner = 'o', repo = 'r' } = {}) {
  // ---------- Access: one RSA key, served as the team's certs ----------
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

  // ---------- GitHub state ----------
  let shaN = 0; const newSha = () => (++shaN).toString(16).padStart(40, '0');
  const commits = new Map(), refs = new Map();
  const root = newSha(); commits.set(root, new Map([['README.md', { b64: Buffer.from('hi\n').toString('base64'), sha: newSha() }]]));
  refs.set('main', root);
  const labels = new Set(), issues = new Map(), comments = []; let num = 0; let commentId = 0;
  const calls = [];

  const full = `${owner}/${repo}`;
  const issueOut = (i) => ({ ...i, labels: i.labels.map((name) => ({ name })) });
  const filesOf = (branch) => commits.get(refs.get(branch));
  const sameFiles = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) && b.get(k).b64 === v.b64);

  let base = '';
  const srv = http.createServer(async (q, s) => {
    const u = new URL(q.url, 'http://x'); const p = u.pathname, m = q.method;
    let raw = ''; for await (const c of q) raw += c;
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ m, p: p + u.search, auth: q.headers.authorization });
    const out = (code, o, type = 'application/json') => { s.writeHead(code, { 'content-type': type }); s.end(type === 'application/json' ? JSON.stringify(o) : o); };
    if (p === '/cdn-cgi/access/certs') return out(200, { keys: [jwk] });
    if (q.headers.authorization !== 'Bearer test-token') return out(401, { message: 'Bad credentials' });
    const R = `/repos/${full}`;
    if (!p.startsWith(R)) return out(404, { message: 'Not Found' });
    const r = p.slice(R.length);
    let mm;
    if (r === '' && m === 'GET') return out(200, { default_branch: 'main', full_name: full });
    if ((mm = /^\/git\/ref\/heads\/(.+)$/.exec(r)) && m === 'GET') return refs.has(mm[1]) ? out(200, { object: { sha: refs.get(mm[1]) } }) : out(404, { message: 'Not Found' });
    if ((mm = /^\/git\/refs\/heads\/(.+)$/.exec(r)) && m === 'PATCH') { if (!refs.has(mm[1])) return out(422, { message: 'Reference does not exist' }); refs.set(mm[1], body.sha); return out(200, {}); }
    if (r === '/git/refs' && m === 'POST') { const b = body.ref.replace('refs/heads/', ''); if (refs.has(b)) return out(422, { message: 'Reference already exists' }); refs.set(b, body.sha); return out(201, {}); }
    if ((mm = /^\/contents\/(.+)$/.exec(r))) {
      const path = decodeURIComponent(mm[1]);
      if (m === 'GET') {
        const f = filesOf(u.searchParams.get('ref') || 'main')?.get(path);
        if (!f) return out(404, { message: 'Not Found' });
        if (q.headers.accept === 'application/vnd.github.raw') { s.writeHead(200, { 'content-type': 'application/octet-stream' }); return s.end(Buffer.from(f.b64, 'base64')); }
        return out(200, { type: 'file', sha: f.sha, content: f.b64.replace(/(.{60})/g, '$1\n') });
      }
      if (m === 'PUT') {
        const files = filesOf(body.branch); if (!files) return out(404, { message: 'Branch not found' });
        const cur = files.get(path);
        if (cur && cur.sha !== body.sha) return out(409, { message: 'sha does not match' });
        if (!cur && body.sha) return out(422, { message: 'sha given for a new file' });
        const next = new Map(files); next.set(path, { b64: body.content, sha: newSha() });
        const c = newSha(); commits.set(c, next); refs.set(body.branch, c);
        return out(cur ? 200 : 201, { commit: { sha: c } });
      }
    }
    if (r === '/pulls' && m === 'GET') {
      const head = u.searchParams.get('head') || '';
      return out(200, [...issues.values()].filter((i) => i.pr && i.state === 'open' && (!head || `${owner}:${i.head}` === head)).reverse().map((i) => ({ number: i.number, html_url: i.html_url, head: { ref: i.head } })));
    }
    if (r === '/pulls' && m === 'POST') {
      if (!refs.has(body.head)) return out(422, { message: 'head not found' });
      if (sameFiles(filesOf(body.head), filesOf(body.base))) return out(422, { message: 'No commits between main and ' + body.head });
      const n = ++num, i = { number: n, pr: true, head: body.head, base: body.base, title: body.title, body: body.body, state: 'open', labels: [], comments: 0, html_url: `https://github.com/${full}/pull/${n}`, pull_request: {} };
      issues.set(n, i); return out(201, i);
    }
    if (r === '/labels' && m === 'POST') { if (labels.has(body.name)) return out(422, { message: 'already_exists' }); labels.add(body.name); return out(201, { name: body.name }); }
    if (r === '/issues' && m === 'POST') {
      const n = ++num, i = { number: n, title: body.title, body: body.body, labels: body.labels || [], state: 'open', state_reason: null, comments: 0, html_url: `https://github.com/${full}/issues/${n}` };
      issues.set(n, i); return out(201, issueOut(i));
    }
    if (r === '/issues' && m === 'GET') {
      const lab = u.searchParams.get('labels'), page = +(u.searchParams.get('page') || 1), per = +(u.searchParams.get('per_page') || 30);
      const all = [...issues.values()].filter((i) => !lab || i.labels.includes(lab)).sort((a, b) => b.number - a.number);
      return out(200, all.slice((page - 1) * per, page * per).map(issueOut));
    }
    if (r === '/issues/comments' && m === 'GET') return out(200, [...comments].reverse().slice(0, +(u.searchParams.get('per_page') || 30)));
    if ((mm = /^\/issues\/(\d+)\/comments$/.exec(r)) && m === 'GET') return out(200, comments.filter((c) => c.issue === +mm[1]));
    if ((mm = /^\/issues\/(\d+)$/.exec(r))) {
      const i = issues.get(+mm[1]); if (!i) return out(404, { message: 'Not Found' });
      if (m === 'GET') return out(200, issueOut(i));
      if (m === 'PATCH') {
        for (const k of ['title', 'body', 'state', 'state_reason']) if (k in body) i[k] = body[k];
        if (body.state === 'open') i.state_reason = 'reopened';
        return out(200, issueOut(i));
      }
    }
    return out(404, { message: 'Not Found: ' + m + ' ' + r });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${srv.address().port}`;

  async function sign(claims, { kid = 'k1', key = kp.privateKey } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const h = b64u(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
    const p = b64u(JSON.stringify({ aud: ['aud-test'], iss: base, email: 'owner@example.com', iat: now, exp: now + 3600, ...claims }));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(h + '.' + p));
    return h + '.' + p + '.' + b64u(sig);
  }

  return {
    base, calls, refs, issues, comments,
    env: { GITHUB_REPO: full, GITHUB_TOKEN: 'test-token', GITHUB_API: base, ACCESS_TEAM_DOMAIN: base, ACCESS_AUD: 'aud-test', ALLOWED_EMAILS: 'Owner@Example.com, other@example.com' },
    sign,
    file(branch, path) { const f = filesOf(branch)?.get(path); return f ? Buffer.from(f.b64, 'base64') : null; },
    comment(issue, text) { const i = issues.get(issue); i.comments++; comments.push({ id: ++commentId, issue, issue_url: `${base}/repos/${full}/issues/${issue}`, body: text }); },
    merge(prNumber) {          // what the merge button does, for these tests: the base takes the head's files
      const i = issues.get(prNumber); const c = newSha(); commits.set(c, new Map(filesOf(i.head))); refs.set(i.base, c); i.state = 'closed'; i.merged = true;
    },
    close: () => new Promise((ok) => srv.close(ok)),
  };
}
