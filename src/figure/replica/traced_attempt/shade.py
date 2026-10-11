# CPU flat-shaded render of a mesh json from the fitted front0/back0 cameras, next to the photos
import sys,json,numpy as np; from PIL import Image,ImageDraw; sys.path.insert(0,'tri'); from label import camera
m=json.load(open(sys.argv[1])); V=np.array(m['p']).reshape(-1,3); F=np.array(m['i']).reshape(-1,3); x=json.load(open('cam2.json'))
L=np.array([-0.45,0.55,0.7]); L/=np.linalg.norm(L)
o=Image.new('RGB',(4*500,1100),'white')
for i,(v,g) in enumerate([('front0','F'),('back0','B')]):
    eye,proj=camera(x,v,g); C=V[F].mean(1); order=np.argsort(-np.linalg.norm(C-eye,axis=1)); uv=proj(V)
    N=np.cross(V[F[:,1]]-V[F[:,0]],V[F[:,2]]-V[F[:,0]]); N/=np.linalg.norm(N,axis=1)[:,None]+1e-9
    Lv=L if v=='front0' else L*np.array([-1,1,-1])
    im=Image.new('RGB',(1254,1254),'white'); dr=ImageDraw.Draw(im)
    for t in order:
        if N[t]@(C[t]-eye)>0: continue
        s=int(np.clip(120+125*max(N[t]@Lv,0)+20*N[t][1],0,255)); dr.polygon([tuple(uv[j]) for j in F[t]],fill=(s,s,s))
    ph=Image.open('v_'+v+'.png').convert('RGB')
    o.paste(ph.crop((377,40,877,1140)),(i*1000,0)); o.paste(im.crop((377,40,877,1140)),(i*1000+500,0))
o.resize((1000,550)).save(sys.argv[2])
