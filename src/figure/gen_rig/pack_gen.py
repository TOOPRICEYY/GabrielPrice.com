# Packs Gabriel's generated body (1,500 tris) as window.FIGURE_MAN / FIGURE_B64 in the site's figure format:
# MakeHuman bone names/hierarchy refitted to this body, bone-heat weights, flat facets (vertices unshared per triangle).
import numpy as np, json, base64, trimesh, sys
from load import load
from skel import J, NAMES, PAR, HEADS, TAILS, MH, HANDS
V0, F0, _ = load(sys.argv[1] if len(sys.argv) > 1 else '../../ref/gen_1500.js')
out = sys.argv[2] if len(sys.argv) > 2 else 'figure_data_gen.js'
m = trimesh.Trimesh(V0, F0, process=False)
# drop the generator's stray two-triangle slivers
comp = trimesh.graph.connected_component_labels(m.face_adjacency, node_count=len(F0))
big = np.bincount(comp).argmax(); F0 = F0[comp == big]
# dense weights → low-poly vertices: barycentric on the closest dense triangle
dV = np.load('dense_V.npy'); dF = np.load('dense_F.npy'); dW = np.load('dense_W.npy'); BN = json.load(open('dense_BN.json'))
dm = trimesh.Trimesh(dV, dF, process=False)
used = np.unique(F0); P = V0[used]
cp, dist, tri = trimesh.proximity.closest_point(dm, P)
bc = trimesh.triangles.points_to_barycentric(dV[dF[tri]], cp)
Wl = (dW[dF[tri]] * bc[:, :, None]).sum(1)
print('max dist to dense surface %.2f cm' % dist.max())
Wfull = np.zeros((len(V0), len(NAMES)))
ni = {n: i for i, n in enumerate(NAMES)}
for j, b in enumerate(BN): Wfull[used, ni[b]] = Wl[:, j]
# forearm twist: the far part of the forearm rides lowerarm02 (grasp turns that bone to pronate / supinate)
for s in 'LR':
    e, w = J['lowerarm01.' + s], J['wrist.' + s]; d = w - e; t = ((V0 - e) @ d) / (d @ d)
    k = np.clip((t - .2) / .6, 0, 1); k = k * k * (3 - 2 * k)
    a = ni['lowerarm01.' + s]; b = ni['lowerarm02.' + s]
    Wfull[:, b] += Wfull[:, a] * k; Wfull[:, a] *= 1 - k
# cut the solid fists off below the wrist and append the jointed hands (hand.py)
keep = np.ones(len(F0), bool)
for sd in 'LR':
    e, w = J['lowerarm01.' + sd], J['wrist.' + sd]; d = (w - e) / np.linalg.norm(w - e)
    t = ((V0[F0].mean(1) - w) @ d); near = np.linalg.norm(V0[F0].mean(1) - w, axis=1) < 16
    tmax = ((V0[F0] - w) @ d).max(1)
    # only the fist itself: every corner must ride this arm's forearm / hand bones, so the hip beside the hanging hand stays
    arm = [i for n, i in ni.items() if n.endswith('.' + sd) and n.split('.')[0].startswith(('lowerarm', 'wrist', 'finger', 'metacarpal'))]
    armw = Wfull[:, arm].sum(1)[F0].min(1) > .5
    cut = near & (tmax > 0.4); print(sd, 'fist tris cut', (cut & armw).sum(), 'spared (body)', (cut & ~armw).sum())
    keep &= ~(cut & armw)
F0 = F0[keep]
ni = {n: i for i, n in enumerate(NAMES)}
for sd in 'LR':
    hv, hf, hw, _ = HANDS[sd]; base = len(V0)
    V0 = np.vstack([V0, hv]); F0 = np.vstack([F0, hf + base])
    Wh = np.zeros((len(hv), len(NAMES)))
    for i, wt in enumerate(hw):
        for b, x in wt.items(): Wh[i, ni[b]] = x
    Wfull = np.vstack([Wfull, Wh])
