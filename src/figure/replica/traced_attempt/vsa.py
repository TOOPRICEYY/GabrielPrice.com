# turn a triangle labelling of the high-res body into a low-poly mesh: one planar polygon per label, corners where 3+ labels meet
import sys,json,numpy as np,trimesh; from collections import defaultdict,deque
sys.path.insert(0,'tri'); from label import loadbin
V,F=loadbin('hr_all.bin'); lab=np.load('tri/tri_labels.npy').copy()
mesh=trimesh.Trimesh(V,F,process=False); A=mesh.face_adjacency; nF=len(F)
nb=[[] for _ in range(nF)]
for a,b in A: nb[a].append(b); nb[b].append(a)
MIN=int(sys.argv[1]) if len(sys.argv)>1 else 40
def components(lab):
    comp=-np.ones(nF,int); c=0
    for s in range(nF):
        if comp[s]>=0 or lab[s]<0: continue
        q=deque([s]); comp[s]=c
        while q:
            t=q.popleft()
            for u in nb[t]:
                if comp[u]<0 and lab[u]==lab[t]: comp[u]=c; q.append(u)
        c+=1
    return comp,c
for sm in range(int(sys.argv[3]) if len(sys.argv)>3 else 6):
    new=lab.copy()
    for f in range(nF):
        ls=[lab[u] for u in nb[f]]+[lab[f]]
        c=max(set(ls),key=ls.count)
        if ls.count(c)>=3: new[f]=c
    lab=new
from scipy.cluster.vq import kmeans2
g_headcut=float(sys.argv[10]) if len(sys.argv)>10 else 999
g_footcut=float(sys.argv[11]) if len(sys.argv)>11 else -1
NRM=mesh.face_normals; CEN=mesh.triangles_center; AR=mesh.area_faces
ATGT=float(sys.argv[6]) if len(sys.argv)>6 else 60.0     # target facet area (cm^2) for hidden areas
def keep_largest(lab):
    comp,nc=components(lab); size=np.bincount(comp[comp>=0],minlength=nc); bestc={}
    for f in range(nF):
        if comp[f]<0: continue
        l=lab[f]; c=comp[f]
        if l not in bestc or size[c]>size[bestc[l]]: bestc[l]=c
    for f in range(nF):
        if comp[f]>=0 and (bestc[lab[f]]!=comp[f] or size[comp[f]]<MIN): lab[f]=-1
    return lab
lab[(mesh.triangles_center[:,1]>g_headcut)|(mesh.triangles_center[:,1]<g_footcut)]=-1
lab=keep_largest(lab)
nxt=[lab.max()+1]; PHOTO=set(np.unique(lab[lab>=0]).tolist())
PHOTO_DEV=np.radians(float(sys.argv[8]) if len(sys.argv)>8 else 60)
def cluster(fs,k):
    X=np.c_[NRM[fs]*12.0,CEN[fs]/3.0]
    if k<=1 or len(fs)<2*k: return np.zeros(len(fs),int)
    _,c=kmeans2(X,k,minit='++',seed=1); return c
# hidden (unlabelled) patches: cluster into facet-sized pieces
un=lab<0; ulab=np.where(un,0,-1)
comp,nc=components(ulab)
for c in range(nc):
    fs=np.where(comp==c)[0]; k=max(1,int(round(AR[fs].sum()/ATGT)))
    cl=cluster(fs,k)
    for j in range(cl.max()+1): lab[fs[cl==j]]=nxt[0]; nxt[0]+=1
# split non-planar regions
MAXDEV=np.radians(float(sys.argv[7]) if len(sys.argv)>7 else 28)
for it in range(25):
    changed=False
    for l in np.unique(lab):
        fs=np.where(lab==l)[0]; n=(NRM[fs]*AR[fs,None]).sum(0); n/=np.linalg.norm(n)
        dev=np.arccos(np.clip(NRM[fs]@n,-1,1))
        if np.percentile(dev,90)>(PHOTO_DEV if l in PHOTO else MAXDEV) and len(fs)>=2*MIN:
            cl=cluster(fs,2)
            for j in (1,):
                lab[fs[cl==j]]=nxt[0]; nxt[0]+=1
            changed=True
    lab=keep_largest(lab)
    for sweep in range(200):
        un=np.where(lab<0)[0]
        if not len(un): break
        new={}
        for f in un:
            ls=[lab[u] for u in nb[f] if lab[u]>=0]
            if ls: new[f]=max(set(ls),key=ls.count)
        for f,l in new.items(): lab[f]=l
    if not changed: break
print('labels',len(set(lab)),'unlabelled',(lab<0).sum())
np.save('tri/tri_labels_clean.npy',lab)
# vertex -> set of labels
vl=defaultdict(set)
for f in range(nF):
    for v in F[f]: vl[v].add(lab[f])
