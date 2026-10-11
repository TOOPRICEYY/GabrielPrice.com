# segment flat-shaded facets: pixels joined when their smoothed intensities differ by <= tol
import sys,numpy as np,cv2; from scipy import ndimage as nd
v=sys.argv[1]; tol=float(sys.argv[2]) if len(sys.argv)>2 else 1.5
a=cv2.imread('v_'+v+'.png',cv2.IMREAD_GRAYSCALE).astype(np.float32)
s=cv2.bilateralFilter(a,7,4,3)
M=np.load('M_'+v+'.npy'); M=nd.binary_erosion(M,iterations=2)
gx=cv2.Sobel(s,cv2.CV_32F,1,0,ksize=3)/8; gy=cv2.Sobel(s,cv2.CV_32F,0,1,ksize=3)/8
G=np.hypot(gx,gy); B=(G>tol)|~M
lab,n=nd.label(~B); sz=np.bincount(lab.ravel()); keep=np.where(sz>=60)[0]; keep=keep[keep>0]
L=np.zeros_like(lab); L[np.isin(lab,keep)]=lab[np.isin(lab,keep)]
# grow labels into boundary pixels inside the mask
dist,(iy,ix)=nd.distance_transform_edt(L==0,return_indices=True); L2=L[iy,ix]; L2[~np.load('M_'+v+'.npy')]=0
np.save('tri/L_'+v+'.npy',L2); print(v,'facets',len(keep))
rng=np.random.default_rng(1); col=rng.integers(40,255,(L2.max()+1,3)); col[0]=255
cv2.imwrite('tri/seg_'+v+'.png',col[L2].astype(np.uint8))
