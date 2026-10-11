import json,subprocess,os,re,base64,numpy as np,sys
e=open('/tmp/claude-0/k/thighfit.js').read()
S=[2,2.5,3,3.5,4,6.5,6.75,7,7.25,7.5,8,8.5,9,9.5,10,10.5,11]
env=dict(os.environ,STEPS=json.dumps([[s,e,None] for s in S]),WAIT='500')
o=subprocess.run(['node','/tmp/claude-0/k/ev.mjs'],env=env,capture_output=True,text=True,timeout=600).stdout
src=open('/mnt/project-files/gabrielprice-site-photos/src/figure_data.js').read()
man=json.loads(re.search(r'window.FIGURE_MAN=(\{.*?\});',src,re.S).group(1));nv,nt=man['nv'],man['nt']
buf=base64.b64decode(re.search(r'window.FIGURE_B64="([^"]+)"',src).group(1))
idx=np.frombuffer(buf,'<u2',nt*3,nv*12)
acc={}
for line in o.splitlines():
    if not line[:1].isdigit(): print(line[:200]); continue
    s,j=line.split(' ',1); d=json.loads(j); print(s,'worst',d['worst'],'cnt',d['cnt'],d['prof'])
    for c,x,y,z in d['out']:
        vi=int(idx[c]); v=np.array([x,y,z])
        if vi not in acc or np.linalg.norm(v)>np.linalg.norm(acc[vi]): acc[vi]=v
json.dump({str(k):v.round(3).tolist() for k,v in acc.items()},open('/tmp/claude-0/k/fit_round.json','w'))
print('verts',len(acc),'max',max((np.linalg.norm(v) for v in acc.values()),default=0))
