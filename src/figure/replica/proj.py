# fast CPU silhouette of refmesh.js matching rep.html's camera, for fitting against the reference masks R_<view>.png
import json,re,numpy as np; from PIL import Image,ImageDraw
W=554
def load(fn='refmesh.js'):
    d=json.loads(re.search(r'=(\{.*\});',open(fn).read()).group(1)); return np.array(d['p'],float).reshape(-1,3),np.array(d['i']).reshape(-1,3)
def mask(P,I,fy=33,cx=3,dist=680,ty=77.3,el=10,ph=13,fov=19,ss=1):
    a=np.radians(fy); c,s=np.cos(a),np.sin(a)
    Q=np.c_[P[:,0]*c+P[:,2]*s, P[:,1]+ph, -P[:,0]*s+P[:,2]*c]
    e=np.radians(el); eye=np.array([cx,ty+dist*np.sin(e),dist*np.cos(e)]); tgt=np.array([cx,ty,0.])
    f=tgt-eye; f/=np.linalg.norm(f); r=np.cross(f,[0,1,0]); r/=np.linalg.norm(r); u=np.cross(r,f)
    V=Q-eye; z=V@f; k=(W*ss/2)/np.tan(np.radians(fov/2))
    x=W*ss/2+k*(V@r)/z; y=W*ss/2-k*(V@u)/z
    im=Image.new('1',(W*ss,W*ss),0); dr=ImageDraw.Draw(im)
    for t in I: dr.polygon([(x[j],y[j]) for j in t],fill=1)
    if ss>1: im=im.convert('L').resize((W,W),Image.BILINEAR); return np.array(im)>127
    return np.array(im,bool)
def ref(v,ymax=440):
    R=np.array(Image.open('R_'+v+'.png').convert('L'))<128; R[ymax:]=False; return R
def iou(R,M,ymax=440):
    M=M.copy(); M[ymax:]=False; return (R&M).sum()/(R|M).sum()
