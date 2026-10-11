// decimate body and head separately, add a six-sided neck, merge into window.REFMESH
import { MeshoptSimplifier } from '../h/node_modules/meshoptimizer/index.js'; import fs from 'fs';
await MeshoptSimplifier.ready;
const [,, bodyT = '720', headT = '46', out = 'refmesh.js', neckJ = '{}'] = process.argv;
const P = [], I = [];
function load(src, target) {
  const b = fs.readFileSync(src); const [nv, nf] = new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + 8));
  const pos = new Float32Array(b.buffer.slice(b.byteOffset + 8, b.byteOffset + 8 + nv * 12));
  const idx = new Uint32Array(b.buffer.slice(b.byteOffset + 8 + nv * 12, b.byteOffset + 8 + nv * 12 + nf * 12));
  const [s] = MeshoptSimplifier.simplify(idx, pos, 3, +target * 3, 1, []);
  const map = new Map();
  for (const i of s) { let m = map.get(i); if (m === undefined) { m = P.length / 3; map.set(i, m); P.push(+pos[i * 3].toFixed(2), +pos[i * 3 + 1].toFixed(2), +pos[i * 3 + 2].toFixed(2)); } I.push(m); }
  return s.length / 3;
}
const pre = process.env.PRE || 'ref'; const nb = load(pre + 'body.bin', bodyT), nh = load(pre + 'head.bin', headT);
// neck: hexagonal prism from inside the shoulders up into the head, leaning slightly forward
// rings: [y, z, r]; flares at the base into the trapezius, narrow under the head
const N = { rings: [[137, -2.0, 5.8], [143, -1.4, 3.8], [150.5, 1.2, 3.3], [158, 2.6, 3.2]], ph: 0, ...JSON.parse(neckJ) };
const base = P.length / 3, R = N.rings.length;
for (const [y, z, r] of N.rings) for (let j = 0; j < 6; j++) { const t = N.ph + j * Math.PI / 3; P.push(+(r * Math.cos(t)).toFixed(2), y, +(z + r * Math.sin(t)).toFixed(2)); }
for (let k = 0; k + 1 < R; k++) for (let j = 0; j < 6; j++) { const a = base + k * 6 + j, b = base + k * 6 + (j + 1) % 6, c = b + 6, d = a + 6; I.push(a, c, b, a, d, c); }
// mirror left-right (the first reference image was a flipped copy) and keep outward winding
if (N.mirror !== false) { for (let k = 0; k < P.length; k += 3) P[k] = -P[k]; for (let t = 0; t < I.length; t += 3) { const q = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = q; } }
fs.writeFileSync(out, 'window.REFMESH=' + JSON.stringify({ p: P, i: I }) + ';'); console.log('body', nb, 'head', nh, 'total', I.length / 3);
