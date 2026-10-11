# camera fit over 5 views: the 3 turntable shots share dist/ty/el (group A); front0/back0 each have their own camera
import sys,json; from proj import *
YM={'front':440,'side':440,'back':440,'front0':478,'back0':442}
V=list(YM); Rs={v:ref(v,YM[v]) for v in V}
GRP={'front':'A','side':'A','back':'A','front0':'F','back0':'B'}; PH={'A':14,'F':0,'B':0}
def score_v(P,I,x,v):
    gq=GRP[v]; M=mask(P,I,x['fy_'+v],x['cx_'+v],x['dist_'+gq],x['ty_'+gq],x['el_'+gq],PH[gq]); return iou(Rs[v],M,YM[v])
def score(P,I,x,per=False):
    s=[score_v(P,I,x,v) for v in V]; return s if per else sum(s)/len(s)
def fit(P,I,x,steps=(4,2,1,.5),fix=()):
    best=score(P,I,x)
    for step in steps:
        for it in range(3):
            moved=False
            for k in [k for k in x if k not in fix]:
                for dv in (step*(10 if k.startswith('dist') else 1),-step*(10 if k.startswith('dist') else 1)):
                    y=dict(x); y[k]+=dv; s=score(P,I,y)
                    if s>best+1e-5: x,best,moved=y,s,True
            if not moved: break
    return x,best
if __name__=='__main__':
    P,I=load(sys.argv[1]); x=json.load(open('cam2.json')); fix=json.loads(sys.argv[2]) if len(sys.argv)>2 else ['el_A']
    x,b=fit(P,I,x,fix=fix); json.dump(x,open('cam2.json','w')); print(json.dumps(x)); print([round(s,3) for s in score(P,I,x,True)],round(b,4))
