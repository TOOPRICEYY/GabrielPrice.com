# Find the drawn wireframe loops that outline anatomy (nipple and navel rings, and the spokes that end at their centre
# poles) so they can be left undrawn: on a pose doll those patches should read as plain surface.
import re,json,base64,sys,numpy as np
from collections import defaultdict
src=sys.argv[1]; dst=sys.argv[2] if len(sys.argv)>2 else None
s=open(src).read()
man=json.loads(re.search(r'window.FIGURE_MAN=(\{.*?\});',s,re.S).group(1)); nv,nt=man['nv'],man['nt']
b64=re.search(r'window.FIGURE_B64="([^"]+)"',s).group(1); buf=bytearray(base64.b64decode(b64))
P=np.frombuffer(bytes(buf),'<f4',nv*3,0).reshape(-1,3)
T=np.frombuffer(bytes(buf),'<u2',nt*3,nv*12).reshape(-1,3).astype(int)
off=nv*12+nt*6+nv*8; hide=np.frombuffer(bytes(buf),'u1',nt,off).copy()
Q=np.stack([T[0::2,0],T[0::2,1],T[0::2,2],T[1::2,2]],1)
def ek(a,b): return (a,b) if a<b else (b,a)
# drawn state per quad edge from the mask (t0 edges 0:v0v1,1:v1v2 ; t1 edges 1:v2v3? see loops.py layout)
drawn={}
for qi,(f0,f1,f2,f3) in enumerate(Q):
    h0,h1=hide[2*qi],hide[2*qi+1]
    drawn[ek(f0,f1)]=not(h0&1); drawn[ek(f1,f2)]=not(h0&2); drawn[ek(f2,f3)]=not(h1&2); drawn[ek(f3,f0)]=not(h1&4)
eq=defaultdict(list); ve=defaultdict(set)
for qi,q in enumerate(Q):
    for k in range(4):
        e=ek(q[k],q[(k+1)%4]); eq[e].append(qi); ve[q[k]].add(e); ve[q[(k+1)%4]].add(e)
qset=[set(q) for q in Q]
def nxt(v,e):
    es=ve[v]
    if len(es)!=4 or any(len(eq[x])!=2 for x in es): return None
    u=e[0]+e[1]-v
    for f in es:
        if f==e: continue
        w=f[0]+f[1]-v
        if not any(u in qset[qi] and w in qset[qi] for qi in eq[e]+eq[f]): return f
    return None
loop={}; L=[]; ends=[]
for e in eq:
    if e in loop: continue
    lid=len(L); chain=[e]; loop[e]=lid; en=[]
    for v0 in e:
        cur,v=e,v0
        while True:
            f=nxt(v,cur)
            if f is None: en.append(v); break
            if f in loop: break
            loop[f]=lid; chain.append(f); v=f[0]+f[1]-v; cur=f
    L.append(chain); ends.append(en)
# anatomy centres: poles on the front torso (valence != 4) near the nipples and the navel
val=np.array([len(ve[v]) for v in range(nv)])
cands=[v for v in range(nv) if val[v]!=4 and P[v,2]>5 and 10<P[v,1]<60 and abs(P[v,0])<16]
for v in cands: print('pole',v,val[v],P[v].round(1))
C=[(np.array([s_*10.0,44.5,14.0]),float(sys.argv[3]) if len(sys.argv)>3 else 4.0) for s_ in (1,-1)]+[(np.array([0.0,23.0,14.4]),float(sys.argv[4]) if len(sys.argv)>4 else 3.0)]
kill=set()
for lid,chain in enumerate(L):
    if not any(drawn[e] for e in chain): continue
    mids=np.array([(P[a]+P[b])/2 for a,b in chain])
    inside=np.zeros(len(chain),bool)
    for c,r in C: inside|=np.linalg.norm(mids-c,axis=1)<r
    if inside.mean()>0.6: kill.add(lid)
print('loops undrawn',len(kill),[len(L[l]) for l in kill])
for l in kill:
    for e in L[l]: drawn[e]=False
# then lines that now dead-end near those centres (they used to stop on a ring) go too, repeated until none remain
R2=float(sys.argv[5]) if len(sys.argv)>5 else 7.0
MAXL=int(sys.argv[6]) if len(sys.argv)>6 else 12
for it in range(6):
    deg=defaultdict(int)
    for e,d in drawn.items():
        if d: deg[e[0]]+=1; deg[e[1]]+=1
    more=[]
    for lid,chain in enumerate(L):
        if lid in kill or not drawn[chain[0]] or len(chain)>MAXL: continue
        for v in ends[lid]:
            if deg[v]==1 and any(np.linalg.norm(P[v]-c)<R2 for c,_ in C): more.append(lid); break
    if not more: break
    for l in more:
        kill.add(l)
        for e in L[l]: drawn[e]=False
    print('dangling loops undrawn',[len(L[l]) for l in more])
for qi,(f0,f1,f2,f3) in enumerate(Q):
    hide[2*qi]=4|(0 if drawn[ek(f0,f1)] else 1)|(0 if drawn[ek(f1,f2)] else 2)
    hide[2*qi+1]=1|(0 if drawn[ek(f2,f3)] else 2)|(0 if drawn[ek(f3,f0)] else 4)
if dst:
    buf[off:off+nt]=hide.tobytes(); open(dst,'w').write(s.replace(b64,base64.b64encode(bytes(buf)).decode())); print('written',dst)