# top 4 influences, u8
order = np.argsort(-Wfull, 1)[:, :4]; top = np.take_along_axis(Wfull, order, 1)
top[top < .02] = 0; top /= top.sum(1, keepdims=True).clip(1e-9)
q = np.floor(top * 255 + .5).astype(int); q[:, 0] += 255 - q.sum(1)
# unshare per triangle (flat facets)
nt = len(F0); pos = V0[F0.ravel()].astype(np.float32); nv = len(pos)
si = order[F0.ravel()].astype(np.uint8); sw = q[F0.ravel()].astype(np.uint8)
si[sw == 0] = 0
idx = np.arange(nv, dtype=np.uint16)
hide = np.full(nt, 7, np.uint8)            # no wire lines: Gabriel's figure shows its facets, not a quad cage
blob = pos.tobytes() + idx.tobytes() + si.tobytes() + sw.tobytes() + hide.tobytes()
# rest-pose fix: the site's poses were authored on MakeHuman's rest (elbows bent ~47° forward, knees ~6°). For each limb's lower bone,
# D turns this body's rest direction onto the one MakeHuman's would have once the chain correction C is applied (see main.html corr).
def qfrom(a, b):  # three.js setFromUnitVectors
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); r = a @ b + 1
    if r < 1e-6: v = np.array([-a[1], a[0], 0]) if abs(a[0]) > abs(a[2]) else np.array([0, -a[2], a[1]]); w = 0
    else: v = np.cross(a, b); w = r
    q = np.array([*v, w]); return q / np.linalg.norm(q)
def qrot(q, v):
    u = q[:3]; w = q[3]; return v + 2 * np.cross(u, np.cross(u, v) + w * v)
def qinv(q): return np.array([-q[0], -q[1], -q[2], q[3]])
fix = {}
for up, lo, end, canon in [('upperarm01.L', 'lowerarm01.L', 'wrist.L', [1, 0, 0]), ('upperarm01.R', 'lowerarm01.R', 'wrist.R', [-1, 0, 0]),
                           ('upperleg01.L', 'lowerleg01.L', 'foot.L', [0, -1, 0]), ('upperleg01.R', 'lowerleg01.R', 'foot.R', [0, -1, 0])]:
    canon = np.array(canon, float)
    Cg = qfrom(J[lo] - J[up], canon); Cm = qfrom(MH[lo] - MH[up], canon)
    t = qrot(qinv(Cg), qrot(Cm, MH[end] - MH[lo]))
    D = qfrom(J[end] - J[lo], t); fix[lo] = [round(float(x), 6) for x in D]
    print(lo, 'rest fix %.1f°' % np.degrees(2 * np.arccos(min(1, abs(D[3])))))
# thigh axis for the brace cuffs (main.html centres them on it): area centres of true cross-sections at 24% and 61% of the way
# knee → hip, relative to the hip joint. The page's own estimate averages vertices, which a 1,500-tri mesh skews by several cm.
from scipy.spatial import ConvexHull
Hh = J['upperleg01.L']; Kk = J['lowerleg01.L']; ax = Hh - Kk; Lt = np.linalg.norm(ax); ax /= Lt
uu = np.array([1., 0, 0]); uu -= ax * (uu @ ax); uu /= np.linalg.norm(uu); ww = np.cross(ax, uu); thigh = {}
for key, tt in (('a', .24), ('b', .61)):
    p = Kk + ax * Lt * tt; P = np.vstack(m.section(ax, p).discrete); P = P[(P[:, 0] > 1.5) & (np.linalg.norm(P - p, axis=1) < 14)]
    q = np.c_[(P - p) @ uu, (P - p) @ ww]; poly = q[ConvexHull(q).vertices]; x, y = poly[:, 0], poly[:, 1]
    a = x * np.roll(y, -1) - np.roll(x, -1) * y; A = a.sum() / 2
    c = p + uu * ((x + np.roll(x, -1)) * a).sum() / (6 * A) + ww * ((y + np.roll(y, -1)) * a).sum() / (6 * A)
    thigh[key] = [round(float(v), 3) for v in c - Hh]
print('thighAxis', thigh)
man = {'nv': nv, 'thighAxis': thigh, 'cuffScale': float(sys.argv[3]) if len(sys.argv) > 3 else 1.0, 'cuffTilt': [float(sys.argv[4]), float(sys.argv[5])] if len(sys.argv) > 5 else None, 'nt': nt, 'bones': [[n, p, [round(float(x), 3) for x in J[n]]] for n, p in zip(NAMES, PAR)],
       'tails': {k: [round(float(x), 3) for x in v] for k, v in TAILS.items()}, 'quads': False, 'exact': True, 'restFix': fix,
       'source': 'Gabriel image-to-3D body, 1,500 tris (src/figure/replica/generated); rigged by src/figure/gen_rig/'}
open(out, 'w').write('window.FIGURE_MAN=' + json.dumps(man) + ';\nwindow.FIGURE_B64="' + base64.b64encode(blob).decode() + '";\n')
print(out, nv, nt, len(blob))
