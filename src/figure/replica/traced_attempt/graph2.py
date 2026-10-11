# facet graph v2: candidate corners (junctions + Shi-Tomasi corners), edges accepted by a two-sided contrast test
import sys,json,numpy as np,cv2; from scipy import ndimage as nd; from scipy.spatial import cKDTree
v=sys.argv[1]; TH=float(sys.argv[2]) if len(sys.argv)>2 else 7
a=cv2.imread('v_'+v+'.png',0).astype(np.float32); M=np.load('M_'+v+'.npy'); H,W=M.shape
sm=cv2.bilateralFilter(a,7,4,3)
C=cv2.createCLAHE(clipLimit=6.0,tileGridSize=(16,16)).apply(np.clip((sm-150)*2.4,0,255).astype(np.uint8)).astype(np.float32)
C=cv2.bilateralFilter(C,9,12,4); C[~M]=-1000   # background flagged
cv2.imwrite('tri/C_'+v+'.png',np.clip(C,0,255).astype(np.uint8))
R=json.load(open('tri/faces_'+v+'.json')); V0=np.array(R['V'])
gf=cv2.goodFeaturesToTrack(np.clip(C,0,255).astype(np.uint8),900,0.02,7,mask=nd.binary_dilation(M,iterations=3).astype(np.uint8)).reshape(-1,2)
# outline corners
cs,_=cv2.findContours(M.astype(np.uint8),cv2.RETR_LIST,cv2.CHAIN_APPROX_NONE)
oc=np.vstack([cv2.approxPolyDP(c,2.0,True)[:,0,:] for c in cs if len(c)>40]).astype(float)
Vc=np.vstack([V0,gf,oc])
# merge within 5px
T=cKDTree(Vc); grp=-np.ones(len(Vc),int); V=[]
for i in range(len(Vc)):
    if grp[i]>=0: continue
    idx=[j for j in T.query_ball_point(Vc[i],5) if grp[j]<0]; grp[idx]=len(V); V.append(Vc[idx].mean(0))
V=np.array(V); T=cKDTree(V); print('candidates',len(V))
def samp(img,p):
    x=np.clip(p[:,0],0,W-1.001); y=np.clip(p[:,1],0,H-1.001); x0=x.astype(int); y0=y.astype(int); fx=x-x0; fy=y-y0
    return img[y0,x0]*(1-fx)*(1-fy)+img[y0,x0+1]*fx*(1-fy)+img[y0+1,x0]*(1-fx)*fy+img[y0+1,x0+1]*fx*fy
def score(a_,b_):
    d=b_-a_; L=np.linalg.norm(d); n=np.array([-d[1],d[0]])/L
    t=np.linspace(0,1,max(int(L/1.5),4)+1)[1:-1]; t=t[(t*L>4)&((1-t)*L>4)]
    if len(t)<3: return 0,0
    p=a_[None]+t[:,None]*d[None]; l=samp(C,p+n*3.2); r=samp(C,p-n*3.2)
    bl=l<-500; br=r<-500
    if (bl^br).mean()>0.85: return 1.0,2    # silhouette edge
    if (bl|br).any(): return 0,0
    # inside: the line itself must also be a ridge/step, not interior of a facet
    df=l-r; good=np.abs(df)>TH; sg=np.sign(np.median(df))
    cons=((np.sign(df)==sg)&good).mean()
    # reject if one side equals the line value on both sides (no step): compare against points 6px away too
    return cons,1
E={}
for i in range(len(V)):
    for j in T.query_ball_point(V[i],190):
        if j<=i or np.linalg.norm(V[j]-V[i])<7: continue
        s,kind=score(V[i],V[j])
        if s>=0.88: E[(i,j)]=s
print('edges',len(E))
def on_seg(c,a,b,tol=2.5):
    ab=b-a; t=np.dot(c-a,ab)/np.dot(ab,ab); return 0.03<t<0.97 and np.linalg.norm(a+t*ab-c)<tol
for (i,j) in sorted(E,key=lambda e:-np.linalg.norm(V[e[0]]-V[e[1]])):
    if (i,j) not in E: continue
    a_,b_=V[i],V[j]
    for k in T.query_ball_point((a_+b_)/2,np.linalg.norm(b_-a_)/2):
        if k not in (i,j) and on_seg(V[k],a_,b_):
            del E[(i,j)]
            for (p,q) in [(min(i,k),max(i,k)),(min(k,j),max(k,j))]: E.setdefault((p,q),score(V[p],V[q])[0])
            break
def cross(a,b,c,d):
    o=lambda p,q,r: np.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]))
    return o(a,b,c)*o(a,b,d)<0 and o(c,d,a)*o(c,d,b)<0
kept=[]
for e in sorted(E,key=lambda e:(-round(E[e],2),np.linalg.norm(V[e[0]]-V[e[1]]))):
    if any(len({*e,*f})==4 and cross(V[e[0]],V[e[1]],V[f[0]],V[f[1]]) for f in kept): continue
    kept.append(e)
E=set(kept)
def adj():
    A={}
    for i,j in E: A.setdefault(i,set()).add(j); A.setdefault(j,set()).add(i)
    return A
for it in range(30):
    A=adj(); ch=False
    for k,nb in A.items():
        if len(nb)==1: E.discard(tuple(sorted((k,*nb)))); ch=True
        elif len(nb)==2:
            p,q=nb; u=V[p]-V[k]; w=V[q]-V[k]; c=np.dot(u,w)/np.linalg.norm(u)/np.linalg.norm(w)
            if c<-0.99 and tuple(sorted((p,q))) not in E:
                E.discard(tuple(sorted((k,p)))); E.discard(tuple(sorted((k,q)))); E.add(tuple(sorted((p,q)))); ch=True
    if not ch: break
A=adj(); print('graph vertices',len(A),'edges',len(E))
json.dump({'V':V.round(2).tolist(),'E':sorted([list(map(int,e)) for e in E])},open('tri/g2_'+v+'.json','w'))
o=cv2.cvtColor(np.clip(C,0,255).astype(np.uint8),cv2.COLOR_GRAY2BGR)
for i,j in E: cv2.line(o,tuple(V[i].astype(int)),tuple(V[j].astype(int)),(0,0,230),1)
for k in A: cv2.circle(o,tuple(V[k].astype(int)),2,(230,100,0),-1)
cv2.imwrite('tri/g2_'+v+'.png',o)
