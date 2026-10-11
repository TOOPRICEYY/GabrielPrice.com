# Faceted low-poly hand with jointed fingers, built in the arm's rest pose (hanging, palm toward the thigh, thumb forward).
# Returns geometry, per-vertex bone weights and the finger bone heads/tails in the site's MakeHuman naming.
import numpy as np
def nz(v): v = np.asarray(v, float); return v / np.linalg.norm(v)
def ring(c, u, w, a, b, n=6, ph=0.0, ch=0.0):
    if ch:  # chamfered rectangle (8 points): flat faces on all four sides
        pts = [(a, b*(1-ch)), (a*(1-ch), b), (-a*(1-ch), b), (-a, b*(1-ch)), (-a, -b*(1-ch)), (-a*(1-ch), -b), (a*(1-ch), -b), (a, -b*(1-ch))]
        return [c + u*x + w*z for x, z in pts]
    return [c + u*a*np.cos(ph + 2*np.pi*j/n) + w*b*np.sin(ph + 2*np.pi*j/n) for j in range(n)]
class Mesh:
    def __init__(s): s.V = []; s.F = []; s.W = []
    def add(s, p, wt): s.V.append(np.asarray(p, float)); s.W.append(wt); return len(s.V) - 1
    def loft(s, rings, wts, cap0=None, cap1=None):
        """rings: list of point lists (same count); wts: per-ring weight dict; caps: (tip point, weight) or None"""
        R = [[s.add(p, wts[i]) for p in r] for i, r in enumerate(rings)]; m = len(R[0])
        cen = [np.mean(r, 0) for r in rings]
        for i in range(len(R) - 1):
            mid = (cen[i] + cen[i+1]) / 2
            for j in range(m):
                a, b, c, d = R[i][j], R[i][(j+1) % m], R[i+1][(j+1) % m], R[i+1][j]
                for t in ((a, b, c), (a, c, d)) if (i + j) % 2 else ((a, b, d), (b, c, d)): s.tri(t, mid)
        for k, cap in ((0, cap0), (len(R) - 1, cap1)):
            if cap is None: continue
            tip = s.add(cap[0], cap[1]); ctr = cen[k] - (cen[1] - cen[0] if k == 0 else cen[-1] - cen[-2]) * 0.0
            for j in range(m): s.tri((R[k][j], R[k][(j+1) % m], tip), cen[k] + (cen[k] - cen[1 if k == 0 else -2]) * -1)
    def tri(s, t, inside):
        A, B, C = (s.V[i] for i in t); n = np.cross(B - A, C - A)
        s.F.append(t if n @ ((A + B + C) / 3 - inside) >= 0 else (t[0], t[2], t[1]))
def build(W, f_dir, sd):
    """W: wrist joint; f_dir: forearm direction (elbow→wrist); sd: 'L' or 'R'. Hand frame: f down the hand, a across toward the
    index/thumb (front, +z), n out of the palm (toward the thigh)."""
    s = 1 if sd == 'L' else -1
    f = nz(f_dir); a = nz(np.array([0, 0, 1.]) - f * f[2]); n = np.cross(f, a) if s == 1 else np.cross(a, f); n = nz(n)
    P = lambda t, x, y: W + f*t + a*x + n*y          # t along the hand, x across (index +), y out of the palm
    M = Mesh(); wr = 'wrist.' + sd
    one = lambda b: {b: 1.0}
    mix = lambda b0, b1, k=.5: {b0: 1 - k, b1: k}
    # palm: from inside the wrist to the knuckles; chamfered block, a touch thicker at the heel of the hand
    palm = [(-1.6, 3.1, 2.7, 0.0), (-.2, 3.3, 2.2, 0.0), (1.5, 3.6, 1.75, .1), (5.0, 4.2, 1.55, .15), (8.6, 4.3, 1.35, .1), (9.9, 4.0, 1.1, 0.0)]
    M.loft([ring(P(t, cx, .1), a, n, hw, ht, ch=.38) for t, hw, ht, cx in palm], [one(wr)] * len(palm), (P(-1.6, 0, 0), one(wr)), (P(10.3, 0, 0), one(wr)))
    heads = {}; tails = {}
    # fingers: MCP knuckle (x across, t), segment lengths, radius
    fing = {2: (2.95, 9.6, [4.3, 2.6, 2.1], .98), 3: (.95, 9.9, [4.7, 2.9, 2.2], 1.02), 4: (-1.05, 9.6, [4.4, 2.7, 2.1], .96), 5: (-2.95, 9.0, [3.5, 2.1, 1.9], .84)}
    for fi, (x, t0, L, r) in fing.items():
        b = [f'finger{fi}-{k}.{sd}' for k in (1, 2, 3)]
        j0 = P(t0, x, 0); dirn = nz(f + a * (x * .012))       # fingers fan out a little
        j1 = j0 + dirn * L[0]; j2 = j1 + dirn * L[1]; tip = j2 + dirn * L[2]
        heads[b[0]], heads[b[1]], heads[b[2]] = j0, j1, j2; tails[b[0]], tails[b[1]], tails[b[2]] = j1, j2, tip
        u = a; w = n
        # flat-sided, wider than deep, tapering to the tip with slight knuckle swells, so a finger reads as bone and joint
        rs = [(j0 - dirn * 1.6, r * 1.08, one(wr)), (j0, r * 1.06, mix(wr, b[0])), (j0 + dirn * L[0] * .5, r * .86, one(b[0])), (j1, r * .88, mix(b[0], b[1])),
              (j1 + dirn * L[1] * .5, r * .74, one(b[1])), (j2, r * .76, mix(b[1], b[2])), (j2 + dirn * L[2] * .5, r * .66, one(b[2])), (tip - dirn * .35, r * .56, one(b[2]))]
        M.loft([ring(c, u, w, rr, rr * .7, ch=.42) for c, rr, _ in rs], [wt for *_, wt in rs], None, (tip + w * .08, one(b[2])))
    # thumb: CMC near the heel of the hand on the index side, angled across the palm and forward
    b = [f'finger1-{k}.{sd}' for k in (1, 2, 3)]
    c0 = P(2.2, 3.2, .9); d1 = nz(f * .8 + a * .38 + n * .46); d2 = nz(f * .92 + a * .12 + n * .38)
    j1 = c0 + d1 * 4.4; j2 = j1 + d2 * 3.1; tip = j2 + d2 * 2.6
    heads[b[0]], heads[b[1]], heads[b[2]] = c0, j1, j2; tails[b[0]], tails[b[1]], tails[b[2]] = j1, j2, tip
    u = nz(np.cross(d2, n)); w = nz(np.cross(u, d2))
    rs = [(c0, 1.45, mix(wr, b[0], .7)), (c0 + d1 * 2.2, 1.3, one(b[0])), (j1, 1.12, mix(b[0], b[1])), (j1 + d2 * 1.55, .98, one(b[1])),
          (j2, .96, mix(b[1], b[2])), (j2 + d2 * 1.3, .84, one(b[2])), (tip - d2 * .35, .7, one(b[2]))]
    M.loft([ring(c, u, w, rr, rr * .72, ch=.42) for c, rr, _ in rs], [wt for *_, wt in rs], (c0 - d1 * .6, one(wr)), (tip, one(b[2])))
    return np.array(M.V), np.array(M.F), M.W, heads, tails, dict(f=f, a=a, n=n)
