# Doll hands: fair the hand surface (knuckles, tendons, nails, palm creases) while keeping each finger's thickness, so
# the finger bones and grasp() still close the hand around bars the same way. Everything outside the hand is pinned.
import re,json,base64,sys,numpy as np, scipy.sparse as sp, scipy.sparse.linalg as sla
src,dst=sys.argv[1],sys.argv[2]; LAM=float(sys.argv[3]) if len(sys.argv)>3 else 1.0
s=open(src).read()
man=json.loads(re.search(r'window.FIGURE_MAN=(\{.*?\});',s,re.S).group(1)); nv,nt=man['nv'],man['nt']
b64=re.search(r'window.FIGURE_B64="([^"]+)"',s).group(1); buf=bytearray(base64.b64decode(b64))
P0=np.frombuffer(bytes(buf),'<f4',nv*3,0).reshape(-1,3).astype(float)
T=np.frombuffer(bytes(buf),'<u2',nt*3,nv*12).reshape(-1,3).astype(int)
SI=np.frombuffer(bytes(buf),'u1',nv*4,nv*12+nt*6).reshape(-1,4); SW=np.frombuffer(bytes(buf),'u1',nv*4,nv*16+nt*6).reshape(-1,4)/255.
names=[b[0] for b in man['bones']]; heads={b[0]:np.array(b[2]) for b in man['bones']}
def wsum(pred): m=np.array([pred(n) for n in names]); return (SW*m[SI]).sum(1)
hand=wsum(lambda n: n.startswith('finger') or n.startswith('wrist'))
def cot(a,b): return (a*b).sum(1)/(np.linalg.norm(np.cross(a,b),axis=1)+1e-12)
I=[];J=[];V=[]
for i,j,k in ((0,1,2),(1,2,0),(2,0,1)):
    a,b,c=P0[T[:,i]],P0[T[:,j]],P0[T[:,k]]; ck=0.5*cot(a-c,b-c); I+=[T[:,i],T[:,j]]; J+=[T[:,j],T[:,i]]; V+=[ck,ck]
K=sp.coo_matrix((np.concatenate(V),(np.concatenate(I),np.concatenate(J))),(nv,nv)).tocsr(); K=K-sp.diags(np.asarray(K.sum(1)).ravel())
fa=0.5*np.linalg.norm(np.cross(P0[T[:,1]]-P0[T[:,0]],P0[T[:,2]]-P0[T[:,0]]),axis=1); ar=np.zeros(nv)
for k in range(3): np.add.at(ar,T[:,k],fa/3)
free=np.clip((hand-0.5)/0.4,0,1)
w=1.0+(1-free)**2*1e7
M=(sp.diags(w*ar)+LAM*(K.T@sp.diags(1/ar)@K)).tocsc(); solve=sla.factorized(M)
P=np.stack([solve(w*ar*P0[:,k]) for k in range(3)],1)
# restore thickness: the broad (low-frequency) part of the inward normal motion is shrinkage, not detail; put it back
def normals(X):
    fn=np.cross(X[T[:,1]]-X[T[:,0]],X[T[:,2]]-X[T[:,0]]); N=np.zeros_like(X)
    for k in range(3): np.add.at(N,T[:,k],fn)
    return N/(np.linalg.norm(N,axis=1,keepdims=True)+1e-12)
E=np.r_[T[:,[0,1]],T[:,[1,2]],T[:,[2,0]]]; A=sp.coo_matrix((np.ones(len(E)*2),(np.r_[E[:,0],E[:,1]],np.r_[E[:,1],E[:,0]])),(nv,nv)).tocsr(); A.data[:]=1
deg=np.asarray(A.sum(1)).ravel()
for rnd in range(3):
    N=normals(P); dn=((P-P0)*N).sum(1)
    for _ in range(int(sys.argv[4]) if len(sys.argv)>4 else 8): dn=0.5*dn+0.5*(A@dn)/deg
    P=P-(dn*free)[:,None]*N
d=np.linalg.norm(P-P0,axis=1); print('moved max',d.max().round(3),'mean(hand)',d[free>0].mean().round(3))
buf[0:nv*12]=P.astype('<f4').tobytes()
open(dst,'w').write(s.replace(b64,base64.b64encode(bytes(buf)).decode()))
