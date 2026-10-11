# region-first facet extraction on the contrast-enhanced photo: segment flat regions, fit straight polygons, share corners
import sys,json,numpy as np,cv2; from scipy import ndimage as nd; from scipy.spatial import cKDTree
v=sys.argv[1]; tol=float(sys.argv[2]); eps=float(sys.argv[3]); rad=float(sys.argv[4])
a=cv2.imread('v_'+v+'.png',0).astype(np.float32); M=np.load('M_'+v+'.npy'); M=nd.binary_fill_holes(M); H,W=M.shape
sm=cv2.bilateralFilter(a,7,4,3)
C=cv2.createCLAHE(clipLimit=6.0,tileGridSize=(16,16)).apply(np.clip((sm-150)*2.4,0,255).astype(np.uint8)).astype(np.float32)
C=cv2.bilateralFilter(C,9,14,5)
gx=cv2.Sobel(C,cv2.CV_32F,1,0,ksize=3)/8; gy=cv2.Sobel(C,cv2.CV_32F,0,1,ksize=3)/8; G=np.hypot(gx,gy)
Me=nd.binary_erosion(M,iterations=2)
lab,n=nd.label((G<tol)&Me); sz=np.bincount(lab.ravel()); ok=sz>=80; ok[0]=False
lab[~ok[lab]]=0; lab,n=nd.label(lab>0)
_,(iy,ix)=nd.distance_transform_edt(lab==0,return_indices=True); P=lab[iy,ix]; P[~M]=0
np.save('tri/rg_'+v+'.npy',P)
polys=[]
for k in range(1,n+1):
    m=(P==k).astype(np.uint8)
    cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE); c=max(cs,key=len)
    ap=cv2.approxPolyDP(c,eps,True)[:,0,:].astype(float)
    if len(ap)>=3: polys.append(ap)
pts=np.vstack(polys); owner=np.concatenate([[i]*len(p) for i,p in enumerate(polys)])
T=cKDTree(pts); grp=-np.ones(len(pts),int); V=[]
for i in np.argsort(-np.bincount(owner)[owner]):
    if grp[i]>=0: continue
    idx=[j for j in T.query_ball_point(pts[i],rad) if grp[j]<0]; grp[idx]=len(V); V.append(pts[idx].mean(0))
V=np.array(V); F=[]; o=0
for p in polys:
    f=[]
    for j in grp[o:o+len(p)]:
        if j not in f: f.append(int(j))
    o+=len(p)
    if len(f)>=3: F.append(f)
json.dump({'V':V.round(2).tolist(),'F':F},open('tri/reg_'+v+'.json','w'))
print(v,'regions',n,'vertices',len(V),'polys',len(F),np.bincount([len(f) for f in F]))
out=cv2.cvtColor(np.clip(C,0,255).astype(np.uint8),cv2.COLOR_GRAY2BGR)
for f in F: cv2.polylines(out,[V[f].astype(np.int32)],True,(0,0,230),1)
for p in V: cv2.circle(out,tuple(p.astype(int)),2,(230,100,0),-1)
cv2.imwrite('tri/reg_'+v+'.png',out)
