# Packs the gallery projects' Fusion exports (fusion_exports/<slug>/*.bin, cm) into gallery_data.js, one part per visible body.
# Usage: python3 pack_gallery.py <fusion_exports dir>
import struct, json, base64, sys, numpy as np
src = sys.argv[1].rstrip('/') + '/'
# slug -> export folder, up axis in Fusion coords ('y' or 'z')
MODELS = {'sidetable': ('sidetable', 'y'), 'gauge': ('gauge2', 'z'), 'flyingbike': ('flyingbike', 'z')}
def load(d, f):
    r = open(d + f, 'rb').read(); nv, nn, ni = struct.unpack('<3I', r[:12])
    return (np.frombuffer(r[12:12 + nv * 12], '<f4').reshape(-1, 3), np.frombuffer(r[12 + nv * 12:12 + nv * 24], '<f4').reshape(-1, 3),
            np.frombuffer(r[12 + nv * 24:12 + nv * 24 + ni * 4], '<u4').reshape(-1, 3))
buf = bytearray(); out = {}
for slug, (folder, up) in MODELS.items():
    d = src + folder + '/'; man = json.load(open(d + 'manifest.json')); ents = []
    seen = set()
    for b in man['bodies']:
        if not b.get('vis', True): continue
        sig = (b['tris'], tuple(round(x, 2) for x in b['bb']))
        if sig in seen: continue          # the side table has a second copy of one side plate in the same place
        seen.add(sig)
        p, n, t = load(d, b['file'])
        if up == 'z': p = p[:, [0, 2, 1]] * [1, 1, -1]; n = n[:, [0, 2, 1]] * [1, 1, -1]   # Fusion Z-up -> three.js Y-up
        t = t.ravel(); nv = len(p)
        n8 = np.concatenate([np.clip(np.round(n * 127), -127, 127).astype('i1'), np.zeros((nv, 1), 'i1')], 1)
        e = {'k': b['name'], 'm': b['color'], 'nv': nv, 'ni': len(t)}
        while len(buf) % 4: buf.append(0)
        e['p'] = len(buf); buf += p.astype('<f4').tobytes()
        e['n'] = len(buf); buf += n8.tobytes()
        e['i'] = len(buf); buf += t.astype('<u2').tobytes()
        ents.append(e)
    out[slug] = {'doc': man['doc'], 'parts': ents}
    print(slug, man['doc'], len(ents), 'parts')
open('gallery_data.js', 'w').write('window.GAL_MAN=' + json.dumps(out) + ';\nwindow.GAL_B64="' + base64.b64encode(bytes(buf)).decode() + '";\n')
print(len(buf), 'bytes')
