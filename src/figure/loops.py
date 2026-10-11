# Coarsen the drawn quad wireframe by drawing whole edge loops: trace every edge loop of the quad mesh (straight through
# valence-4 vertices, ending at poles/boundaries), then choose alternating loops by max-cut on the "parallel loops"
# graph. A line is either drawn end to end or not at all, so lines never break mid-run.
import re,json,base64,numpy as np,sys
from collections import defaultdict
src='/mnt/project-files/gabrielprice-site-photos/src/figure_data.js'
s=open(src).read()
man=json.loads(re.search(r'window.FIGURE_MAN=(\{.*?\});',s,re.S).group(1))
b64=re.search(r'window.FIGURE_B64="([^"]+)"',s).group(1); buf=bytearray(base64.b64decode(b64)); nv,nt=man['nv'],man['nt']
T=np.frombuffer(bytes(buf),'<u2',nt*3,nv*12).reshape(-1,3)
Q=np.stack([T[0::2,0],T[0::2,1],T[0::2,2],T[1::2,2]],1).astype(int)
nq=len(Q)
E={}; eq=defaultdict(list); ve=defaultdict(set)
def ek(a,b): return (a,b) if a<b else (b,a)
for qi,q in enumerate(Q):
    for k in range(4):
        e=ek(q[k],q[(k+1)%4]); E.setdefault(e,len(E)); eq[e].append(qi); ve[q[k]].add(e); ve[q[(k+1)%4]].add(e)
qset=[set(q) for q in Q]
def nxt(v,e):  # edge continuing e straight through v, or None at a pole/boundary
    es=ve[v]
    if len(es)!=4 or any(len(eq[x])!=2 for x in es): return None
    u=e[0]+e[1]-v
    for f in es:
        if f==e: continue
        w=f[0]+f[1]-v
        if not any(u in qset[qi] and w in qset[qi] for qi in eq[e]+eq[f]): return f
    return None
loop={}; L=[]
for e in E:
    if e in loop: continue
    lid=len(L); chain=[e]; loop[e]=lid
    for v0 in e:
        cur,v=e,v0
        while True:
            f=nxt(v,cur)
            if f is None or f in loop: break
            loop[f]=lid; chain.append(f); v=f[0]+f[1]-v; cur=f
    L.append(chain)
nl=len(L); print('edges',len(E),'loops',nl)
W=defaultdict(int)
for q in Q:
    for a,b in ((0,2),(1,3)):
        l1=loop[ek(q[a],q[(a+1)%4])]; l2=loop[ek(q[b],q[(b+1)%4])]
        if l1!=l2: W[ek(l1,l2)]+=1
nb=defaultdict(list)
for (a,b),w in W.items(): nb[a].append((b,w)); nb[b].append((a,w))
# BFS 2-colour, longest loops first, then local-search max-cut
col=-np.ones(nl,int); order=sorted(range(nl),key=lambda i:-len(L[i]))
from collections import deque
for r in order:
    if col[r]>=0: continue
    col[r]=1; dq=deque([r])
    while dq:
        a=dq.popleft()
        for b,w in sorted(nb[a],key=lambda t:-t[1]):
            if col[b]<0: col[b]=1-col[a]; dq.append(b)
def gain(a): return sum(w if col[b]==col[a] else -w for b,w in nb[a])
for it in range(50):
    ch=0
    for a in range(nl):
        if gain(a)>0: col[a]^=1; ch+=1
    if not ch: break
bad=sum(w for (a,b),w in W.items() if col[a]==col[b]); print('uncut weight',bad,'of',sum(W.values()))
# choose the colour class that draws the major (long) loops; fill dangling pole ends
drawE=np.zeros(len(E),bool)
for e,i in E.items(): drawE[i]=col[loop[e]]==1
# per-vertex drawn degree; dangling = degree 1
deg=defaultdict(int)
for e,i in E.items():
    if drawE[i]: deg[e[0]]+=1; deg[e[1]]+=1
print('dangling ends',sum(1 for v,d in deg.items() if d==1))
for it in range(10):   # a drawn loop that dead-ends at a pole: also draw the shortest other loop meeting it there
    dang=[v for v,dg in deg.items() if dg==1]
    if not dang: break
    for v in dang:
        if deg[v]!=1: continue
        cand=sorted({loop[e] for e in ve[v] if not drawE[E[e]]},key=lambda l:len(L[l]))
        if not cand: continue
        for f in L[cand[0]]:
            if not drawE[E[f]]: drawE[E[f]]=True; deg[f[0]]+=1; deg[f[1]]+=1
print('dangling after fix',sum(1 for v,d in deg.items() if d==1))
# cell stats: quads per drawn cell (flood fill over undrawn edges)
par=list(range(nq))
def fd(x):
    while par[x]!=x: par[x]=par[par[x]]; x=par[x]
    return x
for e,i in E.items():
    if not drawE[i] and len(eq[e])==2: par[fd(eq[e][0])]=fd(eq[e][1])
from collections import Counter
cs=Counter(Counter(fd(i) for i in range(nq)).values()); print('cell sizes',sorted(cs.items())[:12],'max',max(cs))
np.save('/tmp/claude-0/mh/drawE.npy',drawE)
if '--write' in sys.argv:
    hide=np.zeros(nt,'u1')
    d=lambda a,b: drawE[E[ek(a,b)]]
    for qi,(f0,f1,f2,f3) in enumerate(Q):
        hide[2*qi]=4|(0 if d(f0,f1) else 1)|(0 if d(f1,f2) else 2)
        hide[2*qi+1]=1|(0 if d(f2,f3) else 2)|(0 if d(f3,f0) else 4)
    off=nv*12+nt*6+nv*8; assert len(buf)==off+nt
    buf[off:]=hide.tobytes()
    open(src,'w').write(s.replace(b64,base64.b64encode(bytes(buf)).decode())); print('written')
