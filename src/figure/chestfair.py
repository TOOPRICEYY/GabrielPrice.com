# Flatten what is left of the nipples and the pec edge: a strong local fairing inside a ball around each nipple (and
# the navel), fading to pinned at its rim, with the broad inward drift put back so the chest keeps its volume.
# Then trim wireframe lines that dead-end near those points (they used to stop on the nipple rings).
import re,json,base64,sys,numpy as np, scipy.sparse as sp, scipy.sparse.linalg as sla
from collections import defaultdict
src,dst=sys.argv[1],sys.argv[2]; LAM=float(sys.argv[3]) if len(sys.argv)>3 else 2e4; RAD=float(sys.argv[4]) if len(sys.argv)>4 else 9.0
s=open(src).read()
man=json.loads(re.search(r'window.FIGURE_MAN=(\{.*?\});',s,re.S).group(1)); nv,nt=man['nv'],man['nt']
b64=re.search(r'window.FIGURE_B64="([^"]+)"',s).group(1); buf=bytearray(base64.b64decode(b64))
P0=np.frombuffer(bytes(buf),'<f4',nv*3,0).reshape(-1,3).astype(float)
T=np.frombuffer(bytes(buf),'<u2',nt*3,nv*12).reshape(-1,3).astype(int)
C=[np.array([10.0,44.5,14.0]),np.array([-10.0,44.5,14.0]),np.array([0.0,23.0,14.4])]
free=np.zeros(nv)
for c,r in zip(C,(RAD,RAD,RAD*0.6)):
    d=np.linalg.norm(P0-c,axis=1); f=np.clip(1-d/r,0,1); f=f*f*(3-2*f); free=np.maximum(free,f*(P0[:,2]>5))
def cot(a,b): return (a*b).sum(1)/(np.linalg.norm(np.cross(a,b),axis=1)+1e-12)
I=[];J=[];V=[]
for i,j,k in ((0,1,2),(1,2,0),(2,0,1)):
    a,b,c=P0[T[:,i]],P0[T[:,j]],P0[T[:,k]]; ck=0.5*cot(a-c,b-c); I+=[T[:,i],T[:,j]]; J+=[T[:,j],T[:,i]]; V+=[ck,ck]
K=sp.coo_matrix((np.concatenate(V),(np.concatenate(I),np.concatenate(J))),(nv,nv)).tocsr(); K=K-sp.diags(np.asarray(K.sum(1)).ravel())
fa=0.5*np.linalg.norm(np.cross(P0[T[:,1]]-P0[T[:,0]],P0[T[:,2]]-P0[T[:,0]]),axis=1); ar=np.zeros(nv)
for k in range(3): np.add.at(ar,T[:,k],fa/3)
w=np.where(free<0.02,1e7,1e-2)
M=(sp.diags(w*ar)+LAM*(K.T@sp.diags(1/ar)@K)).tocsc(); solve=sla.factorized(M)
P=np.stack([solve(w*ar*P0[:,k]) for k in range(3)],1)
P=P0+(P-P0)*free[:,None]   # fade the change out toward the rim
def normals(X):
    fn=np.cross(X[T[:,1]]-X[T[:,0]],X[T[:,2]]-X[T[:,0]]); N=np.zeros_like(X)
    for k in range(3): np.add.at(N,T[:,k],fn)
    return N/(np.linalg.norm(N,axis=1,keepdims=True)+1e-12)
E=np.r_[T[:,[0,1]],T[:,[1,2]],T[:,[2,0]]]; A=sp.coo_matrix((np.ones(len(E)*2),(np.r_[E[:,0],E[:,1]],np.r_[E[:,1],E[:,0]])),(nv,nv)).tocsr(); A.data[:]=1
deg=np.asarray(A.sum(1)).ravel()
# keep the chest's volume: only the broad component of the normal motion is undone (blurred over ~ the ball size)
N=normals(P); dn=((P-P0)*N).sum(1)
for _ in range(int(sys.argv[5]) if len(sys.argv)>5 else 30): dn=0.5*dn+0.5*(A@dn)/deg
P=P-(dn*free)[:,None]*N
d=np.linalg.norm(P-P0,axis=1); print('moved max',d.max().round(3))
buf[0:nv*12]=P.astype('<f4').tobytes()
# wireframe: drop drawn edges that dead-end within TR of a centre, repeatedly (shortens the stubs aimed at the nipples)
TR=float(sys.argv[6]) if len(sys.argv)>6 else 5.0
off=nv*12+nt*6+nv*8; hide=np.frombuffer(bytes(buf),'u1',nt,off).copy()
Q=np.stack([T[0::2,0],T[0::2,1],T[0::2,2],T[1::2,2]],1)
ek=lambda a,b:(a,b) if a<b else (b,a)
dr={}
for qi,(f0,f1,f2,f3) in enumerate(Q):
    h0,h1=hide[2*qi],hide[2*qi+1]
    dr[ek(f0,f1)]=not(h0&1); dr[ek(f1,f2)]=not(h0&2); dr[ek(f2,f3)]=not(h1&2); dr[ek(f3,f0)]=not(h1&4)
near=lambda v: any(np.linalg.norm(P0[v]-c)<TR for c in C)
cut=0
while True:
    dg=defaultdict(int)
    for e,x in dr.items():
        if x: dg[e[0]]+=1; dg[e[1]]+=1
    kill=[e for e,x in dr.items() if x and ((dg[e[0]]==1 and near(e[0])) or (dg[e[1]]==1 and near(e[1])))]
    if not kill: break
    for e in kill: dr[e]=False
    cut+=len(kill)
print('wire edges trimmed',cut)
for qi,(f0,f1,f2,f3) in enumerate(Q):
    hide[2*qi]=4|(0 if dr[ek(f0,f1)] else 1)|(0 if dr[ek(f1,f2)] else 2)
    hide[2*qi+1]=1|(0 if dr[ek(f2,f3)] else 2)|(0 if dr[ek(f3,f0)] else 4)
buf[off:off+nt]=hide.tobytes()
open(dst,'w').write(s.replace(b64,base64.b64encode(bytes(buf)).decode()))
