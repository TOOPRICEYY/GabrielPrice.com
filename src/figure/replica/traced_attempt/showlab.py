import sys,json,numpy as np; from PIL import Image,ImageDraw; sys.path.insert(0,'tri'); from label import loadbin,camera
V,F=loadbin('hr_all.bin'); lab=np.load(sys.argv[1]); x=json.load(open('cam2.json')); out=sys.argv[2]
rng=np.random.default_rng(3); ul=np.unique(lab); col={l:tuple(rng.integers(50,255,3).tolist()) for l in ul}
o=Image.new('RGB',(2*600,1254),'white')
for i,(v,g) in enumerate([('front0','F'),('back0','B')]):
    eye,proj=camera(x,v,g); C=V[F].mean(1); d=np.linalg.norm(C-eye,axis=1); order=np.argsort(-d)
    uv=proj(V); im=Image.new('RGB',(1254,1254),'white'); dr=ImageDraw.Draw(im)
    N=np.cross(V[F[:,1]]-V[F[:,0]],V[F[:,2]]-V[F[:,0]])
    for t in order:
        if N[t]@(C[t]-eye)>0: continue
        dr.polygon([tuple(uv[j]) for j in F[t]],fill=col[lab[t]])
    o.paste(im.crop((327,0,927,1254)),(i*600,0))
o.resize((600,627)).save(out)
