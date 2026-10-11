# Bone-heat skin weights (Pinocchio style) on the full-res watertight mesh, sampled down to the 1,500-tri body.
import numpy as np, trimesh, scipy.sparse as sp, scipy.sparse.linalg as sla, time, json
from load import load
from skel import J, NAMES
V, F, _ = load('../../ref/genmesh.js')
m = trimesh.Trimesh(V, F, process=True); V = m.vertices.copy(); F = m.faces.copy(); n = len(V)
t0 = time.time()
# ---- inside grid (0.5 cm) by parity of crossings along y columns
h = .5; lo = V.min(0) - 2; hi = V.max(0) + 2
gx = np.arange(lo[0], hi[0], h); gy = np.arange(lo[1], hi[1], h); gz = np.arange(lo[2], hi[2], h)
X, Z = np.meshgrid(gx, gz, indexing='ij')
org = np.stack([X.ravel() + 1e-3, np.full(X.size, lo[1]), Z.ravel() + 1.7e-3], 1); dirs = np.tile([0, 1., 0], (len(org), 1))
loc, ri, _ = m.ray.intersects_location(org, dirs, multiple_hits=True)
inside = np.zeros((len(gx), len(gy), len(gz)), bool)
order = np.lexsort((loc[:, 1], ri)); loc, ri = loc[order], ri[order]
for r in np.unique(ri):
    ys = np.sort(loc[ri == r, 1]); ix, iz = np.unravel_index(r, X.shape)
    for a, b in zip(ys[0::2], ys[1::2]): inside[ix, (gy >= a) & (gy <= b), iz] = True
print('grid', inside.shape, inside.mean(), time.time() - t0)
def isin(P):
    i = np.clip(np.round((P - lo) / h).astype(int), 0, np.array(inside.shape) - 1)
    return inside[i[..., 0], i[..., 1], i[..., 2]]
# ---- deforming segments: weight bone name, a, b
L = lambda s: [(f'{n}.{s}', a, b) for n, a, b in []]
SEG = [('root', [0, 78, -1], J['spine04']), ('spine04', J['spine04'], J['spine03']), ('spine03', J['spine03'], J['spine01']),
       ('spine01', J['spine01'], J['neck01']), ('neck01', J['neck01'], J['head']), ('head', J['head'], [0, 172, 3])]
for s, sg in (('L', 1), ('R', -1)):
    SEG += [('spine01', J['clavicle.' + s], J['upperarm01.' + s]),
            ('upperarm01.' + s, J['upperarm01.' + s], J['lowerarm01.' + s]), ('lowerarm01.' + s, J['lowerarm01.' + s], J['wrist.' + s]),
            ('wrist.' + s, J['wrist.' + s], [sg * 24.5, 78.5, 1.5]),
            ('upperleg01.' + s, J['upperleg01.' + s], J['lowerleg01.' + s]), ('lowerleg01.' + s, J['lowerleg01.' + s], J['foot.' + s]),
            ('foot.' + s, J['foot.' + s], [sg * 14.5, 2.5, 9.0])]
BN = sorted(set(s[0] for s in SEG)); bi = {b: i for i, b in enumerate(BN)}
A = np.array([s[1] for s in SEG], float); B = np.array([s[2] for s in SEG], float)
# closest point on each segment
AB = B - A; t = np.clip(((V[:, None] - A[None]) * AB[None]).sum(2) / (AB * AB).sum(1)[None], 0, 1)
C = A[None] + t[..., None] * AB[None]; D = np.linalg.norm(V[:, None] - C, axis=2)
# visibility: samples from 0.8 cm inside the surface to the bone point must all be inside
nrm = m.vertex_normals
vis = np.zeros_like(D, bool)
for k in range(len(SEG)):
    cand = D[:, k] < D.min(1) * 2.5 + 1
    idx = np.where(cand)[0]
    s = np.linspace(0, 1, 24)[None, :, None]
    st = V[idx] - nrm[idx] * .8
    P = st[:, None] + (C[idx, k] - st)[:, None] * s
    vis[idx, k] = isin(P).mean(1) > .97
Dm = np.where(vis, D, np.inf)
print('invisible verts', np.isinf(Dm.min(1)).sum(), time.time() - t0)
Dm[np.isinf(Dm.min(1))] = D[np.isinf(Dm.min(1))]
# per weight-bone nearest (merge segments of the same bone)
Db = np.full((n, len(BN)), np.inf)
for k, s in enumerate(SEG): Db[:, bi[s[0]]] = np.minimum(Db[:, bi[s[0]]], Dm[:, k])
dmin = Db.min(1); near = Db <= dmin[:, None] * 1.0001
# ---- cotan Laplacian + lumped mass
def cot(a, b): return (a * b).sum(1) / np.maximum(np.linalg.norm(np.cross(a, b), axis=1), 1e-12)
I, Jx, W = [], [], []
for k in range(3):
    i0, i1, i2 = F[:, k], F[:, (k + 1) % 3], F[:, (k + 2) % 3]
    c = .5 * cot(V[i1] - V[i0], V[i2] - V[i0])        # angle at i0, opposite edge i1-i2
    I += [i1, i2]; Jx += [i2, i1]; W += [c, c]
Lc = sp.coo_matrix((np.concatenate(W), (np.concatenate(I), np.concatenate(Jx))), (n, n)).tocsr()
Lc = Lc - sp.diags(np.asarray(Lc.sum(1)).ravel())
area = m.area_faces; M = np.zeros(n)
for k in range(3): np.add.at(M, F[:, k], area / 3)
Hd = np.where(np.isfinite(dmin), 1.0 / np.maximum(dmin, .5) ** 2, 0) * near.sum(1).clip(1)
Asys = (-Lc + sp.diags(M * Hd)).tocsc()
lu = sla.splu(Asys)
Wt = np.zeros((n, len(BN)))
for j, b in enumerate(BN):
    p = near[:, j] / near.sum(1).clip(1)
    Wt[:, j] = lu.solve(M * Hd * p)
Wt = np.clip(Wt, 0, None); Wt /= Wt.sum(1, keepdims=True)
print('solved', time.time() - t0)
np.save('dense_V.npy', V); np.save('dense_F.npy', F); np.save('dense_W.npy', Wt); json.dump(BN, open('dense_BN.json', 'w'))
