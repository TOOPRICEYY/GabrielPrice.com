# Six stylised mannequins built from signed-distance primitives laid on the site's skeleton (same joints as the current
# figure, A-pose), meshed by marching cubes. Output: <style>.bin (float32 verts, uint32 tris) per style.
import json,re,sys,numpy as np
from skimage.measure import marching_cubes
s=open('../d_n.js').read(); man=json.loads(re.search(r'window.FIGURE_MAN=(\{.*?\});',s,re.S).group(1))
J={b[0]:np.array(b[2],np.float32) for b in man['bones']}
H=float(sys.argv[2]) if len(sys.argv)>2 else 0.5
# Display pose for the lineup (argv[3] != 'rest'): arms hang at the sides with a slight elbow bend, like a figure on a
# plinth. Every left-arm bone below the shoulder is rotated about the shoulder, then the forearm chain about the elbow.
def _rot(a,b):
    a=a/np.linalg.norm(a); b=b/np.linalg.norm(b); v=np.cross(a,b); c=float(a@b); s2=float(v@v)
    K=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]],np.float32)
    return np.eye(3,dtype=np.float32)+K+(K@K)*((1-c)/s2 if s2>1e-12 else 0)
def _desc(name):
    idx={b[0]:i for i,b in enumerate(man['bones'])}; out=set(); grow={idx[name]}
    while grow:
        out|=grow; grow={i for i,b in enumerate(man['bones']) if b[1] in grow and i not in out}
    return [man['bones'][i][0] for i in out if man['bones'][i][0]!=name]
def _turn(pivot,names,R):
    for nm in names: J[nm]=J[pivot]+R@(J[nm]-J[pivot])
if (sys.argv[3] if len(sys.argv)>3 else 'down')!='rest':
    up=np.array([np.sin(np.radians(9)),-np.cos(np.radians(9)),-0.03],np.float32)
    _turn('upperarm01.L',_desc('upperarm01.L'),_rot(J['lowerarm01.L']-J['upperarm01.L'],up))
    fo=np.array([np.sin(np.radians(5)),-1.0,np.tan(np.radians(16))],np.float32)
    _turn('lowerarm01.L',_desc('lowerarm01.L'),_rot(J['wrist.L']-J['lowerarm01.L'],fo))
lo=np.array([-60,-84,-14],np.float32); hi=np.array([60,95,42],np.float32)
n=np.ceil((hi-lo)/H).astype(int)+1
X=np.stack(np.meshgrid(*[lo[i]+np.arange(n[i],dtype=np.float32)*H for i in range(3)],indexing='ij'),-1)
def nz(v): return v/np.linalg.norm(v)
def smin(a,b,k):
    if k<=0: return np.minimum(a,b)
    h=np.clip(0.5+0.5*(b-a)/k,0,1); return b*(1-h)+a*h-k*h*(1-h)
def ssub(a,b,k):  # a minus b
    h=np.clip(0.5-0.5*(a+b)/k,0,1); return a*(1-h)+(-b)*h+k*h*(1-h)
def cap(a,b,ra,rb):  # round cone (linear radius) approximated
    a=np.asarray(a,np.float32); b=np.asarray(b,np.float32); ba=b-a; L2=ba@ba
    pa=X-a; t=np.clip((pa@ba)/L2,0,1); r=ra+(rb-ra)*t
    return np.linalg.norm(pa-t[...,None]*ba,axis=-1)-r
def ell(c,r,R=None):
    p=X-np.asarray(c,np.float32)
    if R is not None: p=p@R
    r=np.asarray(r,np.float32); k0=np.linalg.norm(p/r,axis=-1); k1=np.linalg.norm(p/(r*r),axis=-1)
    return k0*(k0-1)/np.maximum(k1,1e-6)
def frame(a,b,ref=(0,0,1)):
    ax=nz(np.asarray(b,np.float32)-np.asarray(a,np.float32)); u=nz(np.cross(ax,ref)); v=np.cross(u,ax); return np.stack([u,ax,v],1)
