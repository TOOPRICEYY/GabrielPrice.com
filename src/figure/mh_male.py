# MakeHuman base mesh -> male, smoothed "dummy" body. Stage 1 (before decimation).
import json, numpy as np, sys
V=[]; faces=[]; grp=None
for line in open('mh_base.obj'):
    if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('g '): grp=line.split()[1]
    elif line.startswith('f ') and grp=='body':
        faces.append([int(t.split('/')[0])-1 for t in line.split()[1:]])
V=np.array(V)
def apply(fn, w):
    for line in open(fn):
        if line.startswith('#') or not line.strip(): continue
        p=line.split(); V[int(p[0])]+=w*np.array([float(x) for x in p[1:4]])
MUSCLE=float(sys.argv[1]) if len(sys.argv)>1 else 0.35
for r in ['caucasian','african','asian']: apply(f'{r}-male-young.target', 1/3)
apply('universal-male-young-maxmuscle-averageweight.target' if MUSCLE >= 0 else 'universal-male-young-minmuscle-averageweight.target', abs(MUSCLE))
skel=json.load(open('default.mhskel')); W=json.load(open('default_weights.mhw'))['weights']
J={k:V[v].mean(0) for k,v in skel['joints'].items()}
bones=skel['bones']
KEEP=['root','spine05','spine04','spine03','spine02','spine01','neck01','neck02','neck03','head']
for sd in 'LR':
    KEEP+= [f'{b}.{sd}' for b in ['clavicle','shoulder01','upperarm01','upperarm02','lowerarm01','lowerarm02','wrist','pelvis','upperleg01','upperleg02','lowerleg01','lowerleg02','foot']]
def kept(b):
    while b not in KEEP: b=bones[b]['parent']
    return b
used=sorted({i for f in faces for i in f}); remap={o:n for n,o in enumerate(used)}
P=V[used]*10.0
nv=len(used)
acc=[dict() for _ in range(nv)]
for b,lst in W.items():
    bi=KEEP.index(kept(b))
    for vi,w in lst:
        if vi in remap: d=acc[remap[vi]]; d[bi]=d.get(bi,0)+w
tris=[]
for f in faces:
    f=[remap[i] for i in f]
    for k in range(1,len(f)-1): tris.append([f[0],f[k],f[k+1]])
tris=np.array(tris,np.int64)
# smoothing weight per vertex: strong on head/hands/feet (removes face, fingers, toes detail), mild elsewhere
extra=np.zeros(nv)
heavy={KEEP.index(b) for b in ['head','neck03','wrist.L','wrist.R','foot.L','foot.R']}
for i,d in enumerate(acc):
    s=sum(d.values()) or 1; extra[i]=sum(w for b,w in d.items() if b in heavy)/s
nbr=[set() for _ in range(nv)]
for a,b,c in tris: nbr[a]|={b,c}; nbr[b]|={a,c}; nbr[c]|={a,b}
nbr=[np.array(sorted(n)) for n in nbr]
def lap(X):
    return np.array([X[n].mean(0) for n in nbr])-X
lam=0.5*(0.35+0.65*extra)[:,None]; mu=-0.53*(0.35+0.65*extra)[:,None]
for it in range(int(sys.argv[2]) if len(sys.argv)>2 else 22):
    P=P+lam*lap(P); P=P+mu*lap(P)
# extra passes only where detail reads as anatomy (face, fingers, toes)
lh=0.5*extra[:,None]; mh=-0.53*extra[:,None]
for it in range(int(sys.argv[3]) if len(sys.argv)>3 else 60):
    P=P+lh*lap(P); P=P+mh*lap(P)
# dummy head: blend the skull and face onto a smooth egg (ellipsoid) so no facial features remain
hb=KEEP.index('head')
hw=np.array([d.get(hb,0)/(sum(d.values()) or 1) for d in acc])
sel=hw>0.6
lo=P[sel].min(0); hi=P[sel].max(0); c=(lo+hi)/2; r=(hi-lo)/2
c[1]+=r[1]*0.04; r=r*np.array([0.97,1.0,0.95])
d=(P-c)/r; n=np.linalg.norm(d,axis=1,keepdims=True)+1e-9
onE=c+d/n*r
t=np.clip((hw-0.25)/0.55,0,1); t=(t*t*(3-2*t))[:,None]
P=P*(1-t)+onE*t
for rnd in range(4):  # relax folded socket triangles, then snap back onto the egg
    for it in range(12): P=P+0.6*t*lap(P)
    d=(P-c)/r; n=np.linalg.norm(d,axis=1,keepdims=True)+1e-9
    P=P*(1-t)+(c+d/n*r)*t
for it in range(6):
    P=P+0.5*extra[:,None]*lap(P); P=P-0.53*extra[:,None]*lap(P)
# close the eye/mouth openings on the head with a fan around a new centre vertex
from collections import defaultdict
ec=defaultdict(int); nxt={}
for a,b,c in tris:
    for u,v in ((a,b),(b,c),(c,a)): ec[(min(u,v),max(u,v))]+=1; nxt[(u,v)]=1
bedges=[(u,v) for (u,v) in nxt if ec[(min(u,v),max(u,v))]==1]
succ={}
for u,v in bedges: succ[v]=u   # walk the loop opposite to the existing winding
seen=set(); newt=[]; P=list(P); acc=list(acc)
for start in list(succ):
    if start in seen: continue
    loop=[start]; seen.add(start); cur=succ[start]
    while cur!=start and cur in succ and cur not in seen: loop.append(cur); seen.add(cur); cur=succ[cur]
    if cur!=start or len(loop)<3: continue
    print('loop', len(loop), round(float(np.mean([hw[i] for i in loop])),2), np.round(np.mean([P[i] for i in loop],0),1))
    if np.mean([hw[i] for i in loop])<0.5: continue
    ci=len(P); P.append(np.mean([P[i] for i in loop],0)); acc.append({hb:1.0})
    for k in range(len(loop)): newt.append([loop[k],loop[(k+1)%len(loop)],ci])
P=np.array(P); nv=len(P)
if newt: tris=np.vstack([tris,np.array(newt)])
print('filled', len(newt), 'tris')
SI=np.zeros((nv,4),np.uint8); SW=np.zeros((nv,4),np.float32)
for i,d in enumerate(acc):
    it=sorted(d.items(),key=lambda x:-x[1])[:4] or [(0,1.0)]
    s=sum(w for _,w in it)
    for k,(b,w) in enumerate(it): SI[i,k]=b; SW[i,k]=w/s
heads={b:(J[bones[b]['head']]*10.0) for b in KEEP}
blist=[[b, KEEP.index(kept(bones[b]['parent'])) if bones[b]['parent'] else -1, [round(float(x),3) for x in heads[b]]] for b in KEEP]
P.astype('<f4').tofile('stage_pos.bin'); tris.astype('<u4').tofile('stage_idx.bin')
np.save('stage_si.npy',SI); np.save('stage_sw.npy',SW)
json.dump({'nv':nv,'nt':len(tris),'bones':blist},open('stage_man.json','w'))
print(nv,len(tris),P[:,1].min(),P[:,1].max())
