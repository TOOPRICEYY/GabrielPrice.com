// The editor's two stores, both in the site's GitHub repo:
// - edits: one file, site-edits/edits.json, on the branch `site-edits` with one open pull request into the default branch.
//   Merging it publishes the edits (the build bakes the file into the page): the editor's Publish button merges it through
//   publishEdits(), or it can be merged on GitHub. With no PR open, the next save starts the branch again from the default
//   branch, so a closed or merged PR never leaks old commits into the new one.
// - notes: one issue per note, labelled `site-note`. The issue body carries a readable summary and, in a fenced
//   ```json site-note block, the whole note as the editor saved it. Closed as completed = done, closed as not planned = deleted.
//   The latest comment on the issue is shown in the editor as Claude's reply. Snapshots of the 3D view are committed to the
//   branch `site-notes` as site-notes/<note id>.jpg, a branch that is never merged.

export const EDITS_BRANCH = 'site-edits', EDITS_PATH = 'site-edits/edits.json';
export const NOTES_BRANCH = 'site-notes', NOTE_LABEL = 'site-note';
export const ID_OK = /^[\w.:@+~-]{1,200}$/;

export class GitHubError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function gh(env) {
  const api = (env.GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');
  const repo = env.GITHUB_REPO;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !env.GITHUB_TOKEN) throw new GitHubError(500, 'GITHUB_REPO or GITHUB_TOKEN is not set');
  const call = async (method, path, body, accept) => {
    const r = await fetch(api + '/repos/' + repo + path, {
      method,
      headers: {
        authorization: 'Bearer ' + env.GITHUB_TOKEN, accept: accept || 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28', 'user-agent': 'gabrielprice-site-editor',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 404 && method === 'GET') return null;
    if (accept && r.ok) return r;
    const o = r.status === 204 ? {} : await r.json().catch(() => ({}));
    if (!r.ok) throw new GitHubError(r.status, `GitHub ${method} ${path.split('?')[0]}: ${r.status} ${o.message || ''}`.trim());
    return o;
  };
  return { repo, call };
}

// ---------- small helpers ----------
const enc = new TextEncoder(), dec = new TextDecoder();
export function b64(s) {
  const u = typeof s === 'string' ? enc.encode(s) : s;
  let out = '';
  for (let i = 0; i < u.length; i += 0x8000) out += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(out);
}
const unb64 = (s) => dec.decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
// sorted keys, so the edits file diffs cleanly in the PR
export function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  return v;
}

let defaultBranch = '';
async function baseBranch(g) {
  if (!defaultBranch) defaultBranch = (await g.call('GET', '')).default_branch || 'main';
  return defaultBranch;
}
async function headSha(g, branch) {
  const r = await g.call('GET', '/git/ref/heads/' + branch);
  return r && r.object ? r.object.sha : null;
}
async function pointBranch(g, branch, sha) {             // create the branch, or move it to sha
  if (await headSha(g, branch)) return g.call('PATCH', '/git/refs/heads/' + branch, { sha, force: true });
  return g.call('POST', '/git/refs', { ref: 'refs/heads/' + branch, sha });
}
async function getFile(g, path, ref) {
  const r = await g.call('GET', '/contents/' + path + '?ref=' + encodeURIComponent(ref));
  return r && r.type === 'file' ? { sha: r.sha, text: unb64(r.content || '') } : null;
}

// ---------- edits ----------
async function openEditsPR(g) {
  const owner = g.repo.split('/')[0];
  const list = await g.call('GET', `/pulls?state=open&head=${encodeURIComponent(owner + ':' + EDITS_BRANCH)}&per_page=5`);
  const pr = (list || [])[0];
  return pr ? { number: pr.number, url: pr.html_url } : null;
}
const parseEdits = (text) => { try { const o = JSON.parse(text); return (o && (o.edits || {})) || {}; } catch { return {}; } };

export async function getEdits(env) {
  const g = gh(env);
  const pr = await openEditsPR(g);
  const f = await getFile(g, EDITS_PATH, pr ? EDITS_BRANCH : await baseBranch(g));
  return { edits: f ? parseEdits(f.text) : {}, pr };
}

export function checkEdits(edits) {
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) return 'edits must be an object';
  const keys = Object.keys(edits);
  if (keys.length > 2000) return 'too many edits';
  for (const k of keys) {
    if (!ID_OK.test(k)) return 'bad edit id ' + JSON.stringify(k.slice(0, 40));
    const d = edits[k];
    if (!d || typeof d !== 'object' || Array.isArray(d)) return 'edit ' + k + ' is not an object';
  }
  if (JSON.stringify(edits).length > 600_000) return 'edits are too large';
  return '';
}

export async function putEdits(env, edits, who) {
  const g = gh(env), base = await baseBranch(g);
  let pr = await openEditsPR(g);
  if (!pr) {                                              // a fresh round of edits starts from what is live
    const sha = await headSha(g, base);
    if (!sha) throw new GitHubError(500, 'the default branch has no commits');
    await pointBranch(g, EDITS_BRANCH, sha);
  }
  const text = JSON.stringify({ v: 1, edits: stable(edits) }, null, 2) + '\n';
  const cur = await getFile(g, EDITS_PATH, EDITS_BRANCH);
  if (cur && cur.text === text) return { pr, changed: false };
  const n = Object.keys(edits).length;
  await g.call('PUT', '/contents/' + EDITS_PATH, {
    message: `Site edits from the editor (${n} element${n === 1 ? '' : 's'})`, content: b64(text), branch: EDITS_BRANCH, ...(cur ? { sha: cur.sha } : {}),
  });
  if (!pr) {
    try {
      const o = await g.call('POST', '/pulls', {
        title: 'Site edits from the editor', head: EDITS_BRANCH, base,
        body: [
          `Text and layout changes ${who ? who + ' ' : ''}made in the site editor. Every save adds a commit to this pull request.`,
          '',
          'Press Publish in the editor, or merge here, to put them on the live site. Closing without merging throws these edits away; the next save starts a new pull request from what is live.',
        ].join('\n'),
      });
      pr = { number: o.number, url: o.html_url };
    } catch (e) {
      if (!(e instanceof GitHubError && e.status === 422)) throw e;      // nothing differs from the default branch
    }
  }
  return { pr, changed: true };
}

// Publish: merge the open edits PR into the default branch as one commit. Cloudflare then rebuilds with the edits baked in.
export async function publishEdits(env, who) {
  const g = gh(env);
  const pr = await openEditsPR(g);
  if (!pr) return { published: false, pr: null };
  const o = await g.call('PUT', `/pulls/${pr.number}/merge`, {
    merge_method: 'squash', commit_title: `Publish site edits (#${pr.number})`,
    commit_message: `Published from the site editor${who ? ' by ' + who : ''}.`,
  });
  return { published: true, pr: null, number: pr.number, sha: o.sha || null };
}

// ---------- notes ----------
const r3 = (a) => Array.isArray(a) ? a.map((v) => Math.round(Number(v) * 10) / 10).join(', ') : '';
function where(n) {
  const t = n.target || {};
  if (t.kind === 'text' || t.kind === 'block') return `${t.name || 'Element'} “${String(t.fp || '').slice(0, 80)}” (\`${t.key || ''}\`)`;
  if (t.kind === 'floor') return `Floor at ${r3(t.point)}`;
  if (t.kind === '3d') return `${t.object || '3D part'}${t.bone ? ', near bone ' + t.bone : ''} at ${r3(t.point)}`;
  return 'Background (nothing under the cursor)';
}
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
function fenceFor(s) {                                   // a code fence longer than any run of backticks inside
  let m = 2; for (const x of s.match(/`+/g) || []) m = Math.max(m, x.length);
  return '`'.repeat(m + 1);
}
export function noteTitle(n) {
  const first = String(n.text || '').trim().split('\n')[0];
  return 'Site note: ' + (first.length > 70 ? first.slice(0, 69) + '…' : first || 'untitled');
}
export function noteBody(id, n, imageUrl) {
  const sec = n.section || {}, cam = n.camera || {}, vp = n.viewport || {};
  const data = JSON.stringify({ id, ...n }, null, 1), f = fenceFor(data);
  return [
    String(n.text || '').split('\n').map((l) => '> ' + l).join('\n'),
    '',
    '| | |', '|---|---|',
    `| Section | ${cell(sec.eyebrow || '')}${sec.title ? ' · ' + cell(sec.title) : ''} (section ${cell(sec.index)}) |`,
    `| Scroll | s = ${cell(n.s)} |`,
    `| Screen | ${cell(n.layout)} ${cell(vp.w)}×${cell(vp.h)}, point ${cell(n.screen && n.screen.x)}, ${cell(n.screen && n.screen.y)} |`,
    `| On | ${cell(where(n))} |`,
    `| Camera | pos ${r3(cam.pos)} · look ${r3(cam.look)} · fov ${cell(cam.fov)}${cam.free ? ' · Gabriel turned the view himself' : ''} |`,
    '',
    imageUrl ? `![The view when the note was made](${imageUrl})\n` : '',
    '<details><summary>Note data for Claude</summary>',
    '',
    f + 'json site-note', data, f,
    '</details>',
    '',
  ].join('\n');
}
export function parseNote(body) {
  const m = /^(`{3,})json site-note\n([\s\S]*?)\n\1$/m.exec(body || '');
  if (!m) return null;
  try { const o = JSON.parse(m[2]); return o && typeof o === 'object' && ID_OK.test(o.id || '') ? o : null; } catch { return null; }
}
const stripFooter = (s) => String(s || '').replace(/\n*-{3,}\s*\n_?Generated by \[Claude Code\]\([^)]*\)_?\s*$/i, '').trim();

let labelReady = false;
async function ensureLabel(g) {
  if (labelReady) return;
  try { await g.call('POST', '/labels', { name: NOTE_LABEL, color: 'ff2d6f', description: 'A note left in the site editor for Claude' }); }
  catch (e) { if (!(e instanceof GitHubError && e.status === 422)) throw e; }       // 422: it exists already
  labelReady = true;
}

export function checkNote(id, n, shot) {
  if (!ID_OK.test(id || '')) return 'bad note id';
  if (!n || typeof n !== 'object' || Array.isArray(n)) return 'note must be an object';
  if (typeof n.text !== 'string' || !n.text.trim() || n.text.length > 8000) return 'note text must be 1–8000 characters';
  if (JSON.stringify(n).length > 40_000) return 'note is too large';
  if (shot != null && !(typeof shot.jpeg === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(shot.jpeg) && shot.jpeg.length < 1_500_000)) return 'snapshot must be a JPEG data URL under 1 MB';
  return '';
}

export async function createNote(env, id, n, shot) {
  const g = gh(env);
  await ensureLabel(g);
  const note = { ...n };
  delete note.issue; delete note.url; delete note.reply;
  let imageUrl = '';
  if (shot) {
    if (!(await headSha(g, NOTES_BRANCH))) await pointBranch(g, NOTES_BRANCH, await headSha(g, await baseBranch(g)));
    const path = `site-notes/${id}.jpg`, cur = await g.call('GET', '/contents/' + path + '?ref=' + NOTES_BRANCH);
    await g.call('PUT', '/contents/' + path, {
      message: `Snapshot for site note ${id}`, content: shot.jpeg.slice(shot.jpeg.indexOf(',') + 1), branch: NOTES_BRANCH, ...(cur ? { sha: cur.sha } : {}),
    });
    imageUrl = `https://github.com/${g.repo}/blob/${NOTES_BRANCH}/${path}?raw=true`;
    note.hasShot = true;
  }
  const o = await g.call('POST', '/issues', { title: noteTitle(note), body: noteBody(id, note, imageUrl), labels: [NOTE_LABEL] });
  return { issue: o.number, url: o.html_url };
}

async function noteIssue(g, num) {
  const iss = await g.call('GET', '/issues/' + num);
  if (!iss || iss.pull_request || !(iss.labels || []).some((l) => (l.name || l) === NOTE_LABEL)) throw new GitHubError(404, 'no site note with that number');
  return iss;
}

export async function updateNote(env, num, patch) {
  const g = gh(env), iss = await noteIssue(g, num);
  if (patch.remove) return g.call('PATCH', '/issues/' + num, { state: 'closed', state_reason: 'not_planned' });
  const n = parseNote(iss.body);
  const out = {};
  if (typeof patch.text === 'string' && n) {
    if (!patch.text.trim() || patch.text.length > 8000) throw new GitHubError(400, 'note text must be 1–8000 characters');
    const { id, ...rest } = n;
    rest.text = patch.text; rest.updatedAt = new Date().toISOString();
    const img = /!\[The view when the note was made\]\(([^)\s]+)\)/.exec(iss.body || '');
    out.title = noteTitle(rest); out.body = noteBody(id, rest, img ? img[1] : '');
  }
  if (patch.status === 'done' && iss.state !== 'closed') Object.assign(out, { state: 'closed', state_reason: 'completed' });
  if (patch.status === 'open' && iss.state === 'closed') Object.assign(out, { state: 'open' });
  if (Object.keys(out).length) await g.call('PATCH', '/issues/' + num, out);
  return { ok: true };
}

export async function listNotes(env) {
  const g = gh(env), issues = [];
  for (let page = 1; page <= 5; page++) {
    const batch = (await g.call('GET', `/issues?labels=${NOTE_LABEL}&state=all&per_page=100&page=${page}`)) || [];
    issues.push(...batch);
    if (batch.length < 100) break;
  }
  // the latest comment per issue, from one listing of the repo's newest comments rather than one request per issue
  const latest = new Map();
  if (issues.some((i) => i.comments)) {
    const cs = (await g.call('GET', '/issues/comments?sort=created&direction=desc&per_page=100')) || [];
    for (const c of cs) { const k = Number(String(c.issue_url || '').split('/').pop()); if (!latest.has(k)) latest.set(k, c); }
    const older = issues.filter((i) => i.comments && !latest.has(i.number) && i.state_reason !== 'not_planned').slice(0, 10);
    for (const i of older) { const all = (await g.call('GET', `/issues/${i.number}/comments?per_page=100`)) || []; if (all.length) latest.set(i.number, all[all.length - 1]); }
  }
  const notes = {};
  for (const iss of issues) {
    if (iss.pull_request || iss.state_reason === 'not_planned') continue;
    const n = parseNote(iss.body); if (!n) continue;
    const { id, ...doc } = n;
    const c = latest.get(iss.number);
    notes[id] = { ...doc, n: iss.number, issue: iss.number, url: iss.html_url, status: iss.state === 'closed' ? 'done' : 'open', reply: c ? stripFooter(c.body).slice(0, 1200) : '' };
  }
  return { notes };
}

export async function getShot(env, id) {
  const g = gh(env);
  const r = await g.call('GET', `/contents/site-notes/${id}.jpg?ref=${NOTES_BRANCH}`, null, 'application/vnd.github.raw');
  return r ? r.arrayBuffer() : null;
}
