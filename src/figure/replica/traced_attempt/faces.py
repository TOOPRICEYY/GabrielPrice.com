# photo of a flat-shaded low-poly figure -> 2D vertices + triangles that follow its facets
import sys,json,numpy as np,cv2; from scipy import ndimage as nd
v=sys.argv[1]; tol=float(sys.argv[2]) if len(sys.argv)>2 else 1.2
a=cv2.imread('v_'+v+'.png',cv2.IMREAD_GRAYSCALE)
Mfull=np.load('M_'+v+'.npy'); H,W=a.shape
sm=cv2.bilateralFilter(a.astype(np.float32),7,4,3)
C=cv2.createCLAHE(clipLimit=6.0,tileGridSize=(16,16)).apply(np.clip((sm-150)*2.4,0,255).astype(np.uint8))
s=cv2.bilateralFilter(C.astype(np.float32),9,10,4)
gx=cv2.Sobel(s,cv2.CV_32F,1,0,ksize=3)/8; gy=cv2.Sobel(s,cv2.CV_32F,0,1,ksize=3)/8
B=(np.hypot(gx,gy)>tol)
# straight edges from the line detector, extended a little to close gaps
f=s.clip(0,255).astype(np.uint8)
L=cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD,0.8,0.6,1.5,22.5,0,0.7,1024).detect(f)[0].reshape(-1,4)
Lim=np.zeros_like(a)
for x1,y1,x2,y2 in L:
    d=np.array([x2-x1,y2-y1]); n=np.linalg.norm(d)
    if n<10: continue
    d/=n; p1=np.array([x1,y1])-d*3; p2=np.array([x2,y2])+d*3
    cv2.line(Lim,tuple(int(round(t)) for t in p1),tuple(int(round(t)) for t in p2),1,1)
B|=Lim>0
Me=nd.binary_erosion(Mfull,iterations=2)
lab,n=nd.label(~B&Me); sz=np.bincount(lab.ravel()); ok=np.zeros(n+1,bool); ok[1:]=sz[1:]>=45
lab[~ok[lab]]=0; lab,n=nd.label(lab>0)  # relabel compact
_,(iy,ix)=nd.distance_transform_edt(lab==0,return_indices=True); P=lab[iy,ix]; P[~Mfull]=0
# smooth the partition boundaries a bit (mode filter) so contours are clean
for it in range(2):
    P=nd.generic_filter(P,lambda w: np.bincount(w.astype(int)).argmax(),size=3).astype(P.dtype) if False else P
np.save('tri/P_'+v+'.npy',P)
# junctions: pixels whose 3x3 window holds >=3 labels (background counts)
pad=np.pad(P,1); stack=np.stack([pad[1+dy:H+1+dy,1+dx:W+1+dx] for dy in(-1,0,1) for dx in(-1,0,1)],-1)
srt=np.sort(stack,-1); nl=1+(np.diff(srt,axis=-1)!=0).sum(-1)
J=np.argwhere(nl>=3)[:,::-1].astype(float)
# cluster junction pixels (radius r) into vertices
r=6.0; V=[]
from scipy.spatial import cKDTree
used=np.zeros(len(J),bool); T=cKDTree(J)
for i in np.argsort(J[:,1]):
    if used[i]: continue
    idx=[j for j in T.query_ball_point(J[i],r) if not used[j]]; used[idx]=True; V.append(J[idx].mean(0))
V=list(V)
faces=[]
for k in range(1,P.max()+1):
    m=(P==k).astype(np.uint8)
    if m.sum()<30: continue
    cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    c=max(cs,key=len)[:,0,:].astype(float)
    corners=cv2.approxPolyDP(c.astype(np.float32).reshape(-1,1,2),2.5,True)[:,0,:]
    TV=cKDTree(np.array(V)); seq=[]
    for p in c:
        d,j=TV.query(p)
        if d<=r: 
            if not seq or seq[-1]!=j: seq.append(j)
        else:
            dc=np.linalg.norm(corners-p,axis=1)
            if dc.min()<0.5:  # an outline corner far from any junction: new vertex
                V.append(p.copy()); TV=cKDTree(np.array(V)); j=len(V)-1
                if not seq or seq[-1]!=j: seq.append(j)
    while len(seq)>1 and seq[0]==seq[-1]: seq.pop()
    # drop immediate back-and-forth repeats
    out=[]
    for j in seq:
        if j in out: continue
        out.append(j)
    if len(out)>=3: faces.append(out)
V=np.array(V)
json.dump({'V':V.round(2).tolist(),'F':faces,'shape':[H,W]},open('tri/faces_'+v+'.json','w'))
print(v,'vertices',len(V),'faces',len(faces),'sizes',np.bincount([len(f) for f in faces]))
o=cv2.cvtColor(a,cv2.COLOR_GRAY2BGR)
for fc in faces:
    pts=V[fc].astype(np.int32); cv2.polylines(o,[pts],True,(0,0,220),1)
for p in V: cv2.circle(o,tuple(int(t) for t in p),2,(220,90,0),-1)
cv2.imwrite('tri/faces_'+v+'.png',o)
