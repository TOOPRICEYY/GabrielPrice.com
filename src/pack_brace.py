# Packs the Fusion "Assembled BRace" export (fusion_exports/brace: The kicker v22 + Hinge Mirrored v14 with thigh cuffs)
# into kicker_data.js, keeping the v20 key names so the existing linkage code drives it.
# The v22 assembly sits in a different CAD pose from v20, so parts are put back into the v20 pose here:
#   actuator bodies  -0.67° about x through the upper M8 pin (P_TOP)
#   shoe + lower pin -7.15° about the ankle axis (A_DEV); after this the lower bolt lands on CAP_PT to 0.002 cm
#   rail, rack, cap, die springs then slide -1.65 cm along the rail axis
# (angles and slide fitted by chamfer distance against the v20 meshes). Thigh-side hinge parts and cuffs are packed
# as their own groups in the same device frame; the page turns them about the CAD knee axis.
# Usage: python3 pack_brace.py <fusion_exports/brace dir>
import struct, json, base64, sys, numpy as np
src = sys.argv[1].rstrip('/') + '/'
man = json.load(open(src + 'manifest.json'))
KV, AA, PG = 'The kicker v22:1+', 'The kicker v22:1+Assembled Actuator v67:1+', 'Hinge Mirrored v14:1+'
HM = PG + 'Hinge v33(Mirror):1+'
P_TOP, A_DEV, U = np.array([0, 9.071, -6.593]), np.array([0, -16.058, -2.292]), np.array([0, .932, .364]) / np.linalg.norm([0, .932, .364])
def rotx(P, piv, deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a); Q = P - piv
    return np.stack([Q[:, 0], Q[:, 1] * c - Q[:, 2] * s, Q[:, 1] * s + Q[:, 2] * c], 1) + piv
def rotxn(N, deg):
    return rotx(N, np.zeros(3), deg)
ACT = lambda P, N: (rotx(P, P_TOP, -.67), rotxn(N, -.67))
RAIL = lambda P, N: (rotx(P, P_TOP, -.67) - U * 1.65, rotxn(N, -.67))
SHOE = lambda P, N: (rotx(P, A_DEV, -7.15), rotxn(N, -7.15))
keys = {
 'calf': [KV + 'Calf Component:1 Calf Component'], 'housing': [AA[:-1] + ' Body2'],
 'ring': [AA + 'PlanetGearSet v64:1 Ring Gear'], 'endcap': [AA + 'PlanetGearSet v64:1 End Cap'],
 'carriage': [AA + 'Carrier (moving):1 Carriage'], 'topcarriage': [AA + 'Carrier (moving):1 Top Carriage'],
 'sun': [AA + 'Sun (moving):1 Sun Gear'], 'motor': [AA + 'Tarot 5010 v4:1 Body1'],
 'rack': [AA + '2020 V-Slot Profile Extrusion v23:2+Rack v10:1 Body2'], 'rail': [AA + '2020 V-Slot Profile Extrusion v23:2+Extrusion:1 Extrusion'],
 'railcap': [AA + '2020 V-Slot Profile Extrusion v23:2 Cap'], 'shoe': [KV + 'Shoe Cup v40:1 Body1'],
 'pinTop': [KV + 'M8x55 Hex Bolt:1 M8x55 Hex Bolt', KV + 'M8 Hex Nut:1 M8 Hex Nut'], 'pinBot': [KV + 'M8x55 Hex Bolt:2 M8x55 Hex Bolt', KV + 'M8 Hex Nut:2 M8 Hex Nut'],
 'brg1': [KV + '608-2RS Bearing:1 ' + x for x in ('Outer Race', 'Inner Race', 'Seals')],
 'brg2': [KV + '608-2RS Bearing:2 ' + x for x in ('Outer Race', 'Inner Race', 'Seals')],
 'springs': [AA + 'Die Spring 5/8 OD x 3-1/2 Heavy (Red):%d Die Spring' % i for i in (1, 2)],
 'kneeShin': [HM + 'Tibia v6(Mirror):2 Body1', HM + 'Shin Side(Mirror):1 Outer Block', HM + 'Shin Side(Mirror):1 Outer Block (1)',
              PG + 'Hinge v33(Mirror):1 Inner Block (1)', HM + '45x55x6 Bearing v2(Mirror):1 Body1', HM + '45x55x6 Bearing v2(Mirror):2 Body1',
              HM + 'M5x40 Socket Head Cap Screw(Mirror):1 M5x40 Socket Head Cap Screw', HM + 'M5x40 Socket Head Cap Screw(Mirror):2 M5x40 Socket Head Cap Screw'],
 'kneeThigh': [HM + 'Femur v7(Mirror):1 Body1', HM + 'Thigh Side(Mirror):1 Inner Block',
               HM + 'M5x30 Socket Head Cap Screw(Mirror):1 M5x30 Socket Head Cap Screw', HM + 'M5x30 Socket Head Cap Screw(Mirror):2 M5x30 Socket Head Cap Screw'],
 'cuffs': [PG + 'Configuration 1 v38:1 Body10', PG + 'Configuration 1 v38:2 Body10'],
}
for i in range(1, 5):
    keys['planet%d' % i] = [AA + 'PlanetGear Stage 1 v16:%d Body1' % i]
    keys['spacer%d' % i] = [AA + 'PlanetGearSet v64:1+Spacer:1 Body%d' % i]
    keys['wheel%d' % i] = [AA + '80/20 slot rollers v1:%d Body1' % (i + 5)]
    keys['screw%d' % i] = [AA + 'M5x30 Socket Head Cap Screw:%d M5x30 SHCS' % i, AA + 'M5 Hex Nut:%d M5 Hex Nut' % i]
