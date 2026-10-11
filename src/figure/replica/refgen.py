# SDF sculpt of Gabriel's reference figure, rebuilt from widths measured on the straight front/back views (front0/back0)
# and depths from the side views. Units cm, floor y=0, front +z, figure's left +x, height 174.
# Every part is a vertical loft of superellipse sections (centre x/z, half-width a, half-depth b per height), smooth-unioned.
import json,sys,numpy as np
from skimage.measure import marching_cubes
from scipy.interpolate import PchipInterpolator
H=float(sys.argv[1]) if len(sys.argv)>1 else 0.6
P=json.loads(sys.argv[2]) if len(sys.argv)>2 else {}
g=lambda k,d: P.get(k,d)
lo=np.array([-40,-1,-16],np.float32); hi=np.array([40,176,30],np.float32)
n=np.ceil((hi-lo)/H).astype(int)+1
X=np.stack(np.meshgrid(*[lo[i]+np.arange(n[i],dtype=np.float32)*H for i in range(3)],indexing='ij'),-1)
def nz(v): v=np.asarray(v,np.float32); return v/np.linalg.norm(v)
def smin(a,b,k):
    h=np.clip(0.5+0.5*(b-a)/k,0,1); return b*(1-h)+a*h-k*h*(1-h)
def cap(a,b,ra,rb):
    a=np.asarray(a,np.float32); b=np.asarray(b,np.float32); ba=b-a; L2=ba@ba
    pa=X-a; t=np.clip((pa@ba)/L2,0,1); r=ra+(rb-ra)*t
    return np.linalg.norm(pa-t[...,None]*ba,axis=-1)-r
def ell(c,r):
    p=X-np.asarray(c,np.float32); r=np.asarray(r,np.float32)
    k0=np.linalg.norm(p/r,axis=-1); k1=np.linalg.norm(p/(r*r),axis=-1); return k0*(k0-1)/np.maximum(k1,1e-6)
def rbox(c,hs,rr,R=None):
    p=X-np.asarray(c,np.float32)
    if R is not None: p=p@R
    q=np.abs(p)-(np.asarray(hs,np.float32)-rr)
    return np.linalg.norm(np.maximum(q,0),axis=-1)+np.minimum(q.max(-1),0)-rr
def vloft(keys,ne=2.2,sd=1):
    """keys: (y, cx, cz, a, b) bottom to top; cx is mirrored by sd"""
    k=np.array(keys,np.float32); y=X[...,1]; yc=np.clip(y,k[0,0],k[-1,0])
    cx,cz,a,b=(PchipInterpolator(k[:,0],k[:,i])(yc).astype(np.float32) for i in (1,2,3,4))
    f=((np.abs(X[...,0]-cx*sd)/a)**ne+(np.abs(X[...,2]-cz)/b)**ne)**(1/ne)-1
    return np.maximum(np.maximum(f*np.minimum(a,b),k[0,0]-y),y-k[-1,0])
AZ=g('az',0.0); TD=g('td',1.0); LD=g('ld',1.0); AD=g('ad',1.0); HD=g('hd',1.0); TZ=g('tz',0.0); HZ=g('hz',0.0); LZ=g('lz',0.0)
# ---- head: wide at the temples, tapering to a small jaw; deepest at cheek height
head=vloft([(152.63,0,2.6+HZ,2.6,3.4*HD),(153.6,0,2.2+HZ,5.0,6.6*HD),(155,0,1.6+HZ,6.6,8.6*HD),(158,0,0.9+HZ,8.0,10.4*HD),(162,0,0.3+HZ,9.1,11.1*HD),(166,0,-0.3+HZ,9.65,10.6*HD),
            (169,0,-0.6+HZ,9.2,9.0*HD),(171.5,0,-0.8+HZ,7.4,6.6*HD),(173.4,0,-0.8+HZ,4.0,3.6*HD),(174,0,-0.8+HZ,1.2,1.2)],ne=2.0)
hy=np.radians(g('hyaw',6))   # head turned a touch toward the figure's left
# ---- neck: elliptical column (wider than deep), leaning forward
neck=vloft([(141,0,-1.4+TZ,7.0,5.0),(146,0,-0.6+TZ,5.4,4.0),(150,0,0.4+TZ,5.2,3.8),(155,0,1.2+TZ,4.8,3.8)],ne=2.0)
# ---- torso: crotch to the base of the neck; the top sections are the flat trapezius slope out to the shoulders
T=[(75.6,0,1.4,3.0,3.0),(77.5,0,1.2,8.0,6.4),(80.5,0,0.6,15.4,9.4),(86,0,0.2,16.4,10.2),(90,0,0.2,15.6,10.2),(94,0,0.4,14.6,10.0),(100,0,0.8,13.6,9.8),(106,0,1.0,12.8,9.8),
   (112,0,1.2,12.2,10.2),(116,0,1.2,13.0,10.8),(120,0,1.0,14.4,11.2),(124,0,0.6,15.8,11.2),(128,0,0.2,17.0,10.8),(132,0,-0.2,18.0,10.2),
   (136,0,-0.6,18.6,9.2),(139.5,0,-1.0,18.6,7.4),(142,0,-1.2,16.0,6.0),(144,0,-1.3,11.5,5.2),(145.5,0,-1.4,6.5,4.6)]
