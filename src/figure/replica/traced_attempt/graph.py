# junction vertices + straight-edge test -> planar graph -> faces -> triangles (2D, image pixels)
import sys,json,numpy as np,cv2; from scipy import ndimage as nd; from scipy.spatial import cKDTree
v=sys.argv[1]; R=json.load(open('tri/faces_'+v+'.json')); P=np.load('tri/P_'+v+'.npy'); M=np.load('M_'+v+'.npy')
H,W=P.shape
# boundary map: label changes (incl. outline) dilated by 2px
Bd=np.zeros_like(P,bool); Bd[:,1:]|=P[:,1:]!=P[:,:-1]; Bd[1:,:]|=P[1:,:]!=P[:-1,:]
Bd=nd.binary_dilation(Bd,iterations=2)
V=np.array(R['V']); inside=lambda p: 0<=p[0]<W and 0<=p[1]<H
# keep only vertices that sit on a boundary
V=V[[Bd[int(p[1]),int(p[0])] for p in V]]
# merge vertices closer than 5 px
T=cKDTree(V); grp=-np.ones(len(V),int); out=[]
for i in range(len(V)):
    if grp[i]>=0: continue
    idx=[j for j in T.query_ball_point(V[i],5) if grp[j]<0]; grp[idx]=len(out); out.append(V[idx].mean(0))
V=np.array(out); T=cKDTree(V)
def support(a,b):
    n=max(int(np.linalg.norm(b-a)),2); t=np.linspace(0,1,n+1)[1:-1]; p=a[None]+t[:,None]*(b-a)[None]
    xi=np.clip(p[:,0].round().astype(int),0,W-1); yi=np.clip(p[:,1].round().astype(int),0,H-1); return Bd[yi,xi].mean()
E={}
for i in range(len(V)):
    for j in T.query_ball_point(V[i],170):
        if j<=i: continue
        L=np.linalg.norm(V[j]-V[i])
        if L<6: continue
        s=support(V[i],V[j])
        if s>=0.93: E[(i,j)]=s
print('candidate edges',len(E))
def on_seg(c,a,b,tol=3.0):
    ab=b-a; t=np.dot(c-a,ab)/np.dot(ab,ab)
    return 0.05<t<0.95 and np.linalg.norm(a+t*ab-c)<tol
# split rule: drop AB when some vertex C lies on it (the shorter pieces carry the edge)
changed=True
while changed:
    changed=False
    for (i,j) in sorted(E,key=lambda e:-np.linalg.norm(V[e[0]]-V[e[1]])):
        if (i,j) not in E: continue
        a,b=V[i],V[j]; mid=(a+b)/2; r=np.linalg.norm(b-a)/2
        for k in T.query_ball_point(mid,r):
            if k in (i,j): continue
            if on_seg(V[k],a,b):
                del E[(i,j)]; changed=True
                for (p,q) in [(min(i,k),max(i,k)),(min(k,j),max(k,j))]:
                    if (p,q) not in E: E[(p,q)]=support(V[p],V[q])
                break
# crossing removal: keep the better-supported / shorter edge
def cross(a,b,c,d):
    def o(p,q,r): return np.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]))
    return o(a,b,c)*o(a,b,d)<0 and o(c,d,a)*o(c,d,b)<0
keys=sorted(E,key=lambda e:(-E[e],np.linalg.norm(V[e[0]]-V[e[1]])))
kept=[]
for e in keys:
    a,b=V[e[0]],V[e[1]]
    if any(len({*e,*f})==4 and cross(a,b,V[f[0]],V[f[1]]) for f in kept): continue
    kept.append(e)
E=set(kept)
# prune dangling vertices and straight-through degree-2 vertices
def adj():
    A={}
    for i,j in E: A.setdefault(i,set()).add(j); A.setdefault(j,set()).add(i)
    return A
for it in range(20):
    A=adj(); ch=False
    for k,nb in A.items():
        if len(nb)==1: E.discard((min(k,*nb),max(k,*nb))); ch=True
        elif len(nb)==2:
            p,q=nb; u=V[p]-V[k]; w=V[q]-V[k]; c=np.dot(u,w)/np.linalg.norm(u)/np.linalg.norm(w)
            if c<-0.985 and (min(p,q),max(p,q)) not in E:
                E.discard((min(k,p),max(k,p))); E.discard((min(k,q),max(k,q))); E.add((min(p,q),max(p,q))); ch=True
    if not ch: break
A=adj(); print('vertices',len(A),'edges',len(E))
# faces by half-edge walk
ang={k:sorted(nb,key=lambda j:np.arctan2(V[j][1]-V[k][1],V[j][0]-V[k][0])) for k,nb in A.items()}
seen=set(); faces=[]
for i,j in list(E)+[(j,i) for i,j in E]:
    if (i,j) in seen: continue
    f=[i]; a,b=i,j
    while True:
        seen.add((a,b)); nb=ang[b]; k=nb.index(a); c=nb[(k-1)%len(nb)]
        if (b,c)==(i,j): break
        f.append(b); a,b=b,c
        if len(f)>200: break
    faces.append(f)
def area(f): p=V[f]; return 0.5*np.sum(p[:,0]*np.roll(p[:,1],-1)-np.roll(p[:,0],-1)*p[:,1])
def fill_frac(f):
    m=np.zeros((H,W),np.uint8); cv2.fillPoly(m,[V[f].astype(np.int32)],1); n=m.sum(); return (m.astype(bool)&M).sum()/max(n,1)
F=[f for f in faces if area(f)>0 and fill_frac(f)>0.8]
if len(F)<len(faces)//3: F=[f for f in faces if area(f)<0 and fill_frac(f)>0.8]
# ear-clip polygons into triangles
def ear(f):
    f=list(f); tris=[]; s=np.sign(area(f))
    while len(f)>3:
        for k in range(len(f)):
            a,b,c=f[k-1],f[k],f[(k+1)%len(f)]
            cr=(V[b][0]-V[a][0])*(V[c][1]-V[a][1])-(V[b][1]-V[a][1])*(V[c][0]-V[a][0])
            if cr*s<=0: continue
            ok=True
            for q in f:
                if q in (a,b,c): continue
                # point in triangle
                def sgn(p1,p2,p3): return (p1[0]-p3[0])*(p2[1]-p3[1])-(p2[0]-p3[0])*(p1[1]-p3[1])
                d1,d2,d3=sgn(V[q],V[a],V[b]),sgn(V[q],V[b],V[c]),sgn(V[q],V[c],V[a])
                if not ((d1<0 or d2<0 or d3<0) and (d1>0 or d2>0 or d3>0)): ok=False; break
            if ok: tris.append((a,b,c)); f.pop(k); break
        else: tris.append(tuple(f[:3])); f.pop(1)
    tris.append(tuple(f)); return tris
TR=[t for f in F for t in ear(f)]
print('faces',len(F),'polygon sizes',np.bincount([len(f) for f in F]),'triangles',len(TR))
json.dump({'V':V.round(2).tolist(),'F':F,'T':TR},open('tri/graph_'+v+'.json','w'))
a=cv2.imread('v_'+v+'.png'); 
for f in F: cv2.polylines(a,[V[f].astype(np.int32)],True,(0,0,220),1)
for t in TR: pass
for k in A: cv2.circle(a,tuple(int(x) for x in V[k]),2,(220,90,0),-1)
cv2.imwrite('tri/graph_'+v+'.png',a)
