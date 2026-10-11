# inject refmesh.js and the fitted cameras (cam2.json) into replica_page.html -> reference-replica.html
import json; x=json.load(open('cam2.json'))
def v(name,g,ph): return {'fy':x['fy_'+name],'cx':x['cx_'+name],'d':x['dist_'+g],'ty':round(x['ty_'+g]+14-ph,2),'el':x['el_'+g]}
V=[v('front','A',14),v('side','A',14),v('back','A',14),v('front0','F',0),v('back0','B',0)]
s=open('replica_page.html').read().replace('/*MESH*/',open('refmesh.js').read()).replace('/*MESH2*/','').replace('/*VIEWS*/[]',json.dumps(V))
open('reference-replica.html','w').write(s); print(V)
