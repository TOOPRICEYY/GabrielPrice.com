// decimate a REFMESH js file with meshoptimizer: node dec.mjs in.js out.js targetTris maxError
import { MeshoptSimplifier } from '../h/node_modules/meshoptimizer/index.js'; import fs from 'fs';
await MeshoptSimplifier.ready;
const [,, inp, out, tgt = '3000', err = '0.002'] = process.argv;
const M = JSON.parse(fs.readFileSync(inp, 'utf8').replace(/^window\.REFMESH=/, '').replace(/;\s*$/, ''));
// weld duplicate positions first so the simplifier sees a connected surface
const key = new Map(), P = [], remap = [];
for (let i = 0; i < M.p.length / 3; i++) { const k = M.p.slice(i * 3, i * 3 + 3).map(v => v.toFixed(3)).join(','); let j = key.get(k); if (j === undefined) { j = P.length / 3; key.set(k, j); P.push(M.p[i * 3], M.p[i * 3 + 1], M.p[i * 3 + 2]); } remap.push(j); }
const I = new Uint32Array(M.i.map(i => remap[i])), pos = new Float32Array(P);
const [s, e] = MeshoptSimplifier.simplify(I, pos, 3, +tgt * 3, +err, []);
const map = new Map(), Q = [], J = [];
for (const i of s) { let m = map.get(i); if (m === undefined) { m = Q.length / 3; map.set(i, m); Q.push(+pos[i * 3].toFixed(2), +pos[i * 3 + 1].toFixed(2), +pos[i * 3 + 2].toFixed(2)); } J.push(m); }
fs.writeFileSync(out, 'window.REFMESH=' + JSON.stringify({ p: Q, i: J }) + ';');
console.log('welded verts', P.length / 3, 'in tris', M.i.length / 3, 'out tris', J.length / 3, 'error', e.toFixed(5));
