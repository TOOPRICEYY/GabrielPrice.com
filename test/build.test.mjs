// Checks the output of `npm run build`: visitors get the edits and the editor's core, never the editor UI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const html = fs.readFileSync(new URL('dist/index.html', root), 'utf8');
const ui = fs.readFileSync(new URL('worker/editor-ui.gen.js', root), 'utf8');
const MARK = '/* ===== editor UI ===== */';

test('the page carries the baked edits and the editor core only', () => {
  const m = /<script id="site-edits" type="application\/json">(.*?)<\/script>/s.exec(html);
  assert.ok(m, 'baked edits present');
  const want = JSON.parse(fs.readFileSync(new URL('site-edits/edits.json', root), 'utf8')).edits;
  assert.deepEqual(JSON.parse(m[1]).edits, want);
  assert.ok(html.includes('window.__siteEditor = {'), 'core present');
  assert.ok(!html.includes(MARK), 'no editor UI in the public page');
  assert.ok(!html.includes('Summary for Claude'), 'no editor panel strings in the public page');
  assert.ok(!html.includes('/*KICKER_DATA*/') && !html.includes('/*RIGS*/') && !html.includes('/*EDITOR*/'), 'every placeholder filled');
  assert.match(html, /^<!doctype html>/);
});

test('the Worker bundle carries the editor UI', () => {
  assert.ok(ui.includes(JSON.stringify(MARK).slice(1, -1)));
  assert.ok(ui.includes('Summary for Claude'));
});

test('every local file the page refers to is in dist', () => {
  // relative paths like photos/x.webp or holdfast/index.html, in attributes and in the inlined scripts
  const refs = new Set();
  for (const m of html.matchAll(/["'`(]([a-z0-9_-]+\/[\w./-]+\.(?:webp|jpe?g|png|gif|svg|mp4|webm|css|js|html|json|txt|glb|bin))(?=[?#"'`)])/gi)) {
    if (!/^(three|node_modules|https?)\b/.test(m[1])) refs.add(m[1]);
  }
  assert.ok(refs.size > 0, 'found the photo references');
  const missing = [...refs].filter((r) => !fs.existsSync(new URL('dist/' + r, root)));
  assert.deepEqual(missing, [], 'missing from dist: add the folder to STATIC_DIRS in scripts/build.mjs');
});

test('every editor edit still finds its element in the page source', () => {
  // The page finds an edit's element the way resolve() in src/editor.js does: the element at its key if that still has the
  // edit's original text (fp), else the one element of its tag with that text. If neither holds, the page skips the edit,
  // silently. Fix by baking the edit into src/main.html (or src/gallery.js) and removing it from site-edits/edits.json:
  // see "Edits from the editor" in CLAUDE.md.
  const src = (f) => fs.readFileSync(new URL('src/' + f, root), 'utf8');
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(1).replace(/^x/i, '0x'))) : ent[e] ?? m);
  // a small tree of main.html's sections, keyed like keyFor(): s<data-s>, then tag + index among same-tag siblings
  const VOID = new Set(['area', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  // gallery.js writes the gallery cards into #galgrid: rebuild them from its PROJECTS list with the same markup, so they get
  // the same keys
  const q = String.raw`'((?:[^'\\]|\\.)*)'`, unq = (s) => s.replace(/\\(.)/g, '$1');
  const cards = [...src('gallery.js').matchAll(new RegExp(String.raw`\{ id: '[^']+', title: ${q}, kind: ${q}([^\n]*)\n\s*blurb: ${q}`, 'g'))]
    .map(([, title, kind, rest, blurb]) => `<button>\n  <div class="gal-thumb"><img>${/\bsoon: true/.test(rest) ? '<div><span>Coming soon</span></div>' : ''}</div>`
      + `\n  <div class="gal-meta"><span class="gal-tag">${unq(kind)}</span><h3>${unq(title)}</h3><p>${unq(blurb)}</p></div></button>`);
  assert.ok(cards.length > 3, 'read the gallery cards');
  assert.match(src('gallery.js'), /<div class="gal-meta"><span class="gal-tag">\$\{p\.kind\}<\/span><h3>\$\{p\.title\}<\/h3><p>\$\{p\.blurb\}<\/p><\/div><\/button>/,
    'gallery cards still use the markup rebuilt here');
  const els = [], stack = [];
  const html = src('main.html').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(<div class="gal-grid" id="galgrid">)/, '$1' + cards.join(''));
  assert.ok(html.includes(cards[0]), 'found the gallery grid');
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g)) {
    if (m[4] != null) { for (const e of stack) e.text += decode(m[4]); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) { const at = stack.findLastIndex((e) => e.tag === tag); if (at >= 0) stack.length = at; continue; }
    if (VOID.has(tag)) continue;
    const parent = stack.at(-1), s = /\bdata-s="(\d+)"/.exec(m[3]);
    const e = { tag, text: '', kids: [] };
    if (tag === 'section' && s) e.key = 's' + s[1];
    else if (parent?.key) { const n = parent.kids.filter((k) => k.tag === tag).length + 1; e.key = parent.key + '.' + tag + n; }
    parent?.kids.push(e); stack.push(e); els.push(e);
  }
  const fp = (e) => norm(e.text).slice(0, 160);
  const byKey = new Map(els.filter((e) => e.key).map((e) => [e.key, e]));
  assert.equal(fp(byKey.get('s0.div1.h11') || { text: '' }), 'Gabriel Price', 'keys line up with the page');
  const edits = JSON.parse(fs.readFileSync(new URL('site-edits/edits.json', root), 'utf8')).edits;
  const stale = Object.entries(edits).filter(([k, d]) => {
    if (!d.fp) return false;
    const at = byKey.get(d.key || k);
    return !(at && fp(at) === d.fp) && els.filter((e) => e.tag === d.tag && fp(e) === d.fp).length !== 1;
  }).map(([k, d]) => `${k} (“${d.fp.slice(0, 40)}”)`);
  assert.deepEqual(stale, [], 'the page no longer finds these edits, so it skips them');
});