# boundary edges between different labels
E=defaultdict(list)   # undirected mesh edge -> faces
for f in range(nF):
    for k in range(3):
        a,b=F[f][k],F[f][(k+1)%3]; E[(min(a,b),max(a,b))].append(f)
bnd=defaultdict(set)  # vertex adjacency along label boundaries
for (a,b),fs in E.items():
    if len(fs)==2 and lab[fs[0]]!=lab[fs[1]]: bnd[a].add(b); bnd[b].add(a)
anchor={v for v in bnd if len(vl[v])>=3 or len(bnd[v])!=2}
# chains between anchors along boundary edges
seen=set(); chains=[]
for s in anchor:
    for t in bnd[s]:
        if (s,t) in seen: continue
        ch=[s,t]; seen.add((s,t)); seen.add((t,s))
        while ch[-1] not in anchor:
            nx=[u for u in bnd[ch[-1]] if u!=ch[-2]]
            if not nx: break
            ch.append(nx[0]); seen.add((ch[-2],ch[-1])); seen.add((ch[-1],ch[-2]))
        chains.append(ch)
# closed loops with no anchor: add one
rest=[v for v in bnd if v not in anchor and not any((v,u) in seen for u in bnd[v])]
while rest:
    s=rest[0]; anchor.add(s); t=next(iter(bnd[s])); ch=[s,t]; seen.add((s,t)); seen.add((t,s))
    while ch[-1]!=s:
        nx=[u for u in bnd[ch[-1]] if u!=ch[-2] and ((ch[-1],u) not in seen)]
        if not nx: break
        ch.append(nx[0]); seen.add((ch[-2],ch[-1])); seen.add((ch[-1],ch[-2]))
    chains.append(ch); rest=[v for v in bnd if v not in anchor and not any((v,u) in seen for u in bnd[v])]
TOL=float(sys.argv[2]) if len(sys.argv)>2 else 1.2
def dp(idx):
    if len(idx)<=2: return idx
    P=V[idx]; a,b=P[0],P[-1]; ab=b-a; L=np.linalg.norm(ab)
    if L<1e-6: d=np.linalg.norm(P-a,axis=1)
    else: d=np.linalg.norm(np.cross(P-a,ab/L),axis=1)
    k=int(np.argmax(d))
    if d[k]>TOL: return dp(idx[:k+1])[:-1]+dp(idx[k:])
    return [idx[0],idx[-1]]
keepv=set(anchor)
for ch in chains:
    if ch[0]==ch[-1]:  # loop: split in half
        m=len(ch)//2; s1=dp(ch[:m+1]); s2=dp(ch[m:]); keepv.update(s1); keepv.update(s2)
    else: keepv.update(dp(ch))
print('anchors',len(anchor),'kept boundary vertices',len(keepv),'chains',len(chains))
# region polygons: walk each label's boundary loop(s) with oriented half-edges, keep only kept vertices
half=defaultdict(list)
for f in range(nF):
    l=lab[f]
    for k in range(3):
        a,b=F[f][k],F[f][(k+1)%3]; fs=E[(min(a,b),max(a,b))]
        other=[g for g in fs if g!=f]
        if other and lab[other[0]]!=l: half[l].append((a,b))
polys={}
for l,hs in half.items():
    nxt=defaultdict(list)
    for a,b in hs: nxt[a].append(b)
    used=set(); loops=[]
    for a,b in hs:
        if (a,b) in used: continue
        loop=[a]; cur=(a,b)
        while cur not in used:
            used.add(cur); loop.append(cur[1]); c=[x for x in nxt[cur[1]] if (cur[1],x) not in used]
            if not c: break
            cur=(cur[1],c[0])
        loops.append(loop[:-1] if loop[0]==loop[-1] else loop)
    loop=max(loops,key=len)   # outer loop (ignore holes)
    polys[l]=[v for v in loop if v in keepv]
MERGE=float(sys.argv[4]) if len(sys.argv)>4 else 1.5
allv=sorted({v for pv in polys.values() for v in pv}); rep={v:v for v in allv}
from scipy.spatial import cKDTree
T=cKDTree(V[allv]); 
for i,j in sorted(T.query_pairs(MERGE)):
    a,b=allv[i],allv[j]
    ra,rb=a,b
    while rep[ra]!=ra: ra=rep[ra]
    while rep[rb]!=rb: rb=rep[rb]
    if ra!=rb: rep[rb]=ra
def root(v):
    while rep[v]!=v: v=rep[v]
    return v
X={}
for v in allv:
    r=root(v); X.setdefault(r,[]).append(V[v])
