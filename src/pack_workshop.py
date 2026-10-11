# Packs the Fusion exports for the workshop section (fusion_exports/<slug>/*.bin, world coords, cm) into workshop_data.js.
# Usage: python3 pack_workshop.py <fusion_exports dir>
# Each model is split into named groups (by body-name prefix) so the page can move them about their Fusion joints.
import struct, json, base64, sys, glob, numpy as np
src = sys.argv[1].rstrip('/') + '/'
MODELS = {
 'turret4': {'base': ['Body4', 'Body1 (1)'], 'pan': ['Body1:1'], 'laser': ['Body1 (2)']},
 'couchhub': {'ring': ['']},
 # split by material class (from the Fusion appearance) so each part can keep its own finish
 # one group per Fusion component, so the exploded view can pull each one out on its own
 'scooter6': {'frame': ['Scooter Frame'], 'mount': ['Pulley Assembly'], 'battery': ['Battery Pack'], 'motor': ['C6374'], 'mpulley': ['Motor Pulley'],
              'belt': ['HTD-3M Belt'], 'kneepad': ['Knee Pad'], 'column': ['Steering Column'], 'basket': ['Basket Bag'], 'fork': ['Front Fork'],
              'wRL': ['Wheel 8in Solid:1 '], 'wRR': ['Wheel 8in Solid:2 '], 'wpulley': ['Assembly v19'], 'wFL': ['Wheel 8in Solid:3 '], 'wFR': ['Wheel 8in Solid:4 ']},
 'waterbreak': {'cage': ['Body9'], 'base': ['Body1']},
 # Assym Restore v7 (exported to assym_latest): pan servo in the base, pitch servo + horn + push rod tilting the laser, ESP32-CAM
 'assym': {'shade': ['Shade'], 'cap': ['Cap'], 'servoHousing': ['Servo housing:1 Body1'], 'servo': ['Servo housing:1+9g'],
           'laserHousing': ['Laser housing:1 Body1'], 'laser': ['Laser housing:1+Laser'], 'base': ['BASED:1 BASED'], 'speaker': ['BASED:1+3W'],
           'panServo': ['MG996R'], 'horn': ['Pitch Servo Horn'], 'rod': ['Pitch Push Rod'], 'cam': ['ESP32-CAM']},
}
SPLIT = {'scooter6'}
SHOW_HIDDEN = {'assym'}
DIRS = {'assym': 'assym_latest'}      # slug -> export folder
def mclass(c):
    for k, v in (('Rubber', 'rubber'), ('Aluminum', 'alu'), ('Paint', 'paint'), ('Plastic', 'plastic')):
        if c.startswith(k): return v
    return 'print'
def load(d, f):
    r = open(d + f, 'rb').read(); nv, nn, ni = struct.unpack('<3I', r[:12])
    return (np.frombuffer(r[12:12 + nv * 12], '<f4').reshape(-1, 3), np.frombuffer(r[12 + nv * 12:12 + nv * 24], '<f4').reshape(-1, 3),
            np.frombuffer(r[12 + nv * 24:12 + nv * 24 + ni * 4], '<u4').reshape(-1, 3))
def cluster(p, n, t, cell):
    # vertex-clustering decimation: snap to a grid, merge, drop collapsed triangles, recompute flat-ish normals
    key = np.round(p / cell).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.ravel(); p2 = np.zeros((len(first), 3)); np.add.at(p2, inv, p); p2 /= np.bincount(inv)[:, None]
    t2 = inv[t]; ok = (t2[:, 0] != t2[:, 1]) & (t2[:, 1] != t2[:, 2]) & (t2[:, 0] != t2[:, 2]); t2 = t2[ok]
    t2 = t2[np.sort(np.unique(np.sort(t2, 1), axis=0, return_index=True)[1])]
    # split per face so cut faces stay crisp (gear teeth read better faceted)
    P = p2[t2].reshape(-1, 3); fn = np.cross(P[1::3] - P[0::3], P[2::3] - P[0::3]); fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12
    return P.astype('<f4'), np.repeat(fn, 3, 0), np.arange(len(P)).reshape(-1, 3)
buf = bytearray(); out = {}
for slug, groups in MODELS.items():
    d = src + DIRS.get(slug, slug) + '/'; man = json.load(open(d + 'manifest.json'))
    taken = set(); ents = []
    for k, prefs in groups.items():
      sel = [b for b in man['bodies'] if b['file'] not in taken and any(b['name'].startswith(x) for x in prefs) and (b.get('vis', True) or slug in SHOW_HIDDEN)]
      classes = sorted({mclass(b['color']) for b in sel}) if slug in SPLIT else [None]
      for mc in classes:
        P, N, I = [], [], []; off = 0
        for b in sel:
            if mc and mclass(b['color']) != mc: continue
            taken.add(b['file']); p, n, t = load(d, b['file'])
            if slug == 'couchhub': p, n, t = cluster(p, n, t, 0.3)
            P.append(p); N.append(n); I.append(t + off); off += len(p)
        p, n, t = np.concatenate(P), np.concatenate(N), np.concatenate(I).ravel()
        nv = len(p); idx16 = nv < 65536
        n8 = np.concatenate([np.clip(np.round(n * 127), -127, 127).astype('i1'), np.zeros((nv, 1), 'i1')], 1)
        e = {'k': k, 'nv': nv, 'ni': len(t), 'w': 2 if idx16 else 4}
        if mc: e['m'] = mc
        while len(buf) % 4: buf.append(0)
        e['p'] = len(buf); buf += p.astype('<f4').tobytes()
        e['n'] = len(buf); buf += n8.tobytes()
        e['i'] = len(buf); buf += t.astype('<u2' if idx16 else '<u4').tobytes()
        ents.append(e)
    left = [b['name'] for b in man['bodies'] if b['file'] not in taken and (b.get('vis', True) or slug in SHOW_HIDDEN)]
    print(slug, [(e['k'], e['ni'] // 3) for e in ents], 'unused:', left)
    out[slug] = {'parts': ents, 'joints': [j for j in man['joints'] if 'origin' in j]}
open('workshop_data.js', 'w').write('window.WS_MAN=' + json.dumps(out) + ';\nwindow.WS_B64="' + base64.b64encode(bytes(buf)).decode() + '";\n')
print(len(buf), 'bytes')
