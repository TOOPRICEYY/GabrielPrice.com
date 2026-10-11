# Turn the MakeHuman body into a plain pose-doll: remove muscle/anatomical definition (pecs, abs, navel, nipples,
# clavicles, kneecaps, calves, toes) by a region-weighted bilaplacian fairing of vertex positions only. Topology,
# skin weights and the quad-wireframe mask are untouched, so the wireframe, poses, grasps and THIGH_FIT indices still apply.
import re,json,base64,sys,numpy as np, scipy.sparse as sp, scipy.sparse.linalg as sla
src,dst=sys.argv[1],sys.argv[2]
LAM=float(sys.argv[3]) if len(sys.argv)>3 else 60.0     # fairing strength (larger = only big forms survive)
s=open(src).read()
man=json.loads(re.search(r'window.FIGURE_MAN=(\{.*?\});',s,re.S).group(1)); nv,nt=man['nv'],man['nt']
b64=re.search(r'window.FIGURE_B64="([^"]+)"',s).group(1); buf=bytearray(base64.b64decode(b64))
P0=np.frombuffer(bytes(buf),'<f4',nv*3,0).reshape(-1,3).astype(float)
T=np.frombuffer(bytes(buf),'<u2',nt*3,nv*12).reshape(-1,3).astype(int)
SI=np.frombuffer(bytes(buf),'u1',nv*4,nv*12+nt*6).reshape(-1,4)
SW=np.frombuffer(bytes(buf),'u1',nv*4,nv*16+nt*6).reshape(-1,4)/255.
names=[b[0] for b in man['bones']]
def wsum(pred):
    m=np.array([pred(n) for n in names]); return (SW*m[SI]).sum(1)
hand=wsum(lambda n: n.startswith('finger') or n.startswith('wrist'))
head=wsum(lambda n: n=='head')
foot=wsum(lambda n: n.startswith('foot'))
# toes -> one mitten (toes.py voxel-closes each forefoot and moves its vertices onto the closed surface)
PG=P0.copy()   # original geometry, used for the fairing operator's weights
if len(sys.argv)>7: P0=np.load(sys.argv[7])
# graph Laplacian over quad edges (triangle pairs: a quad's diagonal is t0's v2-v0 edge)
Q=np.stack([T[0::2,0],T[0::2,1],T[0::2,2],T[1::2,2]],1)
E=np.concatenate([np.stack([Q[:,k],Q[:,(k+1)%4]],1) for k in range(4)]); E=np.unique(np.sort(E,1),axis=0)
A=sp.coo_matrix((np.ones(len(E)*2),(np.r_[E[:,0],E[:,1]],np.r_[E[:,1],E[:,0]])),(nv,nv)).tocsr()
deg=np.asarray(A.sum(1)).ravel(); L=sp.diags(1/deg)@A-sp.eye(nv)
def blur(f,n):
    for _ in range(n): f=0.5*f+0.5*(A@f)/deg[:,None] if f.ndim==2 else 0.5*f+0.5*(A@f)/deg
    return f
# keep weight per vertex: hands stay exactly (fingers grasp bars), the egg head stays, everything else is faired
keep=np.clip(blur(np.clip(hand*1.6,0,1),6)+np.clip((head-0.75)/0.25,0,1)**2,0,1)
ymin=P0[:,1].min(); sole=np.clip(1-(P0[:,1]-ymin)/0.6,0,1)*(foot>0.3)   # sole stays flat for pedals and the shoe cup
keep=np.maximum(keep,sole)
# forefoot: toes.py already shaped it; fairing tiny folded toe geometry crumples it, so fade the fairing out past the ball
fore=np.clip((PG[:,2]-9.0)/3.0,0,1)*np.clip(foot*2,0,1)*(PG[:,1]<-70)
keep=np.maximum(keep,fore)
FOOT=float(sys.argv[6]) if len(sys.argv)>6 else 1.0
w=(1.0-(1-FOOT)*np.clip(foot*1.5,0,1))+keep**2*1e7
# geometric (cotangent) bilaplacian so dense patches (nipples, navel) fair at the same physical scale as coarse ones;
# LAM ~ (feature length in cm)^4
def cot(a,b): return (a*b).sum(1)/(np.linalg.norm(np.cross(a,b),axis=1)+1e-12)
I=[];J=[];V=[]
for i,j,k in ((0,1,2),(1,2,0),(2,0,1)):
    a,b,c=PG[T[:,i]],PG[T[:,j]],PG[T[:,k]]; ck=0.5*cot(a-c,b-c)
    I+= [T[:,i],T[:,j]]; J+=[T[:,j],T[:,i]]; V+=[ck,ck]
