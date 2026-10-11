import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'fs';
await MeshoptSimplifier.ready;
const pos = new Float32Array(fs.readFileSync('stage_pos.bin').buffer.slice(0));
const idx = new Uint32Array(fs.readFileSync('stage_idx.bin').buffer.slice(0));
const target = +(process.argv[2] || 9000) * 3;
const [out, err] = MeshoptSimplifier.simplify(idx, pos, 3, target, 0.05, ['LockBorder']);
console.log('tris', out.length / 3, 'err', err);
fs.writeFileSync('stage_simp.bin', Buffer.from(out.buffer));