def rbox(c,hs,rr,R=None):
    p=X-np.asarray(c,np.float32)
    if R is not None: p=p@R
    q=np.abs(p)-(np.asarray(hs,np.float32)-rr)
    return np.linalg.norm(np.maximum(q,0),axis=-1)+np.minimum(q.max(-1),0)-rr
def seg_box(a,b,w,d,rr,pad=0):
    a=np.asarray(a,np.float32); b=np.asarray(b,np.float32); R=frame(a,b); L=np.linalg.norm(b-a)
    return rbox((a+b)/2,(w,L/2+pad,d),rr,R)
def torus(c,axis,Rm,rm):
    R=frame(np.zeros(3),axis); p=(X-np.asarray(c,np.float32))@R
    q=np.stack([np.hypot(p[...,0],p[...,2])-Rm,p[...,1]],-1); return np.linalg.norm(q,axis=-1)-rm
def loft(keys,n=2.4):
    # one continuous torso: superellipse cross-sections (half-width rx, half-depth rz, centre z) at key heights,
    # interpolated with monotone cubics, so chest, waist and hips flow into each other instead of stacking as blobs
    from scipy.interpolate import PchipInterpolator
    k=np.array(keys,np.float32); y=X[...,1]; yc=np.clip(y,k[0,0],k[-1,0])
    rx,rz,cz=(PchipInterpolator(k[:,0],k[:,i])(yc).astype(np.float32) for i in (1,2,3))
    f=((np.abs(X[...,0])/rx)**n+(np.abs(X[...,2]-cz)/rz)**n)**(1/n)-1
    d=f*np.minimum(rx,rz)
    return np.maximum(np.maximum(d,k[0,0]-y),y-k[-1,0])
#                 y     rx    rz    cz
DOLL_TORSO=[(-4.0, 4.5, 4.0,1.5),(-0.5, 9.5, 7.2,1.5),(5,14.5,9.3,1.5),(13,16.2,10.2,1.5),(22,14.6,9.6,1.6),(32,12.8,9.0,2.0),
            (40,13.8,9.6,2.3),(49,15.2,10.5,2.6),(56,15.6,9.9,2.1),(60,14.2,8.6,1.5),(63.5,9.0,6.3,1.1),(66,6.0,5.0,1.0)]
VEE_TORSO=[(-4.0, 4.5, 4.0,1.5),(-0.5, 9.5, 7.2,1.5),(5,13.8,9.0,1.5),(14,15.2,9.8,1.5),(24,13.4,9.0,1.8),(34,11.8,8.6,2.2),
           (42,13.8,9.8,2.6),(50,16.0,10.8,3.0),(56,17.2,9.9,2.3),(60,15.4,8.6,1.6),(63.5,9.5,6.4,1.1),(66,6.0,5.0,1.0)]
def groove_y(d,y0,w=0.38,depth=0.7,k=0.25):
    # horizontal seam that follows the body's own surface at height y0 (works on any cross-section)
    return ssub(d,np.maximum(np.abs(X[...,1]-y0)-w,-d-depth),k)
def mir(p): p=np.array(p,np.float32); p[0]=-p[0]; return p
def tip(f):  # fingertip: extend the last phalanx
    a,b=J[f+'-2.L'],J[f+'-3.L']; return b+(b-a)*0.9
# shared landmarks (left side; right is mirrored)
SH,EL,WR=J['upperarm01.L'],J['lowerarm01.L'],J['wrist.L']
HIP,KN,AN=J['upperleg01.L']+np.array([0,-2,1.5],np.float32),J['lowerleg01.L'],J['foot.L']
HEEL=np.array([19.6,-79.0,-3.0],np.float32); TOE=np.array([20.6,-79.6,19.5],np.float32)
HEAD_C=np.array([0,81.5,5.2],np.float32)
def sides(fn,k=0):
    a=fn(1); b=fn(-1); return smin(a,b,k)
def L(p,sd): return np.asarray(p,np.float32) if sd>0 else mir(p)
def hand_fingers(sd,r=0.85,k=0.3):
    d=None
    for f in ['finger1','finger2','finger3','finger4','finger5']:
        pts=[J[f+'-1.L'],J[f+'-2.L'],J[f+'-3.L'],tip(f)]
        for i in range(3):
            c=cap(L(pts[i],sd),L(pts[i+1],sd),r*(1.15 if f=='finger1' else 1)*(1-0.08*i),r*(1-0.08*(i+1)))
            d=c if d is None else smin(d,c,k)
    return d
