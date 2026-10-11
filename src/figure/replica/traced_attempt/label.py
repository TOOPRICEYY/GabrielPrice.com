# label every triangle of the fitted high-res body with the reference facet it falls in (front0/back0 photo segmentations)
import sys,json,numpy as np,trimesh
def loadbin(fn):
    b=open(fn,'rb').read(); nv,nf=np.frombuffer(b[:8],np.uint32)
    V=np.frombuffer(b[8:8+nv*12],np.float32).reshape(-1,3).astype(float); F=np.frombuffer(b[8+nv*12:8+nv*12+nf*12],np.uint32).reshape(-1,3).astype(int)
    return V,F
def camera(x,v,grp,ph=0,S=1254):
    a=np.radians(x['fy_'+v]); c,s=np.cos(a),np.sin(a); e=np.radians(x['el_'+grp]); d=x['dist_'+grp]; ty=x['ty_'+grp]; cx=x['cx_'+v]
    eye=np.array([cx,ty+d*np.sin(e),d*np.cos(e)]); tgt=np.array([cx,ty,0.]); f=tgt-eye; f/=np.linalg.norm(f); r=np.cross(f,[0,1,0]); r/=np.linalg.norm(r); u=np.cross(r,f)
    R=np.array([[c,0,s],[0,1,0],[-s,0,c]])   # model -> world (yaw), then +ph in y
    eye_m=R.T@(eye-np.array([0,ph,0]))       # camera position in model space
    k=(S/2)/np.tan(np.radians(19/2))
    def proj(P):
        Q=P@R.T+np.array([0,ph,0]); Vv=Q-eye; z=Vv@f; return np.c_[S/2+k*(Vv@r)/z, S/2-k*(Vv@u)/z]
    return eye_m,proj
if __name__=='__main__':
    seg=sys.argv[1]   # prefix of label maps: tri/<seg>_front0.npy, tri/<seg>_back0.npy
    V,F=loadbin('hr_all.bin'); x=json.load(open('cam2.json'))
    mesh=trimesh.Trimesh(V,F,process=False); C=mesh.triangles_center; N=mesh.face_normals
    lab=-np.ones(len(F),int); best=np.zeros(len(F))
    SYM=len(sys.argv)>2 and sys.argv[2]=='sym'; SIDE=[-1,1]   # front photo: figure's right (x<0); back photo: figure's left (x>0)
    for vi,(v,g) in enumerate([('front0','F'),('back0','B')]):
        Lm=np.load('tri/%s_%s.npy'%(seg,v)); eye,proj=camera(x,v,g)
        D=C-eye; dist=np.linalg.norm(D,axis=1); D/=dist[:,None]; facing=-(N*D).sum(1)
        cand=np.where(facing>0.05)[0]
        hit=mesh.ray.intersects_first(np.repeat(eye[None],len(cand),0),D[cand])
        vis=cand[hit==cand]
        uv=proj(C[vis]); xi=np.clip(uv[:,0].round().astype(int),0,1253); yi=np.clip(uv[:,1].round().astype(int),0,1253)
        l=Lm[yi,xi].copy()
        if SYM: l[(C[vis,0]*SIDE[vi])<-0.5]=0          # only trust the clearer half of each photo
        ok=(l>0)&(facing[vis]>best[vis])
        lab[vis[ok]]=l[ok]+vi*100000; best[vis[ok]]=facing[vis[ok]]
        print(v,'visible',len(vis),'labelled',ok.sum())
    if SYM:
        from scipy.spatial import cKDTree
        T=cKDTree(C); _,mi=T.query(C*np.array([-1,1,1]))
        cross={l for l in np.unique(lab) if l>=0 and (np.abs(C[lab==l,0])<1.2).any()}
        src=np.where(lab>=0)[0]
        for t in src:
            if abs(C[t,0])<0.5: continue
            m=mi[t]
            if lab[m]<0: lab[m]=lab[t] if lab[t] in cross else lab[t]+50000
    np.save('tri/tri_labels.npy',lab); print('unlabelled',(lab<0).sum(),'of',len(F))