K=sp.coo_matrix((np.concatenate(V),(np.concatenate(I),np.concatenate(J))),(nv,nv)).tocsr()
K=K-sp.diags(np.asarray(K.sum(1)).ravel())
fa=0.5*np.linalg.norm(np.cross(PG[T[:,1]]-PG[T[:,0]],PG[T[:,2]]-PG[T[:,0]]),axis=1)
ar=np.zeros(nv)
for k in range(3): np.add.at(ar,T[:,k],fa/3)
Mm=sp.diags(ar); Mi=sp.diags(1/ar)
M=(sp.diags(w*ar)+LAM*(K.T@Mi@K)).tocsc()
solve=sla.factorized(M)
P=np.stack([solve(w*ar*P0[:,k]) for k in range(3)],1)
P00=np.frombuffer(bytes(buf),'<f4',nv*3,0).reshape(-1,3).astype(float)
# undo broad shrinkage: the low-frequency part of the normal displacement is volume loss, not detail removal
def normals(X):
    t0=X[T[:,0]];t1=X[T[:,1]];t2=X[T[:,2]]; fn=np.cross(t1-t0,t2-t0); N=np.zeros_like(X)
    for k in range(3): np.add.at(N,T[:,k],fn)
    return N/(np.linalg.norm(N,axis=1,keepdims=True)+1e-12)
N=normals(P); d=((P-P0)*N).sum(1)
NB=int(sys.argv[4]) if len(sys.argv)>4 else 40
shrink=blur(d,NB)
P=P-(shrink*(1-keep))[:,None]*N*float(sys.argv[5] if len(sys.argv)>5 else 1)
P0=P00
print('moved max',np.linalg.norm(P-P0,axis=1).max().round(3),'mean',np.linalg.norm(P-P0,axis=1).mean().round(3),'height',np.ptp(P0[:,1]).round(2),np.ptp(P[:,1]).round(2))
# legs never grow outward: the brace cuffs, the calf shell and THIGH_FIT were fitted to the old leg surface, so the
# legs may only lose volume (both legs, to stay symmetric); nothing goes below the old floor (pedals, shoe cup)
bn={b[0]:np.array(b[2]) for b in man['bones']}
for up,lo_,ft in (('upperleg01.L','lowerleg01.L','foot.L'),('upperleg01.R','lowerleg01.R','foot.R')):
    for a_,b_,bs in ((up,lo_,(up,up.replace('01','02'))),(lo_,ft,(lo_,lo_.replace('01','02')))):
        m=wsum(lambda n: n in bs)>0.5; H=bn[a_]; ax=(bn[b_]-H)/np.linalg.norm(bn[b_]-H)
        d0=P0[m]-H; d1=P[m]-H; r0=d0-np.outer(d0@ax,ax); r1=d1-np.outer(d1@ax,ax)
        n0=np.linalg.norm(r0,axis=1); n1=np.linalg.norm(r1,axis=1)
        sc=np.where(n1>n0,n0/np.maximum(n1,1e-9),1.0)
        P[m]=H+np.outer(d1@ax,ax)+r1*sc[:,None]
P[:,1]=np.maximum(P[:,1],P0[:,1].min())
buf[0:nv*12]=P.astype('<f4').tobytes()
open(dst,'w').write(s.replace(b64,base64.b64encode(bytes(buf)).decode()))