pose = {k: ACT for k in ['housing', 'ring', 'endcap', 'carriage', 'topcarriage', 'sun', 'motor'] + ['planet%d' % i for i in range(1, 5)] +
        ['spacer%d' % i for i in range(1, 5)] + ['wheel%d' % i for i in range(1, 5)] + ['screw%d' % i for i in range(1, 5)]}
pose.update({k: RAIL for k in ['rack', 'rail', 'railcap', 'springs']}); pose.update({k: SHOE for k in ['shoe', 'pinBot']})
byname = {b['name']: b for b in man['bodies']}
def load(nm):
    r = open(src + byname[nm]['file'], 'rb').read(); nv, nn, ni = struct.unpack('<3I', r[:12])
    return (np.frombuffer(r[12:12 + nv * 12], '<f4').reshape(-1, 3).astype(float), np.frombuffer(r[12 + nv * 12:12 + nv * 24], '<f4').reshape(-1, 3).astype(float),
            np.frombuffer(r[12 + nv * 24:12 + nv * 24 + ni * 4], '<u4').reshape(-1, 3))
def cluster(p, n, t, cell):
    # vertex-clustering decimation for the die springs (115k triangles each in Fusion)
    _, first, inv = np.unique(np.round(p / cell).astype(np.int64), axis=0, return_index=True, return_inverse=True); inv = inv.ravel()
    p2 = np.zeros((len(first), 3)); np.add.at(p2, inv, p); p2 /= np.bincount(inv)[:, None]
    n2 = np.zeros((len(first), 3)); np.add.at(n2, inv, n); n2 /= np.linalg.norm(n2, axis=1, keepdims=True) + 1e-12
    t2 = inv[t]; ok = (t2[:, 0] != t2[:, 1]) & (t2[:, 1] != t2[:, 2]) & (t2[:, 0] != t2[:, 2])
    t2 = t2[ok]; t2 = t2[np.sort(np.unique(np.sort(t2, 1), axis=0, return_index=True)[1])]
    return p2, n2, t2
used = set(); buf = bytearray(); out = []
for k, names in keys.items():
    P, N, I = [], [], []; off = 0
    for nm in names:
        p, n, t = load(nm); used.add(nm)
        if k == 'springs': p, n, t = cluster(p, n, t, .3)
        if k in pose: p, n = pose[k](p, n)
        P.append(p); N.append(n); I.append(t + off); off += len(p)
    p, n, idx = np.concatenate(P), np.concatenate(N), np.concatenate(I).ravel()
    nv = len(p); assert nv < 65536, (k, nv)
    n8 = np.concatenate([np.clip(np.round(n * 127), -127, 127).astype('i1'), np.zeros((nv, 1), 'i1')], 1)
    e = {'k': k, 'nv': nv, 'ni': len(idx)}
    while len(buf) % 4: buf.append(0)
    e['p'] = len(buf); buf += p.astype('<f4').tobytes()
    e['n'] = len(buf); buf += n8.tobytes()
    e['i'] = len(buf); buf += idx.astype('<u2').tobytes()
    e['c'] = [round(float(x), 3) for x in (p.min(0) + p.max(0)) / 2]
    out.append(e); print(k, nv, len(idx) // 3)
print('unused:', sorted(set(byname) - used))
open('kicker_data.js', 'w').write('window.KICKER_MAN=' + json.dumps(out) + ';\nwindow.KICKER_B64="' + base64.b64encode(bytes(buf)).decode() + '";\n')
print(len(buf), 'bytes')
