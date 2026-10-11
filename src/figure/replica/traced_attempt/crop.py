# gridded contrast-enhanced crop for transcribing facet corners: crop.py view x0 y0 w h zoom out
import sys,numpy as np,cv2
v,x0,y0,w,h,z,out=sys.argv[1],*map(int,sys.argv[2:7]),sys.argv[7]
a=cv2.imread('v_'+v+'.png',0).astype(np.float32); sm=cv2.bilateralFilter(a,7,4,3)
C=cv2.createCLAHE(clipLimit=5.0,tileGridSize=(16,16)).apply(np.clip((sm-150)*2.4,0,255).astype(np.uint8))
c=C[y0:y0+h,x0:x0+w]; c=cv2.resize(c,(w*z,h*z),interpolation=cv2.INTER_CUBIC); o=cv2.cvtColor(c,cv2.COLOR_GRAY2BGR)
for x in range((x0//10+1)*10,x0+w,10):
    X=(x-x0)*z; cv2.line(o,(X,0),(X,h*z),(150,220,255) if x%50 else (0,140,255),1)
    if x%50==0: cv2.putText(o,str(x),(X+2,12),cv2.FONT_HERSHEY_SIMPLEX,0.4,(0,0,255),1)
for y in range((y0//10+1)*10,y0+h,10):
    Y=(y-y0)*z; cv2.line(o,(0,Y),(w*z,Y),(150,220,255) if y%50 else (0,140,255),1)
    if y%50==0: cv2.putText(o,str(y),(2,Y-2),cv2.FONT_HERSHEY_SIMPLEX,0.4,(0,0,255),1)
cv2.imwrite(out,o)
