# minimal GLB reader: positions + indices of every primitive (skips textures to save memory)
import json,struct,sys,numpy as np
def read(fn):
    b=open(fn,'rb').read(); assert b[:4]==b'glTF'
    off=12; J=None; BIN=None
    while off<len(b):
        ln,typ=struct.unpack('<II',b[off:off+8]); chunk=b[off+8:off+8+ln]; off+=8+ln
        if typ==0x4E4F534A: J=json.loads(chunk)
        elif typ==0x004E4942: BIN=chunk
    CT={5126:('f',4),5125:('I',4),5123:('H',2),5121:('B',1)}; NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
    def acc(i):
        a=J['accessors'][i]; bv=J['bufferViews'][a['bufferView']]; t,sz=CT[a['componentType']]; n=NC[a['type']]
        start=bv.get('byteOffset',0)+a.get('byteOffset',0); stride=bv.get('byteStride',sz*n)
        arr=np.frombuffer(BIN,dtype=np.dtype(t).newbyteorder('<'),count=a['count']*n,offset=start) if stride==sz*n else None
        if arr is not None: return arr[:a['count']*n].reshape(a['count'],n)
        raw=np.frombuffer(BIN[start:start+stride*a['count']],np.uint8).reshape(a['count'],stride)[:,:sz*n]
        return raw.copy().view(np.dtype(t).newbyteorder('<')).reshape(a['count'],n)
    Vs=[];Fs=[];o=0
    for m in J['meshes']:
        for p in m['primitives']:
            P=acc(p['attributes']['POSITION']).astype(float); I=acc(p['indices']).reshape(-1,3).astype(int)
            Vs.append(P); Fs.append(I+o); o+=len(P)
    nodes=J.get('nodes',[]); return np.vstack(Vs),np.vstack(Fs),J,nodes
if __name__=='__main__':
    V,F,J,nodes=read(sys.argv[1]); print(len(V),len(F)); print([{k:v for k,v in n.items() if k!='mesh'} for n in nodes])
    print('asset',J.get('asset')); np.save(sys.argv[2]+'_V.npy',V); np.save(sys.argv[2]+'_F.npy',F)
    for ax in range(3): print(ax, np.percentile(V[:,ax],[0,50,100]).round(3))
