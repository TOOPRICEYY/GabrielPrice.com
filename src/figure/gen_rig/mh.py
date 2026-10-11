import json,base64,numpy as np
def mh(fn='/mnt/project-files/gabrielprice-site-photos/src/figure/figure_data_makehuman.js'):
    L=open(fn).read().split('\n'); man=json.loads(L[0][L[0].index('=')+1:].rstrip(';'))
    b=base64.b64decode(L[1][L[1].index('"')+1:L[1].rindex('"')])
    nv,nt=man['nv'],man['nt']; o=0
    P=np.frombuffer(b,np.float32,nv*3,o).reshape(-1,3); o+=nv*12
    I=np.frombuffer(b,np.uint16,nt*3,o).reshape(-1,3); o+=nt*6
    SI=np.frombuffer(b,np.uint8,nv*4,o).reshape(-1,4); o+=nv*4
    SW=np.frombuffer(b,np.uint8,nv*4,o).reshape(-1,4); o+=nv*4
    H=np.frombuffer(b,np.uint8,nt,o); o+=nt
    return man,P,I,SI,SW,H,len(b)-o
