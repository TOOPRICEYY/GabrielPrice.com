import { MeshoptSimplifier } from '../h/node_modules/meshoptimizer/index.js';
import fs from 'fs';
await MeshoptSimplifier.ready;
const spec = JSON.parse(process.argv[2]); const out = {};
for (const [key, src, target, err] of spec) {
  const b = fs.readFileSync(src + '.bin'); const [nv, nf] = new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + 8));
  const pos = new Float32Array(b.buffer.slice(b.byteOffset + 8, b.byteOffset + 8 + nv * 12));
  const idx = new Uint32Array(b.buffer.slice(b.byteOffset + 8 + nv * 12, b.byteOffset + 8 + nv * 12 + nf * 12));
  const [s] = MeshoptSimplifier.simplify(idx, pos, 3, target * 3, err, []);
  // compact the vertex list
  const map = new Map(), P = [], I = new Uint32Array(s.length);
  for (let i = 0; i < s.length; i++) { let m = map.get(s[i]); if (m === undefined) { m = P.length / 3; map.set(s[i], m); P.push(pos[s[i] * 3], pos[s[i] * 3 + 1], pos[s[i] * 3 + 2]); } I[i] = m; }
  const q = Int16Array.from(P, v => Math.round(v * 100));          // 0.1 mm steps
  const ib = P.length / 3 < 65536 ? Uint16Array.from(I) : I;
  out[key] = { p: Buffer.from(q.buffer).toString('base64'), i: Buffer.from(ib.buffer).toString('base64'), w: ib.BYTES_PER_ELEMENT, n: s.length / 3 };
  if (fs.existsSync(src + '.mk.json')) out[key].m = JSON.parse(fs.readFileSync(src + '.mk.json'));
  console.log(key, nf, '->', s.length / 3, 'tris', P.length / 3, 'verts');
}
fs.writeFileSync(process.argv[3] || 'lineup_data.js', 'window.LINEUP=' + JSON.stringify(out) + ';');
