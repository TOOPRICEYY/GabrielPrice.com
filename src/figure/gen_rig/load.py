import json, numpy as np
def load(fn):
    s=open(fn).read(); d=json.loads(s[s.index('=')+1:].rstrip().rstrip(';'))
    return np.array(d['p'],float).reshape(-1,3), np.array(d['i'],int).reshape(-1,3), d
