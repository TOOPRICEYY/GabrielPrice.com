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
