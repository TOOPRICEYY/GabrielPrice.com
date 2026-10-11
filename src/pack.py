import struct,glob,json,base64,numpy as np,sys
src='/mnt/user-data/uploads/Anti-Thesistis/_web_export/kicker/'
keys={'calf':'Calf_Component','housing':'Assembled_Actuator_v54_1_Body2','ring':'Ring_Gear','endcap':'End_Cap','carriage':'v57_1_Carriage','topcarriage':'Top_Carriage','sun':'Sun_Gear','motor':'Tarot','rack':'Rack_v10_1_Body2','rail':'Extrusion_1_Extrusion','railcap':'v23_2_Cap','shoe':'Shoe_Cup',
 'planet1':'Stage_1_v16_1','planet2':'Stage_1_v16_2','planet3':'Stage_1_v16_3','planet4':'Stage_1_v16_4',
 'spacer1':'Spacer_1_Body1','spacer2':'Spacer_1_Body2','spacer3':'Spacer_1_Body3','spacer4':'Spacer_1_Body4'}
files=glob.glob(src+'*.bin')
buf=bytearray(); man=[]
for k,pat in keys.items():
    m=[f for f in files if pat in f and 'Calf_Scan' not in f]
    assert len(m)==1,(k,m)
    d=open(m[0],'rb').read(); nv,nn,ni=struct.unpack('<3I',d[:12]); assert nv==nn
    p=np.frombuffer(d[12:12+nv*12],'<f4').reshape(-1,3)
    n=np.frombuffer(d[12+nv*12:12+nv*24],'<f4').reshape(-1,3)
    idx=np.frombuffer(d[12+nv*24:12+nv*24+ni*4],'<u4')
    assert nv<65536
    n8=np.clip(np.round(n*127),-127,127).astype('i1')
    n8=np.concatenate([n8,np.zeros((nv,1),'i1')],1)
    ent={'k':k,'nv':int(nv),'ni':int(ni)}
    while len(buf)%4: buf.append(0)
    ent['p']=len(buf); buf+=p.astype('<f4').tobytes()
    ent['n']=len(buf); buf+=n8.tobytes()
    ent['i']=len(buf); buf+=idx.astype('<u2').tobytes()
    ent['c']=[round(float(x),3) for x in (p.min(0)+p.max(0))/2]
    man.append(ent)
open('kicker_data.js','w').write('window.KICKER_MAN='+json.dumps(man)+';\nwindow.KICKER_B64="'+base64.b64encode(bytes(buf)).decode()+'";\n')
print(len(buf), sum(e['ni'] for e in man)//3)