def palm(sd,box=False):
    c=(WR+J['finger3-1.L'])/2; R=frame(WR,J['finger3-1.L'],ref=nz(np.cross(J['finger2-1.L']-WR,J['finger5-1.L']-WR)))
    L_=np.linalg.norm(J['finger3-1.L']-WR)
    return rbox(L(c,sd),(3.6,L_/2+0.6,1.3),1.2 if not box else 0.6,R if sd>0 else np.diag([-1,1,1]).astype(np.float32)@R)
def foot(sd,box=False):
    R=frame(L(HEEL,sd),L(TOE,sd),ref=(0,1,0)); c=L((HEEL+TOE)/2+np.array([0,1.8,0],np.float32),sd)
    return rbox(c,(4.2,np.linalg.norm(TOE-HEEL)/2,3.0),2.6 if not box else 1.2,R)
# ---------------------------------------------------------------- styles
def body_smooth(k=4.0,hands=True):
    d=ell(HEAD_C,(8.2,10.8,9.6))
    d=smin(d,cap((0,64,1.5),(0,75,3.5),5.0,4.6),2.5)
    d=smin(d,loft(DOLL_TORSO,2.2),k)
    def limb(sd):
        e=cap(L(SH,sd),L(EL,sd),5.0,3.9); e=smin(e,cap(L(EL,sd),L(WR,sd),3.9,2.7),1.5)
        e=smin(e,cap(L(HIP,sd),L(KN,sd),8.3,5.3),2); e=smin(e,cap(L(KN,sd),L(AN,sd),5.2,3.3),2)
        e=smin(e,foot(sd),2.0)
        if hands: e=smin(e,fist(sd),1.2)
        return e
    d=smin(d,limb(1),3.0); d=smin(d,limb(-1),3.0)
    return d
def joints_list():
    out=[]
    for sd in (1,-1):
        out+= [(L(SH,sd),5.2),(L(EL,sd),4.0),(L(WR,sd),2.9),(L(HIP,sd),7.0),(L(KN,sd),5.4),(L(AN,sd),3.6)]
    return out
STY={}
def vinyl(): return body_smooth(4.0)
def wooden():
    d=ell(HEAD_C,(7.8,10.4,9.0)); d=np.minimum(d,cap((0,64,1.5),(0,75,3.5),3.0,2.6))
    d=np.minimum(d,ell((0,47,2.5),(14.5,14.5,9.5))); d=np.minimum(d,ell((0,13,1.5),(15.5,9.5,9.5)))
    d=np.minimum(d,ell((0,30.5,2.0),(5.5,5.5,5.5)))  # waist ball
    for sd in (1,-1):
        for a,b,ra,rb in ((SH,EL,4.3,3.3),(EL,WR,3.3,2.3),(HIP,KN,7.2,4.6),(KN,AN,4.5,2.9)):
            A=L(a,sd); B=L(b,sd); dirv=nz(B-A); Lb=np.linalg.norm(B-A)
            d=np.minimum(d,cap(A+dirv*ra*1.05,B-dirv*rb*1.05,ra*0.92,rb*0.92))
        for p,r in ((SH,4.4),(EL,3.2),(WR,2.2),(HIP,6.0),(KN,4.3),(AN,2.8)): d=np.minimum(d,ell(L(p,sd),(r,r,r)))
        d=np.minimum(d,foot(sd)); d=np.minimum(d,fist(sd))
    return d
def crash():
    d=body_smooth(3.0)
    for p,r in joints_list():
        pass
    # groove rings at the joints and waist, panel seams like a crash-test dummy's
    for sd in (1,-1):
        for a,b,t,r in ((SH,EL,0.06,5.0),(EL,WR,0.0,3.9),(EL,WR,1.0,2.8),(HIP,KN,0.16,8.0),(KN,AN,0.0,5.3),(KN,AN,1.0,3.4),(HIP,KN,1.0,5.3)):
            A=L(a,sd); B=L(b,sd); c=A+(B-A)*t; d=ssub(d,torus(c,B-A,r+0.25,0.42),0.25)
    d=groove_y(d,31.0); d=groove_y(d,69.5,0.34,0.6)
    return d
