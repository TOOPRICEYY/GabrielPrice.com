# merge a measured round (fit_round.json) into the accumulated thigh fit, spread it over neighbours, write into main.html
import json,re,base64,numpy as np,os
src=open('/mnt/project-files/gabrielprice-site-photos/src/figure_data.js').read()
man=json.loads(re.search(r'window.FIGURE_MAN=(\{.*?\});',src,re.S).group(1));nv,nt=man['nv'],man['nt']
buf=base64.b64decode(re.search(r'window.FIGURE_B64="([^"]+)"',src).group(1))
T=np.frombuffer(buf,'<u2',nt*3,nv*12).reshape(-1,3).astype(int)
nbr=[set() for _ in range(nv)]
Q=np.stack([T[0::2,0],T[0::2,1],T[0::2,2],T[1::2,2]],1)
for q in Q:
    for k in range(4): nbr[q[k]].add(q[(k+1)%4]); nbr[q[(k+1)%4]].add(q[k])
accp='/tmp/claude-0/k/fit_acc.npy'
A=np.load(accp) if os.path.exists(accp) else np.zeros((nv,3))
R=np.zeros((nv,3))
for k,v in json.load(open('/tmp/claude-0/k/fit_round.json')).items(): R[int(k)]=v
D=R.copy()
for it in range(3):
    m=np.linalg.norm(D,axis=1); Dn=np.array([D[list(nbr[i])].mean(0)*.75 if nbr[i] else 0 for i in range(nv)])
    D=np.where((np.linalg.norm(Dn,axis=1)>m)[:,None],Dn,D)
A=A+D; np.save(accp,A)
nz=np.where(np.linalg.norm(A,axis=1)>1e-3)[0]; print('fit verts',len(nz),'max',np.linalg.norm(A,axis=1).max().round(2))
data=','.join(f'{i},{A[i,0]:.2f},{A[i,1]:.2f},{A[i,2]:.2f}' for i in nz)
mp='/mnt/project-files/gabrielprice-site-photos/src/main.html'; h=open(mp).read()
line=f'const THIGH_FIT = [{data}];'
if 'const THIGH_FIT' in h: h=re.sub(r'const THIGH_FIT = \[[^\]]*\];',line,h)
else:
    h=h.replace("let figureScale = 1, figureMesh = null, thighAxis = null;","let figureScale = 1, figureMesh = null, thighAxis = null;\n// per-vertex push (bind space, vertex index then xyz) that keeps the left thigh inside the brace cuffs; measured against\n// the cuff geometry over the walk, crutch, scooter and couch poses and spread one ring to neighbours so the skin eases in\n"+line)
    h=h.replace("    g.morphAttributes.position = [new THREE.BufferAttribute(d, 3)]; g.morphTargetsRelative = true;\n    thighAxis","    for (let j = 0; j < THIGH_FIT.length; j += 4) for (let c = 0; c < 3; c++) d[THIGH_FIT[j] * 3 + c] += THIGH_FIT[j + 1 + c];\n    g.morphAttributes.position = [new THREE.BufferAttribute(d, 3)]; g.morphTargetsRelative = true;\n    thighAxis")
open(mp,'w').write(h); print('THIGH_FIT' in h, h.count('THIGH_FIT'))