T=[(y,x,z+TZ*(1 if y>100 else (y-76)/24),a,b*TD) for (y,x,z,a,b) in T]
d=smin(vloft(T,ne=2.3),neck,1.5)
d=smin(d,ell((0,79.0,4.6+TZ*0.1),(3.6,4.2,3.0)),1.5)   # mannequin groin
for sd in (1,-1):
    M=lambda p:np.array([p[0]*sd,p[1],p[2]],np.float32)
    # deltoid cap rounding the shoulder down into the upper arm
    e=ell(M((21.6,134.0,-0.8+TZ)),(5.6,6.6,6.0*AD))
    # arm: upper arm, elbow, forearm swell, wrist (widths from the front view, centres drift outward going down)
    A=[(85.0,27.2,2.0,2.9,2.7),(88.5,27.4,1.6,2.9,2.7),(92,27.0,1.2,3.3,3.0),(96,26.6,0.6,4.1,3.6),(100,26.3,-0.2,5.0,4.1),(104,25.9,-0.8,5.8,4.4),(107,25.4,-1.4,5.3,4.4),
       (110,24.9,-1.8,4.4,4.0),(114,24.3,-1.8,3.9,3.9),(120,23.4,-1.4,4.7,4.6),(126,22.6,-1.0,5.2,5.0),(131,22.2,-0.8,5.4,5.2)]
    A=[(y,x,z+TZ+AZ*(131-y)/43,a,b*AD) for (y,x,z,a,b) in A]
    e=smin(e,vloft(A,ne=2.0,sd=sd),2.0)
    # fist: knuckles forward, thumb side forward, hanging from the wrist
    fc=np.array([26.0,80.8,1.8+TZ+AZ],np.float32)
    e=smin(e,rbox(M(fc),(g('fw',3.6),5.4,4.2),2.9),1.4)                                    # fist, well rounded
    e=smin(e,cap(M(fc+np.array([0.4,-3.6,-2.2])),M(fc+np.array([0.4,-3.6,2.8])),2.1,2.3),0.8)   # knuckle row along the bottom
    e=smin(e,cap(M(fc+np.array([-2.4,3.0,3.0])),M(fc+np.array([-2.6,-1.0,4.4])),1.3,1.2),0.6)   # thumb wrapped across the front
    # leg: thigh, knee, calf, ankle; the calf swells mostly on the outer side
    L=[(12,13.4,0.4,3.5,3.8),(16,13.35,0.2,3.65,4.0),(22,13.0,-0.4,4.6,5.0),(28,12.8,-0.9,5.65,5.9),(34,12.6,-1.2,6.7,6.5),(39,12.4,-1.0,7.3,6.4),
       (44,12.0,-0.4,6.3,5.6),(49,11.5,0.4,5.0,5.0),(53,11.2,0.6,4.75,5.0),(57,10.9,0.6,5.6,5.8),(62,10.6,0.6,6.3,6.6),(68,10.2,0.6,7.2,7.6),
       (74,9.8,0.4,8.1,8.4),(80,9.4,0.0,8.2,8.8),(84,9.0,-0.2,7.8,8.8)]
    L=[(y,x,z+LZ*(84-y)/72,a,b*LD) for (y,x,z,a,b) in L]
    e=smin(e,vloft(L,ne=2.1,sd=sd),1.5)
    # slipper foot: heel block tapering to a long pointed toe, high instep up to the ankle
    AN=np.array([13.4*sd,0,0.4+LZ],np.float32); tn=g('toe',0.14)*sd
    Rf=np.array([[np.cos(tn),0,np.sin(tn)],[0,1,0],[-np.sin(tn),0,np.cos(tn)]],np.float32)
    fz=lambda z,y: AN+np.array([np.sin(tn)*z,y,np.cos(tn)*z],np.float32)
    shoe=rbox(fz(-2.6,4.2),(4.2,4.2,4.8),2.6,Rf)
    shoe=smin(shoe,cap(fz(1.5,4.6),fz(19.5,1.3),4.5,1.3),2.2)
    shoe=smin(shoe,cap(fz(0,12.5),fz(0.6,5.5),3.6,4.4),1.5)
    shoe=np.maximum(shoe,-X[...,1])
    e=smin(e,shoe,1.2)
    d=smin(d,e,1.6)
def out(D,name):
    v,f,_,_=marching_cubes(D,0.0,spacing=(H,H,H)); v=v+lo
    open(name,'wb').write(np.array([len(v),len(f)],np.uint32).tobytes()+v.astype('<f4').tobytes()+f.astype('<u4').tobytes())
    print(name,len(v),len(f),v.min(0).round(1),v.max(0).round(1))
pre=g('out','ref'); out(d,pre+'body.bin'); out(head,pre+'head.bin')