def boxy():
    d=rbox((0,81.5,5.0),(7.6,10.4,9.0),3.6)
    d=smin(d,seg_box((0,63,1.5),(0,74,3.5),4.2,4.2,1.8),1.5)
    d=smin(d,rbox((0,49,2.5),(15.0,12.5,10.0),3.5),1.5)
    d=smin(d,rbox((0,32,2.0),(12.0,7.5,8.5),3.0),1.5)
    d=smin(d,rbox((0,14,1.5),(16.0,8.5,10.0),3.5),1.5)
    for sd in (1,-1):
        e=seg_box(L(SH,sd),L(EL,sd),4.2,4.4,1.6,1.0); e=smin(e,seg_box(L(EL,sd),L(WR,sd),3.4,3.0,1.3,0.5),0.8)
        e=smin(e,seg_box(L(HIP,sd),L(KN,sd),7.2,7.5,2.2,1.0),1.0); e=smin(e,seg_box(L(KN,sd),L(AN,sd),4.6,4.8,1.8,0.5),0.8)
        e=smin(e,foot(sd,True),1.0); e=smin(e,fist(sd),0.8)
        d=smin(d,e,1.5)
    return d
def mocap():
    d=body_smooth(4.0)
    d=groove_y(d,31.0,0.3,0.5,0.2)
    for sd in (1,-1):
        A=L(SH,sd); B=L(EL,sd); d=ssub(d,torus(A+(B-A)*0.5,B-A,4.55,0.3),0.2)
        A=L(HIP,sd); B=L(KN,sd); d=ssub(d,torus(A+(B-A)*0.5,B-A,6.9,0.3),0.2)
    return d
def fist(sd):
    # closed hand: a rounded block hanging off the wrist, thin side-to-side so the palm faces the thigh, plus a thumb
    fa=nz(WR-EL); R=frame(WR,WR+fa,ref=(1,0,0)); c=WR+fa*4.6+np.array([0,0,0.6],np.float32)
    d=rbox(L(c,sd),(2.7,4.7,4.3),2.3,R if sd>0 else np.diag([-1,1,1]).astype(np.float32)@R)
    t0=WR+fa*2.2+np.array([-1.6,0,2.6],np.float32); t1=WR+fa*6.0+np.array([-2.0,0,3.6],np.float32)
    return smin(d,cap(L(t0,sd),L(t1,sd),1.5,1.2),1.0)
def shoe(sd):  # fuller foot block, flat sole on the floor
    R=frame(L(HEEL,sd),L(TOE,sd),ref=(0,1,0)); c=L((HEEL+TOE)/2+np.array([0,2.3,0.3],np.float32),sd)
    return np.maximum(rbox(c,(4.7,np.linalg.norm(TOE-HEEL)/2+0.4,3.7),2.8,R),-80.8-X[...,1])
def faceted():   # the smooth doll with fists, the base for decimation
    d=ell(HEAD_C,(8.0,10.6,9.4))
    d=smin(d,cap((0,64,1.5),(0,75,3.5),4.6,4.2),2.0)
    d=smin(d,loft(DOLL_TORSO,2.4),3)
    for sd in (1,-1):
        e=cap(L(SH,sd),L(EL,sd),5.0,3.9); e=smin(e,cap(L(EL,sd),L(WR,sd),3.9,2.7),1.5)
        e=smin(e,cap(L(HIP,sd),L(KN,sd),8.3,5.3),2); e=smin(e,cap(L(KN,sd),L(AN,sd),5.2,3.3),2)
        e=smin(e,shoe(sd),2.0); e=smin(e,fist(sd),1.2); d=smin(d,e,3.0)
    return d