Vp=V.copy()
for r,ps in X.items(): Vp[r]=np.mean(ps,0)
for l in list(polys):
    q=[]
    for v in polys[l]:
        r=root(v)
        if not q or q[-1]!=r: q.append(r)
    while len(q)>1 and q[0]==q[-1]: q.pop()
    polys[l]=q
# planarize: each vertex moves toward the intersection of the planes of the regions around it
reg_of=defaultdict(set)
for l,pv in polys.items():
    for v in pv: reg_of[v].add(l)
planes={}
for l in polys:
    fl=np.where(lab==l)[0]; c=mesh.triangles_center[fl]; w=mesh.area_faces[fl]; n=(mesh.face_normals[fl]*w[:,None]).sum(0); n/=np.linalg.norm(n)
    planes[l]=(n,(c*w[:,None]).sum(0)/w.sum()@n)
LAM=float(sys.argv[5]) if len(sys.argv)>5 else 0.05
CLAMP=float(sys.argv[9]) if len(sys.argv)>9 else 1.5
V0=Vp.copy()
for it in range(6):
    for v,ls in reg_of.items():
        Amat=LAM*np.eye(3); bvec=LAM*Vp[v]
        for l in ls:
            n,d=planes[l]; Amat+=np.outer(n,n); bvec+=n*d
        y=np.linalg.solve(Amat,bvec); dv=y-V0[v]; L=np.linalg.norm(dv)
        cl=CLAMP if len(ls)>=3 else 1.0
        Vp[v]=V0[v]+dv*min(1,cl/max(L,1e-9))
    for l,pv in polys.items():
        if len(pv)<3: continue
        P=Vp[pv]; c=P.mean(0); n0=planes[l][0]
        _,_,vt=np.linalg.svd(P-c); n=vt[2]; n=n if n@n0>0 else -n
        planes[l]=(n,c@n)
V=Vp
# triangulate each polygon in its best-fit plane (ear clipping); keep consistent outward winding
out_tris=[]
def ear(idx,P2):
    idx=list(range(len(idx))); tris=[]
    ar=0.5*np.sum(P2[:,0]*np.roll(P2[:,1],-1)-np.roll(P2[:,0],-1)*P2[:,1]); s=np.sign(ar) or 1
    def inside(q,a,b,c):
        def sg(p1,p2,p3): return (p1[0]-p3[0])*(p2[1]-p3[1])-(p2[0]-p3[0])*(p1[1]-p3[1])
        d1,d2,d3=sg(q,a,b),sg(q,b,c),sg(q,c,a); return not((d1<0 or d2<0 or d3<0) and (d1>0 or d2>0 or d3>0))
    guard=0
    while len(idx)>3 and guard<5000:
        guard+=1; found=False
        for k in range(len(idx)):
            i0,i1,i2=idx[k-1],idx[k],idx[(k+1)%len(idx)]; a,b,c=P2[i0],P2[i1],P2[i2]
            cr=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
            if cr*s<=1e-9: continue
            if any(inside(P2[q],a,b,c) for q in idx if q not in (i0,i1,i2)): continue
            tris.append((i0,i1,i2)); idx.pop(k); found=True; break
        if not found: return None
    tris.append(tuple(idx)); return tris
for l,pv in polys.items():
    if len(pv)<3: continue
    P=V[pv]; c=P.mean(0); n=planes[l][0]
    u=np.cross(n,[0,1,0] if abs(n[1])<.9 else [1,0,0]); u/=np.linalg.norm(u); w=np.cross(n,u)
    P2=np.c_[(P-c)@u,(P-c)@w]
    tt=ear(pv,P2)
    if tt is None:   # not a simple polygon in its plane: fan from a new centre vertex on the facet plane
        V=np.vstack([V,c]); ci=len(V)-1; pv=pv+[ci]; tt=[(k,(k+1)%(len(pv)-1),len(pv)-1) for k in range(len(pv)-1)]
    for t in tt:
        a,b,cc=(pv[i] for i in t)
        tn=np.cross(V[b]-V[a],V[cc]-V[a])
        out_tris.append((a,b,cc) if tn@n>=0 else (a,cc,b))
used=sorted({v for t in out_tris for v in t}); m={v:i for i,v in enumerate(used)}
Vo=V[used]; To=np.array([[m[a],m[b],m[c]] for a,b,c in out_tris])
print('low-poly vertices',len(Vo),'triangles',len(To))
json.dump({'p':Vo.round(2).ravel().tolist(),'i':To.ravel().tolist()},open('tri/lp.json','w'))
open('tri/lpmesh.js','w').write('window.REFMESH='+json.dumps({'p':Vo.round(2).ravel().tolist(),'i':To.ravel().tolist()})+';')
