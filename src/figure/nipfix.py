# Replace the nipple patches with plain surface: in a local frame around each nipple, fit a quadratic height field to
# the ring of skin around it and put the inner vertices on it, then even the inner vertices out within that surface
# (the dense star of small quads at the nipple is what still caught the light).
import re,json,base64,sys,numpy as np
src,dst=sys.argv[1],sys.argv[2]; RI=float(sys.argv[3]) if len(sys.argv)>3 else 4.5; RO=float(sys.argv[4]) if len(sys.argv)>4 else 8.0
s=open(src).read(); man=json.loads(re.search(r'window.FIGURE_MAN=(\{.*?\});',s,re.S).group(1)); nv,nt=man['nv'],man['nt']
b64=re.search(r'window.FIGURE_B64="([^"]+)"',s).group(1); buf=bytearray(base64.b64decode(b64))
P=np.frombuffer(bytes(buf),'<f4',nv*3,0).reshape(-1,3).astype(float).copy(); P0=P.copy()
T=np.frombuffer(bytes(buf),'<u2',nt*3,nv*12).reshape(-1,3).astype(int)
nb=[set() for _ in range(nv)]
for a,b,c in T: nb[a]|={b,c}; nb[b]|={a,c}; nb[c]|={a,b}
nb=[np.array(sorted(x)) for x in nb]
fn=np.cross(P[T[:,1]]-P[T[:,0]],P[T[:,2]]-P[T[:,0]]); VN=np.zeros_like(P)
for k in range(3): np.add.at(VN,T[:,k],fn)
VN/=np.linalg.norm(VN,axis=1,keepdims=True)
for c in (np.array([10.2,44.6,14.0]),np.array([-10.2,44.6,14.0]),np.array([0.0,23.0,14.4])):
    ri,ro=(RI,RO) if c[0]!=0 else (RI*0.7,RO*0.7)
    d=np.linalg.norm(P0-c,axis=1); near=(d<ro)&(VN[:,2]>0.2)
    n=VN[near].mean(0); n/=np.linalg.norm(n); u=np.cross([0,1,0],n); u/=np.linalg.norm(u); v=np.cross(n,u)
    loc=lambda X: np.stack([(X-c)@u,(X-c)@v,(X-c)@n],1)
    L0=loc(P0); ring=near&(d>ri)
    x,y,z=L0[ring].T; Am=np.stack([np.ones_like(x),x,y,x*x,x*y,y*y],1); co=np.linalg.lstsq(Am,z,rcond=None)[0]
    hgt=lambda x,y: co[0]+co[1]*x+co[2]*y+co[3]*x*x+co[4]*x*y+co[5]*y*y
    inner=np.where(near&(d<ri+1.5))[0]
    bl=np.clip((ri+1.5-d[inner])/1.5,0,1); bl=bl*bl*(3-2*bl)
    Lc=L0[inner].copy()
    for it in range(40):   # relax in-plane (u,v), heights follow the fitted surface
        Lall=loc(P)
        avg=np.array([Lall[nb[i]].mean(0) for i in inner])
        Lc[:,:2]=Lc[:,:2]+0.5*(avg[:,:2]-Lc[:,:2])*bl[:,None]
        Lc[:,2]=L0[inner,2]*(1-bl)+hgt(Lc[:,0],Lc[:,1])*bl
        P[inner]=c+Lc[:,0:1]*u+Lc[:,1:2]*v+Lc[:,2:3]*n
    print('centre',c,'inner',len(inner),'max move',np.linalg.norm(P[inner]-P0[inner],axis=1).max().round(2))
buf[0:nv*12]=P.astype('<f4').tobytes()
open(dst,'w').write(s.replace(b64,base64.b64encode(bytes(buf)).decode()))