def athletic():  # V-taper: broad chest block and shoulder caps, narrow waist, calf and forearm swell
    d=ell((0,81.8,4.8),(7.4,10.0,8.8))
    d=smin(d,cap((0,62,1.0),(0,75,3.2),4.2,3.8),1.5)
    d=smin(d,loft(VEE_TORSO,2.7),2.0)
    for sd in (1,-1):
        e=ell(L(SH+np.array([1.0,-0.8,0],np.float32),sd),(5.6,6.6,5.8))
        e=smin(e,cap(L(SH,sd),L(EL,sd),4.7,3.6),1.5)
        f=EL+(WR-EL)*0.33; e=smin(e,cap(L(EL,sd),L(f,sd),3.7,3.9),1.0); e=smin(e,cap(L(f,sd),L(WR,sd),3.9,2.5),1.0)
        e=smin(e,cap(L(HIP,sd),L(KN,sd),8.6,5.2),2.0)
        c=KN+(AN-KN)*0.3; e=smin(e,cap(L(KN,sd),L(c,sd),5.0,5.5),1.2); e=smin(e,cap(L(c,sd),L(AN,sd),5.5,3.1),1.5)
        e=smin(e,shoe(sd),1.5); e=smin(e,fist(sd),1.0); d=smin(d,e,2.5)
    return d
STY={'faceted':faceted,'athletic':athletic,'vinyl':vinyl,'wooden':wooden,'crash':crash,'boxy':boxy,'mocap':mocap}
# Surface markers: mocap balls and crash-test calibration targets. Each is the first surface crossing of a ray from a
# point inside the body (a joint) in a direction; written as <style>.mk.json [[x,y,z,nx,ny,nz],...].
def mk_spec(name):
    out=[]; up=(0,1,0); fw=(0,0,1); bk=(0,0,-1); ox=(1,0,0)
    def both(c,d): out.append((np.asarray(c,np.float32),nz(np.asarray(d,np.float32)))); out.append((mir(c),nz(mir(d))))
    def mid(c,d): out.append((np.asarray(c,np.float32),nz(np.asarray(d,np.float32))))
    if name=='mocap':
        mid(HEAD_C,up); mid(HEAD_C,(0,.5,1)); mid(HEAD_C,(0,.3,-1)); both(HEAD_C,(1,.4,0))
        mid((0,52,2),fw); mid((0,30,2),fw); mid((0,63,1),(0,.3,-1)); mid((0,44,2),bk); mid((0,14,1.5),bk)
        for c,d in ((SH,(1,1,0)),((SH+EL)/2,ox),(EL,(.3,0,-1)),(WR,ox),(HIP,(1,.2,0)),(HIP+(KN-HIP)*.55,ox),(KN,fw),
                    (KN+(AN-KN)*.5,(1,0,.8)),(AN,ox),(TOE-np.array([0,-1.5,3],np.float32),fw),(HEEL+np.array([0,2,1],np.float32),bk)):
            both(c,d)
    if name=='crash':
        both(HEAD_C,ox); both(KN,(1,0,.25)); both(HIP+(KN-HIP)*.35,ox); mid((0,49,2),fw)
    return out
def markers(v,nrm,spec):
    res=[]
    for c,d in spec:
        r=v-c; t=r@d; perp=np.linalg.norm(r-t[:,None]*d,axis=1); ok=(t>0)&(perp<0.9)
        i=np.where(ok)[0][np.argmin(t[ok])]; n=nrm[i]/np.linalg.norm(nrm[i]); n=n if n@d>0 else -n
        res.append([round(float(x),2) for x in (*v[i],*n)])
    return res
for name in sys.argv[1].split(','):
    D=STY[name]()
    v,f,nrm,_=marching_cubes(D,0.0,spacing=(H,H,H))
    v=v+lo; f=f[:,::-1]   # outward winding
    sp=mk_spec(name)
    if sp: json.dump(markers(v,nrm,sp),open(name+'.mk.json','w'))
    open(name+'.bin','wb').write(np.array([len(v),len(f)],np.uint32).tobytes()+v.astype('<f4').tobytes()+f.astype('<u4').tobytes())
    print(name,len(v),len(f),v.min(0).round(1),v.max(0).round(1))
