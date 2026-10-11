import sys,numpy as np,cv2
v=sys.argv[1]
a=cv2.imread('v_'+v+'.png',cv2.IMREAD_GRAYSCALE)
# stretch contrast inside the figure so faint facet edges register
f=a.astype(np.float32); f=np.clip((f-150)*2.4,0,255).astype(np.uint8)
lsd=cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD, 0.8, 0.6, 1.5, 22.5, 0, 0.7, 1024)
L=lsd.detect(f)[0].reshape(-1,4); ln=np.hypot(L[:,2]-L[:,0],L[:,3]-L[:,1]); L=L[ln>8]
np.save('tri/lsd_'+v+'.npy',L); print(v,len(L))
o=cv2.cvtColor(a,cv2.COLOR_GRAY2BGR)
for x1,y1,x2,y2 in L: cv2.line(o,(int(x1),int(y1)),(int(x2),int(y2)),(0,0,230),1)
cv2.imwrite('tri/lsd_'+v+'.png',o)
