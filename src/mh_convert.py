import json, numpy as np, base64, struct
V=[]; faces=[]; grp=None
for line in open('mh_base.obj'):
    if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('g '): grp=line.split()[1]
    elif line.startswith('f ') and grp=='body':
        faces.append([int(t.split('/')[0])-1 for t in line.split()[1:]])
V=np.array(V)
skel=json.load(open('default.mhskel')); W=json.load(open('default_weights.mhw'))['weights']
J={k:V[v].mean(0) for k,v in skel['joints'].items()}
bones=skel['bones']
KEEP=['root','spine05','spine04','spine03','spine02','spine01','neck01','neck02','neck03','head']
for sd in 'LR':
    KEEP+= [f'{b}.{sd}' for b in ['clavicle','shoulder01','upperarm01','upperarm02','lowerarm01','lowerarm02','wrist','pelvis','upperleg01','upperleg02','lowerleg01','lowerleg02','foot']]
def kept(b):
    while b not in KEEP: b=bones[b]['parent']
    return b
used=sorted({i for f in faces for i in f}); remap={o:n for n,o in enumerate(used)}
P=V[used]*10.0  # dm -> cm
nv=len(used)
acc=[dict() for _ in range(nv)]
for b,lst in W.items():
    kb=kept(b); bi=KEEP.index(kb)
    for vi,w in lst:
        if vi in remap: d=acc[remap[vi]]; d[bi]=d.get(bi,0)+w
SI=np.zeros((nv,4),np.uint8); SW=np.zeros((nv,4),np.float32)
for i,d in enumerate(acc):
    it=sorted(d.items(),key=lambda x:-x[1])[:4]
    if not it: it=[(0,1.0)]
    s=sum(w for _,w in it)
    for k,(b,w) in enumerate(it): SI[i,k]=b; SW[i,k]=w/s
tris=[]
for f in faces:
    f=[remap[i] for i in f]
    for k in range(1,len(f)-1): tris.append([f[0],f[k],f[k+1]])
tris=np.array(tris,np.uint16)
heads={b:(J[bones[b]['head']]*10.0).tolist() for b in KEEP}
blist=[[b, KEEP.index(kept(bones[b]['parent'])) if bones[b]['parent'] else -1, [round(x,3) for x in heads[b]]] for b in KEEP]
print('verts',nv,'tris',len(tris),'ymin',P[:,1].min(),'ymax',P[:,1].max(),'x',P[:,0].min(),P[:,0].max(),'z',P[:,2].min(),P[:,2].max())
for b in ['root','upperarm01.L','lowerarm01.L','wrist.L','upperleg01.L','lowerleg01.L','foot.L','head']: print(b, np.round(heads[b],1))
SW8=np.round(SW*255).astype(np.uint8)
buf=P.astype('<f4').tobytes()+tris.tobytes()+SI.tobytes()+SW8.tobytes()
man={'nv':nv,'nt':len(tris),'bones':blist}
open('figure_data.js','w').write('window.FIGURE_MAN='+json.dumps(man)+';\nwindow.FIGURE_B64="'+base64.b64encode(buf).decode()+'";\n')
