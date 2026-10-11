# Site skeleton (MakeHuman bone names/hierarchy) refitted to Gabriel's generated mesh (gen coords: cm, floor 0, front +z, figure's left +x)
import numpy as np
from mh import mh
man = mh()[0]
NAMES = [b[0] for b in man['bones']]; PAR = [b[1] for b in man['bones']]
MH = {b[0]: np.array(b[2]) for b in man['bones']}
def lerp(a, b, t): return np.asarray(a) + (np.asarray(b) - np.asarray(a)) * t
J = {}
# spine: MH heights mapped piecewise onto landmarks (hip joint, shoulder joint, neck base, skull base); depth = back surface + ~6 cm
mhY = [10.035, 56.075, 66.538, 76.201]; gY = [87.0, 135.5, 145.5, 154.5]
spineZ = [(84, -2.0), (90, -1.3), (98, 0.1), (106, 1.0), (114, -0.3), (122, -2.0), (130, -3.2), (138, -2.4), (146, 1.2), (150, 2.4), (156, 2.6)]
zy = lambda y: np.interp(y, [a for a, _ in spineZ], [b for _, b in spineZ])
for n in ['spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head']:
    y = float(np.interp(MH[n][1], mhY, gY)); J[n] = np.array([0, y, zy(y)])
J['root'] = J['spine05'] + np.array([0, -1.0, -7.4])
for sd, s in (('L', 1), ('R', -1)):
    X = lambda p: np.array([p[0] * s, p[1], p[2]])
    J['pelvis.' + sd] = J['spine05'].copy()
    hip, knee, ank = X([9.6, 87.0, 0.8]), X([11.9, 48.5, -1.8]), X([13.85, 9.0, -7.0])
    J['upperleg01.' + sd] = hip; J['upperleg02.' + sd] = lerp(hip, knee, .2)
    J['lowerleg01.' + sd] = knee; J['lowerleg02.' + sd] = lerp(knee, ank, .5); J['foot.' + sd] = ank
    sh, el, wr = X([20.0, 135.5, 0.0]), X([25.8, 109.0, -2.0]), X([27.4, 90.5, 1.3])
    J['clavicle.' + sd] = X([2.3, 140.5, 3.0]); J['shoulder01.' + sd] = X([11.0, 142.0, 0.5])
    J['upperarm01.' + sd] = sh; J['upperarm02.' + sd] = lerp(sh, el, .25)
    J['lowerarm01.' + sd] = el; J['lowerarm02.' + sd] = lerp(el, wr, .5); J['wrist.' + sd] = wr
# hands: faceted hands with jointed fingers replace the generated model's solid fists (hand.py); the finger bones sit on their joints
import hand
TAILS = {}; HANDS = {}
for sd in 'LR':
    hv, hf, hw, heads, tails, frame = hand.build(J['wrist.' + sd], J['wrist.' + sd] - J['lowerarm01.' + sd], sd)
    J.update(heads); TAILS.update(tails); HANDS[sd] = (hv, hf, hw, frame)
assert set(J) == set(NAMES), set(NAMES) ^ set(J)
HEADS = np.array([J[n] for n in NAMES])
