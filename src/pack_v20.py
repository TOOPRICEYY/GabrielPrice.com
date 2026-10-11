# Packs the Fusion v20 per-body export (kicker_export_v20/*.bin, world coords, cm) into kicker_data.js.
# Usage: python3 pack_v20.py <export dir>
import struct, glob, json, base64, sys, numpy as np
src = sys.argv[1].rstrip('/') + '/'
A = 'Assembled_Actuator_v64_1_'
keys = {'calf': ['Calf_Component_1_Calf_Component'], 'housing': [A + 'Body2'],
 'ring': [A + 'PlanetGearSet_v64_1_Ring_Gear'], 'endcap': [A + 'PlanetGearSet_v64_1_End_Cap'],
 'carriage': [A + 'Carrier_moving_1_Carriage'], 'topcarriage': [A + 'Carrier_moving_1_Top_Carriage'],
 'sun': [A + 'Sun_moving_1_Sun_Gear'], 'motor': [A + 'Tarot_5010_v4_1_Body1'],
 'rack': [A + '2020_V_Slot_Profile_Extrusion_v23_2_Rack_v10_1_Body2'], 'rail': [A + '2020_V_Slot_Profile_Extrusion_v23_2_Extrusion_1_Extrusion'],
 'railcap': [A + '2020_V_Slot_Profile_Extrusion_v23_2_Cap'], 'shoe': ['Shoe_Cup_v40_1_Body1'],
 'pinTop': ['M8x55_Hex_Bolt_1_M8x55_Hex_Bolt', 'M8_Hex_Nut_1_M8_Hex_Nut'], 'pinBot': ['M8x55_Hex_Bolt_2_M8x55_Hex_Bolt', 'M8_Hex_Nut_2_M8_Hex_Nut'],
 'brg1': ['608_2RS_Bearing_1_Outer_Race', '608_2RS_Bearing_1_Inner_Race', '608_2RS_Bearing_1_Seals'],
 'brg2': ['608_2RS_Bearing_2_Outer_Race', '608_2RS_Bearing_2_Inner_Race', '608_2RS_Bearing_2_Seals']}
for i in range(1, 5):
    keys['planet%d' % i] = [A + 'PlanetGear_Stage_1_v16_%d_Body1' % i]
    keys['spacer%d' % i] = [A + 'PlanetGearSet_v64_1_Spacer_1_Body%d' % i]
    keys['wheel%d' % i] = [A + '80_20_slot_rollers_v1_%d_Body1' % (i + 5)]
    keys['screw%d' % i] = [A + 'M5x30_Socket_Head_Cap_Screw_%d_M5x30_SHCS' % i, A + 'M5_Hex_Nut_%d_M5_Hex_Nut' % i]
used = set(); buf = bytearray(); man = []
for k, names in keys.items():
    P, N, I = [], [], []; off = 0
    for nm in names:
        d = open(src + nm + '.bin', 'rb').read(); used.add(nm)
        nv, nn, ni = struct.unpack('<3I', d[:12]); assert nv == nn
        P.append(np.frombuffer(d[12:12 + nv * 12], '<f4').reshape(-1, 3))
        N.append(np.frombuffer(d[12 + nv * 12:12 + nv * 24], '<f4').reshape(-1, 3))
        I.append(np.frombuffer(d[12 + nv * 24:12 + nv * 24 + ni * 4], '<u4') + off); off += nv
    p, n, idx = np.concatenate(P), np.concatenate(N), np.concatenate(I)
    nv = len(p); assert nv < 65536, (k, nv)
    n8 = np.concatenate([np.clip(np.round(n * 127), -127, 127).astype('i1'), np.zeros((nv, 1), 'i1')], 1)
    ent = {'k': k, 'nv': nv, 'ni': len(idx)}
    while len(buf) % 4: buf.append(0)
    ent['p'] = len(buf); buf += p.astype('<f4').tobytes()
    ent['n'] = len(buf); buf += n8.tobytes()
    ent['i'] = len(buf); buf += idx.astype('<u2').tobytes()
    ent['c'] = [round(float(x), 3) for x in (p.min(0) + p.max(0)) / 2]
    man.append(ent)
left = {f.split('/')[-1][:-4] for f in glob.glob(src + '*.bin')} - used
print('unused bodies:', sorted(left))
open('kicker_data.js', 'w').write('window.KICKER_MAN=' + json.dumps(man) + ';\nwindow.KICKER_B64="' + base64.b64encode(bytes(buf)).decode() + '";\n')
print(len(buf), 'bytes,', sum(e['ni'] for e in man) // 3, 'tris')
